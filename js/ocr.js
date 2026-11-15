// OCR no próprio app (sem internet): foto ou PDF escaneado de cifra -> ChordPro, com os acordes nas sílabas certas.
// Usa o Tesseract (vendor/tesseract) e a mesma lógica da conversão do acervo (ocr-cifra.js).
import { CHARS_ACORDE, linhasDoResultado, relerDuvidosos, paraChordPro, resumirDuvidas } from './ocr-cifra.js';
import { carregarPdfjs } from './visualizar-pdf.js';

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;
const LARGURA = 2480; // ~300 dpi numa folha A4: tamanho de letra que o Tesseract lê melhor

let carregando = null;
function carregarTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  carregando ||= new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = BASE + 'tesseract.min.js';
    s.onload = () => ok(window.Tesseract);
    s.onerror = () => { carregando = null; falha(new Error('não foi possível carregar o leitor de texto')); };
    document.head.append(s);
  });
  return carregando;
}

let leitores = null;
let aoProgresso = null;
async function prepararLeitores() {
  if (leitores) return leitores;
  const T = await carregarTesseract();
  const op = { workerPath: BASE + 'worker.min.js', corePath: BASE + 'core/', langPath: BASE + 'lang', gzip: false, cacheMethod: 'none',
    logger: m => { if (m.status === 'recognizing text') aoProgresso?.(m.progress); } };
  const geral = await T.createWorker('por', 1, op);
  await geral.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  const acordes = await T.createWorker('eng', 1, { ...op, logger: () => {} });
  await acordes.setParameters({ tessedit_pageseg_mode: '8', tessedit_char_whitelist: CHARS_ACORDE + ' ', preserve_interword_spaces: '1' });
  leitores = { geral, acordes };
  return leitores;
}

// leitores da partitura em imagem: letra em texto esparso (só as sílabas) e acordes em bloco
let leitoresPart = null;
async function leitoresPartitura() {
  if (!leitoresPart) {
    const T = await carregarTesseract();
    const op = { workerPath: BASE + 'worker.min.js', corePath: BASE + 'core/', langPath: BASE + 'lang', gzip: false, cacheMethod: 'none' };
    const letra = await T.createWorker('por', 1, op);
    await letra.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
    const acordes = await T.createWorker('eng', 1, op);
    await acordes.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    leitoresPart = { letra, acordes };
  }
  return async (cv, tipo) => {
    const { data } = await leitoresPart[tipo === 'acordes' ? 'acordes' : 'letra'].recognize(cv, {}, { blocks: true, text: false });
    const out = [];
    for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words)
      if (w.text.trim()) out.push({ texto: w.text, conf: w.confidence, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1, xs: w.symbols.map(s => s.bbox.x0), xe: w.symbols.map(s => s.bbox.x1) });
    return out;
  };
}

export async function encerrarOCR() {
  if (!leitores) return;
  const l = leitores; leitores = null;
  await Promise.all([l.geral.terminate(), l.acordes.terminate()]).catch(() => {});
}

// Foto -> canvas no tamanho ideal, em tons de cinza, com limiar adaptativo (corrige sombra e luz desigual da foto)
async function fotoParaCanvas(arquivo) {
  const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  const k = LARGURA / bmp.width;
  const cv = document.createElement('canvas');
  cv.width = LARGURA; cv.height = Math.round(bmp.height * k);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close?.();
  limiarAdaptativo(ctx, cv.width, cv.height);
  return cv;
}

function limiarAdaptativo(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h), p = img.data;
  const cinza = new Float32Array(w * h);
  for (let i = 0, j = 0; j < cinza.length; i += 4, j++) cinza[j] = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
  // imagem integral para a média local de cada pixel
  const soma = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let linha = 0;
    for (let x = 0; x < w; x++) { linha += cinza[y * w + x]; soma[(y + 1) * (w + 1) + x + 1] = soma[y * (w + 1) + x + 1] + linha; }
  }
  const r = Math.round(w / 32);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const media = (soma[y1 * (w + 1) + x1] - soma[y0 * (w + 1) + x1] - soma[y1 * (w + 1) + x0] + soma[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      const v = cinza[y * w + x] < media * 0.86 ? 0 : 255;
      const i = (y * w + x) * 4;
      p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Páginas de um PDF (escaneado) -> canvas
async function pdfParaCanvas(dados) {
  const lib = await carregarPdfjs();
  const doc = await lib.getDocument({ data: dados, isEvalSupported: false }).promise;
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n);
    const vp = pg.getViewport({ scale: LARGURA / pg.getViewport({ scale: 1 }).width });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push(cv);
  }
  await doc.destroy();
  return out;
}

export const ehImagem = arq => arq.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|bmp|gif)$/i.test(arq.name);

// Arquivos (fotos = páginas em ordem, ou um PDF) -> { chordpro, cabecalho, titulo, duvidas, legibilidade, imagens }
export async function lerCifra(arquivos, progresso = () => {}) {
  progresso('Preparando o leitor (a primeira vez demora um pouco)...');
  const paginas = [];
  for (const arq of arquivos) {
    if (ehImagem(arq)) paginas.push(await fotoParaCanvas(arq));
    else paginas.push(...await pdfParaCanvas(new Uint8Array(await arq.arrayBuffer())));
  }
  // partitura (tem pentagramas): acorde na sílaba da nota, pela leitura da partitura em imagem
  const { acharPautas, lerPartituraImagem } = await import('./partitura-imagem.js');
  const comPauta = paginas.filter(cv => acharPautas(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height)).length >= 2).length;
  if (comPauta >= Math.ceil(paginas.length / 2)) {
    progresso('É uma partitura: lendo acordes e sílabas de cada pauta...');
    const ler = await leitoresPartitura();
    let feitas = 0;
    const r = await lerPartituraImagem(paginas, async (cv, tipo) => { progresso(`Lendo a partitura... (${++feitas} trechos)`); return ler(cv, tipo); },
      (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
    const imagens = paginas.map(cv => cv.toDataURL('image/jpeg', 0.8));
    const avisos = ['cifra lida da imagem da partitura: confira letra e acordes com a partitura ao lado'];
    if (r.confianca < 70) avisos.unshift(`a imagem está pouco legível (confiança ${r.confianca}%): é provável haver erros`);
    return { ...r, duvidas: avisos, duvidasResumo: avisos, locais: [], legibilidade: r.confianca / 100, imagens, partitura: true };
  }
  const { geral, acordes } = await prepararLeitores();
  const ocr = { paginas: [] };
  try {
    for (let i = 0; i < paginas.length; i++) {
      const cv = paginas[i], rot = paginas.length > 1 ? `Página ${i + 1} de ${paginas.length}: ` : '';
      aoProgresso = p => progresso(`${rot}lendo o texto... ${Math.round(p * 100)}%`);
      const { data } = await geral.recognize(cv, {}, { blocks: true, text: false });
      aoProgresso = null;
      const linhas = linhasDoResultado(data);
      await relerDuvidosos(linhas, async ret => {
        const { data: d2 } = await acordes.recognize(cv, { rectangle: ret }, { blocks: true, text: false });
        return linhasDoResultado(d2).flatMap(x => x.palavras);
      }, (k, n) => progresso(`${rot}conferindo acordes duvidosos (${k + 1} de ${n})...`));
      ocr.paginas.push({ linhas });
    }
  } finally { aoProgresso = null; }
  // posições na escala de uma folha A4 em pontos (como os PDFs de texto)
  const r = paraChordPro(ocr, LARGURA / 595, { foto: arquivos.some(ehImagem) });
  const imagens = paginas.map(cv => cv.toDataURL('image/jpeg', 0.8));
  return { ...r, duvidasResumo: resumirDuvidas(r.duvidas), imagens };
}
