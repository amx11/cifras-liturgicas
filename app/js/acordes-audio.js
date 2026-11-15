// Reconhecimento de acordes a partir de áudio (arquivo, YouTube ou microfone).
// Método: cromagrama (energia das 12 notas) comparado com modelos de acordes maiores e menores,
// suavizado por Viterbi para evitar trocas a cada quadro. Roda todo no aparelho.
import { preferirBemol } from './cifra.js';

const SUST = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BEMOL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// 24 modelos de tríade + 12 de acorde com sétima (dominante); índice 36 = sem acorde
const MODELOS = [];
for (let r = 0; r < 12; r++) MODELOS.push({ raiz: r, tipo: '', notas: [0, 4, 7] });
for (let r = 0; r < 12; r++) MODELOS.push({ raiz: r, tipo: 'm', notas: [0, 3, 7] });
for (let r = 0; r < 12; r++) MODELOS.push({ raiz: r, tipo: '7', notas: [0, 4, 7, 10] });
const VETORES = MODELOS.map(({ raiz, notas }) => {
  const v = new Float32Array(12);
  notas.forEach((n, i) => { v[(raiz + n) % 12] = i === 0 ? 1.2 : i === 3 ? 0.6 : 1; });
  return normalizar(v);
});
const SEM_ACORDE = MODELOS.length;

function normalizar(v) {
  let s = 0; for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}

export function nomeAcorde(i, bemol) {
  if (i === SEM_ACORDE || i == null) return '';
  const m = MODELOS[i];
  return (bemol ? BEMOL : SUST)[m.raiz] + m.tipo;
}

// ---------- FFT (radix-2, in-place) ----------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// Mapa bin → classe de altura (só entre ~65 Hz e ~2 kHz, onde ficam a harmonia e o baixo)
function mapaBins(tamanho, taxa) {
  const mapa = new Int8Array(tamanho / 2).fill(-1);
  const peso = new Float32Array(tamanho / 2);
  for (let k = 1; k < tamanho / 2; k++) {
    const f = k * taxa / tamanho;
    if (f < 65 || f > 2100) continue;
    const midi = 69 + 12 * Math.log2(f / 440);
    const arred = Math.round(midi);
    if (Math.abs(midi - arred) > 0.42) continue; // descarta bins entre duas notas
    mapa[k] = ((arred % 12) + 12) % 12;
    peso[k] = f < 260 ? 1.3 : 1; // baixo pesa um pouco mais
  }
  return { mapa, peso };
}

// Cromagrama de um vetor de magnitudes
export function chromaDeMagnitudes(mags, mapaPeso) {
  const c = new Float32Array(12);
  const { mapa, peso } = mapaPeso;
  for (let k = 0; k < mapa.length; k++) if (mapa[k] >= 0) c[mapa[k]] += Math.log1p(mags[k] * 50) * peso[k];
  let energia = 0; for (const x of c) energia += x;
  return { c: normalizar(c), energia };
}

function pontuar(c) {
  const s = new Float32Array(MODELOS.length + 1);
  for (let i = 0; i < MODELOS.length; i++) {
    let d = 0; const v = VETORES[i];
    for (let j = 0; j < 12; j++) d += c[j] * v[j];
    s[i] = i >= 24 ? d - 0.04 : d; // sétima só quando claramente presente
  }
  return s;
}

// Tom pelos perfis de Krumhansl
const PERFIL_MAIOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const PERFIL_MENOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function correlacao(a, b) {
  const ma = a.reduce((x, y) => x + y) / 12, mb = b.reduce((x, y) => x + y) / 12;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db || 1);
}
export function detectarTomChroma(soma) {
  let melhor = { r: -2, tom: 'C' };
  for (let t = 0; t < 12; t++) {
    const rot = i => soma[(i + t) % 12];
    const v = Array.from({ length: 12 }, (_, i) => rot(i));
    const rM = correlacao(v, PERFIL_MAIOR), rm = correlacao(v, PERFIL_MENOR);
    if (rM > melhor.r) melhor = { r: rM, tom: SUST[t] };
    if (rm > melhor.r) melhor = { r: rm, tom: SUST[t] + 'm' };
  }
  // grafia preferida (Bb em vez de A#, etc.)
  const raiz = melhor.tom.replace(/m$/, ''), menor = melhor.tom.endsWith('m');
  const b = BEMOL[SUST.indexOf(raiz)] + (menor ? 'm' : '');
  return preferirBemol(b) && melhor.tom !== 'F#' ? b : melhor.tom;
}

// Analisa um AudioBuffer inteiro; devolve { acordes: [{inicio, fim, acorde}], tom }
export async function analisarAudio(buffer, progresso) {
  // Reamostra para 11025 Hz mono (suficiente para harmonia e bem mais rápido)
  const taxa = 11025;
  const off = new OfflineAudioContext(1, Math.ceil(buffer.duration * taxa), taxa);
  const src = off.createBufferSource(); src.buffer = buffer; src.connect(off.destination); src.start();
  const dados = (await off.startRendering()).getChannelData(0);

  const N = 4096, salto = 1024; // ~370 ms de janela, ~93 ms entre quadros
  const janela = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  const mp = mapaBins(N, taxa);
  const re = new Float32Array(N), im = new Float32Array(N), mags = new Float32Array(N / 2);
  const quadros = [];
  const soma = new Float32Array(12);
  let energiaMax = 0;
  const total = Math.max(1, Math.floor((dados.length - N) / salto));
  for (let q = 0, ini = 0; ini + N <= dados.length; q++, ini += salto) {
    for (let i = 0; i < N; i++) { re[i] = dados[ini + i] * janela[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) mags[k] = Math.hypot(re[k], im[k]) / N;
    const { c, energia } = chromaDeMagnitudes(mags, mp);
    quadros.push({ c, energia });
    energiaMax = Math.max(energiaMax, energia);
    if (q % 200 === 0) { progresso?.(q / total); await new Promise(r => setTimeout(r)); }
  }
  // Suaviza o cromagrama (média móvel de ~0,5 s) e pontua
  const L = 3;
  const pont = quadros.map((_, i) => {
    const c = new Float32Array(12);
    for (let j = Math.max(0, i - L); j <= Math.min(quadros.length - 1, i + L); j++) for (let k = 0; k < 12; k++) c[k] += quadros[j].c[k];
    normalizar(c);
    for (let k = 0; k < 12; k++) soma[k] += c[k] * quadros[i].energia;
    const s = pontuar(c);
    s[SEM_ACORDE] = quadros[i].energia < energiaMax * 0.08 ? 1 : 0.55; // silêncio
    return s;
  });
  const caminho = viterbi(pont, 0.22);
  const tom = detectarTomChroma(soma);
  const bemol = preferirBemol(tom);
  const dt = salto / taxa, atraso = N / 2 / taxa;
  // Junta quadros iguais em segmentos e descarta trocas muito curtas
  let segs = [];
  for (let i = 0; i < caminho.length; i++) {
    const t = i * dt + atraso - dt / 2;
    if (segs.length && segs.at(-1).i === caminho[i]) segs.at(-1).fim = t + dt;
    else segs.push({ i: caminho[i], inicio: Math.max(0, t), fim: t + dt });
  }
  segs = segs.filter(s => s.fim - s.inicio >= 0.45 || s.i === SEM_ACORDE);
  const acordes = [];
  for (const s of segs) {
    const nome = nomeAcorde(s.i, bemol);
    if (acordes.length && acordes.at(-1).acorde === nome) acordes.at(-1).fim = s.fim;
    else acordes.push({ inicio: s.inicio, fim: s.fim, acorde: nome });
  }
  progresso?.(1);
  return { acordes: acordes.filter(a => a.acorde), tom };
}

function viterbi(pont, penalidade) {
  const S = pont[0]?.length || 0;
  if (!S) return [];
  let ant = Float32Array.from(pont[0]);
  const volta = [];
  for (let t = 1; t < pont.length; t++) {
    let melhorAnt = 0;
    for (let s = 1; s < S; s++) if (ant[s] > ant[melhorAnt]) melhorAnt = s;
    const atual = new Float32Array(S), b = new Int16Array(S);
    for (let s = 0; s < S; s++) {
      const fica = ant[s], troca = ant[melhorAnt] - penalidade;
      if (fica >= troca) { atual[s] = fica + pont[t][s]; b[s] = s; } else { atual[s] = troca + pont[t][s]; b[s] = melhorAnt; }
    }
    volta.push(b); ant = atual;
  }
  let s = 0; for (let i = 1; i < S; i++) if (ant[i] > ant[s]) s = i;
  const caminho = [s];
  for (let t = volta.length - 1; t >= 0; t--) { s = volta[t][s]; caminho.push(s); }
  return caminho.reverse();
}

// Monta ChordPro: com letra transcrita (palavras com tempo), põe cada acorde na palavra onde ele entra;
// sem letra, gera linhas só de acordes (4 por linha).
export function montarChordPro(acordes, palavras) {
  if (!palavras?.length) {
    const linhas = [];
    for (let i = 0; i < acordes.length; i += 4) linhas.push(acordes.slice(i, i + 4).map(a => `[${a.acorde}]`).join(' '));
    return '{comment: Acordes reconhecidos — sem letra}\n' + linhas.join('\n');
  }
  // Linhas: quebra em pausas longas ou a cada ~42 caracteres
  const linhas = [];
  let atual = [];
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i], ant = palavras[i - 1];
    const tam = atual.reduce((n, x) => n + x.texto.length + 1, 0);
    if (atual.length && (p.inicio - ant.fim > 0.7 || tam > 42 || /[.!?]$/.test(ant.texto) && tam > 18)) { linhas.push(atual); atual = []; }
    atual.push(p);
  }
  if (atual.length) linhas.push(atual);

  let k = 0; // próximo acorde a posicionar
  const saida = [];
  let ultimoFim = 0;
  for (const linha of linhas) {
    // acordes que entram antes da linha (introdução / interlúdio)
    const antes = [];
    while (k < acordes.length && acordes[k].inicio < linha[0].inicio - 0.6) antes.push(acordes[k++].acorde);
    if (antes.length && linha[0].inicio - ultimoFim > 2) saida.push((saida.length ? '' : '{comment: Introdução}\n') + antes.map(a => `[${a}]`).join(' '));
    let texto = '';
    let acordeAtual = antes.at(-1) || (k > 0 ? acordes[k - 1].acorde : '');
    linha.forEach((p, j) => {
      let marca = j === 0 && acordeAtual ? acordeAtual : '';
      while (k < acordes.length && acordes[k].inicio < p.fim - 0.05) { marca = acordes[k].acorde; acordeAtual = marca; k++; }
      texto += (j ? ' ' : '') + (marca ? `[${marca}]` : '') + p.texto.trim();
    });
    saida.push(texto);
    ultimoFim = linha.at(-1).fim;
  }
  const finais = acordes.slice(k).map(a => `[${a.acorde}]`);
  if (finais.length) saida.push('', finais.join(' '));
  return saida.join('\n');
}

// ---------- Tempo real (microfone) ----------
export function criarDetectorAoVivo(contexto, fonte) {
  const analisador = contexto.createAnalyser();
  analisador.fftSize = 16384;
  analisador.smoothingTimeConstant = 0.6;
  fonte.connect(analisador);
  const db = new Float32Array(analisador.frequencyBinCount);
  const mags = new Float32Array(analisador.frequencyBinCount);
  const mp = mapaBins(analisador.fftSize, contexto.sampleRate);
  const historico = [];
  const soma = new Float32Array(12);
  let estadoAtual = SEM_ACORDE, candidato = SEM_ACORDE, contagem = 0;
  return {
    analisador,
    ler() {
      analisador.getFloatFrequencyData(db);
      let pico = -Infinity;
      for (let k = 0; k < db.length; k++) { mags[k] = 10 ** (db[k] / 20); if (db[k] > pico) pico = db[k]; }
      const { c, energia } = chromaDeMagnitudes(mags, mp);
      historico.push(c); if (historico.length > 4) historico.shift();
      const media = normalizar(historico.reduce((a, x) => { for (let i = 0; i < 12; i++) a[i] += x[i]; return a; }, new Float32Array(12)));
      const nivel = Math.max(0, Math.min(1, (pico + 90) / 60));
      const s = pontuar(media);
      let melhor = 0; for (let i = 1; i < MODELOS.length; i++) if (s[i] > s[melhor]) melhor = i;
      const confianca = s[melhor];
      if (nivel < 0.25 || confianca < 0.72) melhor = SEM_ACORDE;
      else for (let i = 0; i < 12; i++) soma[i] += media[i] * energia;
      // exige o mesmo acorde em quadros seguidos antes de trocar
      if (melhor === candidato) contagem++; else { candidato = melhor; contagem = 1; }
      let trocou = false;
      if (contagem >= 3 && candidato !== estadoAtual && candidato !== SEM_ACORDE) { estadoAtual = candidato; trocou = true; }
      const tom = soma.some(x => x > 0) ? detectarTomChroma(soma) : '';
      return { acorde: nomeAcorde(estadoAtual, tom && preferirBemol(tom)), trocou, nivel, confianca, tom, chroma: media };
    },
    zerar() { soma.fill(0); historico.length = 0; estadoAtual = SEM_ACORDE; },
  };
}
