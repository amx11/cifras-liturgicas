// Cifras que trazem a música duas vezes NA MESMA PÁGINA (outro tom, "cifras simplificadas", outra melodia):
//  - a 2ª cópia só transposta (mesmos acordes em outro tom) sai (o app transpõe), anotada em m.outrosTons;
//  - com acordes diferentes vira uma música independente (id 300000 + id).
// E tira da letra o que não é letra: créditos ("L. e M.: ...", "L.:", "M.:") vão para o cabeçalho; andamento
// ("= 98"), nomes de voz ("Soprano 106-...") e linhas separadoras saem.
// Roda depois de separar-paginas. Uso: node tools/separar-copias.mjs [--sem-salvar] [-v]
import { readFileSync, writeFileSync } from 'node:fs';
import { detectarTom, transporAcorde, normalizar } from '../app/js/cifra.js';

const RAIZ = new URL('../', import.meta.url).pathname;
const ARQ = RAIZ + 'app/data/musicas.json';
const SALVAR = !process.argv.includes('--sem-salvar'), V = process.argv.includes('-v');
const dados = JSON.parse(readFileSync(ARQ, 'utf8'));

const semAc = l => l.replace(/\[[^\]]*\]/g, '');
const norm = l => normalizar(semAc(l)).replace(/[^a-z0-9]/g, '');
const CREDITO = /^\s*(L\.?\s*e\s*M\.?|L\.|M\.|Arr\.|Letra|M[úu]sica|Autor(es)?|Harm\.?)\s*:/i;
const ANDAMENTO = /^\s*=\s*\d+\s*$/;
const VOZES = /^\s*(Soprano|Contralto|Tenor|Baixo)\b.*\d/i;
const RODAPE = /Arquidiocese de Porto Alegre\s*-\s*Comiss|Material para fins did[áa]ticos|Colabora com este material|^\s*\d+º? Domingo d[oe] .*[–-]\s*Ano [ABC]\s*:|Conforme grava[çc][ãa]o|^\s*Retirado do material|Material elaborado por/i;
const SEPARADOR = /^\s*[-=_.·*]{3,}\s*$|^\s*\.\s*$/;
const TITULO_COPIA = l => { const t = semAc(l).trim(); return !l.includes('[') && t && ((/:\s*$/.test(t) && !/\/:\s*$|:\/\s*$/.test(t)) || (t === t.toUpperCase() && /[A-ZÀ-Ú]{3,}.*\s.*[A-ZÀ-Ú]{3,}/.test(t)) || /original|cifras? simplificad|^em (d[óo]|r[ée]|mi|f[áa]|sol|l[áa]|si)\b|\b(maior|menor)\)?\s*:?\s*$/i.test(t) || /^\d{2,4}\s*[-–.]\s*\S/.test(t)); };
const acordes = cp => (cp.match(/\[([^\]]+)\]/g) || []).map(a => a.slice(1, -1)).filter(a => /^\(?[A-G]/.test(a));

let copias = 0, transpostas = 0, creditos = 0, limpas = 0;
const novas = [];
for (const m of dados.musicas) {
  if (!m.chordpro || (m.id >= 100000 && m.id < 300000)) continue;
  let ls = m.chordpro.split('\n');
  // 1) créditos e lixo de partitura fora da letra
  const antes = ls.length;
  const cred = ls.filter(l => CREDITO.test(semAc(l)) && !/\[/.test(l));
  if (cred.length) { m.cabecalho = [...new Set([...(m.cabecalho || []), ...cred.map(l => semAc(l).trim())])]; creditos++; }
  ls = ls.filter(l => !cred.includes(l) && !ANDAMENTO.test(l) && !VOZES.test(semAc(l)) && !SEPARADOR.test(l) && !RODAPE.test(semAc(l)));
  if (ls.length !== antes) limpas++;
  // 2) segunda cópia: a estrofe 1 aparece de novo, igual
  const pl = ls.map(norm);
  const um = ls.findIndex(l => /^\s*1\s*[.)\-–]/.test(semAc(l)));
  const s = um < 0 ? -1 : pl.findIndex((x, i) => i > um && x && x === pl[um]);
  if (s > 0) {
    // a 2ª cópia começa como a 1ª: tantas linhas de letra antes da estrofe 1 quanto no começo da música
    const i0 = pl.findIndex((x, i) => x && !TITULO_COPIA(ls[i]));
    const d = pl.slice(i0, um).filter(Boolean).length;
    let ini = s;
    for (let n = 0; n < d && ini > 0;) { ini--; if (pl[ini]) n++; }
    if (pl[ini] !== pl[i0]) ini = s;
    let k = ini - 1;
    while (k >= 0 && (!pl[k] || TITULO_COPIA(ls[k]))) k--;
    if (k < um) { if (V) console.log(`   ${m.id}: não achei onde termina a 1ª cópia — fica como está`); continue; }
    const a = ls.slice(0, k + 1).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const titulo = ls.slice(k + 1, ini).filter(l => TITULO_COPIA(l)).map(l => semAc(l).trim().replace(/:$/, '')).join(' · ');
    const b = ls.slice(k + 1).filter(l => !TITULO_COPIA(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const aa = acordes(a), bb = acordes(b);
    let t = -1;
    for (let x = 0; x < 12 && aa.length && aa.length === bb.length; x++) if (aa.every((c, i) => transporAcorde(c, x) === bb[i])) { t = x; break; }
    if (V) console.log(`== ${m.id} ${m.nome}: 2ª cópia na linha ${k + 1}${titulo ? ` (${titulo})` : ''} → ${t >= 0 ? 'só transposta (sai)' : 'outra cifra (música própria)'}`);
    m.chordpro = a;
    m.tom = detectarTom(a) || m.tom;
    if (/transposto|transposi/i.test(titulo)) t = 0;   // o próprio PDF diz que é a mesma cifra em outro tom
    if (t >= 0) { m.outrosTons = [...new Set([...(m.outrosTons || []), detectarTom(b)])]; transpostas++; continue; }
    if (bb.length >= 3 && m.id < 300000) {
      novas.push({ ...m, id: 300000 + m.id, chordpro: b, tom: detectarTom(b), complemento: [m.complemento, titulo || 'outra cifra do mesmo PDF'].filter(Boolean).join(' · '),
        museScore: undefined, conferida: undefined, outrosTons: undefined });
      copias++;
    }
    continue;
  }
  m.chordpro = ls.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
// pode rodar de novo: a música gerada antes com o mesmo id é substituída
for (const n of novas) { const i = dados.musicas.findIndex(x => x.id === n.id); if (i >= 0) dados.musicas[i] = n; else dados.musicas.push(n); }
if (SALVAR) writeFileSync(ARQ, JSON.stringify(dados));
console.log(`${creditos} com créditos movidos para o cabeçalho · ${limpas} com linhas que não eram letra · ${transpostas} cópias só transpostas removidas · ${copias} cópias com outra cifra viraram música própria`);
