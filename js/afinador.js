// Afinador de violão (microfone): nota, frequência e desvio em cents com precisão de décimos de cent
import { estado, salvarPrefs } from './dados.js';
import { esc, aviso } from './ui.js';
import { detectarFrequencia, refinarFundamental, criarEstabilizador, notaDe, cordaDe, CORDAS_VIOLAO, nomePt, midiDe, freqDoMidi, centsEntre } from './afinador-nucleo.js';

let sessao = null;

export function pararAfinador() {
  if (!sessao) return;
  cancelAnimationFrame(sessao.quadro);
  sessao.stream.getTracks().forEach(t => t.stop());
  sessao.ctx.close();
  sessao = null;
}

const fmtCents = c => (c > 0 ? '+' : c < 0 ? '−' : '±') + Math.abs(c).toFixed(1);

export function telaAfinador(tela) {
  const prefs = estado.prefs;
  prefs.afinador ||= { la: 440, modo: 'auto' };
  const cfg = prefs.afinador;
  tela.innerHTML = `
    <h1>Afinador</h1>
    <div class="cartao afinador">
      <div class="barra" style="justify-content:space-between;margin-top:0">
        <button class="btn primario" id="ligar">🎙 Ligar microfone</button>
        <label class="pequeno">Lá = <input id="la" type="number" min="415" max="466" step="0.1" value="${cfg.la}" style="width:5.5em"> Hz</label>
      </div>
      <div class="cordas" role="group" aria-label="Corda">
        <button class="btn peq" data-modo="auto">Automático</button>
        ${CORDAS_VIOLAO.map((c, i) => `<button class="btn peq" data-modo="${i}" title="${c.corda}ª corda">${c.corda}ª ${c.nome}${c.oitava}</button>`).join('')}
        <button class="btn peq" data-modo="cromatico" title="Qualquer nota">Cromático</button>
      </div>
      <div class="af-nota"><span id="nota">—</span><small id="oitava"></small></div>
      <div class="af-sub" id="sub">Toque uma corda solta perto do aparelho.</div>
      <div class="af-escala" aria-hidden="true">
        <div class="af-faixa"></div><div class="af-centro"></div><div class="af-ponteiro" id="ponteiro"></div>
        <span style="left:0">−50</span><span style="left:25%">−25</span><span style="left:50%">0</span><span style="left:75%">+25</span><span style="left:100%">+50</span>
      </div>
      <div class="af-escala fina" aria-hidden="true" title="Ampliado: ±5 cents">
        <div class="af-faixa"></div><div class="af-centro"></div><div class="af-ponteiro" id="ponteiro-fino"></div>
        <span style="left:0">−5</span><span style="left:50%">0</span><span style="left:100%">+5</span>
      </div>
      <div class="af-cents" id="cents" aria-live="polite">— cents</div>
      <div class="af-info"><span id="hz">— Hz</span> · alvo <span id="alvo">—</span> · <span id="estab">—</span></div>
      <div class="medidor" aria-hidden="true"><div id="nivel"></div></div>
      <p class="pequeno suave">Para precisão máxima: ambiente silencioso, celular a um palmo da boca do violão, uma corda de cada vez e
        deixe a nota soar. Afinado = ±1 cent (verde forte em ±0,5). Use fones/microfone externo se o aparelho filtrar o som.</p>
    </div>`;
  const $ = s => tela.querySelector(s);
  const marcarModo = () => tela.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('primario', String(cfg.modo) === b.dataset.modo));
  marcarModo();
  tela.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { cfg.modo = b.dataset.modo === 'auto' || b.dataset.modo === 'cromatico' ? b.dataset.modo : +b.dataset.modo; salvarPrefs(); marcarModo(); sessao?.est.limpar(); });
  $('#la').onchange = e => { const v = +e.target.value; if (v >= 415 && v <= 466) { cfg.la = v; salvarPrefs(); sessao?.est.limpar(); } else e.target.value = cfg.la; };

  $('#ligar').onclick = async () => {
    if (sessao) { pararAfinador(); $('#ligar').textContent = '🎙 Ligar microfone'; return; }
    try {
      // sem processamento do navegador: cancelamento de eco/ruído e ganho automático distorcem a afinação
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      if (ctx.state === 'suspended') await ctx.resume();
      const fonte = ctx.createMediaStreamSource(stream);
      // passa-altas suave em 50 Hz: tira zumbido de rede/vento sem mexer no Mi grave (82 Hz)
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 50; hp.Q.value = 0.5;
      const an = ctx.createAnalyser(); an.fftSize = 16384; an.smoothingTimeConstant = 0;
      fonte.connect(hp); hp.connect(an);
      sessao = { stream, ctx, an, buf: new Float32Array(an.fftSize), est: criarEstabilizador(7), ultimo: 0, ultimaNota: null, visto: 0 };
      $('#ligar').textContent = '■ Desligar';
      laco();
    } catch (e) { aviso('Não foi possível usar o microfone: ' + e.message); }
  };

  function mostrar(f, incerteza = 0.3, completo = true) {
    let alvo, nome, oitava, cents, corda = null;
    if (cfg.modo === 'cromatico') { const n = notaDe(f, cfg.la); ({ alvo, nome, oitava, cents } = n); }
    else if (cfg.modo === 'auto') { const c = cordaDe(f, cfg.la); corda = c; ({ alvo, nome, oitava, cents } = c); }
    else { const c = CORDAS_VIOLAO[cfg.modo]; corda = c; nome = c.nome; oitava = c.oitava; alvo = freqDoMidi(midiDe(c.nome, c.oitava), cfg.la); cents = centsEntre(f, alvo); }
    // zona morta honesta: se o desvio está dentro da incerteza da própria medição (relógio do aparelho,
    // ruído, oscilação da corda), não há como distinguir de zero → mostra 0,0. Com histerese para não piscar.
    const tol = Math.min(0.3, Math.max(0.1, incerteza));
    if (sessao) {
      if (sessao.travado ? Math.abs(cents) < tol * 1.5 : Math.abs(cents) < tol) { sessao.travado = true; cents = 0; }
      else sessao.travado = false;
    }
    $('#nota').textContent = nome; $('#oitava').textContent = oitava;
    if (!completo) { $('#sub').textContent = `${nomePt(nome)}${corda ? ` · ${corda.corda}ª corda` : ''} · medindo…`; $('#cents').textContent = '… cents'; return; }
    $('#sub').textContent = `${nomePt(nome)}${corda ? ` · ${corda.corda}ª corda` : ''}${Math.abs(cents) > 50 ? (cents > 0 ? ' · muito alta: afrouxe' : ' · muito baixa: aperte') : cents > 1 ? ' · alta: afrouxe um pouco' : cents < -1 ? ' · baixa: aperte um pouco' : ' · afinada'}`;
    const c = Math.max(-50, Math.min(50, cents)), cf = Math.max(-5, Math.min(5, cents));
    $('#ponteiro').style.left = (50 + c) + '%';
    $('#ponteiro-fino').style.left = (50 + cf * 10) + '%';
    const cor = Math.abs(cents) <= 0.5 ? 'perfeito' : Math.abs(cents) <= 1 ? 'ok' : Math.abs(cents) <= 5 ? 'perto' : 'longe';
    tela.querySelector('.afinador').dataset.estado = cor;
    $('#cents').textContent = `${fmtCents(cents)} cents`;
    $('#hz').textContent = f.toFixed(2) + ' Hz';
    $('#alvo').textContent = alvo.toFixed(2) + ' Hz';
    return nome + oitava;
  }

  function laco() {
    if (!sessao) return;
    sessao.quadro = requestAnimationFrame(laco);
    const agora = performance.now();
    if (agora - sessao.ultimo < 60) return;          // ~16 leituras por segundo
    sessao.ultimo = agora;
    const { an, buf, ctx, est } = sessao;
    an.getFloatTimeDomainData(buf);
    const taxa = ctx.sampleRate;
    const curto = buf.subarray(buf.length - 4096);   // estimativa rápida no trecho mais recente
    let rms = 0; for (let i = 0; i < curto.length; i++) rms += curto[i] * curto[i];
    rms = Math.sqrt(rms / curto.length);
    $('#nivel').style.width = Math.min(100, rms * 400) + '%';
    const r = detectarFrequencia(curto, taxa, { fMin: 60, fMax: 1100 });
    if (!r) {
      if (agora - sessao.visto > 1500) { tela.querySelector('.afinador').dataset.estado = ''; $('#estab').textContent = 'aguardando som'; est.limpar(); }
      return;
    }
    // janela longa (0,34 s) para medir o fundamental com precisão; se a nota acabou de mudar, usa só o trecho recente
    // nota nova = mudou mais de 40 cents, voltou depois de silêncio ou o volume saltou (nova palhetada)
    const repalhetada = sessao.rmsAnt && rms > 2.5 * sessao.rmsAnt && rms > 0.5 * (sessao.pico || 0);
    // salto de afinação só conta com som forte: no fim da nota aparecem leituras soltas (oitava, ruído) que não devem zerar a medição
    const salto = Math.abs(centsEntre(r.freq, sessao.f || r.freq)) > 40 && rms >= 0.3 * (sessao.pico || 0);
    const nova = !sessao.f || agora - sessao.visto > 300 || repalhetada || salto;
    if (!nova && Math.abs(centsEntre(r.freq, sessao.f)) > 40) return;   // leitura solta: ignora
    sessao.rmsAnt = rms;
    if (nova) { est.limpar(); sessao.ataque = agora; sessao.travado = false; sessao.pico = 0; sessao.suave = null; }
    sessao.pico = Math.max(sessao.pico, rms);
    const f = refinarFundamental(nova ? buf.subarray(buf.length - 8192) : buf, taxa, r.freq);
    sessao.f = f; sessao.visto = agora;
    // logo após a palhetada a corda soa alguns cents mais alta: nos primeiros 0,35 s só mostra a nota, o ponteiro fica parado
    if (agora - sessao.ataque < 350) { mostrar(f, 5, false); $('#estab').textContent = 'medindo…'; return; }
    // nota sumindo (volume < 15% do pico): o ruído passa a dominar → mantém a última leitura boa em vez de tremer
    if (rms < 0.15 * sessao.pico && sessao.suave != null) { $('#estab').textContent = 'leitura mantida (toque de novo)'; return; }
    // leitura pouco periódica (ruído, duas cordas soando) não entra na média
    if (r.clareza >= 0.9) est.adicionar(f);
    const v = est.valor();
    if (!v) { mostrar(f, 5, false); $('#estab').textContent = 'medindo…'; return; }
    // suavização adaptativa: variações pequenas (tremor) andam devagar; quando você gira a tarraxa (>4 cents) o ponteiro acompanha rápido
    const lg = Math.log2(v.freq);
    if (sessao.suave == null) sessao.suave = lg;
    else sessao.suave += (Math.abs(1200 * (lg - sessao.suave)) > 4 ? 0.5 : 0.15) * (lg - sessao.suave);
    mostrar(Math.pow(2, sessao.suave), v.desvioCents);
    $('#estab').textContent = v && v.amostras >= 5 && v.desvioCents < 0.3 ? `estável (±${v.desvioCents.toFixed(2)} c)` : 'medindo…';
  }
}
