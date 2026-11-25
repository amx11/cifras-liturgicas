// Teste da TARRAXA LENTA (e de várias velocidades): corda soa parada, o valor fica definido e SÓ DEPOIS a tarraxa começa a
// girar. O valor definido não pode ficar travado: a tela tem de acompanhar (erro ≤ 4 cents) e terminar no valor certo.
//   node tools/testes/afinador-lento.mjs            (DETALHE=1 mostra a linha do tempo dos casos com falha)
import { criarLeitor, centsEntre, filtrarEntrada, PRECISOES } from '../../app/js/afinador-nucleo.js';
const TAXA = 48000, N = 16384, T0 = 0.5, GIRO = 2.5;
let semente = 9; const aleat = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(aleat() + 1e-12)) * Math.cos(6.283185307 * aleat());
function sinal(f0, de, vel, dur, ruido) {                       // de → 0 cents a `vel` cents/s, começando em GIRO
  const n = Math.round(dur * TAXA), x = new Float32Array(n), amp = [0.6, 1, 0.7, 0.5, 0.35, 0.2], fase = amp.map(() => aleat() * 6.28);
  for (let i = 0; i < n; i++) {
    const t = i / TAXA, tn = t - T0, c = cents(t, de, vel), f = f0 * 2 ** (c / 1200); let s = 0;
    if (tn >= 0) { const env = Math.min(1, tn / 0.015) * 0.13 * (0.35 + 0.65 * Math.exp(-tn / 2.5)); amp.forEach((a, k) => { fase[k] += 6.283185307 * (k + 1) * f / TAXA; s += a * Math.sin(fase[k]); }); s *= env; }
    x[i] = s + ruido * gauss();
  }
  return filtrarEntrada(x, TAXA);
}
const cents = (t, de, vel) => t < GIRO ? de : Math.sign(de) * Math.max(0, Math.abs(de) - vel * (t - GIRO));
let falhas = 0;
console.log('precisão  corda    de    giro     | erro médio girando | pior erro travado | 1 s depois de parar');
for (const [pn, prec] of Object.entries(PRECISOES)) for (const f0 of [82.407, 110, 146.832, 329.628]) for (const de of [22, -14]) for (const vel of [1, 2, 4, 7, 12, 25]) {
  const fimGiro = GIRO + Math.abs(de) / vel, dur = fimGiro + 1.6, x = sinal(f0, de, vel, dur, 0.0006), L = criarLeitor({ ...prec.leitor });
  let soma = 0, k = 0, pior = 0, fim = null; const linha = [];
  for (let ms = 400; ms <= dur * 1000; ms += prec.quadro) {
    const e = Math.round(ms / 1000 * TAXA); if (e < N) continue; const t = ms / 1000, r = L.processar(x.subarray(e - N, e), TAXA, ms);
    if (r.tipo !== 'leitura') continue; const tela = centsEntre(r.definida ? r.f : r.vivo, f0), erro = Math.abs(tela - cents(t, de, vel));
    if (t > GIRO + 0.3 && t < fimGiro) { soma += erro; k++; pior = Math.max(pior, erro); }
    if (t > fimGiro + 1) fim = Math.max(fim ?? 0, erro);
    if (Math.round(ms / prec.quadro) % Math.round(400 / prec.quadro) === 0) linha.push(`${t.toFixed(1)}s ${cents(t, de, vel).toFixed(0)}→${tela.toFixed(0)}${r.definida ? 'D' : r.movendo ? 'm' : ''}`);
  }
  const ruim = pior > 5 || fim === null || fim > prec.tol; if (ruim) falhas++;
  if (ruim || process.env.TUDO) { console.log(`${pn.padEnd(9)} ${f0.toFixed(0).padStart(4)} Hz ${String(de).padStart(4)}c ${String(vel).padStart(3)} c/s  | ${(k ? soma / k : 0).toFixed(1).padStart(5)} c            | ${pior.toFixed(1).padStart(5)} c           | ${fim === null ? ' —' : fim.toFixed(1)} c${ruim ? '  FALHOU' : ''}`); if (process.env.DETALHE) console.log('     ' + linha.join(' | ')); }
}
console.log(falhas ? `FALHOU: ${falhas} casos` : 'ok: acompanha a tarraxa em todas as velocidades'); if (falhas) process.exit(1);
