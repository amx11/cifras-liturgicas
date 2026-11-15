// Partituras (PDF vetorial) -> cifra, para o acervo:
//  1) músicas sem cifra que têm partitura baixada (tools/cache/pdf/<id>-par.pdf)
//  2) "cifras em texto" cujo PDF é na verdade partitura (pentagrama + bloco de cifra): refaz pelo conversor de partitura
// Também copia todas as partituras para app/data/partitura/<id>.pdf (para ver a partitura dentro do app).
// Uso: node tools/partituras-cifra.mjs [--sem-salvar] [-v]
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { detectarTom, normalizar } from '../app/js/cifra.js';
import { partituraParaCifra, definirVocabulario } from '../app/js/partitura.js';

const RAIZ = new URL('../', import.meta.url).pathname;
const pdfjs = await import(RAIZ + 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const ARQ = RAIZ + 'app/data/musicas.json';
const SALVAR = !process.argv.includes('--sem-salvar'), VERBOSO = process.argv.includes('-v');
const dados = JSON.parse(readFileSync(ARQ, 'utf8'));
mkdirSync(RAIZ + 'app/data/partitura', { recursive: true });

// vocabulário (com acentos) das cifras em texto, para juntar sílabas encostadas sem hífen
const vocab = new Set();
for (const m of dados.musicas) if (m.chordpro && !m.ocr && !m.daPartitura)
  for (const w of m.chordpro.replace(/\[[^\]]*\]/g, '').split(/[\s\-–,.;:!?()"'“”]+/)) { const n = w.toLowerCase().normalize('NFC').replace(/[^a-zà-ÿ]/g, ''); if (n.length >= 2) vocab.add(n); }
definirVocabulario([...vocab]);

// a partitura mistura pentagrama com o texto? (fontes de símbolos musicais)
async function temPauta(arq) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(arq)), verbosity: 0, fontExtraProperties: true }).promise;
  let n = 0;
  for (let p = 1; p <= doc.numPages && n < 20; p++) {
    const pg = await doc.getPage(p); await pg.getOperatorList();
    for (const it of (await pg.getTextContent()).items) {
      let f; try { f = pg.commonObjs.get(it.fontName); } catch { /* */ }
      if (/MScore|Leland|Bravura|Emmentaler|Petrucci|Maestro|Opus|Sonata|Finale/i.test(f?.name || '') || /[-]/.test(it.str)) n++;
    }
  }
  await doc.destroy();
  return n >= 20;
}

const contar = cp => (cp.match(/\[/g) || []).length;
let novas = 0, refeitas = 0, semAcordes = 0, copiadas = 0;
for (const m of dados.musicas) {
  if (m.id >= 100000) continue;
  const par = `${RAIZ}tools/cache/pdf/${m.id}-par.pdf`;
  if (existsSync(par)) { copyFileSync(par, `${RAIZ}app/data/partitura/${m.id}.pdf`); m.partituraLocal = `data/partitura/${m.id}.pdf`; copiadas++; }

  // 1) sem cifra: gera da partitura
  if (!m.chordpro || (m.daPartitura && !m.daPartitura.doPdfDeCifra)) {
    if (!existsSync(par)) continue;
    const r = await partituraParaCifra(pdfjs, new Uint8Array(readFileSync(par)));
    if (contar(r.chordpro) < 3) {                // partitura sem acordes escritos: continua sem cifra
      semAcordes++;
      if (m.daPartitura) { m.chordpro = ''; m.temCifra = false; m.tom = ''; delete m.daPartitura; }
      continue;
    }
    m.chordpro = r.chordpro; m.tom = detectarTom(r.chordpro); m.temCifra = true;
    if (r.cabecalho?.length) m.cabecalho = r.cabecalho;
    m.daPartitura = { formato: r.formato, duvidas: r.duvidas.slice(0, 15), revisar: r.duvidas.length > 0 };
    m.originalPdf = m.partituraLocal;
    if (m.ocr?.falhou) delete m.ocr;             // escaneada ilegível: agora tem cifra pela partitura
    novas++;
    if (VERBOSO) console.log('nova', m.id, m.nome, r.formato, contar(r.chordpro));
    continue;
  }
  // 2) cifra em texto que é partitura misturada
  const cif = `${RAIZ}tools/cache/pdf/${m.id}-cif.pdf`;
  if (!m.ocr && (!m.daPartitura || m.daPartitura.doPdfDeCifra) && existsSync(cif) && await temPauta(cif)) {
    const r = await partituraParaCifra(pdfjs, new Uint8Array(readFileSync(cif)));
    if (contar(r.chordpro) >= Math.max(3, contar(m.chordpro) * 0.5)) {
      m.chordpro = r.chordpro; m.tom = detectarTom(r.chordpro); m.temCifra = true;
      if (r.cabecalho?.length) m.cabecalho = r.cabecalho;
      m.daPartitura = { formato: r.formato, doPdfDeCifra: true, duvidas: r.duvidas.slice(0, 15), revisar: r.duvidas.length > 0 };
      copyFileSync(cif, `${RAIZ}app/data/partitura/${m.id}-cifra.pdf`);
      m.originalPdf = `data/partitura/${m.id}-cifra.pdf`;
      refeitas++;
      if (VERBOSO) console.log('refeita', m.id, m.nome, r.formato, contar(r.chordpro));
    }
  }
}
// tom de referência mudou em relação à versão publicada antes? guarda o anterior (o app converte tons salvos)
const ANTES = existsSync(RAIZ + 'tools/cache/musicas-antes-partituras.json') ? JSON.parse(readFileSync(RAIZ + 'tools/cache/musicas-antes-partituras.json', 'utf8')) : null;
if (ANTES) {
  const tomAntes = new Map(ANTES.musicas.map(m => [m.id, m.tom]));
  for (const m of dados.musicas) { delete m.tomAntes; const t = tomAntes.get(m.id); if (t && m.tom && t !== m.tom) m.tomAntes = t; }
}
if (SALVAR) writeFileSync(ARQ, JSON.stringify(dados));
console.log(`${novas} cifras novas geradas de partitura · ${refeitas} cifras refeitas (PDF misturado com partitura) · ${semAcordes} partituras sem acordes · ${copiadas} partituras copiadas para o app`);
