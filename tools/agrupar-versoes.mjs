// Versões: músicas com a MESMA LETRA viram versões de uma só música (cada versão = outro arranjo/autor/fonte).
// Regra (definida pelo usuário): mesma letra = o REFRÃO e a 1ª ESTROFE coincidem (≥ 80% das palavras em cada um);
// sem refrão nas duas, só a estrofe. Não vale título, nem só o começo da letra, nem o texto todo (salmos repetem
// versículos com refrões diferentes). Gera app/data/versoes.json: { grupos: [[chave, ...], ...] }, 1ª = principal.
// Roda por último no reprocessamento (e depois de importar canais). Uso: node tools/agrupar-versoes.mjs [-v]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseChordPro } from '../app/js/cifra.js';

const RAIZ = new URL('../', import.meta.url).pathname;
const V = process.argv.includes('-v');
const FONTES = [['musicas.json', 'a', 0], ['adicionadas.json', 'x', 1], ['canal.json', 'y', 2], ['salmodiai.json', 'y', 2], ['pasta.json', 'p', 3]];
const todas = [];
for (const [arq, pre, pref] of FONTES) {
  if (!existsSync(RAIZ + 'app/data/' + arq)) continue;
  for (const m of JSON.parse(readFileSync(RAIZ + 'app/data/' + arq, 'utf8')).musicas) if (m.chordpro) todas.push({ chave: pre + m.id, pref, m });
}
const NUM = /^\s*\d+\s*(ª|a\b)?\s*[.)\-–:]/;
const txt = l => (l.segs || []).map(s => s.texto).join('');
const pal = s => [...new Set(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/^\s*(r\s*[.:]|refr\w*\s*:?|\d+\s*[.)\-–:])/gm, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 2))];
const sim = (a, b) => { if (!a.length || !b.length) return 0; const B = new Set(b); return a.filter(w => B.has(w)).length / Math.max(a.length, b.length); };
for (const x of todas) {
  const { linhas } = parseChordPro(x.m.chordpro);
  const pars = []; let at = [];
  for (const l of linhas) { if (l.tipo === 'vazia') { if (at.length) pars.push(at); at = []; } else if (l.tipo === 'letra') at.push(l); }
  if (at.length) pars.push(at);
  const ref = pars.find(p => p.some(l => l.refrao));
  const est = pars.find(p => NUM.test(txt(p[0]))) || pars.find(p => p !== ref);
  x.r = ref ? pal(ref.filter(l => l.refrao).map(txt).join(' ')) : [];
  x.s = est ? pal(est.map(txt).join(' ')) : [];
}
const ms = todas.filter(x => x.s.length >= 4 && x.r.length + x.s.length >= 6);
const idx = new Map();
ms.forEach((x, i) => [...x.r.slice(0, 6), ...x.s.slice(0, 6)].forEach(w => (idx.get(w) || idx.set(w, new Set()).get(w)).add(i)));
const pai = ms.map((_, i) => i), raiz = i => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
ms.forEach((x, i) => {
  const cand = new Set();
  [...x.r.slice(0, 6), ...x.s.slice(0, 6)].forEach(w => { const l = idx.get(w); if (l.size < 400) l.forEach(j => j > i && cand.add(j)); });
  for (const j of cand) {
    const y = ms[j];
    if (sim(x.s, y.s) < 0.8) continue;                                        // 1ª estrofe igual
    if (x.r.length && y.r.length ? sim(x.r, y.r) < 0.8 : (x.r.length || y.r.length)) continue;   // refrão igual
    pai[raiz(j)] = raiz(i);
  }
});
// Ordinário com o texto do Missal (Glória, Santo, Cordeiro): é UMA música por texto, mesmo quando cada compositor
// divide as estrofes de um jeito (aí a regra do refrão/estrofe não junta)
const normalizar = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
const MISSAL = {
  gloria: [/gloria a deus nas alturas/, /vos louvamos/, /(cordeiro de deus|unigenito)/],
  santo: [/deus do universo/, /(ceu|ceus) e (a )?terra (proclamam|proclama)/, /hosana/],
  cordeiro: [/cordeiro de deus/, /tirais o pecado do mu/, /paz/],
};
const MISSAL_CONFERIDO = { a664: 'santo', a39: 'santo' };
const doMissal = x => {
  if (MISSAL_CONFERIDO[x.chave]) return MISSAL_CONFERIDO[x.chave];
  const titulo = normalizar(x.m.nome || ''), t = normalizar(x.m.chordpro.replace(/\[[^\]]*\]/g, '').replace(/-+\s*/g, ''));
  for (const [nome, testes] of Object.entries(MISSAL)) {
    if (!(nome === 'gloria' ? /gloria/.test(titulo) : titulo.startsWith(nome))) continue;
    if (testes.every(re => re.test(t))) return nome;
  }
  return null;
};
const primeiroDo = {};
ms.forEach((x, i) => { const k = doMissal(x); if (!k) return; if (primeiroDo[k] === undefined) primeiroDo[k] = i; else pai[raiz(i)] = raiz(primeiroDo[k]); });
const grupos = new Map();
ms.forEach((x, i) => { const r = raiz(i); (grupos.get(r) || grupos.set(r, []).get(r)).push(x); });
const saida = [...grupos.values()].filter(g => g.length > 1)
  .map(g => g.sort((a, b) => a.pref - b.pref || a.m.id - b.m.id).map(x => x.chave));
writeFileSync(RAIZ + 'app/data/versoes.json', JSON.stringify({ regra: 'refrão e 1ª estrofe iguais (≥80%)', grupos: saida }));
if (V) for (const g of saida.slice().sort((a, b) => b.length - a.length).slice(0, 20)) console.log(g.length, g.map(c => todas.find(x => x.chave === c).m.nome).slice(0, 3).join(' / '));
console.log(`${saida.length} músicas com mais de uma versão (${saida.reduce((n, g) => n + g.length, 0)} cifras)`);
