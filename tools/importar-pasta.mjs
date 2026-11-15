// Importa uma pasta de cantos em PDF (cancioneiro com "N – TÍTULO" e acordes em cima da letra)
// para app/data/pasta.json. Cada canto vira "versão simplificada" e fica agrupado no app com as
// versões do acervo de mesmo título.
// Trechos em duas colunas (estrofes finais lado a lado) são lidos coluna por coluna.
// Uso: node tools/importar-pasta.mjs "caminho/PASTA DE CANTOS.pdf" [--sem-salvar] [-v]
import { readFileSync, writeFileSync } from 'node:fs';
import { ehLinhaDeAcordes, ehAcorde, detectarTom, silabasPalavra } from '../app/js/cifra.js';

const RAIZ = new URL('../', import.meta.url).pathname;
const pdfjs = await import(RAIZ + 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const arq = process.argv[2];
if (!arq) { console.error('uso: node tools/importar-pasta.mjs arquivo.pdf'); process.exit(1); }
const SALVAR = !process.argv.includes('--sem-salvar'), VERBOSO = process.argv.includes('-v');

// versos em maiúsculas que as regras confundem com título (conferido à mão na Pasta de Cantos)
const NAO_TITULO = ['SINAL DE DEUS CONOSCO', 'E A VIDA DE CRISTO VIVER'];
const TITULO = /^\s*(\d{1,3})\s*[–-]\s+(\S.*)$/;
// Larguras da Arial = Helvetica (métricas padrão, /1000), ASCII 32–126; acentuadas = letra base
const HELV = '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584'.split(' ').map(Number);
const HELV_B = '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584'.split(' ').map(Number);
const EXTRA = { '–': 556, '—': 1000, '’': 222, '‘': 222, '“': 333, '”': 333, 'º': 365, 'ª': 370, '°': 400, '…': 1000, '´': 333 };
function largura(c, negrito) {
  const t = negrito ? HELV_B : HELV;
  if (EXTRA[c]) return EXTRA[c];
  const b = c.normalize('NFD')[0], k = b.charCodeAt(0) - 32;
  return k >= 0 && k < t.length ? t[k] : 556;
}
// Itens com a posição real de cada letra (larguras dos glifos da fonte embutida: a fonte é proporcional)
async function lerItens(dados) {
  const doc = await pdfjs.getDocument({ data: dados, verbosity: 0, fontExtraProperties: true }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pg = await doc.getPage(p); await pg.getOperatorList();
    const H = pg.getViewport({ scale: 1 }).height;
    for (const it of (await pg.getTextContent()).items) {
      if (!it.str || !it.str.trim()) continue;
      let f = null; try { f = pg.commonObjs.get(it.fontName); } catch { /* sem fonte */ }
      const negrito = /bold|black|heavy/i.test(f?.name || '');
      const lg = c => largura(c, negrito);
      const tot = [...it.str].reduce((a, c) => a + lg(c), 0), k = tot ? it.width / tot : 0;
      let x = it.transform[4]; const chars = [];
      for (const c of it.str) { chars.push({ c, x }); x += lg(c) * k; }
      out.push({ str: it.str, x: it.transform[4], y: H - it.transform[5], w: it.width, pagina: p, chars });
    }
  }
  await doc.destroy();
  return out;
}
const itens = await lerItens(new Uint8Array(readFileSync(arq)));

// ---- acordes em cima da letra -> ChordPro, com o acorde no início da sílaba que está embaixo dele ----
function textoDaLinha(l) {   // letras da linha em ordem, com espaço entre pedaços separados
  const cs = [];
  for (const it of l.itens) { if (cs.length && it.x - cs[cs.length - 1].x > 8 && cs[cs.length - 1].c !== ' ') cs.push({ c: ' ', x: it.x - 1 }); cs.push(...it.chars); }
  return cs;
}
function acordesDaLinha(l) {
  const r = [];
  for (const it of l.itens) { let cur = null; for (const ch of it.chars) { if (ch.c === ' ') { cur = null; continue; } if (!cur) { cur = { s: '', x: ch.x }; r.push(cur); } cur.s += ch.c; } }
  return r;
}
const LETRA = /[A-Za-zÀ-ÿ'’]/;
function inicioDaSilaba(txt, j) {
  while (j < txt.length && !LETRA.test(txt[j])) j++;          // acorde sobre espaço/pontuação: vai para a próxima letra
  if (j >= txt.length) return txt.length;
  let a = j; while (a > 0 && LETRA.test(txt[a - 1])) a--;
  let b = j; while (b < txt.length && LETRA.test(txt[b])) b++;
  const sl = silabasPalavra(txt.slice(a, b)), alvo = sl[j - a];
  return a + sl.findIndex(x => x === alvo);
}
function montar(acs, letra) {
  const txt = letra.map(c => c.c).join('');
  const fimX = letra.length ? letra[letra.length - 1].x + 6 : 0;
  const ins = new Map(), fim = [];
  for (const a of acs) {
    if (a.x > fimX) { fim.push(a.s); continue; }
    let j = 0; letra.forEach((c, k) => { if (c.x <= a.x + 1.5) j = k; });
    const p = inicioDaSilaba(txt, j);
    if (p >= txt.length) { fim.push(a.s); continue; }
    if (!ins.has(p)) ins.set(p, []); ins.get(p).push(a.s);
  }
  let out = '';
  for (let k = 0; k < txt.length; k++) { if (ins.has(k)) out += ins.get(k).map(x => '[' + x + ']').join(''); out += txt[k]; }
  return out.trimEnd() + (fim.length ? ' ' + fim.map(x => '[' + x + ']').join(' ') : '');
}
// linha de acordes com observação no fim ("C D G (G7) – só na 1ª vez")
function separarObs(l) {
  const toks = acordesDaLinha(l);
  const n = toks.findIndex(t => !ehAcorde(t.s.replace(/^\((.*)\)$/, '$1')));
  if (n <= 0) return null;
  const resto = toks.slice(n).map(t => t.s).join(' ');
  return { acordes: toks.slice(0, n).map(t => ({ ...t, s: t.s.replace(/^\((.*)\)$/, '($1)') })), obs: resto };
}
function paraChordPro(its) {
  const ls = linhas(its), out = [];
  for (let k = 0; k < ls.length; k++) {
    const l = ls[k], prox = ls[k + 1];
    const toks = acordesDaLinha(l);
    const soAcordes = toks.length && toks.every(t => ehAcorde(t.s.replace(/^\((.*)\)$/, '$1')));
    const obs = soAcordes ? null : separarObs(l);
    if (soAcordes || (obs && obs.acordes.length >= 2)) {
      const acs = soAcordes ? toks.map(t => ({ ...t })) : obs.acordes;
      const temLetra = prox && prox.pagina === l.pagina && prox.y - l.y < 22 && !ehLinhaDeAcordes(prox.texto) && !(separarObs(prox)?.acordes.length >= 2);
      if (temLetra) { out.push(montar(acs, textoDaLinha(prox)) + (obs ? '  (' + obs.obs + ')' : '')); k++; }
      else out.push(acs.map(a => '[' + a.s + ']').join(' ') + (obs ? '  (' + obs.obs + ')' : ''));
      continue;
    }
    if (prox && prox.y - l.y > 22 && out.length) out.push(textoDaLinha(l).map(c => c.c).join('').trim(), '');
    else out.push(textoDaLinha(l).map(c => c.c).join('').trim());
  }
  return out.join('\n');
}

// ordem de leitura: página, altura, x
itens.sort((a, b) => a.pagina - b.pagina || a.y - b.y || a.x - b.x);
const larguraPagina = 595;
const meio = larguraPagina / 2;

// títulos: linha na margem esquerda "N – PALAVRA EM MAIÚSCULAS ..." (o título pode vir em mais de um pedaço)
const titulos = [];
{
  const porLinha = new Map();
  for (const i of itens) { const k = i.pagina + ':' + Math.round(i.y); if (!porLinha.has(k)) porLinha.set(k, []); porLinha.get(k).push(i); }
  for (const its of porLinha.values()) {
    its.sort((a, b) => a.x - b.x);
    const str = its.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
    const k = str.match(TITULO);
    if (!k || its[0].x > 70) continue;
    if (!/^\s*\d{1,3}(\s+[–-]|\s*–)\s/.test(str)) continue;                 // título "30 – ..."; estrofe é "1- ..."
    const duas = k[2].split(/\s+[-–]\s+/)[0].split(/\s+/).slice(0, 3).join(' ').replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (duas.length < 3 || duas !== duas.toUpperCase() || ehLinhaDeAcordes(k[2])) continue;
    titulos.push({ str, x: its[0].x, y: its[0].y, pagina: its[0].pagina, itens: its });
  }
  titulos.sort((a, b) => a.pagina - b.pagina || a.y - b.y);
  // Depois do último número, a pasta segue com cantos sem número: título em MAIÚSCULAS com espaço grande acima
  // (as letras em maiúsculas vêm em blocos com espaçamento normal de linha)
  const ult = titulos[titulos.length - 1];
  const ls = [...porLinha.values()].map(its => ({ its, pagina: its[0].pagina, y: its[0].y, str: its.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim() }))
    .filter(l => l.pagina > ult.pagina || (l.pagina === ult.pagina && l.y > ult.y + 1)).sort((a, b) => a.pagina - b.pagina || a.y - b.y);
  let n = 0;
  const soAcordes = t => t.replace(/[()]/g, ' ').trim().split(/\s+/).every(x => ehAcorde(x) || /^[-–|]$/.test(x));
  const credito = l => /^(LETRA|M[ÚU]SICA|AUTOR|AUTORES|ÁLBUM|ALBUM)\b/i.test(l.str);
  const maiusc = l => { const le = l.str.replace(/[^A-Za-zÀ-ÿ]/g, ''); return le.length >= 4 && le === le.toUpperCase() && !credito(l); };
  // pedaços de acorde ("b7", "9#", "b 4") e linhas de acordes não são texto
  const texto = ls.filter(l => !soAcordes(l.str) && !ehLinhaDeAcordes(l.str) && l.str.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 3
    && !l.str.split(/\s+/).every(x => ehAcorde(x) || /^[b#\d]+$/.test(x)));
  for (let k = 0; k < texto.length; k++) {
    const l = texto[k], ant = texto[k - 1], prox = texto[k + 1];
    const comAutor = /^[A-ZÀ-Ý][^.!?:]{2,40}\s\([A-ZÀ-Ý][^)]{3,40}\)\s*$/.test(l.str);     // "Jóia Rara (Felipe Souza)"
    const INTRO = /^(intr|introd|intro|introdução)\b\.?|^tom\s*:/i;
    // título em letras normais logo antes de "Intro:" / "Tom:"
    const vao0 = !ant || ant.pagina !== l.pagina ? 99 : l.y - ant.y;
    const antesDaIntro = prox && /^(intr|introd|intro|introdução)\b/i.test(prox.str) && !INTRO.test(l.str) && !credito(l) && !/^autor/i.test(l.str) && l.str.length <= 60 && !/[,;]$/.test(l.str) && vao0 >= 20;
    // canto sem título que começa em "Tom: D": o nome é a 1ª linha da letra
    if (/^tom\s*:\s*\S+\s*$/i.test(l.str) && !(ant && titulos.length && titulos[titulos.length - 1].itens === ant.its)) {
      let j = k + 1; while (texto[j] && INTRO.test(texto[j].str)) j++;
      if (texto[j]) { titulos.push({ str: '0 – ' + texto[j].str.replace(/\.{2,}/g, '').replace(/[.\s]+$/, '').split(/,\s/)[0], x: l.its[0].x, y: l.y, pagina: l.pagina, itens: l.its, semNumero: ++n, ctx: `(Tom:) → ${texto[j].str}` }); continue; }
    }
    if (!(maiusc(l) || comAutor || antesDaIntro) || /^(LETRA|M[ÚU]SICA|INTRO|REFR|BIS|OBS)/i.test(l.str)) continue;
    const vao = !ant || ant.pagina !== l.pagina ? 99 : l.y - ant.y;
    const blocoMaiusc = ant && maiusc(ant) && prox && maiusc(prox);
    const isolada = !(ant && maiusc(ant)) && !(prox && maiusc(prox));
    if (NAO_TITULO.includes(l.str.trim())) continue;
    const aposVersoMaiusc = ant && maiusc(ant);
    const ok = antesDaIntro || comAutor ? true : aposVersoMaiusc ? (vao >= 25 && !/[,.;]/.test(l.str) && !(prox && maiusc(prox))) : (vao >= 34 || isolada);
    if (blocoMaiusc || (ant && credito(ant)) || !ok) continue;
    titulos.push({ str: '0 – ' + l.str, x: l.its[0].x, y: l.y, pagina: l.pagina, itens: l.its, semNumero: ++n,
      ctx: `${ant ? ant.str.slice(0, 40) : '—'}  ⟶  [${l.str}]  ⟶  ${prox ? prox.str.slice(0, 40) : '—'} (vão ${Math.round(vao)})` });
  }
  if (VERBOSO) for (const t of titulos.filter(t => t.semNumero)) console.log('  título sem número:', t.ctx);
}

// Nome em letras normais: "APERTE A MINHA MÃO" -> "Aperte a minha mão" (nomes sagrados com maiúscula)
const MAIUSC = ['deus', 'jesus', 'cristo', 'maria', 'senhor', 'espírito', 'santo', 'pai', 'filho', 'trindade', 'josé', 'nazaré', 'belém',
  'jerusalém', 'emanuel', 'aparecida', 'eucaristia', 'igreja', 'rei', 'ressuscitado', 'messias', 'salvador', 'cordeiro', 'mãe', 'nossa', 'senhora'];
function nomeBonito(t) {
  const s = t.toLowerCase().replace(/\s+/g, ' ').trim();
  return s.split(' ').map((w, i) => (i === 0 || MAIUSC.includes(w.replace(/[^a-zà-ÿ]/g, '')) ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ')
    .replace(/(^|[(\s])(ó|ô)\s/gi, (m, a, o) => a + o.toUpperCase() + ' ');
}

// linha = itens na mesma altura
function linhas(its) {
  const ls = [];
  for (const it of [...its].sort((a, b) => a.pagina - b.pagina || a.y - b.y || a.x - b.x)) {
    const l = ls[ls.length - 1];
    if (l && l.pagina === it.pagina && Math.abs(l.y - it.y) <= 2.5) l.itens.push(it); else ls.push({ pagina: it.pagina, y: it.y, itens: [it] });
  }
  for (const l of ls) { l.itens.sort((a, b) => a.x - b.x); l.texto = l.itens.map(i => i.str).join(' '); }
  return ls;
}

// Duas colunas: a partir da primeira linha de texto (não acordes) com um pedaço começando na metade direita
// da página, lê a coluna da esquerda inteira e depois a da direita.
function emColunas(its) {
  const ls = linhas(its);
  const k = ls.findIndex(l => !ehLinhaDeAcordes(l.texto) && l.itens.some(i => i.x > meio - 20 && i.x < meio + 60) && l.itens[0].x < meio - 100
    || (!ehLinhaDeAcordes(l.texto) && l.itens.length === 1 && l.itens[0].x > meio - 20 && ls.some(o => o !== l && o.pagina === l.pagina && Math.abs(o.y - l.y) < 16 && o.itens[0].x < meio - 100)));
  if (k < 0) return { itens: its, colunas: false };
  const antes = ls.slice(0, k).flatMap(l => l.itens);
  const resto = ls.slice(k).flatMap(l => l.itens);
  const esq = resto.filter(i => i.x < meio - 20), dir = resto.filter(i => i.x >= meio - 20);
  if (!dir.length) return { itens: its, colunas: false };
  const desl = Math.min(...dir.map(i => i.x)) - Math.min(...esq.map(i => i.x), 43);
  const fimEsq = Math.max(...esq.map(i => i.y), 0), iniDir = Math.min(...dir.map(i => i.y));
  // coluna da direita vai para baixo da esquerda (mesma página, para manter a ordem)
  const dirMov = dir.map(i => ({ ...i, x: i.x - desl, chars: i.chars.map(c => ({ ...c, x: c.x - desl })), y: i.y - iniDir + fimEsq + 20, pagina: Math.max(...esq.map(e => e.pagina), i.pagina) }));
  return { itens: [...antes, ...esq, ...dirMov], colunas: true };
}

const cantos = [];
for (let t = 0; t < titulos.length; t++) {
  const ti = titulos[t], prox = titulos[t + 1];
  const depois = i => i.pagina > ti.pagina || (i.pagina === ti.pagina && i.y > ti.y + 1);
  const antesProx = i => !prox || i.pagina < prox.pagina || (i.pagina === prox.pagina && i.y < prox.y - 1);
  const corpoIts = itens.filter(i => !ti.itens.includes(i) && depois(i) && antesProx(i));
  // número de página solto no rodapé
  const limpos = corpoIts.filter(i => !/^\s*\d{1,3}\s*$/.test(i.str) || ehLinhaDeAcordes(i.str));
  const { itens: ordenados, colunas } = emColunas(limpos);
  // páginas diferentes: empilha numa página só, uma depois da outra
  const pags = [...new Set(ordenados.map(i => i.pagina))].sort((a, b) => a - b);
  let base = 0; const empilhados = [];
  for (const p of pags) { const ps = ordenados.filter(i => i.pagina === p); const y0 = Math.min(...ps.map(i => i.y)); for (const i of ps) empilhados.push({ ...i, y: i.y - y0 + base, pagina: 1 }); base = Math.max(...empilhados.map(i => i.y)) + 20; }
  const info = {};
  let chordpro = paraChordPro(empilhados)
    .replace(/^((?:\[[^\]]*\])*)(\d{1,2})\s*-\s*/gm, '$2. $1')     // "1-Tu" -> "1. Tu" (acorde do início fica depois do número)
    .replace(/\n(?=\d{1,2}\. )/g, '\n\n')                           // linha em branco antes de cada estrofe
    .replace(/\n{3,}/g, '\n\n').trim();
  const [, num, tit] = ti.str.match(TITULO);
  // "HINO A CRISTO REI – Dom. de Ramos": a parte em maiúsculas é o nome; o resto, observação
  let autor = ''; const tt = tit.replace(/\s*\(([^)]{3,60})\)\s*$/, (m0, a) => { autor = a; return ''; });
  const partes = tt.replace(/\s*[-–.]+\s*$/, '').split(/\s+[-–]\s+/);
  if (autor) partes.push(autor);
  const nome = nomeBonito(partes[0]), obs = partes.slice(1).map(x => (x === x.toUpperCase() ? nomeBonito(x) : x)).join(' – ');
  cantos.push({ numeroPasta: ti.semNumero ? null : +num, nome, obs, chordpro, colunas, incertos: (info.incertos || []).length });
}

// saída
const saida = cantos.map((c, i) => ({
  id: 900001 + i, nome: c.nome, titulo: c.numeroPasta ? `${c.numeroPasta}. ${c.nome}` : c.nome, numero: null,
  complemento: (c.obs ? c.obs + ' – ' : '') + 'versão simplificada (Pasta de Cantos)', chordpro: c.chordpro, temCifra: c.chordpro.includes('['),
  tom: detectarTom(c.chordpro), tempos: [], partes: [], anos: [], categorias: [], cabecalho: [],
  pasta: { numero: c.numeroPasta, colunas: c.colunas, incertos: c.incertos },
}));
const repetidos = saida.filter((m, i) => saida.findIndex(x => x.id === m.id) !== i);
if (SALVAR) writeFileSync(RAIZ + 'app/data/pasta.json', JSON.stringify({ fonte: 'Pasta de Cantos (versão simplificada)', importado: new Date().toISOString(), musicas: saida }));
const nums = cantos.map(c => c.numeroPasta).filter(n => n), faltam = [];
for (let n = 1; n <= Math.max(...nums); n++) if (!nums.includes(n)) faltam.push(n);
console.log('números que não aparecem:', faltam.join(', ') || 'nenhum', '· repetidos:', [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))].map(n => `${n} (${cantos.filter(c => c.numeroPasta === n).map(c => c.nome).join(' / ')})`).join(', ') || 'nenhum');
console.log(`sem número (depois do ${Math.max(...nums)}): ${cantos.filter(c => !c.numeroPasta).map(c => c.nome).join(' | ')}`);
console.log(`${saida.length} cantos · ${saida.filter(m => m.temCifra).length} com acordes · ${saida.filter(m => m.pasta.colunas).length} com trecho em duas colunas · ${repetidos.length} números repetidos`);
if (VERBOSO) for (const m of saida.slice(0, 3)) console.log(`\n=== ${m.titulo} (${m.tom})\n${m.chordpro}`);
