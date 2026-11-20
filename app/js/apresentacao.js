// Apresentação das músicas da missa (telão / data show): só a letra, sem acordes; um slide por estrofe e por
// refrão (estrofe longa é dividida), com o refrão repetido depois de cada estrofe se quiser. Três saídas:
// apresentar em tela cheia no próprio app, PowerPoint (.pptx, PptxGenJS em vendor/) e PDF em formato de slide.
import { musica } from './dados.js';
import { linhasCifra } from './cifra.js';
import { esc, aviso, modal } from './ui.js';
import { carregarJsPDF } from './exportar.js';

// ---------- Slides ----------
const limparLinha = t => t.replace(/^\s*(R(efr[aã]o)?\s*[.:]+\s*|\d+\s*(ª|a)?\s*[.)\-–]\s*)/i, '').replace(/\s+/g, ' ').trim();
function paragrafos(chordpro) {
  const out = []; let at = null;
  for (const l of linhasCifra(chordpro, { mostrarAcordes: false })) {
    if (l.tipo === 'vazia') { at = null; continue; }
    if (l.tipo !== 'letra') continue;
    const texto = limparLinha(l.texto);
    if (!texto || !/[a-zà-ú]/i.test(texto)) continue;
    if (!at) { at = { linhas: [], refrao: 0 }; out.push(at); }
    at.linhas.push(texto);
    if (l.refrao) at.refrao++;
  }
  return out.map(p => ({ linhas: p.linhas, refrao: p.refrao * 2 >= p.linhas.length }));
}
// divide em pedaços parecidos de no máximo `max` linhas
function dividir(linhas, max) {
  const n = Math.ceil(linhas.length / max), tam = Math.ceil(linhas.length / n), out = [];
  for (let i = 0; i < linhas.length; i += tam) out.push(linhas.slice(i, i + tam));
  return out;
}
export function slidesDaMissa(x, { titulos = true, repetirRefrao = true, maxLinhas = 6, soPrimeira = true } = {}) {
  const slides = [];
  const data = x.data ? new Date(x.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
  if (titulos) slides.push({ tipo: 'capa', titulo: x.titulo, sub: data });
  for (const it of x.itens) {
    const m = it.chave && musica(it.chave);
    if (!m?.chordpro) continue;
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
  }
  return slides;
}

// ---------- Opções ----------
export function apresentacaoMissa(x) {
  const n = x.itens.filter(it => it.chave && musica(it.chave)?.chordpro).length;
  if (!n) { aviso('Escolha pelo menos um canto antes de montar a apresentação'); return; }
  const { el, fechar } = modal(`
    <h2 style="margin-top:0">Apresentação de “${esc(x.titulo)}”</h2>
    <p class="pequeno suave">Só a letra, para o telão: ${n} ${n === 1 ? 'canto' : 'cantos'}, um slide por estrofe e por refrão.</p>
    <label style="display:block;margin:6px 0"><input type="checkbox" id="ti" checked> Slide com o nome de cada canto (e capa da missa)</label>
    <label style="display:block;margin:6px 0"><input type="checkbox" id="rr" checked> Repetir o refrão depois de cada estrofe</label>
    <label style="display:block;margin:6px 0"><input type="checkbox" id="sp" checked> Só a 1ª opção de cada parte (pula “Glória (2)”, “Santo (2)”…)</label>
    <label style="display:block;margin:6px 0">Linhas por slide: <select id="ml"><option>4</option><option>5</option><option selected>6</option><option>8</option></select></label>
    <label style="display:block;margin:6px 0">Cores: <select id="tema"><option value="escuro" selected>letra branca, fundo preto</option><option value="claro">letra preta, fundo branco</option><option value="azul">letra branca, fundo azul</option></select></label>
    <div class="barra" style="flex-wrap:wrap">
      <button class="btn primario" id="agora">▶ Apresentar agora</button>
      <button class="btn" id="pptx">⬇ PowerPoint (.pptx)</button>
      <button class="btn" id="pdf">⬇ PDF (slides)</button>
      <button class="btn" data-fechar>Fechar</button>
    </div>
    <p id="msg" class="pequeno suave">No telão: toque/clique ou use as setas para passar; Esc para sair; B deixa a tela preta.</p>`);
  const opcoes = () => ({ titulos: el.querySelector('#ti').checked, repetirRefrao: el.querySelector('#rr').checked, maxLinhas: +el.querySelector('#ml').value, soPrimeira: el.querySelector('#sp').checked });
  const tema = () => TEMAS[el.querySelector('#tema').value];
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
const tamanho = (linhas, larg, alt) => Math.max(18, Math.min(alt * 0.78 / (linhas.length * 1.32), larg * 0.92 / (Math.max(...linhas.map(l => l.length)) * 0.52), alt / 6));
export function apresentar(slides, tema = TEMAS.escuro) {
  let i = 0, preto = false;
  const tela = document.createElement('div');
  tela.className = 'apresentacao';
  tela.style.cssText = `position:fixed;inset:0;z-index:9999;background:#${tema.fundo};color:#${tema.texto};display:flex;align-items:center;justify-content:center;text-align:center;cursor:none;user-select:none;font-family:system-ui,Arial,sans-serif;padding:3vh 4vw;box-sizing:border-box`;
  tela.tabIndex = 0;
  document.body.append(tela);
  const desenhar = () => {
    const s = slides[i];
    const W = tela.clientWidth * 0.92, H = tela.clientHeight * 0.86;
    if (preto) { tela.innerHTML = ''; return; }
    let html = '';
    if (s.tipo === 'capa') html = `<div><div style="font-size:${Math.min(W / 14, 72)}px;font-weight:700">${esc(s.titulo)}</div><div style="font-size:${Math.min(W / 30, 34)}px;color:#${tema.suave};margin-top:.6em">${esc(s.sub)}</div></div>`;
    else if (s.tipo === 'titulo') html = `<div><div style="font-size:${Math.min(W / 28, 36)}px;color:#${tema.suave};text-transform:uppercase;letter-spacing:.08em">${esc(s.parte)}</div><div style="font-size:${Math.min(W / 16, 64)}px;font-weight:700;margin-top:.3em">${esc(s.titulo)}</div></div>`;
    else {
      const fs = tamanho(s.linhas, W, H);
      html = `<div style="font-size:${fs}px;line-height:1.3;${s.refrao ? `color:#${tema.refrao};font-weight:700` : ''}">${s.linhas.map(esc).join('<br>')}</div>
        <div style="position:absolute;bottom:1.5vh;left:0;right:0;font-size:max(12px,1.6vh);color:#${tema.suave}">${esc(s.parte)} · ${esc(s.titulo)}</div>`;
    }
    tela.innerHTML = html + `<div style="position:absolute;bottom:1.5vh;right:2vw;font-size:max(11px,1.4vh);color:#${tema.suave}">${i + 1}/${slides.length}</div>`;
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
const pontos = linhas => Math.max(20, Math.min(54, 4.6 * 72 * 0.8 / (linhas.length * 1.25), 9.2 * 72 / (Math.max(...linhas.map(l => l.length)) * 0.5)));
export async function gerarPptx(slides, tema, nome, { baixar = true } = {}) {
  const Pptx = await carregarPptx();
  const p = new Pptx();
  p.layout = 'LAYOUT_16x9';                                          // 10 x 5,625 polegadas
  p.title = slides[0]?.titulo || 'Missa';
  for (const s of slides) {
    const sl = p.addSlide();
    sl.background = { color: tema.fundo };
    if (s.tipo === 'capa') {
      sl.addText(s.titulo, { x: 0.4, y: 1.6, w: 9.2, h: 1.4, align: 'center', valign: 'middle', fontSize: 44, bold: true, color: tema.texto, fontFace: 'Arial', fit: 'shrink' });
      if (s.sub) sl.addText(s.sub, { x: 0.4, y: 3.1, w: 9.2, h: 0.6, align: 'center', fontSize: 22, color: tema.suave, fontFace: 'Arial' });
    } else if (s.tipo === 'titulo') {
      sl.addText(s.parte.toUpperCase(), { x: 0.4, y: 1.5, w: 9.2, h: 0.6, align: 'center', fontSize: 22, color: tema.suave, fontFace: 'Arial', charSpacing: 2 });
      sl.addText(s.titulo, { x: 0.4, y: 2.1, w: 9.2, h: 1.5, align: 'center', valign: 'middle', fontSize: 40, bold: true, color: tema.texto, fontFace: 'Arial', fit: 'shrink' });
    } else {
      sl.addText(s.linhas.join('\n'), { x: 0.4, y: 0.35, w: 9.2, h: 4.6, align: 'center', valign: 'middle', fontSize: Math.round(pontos(s.linhas)),
        bold: s.refrao, color: s.refrao ? tema.refrao : tema.texto, fontFace: 'Arial', fit: 'shrink', lineSpacingMultiple: 1.1 });
      sl.addText(`${s.parte} · ${s.titulo}`, { x: 0.4, y: 5.1, w: 9.2, h: 0.35, align: 'center', fontSize: 11, color: tema.suave, fontFace: 'Arial' });
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
  slides.forEach((s, k) => {
    if (k) doc.addPage([A, L], 'landscape');
    doc.setFillColor(...cor(tema.fundo)); doc.rect(0, 0, L, A, 'F');
    const centro = (texto, y, tam, estilo = 'normal', c = tema.texto) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...cor(c)); doc.text(texto, L / 2, y, { align: 'center', baseline: 'middle' }); };
    if (s.tipo === 'capa') { centro(s.titulo, A / 2 - 8, 40, 'bold'); if (s.sub) centro(s.sub, A / 2 + 12, 20, 'normal', tema.suave); return; }
    if (s.tipo === 'titulo') { centro(s.parte.toUpperCase(), A / 2 - 14, 20, 'normal', tema.suave); centro(s.titulo, A / 2 + 4, 36, 'bold'); return; }
    // maior tamanho que cabe: altura (linhas) e largura (linha mais larga)
    let tam = Math.min(54, (A * 0.78) / (s.linhas.length * 1.3) / 0.3528);
    doc.setFont('helvetica', s.refrao ? 'bold' : 'normal');
    while (tam > 16) { doc.setFontSize(tam); if (Math.max(...s.linhas.map(l => doc.getTextWidth(l))) <= L * 0.92) break; tam -= 1; }
    const passo = tam * 0.3528 * 1.3, y0 = A / 2 - (passo * (s.linhas.length - 1)) / 2 - 4;
    s.linhas.forEach((l, j) => centro(l, y0 + j * passo, tam, s.refrao ? 'bold' : 'normal', s.refrao ? tema.refrao : tema.texto));
    centro(`${s.parte} · ${s.titulo}`, A - 6, 10, 'normal', tema.suave);
  });
  if (!baixar) return doc.output('blob');
  doc.save(nome);
}
