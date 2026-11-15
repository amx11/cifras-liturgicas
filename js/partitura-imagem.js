// Partitura em IMAGEM (escaneada, foto, ou PDF sem texto) -> cifra.
// 1) acha os pentagramas (5 fileiras escuras igualmente espaçadas);
// 2) lê os acordes na faixa acima de cada pauta e as sílabas na faixa abaixo (OCR só dessas faixas,
//    para as notas não atrapalharem); 3) agrupa as sílabas por estrofe pela altura; 4) cada acorde vai
// para a sílaba mais próxima (no mesmo princípio da partitura em texto: acorde e sílaba na mesma nota).
// O OCR é injetado (Tesseract no navegador ou no Node): ler(canvas, 'acordes'|'letra') -> palavras.
import { ehAcorde } from './cifra.js';
import { corrigirAcorde, aproximarAcorde } from './ocr-cifra.js';
import { montarEstrofe, vocabulario } from './partitura.js';
import { separarCabecalho } from './pdf.js';

// pentagramas: fileiras com tinta em boa parte da largura; 5 linhas igualmente espaçadas
export function acharPautas(img) {
  const { data: p, width: w, height: h } = img;
  const escura = y => { let n = 0; for (let x = 0; x < w; x++) if (p[(y * w + x) * 4] < 140) n++; return n > w * 0.35; };
  const linhas = [];
  for (let y = 0; y < h; y++) if (escura(y)) { const u = linhas[linhas.length - 1]; if (u && y - u.fim <= 2) u.fim = y; else linhas.push({ ini: y, fim: y }); }
  const ys = linhas.map(l => (l.ini + l.fim) / 2);
  const pautas = [], usada = new Set();
  for (let i = 0; i < ys.length; i++) {
    if (usada.has(i)) continue;
    for (let j = i + 1; j < ys.length && ys[j] - ys[i] < 70; j++) {
      const d = ys[j] - ys[i];
      if (d < 6) continue;
      const ks = [2, 3, 4].map(k => ys.findIndex(v => Math.abs(v - (ys[i] + k * d)) <= Math.max(2, d * 0.12)));
      if (ks.every(k => k >= 0 && !usada.has(k))) {
        [i, j, ...ks].forEach(k => usada.add(k));
        // começo da pauta (onde a linha de cima começa): antes disso fica a clave/compasso, não acordes
        const y = Math.round(ys[i]); let x0 = 0;
        while (x0 < w && p[(y * w + x0) * 4] >= 140) x0++;
        pautas.push({ ini: ys[i], fim: ys[i] + 4 * d, d, x0 }); break;
      }
    }
  }
  return pautas.sort((a, b) => a.ini - b.ini);
}

// palavras do OCR -> linhas (estrofes): a palavra entra na linha cuja faixa de altura ela ocupa
// (sobreposição vertical; "Se", "nhor," com descendente e o "-" pequeno ficam na mesma linha)
function agruparPorAltura(palavras) {
  const linhas = [];
  for (const p of [...palavras].sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0))) {     // as mais altas definem as linhas
    const h = p.y1 - p.y0;
    let melhor = null, mv = 0;
    for (const l of linhas) {
      const sob = Math.min(p.y1, l.y1) - Math.max(p.y0, l.y0);
      const v = sob / Math.min(h, l.y1 - l.y0);
      if (v > mv) { mv = v; melhor = l; }
    }
    if (melhor && mv >= 0.5) melhor.itens.push(p);
    else linhas.push({ y0: p.y0, y1: p.y1, itens: [p] });
  }
  return linhas.map(l => ({ y: (l.y0 + l.y1) / 2, itens: l.itens.sort((a, b) => a.x0 - b.x0) })).sort((a, b) => a.y - b.y);
}

// Correção de palavras lidas pelo OCR com o vocabulário do acervo, sem mexer na posição dos acordes:
//  - uma letra trocada ("aleluja" -> "aleluia"): só se houver um único candidato no vocabulário;
//  - palavras coladas ("quemmemandou" -> "quem me mandou"): divide em palavras existentes.
const norm = w => w.toLowerCase().normalize('NFC');
function candidatoUmaLetra(w, V) {
  const n = norm(w); let achou = null;
  for (let i = 0; i < n.length; i++) for (const c of 'abcdefghijlmnopqrstuvxzáéíóúâêôãõàç') {
    if (c === n[i]) continue;
    const t = n.slice(0, i) + c + n.slice(i + 1);
    if (V.has(t)) { if (achou && achou !== t) return null; achou = t; }
  }
  return achou;
}
function dividir(w, V) {
  const n = norm(w), CURTAS = new Set(['a', 'e', 'o', 'é', 'à', 'ó']);
  const melhor = new Array(n.length + 1).fill(null); melhor[0] = [];
  for (let i = 0; i < n.length; i++) if (melhor[i]) for (let j = i + 1; j <= n.length; j++) {
    const p = n.slice(i, j);
    if (!(V.has(p) && (p.length >= 2 || CURTAS.has(p)))) continue;
    if (!melhor[j] || melhor[j].length > melhor[i].length + 1) melhor[j] = [...melhor[i], j];
  }
  return melhor[n.length] && melhor[n.length].length >= 2 && melhor[n.length].length <= 4 ? melhor[n.length].slice(0, -1) : null;
}
export function corrigirPalavras(chordpro) {
  const V = vocabulario();
  if (!V) return chordpro;
  return chordpro.split('\n').map(linha => {
    let txt = ''; const acs = [];
    for (const m of linha.matchAll(/\[([^\]]*)\]|([^[]+)/g)) { if (m[1] !== undefined) acs.push({ pos: txt.length, nome: m[1] }); else txt += m[2]; }
    const ins = [];                                    // posições onde entra espaço
    txt = txt.replace(/[A-Za-zÀ-ÿ]{3,}/g, (w, off) => {
      if (V.has(norm(w))) return w;
      const c = candidatoUmaLetra(w, V);
      if (c) return (w[0] === w[0].toUpperCase() ? c[0].toUpperCase() : c[0]) + c.slice(1);
      const cortes = dividir(w, V);
      if (cortes) cortes.forEach(k => ins.push(off + k));
      return w;
    });
    for (const k of ins.sort((a, b) => b - a)) { txt = txt.slice(0, k) + ' ' + txt.slice(k); for (const a of acs) if (a.pos >= k) a.pos++; }
    let out = '', ate = 0;
    for (const a of acs.sort((x, y) => x.pos - y.pos)) { out += txt.slice(ate, a.pos) + `[${a.nome}]`; ate = a.pos; }
    return out + txt.slice(ate);
  }).join('\n');
}

let LIM_PRI = 99, LIM_SEG = 99;
export function limitesEstrofe(a, b) { LIM_PRI = a; LIM_SEG = b; }
const ehSilaba = s => /^[\d.]*[A-Za-zÀ-ÿ]+[A-Za-zÀ-ÿ'’,.;:!?-]*$|^[-–]$|^[-–][A-Za-zÀ-ÿ]+[,.;:!?]?$|^\d+\.$/.test(s);

// hífen desenhado entre duas sílabas: tracinho escuro horizontal na altura do meio das letras
function hifenEntre(img, a, b) {
  const { data: p, width: w } = img;
  const x0 = Math.round(a.x1 + 1), x1 = Math.round(b.x0 - 1);
  if (x1 - x0 < 3) return false;
  const yc = Math.round((Math.min(a.y0, b.y0) + Math.max(a.y1, b.y1)) / 2), hh = Math.max(2, Math.round((a.y1 - a.y0) * 0.25));
  for (let y = yc - hh; y <= yc + hh; y++) {
    let corrida = 0;
    for (let x = x0; x <= x1; x++) { if (p[(y * w + x) * 4] < 140) { if (++corrida >= Math.max(4, (a.y1 - a.y0) * 0.25)) return true; } else corrida = 0; }
  }
  return false;
}

// canvas: página (com getContext/getImageData); ler(canvasFaixa, tipo) -> [{texto, conf, x0, x1, y0, y1, xs:[], xe:[]}]
// (coordenadas relativas à faixa); criarCanvas(w, h): cria um canvas (navegador ou @napi-rs/canvas)
export async function lerPartituraImagem(paginas, ler, criarCanvas) {
  const estrofesTodas = [];
  let somaConf = 0, nConf = 0;                     // confiança média do OCR nas palavras da letra
  for (const cv of paginas) {
    const ctx = cv.getContext('2d');
    const k = 595 / cv.width;                     // pixels -> pontos de uma folha A4 (as regras de posição são em pontos)
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const pautas = acharPautas(img);
    const faixa = (topo, altura) => { const c = criarCanvas(cv.width, altura); c.getContext('2d').drawImage(cv, 0, topo, cv.width, altura, 0, 0, cv.width, altura); return c; };
    // texto de cada espaço entre pautas (e acima da primeira), em coordenadas da página
    const lerRegiao = async (topo, base) => {
      if (base - topo < 10) return [];
      return (await ler(faixa(topo, base - topo), 'letra')).map(w => ({ ...w, y0: w.y0 + topo, y1: w.y1 + topo }));
    };
    const ehLinhaAcordes = l => { const ac = l.itens.filter(w => ehAcorde(corrigirAcorde(w.texto))).length; return ac > 0 && ac >= l.itens.length * 0.7; };
    if (!pautas.length) continue;                  // página sem pauta (capa, texto)
    const acordesDe = pautas.map(() => []), letraDe = pautas.map(() => []);
    for (let i = 0; i <= pautas.length; i++) {
      const f = pautas[i - 1], prox = pautas[i];
      const topo = Math.round(f ? f.fim + 0.5 * f.d : Math.max(0, prox.ini - 9 * prox.d)), base = Math.round(prox ? prox.ini - 0.3 * prox.d : Math.min(cv.height, f.fim + 16 * f.d));
      const lidas = await lerRegiao(topo, base);
      // confiança do OCR em todas as palavras com letras da região (antes de filtrar): mede a legibilidade da imagem
      if (f) for (const w of lidas) if (/[A-Za-zÀ-ÿ]{2,}/.test(w.texto) && !ehAcorde(corrigirAcorde(w.texto))) { somaConf += w.conf; nConf++; }
      const palavras = lidas.filter(w => w.conf >= 40);
      const linhas = agruparPorAltura(palavras);
      // linhas de letra são da pauta de cima; os acordes da pauta de baixo ficam entre a última linha de letra e ela
      let fundoLetra = topo;
      linhas.forEach((l, j) => {
        if (!f || ehLinhaAcordes(l)) return;
        const sil = l.itens.filter(w => w.conf >= 45 && ehSilaba(w.texto));
        // linha de letra de verdade: pelo menos 2 sílabas legíveis com boa confiança (ligaduras e marcas viram lixo)
        const boas = sil.filter(w => w.conf >= 70 && /[A-Za-zÀ-ÿ]{2,}/.test(w.texto)).length;
        if (boas >= 2 && boas >= l.itens.length * 0.4) { letraDe[i - 1].push({ y: l.c ?? l.y, itens: sil }); fundoLetra = Math.max(fundoLetra, ...sil.map(w => w.y1)); }
      });
      // acordes: leitura dedicada (alfabeto de acordes, em bloco) só da faixa logo acima da pauta
      if (prox) {
        const ini = Math.round(Math.max(fundoLetra + 2, prox.ini - 7 * prox.d)), fim = Math.round(prox.ini - 0.3 * prox.d);
        if (fim - ini > prox.d * 0.8) for (const w of await ler(faixa(ini, fim - ini), 'acordes')) {
          // o "♯" desenhado na partitura é lido como "li", "l", "I", "1", "f", "t", "H" logo depois da nota ("Clim" = C#m)
          const t = w.texto.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/^([A-G])(?:li|il|ll|l|I|1|f|t|H|¥|£)(?=m|7|9|6|4|$|\/|sus|dim|º|°|\()/, '$1#');
          let c = corrigirAcorde(t);
          // sustenido/bemol desenhado como símbolo musical vira outra coisa no OCR ("F4m", "Fim", "C¥m"): acorde válido mais próximo
          if (!ehAcorde(c) && /^[A-G]/.test(t) && t.length <= 7) c = aproximarAcorde(t.replace(/[^A-Za-z0-9#/()º°+-]/g, '#'))?.acorde || c;
          if (w.conf >= 15 && ehAcorde(c) && w.x0 > prox.x0 + 3.5 * prox.d) acordesDe[i].push({ str: c, x: (w.xs?.[0] ?? w.x0) * k, w: (w.x1 - w.x0) * k });
        }
      }
    }
    const estrofes = [];
    pautas.forEach((f, i) => {
      // só as estrofes coladas na pauta (texto mais longe é outro bloco: cifra digitada, observações)
      const todas = letraDe[i].sort((a, b) => a.y - b.y), linhas = [];
      for (const l of todas) { const ant = linhas.length ? linhas[linhas.length - 1].y : f.fim; if (l.y - ant > (linhas.length ? LIM_SEG : LIM_PRI) * f.d) break; linhas.push(l); }
      const acordes = acordesDe[i];
      // token com várias sílabas ("ri-e", "pie-da"): divide no hífen, cada sílaba com sua posição (o acorde vai pela sílaba)
      const dividir = l => ({ ...l, itens: l.itens.flatMap(w => {
        if (!w.xs || w.xs.length !== w.texto.length || !/[A-Za-zÀ-ÿ][-–][A-Za-zÀ-ÿ]/.test(w.texto)) return [w];
        const partes = [], re = /[^-–]+[-–]?/g;
        let m;
        while ((m = re.exec(w.texto))) {
          const a = m.index, b = m.index + m[0].length;
          if (/^(nos|vos|se|me|te|lhe|lhes|lo|la|los|las)\b/i.test(m[0]) && partes.length) { const u = partes[partes.length - 1]; u.texto += m[0]; u.x1 = w.xe[b - 1]; u.xs.push(...w.xs.slice(a, b)); u.xe.push(...w.xe.slice(a, b)); continue; }
          partes.push({ ...w, texto: m[0], x0: w.xs[a], x1: w.xe[b - 1], xs: w.xs.slice(a, b), xe: w.xe.slice(a, b) });
        }
        return partes;
      }) });
      const itens = l0 => { const l = dividir(l0); return l.itens.map((w, j) => {
        const prox = l.itens[j + 1];
        const liga = prox && !/[-–]$/.test(w.texto) && !/^[-–]/.test(prox.texto) && hifenEntre(img, w, prox);
        // hífen dentro do token ("pie-da", "co-nhe-ceis") separa sílabas: some; fica só antes de pronome ("Salvai-nos")
        const t = w.texto.replace(/([A-Za-zÀ-ÿ])[-–](?=[A-Za-zÀ-ÿ])/g, (m, a, o, str) => /^(nos|vos|se|me|te|lhe|lhes|lo|la|los|las|o|a|os|as)\b/i.test(str.slice(o + 2)) ? m : a);
        return { str: t + (liga ? '-' : ''), x: w.x0 * k, w: (w.x1 - w.x0) * k, xs: w.xs?.map(x => x * k), cs: w.xs?.map((x, q) => (x + (w.xe?.[q] ?? x)) / 2 * k) };
      }); };
      linhas.forEach((l, e) => (estrofes[e] ||= []).push({ l: { y: l.y * k, itens: itens(l) }, acordes, hifens: [] }));
      if (!linhas.length && acordes.length) (estrofes[0] ||= []).push({ l: null, acordes, hifens: [] });
    });
    estrofesTodas.push(...estrofes.map(seq => montarEstrofe(seq)).filter(Boolean));
  }
  const r = separarCabecalho(corrigirPalavras(estrofesTodas.join('\n\n')));
  return { ...r, formato: 'imagem', confianca: nConf ? Math.round(somaConf / nConf) : 0 };
}
