// Teste dos instrumentos: cavaquinho (2 afinações, palhetada) e violino (arco: ataque lento, som contínuo, com e sem vibrato).
// Para cada corda e desvio mede: se identifica a corda certa, quando o valor fica DEFINIDO e o erro dele, erro de oitava e
// (violino com vibrato) quanto a leitura se afasta da média. Ruído: sala com ventilador sintético, ou a gravação real
// (AMBIENTE_WAV=caminho.wav a 48 kHz, AMB_ESCALA).
//   node tools/testes/afinador-instrumentos.mjs
import { criarLeitor, centsEntre, filtrarEntrada, PRECISOES, INSTRUMENTOS, cordaDe, freqDoMidi, midiDe, aceitarCordas } from '../../app/js/afinador-nucleo.js';
import { lerWav } from './wav.mjs';
const TAXA = 48000, N = 16384, DUR = 4.2, T0 = 0.5, FILTRO = !!process.env.FILTRO;
const REAL = process.env.AMBIENTE_WAV ? lerWav(process.env.AMBIENTE_WAV) : null, ESC = +(process.env.AMB_ESCALA || 1);
let semente = 33; const aleat = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(aleat() + 1e-12)) * Math.cos(6.283185307 * aleat());
function ambiente(n) {
  if (REAL) { const ini = Math.floor(aleat() * (REAL.x.length - n)), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = REAL.x[ini + i] * ESC; return x; }
  const x = new Float32Array(n), a = 1 - Math.exp(-2 * Math.PI * 300 / TAXA), g = 0.002 / Math.sqrt(a / (2 - a)); let lp = 0;   // sala com ventilador
  for (let i = 0; i < n; i++) { const b = gauss(); lp += a * (b - lp); x[i] = 0.003 * b + g * lp * 1.4 * 3.3; }
  return x;
}
// palhetada (cavaquinho: brilhante, decai rápido) ou arco (violino: ataque lento, contínuo, harmônicos 1/h, vibrato opcional)
function nota(f0, desvio, tipo, vib) {
  const n = Math.round(DUR * TAXA), x = ambiente(n), f = f0 * Math.pow(2, desvio / 1200), nh = tipo === 'arco' ? 12 : 8, fase = Array.from({ length: nh }, () => aleat() * 6.283);
  const pico = tipo === 'arco' ? 0.05 : 0.1, norma = Math.sqrt(Array.from({ length: nh }, (_, k) => (tipo === 'arco' ? 1 / (k + 1) : 1 / Math.pow(k + 1, 0.7)) ** 2 / 2).reduce((s, v) => s + v, 0));
  for (let i = 0; i < n; i++) {
    const t = i / TAXA, tn = t - T0; if (tn < 0) continue;
    let env, cents = 0;
    if (tipo === 'arco') { env = Math.min(1, tn / 0.12) * (1 + 0.05 * Math.sin(2.3 * tn)) * (tn > 3.6 ? Math.max(0, 1 - (tn - 3.6) / 0.4) : 1); cents = vib * Math.sin(6.283185307 * 5.5 * tn) * Math.min(1, tn / 0.8); }
    else { env = Math.exp(-tn / 0.5); cents = 8 * Math.exp(-tn / 0.06); }
    const ff = f * Math.pow(2, cents / 1200); let s = 0;
    for (let k = 0; k < nh; k++) { fase[k] += 6.283185307 * (k + 1) * ff / TAXA; s += (tipo === 'arco' ? 1 / (k + 1) : 1 / Math.pow(k + 1, 0.7)) * Math.sin(fase[k]); }
    x[i] += pico * env * s / norma;
  }
  return filtrarEntrada(x, TAXA);
}
const casos = [];
for (const [inst, cfg] of [['cavaquinho', { tipo: 'palheta', afins: ['padrao', 'natural'] }], ['violino', { tipo: 'arco', afins: ['padrao'] }]])
  for (const afin of cfg.afins) for (const c of INSTRUMENTOS[inst].afinacoes[afin].cordas) casos.push({ inst, afin, corda: c, tipo: cfg.tipo, f0: freqDoMidi(midiDe(c.nome, c.oitava), 440) });
const prec = PRECISOES.normal;
console.log('instrumento · corda     | vibrato | corda certa | definiu (ms) · erro (c)         | oitava errada | leitura afasta da média');
let falhou = false;
for (const vib of [0, 15]) for (const cs of casos) {
  if (vib && cs.tipo !== 'arco') continue;
  const ids = [], defs = [], oit = [], afast = []; let semDef = 0, total = 0;
  for (const d of [-20, 12, -2]) {
    const x = nota(cs.f0, d, cs.tipo, vib), cordas = INSTRUMENTOS[cs.inst].afinacoes[cs.afin].cordas, L = criarLeitor({ ...prec.leitor, aceitar: FILTRO ? aceitarCordas(440, 70, cordas) : null });
    let achou = false, pontos = [], idOk = 0, idN = 0, oitava = 0; total++;
    for (let ms = 400; ms <= DUR * 1000; ms += prec.quadro) {
      const fim = Math.round(ms / 1000 * TAXA); if (fim < N) continue; const t = ms / 1000 - T0, r = L.processar(x.subarray(fim - N, fim), TAXA, ms);
      if (r.tipo !== 'leitura') continue; const f = r.definida ? r.f : r.vivo, c = centsEntre(f, cs.f0 * Math.pow(2, d / 1200)), ct = cordaDe(f, 440, cordas);
      if (t > 0.6) { idN++; if (ct.corda === cs.corda.corda) idOk++; if (Math.abs(c) > 400) oitava++; pontos.push(c); }
      if (r.definida && !achou) { achou = true; defs.push([t * 1000, Math.abs(c)]); }
    }
    if (!achou) semDef++; ids.push(idN ? idOk / idN : 0); oit.push(oitava);
    if (pontos.length > 5) { const m = pontos.reduce((s, v) => s + v, 0) / pontos.length; afast.push(Math.max(...pontos.map(p => Math.abs(p - m)))); }
  }
  const idm = ids.reduce((s, v) => s + v, 0) / ids.length, oitavaTot = oit.reduce((s, v) => s + v, 0), erroMax = defs.length ? Math.max(...defs.map(v => v[1])) : null, tMed = defs.length ? defs.map(v => v[0]).sort((a, b) => a - b)[defs.length >> 1] : null;
  console.log(`${(cs.inst + ' ' + (cs.afin === 'natural' ? 'nat.' : '') + cs.corda.corda + 'ª ' + cs.corda.nome + cs.corda.oitava).padEnd(23)} | ${String(vib).padStart(2)} c    | ${(100 * idm).toFixed(0).padStart(4)} %      | ${(defs.length + '/' + total).padEnd(4)} em ${tMed === null ? '  — ' : String(Math.round(tMed)).padStart(4)} ms · erro máx ${erroMax === null ? ' — ' : erroMax.toFixed(2)}   | ${String(oitavaTot).padStart(3)} quadros   | ${afast.length ? Math.max(...afast).toFixed(1) : '—'} c`);
  if (!vib && (idm < 0.95 || oitavaTot > 0 || semDef > 0 || (erroMax !== null && erroMax > 2.5))) { falhou = true; console.log('    ^ FALHOU (sem vibrato: tem que identificar a corda ≥95%, definir sempre, sem erro de oitava e erro ≤ 2,5 cents)'); }
}
if (falhou) process.exit(1);
