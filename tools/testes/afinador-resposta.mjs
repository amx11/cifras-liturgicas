// Teste de TEMPO DE RESPOSTA do afinador ("Aperte"/"Afrouxe" e "Afinado"), com violão simulado:
// 1) palhetada com a corda 20 cents grave: quanto tempo até o afinador dizer para que lado girar;
// 2) girando a tarraxa com a corda soando (de −25 a 0 cents em 1 s): atraso do ponteiro e quanto tempo depois de a
//    corda chegar na nota aparece "Afinado".
// Mesmo caminho do app: filtros de entrada, leitor contínuo, quadro a cada QUADRO ms.
//   node tools/testes/afinador-resposta.mjs
import { criarLeitor, centsEntre, filtrarEntrada, PRECISOES, direcaoCedo } from '../../app/js/afinador-nucleo.js';

const TAXA = 48000, N = 16384;
let semente = 3; const aleat = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(aleat() + 1e-12)) * Math.cos(6.283185307 * aleat());

// corda com afinação variando no tempo (fase integrada), decaimento lento (corda soando enquanto gira a tarraxa)
function corda(f0, centsDe, dur, pico = 0.03) {
  const n = Math.round(dur * TAXA), x = new Float32Array(n), amp = [0.6, 1, 0.7, 0.5, 0.35, 0.25];
  const fases = amp.map(() => aleat() * 6.283);
  for (let i = 0; i < n; i++) {
    const t = i / TAXA, tn = t - 0.5, f = f0 * Math.pow(2, centsDe(t) / 1200);
    let s = 0;
    if (tn >= 0) amp.forEach((a, k) => { fases[k] += 6.283185307 * (k + 1) * f / TAXA; s += a * Math.sin(fases[k]) * Math.exp(-tn * (0.35 + 0.15 * k)); });
    x[i] = pico * s + 0.0006 * gauss();
  }
  return filtrarEntrada(x, TAXA);
}

function simular(x, centsDe, opcoes, tol, quadro) {
  const L = criarLeitor(opcoes), saida = [];
  for (let ms = 400; ms <= x.length / TAXA * 1000; ms += quadro) {
    const fim = Math.round(ms / 1000 * TAXA); if (fim < N) continue;
    const r = L.processar(x.subarray(fim - N, fim), TAXA, ms);
    const alvo = 110;
    let dir = null, c = null;
    let cedo = false;
    if (r.tipo === 'leitura') {
      c = centsEntre(r.definida ? r.f : r.vivo, alvo);       // o que a tela mostra: fixo se definido, senão ao vivo
      // "Afinado" e a cor só valem com o valor DEFINIDO (som estabilizado); antes disso só o aviso de lado, quando bem fora
      if (r.definida) dir = Math.abs(c) <= tol ? 'afinado' : c < 0 ? 'aperte' : 'afrouxe';
      else if (opcoes.direcaoCedo) { dir = direcaoCedo(c, tol); cedo = true; }
      else dir = Math.abs(c) <= tol ? 'afinado' : c < 0 ? 'aperte' : 'afrouxe';
    }
    else if (r.tipo === 'medindo' && r.estavelCedo && opcoes.direcaoCedo) { c = centsEntre(r.f, alvo); dir = direcaoCedo(c, tol); cedo = true; }
    saida.push({ ms, dir, c, cedo, real: centsDe(ms / 1000) });
  }
  return saida;
}

const ANTIGO = { ...PRECISOES.maxima.leitor, direcaoCedo: false };
let falhou = false;
for (const [nome, prec] of Object.entries(PRECISOES)) {
  const tol = prec.tol, novo = { ...prec.leitor, direcaoCedo: true };
  // 1) palhetada 20 cents grave
  const fixo = () => -20, x1 = corda(110, fixo, 2.0);
  const tDir = s => { const p = s.find(e => e.dir === 'aperte'); return p ? p.ms - 500 : null; };
  const a1 = tDir(simular(x1, fixo, ANTIGO, tol, 35)), n1 = tDir(simular(x1, fixo, novo, tol, prec.quadro));
  // 2) tarraxa: −25 → 0 cents entre 1,0 s e 2,0 s, depois parada
  const giro = t => t < 1.0 ? -25 : t < 2.0 ? -25 + 25 * (t - 1.0) : 0, x2 = corda(110, giro, 3.2);
  const chegou = 1000 * (1.0 + (25 - tol) / 25);           // instante em que a corda entra na tolerância
  const medir = s => {
    const p = s.find(e => e.ms > chegou && e.dir === 'afinado');
    const atraso = s.filter(e => e.ms >= 1150 && e.ms <= 2000 && e.c !== null).map(e => Math.abs(e.c - e.real));
    return { afinado: p ? p.ms - chegou : null, ponteiro: atraso.length ? atraso.reduce((a, b) => a + b, 0) / atraso.length : null };
  };
  const a2 = medir(simular(x2, giro, ANTIGO, tol, 35)), n2 = medir(simular(x2, giro, novo, tol, prec.quadro));
  console.log(`${nome.padEnd(9)} (±${tol}) | "Aperte" após palhetada: antes ${a1} ms → agora ${n1} ms`
    + ` | "Afinado" após chegar na nota: antes ${Math.round(a2.afinado)} ms → agora ${Math.round(n2.afinado)} ms`
    + ` | ponteiro atrasado (girando): antes ${a2.ponteiro.toFixed(1)} c → agora ${n2.ponteiro.toFixed(1)} c`);
  if (n1 === null || n2.afinado === null) falhou = true;
}
// o aviso antecipado (antes da medição final) nunca pode mandar girar quando a corda está dentro da tolerância:
// corda a 0 e a ±metade da tolerância, em vários volumes
for (const [nome, prec] of Object.entries(PRECISOES)) for (const d of [0, prec.tol / 2, -prec.tol / 2]) for (const v of [0.03, 0.005]) {
  const fixo = () => d, s = simular(corda(110, fixo, 1.6, v), fixo, { ...prec.leitor, direcaoCedo: true }, prec.tol, prec.quadro);
  const errado = s.filter(e => e.cedo && e.dir);
  if (errado.length) { console.log(`FALHOU: ${nome} com a corda a ${d} cents (volume ${v}) recebeu "${errado[0].dir}" no aviso antecipado aos ${errado[0].ms - 500} ms`); falhou = true; }
}
if (falhou) { console.log('FALHOU: sem resposta'); process.exit(1); }
