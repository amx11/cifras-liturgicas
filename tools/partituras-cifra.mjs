// Partituras (PDF vetorial) -> cifra, para o acervo:
//  1) músicas sem cifra que têm partitura baixada (tools/cache/pdf/<id>-par.pdf)
//  2) "cifras em texto" cujo PDF é na verdade partitura (pentagrama + bloco de cifra): refaz pelo conversor de partitura
// Também copia todas as partituras para app/data/partitura/<id>.pdf (para ver a partitura dentro do app).
// Uso: node tools/partituras-cifra.mjs [--sem-salvar] [-v]
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { detectarTom, normalizar } from '../app/js/cifra.js';
import { partituraParaCifra, definirVocabulario } from '../app/js/partitura.js';
import { partituraImagemParaCifra, encerrar as encerrarOcr } from './partitura-imagem-node.mjs';

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
async function semTexto(arq) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(arq)), verbosity: 0 }).promise;
  let n = 0;
  for (let p = 1; p <= doc.numPages; p++) n += (await (await doc.getPage(p)).getTextContent()).items.filter(i => i.str.trim()).length;
  await doc.destroy();
  return n < 10;
}
const porPartitura = new Map();
for (const m of dados.musicas) if (m.partitura && m.id < 100000) porPartitura.set(m.partitura, [...(porPartitura.get(m.partitura) || []), m.id]);
// qualidade da letra: quantas palavras e quantas são conhecidas (do vocabulário das cifras do acervo)
function qualidade(cp) {
  const ws = cp.replace(/\[[^\]]*\]/g, ' ').split(/[\s\-–,.;:!?()"'“”_]+/).map(w => w.toLowerCase().normalize('NFC').replace(/[^a-zà-ÿ]/g, '')).filter(w => w.length >= 2);
  return { palavras: ws.length, conhecidas: ws.length ? ws.filter(w => vocab.has(w)).length / ws.length : 0 };
}
let novas = 0, refeitas = 0, semAcordes = 0, copiadas = 0, outraMusica = 0;
for (const m of dados.musicas) {
  if (m.id >= 100000) continue;
  const par = `${RAIZ}tools/cache/pdf/${m.id}-par.pdf`;
  if (existsSync(par)) { copyFileSync(par, `${RAIZ}app/data/partitura/${m.id}.pdf`); m.partituraLocal = `data/partitura/${m.id}.pdf`; copiadas++; }

  // 1) sem cifra: gera da partitura
  if (!m.chordpro || (m.daPartitura && !m.daPartitura.doPdfDeCifra)) {
    if (!existsSync(par)) continue;
    let r = await partituraParaCifra(pdfjs, new Uint8Array(readFileSync(par)));
    // partitura em imagem (escaneada / sem texto): leitura pela imagem
    let porImagem = false;
    // sem texto nenhum, ou a letra está desenhada como figura (só os acordes saem como texto)
    if ((contar(r.chordpro) < 3 && await semTexto(par)) || (contar(r.chordpro) >= 3 && qualidade(r.chordpro).palavras < 12)) {
      r = await partituraImagemParaCifra(m.id, par); porImagem = true; r.duvidas = [];
      if (r.confianca < 70) { if (VERBOSO) console.log('imagem ilegível demais', m.id, m.nome, r.confianca); r.chordpro = ''; }   // fica só a partitura
    }
    const q = qualidade(r.chordpro);
    // a partitura é mesmo desta música? (o site às vezes aponta a partitura de outra) — o título aparece na letra
    const norm = t => normalizar(t).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !/^(salmo|hino|canto|versao|refrao|antifona)$/.test(w));
    const tit = norm(m.nome.replace(/\(.*$/, '').replace(/[-_]/g, ' ')).slice(0, 4), letra = new Set(norm(r.chordpro.replace(/\[[^\]]*\]/g, '')));
    // só quando outra música do acervo aponta para o mesmo arquivo (erro de cadastro); títulos genéricos
    // ("Aclamação Memorial", "Doxologia") não aparecem na letra e não são erro
    const compartilhada = (porPartitura.get(m.partitura) || []).length > 1;
    const bateTitulo = !compartilhada || !tit.length || tit.some(w => letra.has(w)) || q.palavras < 12;
    if (!bateTitulo) { outraMusica++; if (VERBOSO) console.log('partitura de outra música?', m.id, m.nome); if (m.daPartitura) { m.chordpro = ''; m.temCifra = false; m.tom = ''; delete m.daPartitura; } continue; }
    if (contar(r.chordpro) < 3 || q.palavras < 12) {   // sem acordes escritos, ou a letra não saiu como texto: fica só a partitura
      semAcordes++;
      if (m.daPartitura) { m.chordpro = ''; m.temCifra = false; m.tom = ''; delete m.daPartitura; }
      continue;
    }
    m.chordpro = r.chordpro; m.tom = detectarTom(r.chordpro); m.temCifra = true;
    if (r.cabecalho?.length) m.cabecalho = r.cabecalho;
    m.daPartitura = { formato: r.formato, duvidas: r.duvidas.slice(0, 15), revisar: r.duvidas.length > 0 || q.conhecidas < 0.5 || porImagem };
    if (porImagem) m.daPartitura.duvidas.unshift('cifra lida da imagem da partitura (escaneada): confira letra e acordes');
    if (q.conhecidas < 0.5) m.daPartitura.duvidas.unshift('letra com muitas palavras não reconhecidas: confira com a partitura');
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
await encerrarOcr();
if (SALVAR) writeFileSync(ARQ, JSON.stringify(dados));
console.log(`${outraMusica} partituras que não batem com o título (não usadas) · ${novas} cifras novas geradas de partitura · ${refeitas} cifras refeitas (PDF misturado com partitura) · ${semAcordes} partituras sem acordes · ${copiadas} partituras copiadas para o app`);
