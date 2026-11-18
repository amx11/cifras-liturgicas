// Transcrições feitas à mão (lendo a partitura) para as músicas que nenhum conversor conseguiu cifrar:
// tools/transcricoes/<id>.txt em ChordPro. Linhas iniciadas por "# " são observações e viram pontos a conferir
// no app ("# conferir: ..."). Roda por último no reprocessamento. Uso: node tools/aplicar-transcricoes.mjs [--sem-salvar]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { detectarTom } from '../app/js/cifra.js';

const RAIZ = new URL('../', import.meta.url).pathname;
const ARQ = RAIZ + 'app/data/musicas.json', DIR = RAIZ + 'tools/transcricoes/';
const dados = JSON.parse(readFileSync(ARQ, 'utf8'));
// cantos da Pasta de Cantos (id 900000+) ficam em pasta.json
const ARQ_PASTA = RAIZ + 'app/data/pasta.json';
const pasta = JSON.parse(readFileSync(ARQ_PASTA, 'utf8'));
let n = 0;
for (const f of readdirSync(DIR).filter(f => /^\d+\.txt$/.test(f))) {
  const id = +f.slice(0, -4);
  let m = (id >= 900000 ? pasta : dados).musicas.find(x => x.id === id);
  // 400000 + id: 2ª melodia que vinha no mesmo arquivo da partitura → música própria, com os dados da original
  if (!m && id >= 400000 && id < 500000) {
    const base = dados.musicas.find(x => x.id === id - 400000);
    if (base) { m = { ...base, id, complemento: [base.complemento, '2ª melodia da mesma partitura'].filter(Boolean).join(' · '), museScore: undefined, conferida: undefined }; dados.musicas.push(m); }
  }
  if (!m) { console.log('sem música no acervo:', f); continue; }
  const linhas = readFileSync(DIR + f, 'utf8').replace(/\r/g, '').split('\n');
  const notas = linhas.filter(l => l.startsWith('# ')).map(l => l.slice(2).replace(/^conferir:\s*/, '').trim());
  const chordpro = linhas.filter(l => !l.startsWith('# ')).join('\n').trim();
  m.chordpro = chordpro; m.tom = detectarTom(chordpro); m.temCifra = chordpro.includes('[');
  m.daPartitura = { formato: 'transcrita', transcrita: true, duvidas: notas, revisar: notas.length > 0,
    sugeridos: notas.some(x => /sugerid/i.test(x)) };
  if (m.partituraLocal) m.originalPdf = m.partituraLocal;
  delete m.ocr; delete m.conferida;
  n++;
}
if (!process.argv.includes('--sem-salvar')) { writeFileSync(ARQ, JSON.stringify(dados)); writeFileSync(ARQ_PASTA, JSON.stringify(pasta)); }
const sem = dados.musicas.filter(m => m.id < 100000 && !m.chordpro);
console.log(`${n} transcrições aplicadas · ${sem.length} músicas ainda sem cifra: ${sem.map(m => m.id).join(', ')}`);
