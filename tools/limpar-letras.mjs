// Limpeza da letra nas cifras do acervo (sem mexer em acordes nem na posição deles):
// - melisma escrito com hífens/sublinhados repetidos dentro da palavra: "ama------dos" → "amados", "alelu____ia" → "aleluia"
//   (quando a palavra tem "--", todos os hífens de sílaba dela saem: "a-le---lu-ia" → "aleluia");
// - sílabas separadas por espaço que vieram da partitura: "San to" → "Santo", "Ho sa na" → "Hosana", "Sen hor" → "Senhor";
// - letra toda em MAIÚSCULAS → normal (início de verso e nomes sagrados em maiúscula);
// - linha que é só um endereço (link de vídeo colado na cifra) sai da letra; o vídeo do YouTube fica como link da música;
// - colchete solto, acorde repetido colado ("[D][D]"), texto dentro de colchete que não é acorde ("[Ou Salmo 104]",
//   "[:/]") e linhas de lixo do OCR;
// - acorde no meio de uma sílaba ("tig[A]o", "Sen[G]hor") vai para o começo dela ("ti[A]go", "Se[G]nhor").
// Uso: node tools/limpar-letras.mjs [--sem-salvar] [-v]
import { readFileSync, writeFileSync } from 'node:fs';
import { silabasPalavra, ehAcorde } from '../app/js/cifra.js';
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
// acorde caído no meio de uma sílaba vai para o começo dela (mesmo tempo musical; padrão de cifra).
// Não mexe entre duas vogais (pode ser hiato: "e-le-i-son") nem em palavras latinas/gregas.
const ESTRANGEIRAS = /^(kyrie|christe|eleison|gloria|sanctus|agnus|hosanna|dominus|deo|pax|amen|alleluia|magnificat|maranatha)$/i;
const VOG = /[aeiouáéíóúâêôãõàü]/i;
function encaixar(linha) {
  if (!linha.includes('[')) return linha;
  let texto = '';
  const acs = [];
  for (const m of linha.matchAll(/\[([^\]]*)\]|([^[]+)/g)) { if (m[1] !== undefined) acs.push({ pos: texto.length, a: m[0] }); else texto += m[2]; }
  const re = /[A-Za-zÀ-ÿ]+/g;
  let w;
  while ((w = re.exec(texto))) {
    const ini = w.index, fim = ini + w[0].length;
    if (ESTRANGEIRAS.test(w[0])) continue;
    const sl = silabasPalavra(w[0]);
    for (const c of acs) {
      if (c.pos <= ini || c.pos >= fim) continue;
      const k = c.pos - ini;
      if (sl[k] === sl[k - 1] && !(VOG.test(w[0][k]) && VOG.test(w[0][k - 1]))) {
        let i = k; while (i > 0 && sl[i - 1] === sl[k]) i--;
        c.pos = ini + i;
      }
    }
  }
  let out = '', ate = 0;
  acs.forEach((c, n) => { c.n = n; });
  for (const c of acs.sort((x, y) => x.pos - y.pos || x.n - y.n)) { out += texto.slice(ate, c.pos) + c.a; ate = c.pos; }
  return out + texto.slice(ate);
}
// colchetes: o que não é acorde sai do colchete; acorde repetido colado vira um só
const ROTULO = /^(intro(du[çc][ãa]o)?|final|solo|refr[ãa]o|ponte|bis|\(?\d+\s*x\)?)\s*:?$/i;
function colchetes(linha) {
  let l = linha.replace(/\[([^\]]*)\]/g, (todo, dentro) => {
    const toks = dentro.trim().split(/\s+/).filter(Boolean);
    if (!toks.length || toks.some(t => ehAcorde(t.replace(/^\(|\)$/g, '')) || /^\?$/.test(t))) return todo;
    if (/^(\/:|:\/|\|:|:\||[:/|]+)$/.test(dentro.trim())) return dentro.trim();          // sinal de repetição
    if (ROTULO.test(dentro.trim())) return dentro.trim();
    return /[A-Za-zÀ-ÿ]{2}/.test(dentro) ? `(${dentro.trim()})` : todo;
  });
  for (let ant = null; ant !== l;) { ant = l; l = l.replace(/\[([^\]]+)\](\s*)\[\1\]/g, '[$1]$2'); }
  return l;
}
const LIXO = [/^\s*[\[\]]\s*$/, /^A so \|\.\) \[fg/];
const ehMaiusculas = cp => { const ls = cp.replace(/\[[^\]]*\]/g, '').split('\n').filter(l => /[a-zà-ú]{3}/i.test(l)); return ls.length && ls.filter(l => l === l.toUpperCase()).length / ls.length > 0.5; };

let total = 0;
for (const arq of ['app/data/musicas.json', 'app/data/pasta.json']) {
  const dados = JSON.parse(readFileSync(RAIZ + arq, 'utf8'));
  for (const m of dados.musicas) {
    if (!m.chordpro) continue;
    // links colados na letra
    const links = m.chordpro.split('\n').filter(l => /^\s*(https?:\/\/|www\.)\S+\s*$/i.test(l.replace(/\[[^\]]*\]/g, '')));
    for (const l of links) {
      const yt = l.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
      if (yt && !m.youtube) m.youtube = yt[1];
    }
    let cp = m.chordpro.split('\n').filter(l => !links.includes(l)).join('\n').replace(/^\s*\n/, '').replace(/\u0000/g, ' ').split('\n').filter(l => !LIXO.some(re => re.test(l))).map(l => encaixar(silabasSeparadas(porPalavra(colchetes(l), melisma)))).join('\n');
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
