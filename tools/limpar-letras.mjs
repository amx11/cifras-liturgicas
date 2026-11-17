// Limpeza da letra nas cifras do acervo (sem mexer em acordes nem na posição deles):
// - melisma escrito com hífens/sublinhados repetidos dentro da palavra: "ama------dos" → "amados", "alelu____ia" → "aleluia"
//   (quando a palavra tem "--", todos os hífens de sílaba dela saem: "a-le---lu-ia" → "aleluia");
// - sílabas separadas por espaço que vieram da partitura: "San to" → "Santo", "Ho sa na" → "Hosana", "Sen hor" → "Senhor";
// - letra toda em MAIÚSCULAS → normal (início de verso e nomes sagrados em maiúscula).
// Uso: node tools/limpar-letras.mjs [--sem-salvar] [-v]
import { readFileSync, writeFileSync } from 'node:fs';
const RAIZ = new URL('../', import.meta.url).pathname;
const v = process.argv.includes('-v'), salvar = !process.argv.includes('--sem-salvar');

// aplica f só ao texto fora dos colchetes de acorde, mas tratando "pala[C]vra" como uma palavra
function porPalavra(linha, f) {
  return linha.replace(/[^\s]+/g, tok => {
    const acordes = [], limpo = tok.replace(/\[[^\]]*\]/g, a => { acordes.push(a); return '\uE000'; });
    const novo = f(limpo);
    let i = 0;
    return novo.replace(/\uE000/g, () => acordes[i++]);
  });
}
const L = 'A-Za-zÀ-ÿ\uE000';
const melisma = tok => {
  let t = tok.replace(/^_{2,}/, '');
  t = t.replace(new RegExp(`([${L}])_+(?=[${L}])`, 'g'), '$1');                // sublinhado nunca é letra
  t = t.replace(new RegExp(`([${L}])-{2,}(?=[${L}])`, 'g'), '$1');             // "--" é sempre melisma
  // hífen simples entre pedaços curtos de sílaba ("a-le-lu-ia"), não em palavras compostas ("Cristo-Palavra", "dai-nos")
  if (/-{2,}/.test(tok) || /_/.test(tok)) {
    const so = s => s.replace(/\uE000/g, '');
    const re = new RegExp(`([${L}]+)-([${L}]+)`);
    for (let ant = null; ant !== t;) {
      ant = t;
      t = t.replace(re, (x, esq, dir) => {
        // pedaços de sílaba entre acordes/hífens: "a", "le", "lu", "ia" (não a palavra toda já juntada)
        const e = esq.split('\uE000').filter(Boolean).pop() || '', d = dir.split('\uE000').filter(Boolean)[0] || '';
        return e.length <= 3 && d.length <= 3 && !/^(nos|vos|me|te|se|lhe|lo|la|o|a)$/i.test(d) ? esq + dir : esq + '\uE001' + dir;
      });
    }
    t = t.replace(/\uE001/g, '-');
  }
  return t.replace(/_+$/, '');
};
const SEPARADAS = [[/\b(S)an( ?(?:\[[^\]]*\])? )to\b/g, 'San', 'to'], [/\b(H)o sa na\b/g], [/\b(S)en hor\b/g]];
function silabasSeparadas(l) {
  return l.replace(/\b([Ss])an ((?:\[[^\]]*\])?)to\b/g, '$1an$2to')
    .replace(/\b([Hh])o ((?:\[[^\]]*\])?)sa ((?:\[[^\]]*\])?)na\b/g, '$1o$2sa$3na')
    .replace(/\b([Ss])en ((?:\[[^\]]*\])?)hor\b/g, '$1en$2hor');
}
const SAGRADOS = ['Deus', 'Senhor', 'Jesus', 'Cristo', 'Maria', 'Pai', 'Espírito', 'Santo', 'Filho', 'Igreja', 'Tu', 'Ti', 'Te', 'Teu', 'Tua'];
function minusculas(cp) {
  return cp.split('\n').map(l => {
    if (!/[A-ZÀ-Ú]{3}/.test(l.replace(/\[[^\]]*\]/g, ''))) return l;
    let primeira = true;
    return l.replace(/(\[[^\]]*\])|([A-Za-zÀ-ÿ]+)/g, (t, ac, w) => {
      if (ac) return ac;
      const min = w.toLocaleLowerCase('pt-BR');
      const sag = SAGRADOS.find(s => s.toLocaleLowerCase('pt-BR') === min);
      const out = primeira || (sag && sag.length > 3) ? (sag || min[0].toLocaleUpperCase('pt-BR') + min.slice(1)) : min;
      primeira = false;
      return out;
    });
  }).join('\n');
}
const ehMaiusculas = cp => { const ls = cp.replace(/\[[^\]]*\]/g, '').split('\n').filter(l => /[a-zà-ú]{3}/i.test(l)); return ls.length && ls.filter(l => l === l.toUpperCase()).length / ls.length > 0.5; };

let total = 0;
for (const arq of ['app/data/musicas.json', 'app/data/pasta.json']) {
  const dados = JSON.parse(readFileSync(RAIZ + arq, 'utf8'));
  for (const m of dados.musicas) {
    if (!m.chordpro) continue;
    let cp = m.chordpro.replace(/\u0000/g, ' ').split('\n').map(l => silabasSeparadas(porPalavra(l, melisma))).join('\n');
    if (ehMaiusculas(cp)) cp = minusculas(cp);
    if (cp !== m.chordpro) {
      total++;
      if (v) { const a = m.chordpro.split('\n'), b = cp.split('\n'); a.forEach((l, i) => { if (l !== b[i]) console.log(`${m.id}: ${l.slice(0, 90)}\n     → ${b[i].slice(0, 90)}`); }); }
      m.chordpro = cp;
    }
  }
  if (salvar) writeFileSync(RAIZ + arq, JSON.stringify(dados));
}
console.log(`${total} cifras limpas`);
