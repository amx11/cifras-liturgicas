// Converte as cifras escaneadas (app/data/pdf/<id>.pdf) em texto ChordPro com OCR (tesseract.js),
// mantendo cada acorde na sílaba certa pela posição de cada letra na página.
// Uso: node tools/ocr-escaneadas.mjs [ids...]   (sem ids: todas as escaneadas)
//      --refazer   ignora o cache de OCR      --sem-salvar   só mostra o resultado
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { ehAcorde, ehLinhaDeAcordes, detectarTom } from '../app/js/cifra.js';
import { CHARS_ACORDE, corrigirAcorde, parecido, linhasDoResultado, relerDuvidosos, paraChordPro, resumirDuvidas } from '../app/js/ocr-cifra.js';
export { corrigirAcorde, aproximarAcorde, paraChordPro } from '../app/js/ocr-cifra.js';

const RAIZ = new URL('../', import.meta.url).pathname;
const require = createRequire(RAIZ + 'package.json');
const pdfjs = await import(RAIZ + 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const { createCanvas } = require('@napi-rs/canvas');
const Tesseract = require('tesseract.js');

const ARQ = RAIZ + 'app/data/musicas.json';
const CACHE = RAIZ + (process.env.OCR_CACHE || 'tools/cache/ocr/');
mkdirSync(CACHE, { recursive: true });
const DPI = 300, ESCALA = DPI / 72;
const args = process.argv.slice(2);
const REFAZER = args.includes('--refazer'), SALVAR = !args.includes('--sem-salvar'), RELER = args.includes('--reler');
const idsPedidos = args.filter(a => /^\d+$/.test(a)).map(Number);
const LOTE = (args.find(a => a.startsWith('--lote=')) || '').slice(7).split('/').map(Number); // ex.: --lote=0/6

// ---------- OCR ----------
async function renderizar(pagina) {
  const vp = pagina.getViewport({ scale: ESCALA });
  const cv = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await pagina.render({ canvasContext: ctx, viewport: vp, canvas: cv }).promise;
  return cv.toBuffer('image/png');
}

async function ocrDocumento(id, geral, acordes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(`${RAIZ}app/data/pdf/${id}.pdf`)), verbosity: 0 }).promise;
  const paginas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const png = await renderizar(await doc.getPage(p));
    const { data } = await geral.recognize(png, {}, { blocks: true, text: false });
    const linhas = linhasDoResultado(data);
    // Relê as linhas de acordes sozinhas, só com caracteres de acorde
    for (const l of RELER ? linhas : []) {
      const toks = l.palavras.map(w => corrigirAcorde(w.texto));
      const nAc = toks.filter(t => ehAcorde(t)).length, nPar = toks.filter(parecido).length;
      const ehAcordes = ehLinhaDeAcordes(toks.join(' ')) || (nPar / toks.length >= 0.6 && toks.every(t => t.length <= 9));
      if (!ehAcordes) continue;
      const margem = Math.round((l.y1 - l.y0) * 0.35);
      const ret = { left: Math.max(0, l.x0 - 20), top: Math.max(0, l.y0 - margem), width: l.x1 - l.x0 + 40, height: l.y1 - l.y0 + 2 * margem };
      const { data: d2 } = await acordes.recognize(png, { rectangle: ret }, { blocks: true, text: false });
      const l2 = linhasDoResultado(d2).flatMap(x => x.palavras);
      if (l2.length) { l.palavras = l2; l.relida = true; }
      l.acordes = true;
      l.nAcordesAntes = nAc;
    }
    await relerDuvidosos(linhas, async ret => {
      const { data: d2 } = await acordes.recognize(png, { rectangle: ret }, { blocks: true, text: false });
      return linhasDoResultado(d2).flatMap(x => x.palavras);
    });
    paginas.push({ largura: 0, linhas });
  }
  await doc.destroy();
  return { paginas };
}

// ---------- Principal ----------
async function main() {
  const dados = JSON.parse(readFileSync(ARQ, 'utf8'));
  let alvo = dados.musicas.filter(m => m.pdfImagem && !m.daPartitura && (!idsPedidos.length || idsPedidos.includes(m.id)));
  if (LOTE.length === 2) {
    alvo = alvo.filter((m, k) => k % LOTE[1] === LOTE[0] && (REFAZER || !existsSync(`${CACHE}${m.id}.json`)));
    console.log(`lote ${LOTE.join('/')}: ${alvo.length} para ler`);
  }
  console.log(`${alvo.length} cifras escaneadas para converter`);
  const geral = await Tesseract.createWorker('por', 1, { cachePath: RAIZ + 'tools/cache/tessdata' });
  await geral.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  const acordes = await Tesseract.createWorker('eng', 1, { cachePath: RAIZ + 'tools/cache/tessdata' });
  await acordes.setParameters({ tessedit_pageseg_mode: '8', tessedit_char_whitelist: CHARS_ACORDE + ' ', preserve_interword_spaces: '1' });

  let feitos = 0, revisar = 0;
  for (const m of alvo) {
    const arqCache = `${CACHE}${m.id}.json`;
    let ocr;
    if (!REFAZER && existsSync(arqCache)) ocr = JSON.parse(readFileSync(arqCache, 'utf8'));
    else { ocr = await ocrDocumento(m.id, geral, acordes); writeFileSync(arqCache, JSON.stringify(ocr)); }
    if (LOTE.length === 2) { if (++feitos % 5 === 0) console.log(`  lote ${LOTE[0]}: ${feitos}/${alvo.length}`); continue; }
    const r = paraChordPro(ocr, ESCALA);
    if (!SALVAR) { console.log(`\n===== ${m.id} ${m.nome} (confiança ${r.confianca}, dúvidas: ${r.duvidas.join(' ') || 'nenhuma'})\n${r.cabecalho.join(' | ')}\n${r.chordpro}`); continue; }
    if (r.legibilidade < 0.6) {
      // leitura ilegível (em geral partitura com pentagrama): continua como imagem, marcada para digitar
      delete m.chordpro; m.temCifra = false; m.tom = '';
      m.ocr = { falhou: true, legibilidade: Math.round(r.legibilidade * 100), revisar: true, duvidas: [] };
      revisar++;
    } else if (r.chordpro.trim()) {
      m.chordpro = r.chordpro;
      if (r.cabecalho.length) m.cabecalho = r.cabecalho;
      m.temCifra = r.chordpro.includes('[');
      m.tom = detectarTom(r.chordpro);
      m.ocr = { confianca: r.confianca, legibilidade: Math.round(r.legibilidade * 100), duvidas: resumirDuvidas(r.duvidas), locais: r.locais.slice(0, 80), revisar: r.duvidas.length > 0 || r.legibilidade < 0.85 };
      if (m.ocr.revisar) revisar++;
    }
    if (++feitos % 10 === 0) console.log(`  ${feitos}/${alvo.length} (${revisar} para revisar)`);
  }
  await geral.terminate(); await acordes.terminate();
  if (SALVAR && LOTE.length !== 2) {
    writeFileSync(ARQ, JSON.stringify(dados));
    const ocrs = dados.musicas.filter(m => m.ocr);
    console.log(`Pronto: ${ocrs.filter(m => !m.ocr.falhou).length} convertidas em texto (${ocrs.filter(m => !m.ocr.falhou && m.ocr.revisar).length} com algo a conferir, ${ocrs.filter(m => !m.ocr.falhou && !m.ocr.revisar).length} sem dúvidas); ${ocrs.filter(m => m.ocr.falhou).length} ilegíveis ficam como imagem para digitar.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
