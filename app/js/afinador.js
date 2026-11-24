// Afinador de violão (microfone): nota, frequência e desvio em cents. A leitura (sensibilidade, estabilidade) fica no
// núcleo (criarLeitor), testado com violão simulado em tools/testes/afinador-sensibilidade.mjs; aqui só a tela.
import { estado, salvarPrefs } from './dados.js';
import { aviso } from './ui.js';
import { criarLeitor, aceitarCordas, aceitarCorda, direcaoCedo, notaDe, cordaDe, CORDAS_VIOLAO, nomePt, midiDe, freqDoMidi, centsEntre, PRECISOES, FILTROS_ENTRADA } from './afinador-nucleo.js';

let sessao = null;

export function pararAfinador() {
  if (!sessao) return;
  clearInterval(sessao.quadro);
  sessao.stream.getTracks().forEach(t => t.stop());
  sessao.ctx.close();
  sessao = null;
}

export function telaAfinador(tela) {
  const prefs = estado.prefs;
  prefs.afinador ||= { la: 440, modo: 'auto' };
  const cfg = prefs.afinador;
  if (!PRECISOES[cfg.precisao]) cfg.precisao = 'normal';      // como nos afinadores de referência: afinado até ±4 cents
  const tol = () => PRECISOES[cfg.precisao].tol;
  const escalaFina = () => tol() * 2.5;                          // ampliada: ±10 (Normal), ±5 (Exigente), ±2,5 (Máxima)
  const fmtCents = c => { const v = cfg.precisao === 'normal' ? Math.round(c) : Math.round(c * 10) / 10; return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(cfg.precisao === 'normal' ? 0 : 1).replace('.', ','); };
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
      <label class="campo" style="margin:4px 0 0"><span>Precisão</span><select id="precisao">
        ${Object.entries(PRECISOES).map(([k, p]) => `<option value="${k}" ${cfg.precisao === k ? 'selected' : ''}>${p.nome}</option>`).join('')}</select></label>
      <label class="pequeno" style="display:flex;gap:8px;align-items:center;margin:6px 0 0"><input type="checkbox" id="ruido" ${cfg.filtroRuido ? 'checked' : ''}> Filtro de ruído <span class="suave">(só aceita notas perto das cordas: ignora voz, conversa e ventilador)</span></label>
      <div class="af-nota"><span id="nota">—</span><small id="oitava"></small></div>
      <div class="af-sub" id="sub">Toque uma corda solta perto do aparelho.</div>
      <div class="af-escala" aria-hidden="true">
        <div class="af-faixa"></div><div class="af-alvo" id="alvo-faixa"></div><div class="af-centro"></div><div class="af-ponteiro" id="ponteiro"></div>
        <span style="left:0">−50</span><span style="left:25%">−25</span><span style="left:50%">0</span><span style="left:75%">+25</span><span style="left:100%">+50</span>
      </div>
      <div class="af-escala fina" aria-hidden="true" title="Ampliado">
        <div class="af-faixa"></div><div class="af-alvo" id="alvo-fino"></div><div class="af-centro"></div><div class="af-ponteiro" id="ponteiro-fino"></div>
        <span style="left:0" id="fino-min"></span><span style="left:50%">0</span><span style="left:100%" id="fino-max"></span>
      </div>
      <div class="af-cents" id="cents" aria-live="polite">— cents</div>
      <div class="af-info"><span id="hz">— Hz</span> · alvo <span id="alvo">—</span> · <span id="estab">—</span></div>
      <div class="medidor" aria-hidden="true" title="Nível do som"><div id="nivel"></div></div>
      <p class="pequeno suave" id="dica"></p>
    </div>`;
  const $ = s => tela.querySelector(s);
  // leitor com a velocidade da precisão e, se o filtro de ruído estiver ligado, só aceitando alturas perto das cordas
  // (a corda escolhida, ou qualquer uma das 6 no Automático; no Cromático o filtro não se aplica)
  const novoLeitor = () => criarLeitor({ ...PRECISOES[cfg.precisao].leitor,
    aceitar: cfg.filtroRuido && cfg.modo !== 'cromatico' ? (typeof cfg.modo === 'number' ? aceitarCorda(cfg.modo, cfg.la) : aceitarCordas(cfg.la)) : null });
  const marcarModo = () => tela.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('primario', String(cfg.modo) === b.dataset.modo));
  // faixa verde (afinado) nas duas escalas e textos que dependem da precisão
  const marcarPrecisao = () => {
    const t = tol(), ef = escalaFina();
    $('#alvo-faixa').style.cssText = `left:${50 - t}%;width:${2 * t}%`;
    $('#alvo-fino').style.cssText = `left:${50 - 50 * t / ef}%;width:${100 * t / ef}%`;
    $('#fino-min').textContent = '−' + String(ef).replace('.', ','); $('#fino-max').textContent = '+' + String(ef).replace('.', ',');
    $('#dica').textContent = `Afinado = até ${String(t).replace('.', ',')} cent${t > 1 ? 's' : ''} da nota (${PRECISOES[cfg.precisao].nome.split(' ')[0]}). Toque uma corda solta de cada vez, com o aparelho perto do violão, e deixe a nota soar.`;
  };
  marcarModo(); marcarPrecisao();
  tela.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { cfg.modo = b.dataset.modo === 'auto' || b.dataset.modo === 'cromatico' ? b.dataset.modo : +b.dataset.modo; salvarPrefs(); marcarModo(); if (sessao) sessao.leitor = novoLeitor(); });
  $('#la').onchange = e => { const v = +e.target.value; if (v >= 415 && v <= 466) { cfg.la = v; salvarPrefs(); if (sessao) sessao.leitor = novoLeitor(); } else e.target.value = cfg.la; };
  $('#ruido').onchange = e => {
    cfg.filtroRuido = e.target.checked; salvarPrefs();
    if (sessao) sessao.leitor = novoLeitor();
  };
  $('#precisao').onchange = e => {
    cfg.precisao = e.target.value; salvarPrefs(); marcarPrecisao();
    if (!sessao) return;
    // muda a velocidade da leitura na hora, sem desligar o microfone
    sessao.leitor = novoLeitor(); clearInterval(sessao.quadro); sessao.quadro = setInterval(laco, PRECISOES[cfg.precisao].quadro);
  };

  $('#ligar').onclick = async () => {
    if (sessao) { pararAfinador(); $('#ligar').textContent = '🎙 Ligar microfone'; return; }
    try {
      // sem processamento do navegador: cancelamento de eco/ruído e ganho automático distorcem a afinação
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      if (ctx.state === 'suspended') await ctx.resume();
      // entrada: passa-altas suave + notch de 50/60 Hz (zumbido da rede), os mesmos filtros do teste de sensibilidade
      let no = ctx.createMediaStreamSource(stream);
      for (const { tipo, f, q } of FILTROS_ENTRADA) { const b = ctx.createBiquadFilter(); b.type = tipo; b.frequency.value = f; b.Q.value = q; no.connect(b); no = b; }
      const an = ctx.createAnalyser(); an.fftSize = 16384; an.smoothingTimeConstant = 0;
      no.connect(an);
      sessao = { stream, ctx, an, buf: new Float32Array(an.fftSize), leitor: novoLeitor(), travado: false };
      $('#ligar').textContent = '■ Desligar';
      // leitura a cada 35 ms (~28 por segundo) por relógio próprio: não depende da taxa de quadros da tela
      sessao.quadro = setInterval(laco, PRECISOES[cfg.precisao].quadro);
    } catch (e) { aviso('Não foi possível usar o microfone: ' + e.message); }
  };

  function mostrar(f, incerteza = 0.3, completo = true, cedo = false) {
    let alvo, nome, oitava, cents, corda = null;
    if (cfg.modo === 'cromatico') { const n = notaDe(f, cfg.la); ({ alvo, nome, oitava, cents } = n); }
    else if (cfg.modo === 'auto') { const c = cordaDe(f, cfg.la); corda = c; ({ alvo, nome, oitava, cents } = c); }
    else { const c = CORDAS_VIOLAO[cfg.modo]; corda = c; nome = c.nome; oitava = c.oitava; alvo = freqDoMidi(midiDe(c.nome, c.oitava), cfg.la); cents = centsEntre(f, alvo); }
    // zona morta honesta: desvio dentro da incerteza da própria medição não se distingue de zero → 0. Com histerese.
    const zm = Math.min(0.3, Math.max(0.1, incerteza));
    if (sessao) {
      if (sessao.travado ? Math.abs(cents) < zm * 1.5 : Math.abs(cents) < zm) { sessao.travado = true; cents = 0; }
      else sessao.travado = false;
    }
    $('#nota').textContent = nome; $('#oitava').textContent = oitava;
    const qual = `${nomePt(nome)}${corda ? ` · ${corda.corda}ª corda` : ''}`;
    if (!completo) {
      // ainda não definido (o ataque da palhetada não acomodou): fica em cinza, com "~" no valor, e só diz para que lado
      // girar quando a corda está claramente fora da nota. A cor e o valor final só aparecem quando o som estabiliza.
      const dir = cedo ? direcaoCedo(cents, tol()) : null;
      $('#sub').textContent = `${qual} · ${dir === 'aperte' ? 'Aperte…' : dir === 'afrouxe' ? 'Afrouxe…' : 'medindo…'}`;
      $('#cents').textContent = cedo ? `~${fmtCents(cents)} cents` : '… cents';
      tela.querySelector('.afinador').dataset.estado = 'medindo';
      if (cedo) { const c0 = Math.max(-50, Math.min(50, cents)), ef0 = escalaFina(), cf0 = Math.max(-ef0, Math.min(ef0, cents)); $('#ponteiro').style.left = (50 + c0) + '%'; $('#ponteiro-fino').style.left = (50 + 50 * cf0 / ef0) + '%'; $('#hz').textContent = f.toFixed(2).replace('.', ',') + ' Hz'; $('#alvo').textContent = alvo.toFixed(2).replace('.', ',') + ' Hz'; }
      return;
    }
    const t = tol(), afinada = Math.abs(cents) <= t;
    $('#sub').textContent = `${qual} · ${afinada ? 'Afinado' : Math.abs(cents) > 50 ? (cents > 0 ? 'muito aguda: afrouxe' : 'muito grave: aperte') : cents > 0 ? 'Afrouxe' : 'Aperte'}`;
    const c = Math.max(-50, Math.min(50, cents)), ef = escalaFina(), cf = Math.max(-ef, Math.min(ef, cents));
    $('#ponteiro').style.left = (50 + c) + '%';
    $('#ponteiro-fino').style.left = (50 + 50 * cf / ef) + '%';
    // verde = afinado; amarelo = grave (aperte); vermelho = agudo (afrouxe)
    tela.querySelector('.afinador').dataset.estado = afinada ? (Math.abs(cents) <= t / 4 ? 'perfeito' : 'ok') : cents < 0 ? 'grave' : 'agudo';
    $('#cents').textContent = `${fmtCents(cents)} cents`;
    $('#hz').textContent = f.toFixed(2).replace('.', ',') + ' Hz';
    $('#alvo').textContent = alvo.toFixed(2).replace('.', ',') + ' Hz';
  }

  function laco() {
    if (!sessao) return;
    const { an, buf, ctx, leitor } = sessao;
    an.getFloatTimeDomainData(buf);
    const r = leitor.processar(buf, ctx.sampleRate, performance.now());
    // nível em escala de decibéis (−60 a −10 dBFS): som baixo também aparece na barra
    $('#nivel').style.width = Math.max(0, Math.min(100, (20 * Math.log10(r.rms + 1e-9) + 60) * 2)) + '%';
    if (r.tipo === 'silencio') { tela.querySelector('.afinador').dataset.estado = ''; $('#estab').textContent = 'aguardando som'; return; }
    if (r.tipo === 'mantida') { $('#estab').textContent = r.definida ? 'valor definido (som sumindo)' : 'som fraco: aproxime do violão'; return; }
    if (r.tipo === 'medindo') {
      // toque forte no meio do ajuste: o leitor remede ~150-250 ms; nesse intervalo mantém o último valor ao vivo na tela
      // (a afinação da corda não mudou com a palhetada) em vez de piscar "… cents"; nos primeiros 160 ms o ataque da palhetada soa
      // mais agudo (+10 cents) e não deve mover a seta
      if (sessao.ultVivo && performance.now() - sessao.ultVivo < 1500 && (!r.estavelCedo || r.desde < 160)) {
        // se a tarraxa estava girando, continua na mesma velocidade em vez de ficar parado (vivoExtrap, limitado a ±4 cents)
        if (r.vivoExtrap) mostrar(r.vivoExtrap, 5, false, true);
        $('#estab').textContent = 'medindo…'; return;
      }
      mostrar(r.f, 5, false, r.estavelCedo); $('#estab').textContent = 'medindo…'; return;
    }
    // leitura: só mostra valor e cor quando o som estabilizou (definida); antes disso, cinza e "medindo…"
    // definido: valor fixo (r.f); senão a leitura ao vivo, que acompanha a tarraxa em tempo real
    sessao.ultVivo = performance.now();
    mostrar(r.definida ? r.f : r.vivo, r.desvio, r.definida || (r.provisoria && !r.movendo), true);
    $('#estab').textContent = r.definida ? 'definido' : r.movendo ? 'acompanhando a tarraxa…' : r.provisoria ? 'aproximado (ruído ou corda tremendo)' : 'medindo…';
  }
}
