// Acordes em cada instrumento, calculados no aparelho a partir do nome do acorde (no tom escolhido):
//  - violão: desenho no braço, a forma mais fácil (aberta quando dá; pestana quando precisa; baixo certo em G/B, D/F#...);
//  - teclado (duas mãos): mão esquerda no baixo; mão direita na inversão MAIS PERTO do acorde anterior da música
//    (condução de vozes: a mão quase não sai do lugar);
//  - órgão: pedal no baixo, mão esquerda com o acorde (inversão mais perto do anterior), mão direita livre para a melodia;
//  - flauta: as notas do acorde (arpejo/contracanto) com a digitação da flauta doce soprano (barroca).

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOMES_S = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOMES_B = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SOLFEJO = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];
const SOLFEJO_B = ['Dó', 'Réb', 'Ré', 'Mib', 'Mi', 'Fá', 'Solb', 'Sol', 'Láb', 'Lá', 'Sib', 'Si'];
const pcDe = n => (PC[n[0]] + (n[1] === '#' ? 1 : n[1] === 'b' ? -1 : 0) + 12) % 12;
const mod = n => ((n % 12) + 12) % 12;

// ---------- Nome do acorde -> notas ----------
// Escrita brasileira: "7+" e "7M" = sétima maior; "4" = sus4; "9" = com nona; "(#5)"/"5+" = aumentado; "º"/"dim" = diminuto;
// "m7(b5)"/"ø" = meio-diminuto; "/X" com nota = baixo; "/9", "/4" com número = extensão.
export function analisarAcorde(nome) {
  // a nota do acorde é lida antes de tirar os parênteses: em "E(#5)" o # é da quinta, não do Mi
  const s0 = String(nome).trim().replace(/^\(/, '').replace(/[.,;:]+$/, '');
  const r = s0.match(/^([A-G](?:#|b(?!5|9|13))?)(.*)$/);
  if (!r) return null;
  const s = r[1] + r[2].replace(/[()\s]/g, '');
  const m = s.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
  if (!m) return null;
  const raiz = pcDe(r[1]), baixo = m[3] ? pcDe(m[3]) : null;
  let q = s.slice(r[1].length).replace(/\/[A-G][#b]?$/, '').replace(/maj7|7M|M7|7\+|\+7/g, '§');
  let menor = false;
  if (/^(m(?!aj)|-)/.test(q)) { menor = true; q = q.replace(/^(m|-)/, ''); }
  q = q.replace(/^M(?=6)/, '');
  const meioDim = /ø/.test(q) || (menor && /7/.test(q) && /b5|5-/.test(q));
  const dim = !meioDim && (/dim|º|°/.test(q) || (menor && /b5|5-/.test(q) && !/7/.test(q)));
  const aum = /#5|5\+|aug/.test(q) || /^\+$/.test(q);
  const sus2 = /sus2|sus9/.test(q);
  const sus4 = !sus2 && /sus|4/.test(q.replace(/11/g, ''));
  const set = /§/.test(q) ? 11 : (dim && /7/.test(q)) ? 9 : /7/.test(q) || meioDim ? 10 : null;
  const seis = /6/.test(q.replace(/13/g, ''));
  const nona = !sus2 && /9/.test(q);
  const nonaB = /b9/.test(q);
  const onze = /11/.test(q), treze = /13/.test(q);
  const b5 = /b5|5-/.test(q) || dim || meioDim;
  const power = q === '5';
  const t3 = sus4 ? 5 : sus2 ? 2 : (menor || dim || meioDim) ? 3 : 4;
  const t5 = b5 ? 6 : aum ? 8 : 7;
  let notas = power ? [0, 7] : [0, t3, t5];
  if (set != null) notas.push(set);
  if (seis) notas.push(9);
  if (nona) notas.push(nonaB ? 1 : 2);
  if (onze && !sus4) notas.push(5);
  if (treze && !seis) notas.push(9);
  notas = [...new Set(notas)];
  return { nome, raiz, baixo, notas, pcs: notas.map(i => mod(raiz + i)), bemol: /b/.test(r[1].slice(1)) || /b/.test(m[3] || '') };
}
const nomeNota = (pc, bemol) => (bemol ? NOMES_B : NOMES_S)[pc];
const solfejo = (pc, bemol) => (bemol ? SOLFEJO_B : SOLFEJO)[pc];

// ---------- Violão ----------
const AFINACAO = [40, 45, 50, 55, 59, 64];   // Mi Lá Ré Sol Si Mi
// Formas consagradas (da 6ª corda para a 1ª; x = não tocar). Os outros acordes são calculados.
const FORMAS = {
  C: 'x32010', 'C#': 'x46664', D: 'xx0232', Eb: 'x68886', E: '022100', F: '133211', 'F#': '244322', G: '320003', Ab: '466544', A: 'x02220', Bb: 'x13331', B: 'x24442',
  Cm: 'x35543', 'C#m': 'x46654', Dm: 'xx0231', Ebm: 'x68876', Em: '022000', Fm: '133111', 'F#m': '244222', Gm: '355333', 'G#m': '466444', Am: 'x02210', Bbm: 'x13321', Bm: 'x24432',
  C7: 'x32310', 'C#7': 'x46464', D7: 'xx0212', Eb7: 'x68686', E7: '020100', F7: '131211', 'F#7': '242322', G7: '320001', Ab7: '464544', A7: 'x02020', Bb7: 'x13131', B7: 'x21202',
  Cm7: 'x35343', 'C#m7': 'x46454', Dm7: 'xx0211', Ebm7: 'x68676', Em7: '022030', Fm7: '131111', 'F#m7': '242222', Gm7: '353333', 'G#m7': '464444', Am7: 'x02010', Bbm7: 'x13121', Bm7: 'x24232',
  C7M: 'x32000', D7M: 'xx0222', E7M: '021100', F7M: 'xx3210', G7M: '320002', A7M: 'x02120', Bb7M: 'x13231', B7M: 'x24342',
  Csus4: 'x33011', Dsus4: 'xx0233', Esus4: '022200', Fsus4: '133311', Gsus4: '330013', Asus4: 'x02230', Bsus4: 'x24452',
  Dsus2: 'xx0230', Asus2: 'x02200', Esus2: '024400',
  'G/B': 'x20003', 'C/E': '032010', 'D/F#': '2x0232', 'Am/G': '3x2210', 'C/G': '332010', 'D/A': 'x00232', 'F/A': 'x03211', 'C/B': 'x22010',
  'E/G#': '4x2100', 'G/F': '1x0003', 'D/C': 'x30232', 'F/C': 'x33211', 'A/E': '002220', 'Em/D': 'xx0000', 'A/C#': 'x4222x', 'G/D': 'xx0003', 'Bm/A': 'x04432',
  C6: 'x32210', Am6: 'x04210', Dm6: 'xx0201', Em6: '022020', C9: 'x32030', G9: '320203', A9: 'x02420', E9: '024100', D9: 'xx0230',
};
const assinatura = ac => `${ac.raiz}:${[...ac.notas].sort((x, y) => x - y).join(',')}:${ac.baixo ?? ac.raiz}`;
const DICIONARIO = new Map();
for (const [n, f] of Object.entries(FORMAS)) {
  const ac = analisarAcorde(n);
  if (!ac || DICIONARIO.has(assinatura(ac))) continue;
  const trastes = f.split('').map(c => (c === 'x' ? -1 : +c));
  const presas = trastes.filter(t => t > 0), fm = presas.length ? Math.min(...presas) : 0;
  const pestana = presas.length > 4 && fm > 0 ? { casa: fm, de: trastes.findIndex(t => t === fm) } : null;
  DICIONARIO.set(assinatura(ac), { trastes, pestana, inicio: fm });
}
const cacheViolao = new Map();
export function formaViolao(nome) {
  if (cacheViolao.has(nome)) return cacheViolao.get(nome);
  const ac = analisarAcorde(nome);
  let melhor = ac ? DICIONARIO.get(assinatura(ac)) || null : null;
  if (ac && !melhor) {
    const bx = ac.baixo ?? ac.raiz;
    const permit = new Set([...ac.pcs, bx]);
    // a 5ª justa pode faltar quando o acorde tem 4 notas ou mais
    const obrig = new Set(ac.pcs.filter((p, k) => !(ac.notas[k] === 7 && ac.notas.length >= 4)));
    obrig.add(bx);
    for (let base = 0; base <= 9; base++) {
      const ops = AFINACAO.map(a => {
        const o = [-1];
        if (permit.has(a % 12) && base <= 4) o.push(0);
        for (let f = Math.max(1, base); f <= base + 3; f++) if (permit.has((a + f) % 12)) o.push(f);
        return o;
      });
      const fr = new Array(6);
      const avaliar = () => {
        const tocadas = fr.map((f, i) => i).filter(i => fr[i] >= 0);
        if (tocadas.length < 3) return;
        const graves = tocadas[0];
        if ((AFINACAO[graves] + fr[graves]) % 12 !== bx) return;
        const notas = new Set(tocadas.map(i => (AFINACAO[i] + fr[i]) % 12));
        for (const p of obrig) if (!notas.has(p)) return;
        const presas = tocadas.filter(i => fr[i] > 0);
        const fm = presas.length ? Math.min(...presas.map(i => fr[i])) : 0;
        const fM = presas.length ? Math.max(...presas.map(i => fr[i])) : 0;
        if (fM - fm > 3) return;
        const soltas0 = tocadas.some(i => fr[i] === 0);
        if (soltas0 && fM >= 5) return;                       // corda solta com casa alta: esticada demais
        // pestana: dedo 1 deitado na casa mais baixa, da corda mais grave presa nela até a 1ª corda (sem corda solta depois)
        let pestana = null, dedos = presas.length;
        if (presas.length > 4) {
          const ini = presas.find(i => fr[i] === fm);
          if (tocadas.filter(i => i > ini).some(i => fr[i] === 0)) return;
          pestana = { casa: fm, de: ini };
          dedos = presas.filter(i => fr[i] > fm).length + 1;
        }
        if (dedos > 4) return;
        const internas = tocadas.length ? fr.slice(graves).filter(f => f < 0).length : 0;
        const soltas = tocadas.filter(i => fr[i] === 0).length;
        let trocas = 0;
        for (let k = 1; k < tocadas.length; k++) if ((fr[tocadas[k]] === 0) !== (fr[tocadas[k - 1]] === 0)) trocas++;
        let custo = fm * 1.4 + (pestana ? 2.2 : 0) + internas * 4 + graves * 0.35 - tocadas.length * 0.8 + dedos * 0.3 - (fm <= 3 ? soltas * 0.25 : 0)
          + (fM - fm) * 0.5 + Math.max(0, trocas - 2) * 0.8;
        if (graves >= 2 && ac.baixo == null) custo += 1.2;
        if (!melhor || custo < melhor.custo) melhor = { trastes: [...fr], pestana, custo, inicio: fm };
      };
      const rec = i => { if (i === 6) return avaliar(); for (const f of ops[i]) { fr[i] = f; rec(i + 1); } };
      rec(0);
    }
  }
  cacheViolao.set(nome, melhor);
  return melhor;
}

export function svgViolao(nome) {
  const f = formaViolao(nome);
  const L = 92, A = 112, x0 = 14, dx = 13, y0 = 26, dy = 16;
  if (!f) return `<svg viewBox="0 0 ${L} ${A}" class="diag" role="img" aria-label="${nome}: sem desenho"><text x="${L / 2}" y="60" text-anchor="middle" class="d-txt">?</text></svg>`;
  const presas = f.trastes.filter(t => t > 0);
  const maxT = presas.length ? Math.max(...presas) : 0;
  const ini = maxT <= 4 ? 1 : Math.min(...presas);
  const partes = [];
  for (let c = 0; c < 6; c++) partes.push(`<line x1="${x0 + c * dx}" y1="${y0}" x2="${x0 + c * dx}" y2="${y0 + 4 * dy}" class="d-corda"/>`);
  for (let k = 0; k <= 4; k++) partes.push(`<line x1="${x0}" y1="${y0 + k * dy}" x2="${x0 + 5 * dx}" y2="${y0 + k * dy}" class="${k === 0 && ini === 1 ? 'd-pestana-nut' : 'd-traste'}"/>`);
  if (ini > 1) partes.push(`<text x="${x0 + 5 * dx + 4}" y="${y0 + dy * 0.7}" class="d-casa">${ini}ª</text>`);
  if (f.pestana) {
    const y = y0 + (f.pestana.casa - ini + 0.5) * dy;
    partes.push(`<rect x="${x0 + f.pestana.de * dx - 5}" y="${y - 5}" width="${(5 - f.pestana.de) * dx + 10}" height="10" rx="5" class="d-dedo"/>`);
  }
  f.trastes.forEach((t, c) => {
    const x = x0 + c * dx;
    if (t < 0) partes.push(`<text x="${x}" y="${y0 - 6}" text-anchor="middle" class="d-x">×</text>`);
    else if (t === 0) partes.push(`<circle cx="${x}" cy="${y0 - 9}" r="3.6" class="d-solta"/>`);
    else if (!(f.pestana && t === f.pestana.casa && c >= f.pestana.de)) partes.push(`<circle cx="${x}" cy="${y0 + (t - ini + 0.5) * dy}" r="5.2" class="d-dedo"/>`);
  });
  return `<svg viewBox="0 0 ${L} ${A}" class="diag" role="img" aria-label="Violão ${nome}: ${f.trastes.map(t => (t < 0 ? 'x' : t)).join(' ')}">${partes.join('')}
    <text x="${x0 + 2.5 * dx}" y="${A - 6}" text-anchor="middle" class="d-cifra">${f.trastes.map(t => (t < 0 ? 'x' : t)).join(' ')}</text></svg>`;
}

// ---------- Teclado e órgão (condução de vozes) ----------
// candidatos: o acorde em posição fechada, cada inversão, em todas as oitavas dentro da faixa
function candidatos(pcs, lo, hi) {
  const out = [];
  for (let r = 0; r < pcs.length; r++) {
    const ordem = [...pcs.slice(r), ...pcs.slice(0, r)];
    for (let oit = 2; oit <= 6; oit++) {
      const v = []; let prev = -Infinity;
      for (const p of ordem) { let n = oit * 12 + p; while (n <= prev) n += 12; v.push(n); prev = n; }
      if (v[0] >= lo && v[v.length - 1] <= hi) out.push(v);
    }
  }
  return out;
}
const distancia = (a, b) => {
  if (!b) return 0;
  const ida = a.reduce((s, n) => s + Math.min(...b.map(m => Math.abs(n - m))), 0);
  const volta = b.reduce((s, n) => s + Math.min(...a.map(m => Math.abs(n - m))), 0);
  return ida + volta;
};
function rotuloInversao(ac, grave) {
  const i = mod(grave - ac.raiz);
  if (i === 0) return 'posição fundamental';
  if ([3, 4, 2, 5].includes(i) && ac.notas[1] === i) return '1ª inversão (3ª embaixo)';
  if ([6, 7, 8].includes(i)) return '2ª inversão (5ª embaixo)';
  if ([9, 10, 11].includes(i)) return '3ª inversão (7ª embaixo)';
  return 'inversão';
}
// sequência: nomes dos acordes na ordem em que aparecem na música; devolve Map nome -> vozes (na 1ª vez que aparece)
export function vozesTeclado(sequencia, instrumento = 'teclado') {
  const org = instrumento === 'orgao';
  const [lo, hi, centro] = org ? [52, 69, 60] : [55, 77, 66];
  const out = new Map();
  let ant = null;
  for (const nome of sequencia) {
    const ac = analisarAcorde(nome);
    if (!ac) continue;
    // mão do acorde: até 4 notas (tira a 5ª justa se passar)
    let pcs = ac.pcs;
    if (pcs.length > 4) pcs = pcs.filter((p, k) => ac.notas[k] !== 7);
    const cands = candidatos(pcs, lo, hi);
    if (!cands.length) continue;
    const custo = v => (ant ? distancia(v, ant) : 0) + Math.abs(v.reduce((s, n) => s + n, 0) / v.length - centro) * (ant ? 0.25 : 1);
    const v = cands.reduce((a, b) => (custo(b) < custo(a) ? b : a));
    ant = v;
    if (out.has(nome)) continue;
    const bx = ac.baixo ?? ac.raiz;
    const baixo = org ? 36 + bx : (40 + mod(bx - 4));            // órgão: pedal C2–B2; teclado: E2–D#3
    out.set(nome, { ac, acorde: v, baixo, inversao: rotuloInversao(ac, v[0]) });
  }
  return out;
}

const PRETA = new Set([1, 3, 6, 8, 10]);
export function svgTeclado(voz, instrumento = 'teclado') {
  const org = instrumento === 'orgao';
  const todas = [voz.baixo, ...voz.acorde];
  const lo = Math.floor(Math.min(...todas) / 12) * 12, hi = Math.ceil((Math.max(...todas) + 1) / 12) * 12 - 1;
  const brancas = []; for (let n = lo; n <= hi; n++) if (!PRETA.has(n % 12)) brancas.push(n);
  const W = 7, H = 46, L = brancas.length * W;
  const xBranca = n => brancas.indexOf(n) * W;
  const classe = n => (n === voz.baixo ? (org ? 'd-pedal' : 'd-me') : voz.acorde.includes(n) ? (org ? 'd-me' : 'd-md') : '');
  const b = brancas.map(n => `<rect x="${xBranca(n)}" y="0" width="${W}" height="${H}" class="d-branca ${classe(n)}"/>`);
  const p = [];
  for (let n = lo; n <= hi; n++) if (PRETA.has(n % 12)) p.push(`<rect x="${xBranca(n - 1) + W * 0.65}" y="0" width="${W * 0.7}" height="${H * 0.6}" class="d-preta ${classe(n)}"/>`);
  return `<svg viewBox="-1 -1 ${L + 2} ${H + 2}" class="diag teclas" role="img" aria-label="${org ? 'Órgão' : 'Teclado'} ${voz.ac.nome}">${b.join('')}${p.join('')}</svg>`;
}
export function legendaTeclado(voz, instrumento = 'teclado') {
  const bem = voz.ac.bemol || /b/.test(voz.ac.nome);
  const nomes = v => v.map(n => nomeNota(n % 12, bem)).join(' ');
  if (instrumento === 'orgao') return `<span class="cor-pedal">Pedal: ${nomeNota(voz.baixo % 12, bem)}</span> · <span class="cor-me">M.E.: ${nomes(voz.acorde)}</span><br><span class="suave">${voz.inversao} · M.D.: melodia</span>`;
  return `<span class="cor-me">M.E.: ${nomeNota(voz.baixo % 12, bem)}</span> · <span class="cor-md">M.D.: ${nomes(voz.acorde)}</span><br><span class="suave">${voz.inversao}</span>`;
}

// ---------- Flauta doce soprano (digitação barroca) ----------
// buracos: polegar (atrás), 1-2-3 (mão esquerda), 4-5-6-7 (mão direita); 1 = tapado, .5 = meio tapado
const DIGITACAO = {
  72: [1, 1, 1, 1, 1, 1, 1, 1], 73: [1, 1, 1, 1, 1, 1, 1, 0.5], 74: [1, 1, 1, 1, 1, 1, 1, 0], 75: [1, 1, 1, 1, 1, 1, 0.5, 0],
  76: [1, 1, 1, 1, 1, 1, 0, 0], 77: [1, 1, 1, 1, 1, 0, 1, 1], 78: [1, 1, 1, 1, 0, 1, 1, 0], 79: [1, 1, 1, 1, 0, 0, 0, 0],
  80: [1, 1, 1, 0, 1, 1, 0.5, 0], 81: [1, 1, 1, 0, 0, 0, 0, 0], 82: [1, 1, 0, 1, 1, 0, 0, 0], 83: [1, 1, 0, 0, 0, 0, 0, 0],
  84: [1, 0, 1, 0, 0, 0, 0, 0], 85: [0, 1, 1, 0, 0, 0, 0, 0], 86: [0, 0, 1, 0, 0, 0, 0, 0],
};
export function notasFlauta(nome) {
  const ac = analisarAcorde(nome);
  if (!ac) return [];
  const out = []; let ant = 71;
  for (const p of ac.pcs) {
    let n = 72 + mod(p - 0);
    while (n <= ant) n += 12;
    while (n > 86) n -= 12;
    if (n < 72) n += 12;
    out.push(n); ant = n;
  }
  return out.map(n => ({ midi: n, nome: nomeNota(n % 12, ac.bemol || /b/.test(nome)), solfejo: solfejo(n % 12, ac.bemol || /b/.test(nome)) }));
}
export function svgFlauta(midi) {
  const d = DIGITACAO[midi];
  if (!d) return '';
  const cx = 11, furos = [];
  furos.push(`<circle cx="4" cy="10" r="3.2" class="d-furo ${d[0] === 1 ? 'tapado' : ''}"/>`);   // polegar (atrás)
  for (let k = 1; k <= 7; k++) {
    const y = 10 + k * 10 + (k >= 4 ? 4 : 0);
    const v = d[k];
    furos.push(`<circle cx="${cx}" cy="${y}" r="3.6" class="d-furo ${v === 1 ? 'tapado' : ''}"/>`);
    if (v === 0.5) furos.push(`<path d="M ${cx} ${y - 3.6} A 3.6 3.6 0 0 1 ${cx} ${y + 3.6} Z" class="d-meio"/>`);
  }
  return `<svg viewBox="0 0 18 100" class="diag flauta" role="img" aria-label="Digitação">${`<rect x="6" y="2" width="10" height="96" rx="5" class="d-corpo"/>`}${furos.join('')}</svg>`;
}

// ---------- Cartões ----------
export const INSTRUMENTOS = [['violao', 'Violão'], ['teclado', 'Teclado'], ['orgao', 'Órgão'], ['flauta', 'Flauta']];
const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function cartaoAcorde(nome, instrumento, vozes) {
  let corpo = '', legenda = '';
  if (instrumento === 'violao') {
    corpo = svgViolao(nome);
    const f = formaViolao(nome);
    legenda = f?.pestana ? `pestana na ${f.pestana.casa}ª casa` : f ? '' : 'sem forma simples';
  } else if (instrumento === 'teclado' || instrumento === 'orgao') {
    const v = vozes?.get(nome);
    if (v) { corpo = svgTeclado(v, instrumento); legenda = legendaTeclado(v, instrumento); }
  } else if (instrumento === 'flauta') {
    const ns = notasFlauta(nome);
    corpo = `<div class="flauta-notas">${ns.map(n => `<div class="flauta-nota">${svgFlauta(n.midi)}<div class="pequeno"><b>${escH(n.nome)}</b><br>${escH(n.solfejo)}</div></div>`).join('')}</div>`;
    legenda = 'arpejo do acorde';
  }
  return `<div class="cartao-acorde ${instrumento}"><div class="nome-acorde">${escH(nome)}</div>${corpo || '<span class="suave pequeno">?</span>'}${legenda ? `<div class="legenda-acorde pequeno">${legenda}</div>` : ''}</div>`;
}
