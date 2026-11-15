// Leitura de partitura em imagem no Node (Tesseract + @napi-rs/canvas), com cache em tools/cache/ocr-par/<id>.json
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { lerPartituraImagem } from '../app/js/partitura-imagem.js';

const RAIZ = new URL('../', import.meta.url).pathname;
const require = createRequire(RAIZ + 'package.json');
const { createCanvas } = require('@napi-rs/canvas');
const T = require('tesseract.js');
const pdfjs = await import(RAIZ + 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const CACHE = RAIZ + 'tools/cache/ocr-par/';
mkdirSync(CACHE, { recursive: true });

let leitores = null;
async function obter() {
  if (leitores) return leitores;
  const letra = await T.createWorker('por', 1, { cachePath: RAIZ + 'tools/cache/tessdata' });
  await letra.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
  const acordes = await T.createWorker('eng', 1, { cachePath: RAIZ + 'tools/cache/tessdata' });
  await acordes.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  return (leitores = { letra, acordes });
}
export async function encerrar() { if (leitores) { await leitores.letra.terminate(); await leitores.acordes.terminate(); leitores = null; } }

// OCR com cache por faixa (a mesma faixa não é lida duas vezes ao reprocessar)
export async function partituraImagemParaCifra(id, arquivo) {
  const arqCache = `${CACHE}${id}.json`;
  const cache = existsSync(arqCache) ? JSON.parse(readFileSync(arqCache, 'utf8')) : {};
  let novo = false;
  const { letra, acordes } = await obter();
  const ler = async (cv, tipo) => {
    const buf = cv.toBuffer('image/png');
    const chave = tipo + ':' + cv.width + 'x' + cv.height + ':' + require('node:crypto').createHash('md5').update(buf).digest('hex');
    if (!cache[chave]) {
      const { data } = await (tipo === 'acordes' ? acordes : letra).recognize(buf, {}, { blocks: true, text: false });
      const out = [];
      for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words)
        if (w.text.trim()) out.push({ texto: w.text, conf: w.confidence, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1, xs: w.symbols.map(s => s.bbox.x0), xe: w.symbols.map(s => s.bbox.x1) });
      cache[chave] = out; novo = true;
    }
    return cache[chave];
  };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(arquivo)), verbosity: 0 }).promise;
  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pg = await doc.getPage(n), vp = pg.getViewport({ scale: 300 / 72 });
    const cv = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height)), c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: c, viewport: vp, canvas: cv }).promise;
    paginas.push(cv);
  }
  await doc.destroy();
  const r = await lerPartituraImagem(paginas, ler, (w, h) => createCanvas(w, h));
  if (novo) writeFileSync(arqCache, JSON.stringify(cache));
  return r;
}

// ---------- Audiveris (leitura óptica de partitura) ----------
// Instalado em ~/.local/audiveris (pacote oficial extraído, com Java embutido) e idiomas completos em
// ~/.local/audiveris/tessdata (o Audiveris usa o motor legado do Tesseract). Cache do MusicXML em tools/cache/omr/.
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { musicxmlParaChordPro } from '../app/js/musicxml.js';
export const AUDIVERIS = homedir() + '/.local/audiveris/opt/audiveris/bin/Audiveris';
const CACHE_OMR = RAIZ + 'tools/cache/omr/';
export function temAudiveris() { return existsSync(AUDIVERIS); }
export function audiverisMusicXml(arquivo, pasta = CACHE_OMR, nome = null) {
  mkdirSync(pasta, { recursive: true });
  const base = pasta + (nome || arquivo.split('/').pop().replace(/\.[^.]+$/, ''));
  if (!existsSync(base + '.mxl')) {
    try {
      execFileSync(AUDIVERIS, ['-batch', '-export', '-output', pasta, '-constant', 'org.audiveris.omr.text.Language.defaultSpecification=por', '--', arquivo],
        { env: { ...process.env, TESSDATA_PREFIX: homedir() + '/.local/audiveris/tessdata' }, stdio: 'ignore', timeout: 600000 });
    } catch { /* sem resultado */ }
  }
  if (!existsSync(base + '.mxl')) return null;
  const { unzipSync, strFromU8 } = require('fflate');
  const z = unzipSync(new Uint8Array(readFileSync(base + '.mxl')));
  const nomeXml = Object.keys(z).find(n => n.endsWith('.xml') && !n.includes('META'));
  return nomeXml ? strFromU8(z[nomeXml]) : null;
}
export function audiverisParaCifra(arquivo) {
  if (!temAudiveris()) return null;
  const xml = audiverisMusicXml(arquivo);
  return xml ? musicxmlParaChordPro(xml) : null;
}
