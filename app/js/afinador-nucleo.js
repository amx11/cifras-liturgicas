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
    const L = Math.max(8, Math.round(2 * taxa / f));          // 2 períodos
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
export const PRECISOES = { normal: { tol: 4, nome: 'Normal (±4 cents)' }, exigente: { tol: 2, nome: 'Exigente (±2 cents)' }, maxima: { tol: 1, nome: 'Máxima (±1 cent)' } };

// Filtros na entrada do microfone (o app monta com BiquadFilter; os testes aplicam os mesmos com filtrarEntrada):
// passa-altas suave em 50 Hz (vento, batida no tampo) e notch estreito em 50 e 60 Hz (zumbido da rede elétrica, que
// se mistura à corda e atrapalha a leitura). Q do notch 8 = faixa de ~7 Hz: o Mi grave (82 Hz) passa inteiro.
// No Web Audio o Q do passa-altas é em dB (0,5 dB ≈ 1,06).
export const FILTROS_ENTRADA = [{ tipo: 'highpass', f: 50, q: 0.5 }, { tipo: 'notch', f: 50, q: 8 }, { tipo: 'notch', f: 60, q: 8 }];
export function filtrarEntrada(x, taxa) {
  let y = Float64Array.from(x);
  for (const { tipo, f, q } of FILTROS_ENTRADA) {
    const w = 2 * Math.PI * f / taxa, cw = Math.cos(w), Q = tipo === 'highpass' ? Math.pow(10, q / 20) : q, al = Math.sin(w) / (2 * Q);
    const [b0, b1, b2] = tipo === 'notch' ? [1, -2 * cw, 1] : [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2];
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
export function criarLeitor({ rmsMin = 0.0006, clarezaMin = 0.85, manter = 0.05, janelaExtra = true, pisoAdaptativo = true } = {}) {
  const est = criarEstabilizador(5);
  const s = { f: null, visto: -1e9, ataque: 0, pico: 0, rmsAnt: 0, suave: null, piso: null };
  const limpar = () => { est.limpar(); s.f = null; s.suave = null; s.pico = 0; };
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
      if (!r) {
        // sem nota: aprende o ruído do ambiente (desce rápido, sobe devagar — uma nota não "ensina" ruído alto)
        s.piso = s.piso == null ? rms : rms < s.piso ? 0.7 * s.piso + 0.3 * rms : 0.98 * s.piso + 0.02 * rms;
        if (agora - s.visto > 1500) { limpar(); return { tipo: 'silencio', rms }; }
        return s.suave != null ? { tipo: 'mantida', rms, f: Math.pow(2, s.suave) } : { tipo: 'silencio', rms };
      }
      // nota nova = mudou mais de 40 cents, voltou depois de silêncio ou o volume saltou (nova palhetada)
      const repalhetada = s.rmsAnt && rms > 2.5 * s.rmsAnt && rms > 0.5 * (s.pico || 0);
      // salto de afinação só conta com som forte: no fim da nota aparecem leituras soltas (oitava, ruído)
      const salto = Math.abs(centsEntre(r.freq, s.f || r.freq)) > 40 && rms >= 0.3 * (s.pico || 0);
      const nova = !s.f || agora - s.visto > 300 || repalhetada || salto;
      if (!nova && Math.abs(centsEntre(r.freq, s.f)) > 40) return s.suave != null ? { tipo: 'mantida', rms, f: Math.pow(2, s.suave) } : { tipo: 'silencio', rms };
      s.rmsAnt = rms;
      if (nova) { est.limpar(); s.ataque = agora; s.pico = 0; s.suave = null; }
      s.pico = Math.max(s.pico, rms);
      // janela que cresce desde a palhetada: ~0,13 s (resposta rápida) até 0,34 s (precisão), sem o som de antes
      const desde = Math.round((agora - s.ataque) / 1000 * taxa);
      const tam = Math.max(6144, Math.min(buf.length, desde));
      const f = refinarFundamental(buf.subarray(buf.length - tam), taxa, r.freq);
      s.f = f; s.visto = agora;
      // logo após a palhetada a corda soa um pouco mais alta: nos primeiros 0,12 s só mostra a nota
      if (agora - s.ataque < 120) return { tipo: 'medindo', rms, f };
      // nota quase sumindo: o ruído passa a dominar → mantém a última leitura boa em vez de tremer
      if (rms < manter * s.pico && s.suave != null) return { tipo: 'mantida', rms, f: Math.pow(2, s.suave) };
      if (r.clareza >= clarezaMin) est.adicionar(f);         // leitura pouco periódica (ruído, duas cordas) não entra
      const v = est.valor();
      if (!v) return { tipo: 'medindo', rms, f };
      // suavização adaptativa: tremor anda devagar; girando a tarraxa (>3 cents) o ponteiro acompanha rápido
      const lg = Math.log2(v.freq);
      if (s.suave == null) s.suave = lg;
      else s.suave += (Math.abs(1200 * (lg - s.suave)) > 3 ? 0.8 : 0.35) * (lg - s.suave);
      return { tipo: 'leitura', rms, f: Math.pow(2, s.suave), desvio: v.desvioCents, estavel: v.amostras >= 3 && v.desvioCents < 0.5 };
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
