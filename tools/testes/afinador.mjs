// Teste de precisão do afinador com sinais sintéticos parecidos com violão
// (fundamental + harmônicos fortes, 2º harmônico mais forte que o fundamental, leve inarmonicidade, ruído)
import { detectarFrequencia, refinarFundamental, criarEstabilizador, centsEntre, cordaDe } from '../../app/js/afinador-nucleo.js';
const TAXA = 48000, N = 16384;   // janela do app (~0,34 s)
let semente = 7; const aleat = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
function violao(f, desvioCents, t0, { ruido = 0.01, B = 0.0001 } = {}) {
  const f0 = f * Math.pow(2, desvioCents / 1200), x = new Float32Array(N);
  const amp = [0.6, 1.0, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1];      // 2º harmônico mais forte (comum no violão)
  const fase = amp.map(() => aleat() * 6.283);
  for (let i = 0; i < N; i++) {
    const t = t0 + i / TAXA; let s = 0;
    amp.forEach((a, k) => { const h = k + 1, fh = h * f0 * Math.sqrt(1 + B * h * h); s += a * Math.sin(6.283185307 * fh * t + fase[k]); });
    x[i] = 0.2 * s * Math.exp(-t * 0.8) + ruido * (aleat() * 2 - 1);
  }
  return x;
}
const cordas = [82.4069, 110, 146.8324, 195.9977, 246.9417, 329.6276];
let pior = 0, piorEst = 0, oitava = 0, total = 0;
for (const f of cordas) for (const d of [-37.3, -8.6, -0.4, 0, 0.3, 4.2, 19.9]) for (const [ruido, B] of [[0.002, 0], [0.01, 0.0001], [0.03, 0.0003]]) {
  const est = criarEstabilizador(7);
  let erroQuadro = 0;
  for (let q = 0; q < 10; q++) {
    const sinal = violao(f, d, 0.3 + q * 0.05, { ruido, B });
    const r = detectarFrequencia(sinal.subarray(sinal.length - 4096), TAXA);
    if (!r) continue;
    r.freq = refinarFundamental(sinal, TAXA, r.freq);
    const alvo = f * Math.pow(2, d / 1200) * Math.sqrt(1 + B), e = centsEntre(r.freq, alvo);   // 1º parcial verdadeiro
    if (Math.abs(e) > 600) { oitava++; continue; }
    erroQuadro = Math.max(erroQuadro, Math.abs(e)); est.adicionar(r.freq);
  }
  const v = est.valor(), eEst = Math.abs(centsEntre(v.freq, f * Math.pow(2, d / 1200) * Math.sqrt(1 + B)));
  pior = Math.max(pior, erroQuadro); piorEst = Math.max(piorEst, eEst); total++;
  if (eEst > 0.1) console.log(`  ${f} Hz ${d} c ruído ${ruido} B ${B}: erro ${eEst.toFixed(3)} c`);
}
console.log(`${total} casos · erro máx. por leitura ${pior.toFixed(3)} cent · após estabilizar ${piorEst.toFixed(3)} cent · erros de oitava ${oitava}`);
// inarmonicidade real aumenta os harmônicos: o afinador mede o PERÍODO, que fica entre o fundamental e os parciais — medido acima com B
console.log('corda:', cordaDe(110.3).nome + cordaDe(110.3).oitava, cordaDe(110.3).cents.toFixed(2), 'cents');
