// Teste do TOQUE FORTE no meio do ajuste: a corda está sendo afinada (tarraxa girando de −25 a −8 cents) e o músico toca
// forte de novo duas vezes (volume ×5, ataque ~10 cents mais agudo que decai em 60 ms, estalo da palheta e batida do dedo).
// O afinador não pode: mostrar valor errado por muito tempo, saltar de valor, sumir (voltar a "medindo" em branco) nem
// perder o acompanhamento da tarraxa. Mede o erro da tela contra a corda real depois de cada toque.
//   node tools/testes/afinador-toque.mjs
import { criarLeitor, centsEntre, filtrarEntrada, PRECISOES, aceitarCordas } from '../../app/js/afinador-nucleo.js';

const TAXA = 48000, N = 16384, DUR = 4.6, ALVO = +(process.env.FREQ || 110);   // FREQ=82.41|110|146.83|196|246.94|329.63
const FILTRO = !!process.env.FILTRO;
let semente = 5; const aleat = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(aleat() + 1e-12)) * Math.cos(6.283185307 * aleat());
const TOQUES = [{ t: 0.5, a: 0.06 }, { t: 1.5, a: 0.3 }, { t: 2.6, a: 0.3 }];            // 1º suave (começa a afinar); 2 fortes
const verdade = t => t < 1.0 ? -25 : t < 2.0 ? -25 + 17 * (t - 1.0) : -8;                 // tarraxa de −25 a −8 em 1 s

function sinal(ruido) {
  const n = Math.round(DUR * TAXA), x = new Float32Array(n), amp = [0.6, 1, 0.7, 0.5, 0.35, 0.25], fase = amp.map(() => aleat() * 6.28);
  let lp = 0; const a = 1 - Math.exp(-2 * Math.PI * 300 / TAXA);
  for (let i = 0; i < n; i++) {
    const t = i / TAXA, b = gauss(); lp += a * (b - lp);
    let env = 0, glide = 0, ruidoToque = 0;
    for (const p of TOQUES) { const d = t - p.t; if (d < 0) continue; env += p.a * Math.exp(-d / 0.9); glide += 10 * Math.exp(-d / 0.06) * (p.a > 0.1 ? 1 : 0.8); ruidoToque += p.a * (0.3 * gauss() * Math.exp(-d / 0.004) + 0.5 * Math.sin(6.283185307 * 40 * d) * Math.exp(-d / 0.02)); }
    const f = ALVO * Math.pow(2, (verdade(t) + glide) / 1200);
    let s = 0; amp.forEach((p, k) => { fase[k] += 6.283185307 * (k + 1) * f / TAXA; s += p * Math.sin(fase[k]) * Math.exp(-t * 0.1 * k); });
    x[i] = env * s / 1.05 + ruidoToque + ruido.w * b + 1.4 * ruido.l * lp * 3.3;
  }
  return filtrarEntrada(x, TAXA);
}

const AMB = { 'sala calma': { w: 0.001, l: 0.0005 }, 'sala com ventilador': { w: 0.003, l: 0.002 } };
let falhou = false;
for (const [nomeAmb, amb] of Object.entries(AMB)) {
  const x = sinal(amb);
  for (const [pn, prec] of Object.entries(PRECISOES)) {
    const L = criarLeitor({ ...prec.leitor, aceitar: FILTRO ? aceitarCordas() : null, ...(process.env.LEAD ? { lead: +process.env.LEAD } : {}) }); const linha = []; let sumiu = 0, erroPos = [0, 0], tempoErrado = [0, 0], saltoMax = 0, ant = null;
    for (let ms = 400; ms <= DUR * 1000; ms += prec.quadro) {
      const fim = Math.round(ms / 1000 * TAXA); if (fim < N) continue;
      const t = ms / 1000, r = L.processar(x.subarray(fim - N, fim), TAXA, ms);
      const f = r.tipo === 'leitura' ? (r.definida ? r.f : r.vivo) : null;
      const real = verdade(t), c = f === null ? null : centsEntre(f, ALVO), e = c === null ? null : Math.abs(c - real);
      if (f === null && t > 1.0) sumiu++;                                              // tela sem valor depois de já estar medindo
      if (c !== null && ant !== null) saltoMax = Math.max(saltoMax, Math.abs(c - ant)); if (c !== null) ant = c;
      for (let k = 0; k < 2; k++) { const p = TOQUES[k + 1]; if (t >= p.t && t < p.t + 0.6 && e !== null) { erroPos[k] = Math.max(erroPos[k], e); if (e > 4) tempoErrado[k] += prec.quadro; } }
      if (process.env.LINHA && Math.round(ms) % 100 < prec.quadro) linha.push(`${t.toFixed(1)}s real ${real.toFixed(0)} tela ${c === null ? '—' : c.toFixed(0)}${r.definida ? ' D' : ''}`);
    }
    console.log(`${nomeAmb.padEnd(20)} ${pn.padEnd(9)} | depois do 1º toque forte: erro máx ${erroPos[0].toFixed(1)} c, errado >4c por ${tempoErrado[0]} ms | depois do 2º: erro máx ${erroPos[1].toFixed(1)} c, errado por ${tempoErrado[1]} ms | maior salto ${saltoMax.toFixed(1)} c | quadros sem valor ${sumiu}`);
    if (process.env.LINHA) console.log('   ' + linha.join(' | '));
    if (Math.max(...erroPos) > 6 || Math.max(...tempoErrado) > 250) falhou = true;
  }
}
if (falhou) { console.log('FALHOU: o toque forte atrapalha o acompanhamento (erro > 6 cents ou > 250 ms errado)'); process.exit(1); }
