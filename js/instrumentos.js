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
// níveis: simplificado = acorde básico (tríade), sem pestana, baixo pode ser outra nota do acorde;
// médio = como está escrito (formas consagradas); avançado = como escrito, com a mão na mesma região do braço
const comNotas = (ac, notas) => ({ ...ac, notas, pcs: notas.map(i => mod(ac.raiz + i)) });
export const triade = ac => comNotas(ac, ac.notas.length <= 2 ? ac.notas : ac.notas.slice(0, 3));

function gerarFormas(ac, { semPestana = false, baixoLivre = false, max = 1 } = {}) {
  const bx = ac.baixo ?? ac.raiz;
  const permit = new Set([...ac.pcs, bx]);
  // a 5ª justa pode faltar quando o acorde tem 4 notas ou mais
  const obrig = new Set(ac.pcs.filter((p, k) => !(ac.notas[k] === 7 && ac.notas.length >= 4)));
  if (!baixoLivre) obrig.add(bx);
  const lista = [];
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
      if (tocadas.length < (baixoLivre ? 4 : 3)) return;
      const graves = tocadas[0];
      const notaGrave = (AFINACAO[graves] + fr[graves]) % 12;
      if (baixoLivre ? !ac.pcs.includes(notaGrave) : notaGrave !== bx) return;
      const notas = new Set(tocadas.map(i => (AFINACAO[i] + fr[i]) % 12));
      for (const q of obrig) if (!notas.has(q)) return;
      const presas = tocadas.filter(i => fr[i] > 0);
      const fm = presas.length ? Math.min(...presas.map(i => fr[i])) : 0;
      const fM = presas.length ? Math.max(...presas.map(i => fr[i])) : 0;
      if (fM - fm > 3) return;
      if (tocadas.some(i => fr[i] === 0) && fM >= 5) return;      // corda solta com casa alta: esticada demais
      // pestana: dedo 1 deitado na casa mais baixa, da corda mais grave presa nela até a 1ª corda (sem corda solta depois)
      let pestana = null, dedos = presas.length;
      if (presas.length > 4) {
        if (semPestana) return;
        const ini = presas.find(i => fr[i] === fm);
        if (tocadas.filter(i => i > ini).some(i => fr[i] === 0)) return;
        pestana = { casa: fm, de: ini };
        dedos = presas.filter(i => fr[i] > fm).length + 1;
      }
      if (dedos > 4) return;
      // corda abafada no meio (entre a mais grave e a mais aguda tocadas); corda solta espremida entre casas altas
      const agudas = tocadas[tocadas.length - 1];
      const internas = fr.slice(graves, agudas + 1).filter(f => f < 0).length;
      let soltaNoMeio = 0;
      for (let k = 1; k < tocadas.length - 1; k++) if (fr[tocadas[k]] === 0 && fr[tocadas[k - 1]] >= 3 && fr[tocadas[k + 1]] >= 3) soltaNoMeio++;
      for (let k = 1; k < tocadas.length - 1; k++) if (fr[tocadas[k]] === 0 && fr[tocadas[k - 1]] > 0 && fr[tocadas[k + 1]] > 0) soltaNoMeio += Math.max(fr[tocadas[k - 1]], fr[tocadas[k + 1]]) >= 4 ? 1.35 : 0.55;
      const soltas = tocadas.filter(i => fr[i] === 0).length;
      let trocas = 0;
      for (let k = 1; k < tocadas.length; k++) if ((fr[tocadas[k]] === 0) !== (fr[tocadas[k - 1]] === 0)) trocas++;
      // simplificado (baixoLivre): forma pequena vale tanto quanto a cheia (menos peso para o nº de cordas e a corda do baixo)
      let custo = fm * 1.4 + (pestana ? 2.2 : 0) + internas * 4 + graves * (baixoLivre ? 0 : 0.35) - tocadas.length * (baixoLivre ? 0.5 : 0.8) + dedos * 0.3 - (fm <= 3 ? soltas * 0.25 : 0)
        + (fM - fm) * 0.5 + Math.max(0, trocas - 2) * 0.8 + soltaNoMeio * 1.5;
      if (graves >= 2 && ac.baixo == null && !baixoLivre) custo += 1.2;
      if (baixoLivre && notaGrave !== ac.raiz) custo += 3;
      lista.push({ trastes: [...fr], pestana, custo, inicio: fm });
    };
    const rec = i => { if (i === 6) return avaliar(); for (const f of ops[i]) { fr[i] = f; rec(i + 1); } };
    rec(0);
  }
  lista.sort((a, b) => a.custo - b.custo);
  const vistos = new Set(), out = [];
  for (const f of lista) { const k = f.trastes.join(','); if (!vistos.has(k)) { vistos.add(k); out.push(f); } if (out.length >= max) break; }
  return out;
}
const cacheViolao = new Map();
export function formaViolao(nome, nivel = 'medio') {
  const chave = nome + '|' + nivel;
  if (cacheViolao.has(chave)) return cacheViolao.get(chave);
  const ac = analisarAcorde(nome);
  let f = null;
  if (ac && nivel === 'simples') {
    // acorde com 7ª que já tem forma aberta fácil (B7, A7, E7, D7, Am7...) fica como está; senão, o acorde básico
    const aberta = ac.notas.length <= 4 && ac.baixo == null ? DICIONARIO.get(assinatura(ac)) : null;
    if (aberta && !aberta.pestana) { cacheViolao.set(chave, aberta); return aberta; }
    const t = { ...triade(ac), baixo: null };
    const dic = DICIONARIO.get(assinatura(t));
    f = dic && !dic.pestana ? dic : gerarFormas(t, { semPestana: true, baixoLivre: true })[0] || dic || null;
  }
  if (ac && !f) f = DICIONARIO.get(assinatura(ac)) || gerarFormas(ac)[0] || null;
  cacheViolao.set(chave, f);
  return f;
}
// avançado: em cada acorde, entre as boas formas, a que deixa a mão mais perto de onde estava (mesma região do braço)
const posicao = f => { const p = f.trastes.filter(t => t > 0); return p.length ? p.reduce((a, b) => a + b, 0) / p.length : 0.5; };
export function formasViolaoSequencia(sequencia) {
  const out = new Map();
  let ant = null;
  for (const nome of sequencia) {
    const ac = analisarAcorde(nome);
    if (!ac) continue;
    const dic = DICIONARIO.get(assinatura(ac));
    const cands = [...(dic ? [{ ...dic, custo: -2 }] : []), ...gerarFormas(ac, { max: 10 })];
    if (!cands.length) continue;
    const custo = f => f.custo + (ant == null ? 0 : Math.abs(posicao(f) - ant) * 0.9);
    const f = cands.reduce((a, b) => (custo(b) < custo(a) ? b : a));
    ant = posicao(f);
    if (!out.has(nome)) out.set(nome, f);
  }
  return out;
}

export function svgViolao(nome, f = formaViolao(nome)) {
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
// sequência: nomes dos acordes na ordem em que aparecem na música; devolve Map nome -> vozes (na 1ª vez que aparece).
// Níveis — teclado: simplificado = M.E. só o baixo, M.D. tríade; médio = M.E. tônica-5ª-8ª, M.D. até 4 notas (com a 7ª);
// avançado = M.E. tônica-5ª-10ª, M.D. com todas as notas escritas (7ª, 9ª, 6ª...).
// Órgão: simplificado = pedal + tríade; médio = pedal + acorde com a 7ª; avançado = pedal + M.E. + M.D. dobrando 8ª acima.
export function vozesTeclado(sequencia, instrumento = 'teclado', nivel = 'medio') {
  const org = instrumento === 'orgao';
  const [lo, hi, centro] = org ? [52, 69, 60] : nivel === 'avancado' ? [60, 81, 70] : [60, 79, 68];
  const out = new Map();
  let ant = null;
  for (const nome of sequencia) {
    const ac0 = analisarAcorde(nome);
    if (!ac0) continue;
    const ac = nivel === 'simples' ? triade(ac0) : ac0;
    const limite = nivel === 'avancado' && !org ? 5 : 4;
    let pcs = ac.pcs;
    if (pcs.length > limite) pcs = pcs.filter((q, k) => ac.notas[k] !== 7);
    if (pcs.length > limite) pcs = pcs.slice(0, limite);
    const cands = candidatos(pcs, lo, hi);
    if (!cands.length) continue;
    const custo = v => (ant ? distancia(v, ant) : 0) + Math.abs(v.reduce((a, n) => a + n, 0) / v.length - centro) * (ant ? 0.25 : 1);
    const v = cands.reduce((a, b) => (custo(b) < custo(a) ? b : a));
    ant = v;
    if (out.has(nome)) continue;
    const bx = ac.baixo ?? ac.raiz;
    // mão esquerda / pedal a partir de C2–B2; com baixo trocado (G/B) ou 5ª diminuta/aumentada, sem a 5ª (soaria errada)
    const baixo = 36 + bx;
    const quintaJusta = ac.notas.includes(7) && ac.baixo == null;
    const terca = [3, 4].includes(ac.notas[1]) ? ac.notas[1] : null;
    let me;
    if (org || nivel === 'simples') me = [baixo];
    else if (nivel === 'avancado' && quintaJusta && terca != null) me = [baixo, baixo + 7, baixo + 12 + terca];
    else me = quintaJusta ? [baixo, baixo + 7, baixo + 12] : [baixo, baixo + 12];
    const md = org && nivel === 'avancado' ? v.map(n => n + 12) : null;
    out.set(nome, { ac, acorde: v, baixo, me, md, nivel, inversao: rotuloInversao(ac, v[0]) });
  }
  return out;
}

const PRETA = new Set([1, 3, 6, 8, 10]);
export function svgTeclado(voz, instrumento = 'teclado') {
  const org = instrumento === 'orgao';
  const me = voz.me || [voz.baixo];
  const md = voz.md || [];
  const todas = [...me, ...voz.acorde, ...md];
  const lo = Math.floor(Math.min(...todas) / 12) * 12, hi = Math.ceil((Math.max(...todas) + 1) / 12) * 12 - 1;
  const brancas = []; for (let n = lo; n <= hi; n++) if (!PRETA.has(n % 12)) brancas.push(n);
  const W = 7, H = 46, L = brancas.length * W;
  const xBranca = n => brancas.indexOf(n) * W;
  const classe = n => (me.includes(n) ? (org ? 'd-pedal' : 'd-me') : voz.acorde.includes(n) ? (org ? 'd-me' : 'd-md') : md.includes(n) ? 'd-md' : '');
  const b = brancas.map(n => `<rect x="${xBranca(n)}" y="0" width="${W}" height="${H}" class="d-branca ${classe(n)}"/>`);
  const p = [];
  for (let n = lo; n <= hi; n++) if (PRETA.has(n % 12)) p.push(`<rect x="${xBranca(n - 1) + W * 0.65}" y="0" width="${W * 0.7}" height="${H * 0.6}" class="d-preta ${classe(n)}"/>`);
  return `<svg viewBox="-1 -1 ${L + 2} ${H + 2}" class="diag teclas" role="img" aria-label="${org ? 'Órgão' : 'Teclado'} ${voz.ac.nome}">${b.join('')}${p.join('')}</svg>`;
}
export function legendaTeclado(voz, instrumento = 'teclado') {
  const bem = voz.ac.bemol || /b/.test(voz.ac.nome);
  const nomes = v => v.map(n => nomeNota(n % 12, bem)).join(' ');
  if (instrumento === 'orgao') return `<span class="cor-pedal">Pedal: ${nomeNota(voz.baixo % 12, bem)}</span> · <span class="cor-me">M.E.: ${nomes(voz.acorde)}</span><br><span class="suave">${voz.inversao}</span> · ${voz.md ? `<span class="cor-md">M.D.: ${nomes(voz.md)} (8ª acima)</span>` : '<span class="suave">M.D.: melodia</span>'}`;
  const me = voz.me || [voz.baixo];
  const tipoME = me.length === 1 ? (voz.ac.baixo != null ? 'baixo' : 'tônica') : me.length === 3 ? (me[2] - me[0] > 12 ? 'tônica, 5ª e 10ª' : 'tônica, 5ª e 8ª') : voz.ac.baixo != null ? 'baixo e 8ª' : 'tônica e 8ª';
  return `<span class="cor-me">M.E.: ${nomes(me)}</span> <span class="suave">(${tipoME})</span><br><span class="cor-md">M.D.: ${nomes(voz.acorde)}</span> <span class="suave">· ${voz.inversao}</span>`;
}

// ---------- Flauta doce soprano (digitação barroca) ----------
// buracos: polegar (atrás), 1-2-3 (mão esquerda), 4-5-6-7 (mão direita); 1 = tapado, .5 = meio tapado
const DIGITACAO = {
  72: [1, 1, 1, 1, 1, 1, 1, 1], 73: [1, 1, 1, 1, 1, 1, 1, 0.5], 74: [1, 1, 1, 1, 1, 1, 1, 0], 75: [1, 1, 1, 1, 1, 1, 0.5, 0],
  76: [1, 1, 1, 1, 1, 1, 0, 0], 77: [1, 1, 1, 1, 1, 0, 1, 1], 78: [1, 1, 1, 1, 0, 1, 1, 0], 79: [1, 1, 1, 1, 0, 0, 0, 0],
  80: [1, 1, 1, 0, 1, 1, 0.5, 0], 81: [1, 1, 1, 0, 0, 0, 0, 0], 82: [1, 1, 0, 1, 1, 0, 0, 0], 83: [1, 1, 0, 0, 0, 0, 0, 0],
  84: [1, 0, 1, 0, 0, 0, 0, 0], 85: [0, 1, 1, 0, 0, 0, 0, 0], 86: [0, 0, 1, 0, 0, 0, 0, 0],
};
// notas para a flauta: médio = arpejo do acorde básico (1-3-5); avançado = todas as notas do acorde (7ª, 9ª...) e a 8ª
// da tônica; simplificado = uma nota só por acorde (linhaFlauta: a mais perto da anterior — contracanto)
const FAIXA = { flauta: [72, 86], transversal: [60, 85] };
const infoNota = (n, bem, inst) => ({ midi: n, nome: nomeNota(n % 12, bem), solfejo: solfejo(n % 12, bem),
  oitava: inst === 'transversal' ? (n >= 74 ? '2ª oitava' : '1ª oitava') : '' });
export function notasFlauta(nome, nivel = 'medio', inst = 'flauta') {
  const ac0 = analisarAcorde(nome);
  if (!ac0) return [];
  const ac = nivel === 'avancado' ? ac0 : triade(ac0);
  const [lo, hi] = FAIXA[inst];
  const bem = ac.bemol || /b/.test(nome);
  const out = []; let ant = lo - 1;
  for (const q of ac.pcs) {
    let n = lo + mod(q - lo);
    while (n <= ant) n += 12;
    while (n > hi) n -= 12;
    if (n < lo) n += 12;
    out.push(n); ant = n;
  }
  if (nivel === 'avancado' && out[0] + 12 <= hi && !out.includes(out[0] + 12)) out.push(out[0] + 12);
  return out.map(n => infoNota(n, bem, inst));
}
export const notasTransversal = (nome, nivel = 'medio') => notasFlauta(nome, nivel, 'transversal');
export function linhaFlauta(sequencia, inst = 'flauta') {
  const [lo, hi] = FAIXA[inst];
  const out = new Map();
  let ant = null;
  for (const nome of sequencia) {
    const ac0 = analisarAcorde(nome);
    if (!ac0) continue;
    const ac = triade(ac0);
    const opcoes = [];
    for (let n = lo; n <= hi; n++) if (ac.pcs.includes(n % 12)) opcoes.push(n);
    if (!opcoes.length) continue;
    // 1º acorde: a 3ª no meio da extensão; depois, a nota do acorde mais perto da anterior (nota comum = fica parada)
    const alvo = ant ?? (lo + hi) / 2;
    const pref = ant == null ? opcoes.filter(n => mod(n - ac.raiz) === ac.notas[1]) : opcoes;
    const n = (pref.length ? pref : opcoes).reduce((a, b) => (Math.abs(b - alvo) < Math.abs(a - alvo) ? b : a));
    ant = n;
    if (!out.has(nome)) out.set(nome, infoNota(n, ac.bemol || /b/.test(nome), inst));
  }
  return out;
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

// ---------- Flauta transversal (sistema Boehm) ----------
// [polegar, E1, E2, E3, Sol# (mindinho esq.), D1, D2, D3, Mi♭ (mindinho dir.), pé]; 1 = apertado; pé: 'C' ou 'C#'
const BOEHM = {
  60: [1, 1, 1, 1, 0, 1, 1, 1, 0, 'C'], 61: [1, 1, 1, 1, 0, 1, 1, 1, 0, 'C#'], 62: [1, 1, 1, 1, 0, 1, 1, 1, 0], 63: [1, 1, 1, 1, 0, 1, 1, 1, 1],
  64: [1, 1, 1, 1, 0, 1, 1, 0, 1], 65: [1, 1, 1, 1, 0, 1, 0, 0, 1], 66: [1, 1, 1, 1, 0, 0, 0, 1, 1], 67: [1, 1, 1, 1, 0, 0, 0, 0, 1],
  68: [1, 1, 1, 1, 1, 0, 0, 0, 1], 69: [1, 1, 1, 0, 0, 0, 0, 0, 1], 70: [1, 1, 0, 0, 0, 1, 0, 0, 1], 71: [1, 1, 0, 0, 0, 0, 0, 0, 1],
  72: [0, 1, 0, 0, 0, 0, 0, 0, 1], 73: [0, 0, 0, 0, 0, 0, 0, 0, 1],
  74: [1, 0, 1, 1, 0, 1, 1, 1, 0], 75: [1, 0, 1, 1, 0, 1, 1, 1, 1],                 // Ré e Mi♭ da 2ª oitava: 1º dedo levantado
};
for (let n = 76; n <= 85; n++) BOEHM[n] = BOEHM[n - 12];                            // Mi a Dó# da 2ª oitava: mesma posição, soprando mais
export function svgTransversal(midi) {
  const d = BOEHM[midi];
  if (!d) return '';
  const c = (v, cx, cy, r = 3.6) => `<circle cx="${cx}" cy="${cy}" r="${r}" class="d-furo ${v ? 'tapado' : ''}"/>`;
  const p = [`<rect x="9" y="2" width="10" height="104" rx="3" class="d-corpo-metal"/>`];
  p.push(c(d[0], 4, 12, 3));                                    // polegar (atrás)
  p.push(c(d[1], 14, 12), c(d[2], 14, 22), c(d[3], 14, 32));    // mão esquerda
  p.push(`<rect x="20" y="36" width="6" height="5" rx="1.5" class="d-furo ${d[4] ? 'tapado' : ''}"/>`);   // Sol#
  p.push(c(d[5], 14, 52), c(d[6], 14, 62), c(d[7], 14, 72));    // mão direita
  p.push(`<rect x="20" y="76" width="6" height="5" rx="1.5" class="d-furo ${d[8] ? 'tapado' : ''}"/>`);   // Mi♭
  p.push(`<rect x="9" y="88" width="10" height="5" rx="1.5" class="d-furo ${d[9] === 'C#' ? 'tapado' : ''}"/>`);
  p.push(`<rect x="9" y="96" width="10" height="5" rx="1.5" class="d-furo ${d[9] === 'C' ? 'tapado' : ''}"/>`);
  return `<svg viewBox="0 0 28 108" class="diag flauta transversal" role="img" aria-label="Digitação da flauta transversal">${p.join('')}</svg>`;
}

// ---------- Cartões ----------
export const INSTRUMENTOS = [['violao', 'Violão'], ['teclado', 'Teclado'], ['orgao', 'Órgão'], ['flauta', 'Flauta doce'], ['transversal', 'Flauta transversal']];
const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const NIVEIS = [['simples', 'Simplificado'], ['medio', 'Médio'], ['avancado', 'Avançado']];
// tudo o que depende da ordem dos acordes na música (inversões, região do braço, linha da flauta)
export function prepararAcordes(sequencia, instrumento, nivel = 'medio') {
  if (instrumento === 'teclado' || instrumento === 'orgao') return { nivel, vozes: vozesTeclado(sequencia, instrumento, nivel) };
  if (instrumento === 'violao' && nivel === 'avancado') return { nivel, formas: formasViolaoSequencia(sequencia) };
  if ((instrumento === 'flauta' || instrumento === 'transversal') && nivel === 'simples') return { nivel, linha: linhaFlauta(sequencia, instrumento) };
  return { nivel };
}
export function cartaoAcorde(nome, instrumento, ctx = {}) {
  const nivel = ctx.nivel || 'medio';
  let corpo = '', legenda = '';
  if (instrumento === 'violao') {
    const f = ctx.formas?.get(nome) || formaViolao(nome, nivel);
    corpo = svgViolao(nome, f);
    const tri = nivel === 'simples' ? analisarAcorde(nome) : null;
    const reduzido = tri && tri.notas.length > 3 ? ` (tocando ${nomeNota(tri.raiz, tri.bemol)}${tri.notas[1] === 3 ? 'm' : ''})` : '';
    legenda = (f?.pestana ? `pestana na ${f.pestana.casa}ª casa` : f ? '' : 'sem forma simples') + reduzido;
  } else if (instrumento === 'teclado' || instrumento === 'orgao') {
    const v = ctx.vozes?.get(nome);
    if (v) { corpo = svgTeclado(v, instrumento); legenda = legendaTeclado(v, instrumento); }
  } else if (instrumento === 'flauta' || instrumento === 'transversal') {
    const ns = nivel === 'simples' ? [ctx.linha?.get(nome)].filter(Boolean) : notasFlauta(nome, nivel, instrumento);
    const svg = instrumento === 'flauta' ? svgFlauta : svgTransversal;
    corpo = `<div class="flauta-notas">${ns.map(n => `<div class="flauta-nota">${svg(n.midi)}<div class="pequeno"><b>${escH(n.nome)}</b><br>${escH(n.solfejo)}${n.oitava ? `<br><span class="suave">${n.oitava}</span>` : ''}</div></div>`).join('')}</div>`;
    legenda = nivel === 'simples' ? 'nota do contracanto' : nivel === 'avancado' ? 'arpejo completo' : 'arpejo do acorde';
  }
  return `<div class="cartao-acorde ${instrumento}"><div class="nome-acorde">${escH(nome)}</div>${corpo || '<span class="suave pequeno">?</span>'}${legenda ? `<div class="legenda-acorde pequeno">${legenda}</div>` : ''}</div>`;
}
