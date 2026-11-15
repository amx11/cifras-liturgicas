// Lógica do OCR de cifras (compartilhada pelo app e pela ferramenta tools/ocr-escaneadas.mjs):
// corrige leituras típicas de acordes, relê os duvidosos e monta o ChordPro pela posição de cada letra.
import { itensParaChordPro, ehAcorde } from './cifra.js';
import { separarCabecalho } from './pdf.js';

// ---------- Correções típicas de OCR em acordes ----------
export const CHARS_ACORDE = 'ABCDEFGmajdisuM#b0123456789/()+-º°';
export function corrigirAcorde(t) {
  let s = t.replace(/[|!lI.,;:'"`]$/, '').replace(/^[|!'"`]/, '');
  s = s.replace(/^([A-G])(?:iHt|iH|Ht|it|tt|ff|H|Á|À|#|i(?=m|7|$|\/))/, '$1#') // "#" itálico lido como H, iH, Á, i...
    .replace(/^([A-G])\1(?![a-z#])/, '$1')         // "BB" -> "B" (letra dobrada)
    .replace(/^([A-G])[c]/, '$1')            // "Cc" -> "C" (serifa lida como letra extra)
    .replace(/^([A-G][#b]?)rn/, '$1m')          // "Arn" -> "Am"
    .replace(/^([A-G][#b]?)M(?![a-z])/, '$1m')    // "BM" -> "Bm" (maior não se escreve "M" logo após a nota; "7M" continua)
    .replace(/^([A-G][#b]?)m([0-9])O$/, '$1m$20')
    .replace(/(\d)O\b/, '$10').replace(/°/g, 'º')
    .replace(/\/([A-G])(?:iH|H|it|tt)$/, '/$1#');   // baixo "D/FH" -> "D/F#"
  return s;
}

export const parecido = t => /^[A-G]/.test(t) && t.length <= 8;

// Vocabulário de acordes usados em cifras litúrgicas, para aproximar leituras quase certas
const RAIZES = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
const SUFIXOS = ['', 'm', '7', 'm7', 'maj7', '7M', '6', 'm6', '9', 'm9', 'add9', 'sus4', 'sus2', '7sus4', '4', '7/9', 'dim', 'º', '7+', '5+', 'aug', 'm7(b5)', 'm7b5', '(9)', 'm(9)', '7(9)', '7(4)', '6(9)', 'm(7)'];
const VOCAB = new Set();
for (const r of RAIZES) for (const s of SUFIXOS) { VOCAB.add(r + s); for (const b of RAIZES) VOCAB.add(r + s + '/' + b); }
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Leituras típicas erradas de "#": "it", "H", "4", "tt"
const VARIANTES = t => [t, t.replace(/it|tt|H|ff/g, '#'), t.replace(/^([A-G])4/, '$1#'), t.replace(/\s+/g, '')];
export function aproximarAcorde(t) {
  for (const v of VARIANTES(corrigirAcorde(t))) if (ehAcorde(v)) return { acorde: v, certo: v === t || corrigirAcorde(t) === v };
  if (!/^[A-G]/.test(t) || t.length > 9) return null;
  let melhor = null, dm = 9;
  for (const v of VARIANTES(corrigirAcorde(t))) for (const c of VOCAB) {
    if (c[0] !== v[0] || Math.abs(c.length - v.length) > 2) continue;
    const dd = distancia(v, c);
    if (dd < dm) { dm = dd; melhor = c; }
  }
  return melhor && dm <= Math.max(1, Math.floor(t.length / 3)) ? { acorde: melhor, certo: false } : null;
}

// "BmE7" -> ["Bm","E7"]; "Cm(Dm)" -> ["Cm","(Dm)"]: menor número de pedaços, todos acordes válidos
export function separarColados(bruto) {
  // serifa do C lida como "c" ("cCcG7CcC" -> "CG7C")
  let t = bruto.replace(/c(?=C)|(?<=C)c(?![a-z])/g, '');
  if (t !== bruto) t = t.replace(/C{2,}(?![#b])/g, 'C');  // "CcC" é um C só (serifa), mas "D D" legítimo fica

  const n = t.length, melhor = new Array(n + 1).fill(null);
  melhor[0] = { p: [], sujeira: 0 };
  const melhorQue = (a, b) => !b || a.sujeira < b.sujeira || (a.sujeira === b.sujeira && a.p.length < b.p.length);
  for (let i = 0; i < n; i++) {
    if (!melhor[i]) continue;
    if (/\d/.test(t[i]) && i > 0) {                 // um dígito solto entre dois acordes: sujeira
      const c = { p: melhor[i].p, sujeira: melhor[i].sujeira + 1 };
      if (melhorQue(c, melhor[i + 1])) melhor[i + 1] = c;
    }
    if (!/[A-G(]/.test(t[i])) continue;
    for (let j = i + 1; j <= n; j++) {
      const p = t.slice(i, j);
      if (!ehAcorde(p)) continue;
      const c = { p: [...melhor[i].p, p], sujeira: melhor[i].sujeira };
      if (melhorQue(c, melhor[j])) melhor[j] = c;
    }
  }
  const r = melhor[n];
  if (!r || r.p.length < 2 || r.sujeira > 1) return null;
  return r.p.join('').length === bruto.length ? r.p : Object.assign(r.p, { limpo: true });
}

// ---------- Resultado do Tesseract -> linhas com posição de cada letra ----------
export function linhasDoResultado(data) {
  const out = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) {
    const palavras = l.words.filter(w => w.text.trim()).map(w => ({
      texto: w.text, conf: w.confidence, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1,
      xs: w.symbols.map(s => s.bbox.x0), xe: w.symbols.map(s => s.bbox.x1),
    }));
    if (palavras.length) out.push({ y0: l.bbox.y0, y1: l.bbox.y1, x0: l.bbox.x0, x1: l.bbox.x1, palavras });
  }
  return out;
}

// Linhas que parecem de acordes: relê sozinhos os tokens duvidosos (inválidos ou de baixa confiança).
// `lerRetangulo(ret)` faz o OCR só daquele pedaço com o leitor de acordes e devolve as palavras.
export async function relerDuvidosos(linhas, lerRetangulo, progresso) {
  const alvos = [];
  for (const l of linhas) {
    const toks = l.palavras.map(w => corrigirAcorde(w.texto));
    if (toks.filter(parecido).length / toks.length < 0.5 || !toks.every(t => t.length <= 10)) continue;
    for (const w of l.palavras) if (!(ehAcorde(corrigirAcorde(w.texto)) && w.conf >= 75)) alvos.push(w);
  }
  for (let i = 0; i < alvos.length; i++) {
    const w = alvos[i];
    progresso?.(i, alvos.length);
    const pad = Math.round((w.y1 - w.y0) * 0.4);
    const ret = { left: Math.max(0, w.x0 - pad), top: Math.max(0, w.y0 - pad), width: w.x1 - w.x0 + 2 * pad, height: w.y1 - w.y0 + 2 * pad };
    const p2 = await lerRetangulo(ret);
    if (p2.length) { w.relido = p2.map(x => x.texto).join(' '); w.relidoConf = Math.min(...p2.map(x => x.conf)); }
  }
}

// ---------- OCR -> ChordPro ----------
// opcoes.foto: leitura de foto (menos precisa): marca como dúvida todo acorde entre duas sílabas
export function paraChordPro(ocr, ESCALA = 300 / 72, opcoes = {}) {
  const itens = [];
  const duvidas = [];
  let totalPal = 0, palOk = 0;
  const descartadas = [];
  const locais = [];
  const anotar = (d, w, l, ip) => locais.push({ d, p: ip + 1, x: Math.round(w.x0 / ESCALA), y: Math.round(l.y1 / ESCALA) });
  let linhasTexto = 0, linhasDescartadas = 0;
  let confs = [];
  ocr.paginas.forEach((pg, ip) => {
    // altura típica de linha na página (linhas só de acordes são mais baixas e enganariam o agrupamento)
    const alturas = pg.linhas.map(l => l.y1 - l.y0).sort((a, b) => a - b);
    const hTipica = (alturas[Math.floor(alturas.length / 2)] || 40) / ESCALA;
    // espaço típico entre letras vizinhas (fonte monoespaçada da página)
    const passos = pg.linhas.flatMap(l => l.palavras.flatMap(w => w.xs.slice(1).map((x, k) => x - w.xs[k]))).filter(d => d > 3).sort((a, b) => a - b);
    const passo = passos[Math.floor(passos.length / 2)] || 30;
    // largura típica de uma letra (para letras que o OCR grudou numa caixa só, comum em foto desfocada)
    const larguras = pg.linhas.flatMap(l => l.palavras.flatMap(w => (w.xe || []).map((x, k) => x - w.xs[k]))).filter(d => d > 2).sort((a, b) => a - b);
    const larguraLetra = larguras[Math.floor(larguras.length / 2)] || passo * 0.8;
    for (const l of pg.linhas) {
      const y = l.y1 / ESCALA, h = hTipica;
      const hLinha = l.y1 - l.y0;
      // Linha de acordes: quase todos os tokens viram acorde válido (exato ou por aproximação)
      const extras = /^(\||\/|-+|\(?\d+x\)?|:|bis|\(|\)|\/:|:\/|\|:|:\|)$/i;
      // Acordes colados pelo OCR ("EB" = "E" e "B" afastados): separa pela distância entre as letras
            const palavras = [];
      for (const w of l.palavras) {
        const t = corrigirAcorde(w.texto);
        if (!ehAcorde(t) && /^[A-G]/.test(w.texto) && w.xs.length === w.texto.length) {
          const pedacos = [];
          let ini = 0;
          for (let k = 1; k < w.texto.length; k++) {
            if (/[A-G]/.test(w.texto[k]) && w.texto[k - 1] !== '/' && w.xs[k] - w.xs[k - 1] > passo * 1.5) { pedacos.push([ini, k]); ini = k; }
          }
          pedacos.push([ini, w.texto.length]);
          if (pedacos.length > 1 && pedacos.every(([a, b]) => aproximarAcorde(w.texto.slice(a, b)))) {
            for (const [a, b] of pedacos) palavras.push({ ...w, texto: w.texto.slice(a, b), x0: w.xs[a], x1: Math.min(w.xs[b - 1] + passo, b < w.xs.length ? w.xs[b] - passo * 0.7 : w.x1), xs: w.xs.slice(a, b), xe: w.xe?.slice(a, b), relido: null });
            continue;
          }
        }
        // Acordes colados sem espaço ("BmE7", "GD7G", "Cm(Dm)"): divide em acordes válidos pela letra exata
        const relidoUnico = w.relido && ehAcorde(corrigirAcorde(w.relido.replace(/\s+/g, '')));
        // marcas de repetição grudadas: "/:D" "Em/D:/"
        const rep = /^(\/:|\|:)?(.*?)(:\/|:\|)?$/.exec(w.texto);
        const miolo = rep[2];
        const partes = !ehAcorde(t) && !relidoUnico && w.xs.length === w.texto.length && miolo
          ? (ehAcorde(miolo) ? [miolo] : separarColados(miolo)) : null;
        if (partes && (partes.length > 1 || rep[1] || rep[3])) {
          const off = (rep[1] || '').length;
          const fatia = (a, b, texto, extra) => ({ ...w, texto, x0: w.xs[a], x1: w.xe ? w.xe[b - 1] : w.xs[b - 1] + passo, xs: w.xs.slice(a, b), xe: w.xe?.slice(a, b), relido: null, ...extra });
          if (rep[1]) palavras.push(fatia(0, off, rep[1], { extraRep: true }));
          // posição de cada pedaço: procura a letra-raiz no texto original, em ordem
          let pos = off;
          partes.forEach((pt, i) => {
            const k = miolo.indexOf(pt[0] === '(' ? '(' : pt[0], pos - off);
            const a = off + (k >= 0 ? k : pos - off);
            pos = a + (partes.limpo ? 1 : pt.length);
            const b = Math.min(a + pt.length, w.texto.length - (rep[3] || '').length);
            palavras.push({ ...fatia(a, b, pt), xs: w.xs.slice(a, a + pt.length), xe: w.xe?.slice(a, a + pt.length),
              separado: i === 0 && (partes.length > 1 || partes.limpo) ? `${w.texto}→${partes.join(' ')}` : true });
          });
          if (rep[3]) palavras.push(fatia(w.texto.length - rep[3].length, w.texto.length, rep[3], { extraRep: true }));
          continue;
        }
        palavras.push(w);
      }
      // Extensão separada do acorde ("Bm7" "(b5)"): junta
      for (let k = 0; k < palavras.length - 1; k++) {
        const a = palavras[k], b = palavras[k + 1];
        if (/^\([#b+\-]?\d{1,2}\)$/.test(b.texto) && ehAcorde(corrigirAcorde(a.texto + b.texto)) && b.x0 - a.x1 < passo * 1.6)
          palavras.splice(k, 2, { ...a, texto: a.texto + b.texto, x1: b.x1, xs: [...a.xs, ...b.xs], xe: a.xe && b.xe ? [...a.xe, ...b.xe] : undefined, conf: Math.min(a.conf, b.conf), relido: null, juntado: true });
      }
      // Acorde partido em dois ("Bbma" "j7"): junta quando estão quase encostados e juntos formam acorde
      for (let k = 0; k < palavras.length - 1; k++) {
        const a = palavras[k], b = palavras[k + 1], junto = a.texto + b.texto;
        if (!ehAcorde(corrigirAcorde(a.texto)) && ehAcorde(corrigirAcorde(junto)) && b.x0 - a.x1 < hLinha * 0.8) {
          palavras.splice(k, 2, { ...a, texto: junto, x1: b.x1, xs: [...a.xs, ...b.xs], xe: a.xe && b.xe ? [...a.xe, ...b.xe] : undefined, conf: Math.min(a.conf, b.conf), relido: null, juntado: true });
        }
      }
      l.palavras = palavras;
      // Melhor leitura: 1ª leitura se for acorde válido e confiável; senão a releitura; senão aproximação
      const melhor = w => {
        if (w.separado) return { acorde: w.texto, certo: true };
        const a1 = ehAcorde(corrigirAcorde(w.texto)) ? corrigirAcorde(w.texto) : null;
        const r = w.relido && corrigirAcorde(w.relido.replace(/\s+/g, ''));
        const a2 = r && ehAcorde(r) ? r : null;
        // as duas leituras só diferem no "#": o erro típico é o sustenido sumir, então fica a que tem "#"
        if (a1 && a2 && a1 !== a2 && a1.replace('#', '') === a2.replace('#', '')) return { acorde: a1.includes('#') ? a1 : a2, certo: false };
        // correções determinísticas desta fonte: serifa lida como "c" ("Cc7"), letra dobrada ("BB"), acorde partido e juntado
        const seguro = a1 && (a1 === w.texto || a1 === w.texto.replace(/^([A-G])c/, '$1') || a1 === w.texto.replace(/^([A-G])\1/, '$1') || w.juntado);
        if (a1 && (w.conf >= 75 || !a2 || a1 === a2)) return { acorde: a1, certo: w.conf >= 60 || a1 === a2 || (seguro && w.conf >= 30) };
        if (a2) return { acorde: a2, certo: (w.relidoConf ?? 0) >= 75 && a2.length >= (a1 || '').length };
        if (a1) return { acorde: a1, certo: false };
        const ap = aproximarAcorde(w.texto) || (w.relido && aproximarAcorde(w.relido.replace(/\s+/g, '')));
        return ap ? { acorde: ap.acorde, certo: false } : null;
      };
      const ruido = w => /^[^A-Za-z0-9À-ÿ]+$/.test(w.texto) && !extras.test(w.texto);
      const aprox = l.palavras.map(w => extras.test(w.texto) ? { acorde: w.texto, certo: true, extra: true } : (melhor(w) || (ruido(w) ? { ruido: true } : null)));
      // palavra de verdade (minúsculas, 4+ letras) numa linha "de acordes": é título/texto, não acordes
      const temPalavra = l.palavras.some((w, k) => !aprox[k] && (w.conf ?? 0) >= 70 && /^[A-ZÀ-Ý]?[a-zà-ÿ]{3,}[,.;:!?]?$/.test(w.texto));
      const nOk = aprox.filter(a => a && !a.ruido).length + aprox.filter(a => a?.ruido).length * 0.7;
      const ehAcordes = !temPalavra && l.palavras.length > 0 && nOk / l.palavras.length >= 0.7 && aprox.some(a => a && !a.extra && !a.ruido)
        && l.palavras.every(w => w.texto.length <= 10);
      // linha que não é acorde nem texto (diagrama de violão, borrão): nenhuma palavra de verdade -> descarta e avisa
      const confMedia = l.palavras.reduce((n, w) => n + (w.conf ?? 0), 0) / (l.palavras.length || 1);
      const marcasDeCorda = l.palavras.every(w => /^[OoXxQ0]+$/.test(w.texto));
      const legivel = l.palavras.some(w => (w.conf ?? 0) >= 70 && /[A-Za-zÀ-ÿ]{2,}/.test(w.texto) && /[aeiouáéíóúâêôãõà]/i.test(w.texto));
      if (!ehAcordes && l.palavras.length && (marcasDeCorda || (confMedia < 50 && !legivel))) {
        descartadas.push(l.palavras.map(w => w.texto).join(' '));
        anotar('trecho ilegível descartado', l.palavras[0], l, ip);
        linhasDescartadas++;
        continue;
      }
      if (!ehAcordes) linhasTexto++;
      for (let k = 0; k < l.palavras.length; k++) {
        const w = l.palavras[k];
        let str = w.texto;
        if (ehAcordes) {
          const a = aprox[k];
          // ilegível: "?" no lugar exato (o músico vê que falta um acorde ali) e a música fica para conferir
          if (!a || a.ruido) { duvidas.push(`acorde ilegível “${str}”`); anotar(`acorde ilegível “${str}”`, w, l, ip); itens.push({ str: '?', ocr: true, x: w.x0 / ESCALA, y, w: (w.x1 - w.x0) / ESCALA, h, pagina: ip + 1, cs: w.xe ? [(w.xs[0] + Math.min(w.xe[0] - w.xs[0], larguraLetra * 1.25) / 2) / ESCALA] : undefined }); continue; }
          if (!a.certo) { duvidas.push(`${str}→${a.acorde}`); anotar(`lido “${str}”, entendido ${a.acorde}`, w, l, ip); }
          if (typeof w.separado === 'string') { duvidas.push('separado ' + w.separado); anotar(`“${w.separado.split('→')[0]}” separado em ${w.separado.split('→')[1]}`, w, l, ip); }
          str = a.acorde;
        } else {
          confs.push(w.conf);
          // palavra "de verdade": letras com vogal, minúsculas ou só a inicial maiúscula (lixo de OCR costuma ser "ORORSRO")
          const limpa = str.replace(/^[("'¿¡\-–]+|[)"',.;:!?\-–/]+$/g, '');
          if (limpa) { totalPal++; if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]?[a-záéíóúâêôãõçàü]+(-[a-záéíóúâêôãõçàü]+)*$/.test(limpa) && /[aeiouáéíóúâêôãõà]/i.test(limpa) || /^\d+\.?$|^R\.?$/.test(limpa)) palOk++; }
        }
        // posições por caractere; se a correção mudou o tamanho, usa só o início da palavra
        const xs = str.length === w.xs.length ? w.xs.map(x => x / ESCALA) : undefined;
        // centro de cada letra (não muda com desfoque/negrito, ao contrário da borda); num acorde corrigido
        // que mudou de tamanho ("Cc7" -> "C7"), vale o centro da 1ª letra, que é a raiz do acorde
        // caixa larga demais (letras grudadas): a borda esquerda continua certa, o centro vem da largura típica
        const centro = k => (w.xs[k] + Math.min(w.xe[k] - w.xs[k], larguraLetra * 1.25) / 2) / ESCALA;
        const cs = !w.xe ? undefined : str.length === w.xs.length ? w.xs.map((_, k) => centro(k)) : [centro(0)];
        itens.push({ str, x: w.x0 / ESCALA, y, w: (w.x1 - w.x0) / ESCALA, h, pagina: ip + 1, xs, cs, ocr: true });
      }
    }
  });
  const info = opcoes.foto ? { limiteDuvida: 0.3 } : {};
  const corpo = itensParaChordPro(itens, info);
  // acorde quase no meio de duas sílabas: posição a conferir com o original
  for (const t of info.incertos) { duvidas.push('posição ' + t.trecho); locais.push({ d: 'posição: ' + t.trecho, p: t.pagina, x: Math.round(t.x), y: Math.round(t.y) }); }
  for (const t of descartadas) duvidas.push('trecho ilegível descartado: “' + t.slice(0, 30) + '”');
  const r = separarCabecalho(corpo);
  confs = confs.filter(c => c != null);
  const confianca = confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : 0;
  // legibilidade: palavras reais no texto, descontada a fração de linhas que eram lixo (partitura, diagramas)
  const fracLixo = linhasDescartadas / ((linhasTexto + linhasDescartadas) || 1);
  return { ...r, duvidas, locais, confianca, legibilidade: (totalPal ? palOk / totalPal : 0) * (1 - fracLixo), fracLixo };
}

// Dúvidas agrupadas para mostrar: "AT7→A7 (13×)"
export function resumirDuvidas(duvidas, max = 15) {
  return Object.entries(duvidas.reduce((c, x) => ((c[x] = (c[x] || 0) + 1), c), {})).map(([x, n]) => (n > 1 ? `${x} (${n}×)` : x)).slice(0, max);
}
