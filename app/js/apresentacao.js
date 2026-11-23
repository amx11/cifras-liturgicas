// Apresentação das músicas da missa (telão / data show): só a letra, sem acordes; um slide por estrofe e por
// refrão (estrofe longa é dividida), com o refrão repetido depois de cada estrofe se quiser. Três saídas:
// apresentar em tela cheia no próprio app, PowerPoint (.pptx, PptxGenJS em vendor/) e PDF em formato de slide.
import { musica } from './dados.js';
import { linhasCifra } from './cifra.js';
import { esc, aviso, modal } from './ui.js';
import { carregarJsPDF } from './exportar.js';
import { CAPAS, capaPorId, capaAutomatica, capaDaMissa, temaDaCapa, svgCapa, urlSvg, pngCapa, textosDaCapa } from './capas.js';
import { salvarMissas, estado } from './dados.js';

// ---------- Slides ----------
// Só a letra que se canta: sem número da estrofe, "R.", rótulo de quem canta (S:, T:, Todos:, Solo:), notas para o
// músico ("*versão simplificada", "Repete-se a antífona", "= 60"), tablatura; sílabas soltas ("a - mor") juntadas
const ROTULO = /^\s*(R(efr[aã]o)?|S|T|P|L|C|Ass|Todos(,[^:]{0,20})?|Solo|Solista|Coro|Assembl[eé]ia|Pres(idente)?|Povo|Mulheres|Homens|Leitor|Cantor|Animador|Sac(erdote)?|Ref)\s*[.:]+\s*|^\s*(Solo|Todos|Coro|Solista)\s*[-–]\s*/i;
const NAO_CANTA = /^\s*(\*|=\s*\d|\(?\s*(repete|retorna|bis\b|instrumental|intro|introdu|solo\b|final\b|fim\b|ponte|coda|vers[aã]o simplificada|obs\b|nota\b))|vers[aã]o simplificada|acorde adicionado|\(?\s*†|flexa|@[\w.]+\s*$|[A-Ga-g]?\s*\|[-\d|~bhp\/\\ ]{8,}/i;
// título de seção dentro da cifra ("Entrada opcional - Tempo do Natal", "TE DEUM - Frei Luiz Carlos Susin")
const TITULO_SECAO = /\s[-–]\s.*\b(opcional|melodia|canto de|frei|pe\.|padre|tempo d[oe]|abertura|entrada|comunh[aã]o|ofert[oó]rio|aclama[cç][aã]o|vers[aã]o|natal\w*|envio|adora[cç][aã]o|oferendas|apres\.|quaresma|advento|\d+º?\s*d\s*t\s*[cpa])\b/i;
function limparLinha(t) {
  let s = t.replace(/\s+/g, ' ').trim();
  if (NAO_CANTA.test(s) || TITULO_SECAO.test(s)) return '';
  const toks = s.split(/\s+/);
  if (toks.length >= 2 && toks.filter(w => /^\*?\(?[A-G][#b°ºmMajsudi\d\/()+#A-G]*\*?$/.test(w)).length / toks.length >= 0.5) return '';
  for (let k = 0; k < 3 && ROTULO.test(s); k++) s = s.replace(ROTULO, '');
  // marcas de canto de salmo (">2b.", "b)", "-> 3c") e acorde entre parênteses no meio da palavra ("poder(eb6(#11))")
  s = s.replace(/->\s*\d+[a-c]?/g, ' ').replace(/^>?\s*\d+[a-c]\.?\s+/, '').replace(/^>\s*/, '').replace(/(^|\s)[a-c]\s?\)\s*/g, ' ')
    .replace(/\(\s*[A-Ga-g][#b]?\d*[^\s()]*(\([^)]*\))?[^\s()]*\)/g, '');
  // parênteses só com acordes ("(A#o B B/A)", "((1ª vez D/E))", "(|B|)"): fora; com letra ("(Ele te ama!)") fica
  s = s.replace(/\(+([^()]*(?:\([^()]*\)[^()]*)*)\)+/g, (all, dentro) => ((dentro.match(/\p{L}{3,}/gu) || []).every(w => /^vez$/i.test(w)) && /[A-G]|\d/.test(dentro) ? '' : all));
  s = s.replace(/\s*=\s*/g, ' ').replace(/\*/g, '').replace(/\s+R\.?\s*$/, '').trim();   // "*" = pausa do salmista; "R." no fim = volta ao refrão
  s = s.replace(/^\s*\d+\s*(ª|a)?\s*[.)\-–]\s*/, '').replace(/^\(\d\)\s*/, '');
  s = s.replace(/\s*[*†‡+]+\s*$/g, '').replace(/\(\s*bis\s*\)/gi, '(2x)');
  // sílaba solta: "a - mor", "gló--- ria" (só hífen comum, pedaço curto; travessão entre palavras fica)
  s = s.replace(/(\p{L})(?:\s+-+\s*|-{2,}\s*)(\p{L})/gu, (all, a, b, off, str) => {
    const esq = str.slice(0, off + 1).match(/\p{L}+$/u)?.[0] || '', dir = str.slice(off + all.length - 1).match(/^\p{L}+/u)?.[0] || '';
    return esq.length <= 3 || dir.length <= 3 ? a + b : all;
  });
  return s.trim();
}
// linha comprida demais para o telão: quebra na pontuação mais perto do meio (senão no espaço)
function quebrar(l, max = 38) {
  if (l.length <= max) return [l];
  const meio = l.length / 2;
  const cortes = [...l.matchAll(/[,;:!?]\s/g)].map(m => m.index + 1);
  const espacos = [...l.matchAll(/\s/g)].map(m => m.index);
  if (!espacos.length) return [l];
  const melhor = (cortes.length ? cortes : espacos).reduce((a, b) => (Math.abs(b - meio) < Math.abs(a - meio) ? b : a));
  if (melhor < 8 || melhor >= l.length - 8) return [l];
  return [...quebrar(l.slice(0, melhor).trim(), max), ...quebrar(l.slice(melhor).trim(), max)];
}
function paragrafos(chordpro) {
  const out = []; let at = null;
  for (const l of linhasCifra(chordpro, { mostrarAcordes: false })) {
    if (l.tipo === 'vazia') { at = null; continue; }
    if (l.tipo !== 'letra') continue;
    // "S: ... T: ..." na mesma linha: cada voz na sua linha
    for (const pedaco of l.texto.split(/\s(?=(?:S|T|P|Ass|Todos)\s*[.:]+\s)/)) {
      const texto = limparLinha(pedaco);
      if (!texto || !/[a-zà-ú]{2}/i.test(texto)) continue;
      if (!at) { at = { linhas: [], refrao: 0 }; out.push(at); }
      for (const q0 of quebrar(texto)) {
        const q = limparLinha(q0);                       // o pedaço de baixo também pode começar com "Solo -", "="
        if (!q || !/[a-zà-ú]{2}/i.test(q)) continue;
        at.linhas.push(q); if (l.refrao) at.refrao++;
      }
    }
  }
  return out.map(p => ({ linhas: p.linhas, refrao: p.refrao * 2 >= p.linhas.length }));
}
// divide em pedaços parecidos de no máximo `max` linhas
function dividir(linhas, max) {
  const n = Math.ceil(linhas.length / max), tam = Math.ceil(linhas.length / n), out = [];
  for (let i = 0; i < linhas.length; i += tam) out.push(linhas.slice(i, i + tam));
  return out;
}
export function slidesDaMissa(x, { titulos = false, repetirRefrao = true, maxLinhas = 6, soPrimeira = true, escuro = true, capa = null } = {}) {
  const slides = [];
  const data = x.data ? new Date(x.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
  if (capa) slides.push({ tipo: 'capa', capa, ...textosDaCapa(x, capa, estado.prefs.paroquia) });   // capa desenhada (do tempo ou escolhida)
  for (const it of x.itens) {
    const m = it.chave && musica(it.chave);
    if (!m?.chordpro || it.modo === 'rezada') continue;   // parte rezada: sem canto
    if (soPrimeira && /\(\d+\)\s*$/.test(it.rotulo || '')) continue;      // "Glória (2)": opção extra do repertório
    const pars = paragrafos(m.chordpro);
    if (!pars.length) continue;
    const parte = it.rotulo || '';
    if (titulos) slides.push({ tipo: 'titulo', parte, titulo: m.nome });
    const refrao = pars.find(p => p.refrao);
    const ordem = [];
    pars.forEach((p, i) => {
      ordem.push(p);
      // refrão depois de cada estrofe (se a próxima já não for o refrão)
      if (repetirRefrao && refrao && !p.refrao && !pars[i + 1]?.refrao && pars.indexOf(refrao) < i) ordem.push(refrao);
    });
    for (const p of ordem) for (const linhas of dividir(p.linhas, maxLinhas)) slides.push({ tipo: 'letra', linhas, refrao: p.refrao, parte, titulo: m.nome });
    if (escuro) slides.push({ tipo: 'vazio' });          // tela preta depois de cada canto (inclusive a Entrada)
  }
  return slides;
}

// ---------- Opções ----------
export function apresentacaoMissa(x) {
  const n = x.itens.filter(it => it.chave && musica(it.chave)?.chordpro && it.modo !== 'rezada').length;
  if (!n) { aviso('Escolha pelo menos um canto antes de montar a apresentação'); return; }
  const { el, fechar } = modal(`
    <h2 style="margin-top:0">Apresentação de “${esc(x.titulo)}”</h2>
    <p class="pequeno suave">Só a letra, para o telão: ${n} ${n === 1 ? 'canto' : 'cantos'}, um slide por estrofe e por refrão.</p>
    <label style="display:block;margin:6px 0"><input type="checkbox" id="ti"> Slide com o nome de cada canto (e capa da missa)</label>
    <label style="display:block;margin:6px 0"><input type="checkbox" id="rr" checked> Repetir o refrão depois de cada estrofe</label>
    <label style="display:block;margin:6px 0"><input type="checkbox" id="es" checked> Slide escuro (tela preta) depois de cada canto</label>
    <label style="display:block;margin:6px 0"><input type="checkbox" id="sp" checked> Só a 1ª opção de cada parte (pula “Glória (2)”, “Santo (2)”…)</label>
    <label style="display:block;margin:6px 0">Linhas por slide: <select id="ml"><option>4</option><option>5</option><option selected>6</option><option>8</option></select></label>
    <label style="display:block;margin:6px 0">Capa: <select id="capa"></select></label>
    <img id="prev-capa" alt="Prévia da capa" style="width:100%;max-width:360px;border-radius:6px;display:block;margin:4px 0 8px">
    <label style="display:block;margin:6px 0">Cores: <select id="tema"><option value="tempo" selected>projetor na parede: fundo preto, refrão na cor do tempo (recomendado)</option><option value="escuro">fundo preto, refrão dourado</option><option value="claro">fundo branco, letra preta (só para TV ou tela)</option><option value="azul">fundo azul, letra branca</option></select></label>
    <div class="barra" style="flex-wrap:wrap">
      <button class="btn primario" id="agora">▶ Apresentar agora</button>
      <button class="btn" id="pptx">⬇ PowerPoint (.pptx)</button>
      <button class="btn" id="pdf">⬇ PDF (slides)</button>
      <button class="btn" data-fechar>Fechar</button>
    </div>
    <p id="msg" class="pequeno suave">No telão: toque/clique ou use as setas para passar; Esc para sair; B deixa a tela preta.</p>`);
  // capa: automática pelo tempo/festa, uma escolhida, ou nenhuma — a escolha fica guardada na missa
  const selCapa = el.querySelector('#capa'), prev = el.querySelector('#prev-capa');
  const auto = capaAutomatica(x);
  selCapa.innerHTML = `<option value="auto">Automática: ${esc(auto.nome)}</option>${CAPAS.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}<option value="nenhuma">Sem capa</option>`;
  selCapa.value = x.capa || 'auto';
  const capaEscolhida = () => (selCapa.value === 'nenhuma' ? null : selCapa.value === 'auto' ? auto : capaPorId(selCapa.value));
  const mostrarPrevia = () => { const c = capaEscolhida(); prev.hidden = !c; if (c) prev.src = urlSvg(svgCapa(c, { ...textosDaCapa(x, c, estado.prefs.paroquia), largura: 1600, altura: 900, projetor: true })); };
  selCapa.onchange = () => { x.capa = selCapa.value; salvarMissas(); mostrarPrevia(); };
  mostrarPrevia();
  const opcoes = () => ({ capa: capaEscolhida(), titulos: el.querySelector('#ti').checked, repetirRefrao: el.querySelector('#rr').checked, maxLinhas: +el.querySelector('#ml').value, soPrimeira: el.querySelector('#sp').checked, escuro: el.querySelector('#es').checked });
  const tema = () => (el.querySelector('#tema').value === 'tempo' ? temaDaCapa(capaEscolhida() || auto) : TEMAS[el.querySelector('#tema').value]);
  const msg = el.querySelector('#msg');
  const nomeArq = ext => `${(x.titulo || 'missa').replace(/[\\/:*?"<>|]+/g, '-')}${x.data ? ' ' + x.data : ''} - apresentacao.${ext}`;
  el.querySelector('#agora').onclick = () => { const s = slidesDaMissa(x, opcoes()); fechar(); apresentar(s, tema()); };
  el.querySelector('#pptx').onclick = async e => {
    e.target.disabled = true; msg.textContent = 'Gerando o PowerPoint...';
    try { await gerarPptx(slidesDaMissa(x, opcoes()), tema(), nomeArq('pptx')); msg.textContent = '✓ PowerPoint baixado.'; }
    catch (err) { msg.textContent = 'Não foi possível gerar o PowerPoint: ' + err.message; }
    e.target.disabled = false;
  };
  el.querySelector('#pdf').onclick = async e => {
    e.target.disabled = true; msg.textContent = 'Gerando o PDF...';
    try { await gerarPdfSlides(slidesDaMissa(x, opcoes()), tema(), nomeArq('pdf')); msg.textContent = '✓ PDF baixado.'; }
    catch (err) { msg.textContent = 'Não foi possível gerar o PDF: ' + err.message; }
    e.target.disabled = false;
  };
}
export const TEMAS = {
  escuro: { fundo: '000000', texto: 'FFFFFF', refrao: 'FFE082', suave: 'A0A0A0' },
  claro: { fundo: 'FFFFFF', texto: '111111', refrao: '8A1020', suave: '666666' },
  azul: { fundo: '0D2A4A', texto: 'FFFFFF', refrao: 'FFE082', suave: 'A9BCD0' },
};

// ---------- Tela cheia no app ----------
// tamanho da letra: o maior que cabe (pelo nº de linhas e pela linha mais comprida)
const tamanho = (linhas, larg, alt) => Math.max(18, Math.min(alt / (linhas.length * 1.38), larg / (Math.max(...linhas.map(l => l.length)) * 0.56), alt / 5.5));
export function apresentar(slides, tema = TEMAS.escuro) {
  let i = 0, preto = false;
  const tela = document.createElement('div');
  tela.className = 'apresentacao';
  tela.style.cssText = `position:fixed;inset:0;z-index:9999;background:#${tema.fundo};color:#${tema.texto};display:flex;align-items:center;justify-content:center;text-align:center;cursor:none;user-select:none;font-family:system-ui,Arial,sans-serif;padding:3vh 4vw;box-sizing:border-box`;
  tela.tabIndex = 0;
  document.body.append(tela);
  const desenhar = () => {
    const s = slides[i];
    const W = tela.clientWidth * 0.8, H = tela.clientHeight * 0.8;     // margem de 10%: projeção na parede costuma ficar torta
    tela.style.background = '#' + (s.tipo === 'vazio' || preto ? '000000' : tema.fundo);
    if (preto || s.tipo === 'vazio') { tela.innerHTML = ''; return; }
    let html = '';
    if (s.tipo === 'capa') { tela.style.background = '#000'; tela.innerHTML = svgCapa(s.capa, { titulo: s.titulo, linha2: s.linha2, linha3: s.linha3, linha4: s.linha4, largura: 1600, altura: 900, projetor: true }).replace('<svg ', '<svg style="width:100%;height:100%" preserveAspectRatio="xMidYMid meet" '); return; }
    else if (s.tipo === 'titulo') html = `<div><div style="font-size:${Math.min(W / 28, 36)}px;color:#${tema.suave};text-transform:uppercase;letter-spacing:.08em">${esc(s.parte)}</div><div style="font-size:${Math.min(W / 16, 64)}px;font-weight:700;margin-top:.3em">${esc(s.titulo)}</div></div>`;
    else {
      const fs = tamanho(s.linhas, W, H);
      html = `<div style="font-size:${fs}px;line-height:1.35;font-weight:${tema.negrito ? 700 : 600};${s.refrao ? `color:#${tema.refrao}` : ''}">${s.linhas.map(esc).join('<br>')}</div>`;
    }
    tela.innerHTML = html;
  };
  const ir = d => { const n = Math.min(slides.length - 1, Math.max(0, i + d)); if (n !== i) { i = n; preto = false; desenhar(); } };
  const sair = () => { document.removeEventListener('keydown', tecla); window.removeEventListener('resize', desenhar); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); tela.remove(); };
  const tecla = e => {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); ir(1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); ir(-1); }
    else if (e.key === 'Home') { i = 0; desenhar(); } else if (e.key === 'End') { i = slides.length - 1; desenhar(); }
    else if (e.key === 'b' || e.key === 'B' || e.key === '.') { preto = !preto; desenhar(); }
    else if (e.key === 'Escape') sair();
  };
  let x0 = null;
  tela.addEventListener('pointerdown', e => { x0 = e.clientX; });
  tela.addEventListener('pointerup', e => {
    const dx = e.clientX - (x0 ?? e.clientX);
    if (Math.abs(dx) > 50) ir(dx < 0 ? 1 : -1);                    // deslizar
    else ir(e.clientX > tela.clientWidth / 3 ? 1 : -1);             // toque: terço da esquerda volta, o resto avança
  });
  document.addEventListener('keydown', tecla);
  window.addEventListener('resize', desenhar);
  tela.requestFullscreen?.().catch(() => {});
  tela.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) setTimeout(desenhar, 50); });
  tela.focus();
  desenhar();
}

// ---------- PowerPoint ----------
let pptxCarregando = null;
function carregarPptx() {
  if (window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
  pptxCarregando ||= new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/pptxgen.bundle.js', import.meta.url).href;
    s.onload = () => (window.PptxGenJS ? ok(window.PptxGenJS) : falha(new Error('gerador de PowerPoint inválido')));
    s.onerror = () => { pptxCarregando = null; falha(new Error('não foi possível carregar o gerador de PowerPoint')); };
    document.head.append(s);
  });
  return pptxCarregando;
}
// tamanho em pontos para um quadro de 9,2 x 4,6 polegadas
const pontos = linhas => Math.max(20, Math.min(54, 4.5 * 72 * 0.82 / (linhas.length * 1.3), 8 * 72 / (Math.max(...linhas.map(l => l.length)) * 0.56)));
export async function gerarPptx(slides, tema, nome, { baixar = true } = {}) {
  const Pptx = await carregarPptx();
  const p = new Pptx();
  p.layout = 'LAYOUT_16x9';                                          // 10 x 5,625 polegadas
  p.title = slides[0]?.titulo || 'Missa';
  for (const s of slides) {
    const sl = p.addSlide();
    sl.background = { color: s.tipo === 'vazio' ? '000000' : tema.fundo };
    if (s.tipo === 'vazio') continue;
    if (s.tipo === 'capa') {
      sl.addImage({ data: await pngCapa(s.capa, { titulo: s.titulo, linha2: s.linha2, linha3: s.linha3, linha4: s.linha4, largura: 1920, altura: 1080, projetor: true }), x: 0, y: 0, w: 10, h: 5.625 });
    } else if (s.tipo === 'titulo') {
      sl.addText(s.parte.toUpperCase(), { x: 0.4, y: 1.5, w: 9.2, h: 0.6, align: 'center', fontSize: 22, color: tema.suave, fontFace: 'Arial', charSpacing: 2 });
      sl.addText(s.titulo, { x: 0.4, y: 2.1, w: 9.2, h: 1.5, align: 'center', valign: 'middle', fontSize: 40, bold: true, color: tema.texto, fontFace: 'Arial', fit: 'shrink' });
    } else {
      sl.addText(s.linhas.join('\n'), { x: 1, y: 0.56, w: 8, h: 4.5, align: 'center', valign: 'middle', fontSize: Math.round(pontos(s.linhas)),
        bold: true, color: s.refrao ? tema.refrao : tema.texto, fontFace: 'Arial', fit: 'shrink', lineSpacingMultiple: 1.15 });
    }
  }
  if (!baixar) return p.write({ outputType: 'blob' });
  await p.writeFile({ fileName: nome });
}

// ---------- PDF em formato de slide ----------
export async function gerarPdfSlides(slides, tema, nome, { baixar = true } = {}) {
  const JsPDF = await carregarJsPDF();
  const L = 254, A = 142.875;                                       // 16:9 em mm (igual ao PowerPoint)
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: [A, L] });
  const cor = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  const capas = new Map();
  for (const s of slides) if (s.tipo === 'capa') capas.set(s, await pngCapa(s.capa, { titulo: s.titulo, linha2: s.linha2, linha3: s.linha3, linha4: s.linha4, largura: 1920, altura: 1080, projetor: true }));
  slides.forEach((s, k) => {
    if (k) doc.addPage([A, L], 'landscape');
    if (s.tipo === 'capa') { doc.addImage(capas.get(s), 'JPEG', 0, 0, L, A); return; }
    doc.setFillColor(...cor(s.tipo === 'vazio' ? '000000' : tema.fundo)); doc.rect(0, 0, L, A, 'F');
    if (s.tipo === 'vazio') return;
    const centro = (texto, y, tam, estilo = 'normal', c = tema.texto) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...cor(c)); doc.text(texto, L / 2, y, { align: 'center', baseline: 'middle' }); };
    if (s.tipo === 'titulo') { centro(s.parte.toUpperCase(), A / 2 - 14, 20, 'normal', tema.suave); centro(s.titulo, A / 2 + 4, 36, 'bold'); return; }
    // maior tamanho que cabe em 80% da largura e da altura (margem para a projeção torta), sempre em negrito
    let tam = Math.min(54, (A * 0.8) / (s.linhas.length * 1.35) / 0.3528);
    doc.setFont('helvetica', 'bold');
    while (tam > 16) { doc.setFontSize(tam); if (Math.max(...s.linhas.map(l => doc.getTextWidth(l))) <= L * 0.8) break; tam -= 1; }
    const passo = tam * 0.3528 * 1.35, y0 = A / 2 - (passo * (s.linhas.length - 1)) / 2;
    s.linhas.forEach((l, j) => centro(l, y0 + j * passo, tam, 'bold', s.refrao ? tema.refrao : tema.texto));
  });
  if (!baixar) return doc.output('blob');
  doc.save(nome);
}
