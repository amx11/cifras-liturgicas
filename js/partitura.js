// Partitura (PDF vetorial do MuseScore/Finale) -> cifra em ChordPro.
// O texto do PDF é exato: a posição de cada caractere vem da largura real da fonte embutida.
// Dois formatos comuns no acervo:
//  - "bloco": abaixo do pentagrama há a cifra pronta (linhas de acordes sobre a letra);
//  - "pauta": só o pentagrama, com acordes acima das notas e a letra em sílabas embaixo.
import { ehAcorde, ehLinhaDeAcordes, itensParaChordPro, solfejoParaAcorde } from './cifra.js';
import { separarCabecalho } from './pdf.js';
import { conferirComPartitura } from './conferir.js';

const FONTE_MUSICA = /MScore|Leland|Bravura|Emmentaler|Petrucci|Maestro|Opus|Sonata|Finale|Jazz|Gonville|MuseJazz|Academico|Anastasia|Engraver|Broadway|Tamburo|Toccata|Kousa|Sebastian/i;
const USO_PRIVADO = /[-]/;

// larguras (em 1/1000 do corpo) por caractere, a partir da fonte embutida
function tabelaLarguras(fonte) {
  const t = new Map();
  if (!fonte?.widths) return t;
  for (const [cod, w] of Object.entries(fonte.widths)) {
    if (!w) continue;
    let u = null;
    try { u = fonte.toUnicode?.get?.(+cod); } catch { /* sem mapa */ }
    if (!u && +cod >= 32 && +cod < 0xFFFF) u = String.fromCharCode(+cod);
    if (u && u.length === 1 && !t.has(u)) t.set(u, w);
  }
  return t;
}

const semAcento = c => c.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Itens de texto de uma página com a posição exata de cada caractere (xs = borda esquerda, cs = centro)
async function itensDaPagina(pg, numero, OPS) {
  const ol = await pg.getOperatorList();           // também carrega as fontes em commonObjs
  const tc = await pg.getTextContent({ disableCombineTextItems: true });  // cada sílaba/palavra do PDF separada
  const H = pg.getViewport({ scale: 1 }).height;
  const fontes = new Map();
  const texto = [], musica = [];
  for (const it of tc.items) {
    if (!it.str) continue;
    let f = fontes.get(it.fontName);
    if (f === undefined) { try { f = pg.commonObjs.get(it.fontName); } catch { f = null; } fontes.set(it.fontName, f); }
    const y = H - it.transform[5];
    if ((f && FONTE_MUSICA.test(f.name || '')) || USO_PRIVADO.test(it.str)) { musica.push({ x: it.transform[4], y }); continue; }
    if (!it.str.trim()) continue;
    const tab = f ? (f._tabLarg ||= tabelaLarguras(f)) : new Map();
    const larg = [...it.str].map(c => tab.get(c) ?? tab.get(semAcento(c)) ?? (c === ' ' ? 250 : 500));
    const soma = larg.reduce((a, b) => a + b, 0) || 1;
    const k = it.width / soma;                       // ajusta ao tamanho real do item (espaçamento incluído)
    const xs = [], cs = [];
    let acc = it.transform[4];
    larg.forEach(w => { xs.push(acc); cs.push(acc + (w * k) / 2); acc += w * k; });
    texto.push({ str: it.str, x: it.transform[4], y, w: it.width, h: it.height || Math.abs(it.transform[3]) || 10, pagina: numero, xs, cs,
      negrito: /Bold/i.test(f?.name || '') });
  }
  // texto desenhado duas vezes no mesmo lugar (efeito de negrito): fica uma cópia só
  const unicos = [];
  for (const t of texto) if (!unicos.some(u => u.str === t.str && Math.abs(u.x - t.x) < 1.5 && Math.abs(u.y - t.y) < 1.5)) unicos.push(t);
  const desenhos = OPS ? desenhosDaPagina(ol, OPS, H) : { pautas: [], hifens: [] };
  return { texto: unicos, musica, ...desenhos };
}

// Faixas verticais ocupadas pelos pentagramas (onde há símbolos musicais), uma por sistema
function faixasDePauta(musica) {
  const ys = musica.map(m => m.y).sort((a, b) => a - b);
  const faixas = [];
  for (const y of ys) {
    const f = faixas[faixas.length - 1];
    if (f && y - f.fim < 30) f.fim = y; else faixas.push({ ini: y, fim: y });
  }
  return faixas.filter(f => f.fim - f.ini >= 0);
}

// Uma linha de texto (itens na mesma altura)
function agruparLinhas(itens) {
  const ord = [...itens].sort((a, b) => a.y - b.y || a.x - b.x);
  const linhas = [];
  for (const it of ord) {
    const l = linhas[linhas.length - 1];
    if (l && Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.4)) l.itens.push(it); else linhas.push({ y: it.y, h: it.h, itens: [it] });
  }
  for (const l of linhas) { l.itens.sort((a, b) => a.x - b.x); l.texto = l.itens.map(i => i.str).join(' '); }
  return linhas;
}

const ehLinhaAcordesItens = l => ehLinhaDeAcordes(l.texto);

// Linha que é texto da pauta, pelo conteúdo: acorde do MuseScore partido em pedaços ("B ♭", "D m", "F ♯ m"),
// ou número de compasso seguido de pedaços de acorde
function linhaDaPauta(l) {
  if (/[♭♯]/.test(l.texto)) return true;
  const toks = l.itens.map(i => i.str.trim()).filter(Boolean);
  return toks.length >= 2 && /^\d{1,3}$/.test(toks[0]) && toks.slice(1).every(t => /^([A-G]|m|\d+|sus|maj|dim|[+°ø]|\/)$/.test(t));
}

// Itens que pertencem às pautas: da linha de acordes acima da 1ª pauta até as estrofes logo abaixo da
// última (a 1ª até 25 pt, cada seguinte até 16 pt da anterior). O bloco de cifra pronto fica fora dessa faixa.
function zonasDaPauta(linhas, faixas) {
  const z = new Set();
  if (!faixas.length) return z;
  const ini = Math.min(...faixas.map(f => f.ini)) - 22, fimPauta = Math.max(...faixas.map(f => f.fim));
  let fim = fimPauta + 2;
  for (const l of linhas.filter(l => l.y > fimPauta + 2).sort((a, b) => a.y - b.y)) {
    if (l.y - fim > (fim === fimPauta + 2 ? 25 : 16)) break;
    fim = l.y;
  }
  for (const l of linhas) if (l.y >= ini && l.y <= fim) l.itens.forEach(i => z.add(i));
  return z;
}

// ---------- desenhos vetoriais: linhas do pentagrama e hífens da letra ----------
// Percorre a lista de operações da página acompanhando a matriz de transformação (save/restore/transform).
function desenhosDaPagina(ol, OPS, H) {
  const mult = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  let ctm = [1, 0, 0, 1, 0, 0];
  const pilha = [], segs = [];
  // o ponto atual continua entre operações até o caminho ser pintado (há hífens com "mover" e "linha" separados)
  const PINTA = new Set([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke, OPS.endPath]);
  let atual = null;
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i];
    if (PINTA.has(fn)) atual = null;
    else if (fn === OPS.save) pilha.push(ctm);
    else if (fn === OPS.restore) ctm = pilha.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mult(ctm, args);
    else if (fn === OPS.constructPath) {
      const [ops, coords] = args;
      if (!Array.isArray(ops)) continue;
      let k = 0;
      for (const op of ops) {
        if (op === OPS.moveTo) { atual = ap(ctm, coords[k], coords[k + 1]); k += 2; }
        else if (op === OPS.lineTo) { const p = ap(ctm, coords[k], coords[k + 1]); k += 2; if (atual) segs.push([atual, p]); atual = p; }
        else if (op === OPS.rectangle) { const [x, y, w, h] = coords.slice(k, k + 4); k += 4; const p1 = ap(ctm, x, y), p2 = ap(ctm, x + w, y + h); if (Math.abs(p2[1] - p1[1]) < 1.5) segs.push([[p1[0], (p1[1] + p2[1]) / 2], [p2[0], (p1[1] + p2[1]) / 2]]); }
        else if (op === OPS.curveTo) k += 6; else if (op === OPS.curveTo2 || op === OPS.curveTo3) k += 4;
      }
    }
  }
  const horiz = segs.map(([a, b]) => ({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y: H - (a[1] + b[1]) / 2, dy: Math.abs(a[1] - b[1]) }))
    .filter(s => s.dy < 0.6);
  // linhas do pentagrama: longas; 5 seguidas com o mesmo espaçamento = uma pauta
  const longas = horiz.filter(s => s.x1 - s.x0 > 80).sort((a, b) => a.y - b.y);
  const ys = [];
  for (const l of longas) if (!ys.length || l.y - ys[ys.length - 1] > 0.8) ys.push(l.y);
  // 5 linhas igualmente espaçadas (pode haver outras linhas longas no meio: chaves de repetição, colchetes)
  const pautas = [], usada = new Set();
  const acha = y => ys.findIndex(v => Math.abs(v - y) < 0.8);
  for (let i = 0; i < ys.length; i++) {
    if (usada.has(i)) continue;
    for (let j = i + 1; j < ys.length && ys[j] - ys[i] < 15; j++) {
      const d = ys[j] - ys[i];
      if (d < 2) continue;
      const ks = [2, 3, 4].map(k => acha(ys[i] + k * d));
      if (ks.every(k => k >= 0 && !usada.has(k))) {
        [i, j, ...ks].forEach(k => usada.add(k));
        pautas.push({ ini: ys[i], fim: ys[i] + 4 * d });
        break;
      }
    }
  }
  pautas.sort((a, b) => a.ini - b.ini);
  const hifens = horiz.filter(s => s.x1 - s.x0 >= 0.8 && s.x1 - s.x0 <= 25);
  return { pautas, hifens };
}

// ---------- formato "pauta": acordes acima das notas, sílabas embaixo ----------
// No MuseScore o acorde fica alinhado à nota, e a sílaba fica centrada na mesma nota.
let LIMITE_SILABA = 12;
export function definirLimiteSilaba(v) { LIMITE_SILABA = v; }
const SIMBOLOS = s => s.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[Δ△]/g, 'maj7').replace(/°/g, 'º');

// pedaços de um mesmo acorde ("F" "♯" "m") ficam encostados: junta
function acordesDaLinha(itens, todos = false) {
  const ord = [...itens].sort((a, b) => a.x - b.x);
  const out = [];
  for (const it of ord) {
    const u = out[out.length - 1];
    // pedaços encostados ("F" "♯" "m"), ou complemento depois do nome em português ("dó#" "m", "Ré" "7")
    const complemento = u && /^(m|M|7|m7|maj7|dim|sus\d?|[#b♯♭]|\d+)$/.test(it.str.trim()) && /(d[óo]|r[ée]|mi|f[áa]|sol|l[áa]|si)[#♯b♭]?$/i.test(u.str) && it.x - (u.x + u.w) < 8;
    if (u && (it.x - (u.x + u.w) < 1.2 || complemento)) { u.str += (complemento ? ' ' : '') + it.str.trim(); u.w = it.x + it.w - u.x; }
    else out.push({ str: it.str.trim(), x: it.x, w: it.w });
  }
  // acorde em nome de nota ("Lá", "dó# m", "Sib7") -> cifra
  const lista = out.map(a => { const t = SIMBOLOS(a.str); return { ...a, str: ehAcorde(t) ? t : (solfejoParaAcorde(a.str) || t) }; });
  return todos ? lista : lista.filter(a => ehAcorde(a.str));
}

// Sem pentagrama detectável (pauta em imagem, fonte musical antiga, partitura lida por OCR):
// cada linha de acordes vale para as linhas de letra logo abaixo dela (uma por estrofe)
export function cifraDeLinhas(linhasTexto, hifens = []) {
  const ehDeAcordes = l => { const g = acordesDaLinha(l.itens, true).filter(a => !/^\d+$/.test(a.str)); return g.length > 0 && g.filter(a => ehAcorde(a.str)).length >= g.length * 0.6; };
  const temLetra = l => l.itens.some(i => /[a-zà-ÿ]{2,}/.test(i.str));
  const estrofes = [];
  let acordes = null, yAc = -Infinity, k = 0;
  for (const l of [...linhasTexto].sort((a, b) => a.y - b.y)) {
    if (ehDeAcordes(l)) { acordes = acordesDaLinha(l.itens); yAc = l.y; k = 0; continue; }
    if (!acordes || !temLetra(l) || l.y - yAc > 110 || linhaDaPauta(l)) continue;
    (estrofes[k++] ||= []).push({ l, acordes, hifens });
  }
  return estrofes.map(seq => montarEstrofe(seq)).filter(Boolean).join('\n\n');
}

function cifraDaPauta(linhasTexto, pautas, hifens) {
  if (!pautas.length) return cifraDeLinhas(linhasTexto, hifens);
  // por estrofe (1ª linha de letra sob a pauta, 2ª linha...), a sequência de pautas
  const estrofes = [];
  pautas.forEach((f, ip) => {
    const prox = pautas[ip + 1];
    // linha de acordes: a maioria dos grupos (pedaços encostados juntados) é acorde
    const ehDeAcordes = l => { const g = acordesDaLinha(l.itens, true).filter(a => !/^\d+$/.test(a.str)); return g.length > 0 && g.filter(a => ehAcorde(a.str)).length >= g.length * 0.6; };
    const soNumeros = l => l.itens.every(i => /^[\d\s]+$/.test(i.str));   // tercinas ("3"), compassos
    // acordes: linha(s) de acordes logo acima da pauta; letra: tudo entre esta pauta e a próxima que não seja acorde
    const acima = linhasTexto.filter(l => l.y < f.ini - 1 && l.y > f.ini - 32 && ehDeAcordes(l) && !(ip > 0 && l.y < pautas[ip - 1].fim + 4));
    const acordes = acima.flatMap(l => acordesDaLinha(l.itens));
    const limite = prox ? prox.ini - 2 : f.fim + 90;
    let abaixo = linhasTexto.filter(l => l.y > f.fim + 3 && l.y < limite && !ehDeAcordes(l) && !linhaDaPauta(l) && !soNumeros(l))
      .sort((a, b) => a.y - b.y);
    {                                             // só as estrofes coladas na pauta (mais longe é outro bloco de texto)
      const fica = [];
      for (const l of abaixo) { const ant = fica.length ? fica[fica.length - 1].y : f.fim; if (l.y - ant > (fica.length ? 16 : 30)) break; fica.push(l); }
      abaixo = fica;
    }
    abaixo.forEach((l, k) => { (estrofes[k] ||= []).push({ l, acordes, hifens }); });
    if (!abaixo.length && acordes.length) (estrofes[0] ||= []).push({ l: null, acordes, hifens });
  });
  return estrofes.map(seq => montarEstrofe(seq)).filter(Boolean).join('\n\n');
}

// Vocabulário (palavras das cifras em texto do acervo) para juntar sílabas encostadas sem hífen
let VOCAB = null;
export function definirVocabulario(palavras) { VOCAB = new Set(palavras); }
export const vocabulario = () => VOCAB;
const norm = w => w.toLowerCase().normalize('NFC').replace(/[^a-zà-ÿ]/g, '');   // mantém acentos ("à"+"mar" não é "amar")

export function montarEstrofe(seq) {
  const linhas = [];
  let pendente = null;                          // palavra que continua na pauta seguinte ("Ma-" ... "ria")
  let rotulo = null;                            // número da estrofe em curso
  for (const { l, acordes, hifens } of seq) {
    if (!l) { linhas.push(acordes.map(a => `[${a.str}]`).join(' ')); continue; }
    // marca + sílaba no mesmo item ("R. A", "1. Tu", "T.: Ky"): separa, para o centro ser o da sílaba
    const sil = [];
    for (const it of l.itens.filter(it => it.str.trim() && !/^[-–_]+$/.test(it.str.trim())).sort((a, b) => a.x - b.x)) {
      const m = /^(\s*(?:\d+\.|R\.?\/?:?|T\.?:|S\.?:|Ref\.?:?|solo:)\s+)(\S.*)$/i.exec(it.str);
      if (m && it.xs) {
        const k = m[1].length, xk = it.xs[k] ?? it.x;
        sil.push({ ...it, str: m[1].trim(), w: xk - it.x - 1 });
        sil.push({ ...it, str: m[2], x: xk, w: it.x + it.w - xk, xs: it.xs.slice(k) });
      } else sil.push(it);
    }
    // número da estrofe repetido no começo de cada pauta ("1." "ri-cos"): só na primeira linha
    // (só quando repete o número da estrofe em curso; um número novo começa outra estrofe)
    const numSo = sil.length > 1 && /^(\d+)\.?$/.exec(sil[0].str.trim());
    const numJunto = !numSo && sil.length && /^(\s*(\d+)\.\s*)(\S.*)$/.exec(sil[0].str);
    const num = numSo ? numSo[1] : numJunto ? numJunto[2] : null;
    if (num && !linhas.length) rotulo = num;
    else if (num && num === rotulo) {
      if (numSo) sil.shift();
      else { const it = sil[0], k = numJunto[1].length; sil[0] = { ...it, str: numJunto[3], x: it.xs?.[k] ?? it.x, w: it.x + it.w - (it.xs?.[k] ?? it.x) }; }
    } else if (num) rotulo = num;
    // hífen: traço curto ~4 pt acima da base da letra (o prolongamento "___" fica na própria base)
    const ehHifen = h => h.y > l.y - 6.5 && h.y < l.y - 1.8;
    const hifenEntre = (a, b) => hifens.some(h => ehHifen(h) && h.x0 >= a - 1 && h.x1 <= b + 1);
    // sílabas encostadas sem hífen desenhado (o MuseScore omite o hífen quando não há espaço):
    // junta a sequência mais longa que forme uma palavra conhecida
    const ligaVocab = new Array(sil.length).fill(false);
    if (VOCAB) for (let i = 0; i < sil.length - 1; ) {
      let w = sil[i].str.trim(), melhor = -1;
      for (let j = i + 1; j < sil.length && sil[j].x - (sil[j - 1].x + sil[j - 1].w) <= 2.5 && !/[,.;:!?]$/.test(sil[j - 1].str.trim()); j++) {
        w += sil[j].str.trim();
        if (VOCAB.has(norm(w)) && w.length >= 4) melhor = j;
      }
      if (melhor > i && !VOCAB.has(norm(sil[i].str)) || melhor > i + 1) { for (let k = i; k < melhor; k++) ligaVocab[k] = true; i = melhor + 1; } else i++;
    }
    // palavra com hífen de verdade ("Salvai-nos", "alegrem-se"): sílabas juntadas que não formam palavra
    // conhecida, mas terminam num pronome oblíquo com o começo sendo palavra: mantém o hífen
    const CLITICO = /^(nos|vos|se|me|te|lhe|lhes|lo|la|los|las|no|na|o|a|os|as)$/;
    const hifenReal = new Array(sil.length).fill(false);
    let texto = '';
    const pos = [];
    sil.forEach((s, i) => {
      const fim = s.x + s.w, prox = sil[i + 1];
      const textoHifen = prox ? (/^\s*[-–]/.test(prox.str) || l.itens.some(it => /^[-–]+$/.test(it.str.trim()) && it.x >= fim - 1 && it.x + it.w <= prox.x + 1))
        : l.itens.some(it => /^[-–]+$/.test(it.str.trim()) && it.x >= fim - 1 && it.x < fim + 40);   // hífen no fim da linha
      const liga = /[-–]\s*$/.test(s.str) || textoHifen || ligaVocab[i] || (prox ? hifenEntre(fim, prox.x) : hifens.some(h => ehHifen(h) && h.x0 >= fim - 1 && h.x0 < fim + 40));
      const limpa = s.str.trim().replace(/^[-–]+\s*/, '').replace(/\s*[-–]+$/, '');
      pos.push({ ini: texto.length, c: s.x + s.w / 2, x: s.x });
      texto += limpa + (liga ? '' : ' ');
    });
    if (VOCAB) {
      // reconstrói cada palavra a partir das sílabas e verifica os pontos de junção
      let ini = 0;
      for (let i = 0; i < sil.length; i++) {
        const acaba = i === sil.length - 1 || texto[pos[i + 1].ini - 1] === ' ';
        if (!acaba) continue;
        if (i > ini) {
          const palavra = texto.slice(pos[ini].ini, (pos[i + 1]?.ini ?? texto.length)).trim();
          if (!VOCAB.has(norm(palavra))) {
            for (let k = i; k > ini; k--) {
              const esq = texto.slice(pos[ini].ini, pos[k].ini), dir = texto.slice(pos[k].ini, (pos[i + 1]?.ini ?? texto.length)).trim();
              if (CLITICO.test(norm(dir)) && VOCAB.has(norm(esq))) { hifenReal[k] = true; break; }
            }
          }
        }
        ini = i + 1;
      }
      // insere os hífens (de trás para frente, ajustando as posições)
      for (let k = sil.length - 1; k > 0; k--) if (hifenReal[k]) {
        const at = pos[k].ini;
        texto = texto.slice(0, at) + '-' + texto.slice(at);
        for (let j = k; j < pos.length; j++) pos[j].ini++;
      }
    }
    // acorde -> sílaba da mesma nota (o acorde começa na nota; a sílaba é centrada nela)
    const marcas = [];
    for (const a of acordes) {
      const nota = a.x + 3.3;
      // a sílaba da própria nota (centro a até 5 pt); se a nota não tem sílaba (prolongamento "___" ou pausa),
      // o acorde vale para a próxima sílaba cantada, como se escreve na cifra
      let m = null, d = Infinity;
      for (const p of pos) { const dd = Math.abs(p.c - nota); if (dd < d) { d = dd; m = p; } }
      if (m && d > LIMITE_SILABA) m = pos.find(p => p.c > nota) || m;
      if (m) marcas.push({ idx: m.ini, a: a.str, x: a.x });
    }
    let out = '', ate = 0;
    for (const mk of marcas.sort((a, b) => a.idx - b.idx || a.x - b.x)) { out += texto.slice(ate, mk.idx) + `[${mk.a}]`; ate = mk.idx; }
    let linha = (out + texto.slice(ate)).replace(/_/g, ' ').replace(/([,;!?])(?=[A-Za-zÀ-ÿ\[])/g, '$1 ');   // elisão "_" e "Maria,aos" // "Maria,aos" (elisão) -> "Maria, aos"
    if (pendente) { linha = pendente + linha.replace(/^\s+/, ''); pendente = null; }
    // termina no meio da palavra: o pedaço vai para o começo da próxima linha
    if (!/\s$/.test(linha) && texto.length && pos.length) {
      const ult = linha.lastIndexOf(' ');
      pendente = linha.slice(ult + 1); linha = linha.slice(0, ult + 1);
    }
    linhas.push(linha.trim());
  }
  if (pendente) linhas.push(pendente);
  return linhas.filter(Boolean).join('\n');
}

// a leitura da pauta cobre a do bloco? (quase todas as palavras e acordes do bloco aparecem nela)
const palavrasDe = cp => cp.replace(/\[[^\]]*\]/g, '').toLowerCase().normalize('NFC').split(/[^a-zà-ÿ]+/).filter(w => w.length > 1);
function cobre(pauta, bloco) {
  const conta = l => l.reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map());
  const P = conta(palavrasDe(pauta)), B = palavrasDe(bloco);
  if (!B.length) return false;
  let achou = 0;
  for (const w of B) if (P.get(w) > 0) { achou++; P.set(w, P.get(w) - 1); }
  const acP = (pauta.match(/\[/g) || []).length, acB = (bloco.match(/\[/g) || []).length;
  return achou / B.length >= 0.9 && acP >= acB * 0.8;
}

// Itens já com posição (ex.: OCR de partitura escaneada), página a página -> cifra pelo modo sem pentagrama
export function cifraDeItens(itens, pautas = []) {
  const paginas = [...new Set(itens.map(i => i.pagina))].sort((a, b) => a - b);
  const corpo = paginas.map(p => cifraDaPauta(agruparLinhas(itens.filter(i => i.pagina === p)), pautas.filter(f => f.pagina === p), [])).filter(Boolean).join('\n\n');
  const r = separarCabecalho(corpo);
  return { ...r, formato: 'pauta-ocr', duvidas: [] };
}

// ---------- principal ----------
// opcoes.forcar: 'pauta' ou 'bloco' (para comparar as duas leituras da mesma música)
export async function partituraParaCifra(pdfjsLib, dados, opcoes = {}) {
  const doc = await pdfjsLib.getDocument({ data: dados, isEvalSupported: false, fontExtraProperties: true, verbosity: 0 }).promise;
  const todos = [], porPagina = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const { texto, musica, pautas, hifens } = await itensDaPagina(await doc.getPage(n), n, pdfjsLib.OPS);
    const faixas = pautas.length ? pautas : faixasDePauta(musica);
    porPagina.push({ texto, faixas, pautas: faixas, hifens });
    todos.push(...texto);
  }
  await doc.destroy();
  // Bloco de cifra: linhas que não pertencem a nenhuma pauta (acordes logo acima, estrofes logo abaixo)
  const bloco = porPagina.flatMap(p => {
    const linhas = agruparLinhas(p.texto);
    const z = zonasDaPauta(linhas, p.faixas);
    for (const l of linhas) if (linhaDaPauta(l)) l.itens.forEach(i => z.add(i));
    return p.texto.filter(it => !z.has(it));
  });
  const linhasBloco = agruparLinhas(bloco);
  const paresNoBloco = linhasBloco.filter((l, i) => ehLinhaAcordesItens(l) && linhasBloco[i + 1] && !ehLinhaAcordesItens(linhasBloco[i + 1])).length;
  let corpo, formato, conferencia = null;
  const daPauta = () => porPagina.map(p => cifraDaPauta(agruparLinhas(p.texto), p.pautas, p.hifens)).filter(Boolean).join('\n\n');
  if (opcoes.forcar === 'pauta') { formato = 'pauta'; corpo = daPauta(); }
  else if (opcoes.forcar === 'bloco' || paresNoBloco >= 2) {
    const info = {};
    const doBloco = itensParaChordPro(bloco, info);
    // a pauta é a referência musical (acorde sobre a nota); o bloco é texto posicionado com espaços e às vezes
    // desloca o acorde uma sílaba. Usa a pauta quando ela cobre a letra do bloco e tem os acordes.
    const pauta = opcoes.forcar === 'bloco' ? '' : daPauta();
    formato = 'bloco'; corpo = doBloco; var incertos = info.incertos || [];
    // texto do bloco (digitado por uma pessoa) + sílaba exata de cada acorde pela pauta
    if (pauta && (pauta.match(/\[/g) || []).length >= 5) {
      const c = conferirComPartitura(doBloco, pauta);
      if (c.comparados >= 5) {
        corpo = c.chordpro; formato = 'bloco+pauta'; conferencia = { comparados: c.comparados, movidos: c.movidos };
        // dúvidas de posição que a pauta confirmou deixam de ser dúvida
        incertos = incertos.filter(t => !c.chordpro.includes((t.trecho || t)));
      }
    }
  } else { formato = 'pauta'; corpo = daPauta(); }
  const r = separarCabecalho(corpo);
  r.cabecalho = r.cabecalho.filter(l => !/^[=♩\s\d.,]+$/.test(l));   // andamento ("= 50") e números soltos
  return { ...r, formato, conferencia, temPauta: porPagina.some(p => p.pautas.length), duvidas: (incertos || []).map(t => 'posição ' + (t.trecho || t)) };
}
