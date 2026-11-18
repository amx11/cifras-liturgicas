// Confere uma cifra (texto digitado, OCR, bloco de cifra) contra a leitura da partitura da mesma música.
// Na partitura o acorde está sobre a nota, então a sílaba dele é exata; na cifra digitada o acorde é
// posicionado com espaços e às vezes fica uma sílaba antes ou depois. Onde as duas trazem a mesma palavra
// com o mesmo acorde (no mesmo tom, ou transposto de forma constante), a sílaba da partitura vale.
import { silabasPalavra, normalizar, transporAcorde, detectarTom, preferirBemol } from './cifra.js';

function analisar(cp) {
  const linhas = cp.split('\n').map(l => {
    let texto = '';
    const acordes = [];
    for (const m of l.matchAll(/\[([^\]]*)\]|([^[]+)/g)) { if (m[1] !== undefined) acordes.push({ pos: texto.length, nome: m[1] }); else texto += m[2]; }
    return { texto, acordes };
  });
  const palavras = [];
  linhas.forEach((l, li) => {
    const re = /[A-Za-zÀ-ÿ]+(?:['’-][A-Za-zÀ-ÿ]+)*/g;
    let w;
    while ((w = re.exec(l.texto))) {
      const sl = silabasPalavra(w[0]);
      const inicios = sl.map((s, k) => (k === 0 || s !== sl[k - 1] ? k : -1)).filter(k => k >= 0);  // começo de cada sílaba
      // marcas que não são letra cantada: "R." (refrão), "T." (todos), "S." (solista), "Ref"
      const depois = l.texto.slice(w.index + w[0].length, w.index + w[0].length + 2);
      if (/^(R|T|S|Ref|Refr)$/i.test(w[0]) && /^[.:/]/.test(depois)) continue;
      palavras.push({ li, ini: w.index, fim: w.index + w[0].length, t: w[0], n: normalizar(w[0]).replace(/\s+/g, ''), sl, inicios, acordes: [] });
    }
  });
  // cada acorde pertence à palavra em que cai (ou à seguinte, se estiver no espaço antes dela)
  linhas.forEach((l, li) => {
    const pal = palavras.filter(p => p.li === li);
    for (const a of l.acordes) {
      let p = pal.find(p => a.pos >= p.ini && a.pos < p.fim) || pal.find(p => p.ini >= a.pos && p.ini - a.pos <= 2);
      if (p) { a.palavra = p; a.silaba = a.pos < p.ini ? 0 : p.sl[a.pos - p.ini]; p.acordes.push(a); continue; }
      // logo depois do fim da palavra (sílaba ainda soando, fim de frase): pertence a ela, depois da última letra
      p = [...pal].reverse().find(p => a.pos >= p.fim && a.pos - p.fim <= 2);
      if (p) { a.palavra = p; a.fim = true; a.silaba = 99; p.acordes.push(a); }
    }
  });
  return { linhas, palavras };
}

// posição pela LETRA (não pela minha divisão de sílabas): mesma palavra = mesma letra, mesmo com hífen ou acento diferente
const ehL = c => /[A-Za-zÀ-ÿ]/.test(c);
const letrasAte = (t, off) => [...t.slice(0, Math.max(0, off))].filter(ehL).length;
function posDaLetra(t, k) { let n = 0; for (let i = 0; i < t.length; i++) if (ehL(t[i])) { if (n === k) return i; n++; } return Math.max(0, t.length - 1); }

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
// opcoes.nomes: corrige também o nome do acorde quando a diferença é só o acidente (# ou b perdido/inventado
// pelo OCR: "Cm" x "C#m", "Ab7" x "A7"), na mesma palavra e com um único acorde em cada lado
export function conferirComPartitura(cifra, partitura, opcoes = {}) {
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
  let movidos = 0, comparados = 0, renomeados = 0;
  if (opcoes.nomes) {
    const semAcid = x => x.replace(/^([A-G])[#b]/, '$1').replace(/\/([A-G])[#b]/, '/$1').replace(/º|°|dim/, 'dim');
    const volta = (12 - melhor.t) % 12;
    for (const [i, j] of pares) {
      const pc = C.palavras[i], pp = P.palavras[j];
      if (pc.acordes.length !== 1 || pp.acordes.length !== 1) continue;
      const a = pc.acordes[0], b = pp.acordes[0], na = raiz(a.nome), nb = raiz(b.nome);
      if (na === '?') { a.nome = transporAcorde(nb, volta); renomeados++; continue; }   // ilegível: o da partitura
      if (transporAcorde(na, melhor.t) === nb) continue;
      const certo = transporAcorde(nb, volta, /b/.test(na.slice(1, 2)));
      if (semAcid(certo) === semAcid(na) && certo !== na) { a.nome = a.nome.replace(na, certo); renomeados++; }
    }
  }
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
      const pPar = alvo === pc ? pp : P.palavras[idxP.get(C.palavras.indexOf(alvo))];
      const pos = b.fim ? alvo.fim : alvo.ini + posDaLetra(alvo.t, letrasAte(pPar.t, b.pos - pPar.ini));
      if (a.pos === pos || (a.pos < alvo.ini && pos === alvo.ini && alvo === pc)) continue;   // já está na letra da partitura
      if (alvo === pc && a.pos >= pc.ini && a.silaba === b.silaba) { a.novaPos = pos; continue; }   // mesma sílaba: só acerta o começo dela
      // já existe esse mesmo acorde nessa sílaba (a palavra tem o acorde duas vezes): não duplica
      if (alvo.acordes.some(x => x !== a && x.nome === a.nome && (x.novaPos ?? x.pos) === pos)) continue;
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
  return { chordpro, movidos, comparados, renomeados, semitons: melhor.t, palavrasAlinhadas: pares.length, palavrasCifra: C.palavras.length };
}

// Completa os acordes das estrofes que na cifra vieram só com a letra, usando a partitura exata (MuseScore/MusicXML)
// em que cada estrofe tem a sua letra sob as notas: cada parágrafo sem acordes é alinhado palavra a palavra com a
// estrofe da partitura que tem a mesma letra, e o acorde vai para a mesma sílaba. Só aplica quando quase toda a letra
// do parágrafo foi encontrada (85%) e quase todos os acordes do trecho acharam palavra (90%).
// Devolve { chordpro, estrofes, acordes } ou null.
export function completarPelaPartitura(cifra, partitura) {
  if (!cifra || !partitura) return null;
  const C = analisar(cifra);
  const blocos = partitura.split(/\n[ \t]*\n/).map(analisar).filter(b => b.palavras.length);
  if (!blocos.length) return null;
  // tom: a cifra pode estar em outro tom que a partitura
  const temAcordes = /\[[^\]]+\]/.test(cifra);
  const t = temAcordes ? conferirComPartitura(cifra, partitura).semitons : 0;
  const volta = (12 - t) % 12, bemol = temAcordes ? preferirBemol(detectarTom(cifra)) : false;
  // parágrafos da cifra (linhas consecutivas com texto)
  const pars = [];
  let atual = null;
  C.linhas.forEach((l, li) => {
    if (!l.texto.trim()) { atual = null; return; }
    if (!atual) { atual = { linhas: [] }; pars.push(atual); }
    atual.linhas.push(li);
  });
  const inserir = new Map();   // li -> [{ pos, nome }]
  let estrofes = 0, total = 0;
  for (const p of pars) {
    if (p.linhas.some(li => C.linhas[li].acordes.length)) continue;
    const W = C.palavras.filter(w => p.linhas.includes(w.li));
    if (W.length < 3) continue;
    let melhor = null;
    for (const B of blocos) {
      const pares = alinhar(W, B.palavras);
      if (!melhor || pares.length > melhor.pares.length) melhor = { B, pares };
    }
    if (!melhor || melhor.pares.length < W.length * 0.85) continue;
    const { B, pares } = melhor;
    const deJ = new Map(pares.map(([i, j]) => [j, i]));
    const j0 = pares[0][1], j1 = pares[pares.length - 1][1];
    const novos = [];
    let achados = 0, nAcordes = 0;
    for (let j = j0; j <= j1; j++) {
      const pw = B.palavras[j];
      if (!pw.acordes.length) continue;
      let i = deJ.get(j);
      if (i === undefined) {
        // palavra trocada (grafia diferente): mesma distância entre as palavras alinhadas vizinhas
        let a = pares.filter(([, jj]) => jj < j).pop(), b = pares.find(([, jj]) => jj > j);
        if (a && b && b[0] - a[0] === b[1] - a[1]) i = a[0] + (j - a[1]);
      }
      for (const ac of pw.acordes) {
        nAcordes++;
        if (i === undefined) continue;
        const cw = W[i];
        const pos = ac.fim ? cw.fim : cw.n === pw.n ? cw.ini + posDaLetra(cw.t, letrasAte(pw.t, ac.pos - pw.ini))
          : cw.ini + (cw.inicios[Math.min(ac.silaba, cw.inicios.length - 1)] ?? 0);
        novos.push({ li: cw.li, pos, nome: volta ? transporAcorde(ac.nome, volta, bemol) : ac.nome });
        achados++;
      }
    }
    if (!nAcordes || achados < nAcordes * 0.9) continue;
    for (const n of novos) { if (!inserir.has(n.li)) inserir.set(n.li, []); inserir.get(n.li).push(n); }
    estrofes++; total += achados;
  }
  if (!estrofes) return null;
  const chordpro = cifra.split('\n').map((linha, li) => {
    const ins = inserir.get(li);
    if (!ins) return linha;
    let out = '', ate = 0;
    for (const n of ins.sort((a, b) => a.pos - b.pos)) { out += linha.slice(ate, n.pos) + `[${n.nome}]`; ate = n.pos; }
    return out + linha.slice(ate);
  }).join('\n');
  return { chordpro, estrofes, acordes: total };
}
