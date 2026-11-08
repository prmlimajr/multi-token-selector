/**
 * Vários tokens por ator.
 * As imagens ficam salvas numa flag do ator (compartilhada por todos os tokens dele).
 * No HUD do token (botão direito) aparece um botão que abre uma paleta para trocar,
 * adicionar e remover imagens. A troca usa a transição "morph" nativa do Foundry.
 */
const MODULE_ID = "multi-token-selector";
const FLAG = "tokens";

/** Ids dos tokens com a paleta aberta (para reabrir quando o HUD é redesenhado). */
const paletasAbertas = new Set();

const t = (chave, dados) =>
  dados ? game.i18n.format(`MTS.${chave}`, dados) : game.i18n.localize(`MTS.${chave}`);

/* -------------------------------------------- */
/*  Dados                                       */
/* -------------------------------------------- */

/** Ator "de verdade" (o do diretório), mesmo para tokens não vinculados. */
function atorBase(token) {
  const doc = token.document ?? token;
  return doc.baseActor ?? doc.actor ?? null;
}

export function listarImagens(ator) {
  return foundry.utils.deepClone(ator?.getFlag(MODULE_ID, FLAG) ?? []);
}

function nomeDoArquivo(src) {
  const arquivo = decodeURIComponent(src.split("/").pop().split("?")[0]);
  return arquivo.replace(/\.[^.]+$/, "");
}

export async function adicionarImagem(ator, src, nome) {
  const lista = listarImagens(ator);
  if (!src || lista.some((i) => i.src === src)) return lista;
  lista.push({ src, nome: nome || nomeDoArquivo(src) });
  await ator.setFlag(MODULE_ID, FLAG, lista);
  return lista;
}

export async function removerImagem(ator, src) {
  const lista = listarImagens(ator).filter((i) => i.src !== src);
  await ator.setFlag(MODULE_ID, FLAG, lista);
  return lista;
}

/* -------------------------------------------- */
/*  Troca com efeito morph                      */
/* -------------------------------------------- */

function transicaoMorph() {
  const TTF = foundry.canvas?.rendering?.filters?.TextureTransitionFilter ?? globalThis.TextureTransitionFilter;
  return TTF?.TYPES?.MORPH ?? "morph";
}

/**
 * Imagem original do token: a que ele tinha antes da primeira troca.
 * Fica gravada numa flag do próprio token; enquanto não houve troca, é a imagem atual.
 */
export function imagemOriginal(token) {
  const doc = token.document ?? token;
  return doc.getFlag(MODULE_ID, "original") ?? doc.texture.src;
}

/**
 * Troca a imagem do token na cena com a transição morph.
 * As opções de animação vão junto com o update, então todos os clientes veem o efeito.
 */
export async function trocarImagem(token, src) {
  const doc = token.document ?? token;
  if (!doc.isOwner) return ui.notifications.warn(t("SemPermissao"));
  if (doc.texture.src === src) return;
  return doc.update(
    { "texture.src": src, [`flags.${MODULE_ID}.original`]: imagemOriginal(doc) },
    { animation: { transition: transicaoMorph(), duration: game.settings.get(MODULE_ID, "duracaoMorph") } }
  );
}

/* -------------------------------------------- */
/*  Interface (paleta no HUD)                   */
/* -------------------------------------------- */

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto) e.textContent = texto;
  return e;
}

function midia(src) {
  const video = /\.(webm|mp4|m4v|ogv)$/i.test(src.split("?")[0]);
  const m = el(video ? "video" : "img");
  m.src = src;
  if (video) Object.assign(m, { muted: true, autoplay: true, loop: true, playsInline: true });
  return m;
}

function botaoAcao(icone, rotulo, aoClicar) {
  const b = el("button", "mts-acao");
  b.type = "button";
  b.innerHTML = `<i class="fa-solid ${icone}"></i> `;
  b.append(rotulo);
  b.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    aoClicar();
  });
  return b;
}

function abrirSeletorDeArquivo(ator, atual, depois) {
  const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  new FP({
    type: "imagevideo",
    current: atual,
    callback: async (caminho) => {
      await adicionarImagem(ator, caminho);
      depois();
    }
  }).render(true);
}

function desenharPaleta(paleta, token) {
  const ator = atorBase(token);
  const atual = token.document.texture.src;
  const original = imagemOriginal(token);
  // O original é sempre o primeiro e não pode ser removido.
  const lista = [
    { src: original, nome: t("Original"), original: true },
    ...listarImagens(ator).filter((i) => i.src !== original)
  ];
  const redesenhar = () => desenharPaleta(paleta, token);

  paleta.replaceChildren();
  paleta.append(el("h4", "mts-titulo", t("Titulo", { nome: ator.name })));

  const grade = el("div", "mts-grade");

  for (const item of lista) {
    const cel = el("div", "mts-item" + (item.src === atual ? " ativo" : ""));
    cel.dataset.tooltip = item.nome;
    cel.append(midia(item.src));
    cel.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      await trocarImagem(token, item.src);
      redesenhar();
    });

    if (item.original) {
      const selo = el("span", "mts-selo");
      selo.innerHTML = `<i class="fa-solid fa-star"></i>`;
      cel.append(selo);
      grade.append(cel);
      continue;
    }

    const remover = el("a", "mts-remover");
    remover.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
    remover.dataset.tooltip = t("Remover");
    remover.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      await removerImagem(ator, item.src);
      redesenhar();
    });
    cel.append(remover);
    grade.append(cel);
  }
  paleta.append(grade);

  const acoes = el("div", "mts-acoes");
  const addAtual = botaoAcao("fa-plus", t("AdicionarAtual"), async () => {
    await adicionarImagem(ator, atual);
    redesenhar();
  });
  addAtual.disabled = lista.some((i) => i.src === atual);
  acoes.append(addAtual);

  if (game.user.can("FILES_BROWSE")) {
    acoes.append(botaoAcao("fa-folder-open", t("AdicionarArquivo"), () => abrirSeletorDeArquivo(ator, atual, redesenhar)));
  }
  paleta.append(acoes);
}

Hooks.on("renderTokenHUD", (hud, html) => {
  const raiz = html instanceof HTMLElement ? html : html[0]; // v13: HTMLElement | v12: jQuery
  const token = hud.object;
  const ator = token && atorBase(token);
  if (!ator?.isOwner) return;

  const coluna = raiz.querySelector(".col.left");
  if (!coluna) return;
  if (getComputedStyle(coluna).position === "static") coluna.style.position = "relative";

  const botao = el(game.release.generation >= 13 ? "button" : "div", "control-icon mts-botao");
  if (botao.tagName === "BUTTON") botao.type = "button";
  botao.dataset.tooltip = t("Botao");
  botao.innerHTML = `<i class="fa-solid fa-masks-theater"></i>`;

  const paleta = el("div", "mts-paleta");
  coluna.append(botao, paleta);

  const definirAberta = (aberta) => {
    paleta.classList.toggle("aberta", aberta);
    botao.classList.toggle("active", aberta);
    if (aberta) {
      paletasAbertas.add(token.id);
      desenharPaleta(paleta, token);
    } else paletasAbertas.delete(token.id);
  };

  botao.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    definirAberta(!paleta.classList.contains("aberta"));
  });

  if (paletasAbertas.has(token.id)) definirAberta(true);
});

/* -------------------------------------------- */
/*  Registro                                    */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "duracaoMorph", {
    name: "MTS.Config.duracaoMorph.Nome",
    hint: "MTS.Config.duracaoMorph.Dica",
    scope: "world",
    config: true,
    type: Number,
    default: 1000,
    range: { min: 200, max: 3000, step: 100 }
  });
});

Hooks.once("setup", () => {
  const modulo = game.modules.get(MODULE_ID);
  modulo.api = Object.assign(modulo.api ?? {}, { imagemOriginal, listarImagens, adicionarImagem, removerImagem, trocarImagem });
});
