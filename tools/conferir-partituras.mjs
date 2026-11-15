// Confere as cifras do acervo (PDF de texto e escaneadas) contra a partitura da mesma música:
// onde a cifra e a partitura têm a mesma palavra com o mesmo acorde, vale a sílaba da partitura
// (lá o acorde está sobre a nota; na cifra digitada às vezes fica uma sílaba antes ou depois).
// Só aplica quando a partitura é claramente o mesmo arranjo (muitos acordes coincidem).
// Uso: node tools/conferir-partituras.mjs [--sem-salvar] [-v]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { partituraParaCifra, definirVocabulario } from '../app/js/partitura.js';
import { conferirComPartitura } from '../app/js/conferir.js';

const RAIZ = new URL('../', import.meta.url).pathname;
const pdfjs = await import(RAIZ + 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const ARQ = RAIZ + 'app/data/musicas.json';
const SALVAR = !process.argv.includes('--sem-salvar'), VERBOSO = process.argv.includes('-v');
const dados = JSON.parse(readFileSync(ARQ, 'utf8'));
const vocab = new Set();
for (const m of dados.musicas) if (m.chordpro && !m.ocr && !m.daPartitura)
  for (const w of m.chordpro.replace(/\[[^\]]*\]/g, '').split(/[\s\-–,.;:!?()"'“”]+/)) { const n = w.toLowerCase().normalize('NFC').replace(/[^a-zà-ÿ]/g, ''); if (n.length >= 2) vocab.add(n); }
definirVocabulario([...vocab]);

const contar = cp => (cp.match(/\[/g) || []).length;
let conferidas = 0, corrigidas = 0, acordesMovidos = 0, outroArranjo = 0;
for (const m of dados.musicas) {
  delete m.conferida;
  if (!m.chordpro || m.daPartitura || m.id >= 100000) continue;
  const par = `${RAIZ}tools/cache/pdf/${m.id}-par.pdf`;
  if (!existsSync(par)) continue;
  const p = await partituraParaCifra(pdfjs, new Uint8Array(readFileSync(par)), { forcar: 'pauta' });
  if (contar(p.chordpro) < 5) continue;
  const r = conferirComPartitura(m.chordpro, p.chordpro);
  // mesmo arranjo: pelo menos 40% dos acordes da cifra foram encontrados na partitura, na mesma palavra
  if (r.comparados < 5 || r.comparados < contar(m.chordpro) * 0.4) { outroArranjo++; continue; }
  conferidas++;
  m.conferida = { comparados: r.comparados, movidos: r.movidos, semitons: r.semitons };
  // a partitura conferiu a maioria dos acordes: as dúvidas de posição do OCR estão resolvidas
  if (m.ocr?.locais && r.comparados >= contar(m.chordpro) * 0.6) {
    m.ocr.locais = m.ocr.locais.filter(l => !l.d.startsWith('posição'));
    m.ocr.duvidas = (m.ocr.duvidas || []).filter(d => !d.startsWith('posição'));
    m.ocr.revisar = m.ocr.locais.length > 0;
  }
  if (r.movidos) {
    if (VERBOSO) {
      const a = m.chordpro.split('\n'), b = r.chordpro.split('\n');
      console.log(`== ${m.id} ${m.nome}: ${r.movidos} de ${r.comparados}`);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) console.log('   ' + a[i] + '\n → ' + b[i]);
    }
    m.chordpro = r.chordpro; corrigidas++; acordesMovidos += r.movidos;
  }
}
if (SALVAR) writeFileSync(ARQ, JSON.stringify(dados));
console.log(`${conferidas} cifras conferidas com a partitura (${corrigidas} tinham acordes deslocados: ${acordesMovidos} acordes corrigidos) · ${outroArranjo} partituras de outro arranjo (não usadas)`);
