// Reconverte as cifras em texto (PDFs já baixados em tools/cache/pdf) com o conversor atual,
// sem baixar nada de novo. Uso: node tools/reconverter-texto.mjs [--sem-salvar]
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { pdfParaCifra } from '../app/js/pdf.js';
import { detectarTom } from '../app/js/cifra.js';

const RAIZ = new URL('../', import.meta.url).pathname;
const pdfjs = await import(RAIZ + 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const ARQ = RAIZ + 'app/data/musicas.json';
const dados = JSON.parse(readFileSync(ARQ, 'utf8'));
let mudou = 0, linhas = 0, imagens = 0;
for (const m of dados.musicas) {
  if (m.ocr || !m.chordpro || m.id >= 100000 || (m.daPartitura && !m.daPartitura.doPdfDeCifra)) continue;
  const arq = `${RAIZ}tools/cache/pdf/${m.id}-cif.pdf`;
  if (!existsSync(arq)) continue;
  const r = await pdfParaCifra(pdfjs, new Uint8Array(readFileSync(arq)));
  delete m.daPartitura; delete m.originalPdf;        // volta ao texto; partituras-cifra.mjs refaz se for partitura
  // PDF que é imagem com um ou outro texto solto ("R."): não é cifra em texto -> vai para o OCR das escaneadas
  if ((r.chordpro.replace(/\[[^\]]*\]/g, '').match(/[a-zà-ÿ]/gi) || []).length < 15) {
    copyFileSync(arq, `${RAIZ}app/data/pdf/${m.id}.pdf`);
    m.pdfImagem = `data/pdf/${m.id}.pdf`; delete m.chordpro; m.temCifra = false; m.tom = '';
    imagens++; continue;
  }
  if (!r.chordpro.trim() || r.chordpro === m.chordpro) continue;
  const antes = new Set(m.chordpro.split('\n'));
  linhas += r.chordpro.split('\n').filter(l => !antes.has(l)).length;
  m.chordpro = r.chordpro; m.cabecalho = r.cabecalho; m.temCifra = r.chordpro.includes('['); m.tom = detectarTom(r.chordpro);
  mudou++;
}
if (!process.argv.includes('--sem-salvar')) writeFileSync(ARQ, JSON.stringify(dados));
console.log(`${mudou} cifras em texto melhoradas (${linhas} linhas mudaram) · ${imagens} PDFs eram imagem (vão para o OCR)`);
