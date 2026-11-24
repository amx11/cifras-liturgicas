// Núcleo do afinador: frequência fundamental de um trecho de áudio, com precisão de décimos de cent.
// 1) estimativa: McLeod Pitch Method (função de diferença quadrática normalizada, NSDF) — escolhe o primeiro
//    pico alto, o que evita o erro de oitava típico do violão (2º harmônico forte);
// 2) refinamento: a NSDF é calculada em atraso FRACIONÁRIO (sinal interpolado por cúbica de Catmull-Rom) e o
//    máximo é procurado por seção áurea — sem o erro da interpolação parabólica, que chega a ~1 cent nas cordas agudas.
// Sem dependências do navegador: roda igual no Node (testes) e no app.

export const CORDAS_VIOLAO = [
  { nome: 'E', oitava: 2, corda: 6 }, { nome: 'A', oitava: 2, corda: 5 }, { nome: 'D', oitava: 3, corda: 4 },
  { nome: 'G', oitava: 3, corda: 3 }, { nome: 'B', oitava: 3, corda: 2 }, { nome: 'E', oitava: 4, corda: 1 },
];
const NOMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOMES_PT = { C: 'Dó', 'C#': 'Dó#', D: 'Ré', 'D#': 'Ré#', E: 'Mi', F: 'Fá', 'F#': 'Fá#', G: 'Sol', 'G#': 'Sol#', A: 'Lá', 'A#': 'Lá#', B: 'Si' };
export const nomePt = n => NOMES_PT[n] || n;

export const midiDe = (nome, oitava) => NOMES.indexOf(nome) + 12 * (oitava + 1);
export const freqDoMidi = (midi, la = 440) => la * Math.pow(2, (midi - 69) / 12);
export const centsEntre = (f, ref) => 1200 * Math.log2(f / ref);

// nota mais próxima de uma frequência
export function notaDe(f, la = 440) {
  const midi = Math.round(69 + 12 * Math.log2(f / la));
  const alvo = freqDoMidi(midi, la);
  return { midi, nome: NOMES[((midi % 12) + 12) % 12], oitava: Math.floor(midi / 12) - 1, alvo, cents: centsEntre(f, alvo) };
}

// corda do violão mais próxima (em cents); com afinação alternativa basta trocar a lista
export function cordaDe(f, la = 440, cordas = CORDAS_VIOLAO) {
  let melhor = null;
  for (const c of cordas) {
    const alvo = freqDoMidi(midiDe(c.nome, c.oitava), la), d = centsEntre(f, alvo);
    if (!melhor || Math.abs(d) < Math.abs(melhor.cents)) melhor = { ...c, alvo, cents: d };
  }
  return melhor;
}

// NSDF inteira para os atrasos [tMin, tMax]
function nsdf(x, n, tMin, tMax) {
  const r = new Float64Array(tMax + 2);
  for (let t = tMin; t <= tMax + 1; t++) {
    let ac = 0, m = 0;
    for (let i = 0; i + t < n; i++) { const a = x[i], b = x[i + t]; ac += a * b; m += a * a + b * b; }
    r[t] = m > 0 ? 2 * ac / m : 0;
  }
  return r;
}

// valor do sinal em posição fracionária (Catmull-Rom)
function amostra(x, p) {
  const i = Math.floor(p), f = p - i;
  const a = x[i - 1] ?? x[i], b = x[i], c = x[i + 1] ?? b, d = x[i + 2] ?? c;
  return b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
}

// NSDF em atraso fracionário (sinal deslocado por interpolação)
function nsdfFrac(x, n, t) {
  let ac = 0, m = 0;
  const lim = n - Math.ceil(t) - 2;
  for (let i = 1; i < lim; i++) { const a = x[i], b = amostra(x, i + t); ac += a * b; m += a * a + b * b; }
  return m > 0 ? 2 * ac / m : 0;
}

// Fundamental do trecho x (Float32Array) amostrado a `taxa` Hz.
// Retorna { freq, clareza (0..1, quão periódico), rms } ou null se não houver tom.
export function detectarFrequencia(x, taxa, { fMin = 60, fMax = 1100, limiarPico = 0.9, limiarClareza = 0.8, rmsMin = 0.003 } = {}) {
  const n = x.length;
  let soma = 0, media = 0;
  for (let i = 0; i < n; i++) media += x[i];
  media /= n;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { y[i] = x[i] - media; soma += y[i] * y[i]; }
  const rms = Math.sqrt(soma / n);
  if (rms < rmsMin) return null;
  const tMin = Math.max(2, Math.floor(taxa / fMax)), tMax = Math.min(Math.floor(n / 2), Math.ceil(taxa / fMin));
  const r = nsdf(y, n, tMin, tMax);
  // picos positivos entre cruzamentos por zero (só depois do primeiro cruzamento negativo)
  const picos = [];
  let t = tMin;
  while (t < tMax && r[t] > 0) t++;
  while (t < tMax) {
    while (t < tMax && r[t] <= 0) t++;
    let melhor = -1;
    while (t < tMax && r[t] > 0) { if (melhor < 0 || r[t] > r[melhor]) melhor = t; t++; }
    if (melhor > 0) picos.push(melhor);
  }
  if (!picos.length) return null;
  const maior = Math.max(...picos.map(p => r[p]));
  const escolhido = picos.find(p => r[p] >= limiarPico * maior);
  if (r[escolhido] < limiarClareza) return null;
  // refinamento: máximo da NSDF fracionária em [escolhido-1, escolhido+1] (seção áurea)
  let a = escolhido - 1, b = escolhido + 1;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = nsdfFrac(y, n, c), fd = nsdfFrac(y, n, d);
  for (let k = 0; k < 40 && b - a > 1e-6; k++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = nsdfFrac(y, n, c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = nsdfFrac(y, n, d); }
  }
  const periodo = (a + b) / 2;
  return { freq: taxa / periodo, clareza: Math.max(fc, fd), rms };
}

// 3) Frequência exata do 1º parcial (o que o ouvido e os afinadores de referência medem), mesmo com
//    inarmonicidade da corda (harmônicos um pouco acima dos múltiplos, o que tira a periodicidade):
//    demodulação complexa z(t) = x(t)·e^(−iωt), média móvel de comprimento = 2 períodos (anula todos os
//    harmônicos e o ruído fora da banda), e a inclinação da fase de z ao longo da janela dá a correção Δf.
//    Duas iterações; precisão limitada só pelo ruído e pela duração da janela.
export function refinarFundamental(x, taxa, f0, iteracoes = 2) {
  const n = x.length;
  let f = f0;
  for (let it = 0; it < iteracoes; it++) {
    // média móvel de P períodos (P de 2 a 4): quanto mais períodos, mais estreita a banda e mais o ruído perto da corda é
    // rejeitado (rumor de 59-70 Hz vazava para o Mi grave com só 2 períodos); P cresce enquanto a janela permitir (n ≥ 3·P períodos)
    const P = Math.min(4, Math.max(2, Math.floor(n / (3 * taxa / f))));
    const L = Math.max(8, Math.round(P * taxa / f));
    if (n < L * 3) return f;
    const w = 2 * Math.PI * f / taxa;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) { re[i] = x[i] * Math.cos(w * i); im[i] = -x[i] * Math.sin(w * i); }
    // média móvel (soma acumulada)
    let sr = 0, si = 0; const pr = [], pi = [];
    for (let i = 0; i < n; i++) {
      sr += re[i]; si += im[i];
      if (i >= L) { sr -= re[i - L]; si -= im[i - L]; }
      if (i >= L - 1) { pr.push(sr); pi.push(si); }
    }
    // fase desenrolada e regressão linear ponderada pela amplitude ao quadrado (trechos fortes pesam mais)
    let ant = null, desl = 0, sw = 0, st = 0, sp = 0, stt = 0, stp = 0;
    for (let k = 0; k < pr.length; k++) {
      let ph = Math.atan2(pi[k], pr[k]);
      if (ant !== null) { let d = ph + desl - ant; while (d > Math.PI) { desl -= 2 * Math.PI; d -= 2 * Math.PI; } while (d < -Math.PI) { desl += 2 * Math.PI; d += 2 * Math.PI; } }
      ph += desl; ant = ph;
      const peso = pr[k] * pr[k] + pi[k] * pi[k];
      sw += peso; st += peso * k; sp += peso * ph; stt += peso * k * k; stp += peso * k * ph;
    }
    const den = sw * stt - st * st;
    if (!(den > 0)) return f;
    const incl = (sw * stp - st * sp) / den;                   // rad por amostra
    const df = incl * taxa / (2 * Math.PI);
    if (!isFinite(df) || Math.abs(df) > f * 0.03) return f;    // mais de ~50 cents: não confia
    f += df;
  }
  return f;
}

// Precisão (tolerância para "afinado"), como nos afinadores de referência: Normal ±4 cents (a diferença quase não se
// ouve), Exigente ±2 e Máxima ±1 (regulagem fina, luthier).
// Cada precisão tem a sua velocidade: quanto menor a tolerância, mais som é preciso juntar (janela maior, mais leituras
// na mediana, suavização mais lenta). Na Normal o retorno vem rápido; na Máxima, o rigor de décimos de cent.
// leitor: janelaMax (amostras do refinamento), nEstab (leituras na mediana), alfa [tremor, girando a tarraxa],
// ataqueMs (espera após a palhetada); quadro: ms entre leituras. Medido em tools/testes/afinador-resposta.mjs.
export const PRECISOES = {
  normal: { tol: 4, nome: 'Normal (±4 cents)', quadro: 25, leitor: { janelaMax: 6144, nEstab: 3, alfa: [0.6, 0.95], ataqueMs: 60, definirDesv: 1.0, destravar: 1.2, confirmar: 2 } },
  exigente: { tol: 2, nome: 'Exigente (±2 cents)', quadro: 30, leitor: { janelaMax: 9216, nEstab: 4, alfa: [0.45, 0.9], ataqueMs: 90, definirDesv: 0.7, destravar: 0.9, confirmar: 3 } },
  maxima: { tol: 1, nome: 'Máxima (±1 cent)', quadro: 35, leitor: { janelaMax: 16384, nEstab: 5, alfa: [0.35, 0.8], ataqueMs: 120, definirDesv: 0.5, destravar: 0.6, confirmar: 5 } },
};
// Para que lado girar já na primeira leitura da palhetada: só quando a corda está claramente fora (o ataque da corda
// soa ~1-2 cents alto, então a margem é a tolerância + 3 cents); perto da nota espera a leitura completa.
export const direcaoCedo = (cents, tol) => Math.abs(cents) > tol + 3 ? (cents < 0 ? 'aperte' : 'afrouxe') : null;

// Filtros na entrada do microfone (o app monta com BiquadFilter; os testes aplicam os mesmos com filtrarEntrada):
// passa-altas suave em 50 Hz (vento, batida no tampo) e notch estreito em 50 e 60 Hz (zumbido da rede elétrica, que
// se mistura à corda e atrapalha a leitura). Q do notch 8 = faixa de ~7 Hz: o Mi grave (82 Hz) passa inteiro.
// No Web Audio o Q do passa-altas é em dB (0,5 dB ≈ 1,06).
// Passa-altas de 4ª ordem (Butterworth: dois estágios com Q 0,541 e 1,307, em dB no Web Audio: −5,34 e +2,32) em 68 Hz: corta
// forte o rumor grave de ambiente (ventilador, ar-condicionado, trânsito: 40-64 Hz) perdendo só ~1 dB no Mi grave (82 Hz).
// Medido com a gravação real do ambiente de quem usa: o rumor abaixo de 120 Hz era 66% da energia e fazia o Mi grave errar 4-7 cents.
export const FILTROS_ENTRADA = [{ tipo: 'highpass', f: 68, q: -5.34 }, { tipo: 'highpass', f: 68, q: 2.32 }, { tipo: 'notch', f: 50, q: 8 }, { tipo: 'notch', f: 60, q: 8 }];
export function filtrarEntrada(x, taxa) {
  let y = Float64Array.from(x);
  for (const { tipo, f, q } of FILTROS_ENTRADA) {
    const w = 2 * Math.PI * f / taxa, cw = Math.cos(w), Q = tipo === 'notch' ? q : Math.pow(10, q / 20),   // no Web Audio o Q de passa-altas/baixas é em dB, o do notch é linear
           al = Math.sin(w) / (2 * Q);
    const [b0, b1, b2] = tipo === 'notch' ? [1, -2 * cw, 1] : tipo === 'lowpass' ? [(1 - cw) / 2, 1 - cw, (1 - cw) / 2] : [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2];
    const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al, z = new Float64Array(y.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = (b0 * y[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = y[i]; y2 = y1; y1 = v; z[i] = v;
    }
    y = z;
  }
  return Float32Array.from(y);
}

// FILTRO DE RUÍDO (ativável): só aceita alturas perto das cordas do violão (±70 cents no Automático; ±150 com uma corda escolhida,
// para corda nova que chega muito frouxa). Voz, conversa e ventilador raramente caem nessas alturas; escolhida uma corda, só vale aquela.
// Cromático = sem filtro (qualquer nota). Devolve a função que o leitor usa em `aceitar`.
export const aceitarCordas = (la = 440, margem = 70) => f => cordaDe(f, la).cents !== undefined && Math.abs(cordaDe(f, la).cents) <= margem;
export const aceitarCorda = (i, la = 440, margem = 150) => { const c = CORDAS_VIOLAO[i], alvo = freqDoMidi(midiDe(c.nome, c.oitava), la); return f => Math.abs(centsEntre(f, alvo)) <= margem; };

// volume mínimo = 2× o ruído do ambiente medido sem nota (o teste de sensibilidade não mostra nota errada nesse limiar)
const FATOR_PISO = 2;
// zumbido da rede elétrica (50/60 Hz e o dobro): ±20 cents dessas frequências não é corda — a nota afinada mais perto
// (Si, 61,7 e 123,5 Hz) fica a ~49 cents. Sem isso, fonte/cabo/lâmpada perto do celular viram "nota" sem corda tocando.
const REDE = [50, 60, 100, 120];
export const ehZumbido = f => REDE.some(r => Math.abs(centsEntre(f, r)) < 20);

// Leitor contínuo: recebe a cada quadro o trecho mais recente do microfone (16384 amostras) e decide o que mostrar.
// Sensibilidade: o volume mínimo acompanha o ruído do ambiente (2× o piso medido quando não há nota), e quando a janela
// curta não acha a nota, tenta uma janela maior (mais períodos = mais robusta com som fraco). A leitura segue a nota
// enquanto ela soa (até cair a `manter` do pico) — só depois congela a última leitura boa.
// As opções permitem reproduzir o comportamento antigo nos testes (comparação antes × depois).
export function criarLeitor({ rmsMin = 0.0006, clarezaMin = 0.85, manter = 0.05, janelaExtra = true, pisoAdaptativo = true,
  janelaMax = 16384, nEstab = 5, alfa = [0.35, 0.8], ataqueMs = 120, definirDesv = 1.0, destravar = 1.2, definirMs = 450, confirmar = 2, aceitar = null, lead = 0.08 } = {}) {
  const est = criarEstabilizador(nEstab);
  const estV = criarEstabilizador(2);          // leitura rápida para a seta (igual em todas as precisões)
  const s = { f: null, visto: -1e9, ataque: 0, pico: 0, rmsAnt: 0, suave: null, piso: null, definida: false, fixo: null, hv: [] };
  const limpar = () => { est.limpar(); estV.limpar(); s.suaveV = null; s.hv = []; s.ultV = null; s.f = null; s.suave = null; s.pico = 0; s.definida = false; s.fixo = null; s.cn = 0; };
  // valor mostrado: depois de definido, o valor fixo (não oscila com o ruído nem com a nota sumindo)
  const valor = () => Math.pow(2, s.definida ? s.fixo : s.suave);
  // COEFICIENTE DE AVANÇO (lead, em segundos): a leitura ao vivo chega ~lead s atrasada (janela de 85 ms + suavização). Com a
  // corda se movendo a V cents/s, soma V×lead à seta para devolver esse atraso (limitado a ±4 cents). Também estima o valor
  // durante o remedir depois de um toque forte (continua andando na velocidade que a tarraxa tinha).
  const extrapola = (agora) => s.ultV && agora - s.ultV[1] < 400 ? Math.pow(2, (s.ultV[0] + Math.max(-4, Math.min(4, s.ultV[2] * (agora - s.ultV[1]) / 1000))) / 1200) : null;
  return {
    limpar,
    get piso() { return s.piso; },
    processar(buf, taxa, agora) {
      const curto = buf.subarray(buf.length - 4096);
      let soma = 0; for (let i = 0; i < curto.length; i++) soma += curto[i] * curto[i];
      const rms = Math.sqrt(soma / curto.length);
      const limiar = pisoAdaptativo ? Math.max(rmsMin, FATOR_PISO * (s.piso ?? 0)) : rmsMin;
      const opc = { fMin: 60, fMax: 1100, rmsMin: 0 };
      let r = rms >= limiar ? detectarFrequencia(curto, taxa, opc) : null;
      if (!r && janelaExtra && rms >= limiar) r = detectarFrequencia(buf.subarray(buf.length - 8192), taxa, opc);
      if (r && ehZumbido(r.freq)) r = null;                  // rede elétrica, não corda (conta como ruído do ambiente)
      if (r && aceitar && !aceitar(r.freq)) r = null;        // filtro de ruído ligado: fora das cordas = ruído (voz, conversa, ventilador)
      if (!r) {
        // sem nota: aprende o ruído do ambiente (desce rápido, sobe devagar — uma nota não "ensina" ruído alto)
        s.piso = s.piso == null ? rms : rms < s.piso ? 0.7 * s.piso + 0.3 * rms : 0.98 * s.piso + 0.02 * rms;
        if (agora - s.visto > 1500) { limpar(); return { tipo: 'silencio', rms }; }
        return s.suave != null ? { tipo: 'mantida', rms, f: valor(), definida: s.definida } : { tipo: 'silencio', rms };
      }
      // nota nova = mudou mais de 40 cents, voltou depois de silêncio ou o volume saltou (nova palhetada)
      // toque novo: subida brusca de energia nos últimos 10 ms (480 amostras) contra os 50 ms antes — percebe a palhetada em
      // 1-2 quadros, antes de o ataque agudo (+10 cents) contaminar a leitura, e não espera a janela de 85 ms encher
      const nB = buf.length; let e1 = 0, e0 = 0;
      for (let i = nB - 480; i < nB; i++) e1 += buf[i] * buf[i];
      for (let i = nB - 2880; i < nB - 480; i++) e0 += buf[i] * buf[i];
      const r1 = Math.sqrt(e1 / 480), r0 = Math.sqrt(e0 / 2400);
      if (r1 > 1.6 * r0 && r1 > 2 * limiar) s.golpeT = agora;                // qualquer pancada de energia (inclusive toque mais fraco)
      const onset = s.f && r1 > 3 * r0 && r1 > 2 * limiar && r1 > 0.5 * (s.pico || 0);
      const repalhetada = onset || (s.rmsAnt && rms > 2.5 * s.rmsAnt && rms > 0.5 * (s.pico || 0));
      // salto de afinação só conta com som forte: no fim da nota aparecem leituras soltas (oitava, ruído)
      const salto = Math.abs(centsEntre(r.freq, s.f || r.freq)) > 40 && rms >= 0.3 * (s.pico || 0);
      const nova = !s.f || agora - s.visto > 300 || repalhetada || salto;
      if (!nova && Math.abs(centsEntre(r.freq, s.f)) > 40) return s.suave != null ? { tipo: 'mantida', rms, f: valor(), definida: s.definida } : { tipo: 'silencio', rms };
      s.rmsAnt = rms;
      if (nova) { est.limpar(); estV.limpar(); s.suaveV = null; s.hv = []; s.ataque = agora; s.pico = 0; s.suave = null; s.cedoN = 0; s.fAnt = null; s.definida = false; s.fixo = null; s.cn = 0; }
      s.pico = Math.max(s.pico, rms);
      // janela que cresce desde a palhetada: ~0,13 s (resposta rápida) até 0,34 s (precisão), sem o som de antes
      const desde = Math.round((agora - s.ataque) / 1000 * taxa);
      // som fraco (perto do limiar): janela inteira, o ruído pesa mais e precisa de mais períodos para não errar os cents
      const teto = rms < 6 * limiar ? buf.length : janelaMax;
      // a medição ignora os primeiros 150 ms da palhetada (a corda soa mais aguda ao ser tocada e enviesa a média)
      const util = Math.max(0, desde - Math.round(0.15 * taxa));
      // corda grave (< 130 Hz: Mi e Lá): janela maior só para o valor definido (a seta ao vivo segue com a janela curta). O rumor
      // de ambiente fica justamente em 40-120 Hz; com mais períodos (≥ 20 do Mi) a média móvel o rejeita
      const tetoF = r.freq < 130 ? Math.max(teto, 12288) : teto;
      const tam = Math.max(Math.min(6144, tetoF), Math.min(buf.length, tetoF, util));
      const f = refinarFundamental(buf.subarray(buf.length - tam), taxa, r.freq);
      // seta e número ao vivo: janela curta (≤85 ms) e suavização rápida em qualquer precisão, para acompanhar a tarraxa
      // em tempo real; a janela longa (f) só serve para decidir quando declarar o valor "definido"
      const tamV = Math.max(Math.min(4096, teto), Math.min(buf.length, 4096, util));
      const fV = tamV < tam ? refinarFundamental(buf.subarray(buf.length - tamV), taxa, r.freq) : f;
      s.f = f; s.visto = agora;
      // logo após a palhetada a corda soa um pouco mais alta: nos primeiros 0,12 s só mostra a nota
      // aviso antecipado ("Aperte"/"Afrouxe" antes da medição final): só com ≥50 ms de som, leitura bem periódica e duas
      // leituras seguidas concordando (a janela logo após a palhetada ainda tem pouca nota e pode errar o lado)
      const cedoOk = r.clareza >= 0.92 && agora - s.ataque >= 50;
      s.cedoN = cedoOk && s.fAnt && Math.abs(centsEntre(f, s.fAnt)) < 3 ? s.cedoN + 1 : cedoOk ? 1 : 0;
      s.fAnt = cedoOk ? f : null;
      const estavelCedo = s.cedoN >= 2;
      // leitura final só com ≥12 períodos da nota na janela (corda grave precisa de mais tempo: 82 Hz → ~146 ms)
      if (agora - s.ataque < Math.max(ataqueMs, 12000 / f)) return { tipo: 'medindo', rms, f, estavelCedo, desde: agora - s.ataque, vivoExtrap: extrapola(agora) };
      // nota quase sumindo: o ruído passa a dominar → mantém a última leitura boa em vez de tremer
      if (rms < manter * s.pico && s.suave != null) return { tipo: 'mantida', rms, f: valor(), definida: s.definida };
      if (r.clareza >= clarezaMin) { est.adicionar(f); estV.adicionar(fV); }         // leitura pouco periódica (ruído, duas cordas) não entra
      const v = est.valor();
      if (!v) return { tipo: 'medindo', rms, f, estavelCedo, desde: agora - s.ataque, vivoExtrap: extrapola(agora) };
      // suavização adaptativa: tremor anda devagar; girando a tarraxa (>3 cents) o ponteiro acompanha rápido
      const vV = estV.valor();
      if (vV) { const lv = Math.log2(vV.freq); s.suaveV = s.suaveV == null ? lv : s.suaveV + (Math.abs(1200 * (lv - s.suaveV)) > 3 ? 0.95 : 0.6) * (lv - s.suaveV); }
      const lg = Math.log2(v.freq);
      if (s.suave == null) s.suave = lg;
      else s.suave += (Math.abs(1200 * (lg - s.suave)) > 3 ? alfa[1] : alfa[0]) * (lg - s.suave);
      // "definida": só quando o som estabiliza (leituras concordando e o ataque já acomodou). Depois de definida o valor
      // fica FIXO — ruído e nota sumindo não mexem nele; só destrava se a afinação mudar de fato (girou a tarraxa).
      // TENDÊNCIA: inclinação (regressão linear) do valor ao vivo nos últimos ~160 ms. Mais de 8 cents/s = a corda está se
      // movendo (tarraxa girando; girar de verdade dá 15-40 cents/s). A regressão faz o ruído (que balança para os dois
      // lados) se anular. Enquanto se move não define, e um valor já definido destrava na hora, para a seta acompanhar a
      // tarraxa em tempo real.
      if (s.suaveV != null) { s.hv.push([agora, 1200 * s.suaveV]); while (s.hv.length && agora - s.hv[0][0] > 160) s.hv.shift(); }
      let mov = 0, sig = 0;
      if (s.hv.length >= 4 && agora - s.hv[0][0] >= 100) {
        const n = s.hv.length, tm = s.hv.reduce((x, h) => x + h[0], 0) / n, ym = s.hv.reduce((x, h) => x + h[1], 0) / n;
        let sxy = 0, sxx = 0; for (const [t, y] of s.hv) { sxy += (t - tm) * (y - ym); sxx += (t - tm) * (t - tm); }
        mov = sxx > 0 ? 1000 * sxy / sxx : 0;                                // cents por segundo
        // significância: com ruído o valor ao vivo oscila ±1-2 cents e a inclinação "aparece" sozinha; só vale se for
        // bem maior que o erro padrão dela (tarraxa girando = reta limpa, ruído = nuvem)
        const res = s.hv.reduce((x, [t, y]) => x + Math.pow(y - ym - (mov / 1000) * (t - tm), 2), 0);
        sig = n > 4 && sxx > 0 ? Math.abs(mov) / (1000 * Math.sqrt(res / (n - 2) / sxx) + 1e-9) : 0;
      }
      // depois de uma pancada de energia (palhetada) o ataque desce ~10 cents em 60 ms e parece tarraxa girando: por 300 ms
      // não conta como movimento (senão destravava o valor definido e a seta mostrava a leitura contaminada)
      const movendo = Math.abs(mov) > 8 && sig > 2.5 && agora - (s.golpeT ?? -1e9) >= 300;
      // movimento de TARRAXA: só vale depois de 250 ms da palhetada (o ataque desce ~10 cents em 60 ms e parece movimento)
      // e só com movimento claro: >12 cents/s e inclinação bem significativa (>4 erros-padrão); ruído fraco passa de 2,5
      const tarraxa = movendo && Math.abs(mov) > 12 && sig > 4 && agora - s.ataque >= 250 && rms >= 0.3 * s.pico;
      if (s.suaveV != null) s.ultV = [1200 * s.suaveV, agora, tarraxa ? mov : 0];        // guarda (cents, instante, velocidade) para extrapolar
      const concorda = v.amostras >= 3 && v.desvioCents < definirDesv && agora - s.ataque >= definirMs && !movendo;
      // destrava se a afinação mudou de verdade: sai do valor definido mais que `destravar`, andando para o mesmo lado, com
      // a corda ainda forte (com a nota sumindo o ruído domina e não pode derrubar um valor já definido)
      if (s.definida) {
        const dev = 1200 * ((s.suaveV ?? s.suave) - s.fixo);
        s.un = movendo && Math.abs(dev) > destravar && Math.sign(dev) === Math.sign(mov) && rms >= 0.3 * s.pico ? (s.un || 0) + 1 : 0;
        if (s.un >= 2) { s.definida = false; s.un = 0; s.cn = 0; }
      } else s.un = 0;
      s.cn = concorda ? (s.cn || 0) + 1 : 0;                  // precisa concordar em quadros seguidos para definir
      // corda grave (< 130 Hz) com som fraco: o rumor pesa mais, então confirma por mais 3 quadros antes de definir
      const exigeMais = confirmar < 5 && r.freq < 130 && rms < 6 * limiar ? 3 : 0;   // a Máxima (5 quadros) já é rigorosa
      if (!s.definida && s.cn >= confirmar + exigeMais) { s.definida = true; s.fixo = s.suave; }   // definido = congelado até a afinação mudar de verdade
      return { tipo: 'leitura', rms, f: valor(), desvio: v.desvioCents, estavel: v.amostras >= 3 && v.desvioCents < 0.5, definida: s.definida, vivo: s.suaveV == null ? valor() : Math.pow(2, s.suaveV + (tarraxa ? Math.max(-4, Math.min(4, mov * lead)) / 1200 : 0)),
        // nunca fica só em "medindo…": com o som seguindo por mais de 1,2 s sem definir (ruído do microfone, corda
        // tremendo), a leitura atual aparece em cor, marcada como aproximada
        provisoria: !s.definida && agora - s.ataque >= 1200, movendo };
    },
  };
}

// Suavização das leituras: mediana das últimas N e média das que estão perto dela (descarta transientes do ataque)
export function criarEstabilizador(n = 7) {
  const hist = [];
  return {
    adicionar(f) { hist.push(f); if (hist.length > n) hist.shift(); },
    limpar() { hist.length = 0; },
    valor() {
      if (hist.length < 2) return null;
      const ord = [...hist].sort((a, b) => a - b), med = ord[Math.floor(ord.length / 2)];
      const perto = hist.filter(f => Math.abs(centsEntre(f, med)) < 8);
      const m = perto.reduce((s, f) => s + Math.log2(f), 0) / perto.length;
      const desvio = Math.sqrt(perto.reduce((s, f) => s + (1200 * (Math.log2(f) - m)) ** 2, 0) / perto.length);
      return { freq: Math.pow(2, m), desvioCents: desvio, amostras: perto.length };
    },
  };
}
