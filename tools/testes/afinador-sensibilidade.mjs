// Teste de SENSIBILIDADE do afinador: palhetada de violão que decai (som real some aos poucos) com ruído de microfone
// de celular, passando pelo leitor contínuo exatamente como no app (quadro a cada 35 ms, janela de 16384 amostras).
// Mede, para cada corda e volume: quanto demora para dar a leitura, por quanto tempo acompanha a nota, o erro e se
// aparece nota errada. Compara o comportamento antigo (limiar fixo 0,003, clareza 0,9, congela a 15% do pico) com o novo.
//   node tools/testes/afinador-sensibilidade.mjs            (precisão Máxima)
//   PRECISAO=normal node tools/testes/afinador-sensibilidade.mjs   (ou exigente)
import { criarLeitor, centsEntre, filtrarEntrada, PRECISOES } from '../../app/js/afinador-nucleo.js';

const TAXA = 48000, N = 16384, QUADRO = 35, DURACAO = 4.0, PALHETADA = 0.5;
let semente = 11; const aleat = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(aleat() + 1e-12)) * Math.cos(6.283185307 * aleat());

// violão: harmônicos (2º mais forte), leve inarmonicidade, decaimento exponencial; ruído branco + zumbido de 60 Hz
function gravar(f0, desvio, pico, ruido, zumbido = 0.3 * ruido) {
  const f = f0 * Math.pow(2, desvio / 1200), B = 0.0001, n = Math.round(DURACAO * TAXA), x = new Float32Array(n);
  const amp = [0.6, 1.0, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1], fase = amp.map(() => aleat() * 6.283);
  const norma = Math.sqrt(amp.reduce((s, a) => s + a * a / 2, 0));   // RMS do tom = pico na palhetada
  for (let i = 0; i < n; i++) {
    const t = i / TAXA, tn = t - PALHETADA;
    let s = 0;
    if (tn >= 0) amp.forEach((a, k) => { const h = k + 1, fh = h * f * Math.sqrt(1 + B * h * h); s += a * Math.sin(6.283185307 * fh * tn + fase[k]) * Math.exp(-tn * (1.1 + 0.25 * k)); });
    x[i] = pico * s / norma + ruido * gauss() + zumbido * Math.sin(6.283185307 * 60 * t);
  }
  return { x: filtrarEntrada(x, TAXA), alvo: f * Math.sqrt(1 + B) };   // mesmos filtros de entrada do app
}

function rodar(leitor, { x, alvo }) {
  let primeira = null, ultima = null, erroMax = 0, erradas = 0, leituras = 0;
  for (let ms = 400; ms <= DURACAO * 1000; ms += QUADRO) {
    const fim = Math.round(ms / 1000 * TAXA);
    if (fim < N) continue;
    const r = leitor.processar(x.subarray(fim - N, fim), TAXA, ms);
    if (r.tipo !== 'leitura') continue;
    const e = centsEntre(r.f, alvo);
    if (Math.abs(e) > 50) { erradas++; continue; }
    leituras++;
    if (primeira === null) primeira = ms - PALHETADA * 1000;
    ultima = ms - PALHETADA * 1000;
    erroMax = Math.max(erroMax, Math.abs(e));
  }
  return { primeira, duracao: primeira === null ? 0 : ultima - primeira, erroMax, erradas, leituras };
}

const NOVO = PRECISOES[process.env.PRECISAO || 'maxima'].leitor;
const ANTIGO = { rmsMin: 0.003, clarezaMin: 0.9, manter: 0.15, janelaExtra: false, pisoAdaptativo: false };
const cordas = [['Mi6', 82.4069], ['Lá5', 110], ['Sol3', 195.9977], ['Mi1', 329.6276]];
const volumes = [0.1, 0.03, 0.01, 0.004, 0.002];      // RMS da corda na palhetada (0,1 = perto e forte; 0,002 = longe/baixo)
const RUIDO = 0.0006;                                    // ruído típico de microfone de celular em sala silenciosa
const fmt = r => r.primeira === null ? '   sem leitura   ' : `${String(Math.round(r.primeira)).padStart(4)} ms · ${(r.duracao / 1000).toFixed(1)} s · ${r.erroMax.toFixed(1)} c${r.erradas ? ` · ${r.erradas} erradas` : ''}`;
let falhasNovo = 0, erradasNovo = 0, piorErroNovo = 0, ganhos = 0, piorOnde = '';
console.log('corda  volume   | ANTIGO: 1ª leitura · acompanha · erro máx | NOVO');
for (const [nome, f] of cordas) for (const v of volumes) for (const desvio of [-12, 3]) {
  const sinal = gravar(f, desvio, v, RUIDO);
  const a = rodar(criarLeitor(ANTIGO), sinal), n = rodar(criarLeitor(NOVO), sinal);
  if (n.primeira === null) falhasNovo++;
  erradasNovo += n.erradas; if (n.erroMax > piorErroNovo) { piorErroNovo = n.erroMax; piorOnde = `${nome} volume ${v} desvio ${desvio}c`; }
  if (n.duracao > a.duracao + 300 || (a.primeira === null && n.primeira !== null)) ganhos++;
  console.log(`${nome.padEnd(5)} ${String(v).padEnd(6)} ${String(desvio).padStart(3)}c | ${fmt(a).padEnd(38)} | ${fmt(n)}`);
}
// violão com zumbido elétrico forte junto (fonte, cabo, lâmpada perto do celular)
console.log('\ncom zumbido de 60 Hz junto:');
for (const [nome, f] of cordas) for (const [v, z] of [[0.03, 0.01], [0.01, 0.01], [0.01, 0.03]]) {
  const n = rodar(criarLeitor(NOVO), gravar(f, -5, v, RUIDO, z));
  if (n.primeira === null) falhasNovo++;
  erradasNovo += n.erradas; piorErroNovo = Math.max(piorErroNovo, n.erroMax);
  console.log(`${nome.padEnd(5)} corda ${String(v).padEnd(5)} zumbido ${String(z).padEnd(5)} | ${fmt(n)}`);
}
// sem violão: só ruído da sala (fraco e forte) e zumbido elétrico forte — não pode aparecer leitura nenhuma
let fantasmas = 0;
for (const [ruido, zumbido] of [[0.0006, 0], [0.005, 0], [0.0006, 0.01], [0.002, 0.03]]) {
  const n = Math.round(DURACAO * TAXA), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = ruido * gauss() + zumbido * Math.sin(6.283185307 * 60 * i / TAXA);
  const xf = filtrarEntrada(x, TAXA);
  const leitor = criarLeitor(NOVO); let k = 0;
  for (let ms = 400; ms <= DURACAO * 1000; ms += QUADRO) { const fim = Math.round(ms / 1000 * TAXA); if (fim < N) continue; if (leitor.processar(xf.subarray(fim - N, fim), TAXA, ms).tipo === 'leitura') k++; }
  console.log(`sem violão: ruído ${ruido} · zumbido 60 Hz ${zumbido} → ${k} leituras`);
  fantasmas += k;
}
if (fantasmas) { console.log('FALHOU: leitura sem nenhuma corda tocando'); process.exit(1); }
console.log(`\nNOVO: ${falhasNovo} casos sem leitura · ${erradasNovo} leituras de nota errada · erro máx ${piorErroNovo.toFixed(2)} cent (${piorOnde}) · ${ganhos} casos com mais alcance que o antigo`);
if (erradasNovo > 0 || piorErroNovo > 1.5) { console.log('FALHOU: o ganho de sensibilidade não pode custar nota errada nem precisão'); process.exit(1); }
