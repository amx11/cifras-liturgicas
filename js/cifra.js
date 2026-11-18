// Núcleo de cifras: reconhecimento de acordes, conversão de PDF para ChordPro,
// transposição e renderização. Usado pelo app (navegador) e pelo importador (Node).

const NOTAS_SUST = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTAS_BEMOL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const INDICE = { C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11 };
// Tons que se escrevem com bemóis
const TONS_BEMOL = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

const QUALIDADE = '(?:maj7|maj|min|m|M|dim|aug|sus|º|°|ø|\\+)?';
const EXTENSAO = '(?:\\d{1,2}[M+\\-]?|M|\\+|-|add\\d+|sus\\d*|dim|\\((?:[#b+\\-]?\\d{1,2}[+\\-M]?[,/]?)+\\)|[#b]\\d{1,2}|/\\d{1,2}(?![#b]))*';
const RE_ACORDE = new RegExp(`^([A-G][#b]?)(${QUALIDADE}${EXTENSAO})(?:/([A-G][#b]?))?$`);
// Tokens que podem aparecer numa linha de acordes sem serem acordes
const RE_EXTRA = /^(?:\?|\/:|:\/|\|:|:\||\||\|\||%|-+|\/|\.+|\(?\d+x\)?|\(?x\d+\)?|\(|\)|:|intro:?|introdução:?|solo:?|final:?|bis)$/i;

// Acorde escrito com o nome da nota em português ("Lá", "dó# m", "fá#m", "si m", "Ré 7", "Mi b") -> cifra (A, C#m, F#m, Bm, D7, Eb)
const SOLFEJO = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
export function solfejoParaAcorde(t) {
  const m = /^\(?\s*(d[óo]|r[ée]|mi|f[áa]|sol|l[áa]|si)\s*([#♯b♭])?\s*(m(?!aj)|M|-)?\s*((?:maj|dim|aug|sus|add|º|°|ø|\+|\d|\(|\)|\/|[#b])*)\s*(?:\/\s*(d[óo]|r[ée]|mi|f[áa]|sol|l[áa]|si)\s*([#♯b♭])?)?\s*\)?$/i.exec(t.trim());
  if (!m) return null;
  const nota = (n, a) => SOLFEJO[n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] + (a ? (/[#♯]/.test(a) ? '#' : 'b') : '');
  // minúscula ("dó# m", "si m") = menor em muitos hinários; "m" explícito também
  const menor = m[3] === 'm' || m[3] === '-' || (m[1][0] === m[1][0].toLowerCase() && /m/.test(m[3] || '') );
  const acorde = nota(m[1], m[2]) + (menor ? 'm' : '') + (m[4] || '').replace(/\s+/g, '') + (m[5] ? '/' + nota(m[5], m[6]) : '');
  return acorde;
}

export function ehAcorde(tok) {
  const t = tok.replace(/[,.]$/, '');
  if (RE_ACORDE.test(t)) return true;                                   // D7(4), Bm7(b5), C(9)
  if (/^\/[A-G][#b]?$/.test(t)) return true;                             // "/F": só troca o baixo
  if (/^\(.*\)$/.test(t) && RE_ACORDE.test(t.slice(1, -1))) return true;  // (Am) acorde opcional
  return RE_ACORDE.test(t.replace(/^\(/, '').replace(/\)$/, ''));       // "(Am" ... "G)"
}

export function ehLinhaDeAcordes(texto) {
  const toks = texto.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  let acordes = 0;
  for (const t of toks) {
    if (ehAcorde(t)) acordes++;
    else if (!RE_EXTRA.test(t)) return false;
  }
  return acordes > 0;
}

// ---------- Transposição ----------

export function preferirBemol(tom) {
  return TONS_BEMOL.has(tom);
}

function moverNota(nota, semitons, bemol) {
  const i = INDICE[nota];
  if (i === undefined) return nota;
  const j = (((i + semitons) % 12) + 12) % 12;
  return (bemol ? NOTAS_BEMOL : NOTAS_SUST)[j];
}

export function transporAcorde(acorde, semitons, bemol = false) {
  if (!semitons && !bemol) return acorde;
  const so = acorde.match(/^\/([A-G][#b]?)$/);                         // "/F": só o baixo
  if (so) return '/' + moverNota(so[1], semitons, bemol);
  const m = acorde.match(/^(\(?)([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?(\)?)$/);
  if (!m) return acorde;
  const [, abre, raiz, resto, baixo, fecha] = m;
  return abre + moverNota(raiz, semitons, bemol) + resto +
    (baixo ? '/' + moverNota(baixo, semitons, bemol) : '') + fecha;
}

export function transporTom(tom, semitons) {
  const m = tom.match(/^([A-G][#b]?)(m?)$/);
  if (!m) return tom;
  const sust = moverNota(m[1], semitons, false) + m[2];
  const bem = moverNota(m[1], semitons, true) + m[2];
  return preferirBemol(bem) ? bem : sust;
}

export function semitonsEntre(tomOrigem, tomDestino) {
  const a = INDICE[tomOrigem.replace(/m$/, '')];
  const b = INDICE[tomDestino.replace(/m$/, '')];
  if (a === undefined || b === undefined) return 0;
  return (((b - a) % 12) + 12) % 12;
}

export const TONS_MAIORES = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// ---------- ChordPro ----------

// Converte uma linha ChordPro ("[Am]Das al[E]turas") em segmentos {acorde, texto}
export function segmentos(linha) {
  const segs = [];
  const re = /\[([^\]]*)\]/g;
  let ultimo = 0, acorde = '', m;
  while ((m = re.exec(linha))) {
    if (m.index > ultimo || acorde) segs.push({ acorde, texto: linha.slice(ultimo, m.index) });
    acorde = m[1];
    ultimo = re.lastIndex;
  }
  segs.push({ acorde, texto: linha.slice(ultimo) });
  return segs.filter((s, i) => i > 0 || s.acorde || s.texto);
}

// Repetição: em cada sinal que FECHA um trecho repetido (/: … :/, |: … :|) garante o "(2x)" logo depois,
// para o músico ver no fim da frase quantas vezes repetir. Sinais abrem e fecham alternadamente.
export function marcarRepeticoes(texto) {
  const jaTemVezes = /^\s*\.?\s*(\(?\s*\d+\s*x\b|bis\b)/i;
  return texto.split(/(\n[ \t]*\n)/).map(par => {
    let aberto = false;
    return par.replace(/(\[[^\]]*\]|[a-z]+:\/\/\S*)|(\/:|:\/|\|:|:\||:\\)/gi, (todo, ignorar, sinal, pos, s) => {
      if (ignorar) return todo;                                  // acorde ou endereço (https://)
      if (sinal === '/:' || sinal === '|:') { aberto = true; return todo; }
      const inicioLinha = s.lastIndexOf('\n', pos - 1) + 1;
      const antes = s.slice(inicioLinha, pos).replace(/\[[^\]]*\]/g, '');
      if (sinal === ':/' && !aberto && !antes.trim()) { aberto = true; return todo; }   // ":/" abrindo no começo da linha
      aberto = false;
      const fimLinha = s.indexOf('\n', pos); 
      const depois = s.slice(pos + todo.length, fimLinha < 0 ? undefined : fimLinha).replace(/\[[^\]]*\]/g, '');
      if (jaTemVezes.test(depois) || /\(\s*\d+\s*x\s*\)\s*\.?\s*$/i.test(antes) || /\bbis\s*$/i.test(antes)) return todo;
      return todo + ' (2x)';
    });
  }).join('');
}

const MARCA_REFRAO = /^\s*(R\s*[.:]|Refr[ãa]o\b|Ref\s*[.:])/i;
const NUMERO_ESTROFE = /^\s*\d+\s*(ª|a\b)?\s*[.)\-–:]/;
const textoDaLinha = l => (l.segs || []).map(s => s.texto).join('');

// Marca as linhas de refrão (l.refrao = true): o parágrafo inteiro que começa com "R."/"Refrão", e — quando a
// música não usa essa marca mas tem estrofes numeradas — os parágrafos sem número (o refrão cantado entre elas)
function marcarRefroes(linhas) {
  const pars = [];
  let atual = [];
  for (const l of linhas) {
    if (l.tipo === 'vazia') { if (atual.length) pars.push(atual); atual = []; }
    else if (l.tipo === 'letra') atual.push(l);
  }
  if (atual.length) pars.push(atual);
  const numeradas = pars.filter(p => NUMERO_ESTROFE.test(textoDaLinha(p[0]))).length;
  // parágrafo sem número que aparece igual mais de uma vez na música é o refrão, mesmo sem "R."
  const chave = p => p.map(textoDaLinha).join(' ').toLowerCase().replace(/[^a-zà-ú ]/g, '').replace(/\s+/g, ' ').trim();
  const vezes = new Map();
  for (const p of pars) { const k = chave(p); if (k.length > 15) vezes.set(k, (vezes.get(k) || 0) + 1); }
  for (const p of pars) if (vezes.get(chave(p)) > 1 && !NUMERO_ESTROFE.test(textoDaLinha(p[0]))) p.forEach(l => { l.refrao = true; });
  const usaMarca = pars.some(p => p.some(l => MARCA_REFRAO.test(textoDaLinha(l))));
  for (const p of pars) {
    const primeira = textoDaLinha(p[0]).trim();
    let ehRefrao;
    if (usaMarca) ehRefrao = null;   // decide linha a linha abaixo
    else ehRefrao = numeradas >= 2 && !NUMERO_ESTROFE.test(primeira)
      && !/^([a-z]\)|\(|\.\.\.|…|(intro|final|solo|tom|obs|ou)\b)/i.test(primeira) && /[a-zà-ú]{3}/i.test(primeira);
    if (ehRefrao === null) {
      // do "R." até a próxima estrofe numerada (ou o fim do parágrafo)
      let dentro = false;
      for (const l of p) {
        const t = textoDaLinha(l);
        if (MARCA_REFRAO.test(t)) dentro = true;
        else if (NUMERO_ESTROFE.test(t)) dentro = false;
        if (dentro) l.refrao = true;
      }
    } else if (ehRefrao) p.forEach(l => { l.refrao = true; });
  }
}

// Toda estrofe numerada e todo refrão ("R.") começam um bloco separado: se vierem colados na linha anterior,
// entra uma linha em branco (antes da linha de acordes que os acompanha, quando houver)
function separarEstrofes(linhas) {
  for (let i = linhas.length - 1; i > 0; i--) {
    const l = linhas[i];
    if (l.tipo !== 'letra') continue;
    const t = textoDaLinha(l);
    if (!NUMERO_ESTROFE.test(t) && !MARCA_REFRAO.test(t)) continue;
    let ini = i;
    if (linhas[i - 1].tipo === 'acordes') ini = i - 1;
    const ant = linhas[ini - 1];
    if (ant && (ant.tipo === 'letra' || ant.tipo === 'acordes')) linhas.splice(ini, 0, { tipo: 'vazia' });
  }
}

export function parseChordPro(texto) {
  const meta = {};
  const linhas = [];
  texto = marcarRepeticoes(texto || '');
  for (const bruta of texto.split(/\r?\n/)) {
    const d = bruta.match(/^\{(\w+)(?::\s*(.*))?\}\s*$/);
    if (d) {
      const chave = d[1].toLowerCase();
      if (chave === 'comment' || chave === 'c') linhas.push({ tipo: 'comentario', texto: d[2] || '' });
      else if (chave === 'subtitle' || chave === 'st') (meta.subtitulos ||= []).push(d[2] || '');
      else meta[chave] = d[2] || '';
      continue;
    }
    if (!bruta.trim()) { linhas.push({ tipo: 'vazia' }); continue; }
    const segs = segmentos(bruta);
    const temTexto = segs.some(s => s.texto.trim());
    linhas.push({ tipo: temTexto ? 'letra' : 'acordes', segs });
  }
  separarEstrofes(linhas);
  marcarRefroes(linhas);
  return { meta, linhas };
}

// Primeiro acorde da música como tom provável (convenção comum em cifras litúrgicas)
export function detectarTom(chordpro) {
  // tom escrito no início ("(E)" antes da letra) vale mais que o primeiro acorde
  const indicado = chordpro.match(/^\s*\[\(([A-G][#b]?m?)\)\]/);
  if (indicado) return indicado[1];
  const m = chordpro.match(/\[([A-G][#b]?)(m(?!aj))?[^\]]*\]/);
  if (!m) return '';
  return m[1] + (m[2] ? 'm' : '');
}

export function transporChordPro(chordpro, semitons, bemol) {
  return chordpro.replace(/\[([^\]]+)\]/g, (_, a) =>
    '[' + a.split(/\s+/).map(t => (ehAcorde(t) ? transporAcorde(t, semitons, bemol) : t)).join(' ') + ']');
}

// Converte cifra no formato "acordes em cima da letra" (texto puro) em ChordPro
export function textoParaChordPro(texto) {
  const linhas = texto.replace(/\t/g, '    ').split(/\r?\n/).map(l => l.replace(/\s+$/, ''));
  const saida = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (ehLinhaDeAcordes(l)) {
      const acordes = posicoesDeAcordes(l);
      const prox = linhas[i + 1];
      if (prox !== undefined && prox.trim() && !ehLinhaDeAcordes(prox)) {
        saida.push(juntar(acordes, prox));
        i++;
      } else {
        saida.push(acordes.map(a => `[${a.acorde}]`).join(' '));
      }
    } else {
      saida.push(l);
    }
  }
  return saida.join('\n');
}

function posicoesDeAcordes(linha) {
  const res = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(linha))) res.push({ col: m.index, acorde: m[0] });
  return res;
}

// Insere acordes (por coluna) dentro de uma linha de letra
function juntar(acordes, letra) {
  let out = '', pos = 0;
  for (const { col, acorde } of acordes) {
    if (col > letra.length) {
      out += letra.slice(pos) + ' '.repeat(Math.max(0, col - Math.max(pos, letra.length)));
      pos = Math.max(pos, letra.length);
      if (pos < col) pos = col;
      out += `[${acorde}]`;
      continue;
    }
    out += letra.slice(pos, col) + `[${acorde}]`;
    pos = col;
  }
  return out + letra.slice(pos);
}

// ---------- PDF (itens de texto com posição) -> ChordPro ----------

// itens: [{str, x, y, w, h, pagina}] em coordenadas onde y cresce para baixo
// info (opcional): recebe info.incertos = acordes cuja posição ficou quase empatada entre duas sílabas;
// info.limiteDuvida: a partir de que fração de letra marcar (foto, menos precisa: 0.3)
export function itensParaChordPro(itens, info) {
  const linhas = agruparLinhas(itens);
  // Cada linha vira uma string em "colunas virtuais" usando a largura média de caractere
  const larguras = [];
  for (const l of linhas) for (const it of l.itens) if (it.str.length) larguras.push(it.w / it.str.length);
  larguras.sort((a, b) => a - b);
  const larguraChar = larguras[Math.floor(larguras.length / 2)] || 5;
  const xMin = Math.min(...linhas.map(l => l.itens[0]?.x ?? Infinity));

  const textos = linhas.map(l => linhaComPosicoes(l.itens));
  const saida = [];
  let ultimoY = null, ultimaAltura = 0;
  for (let i = 0; i < linhas.length; i++) {
    const { texto, xs } = textos[i];
    const lin = linhas[i];
    // Espaço vertical grande vira linha em branco (separação de estrofes)
    if (ultimoY !== null && lin.pagina === linhas[i - 1].pagina && lin.y - ultimoY > ultimaAltura * 1.9) saida.push('');
    ultimoY = lin.y; ultimaAltura = lin.h || 10;
    if (!texto.trim()) { saida.push(''); continue; }

    if (ehLinhaDeAcordes(texto)) {
      const acordes = tokensComX(texto, xs, textos[i].cs);
      const prox = textos[i + 1];
      const proxLin = linhas[i + 1];
      const pertoDaProxima = proxLin && proxLin.pagina === lin.pagina && proxLin.y - lin.y < (lin.h || 10) * 2.2;
      if (prox && prox.texto.trim() && !ehLinhaDeAcordes(prox.texto) && pertoDaProxima) {
        // OCR (centro de cada letra conhecido): alinha depois, com critério único para a página inteira
        if (prox.cs && acordes.every(a => a.c != null)) saida.push({ acordes, letra: { ...prox, limiteDuvida: info?.limiteDuvida }, pagina: lin.pagina, y: lin.y });
        else saida.push(inserirPorX(acordes, prox.texto, prox.xs, larguraChar));
        i++;
        ultimoY = proxLin.y;
      } else {
        // Linha só de acordes (introdução, interlúdio): preserva o espaçamento aproximado
        let s = '', col = 0;
        for (const a of acordes) {
          const c = Math.max(col, Math.round((a.x - xMin) / larguraChar));
          s += ' '.repeat(c - col) + `[${a.acorde}]`;
          col = c + 1;
        }
        saida.push(s.trim());
      }
    } else {
      saida.push(texto.replace(/\s+$/, ''));
    }
  }
  const incertos = [];
  alinharPorCentro(saida.filter(x => typeof x === 'object'), incertos);
  if (info) info.incertos = incertos;
  return saida.map(x => (typeof x === 'object' ? x.resultado : x)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- Alinhamento pelo centro das letras (cifras lidas por OCR) ----------
// Nas folhas datilografadas os acordes são posicionados com espaços numa fonte de largura diferente da
// letra (ex.: 33 px contra 32 px), então as duas grades escorregam ao longo da linha e muitos acordes ficam
// "entre duas letras". Regra, a mesma de quem lê o papel (e estável entre foto e escaneado):
//  - vale a letra embaixo do centro do acorde;
//  - o acorde vai para o início da sílaba em que caiu (mesmo tempo musical; padrão das cifras);
//  - entre duas letras da mesma sílaba: essa sílaba; entre sílabas diferentes: a letra mais perto,
//    e se for quase empate a posição fica marcada como dúvida para conferir;
//  - sobre vírgula/barra/espaço logo antes de uma palavra: início dela; colado no fim da frase: última sílaba.
const VOGAIS = 'aeiouáéíóúâêôãõàü';
const ehVogal = c => VOGAIS.includes((c || '').toLowerCase());
const ehLetra = c => /[a-zA-ZáéíóúâêôãõàüçñÁÉÍÓÚÂÊÔÃÕÀÜÇÑ]/.test(c || '');
const GRUPOS = /^(bl|br|cl|cr|dr|fl|fr|gl|gr|pl|pr|tr|vr|ch|lh|nh|gu|qu)$/;
const DITONGOS = /^(ai|ei|oi|ui|au|eu|ou|ão|ãe|õe|iu|éu|éi|ói|ou|ãi)$/;

// sílaba de cada letra de uma palavra (índices 0,0,1,1,1,...) — aproximação das regras do português
export function silabas(palavra) {
  const p = palavra.toLowerCase(), n = p.length, sil = new Array(n).fill(0);
  // "u" de que/qui/gue/gui funciona como consoante
  const vogal = i => ehVogal(p[i]) && !(p[i] === 'u' && /[qg]/.test(p[i - 1] || '') && ehVogal(p[i + 1]));
  const cortes = new Set();
  for (let i = 0; i < n; i++) {
    if (!vogal(i)) continue;
    let j = i + 1;
    if (j < n && vogal(j)) {                         // duas vogais seguidas: ditongo ou hiato
      if (!DITONGOS.test(p[i] + p[j]) || /[íú]/.test(p[j])) cortes.add(j);
      continue;
    }
    while (j < n && !vogal(j)) j++;                  // consoantes até a próxima vogal
    if (j >= n) break;
    const cons = p.slice(i + 1, j);
    if (cons.length === 1) cortes.add(i + 1);
    else if (GRUPOS.test(cons.slice(-2))) cortes.add(j - 2);
    else cortes.add(j - 1);
  }
  let s = 0;
  for (let i = 0; i < n; i++) { if (cortes.has(i)) s++; sil[i] = s; }
  return sil;
}

// sílabas de uma palavra que pode ter apóstrofo ("minh'alma" = mi-nhal-ma): o apóstrofo fica com a letra seguinte
export function silabasPalavra(w) {
  const limpa = w.replace(/['’]/g, '');
  const sl = silabas(limpa);
  const out = [];
  let k = 0;
  for (let i = 0; i < w.length; i++) { if (/['’]/.test(w[i])) out.push(sl[k] ?? sl[sl.length - 1] ?? 0); else out.push(sl[k++]); }
  return out;
}

// sílaba tônica (índice) de uma palavra: acento gráfico; senão paroxítona se terminar em a/e/o(s), am, em, ens;
// senão oxítona
export function tonica(w) {
  const sl = silabasPalavra(w), n = (sl[sl.length - 1] ?? 0) + 1;
  if (n === 1) return 0;
  const acento = [...w].findIndex(c => /[áéíóúâêô]/i.test(c));
  if (acento >= 0) return sl[acento];
  const til = [...w].findIndex(c => /[ãõ]/i.test(c));
  if (til >= 0) return sl[til];
  return /([aeo]s?|[ae]m|ens)$/i.test(normalizar(w)) ? n - 2 : n - 1;
}

function infoSilabas(texto) {
  // para cada índice do texto: [id da palavra, sílaba] (null fora de palavras)
  const info = new Array(texto.length).fill(null);
  const re = /[a-zA-ZáéíóúâêôãõàüçñÁÉÍÓÚÂÊÔÃÕÀÜÇÑ]+(?:['’][a-zA-ZáéíóúâêôãõàüçñÁÉÍÓÚÂÊÔÃÕÀÜÇÑ]+)*/g;
  let m, w = 0;
  while ((m = re.exec(texto))) { const sl = silabasPalavra(m[0]); const ton = tonica(m[0]); for (let k = 0; k < m[0].length; k++) info[m.index + k] = [w, sl[k], sl[k] === ton]; w++; }
  return info;
}

function centrosDaLinha(letra) {
  const cs = letra.cs, difs = [];
  for (let k = 1; k < cs.length; k++) if (cs[k] != null && cs[k - 1] != null && letra.texto[k] !== ' ' && letra.texto[k - 1] !== ' ') difs.push(cs[k] - cs[k - 1]);
  difs.sort((a, b) => a - b);
  return difs[Math.floor(difs.length / 2)] || 0;
}

function maisProxima(letra, x) {
  // só letras e números contam (pontuação e espaço não são sílaba)
  let melhor = -1, dm = Infinity;
  letra.cs.forEach((c, k) => { if (c == null || !/[0-9a-zA-ZÀ-ÿ]/.test(letra.texto[k])) return; const d = Math.abs(c - x); if (d < dm) { dm = d; melhor = k; } });
  return melhor;
}

const AMBIGUO = 0.3; // fração de letra a partir da qual o acorde está "entre duas letras"
const LIMITE_DUVIDA = 0.45; // entre duas sílabas e quase no meio: posição a conferir
function posicaoDoAcorde(letra, x, passo) {
  const { texto, cs } = letra;
  const k = maisProxima(letra, x);
  if (k < 0) return { idx: texto.length, depois: 1 };
  const f = (x - cs[k]) / passo;
  if (Math.abs(f) < AMBIGUO) return { idx: k };
  const v = f > 0 ? k + 1 : k - 1;                   // vizinha do lado do acorde
  if (f > 0 && !/[0-9a-zA-ZÀ-ÿ]/.test(texto[v] || '')) {
    // à direita da última letra da palavra: sobre pontuação ou espaço, como está no papel
    const col = Math.round(f);
    if (col === 0) return { idx: k };
    const t = k + col;
    if (t >= texto.length) return col <= 1 ? { idx: k } : { idx: texto.length, depois: t - texto.length + 1, solto: true };
    if (/[a-zA-ZÀ-ÿ]/.test(texto[t])) return { idx: t };
    // espaço logo antes de uma palavra cantada (não a marca de refrão "R." nem número de estrofe)
    if (texto[t] === ' ' && /[a-zA-ZÀ-ÿ]/.test(texto[t + 1] || '') && !/^R\.?(\s|$)/.test(texto.slice(t + 1))) return { idx: t + 1 };
    // sobre pontuação ("," "/" "!") com uma palavra cantada logo depois: início dela; senão fica ali
    const m = /^[^a-zA-ZÀ-ÿ0-9]{1,3}/.exec(texto.slice(t));
    const j = t + (m ? m[0].length : 0);
    if (j < texto.length && /[a-zA-ZÀ-ÿ]/.test(texto[j]) && !/^R\.?(\s|$)/.test(texto.slice(j))) return { idx: j };
    if (col <= 1) return { idx: k };                 // colado no fim da palavra (sobre "," "!"): última sílaba
    return { idx: t, solto: true };
  }
  if (f < 0 && !/[0-9a-zA-ZÀ-ÿ]/.test(texto[v] || '')) return { idx: k }; // espaço antes da palavra: início dela
  const info = letra.silabas ||= infoSilabas(texto);
  const [wk, sk] = info[k] || [], [wv, sv] = info[v] || [];
  if (wk != null && wk === wv && sk === sv) return { idx: Math.min(k, v) }; // mesma sílaba (o início é aplicado depois)
  // entre duas sílabas: vence a sílaba tônica (o acorde costuma cair no tempo forte; testado contra as
  // partituras: 87% de acerto, contra 76% da letra mais perto); se as duas ou nenhuma forem tônicas, a mais perto
  const tk = info[k]?.[2], tv = info[v]?.[2];
  const escolha = tv && !tk ? v : k;
  return Math.abs(f) > (letra.limiteDuvida ?? LIMITE_DUVIDA) && tk === tv ? { idx: escolha, incerto: true } : { idx: escolha };
}

// Forma canônica: acorde no início da sílaba em que caiu (mesmo tempo musical; "J[Em]esus" -> "[Em]Jesus")
function inicioDaSilaba(letra, q) {
  if (q.depois || q.solto) return q;
  const incerto = q.incerto;
  // sobre o número da estrofe ("4.Para", "R. Eu"): vai para a primeira palavra cantada
  const pre = /^\s*(?:\d+[.)]?|R\.)\s*/.exec(letra.texto);
  if (pre && pre[0].length && q.idx < pre[0].length && /[a-zA-ZÀ-ÿ]/.test(letra.texto[pre[0].length] || '')) q = { idx: pre[0].length };
  const info = letra.silabas ||= infoSilabas(letra.texto);
  const s = info[q.idx];
  if (!s) return { ...q, incerto };
  let i = q.idx;
  while (i > 0 && info[i - 1] && info[i - 1][0] === s[0] && info[i - 1][1] === s[1]) i--;
  return { idx: i, incerto };
}

// "palavra com o acorde", para o usuário conferir com o original
function trechoIncerto(texto, idx, acorde) {
  let a = idx, b = idx;
  while (a > 0 && /[a-zA-ZÀ-ÿ]/.test(texto[a - 1])) a--;
  while (b < texto.length && /[a-zA-ZÀ-ÿ]/.test(texto[b])) b++;
  return `${texto.slice(a, idx)}[${acorde}]${texto.slice(idx, b)}`;
}

function alinharPorCentro(pares, incertos) {
  if (!pares.length) return;
  for (const pag of new Set(pares.map(p => p.pagina))) {
    const daPagina = pares.filter(p => p.pagina === pag);
    // deslocamento sistemático da linha de acordes (só quando todos concordam: concentração alta)
    let sx = 0, sy = 0, n = 0;
    for (const p of daPagina) {
      p.passo = centrosDaLinha(p.letra) || 5;
      for (const a of p.acordes) {
        const k = maisProxima(p.letra, a.c);
        if (k < 0) continue;
        const ang = 2 * Math.PI * (a.c - p.letra.cs[k]) / p.passo;
        sx += Math.cos(ang); sy += Math.sin(ang); n++;
      }
    }
    const conc = n ? Math.hypot(sx, sy) / n : 0;
    const fi = conc >= 0.6 ? Math.atan2(sy, sx) / (2 * Math.PI) : 0;
    for (const p of daPagina) {
      const pos = p.acordes.map(a => inicioDaSilaba(p.letra, posicaoDoAcorde(p.letra, a.c - fi * p.passo, p.passo)));
      p.resultado = montarComIndices(p.acordes, p.letra.texto, pos);
      pos.forEach((q, i) => { if (q.incerto) incertos?.push({ trecho: trechoIncerto(p.letra.texto, q.idx, p.acordes[i].acorde), pagina: p.pagina, x: p.acordes[i].x, y: p.y }); });
    }
  }
}

function montarComIndices(acordes, letra, pos) {
  let out = '', ate = 0;
  acordes.forEach((a, i) => {
    const q = pos[i];
    if (q.depois) {
      if (ate < letra.length) { out += letra.slice(ate); ate = letra.length; }
      out += ' '.repeat(Math.max(1, q.depois)) + `[${a.acorde}]`;
      return;
    }
    const idx = Math.max(q.idx, ate);
    out += letra.slice(ate, idx) + `[${a.acorde}]`;
    ate = idx;
  });
  return (out + letra.slice(ate)).replace(/\s+$/, '');
}

function agruparLinhas(itens) {
  const ordenados = itens.filter(it => it.str !== undefined)
    .sort((a, b) => a.pagina - b.pagina || a.y - b.y || a.x - b.x);
  const linhas = [];
  for (const it of ordenados) {
    const l = linhas[linhas.length - 1];
    const tol = Math.max(2, (it.h || 10) * 0.45);
    if (l && l.pagina === it.pagina && Math.abs(l.y - it.y) <= tol) {
      l.itens.push(it);
      l.h = Math.max(l.h, it.h || 0);
    } else {
      linhas.push({ pagina: it.pagina, y: it.y, h: it.h || 10, itens: [it] });
    }
  }
  for (const l of linhas) l.itens.sort((a, b) => a.x - b.x);
  return linhas;
}

// Junta os itens de uma linha numa string, guardando o x de cada caractere
function linhaComPosicoes(itens) {
  let texto = '';
  const xs = [], cs = [];
  const comCentros = itens.length > 0 && itens.every(it => !it.str || it.cs);
  let fimAnterior = null;
  for (const it of itens) {
    if (!it.str) continue;
    const cw = it.str.length ? it.w / it.str.length : 0;
    // itens do OCR já são palavras separadas: sempre há espaço entre eles (acordes encostados "F" "E" não viram "FE")
    if (fimAnterior !== null && (it.x - fimAnterior > cw * 0.6 || (it.ocr && comCentros)) && !texto.endsWith(' ') && !it.str.startsWith(' ')) {
      texto += ' ';
      xs.push(fimAnterior); cs.push(null);
    }
    // it.xs (opcional): x exato de cada caractere (vem do OCR); senão, largura média
    for (let k = 0; k < it.str.length; k++) {
      texto += it.str[k];
      xs.push(it.xs?.[k] ?? it.x + k * cw);
      cs.push(it.cs?.[k] ?? null);
    }
    fimAnterior = it.x + it.w;
  }
  return comCentros ? { texto, xs, cs } : { texto, xs };
}

function tokensComX(texto, xs, cs) {
  const res = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(texto))) res.push({ x: xs[m.index], c: cs?.[m.index], acorde: m[0] });
  return res;
}

function inserirPorX(acordes, letra, xs, larguraChar) {
  let out = '', pos = 0;
  for (const { x, acorde } of acordes) {
    // índice do caractere da letra mais próximo do x do acorde
    let idx = xs.findIndex(cx => cx >= x - larguraChar * 0.5);
    if (idx === -1) {
      const fim = xs.length ? xs[xs.length - 1] + larguraChar : 0;
      const extra = Math.max(1, Math.round((x - fim) / larguraChar));
      out += letra.slice(pos) + ' '.repeat(pos <= letra.length ? extra : 1) + `[${acorde}]`;
      pos = letra.length + 1;
      letra = letra + ' ';
      continue;
    }
    idx = Math.max(idx, pos);
    out += letra.slice(pos, idx) + `[${acorde}]`;
    pos = idx;
  }
  return (out + letra.slice(pos)).replace(/\s+$/, '');
}

// ---------- Renderização ----------

function esc(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Linha só de rótulo + acordes ("Intro: [Dm7] [C/D]", "Final: [G] (2x)"): os acordes vão na mesma linha do rótulo
const ROTULO_ACORDES = /^\s*(intro(du[çc][ãa]o)?|final|solo|interl[úu]dio|ponte|riff|base|passagem|vinheta|refr[ãa]o instrumental)\s*:?\s*(\(?\s*\d+\s*x\s*\)?)?[\s.:]*$/i;
export const ehLinhaRotuloAcordes = l => l.tipo === 'letra' && l.segs.some(s => s.acorde) && ROTULO_ACORDES.test(l.segs.map(s => s.texto).join(''));

// Gera HTML com acordes acima da letra; quebra de linha natural em telas estreitas
export function renderizarHTML(chordpro, { semitons = 0, bemol = false, mostrarAcordes = true } = {}) {
  const fonte = semitons || bemol ? transporChordPro(chordpro, semitons, bemol) : chordpro;
  const { linhas } = parseChordPro(fonte);
  const html = [];
  for (const l of linhas) {
    if (l.tipo === 'vazia') { html.push('<div class="l vazia"></div>'); continue; }
    if (l.tipo === 'comentario') { html.push(`<div class="l comentario">${esc(l.texto)}</div>`); continue; }
    if (l.tipo === 'acordes') {
      if (!mostrarAcordes) continue;
      html.push(`<div class="l so-acordes">${l.segs.map(s => `<b class="ac">${esc(s.acorde)}</b>`).join(' ')}</div>`);
      continue;
    }
    if (ehLinhaRotuloAcordes(l)) {
      if (!mostrarAcordes) continue;
      html.push(`<div class="l so-acordes">${l.segs.map(s => (s.acorde ? `<b class="ac">${esc(s.acorde)}</b>` + (s.texto ? '' : ' ') : '') + esc(s.texto)).join('').trim()}</div>`);
      continue;
    }
    const refrao = !!l.refrao;
    const temAcorde = mostrarAcordes && l.segs.some(s => s.acorde);
    const partes = l.segs.map(s => {
      const t = esc(s.texto) || '&nbsp;';
      if (!temAcorde) return `<span class="seg"><span class="tx">${t}</span></span>`;
      const ac = s.acorde ? esc(s.acorde) : '&nbsp;';
      return `<span class="seg"><b class="ac">${ac}</b><span class="tx">${t}</span></span>`;
    });
    html.push(`<div class="l${temAcorde ? ' com-acordes' : ''}${refrao ? ' refrao' : ''}">${partes.join('')}</div>`);
  }
  return html.join('\n');
}

// Linhas da cifra no formato acordes-em-cima-da-letra, já com o tipo de cada uma
// ({ tipo: 'acordes' | 'letra' | 'vazia' | 'comentario', texto }); usado no texto, no PDF e em cópias
export function linhasCifra(chordpro, { semitons = 0, bemol = false, mostrarAcordes = true } = {}) {
  const fonte = semitons || bemol ? transporChordPro(chordpro, semitons, bemol) : chordpro;
  const { linhas } = parseChordPro(fonte);
  const out = [];
  for (const l of linhas) {
    if (l.tipo === 'vazia') { out.push({ tipo: 'vazia', texto: '' }); continue; }
    if (l.tipo === 'comentario') { out.push({ tipo: 'comentario', texto: l.texto }); continue; }
    if (l.tipo === 'acordes') { if (mostrarAcordes) out.push({ tipo: 'acordes', texto: l.segs.map(s => s.acorde).join('  ') }); continue; }
    if (ehLinhaRotuloAcordes(l)) {
      if (mostrarAcordes) out.push({ tipo: 'acordes', texto: l.segs.map(s => (s.acorde ? s.acorde + (s.texto.startsWith(' ') ? '' : ' ') : '') + s.texto).join('').replace(/\s+/g, ' ').trim() });
      continue;
    }
    let cima = '', baixo = '';
    for (const s of l.segs) {
      if (mostrarAcordes && s.acorde) {
        if (cima.length > baixo.length) baixo += ' '.repeat(cima.length - baixo.length);
        cima += ' '.repeat(Math.max(0, baixo.length - cima.length)) + s.acorde + ' ';
      }
      baixo += s.texto;
    }
    if (mostrarAcordes && cima.trim()) out.push({ tipo: 'acordes', texto: cima.replace(/\s+$/, ''), refrao: !!l.refrao });
    out.push({ tipo: 'letra', texto: baixo.replace(/\s+$/, ''), refrao: !!l.refrao });
  }
  return out;
}

// Gera texto monoespaçado (acordes em cima da letra) para copiar ou compartilhar
export function renderizarTexto(chordpro, opcoes = {}) {
  return linhasCifra(chordpro, opcoes).map(l => l.texto).join('\n');
}

// Cifra transposta do tom original para o tom desejado (ChordPro), mantendo a grafia do tom (b ou #)
export function chordproNoTom(chordpro, tomOriginal, tomAlvo) {
  if (!chordpro || !tomOriginal || !tomAlvo || tomOriginal === tomAlvo) return chordpro || '';
  return transporChordPro(chordpro, semitonsEntre(tomOriginal, tomAlvo), preferirBemol(tomAlvo));
}

// Normaliza texto para busca: minúsculas, sem acentos, sem acordes
export function normalizar(s) {
  return (s || '').replace(/\[[^\]]*\]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
