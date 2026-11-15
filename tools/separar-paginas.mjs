// PDFs da arquidiocese que trazem a mesma música mais de uma vez (outra página em outro tom, ou
// "versão simplificada"): a cifra principal fica só com a 1ª ocorrência; a repetição
//  - só transposta (mesmos acordes em outro tom) -> descartada, anotada em m.outrosTons;
//  - com acordes diferentes -> vira uma versão separada (id 100000 + id*10 + página inicial).
// Roda depois do importador/OCR. Uso: node tools/separar-paginas.mjs [--sem-salvar]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pdfParaItens, separarCabecalho } from '../app/js/pdf.js';
import { itensParaChordPro, detectarTom, normalizar, transporAcorde } from '../app/js/cifra.js';
import { paraChordPro, resumirDuvidas } from '../app/js/ocr-cifra.js';

const RAIZ = new URL('../', import.meta.url).pathname;
const pdfjs = await import(RAIZ + 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const ARQ = RAIZ + 'app/data/musicas.json';
const SALVAR = !process.argv.includes('--sem-salvar');
const dados = JSON.parse(readFileSync(ARQ, 'utf8'));
dados.musicas = dados.musicas.filter(m => !(m.id >= 100000));   // refaz as versões geradas antes

const palavras = cp => normalizar(cp.replace(/\[[^\]]*\]/g, ' ')).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length > 1);
const acordes = cp => (cp.match(/\[([^\]]+)\]/g) || []).map(a => a.slice(1, -1)).filter(a => /^\(?[A-G]/.test(a));

// Cifra de cada página (texto: pelo PDF; escaneada: pelo cache do OCR)
async function cifraPorPagina(m) {
  if (m.ocr && !m.ocr.falhou) {
    const arq = `${RAIZ}tools/cache/ocr/${m.id}.json`;
    if (!existsSync(arq)) return null;
    const ocr = JSON.parse(readFileSync(arq, 'utf8'));
    return { tipo: 'ocr', ocr, n: ocr.paginas.length, de: (ini, fim) => paraChordPro({ paginas: ocr.paginas.slice(ini - 1, fim) }) };
  }
  const arq = `${RAIZ}tools/cache/pdf/${m.id}-cif.pdf`;
  if (!existsSync(arq)) return null;
  const itens = await pdfParaItens(pdfjs, new Uint8Array(readFileSync(arq)));
  const n = Math.max(...itens.map(i => i.pagina));
  return { tipo: 'texto', n, de: (ini, fim) => separarCabecalho(itensParaChordPro(itens.filter(i => i.pagina >= ini && i.pagina <= fim))) };
}

// a página recomeça a música? (as primeiras palavras cantadas iguais às da 1ª página)
function recomeca(p1, pk) {
  const a = palavras(p1.chordpro).slice(0, 8), b = palavras(pk.chordpro).slice(0, 8);
  if (a.length < 5 || b.length < 5) return false;
  return a.filter((w, i) => w === b[i]).length >= 6;
}

// mesmos acordes, só transpostos?
const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const forma = (a, t) => { const x = transporAcorde(a.replace(/[()]/g, ''), t); return x.replace(/^([A-G][#b]?)/, r => 'R' + ((PC[r] ?? 0))); };
function soTransposta(a1, a2) {
  if (!a1.length || Math.abs(a1.length - a2.length) > Math.max(2, a1.length * 0.1)) return null;
  for (let t = 1; t < 12; t++) {
    const n = Math.min(a1.length, a2.length);
    let iguais = 0;
    for (let i = 0; i < n; i++) if (forma(a1[i], t) === forma(a2[i], 0)) iguais++;
    if (iguais >= n * 0.85) return t;
  }
  return null;
}

let tocadas = 0, transpostas = 0, versoesNovas = 0;
const novas = [];
for (const m of dados.musicas) {
  if (!m.chordpro || m.daPartitura) continue;
  delete m.outrosTons;
  const fonte = await cifraPorPagina(m);
  if (!fonte || fonte.n < 2) continue;
  const paginas = [];
  for (let p = 1; p <= fonte.n; p++) paginas.push(fonte.de(p, p));
  // início de cada ocorrência da música
  const inicios = [1];
  for (let p = 2; p <= fonte.n; p++) if (recomeca(paginas[0], paginas[p - 1])) inicios.push(p);
  if (inicios.length < 2) continue;
  tocadas++;
  const trechos = inicios.map((ini, i) => ({ ini, fim: (inicios[i + 1] || fonte.n + 1) - 1 }));
  const principal = fonte.de(trechos[0].ini, trechos[0].fim);
  const ac1 = acordes(principal.chordpro);
  m.chordpro = principal.chordpro;
  m.tom = detectarTom(principal.chordpro);
  m.temCifra = principal.chordpro.includes('[');
  if (principal.cabecalho?.length) m.cabecalho = principal.cabecalho;
  if (fonte.tipo === 'ocr') {
    m.ocr = { ...m.ocr, duvidas: resumirDuvidas(principal.duvidas), locais: principal.locais.slice(0, 80),
      revisar: principal.duvidas.length > 0 || principal.legibilidade < 0.85 };
  }
  for (const t of trechos.slice(1)) {
    const r = fonte.de(t.ini, t.fim);
    const semis = soTransposta(ac1, acordes(r.chordpro));
    if (semis != null) { (m.outrosTons ||= []).push(detectarTom(r.chordpro)); transpostas++; continue; }
    const rotulo = [r.titulo, ...(r.cabecalho || [])].find(l => /simplificad|vers[ãa]o|tom|melodia/i.test(l || '')) || `página ${t.ini} do original`;
    const nova = {
      ...m, id: 100000 + m.id * 10 + t.ini, numero: m.numero, complemento: rotulo, cabecalho: r.cabecalho || [],
      chordpro: r.chordpro, tom: detectarTom(r.chordpro), temCifra: r.chordpro.includes('['), paginaInicial: t.ini,
    };
    delete nova.outrosTons;
    if (fonte.tipo === 'ocr') {
      nova.ocr = { ...m.ocr, duvidas: resumirDuvidas(r.duvidas), locais: r.locais.map(l => ({ ...l, p: l.p + t.ini - 1 })).slice(0, 80),
        revisar: r.duvidas.length > 0 || r.legibilidade < 0.85 };
    }
    novas.push(nova); versoesNovas++;
  }
  if (process.argv.includes('-v')) console.log(m.id, m.nome, '| ocorrências nas páginas', inicios.join(','), '| outros tons', (m.outrosTons || []).join(','));
}
dados.musicas.push(...novas);

// Repetição na mesma página: "VERSÃO SIMPLIFICADA ..." ou o título de novo, seguido da letra recomeçando
const MARCA = /vers[ãa]o.*simplificad|cifra simplificad|simplificad[ao]\b|refr[ãa]o simplificad/i;
let noTexto = 0;
for (const m of [...dados.musicas]) {
  if (!m.chordpro || m.daPartitura) continue;
  const L = m.chordpro.split('\n');
  const titulo = palavras(m.nome).slice(0, 4).join(' ');
  let corte = -1;
  for (let i = 2; i < L.length; i++) {
    if (L[i].includes('[')) continue;
    const ehMarca = MARCA.test(L[i]) || (titulo.split(' ').length >= 3 && palavras(L[i]).slice(0, 4).join(' ') === titulo);
    if (ehMarca && L.slice(i + 1).some(l => l.includes('['))) { corte = i; break; }
  }
  if (corte < 0) continue;
  const antes = L.slice(0, corte).join('\n').trim(), depois = L.slice(corte + 1).join('\n').trim();
  if (!acordes(antes).length) continue;
  noTexto++;
  m.chordpro = antes; m.tom = detectarTom(antes);
  const semis = soTransposta(acordes(antes), acordes(depois));
  if (semis != null) { (m.outrosTons ||= []).push(detectarTom(depois)); transpostas++; continue; }
  const rotulo = MARCA.test(L[corte]) ? L[corte].trim().replace(/^./, c => c.toUpperCase()) : 'segunda versão do original';
  const nova = { ...m, id: 100000 + m.id * 10 + 9, complemento: rotulo.charAt(0) + rotulo.slice(1).toLowerCase(), cabecalho: [], chordpro: depois,
    tom: detectarTom(depois), temCifra: depois.includes('[') };
  delete nova.outrosTons;
  if (m.ocr?.locais) {
    // cada dúvida fica com a parte que contém o trecho dela
    const fica = l => !l.d.startsWith('posição') || !depois.includes(l.d.replace(/^posição:? /, ''));
    nova.ocr = { ...m.ocr, locais: m.ocr.locais.filter(l => !fica(l)) };
    m.ocr = { ...m.ocr, locais: m.ocr.locais.filter(fica) };
    nova.ocr.revisar = nova.ocr.locais.length > 0; nova.ocr.duvidas = nova.ocr.locais.map(l => l.d).slice(0, 15);
  }
  dados.musicas.push(nova); versoesNovas++;
  if (process.argv.includes('-v')) console.log(m.id, m.nome, '| dividida na linha', corte, '→', rotulo);
}
console.log(`${noTexto} músicas com outra versão na mesma página`);
if (SALVAR) writeFileSync(ARQ, JSON.stringify(dados));
console.log(`${tocadas} músicas com a cifra repetida no PDF: ${transpostas} repetições só em outro tom (removidas), ${versoesNovas} viraram versão separada`);
