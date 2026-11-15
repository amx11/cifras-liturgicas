// Confere uma cifra (texto digitado, OCR, bloco de cifra) contra a leitura da partitura da mesma música.
// Na partitura o acorde está sobre a nota, então a sílaba dele é exata; na cifra digitada o acorde é
// posicionado com espaços e às vezes fica uma sílaba antes ou depois. Onde as duas trazem a mesma palavra
// com o mesmo acorde (no mesmo tom, ou transposto de forma constante), a sílaba da partitura vale.
import { silabasPalavra, normalizar, transporAcorde } from './cifra.js';

function analisar(cp) {
  const linhas = cp.split('\n').map(l => {
    let texto = '';
    const acordes = [];
    for (const m of l.matchAll(/\[([^\]]*)\]|([^[]+)/g)) { if (m[1] !== undefined) acordes.push({ pos: texto.length, nome: m[1] }); else texto += m[2]; }
    return { texto, acordes };
  });
  const palavras = [];
  linhas.forEach((l, li) => {
    const re = /[A-Za-zÀ-ÿ]+(?:['’][A-Za-zÀ-ÿ]+)*/g;
    let w;
    while ((w = re.exec(l.texto))) {
      const sl = silabasPalavra(w[0]);
      const inicios = sl.map((s, k) => (k === 0 || s !== sl[k - 1] ? k : -1)).filter(k => k >= 0);  // começo de cada sílaba
      // marcas que não são letra cantada: "R." (refrão), "T." (todos), "S." (solista), "Ref"
      const depois = l.texto.slice(w.index + w[0].length, w.index + w[0].length + 2);
      if (/^(R|T|S|Ref|Refr)$/i.test(w[0]) && /^[.:/]/.test(depois)) continue;
      palavras.push({ li, ini: w.index, fim: w.index + w[0].length, n: normalizar(w[0]), sl, inicios, acordes: [] });
    }
  });
  // cada acorde pertence à palavra em que cai (ou à seguinte, se estiver no espaço antes dela)
  linhas.forEach((l, li) => {
    const pal = palavras.filter(p => p.li === li);
    for (const a of l.acordes) {
      const p = pal.find(p => a.pos >= p.ini && a.pos < p.fim) || pal.find(p => p.ini >= a.pos && p.ini - a.pos <= 2);
      if (p) { a.palavra = p; a.silaba = a.pos < p.ini ? 0 : p.sl[a.pos - p.ini]; p.acordes.push(a); }
    }
  });
  return { linhas, palavras };
}

function alinhar(A, B) {
  const n = A.length, m = B.length;
  if (!n || !m || n * m > 4e6) return [];
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i].n === B[j].n ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const pares = [];
  let i = 0, j = 0;
  while (i < n && j < m) { if (A[i].n === B[j].n) { pares.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  return pares;
}

const raiz = a => a.replace(/^\(/, '').replace(/\)$/, '');

// Devolve { chordpro, movidos, comparados, semitons } — semitons: diferença de tom entre cifra e partitura
export function conferirComPartitura(cifra, partitura) {
  const C = analisar(cifra), P = analisar(partitura);
  const pares = alinhar(C.palavras, P.palavras);
  // tom: a transposição que faz mais acordes coincidirem nas palavras alinhadas
  let melhor = { t: 0, n: -1 };
  for (let t = 0; t < 12; t++) {
    let n = 0;
    for (const [i, j] of pares) for (const a of C.palavras[i].acordes) if (P.palavras[j].acordes.some(b => raiz(b.nome) === transporAcorde(raiz(a.nome), t))) n++;
    if (n > melhor.n) melhor = { t, n };
  }
  const igual = (a, b) => raiz(b.nome) === transporAcorde(raiz(a.nome), melhor.t) || raiz(b.nome) === raiz(a.nome);
  let movidos = 0, comparados = 0;
  const idxP = new Map(pares.map(([i, j]) => [i, j]));
  for (const [i, j] of pares) {
    const pc = C.palavras[i], pp = P.palavras[j];
    for (const a of pc.acordes) {
      // mesmo acorde na mesma palavra da partitura
      let b = pp.acordes.find(b => igual(a, b));
      let alvo = pc;
      if (!b) {
        // a partitura põe esse acorde na palavra vizinha (a cifra digitada adiantou/atrasou)
        for (const d of [1, -1]) {
          const ic = i + d, jp = idxP.get(ic);
          if (jp === undefined || jp !== j + d) continue;
          const viz = C.palavras[ic];
          if (viz.li !== pc.li) continue;
          const bb = P.palavras[jp].acordes.find(x => igual(a, x));
          if (bb && !viz.acordes.some(x => x !== a && igual(x, bb))) { b = bb; alvo = viz; break; }
        }
      }
      if (!b) continue;
      comparados++;
      const novaSilaba = b.silaba;
      const pos = alvo.ini + (alvo.inicios[novaSilaba] ?? 0);
      if (alvo === pc && a.silaba === novaSilaba) continue;
      if (alvo === pc && a.pos < pc.ini && novaSilaba === 0) continue;   // antes da palavra = 1ª sílaba
      a.novaPos = pos; movidos++;
    }
  }
  // remonta as linhas
  const chordpro = C.linhas.map(l => {
    const acs = l.acordes.map((a, k) => ({ pos: a.novaPos ?? a.pos, nome: a.nome, k })).sort((x, y) => x.pos - y.pos || x.k - y.k);
    let out = '', ate = 0;
    for (const a of acs) { out += l.texto.slice(ate, a.pos) + `[${a.nome}]`; ate = Math.max(ate, a.pos); }
    return out + l.texto.slice(ate);
  }).join('\n');
  return { chordpro, movidos, comparados, semitons: melhor.t, palavrasAlinhadas: pares.length, palavrasCifra: C.palavras.length };
}
