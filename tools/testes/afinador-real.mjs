// Teste do afinador com RUÍDO DE VERDADE e palhetada realista, nas 3 precisões:
//  - corda com ataque agudo (+8 cents descendo até a nota em 250 ms), inarmonicidade, volume que oscila (±8 %) e decai (τ = 1 s);
//  - estalo da palheta (5 ms de banda larga) e batida do dedo no tampo (40 Hz);
//  - ambiente: ruído branco + ruído grave de sala (ventilador, ar-condicionado) + conversa ao fundo (vozes de 150-400 Hz).
// Mede quando o valor fica DEFINIDO (som estabilizado), o erro dele, se oscila depois de definido e se algo é
// definido sem nenhuma corda tocando.
//   node tools/testes/afinador-real.mjs
import { lerWav } from './wav.mjs';
import { criarLeitor, centsEntre, filtrarEntrada, PRECISOES, aceitarCordas, direcaoCedo } from '../../app/js/afinador-nucleo.js';

const TAXA = 48000, N = 16384, DUR = 4.5, T0 = 0.5;
const FILTRO = !!process.env.FILTRO;                       // FILTRO=1: com o filtro de ruído ligado
let semente = 21; const aleat = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(aleat() + 1e-12)) * Math.cos(6.283185307 * aleat());
const AMBIENTES = {
  // níveis de ruído de microfone de celular (RMS, dBFS aprox.): sala calma −53, sala com ventilador −43, grupo conversando −36
  'sala calma': { w: 0.001, l: 0.002, voz: 0 },
  'sala com ventilador': { w: 0.003, l: 0.006, voz: 0.002 },
  'igreja com conversa': { w: 0.006, l: 0.012, voz: 0.006 },
};

// ambiente REAL gravado (AMBIENTE_WAV=caminho.wav a 48 kHz; AMB_ESCALA multiplica o volume; SO_REAL=1 testa só ele)
const REAL = process.env.AMBIENTE_WAV ? lerWav(process.env.AMBIENTE_WAV) : null, ESC = +(process.env.AMB_ESCALA || 1);
if (REAL) { if (REAL.taxa !== TAXA) throw new Error('a gravação precisa ser de 48 kHz'); if (process.env.SO_REAL) for (const k of Object.keys(AMBIENTES)) delete AMBIENTES[k]; AMBIENTES['SEU AMBIENTE (gravado)'] = { real: true }; }
function ambiente(n, amb) {
  if (amb.real) { const ini = Math.floor(aleat() * (REAL.x.length - n)), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = REAL.x[ini + i] * ESC; return x; }
  const { w, l, voz } = amb;
  const x = new Float32Array(n), a = 1 - Math.exp(-2 * Math.PI * 300 / TAXA), ganho = l / Math.sqrt(a / (2 - a));
  let lp = 0;
  const vozes = [0, 1, 2].map(() => ({ f: 150 + aleat() * 250, fase: aleat() * 6.28, lento: aleat() * 2 }));
  for (let i = 0; i < n; i++) {
    const t = i / TAXA, b = gauss(); lp += a * (b - lp);
    let v = 0; for (const o of vozes) { o.fase += 6.283185307 * (o.f + 30 * Math.sin(1.7 * t + o.lento)) / TAXA; v += Math.sin(o.fase) * (0.5 + 0.5 * Math.sin(2.3 * t + o.lento)); }
    x[i] = w * b + ganho * lp + voz * v;
  }
  return x;
}

function corda(f0, desvio, pico, amb) {
  const n = Math.round(DUR * TAXA), x = ambiente(n, amb), f = f0 * Math.pow(2, desvio / 1200), B = 0.00015;
  const amp = [0.6, 1, 0.7, 0.5, 0.35, 0.25, 0.15], fase = amp.map(() => aleat() * 6.283), norma = Math.sqrt(amp.reduce((s, a) => s + a * a / 2, 0));
  for (let i = 0; i < n; i++) {
    const t = i / TAXA, tn = t - T0; if (tn < 0) continue;
    const ataque = Math.pow(2, 8 * Math.exp(-tn / 0.08) / 1200), trem = 1 + 0.08 * Math.sin(6.283185307 * 3 * tn);
    let s = 0;
    amp.forEach((a, k) => { const h = k + 1; fase[k] += 6.283185307 * h * f * Math.sqrt(1 + B * h * h) * ataque / TAXA; s += a * Math.sin(fase[k]) * Math.exp(-tn * (1 + 0.2 * k)); });
    x[i] += pico * trem * s / norma
      + pico * 0.3 * gauss() * Math.exp(-tn / 0.004)                                     // estalo da palheta
      + pico * 0.5 * Math.sin(6.283185307 * 40 * tn) * Math.exp(-tn / 0.02);             // batida do dedo
  }
  return { x: filtrarEntrada(x, TAXA), alvo: f * Math.sqrt(1 + B) };
}

function rodar(prec, sinal, desvio) {
  const L = criarLeitor({ ...prec.leitor, aceitar: FILTRO ? aceitarCordas() : null }), tol = prec.tol;
  let tDir = null, tDef = null, cDef = null, oscila = 0, erradas = 0;
  for (let ms = 400; ms <= DUR * 1000; ms += prec.quadro) {
    const fim = Math.round(ms / 1000 * TAXA); if (fim < N) continue;
    const r = L.processar(sinal.x.subarray(fim - N, fim), TAXA, ms), t = ms - T0 * 1000;
    if (r.f === undefined) continue;
    const c = centsEntre(r.f, sinal.alvo);
    if (Math.abs(c) > 100 && r.tipo === 'leitura') { erradas++; continue; }
    if (tDir === null && (r.tipo === 'leitura' || (r.tipo === 'medindo' && r.estavelCedo)) && Math.abs(desvio) > tol + 3) {
      if (direcaoCedo(c, tol) === (desvio < 0 ? 'aperte' : 'afrouxe')) tDir = t;
    }
    if (r.definida) {
      if (tDef === null) { tDef = t; cDef = c; }
      else if (t <= 3000) oscila = Math.max(oscila, Math.abs(c - cDef));    // quanto o valor mostrado anda depois de definido
    }
  }
  return { tDir, tDef, erroDef: cDef === null ? null : Math.abs(cDef), oscila, erradas };
}

const med = a => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null;
const fmt = v => v === null ? '  — ' : String(Math.round(v)).padStart(4);
const cordas = [82.4069, 110, 195.9977, 329.6276];
let falhou = false;
const casos = [];
for (const [nome, amb] of Object.entries(AMBIENTES)) for (const pico of [0.1, 0.03]) for (const f0 of cordas) for (const d of [-20, 12, -2])
  casos.push({ nome, pico, f0, d, sinal: corda(f0, d, pico, amb) });

console.log('ambiente              precisão  | 1ª direção (mediana/pior ms) | valor DEFINIDO (mediana/pior ms) | erro do definido (máx cents) | oscila depois (máx) | sem definir');
for (const grupo of [{ nome: 'CORDA FORTE (pico 0,1: perto do microfone)', pico: 0.1, exige: true }, { nome: 'CORDA FRACA (pico 0,03: longe ou tocada leve)', pico: 0.03, exige: false }]) {
console.log('\n' + grupo.nome);
for (const nome of Object.keys(AMBIENTES)) for (const [pn, prec] of Object.entries(PRECISOES)) {
  const rs = casos.filter(c => c.nome === nome && c.pico === grupo.pico).map(c => ({ ...rodar(prec, c.sinal, c.d), d: c.d, f0: c.f0, pico: c.pico }));
  const dir = rs.filter(r => r.tDir !== null).map(r => r.tDir), def = rs.filter(r => r.tDef !== null).map(r => r.tDef);
  const semDef = rs.filter(r => r.tDef === null).length, erro = Math.max(0, ...rs.filter(r => r.erroDef !== null).map(r => r.erroDef));
  const osc = Math.max(0, ...rs.filter(r => r.tDef !== null).map(r => r.oscila)), erradas = rs.reduce((s, r) => s + r.erradas, 0);
  console.log(`${nome.padEnd(21)} ${pn.padEnd(9)} | ${fmt(med(dir))} / ${fmt(Math.max(0, ...dir))}              | ${fmt(med(def))} / ${fmt(Math.max(0, ...def))}                  | ${erro.toFixed(2).padStart(5)}                      | ${osc.toFixed(2).padStart(5)}               | ${semDef}/${rs.length}${erradas ? ` · ${erradas} leituras >100c` : ''}`);
  if (process.env.DETALHE) for (const r of rs) if (r.tDef === null || r.erroDef > 2 || r.oscila > 2) console.log(`    ${r.f0.toFixed(0)} Hz desvio ${r.d} pico ${r.pico}: ${r.tDef === null ? 'não definiu' : `definiu ${Math.round(r.tDef)} ms erro ${r.erroDef.toFixed(1)} oscila ${r.oscila.toFixed(1)}`}`);
  const sala = nome !== 'igreja com conversa';
  if (grupo.exige && sala && ((semDef > (pn === 'maxima' ? 3 : 0)) || erro > 1.5 || osc > 1.5)) { falhou = true; console.log('    ^ FALHOU (corda forte em sala: tem que definir sempre, erro ≤ 1,5 cent e sem andar mais de 1,5 cent depois)'); }
  // régua por ambiente: salas 2,5 cents; ambiente muito barulhento (grupo conversando) 3,0 — ainda dentro da tolerância Normal (±4)
  const limiteErro = sala ? 2.5 : 3.0;
  if (erro > limiteErro) { falhou = true; console.log(`    ^ FALHOU (valor definido com erro > ${String(limiteErro).replace('.', ',')} cents)`); }
}
}

// sem corda nenhuma: o ambiente sozinho não pode ser definido como nota
let fantasmas = 0;
for (const [nome, amb] of Object.entries(AMBIENTES)) for (const [pn, prec] of Object.entries(PRECISOES)) {
  const x = filtrarEntrada(ambiente(Math.round(DUR * TAXA), amb), TAXA), L = criarLeitor({ ...prec.leitor, aceitar: FILTRO ? aceitarCordas() : null }); let k = 0;
  for (let ms = 400; ms <= DUR * 1000; ms += prec.quadro) { const fim = Math.round(ms / 1000 * TAXA); if (fim < N) continue; const r = L.processar(x.subarray(fim - N, fim), TAXA, ms); if (r.definida || r.provisoria) k++; }
  if (k) { console.log(`sem corda · ${nome} · ${pn}: ${k} quadros com valor definido`); fantasmas += k; }
}
console.log(fantasmas ? `FALHOU: ${fantasmas} quadros definidos só com ruído` : 'sem corda: nada foi definido só com o ruído do ambiente');
if (fantasmas || falhou) { console.log('FALHOU'); process.exit(1); }
