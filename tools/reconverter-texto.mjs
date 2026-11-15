// Reconverte as cifras em texto (PDFs já baixados em tools/cache/pdf) com o conversor atual,
// sem baixar nada de novo. Uso: node tools/reconverter-texto.mjs [--sem-salvar]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pdfParaCifra } from '../app/js/pdf.js';
import { detectarTom } from '../app/js/cifra.js';

const RAIZ = new URL('../', import.meta.url).pathname;
const pdfjs = await import(RAIZ + 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const ARQ = RAIZ + 'app/data/musicas.json';
const dados = JSON.parse(readFileSync(ARQ, 'utf8'));
let mudou = 0, linhas = 0;
for (const m of dados.musicas) {
  if (m.ocr || !m.chordpro) continue;
  const arq = `${RAIZ}tools/cache/pdf/${m.id}-cif.pdf`;
  if (!existsSync(arq)) continue;
  const r = await pdfParaCifra(pdfjs, new Uint8Array(readFileSync(arq)));
  if (!r.chordpro.trim() || r.chordpro === m.chordpro) continue;
  const antes = new Set(m.chordpro.split('\n'));
  linhas += r.chordpro.split('\n').filter(l => !antes.has(l)).length;
  m.chordpro = r.chordpro; m.cabecalho = r.cabecalho; m.temCifra = r.chordpro.includes('['); m.tom = detectarTom(r.chordpro);
  mudou++;
}
if (!process.argv.includes('--sem-salvar')) writeFileSync(ARQ, JSON.stringify(dados));
console.log(`${mudou} cifras em texto melhoradas (${linhas} linhas mudaram)`);
