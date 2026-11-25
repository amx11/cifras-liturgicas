// Afinador de instrumentos de corda (violão, cavaquinho, violino; microfone): nota, frequência e desvio em cents. A leitura (sensibilidade, estabilidade) fica no
// núcleo (criarLeitor), testado com violão simulado em tools/testes/afinador-sensibilidade.mjs; aqui só a tela.
import { estado, salvarPrefs } from './dados.js';
import { aviso } from './ui.js';
import { criarLeitor, aceitarCordas, aceitarCorda, direcaoCedo, notaDe, cordaDe, INSTRUMENTOS, cordasDoInstrumento, nomePt, midiDe, freqDoMidi, centsEntre, PRECISOES, FILTROS_ENTRADA } from './afinador-nucleo.js';

let sessao = null;

// Maria rezando: mãos postas e olhos fechados enquanto afina; ao passar pelo verde (afinado) abre os olhos, sorri e faz "ok"
const MARIA = `<svg viewBox="0 0 140 168" width="132" height="158" role="img" aria-label="Maria rezando">
  <defs>
    <radialGradient id="m-luz" cx="50%" cy="38%" r="55%"><stop offset="0" stop-color="#fff6c8" stop-opacity=".9"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></radialGradient>
    <linearGradient id="m-manto" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a8ad6"/><stop offset="1" stop-color="#1f4f94"/></linearGradient>
    <linearGradient id="m-veste" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9e4d6"/><stop offset=".5" stop-color="#fffdf6"/><stop offset="1" stop-color="#e9e4d6"/></linearGradient>
    <linearGradient id="m-ouro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7d462"/><stop offset="1" stop-color="#d79a1c"/></linearGradient>
  </defs>
  <circle cx="70" cy="42" r="46" fill="url(#m-luz)" class="m-luz"/>
  <ellipse cx="70" cy="160" rx="42" ry="5" fill="#1c3a66" opacity=".16"/>
  <g class="m-corpo">
    <path d="M70 15C47 15 40 34 38 58C36 84 27 118 19 152Q70 168 121 152C113 118 104 84 102 58C100 34 93 15 70 15Z" fill="url(#m-manto)"/>
    <path d="M70 15C47 15 40 34 38 58C36 84 27 118 19 152Q70 168 121 152C113 118 104 84 102 58C100 34 93 15 70 15Z" fill="none" stroke="url(#m-ouro)" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M38 58C36 84 27 118 19 152L34 156C42 122 48 92 50 66Z" fill="#173f7a" opacity=".45"/>
    <path d="M102 58C104 84 113 118 121 152L106 156C98 122 92 92 90 66Z" fill="#173f7a" opacity=".3"/>
    <g fill="#f7d462" opacity=".9"><path d="M46 112l1.4 3.4 3.4 1.4-3.4 1.4-1.4 3.4-1.4-3.4-3.4-1.4 3.4-1.4z"/><path d="M96 126l1.4 3.4 3.4 1.4-3.4 1.4-1.4 3.4-1.4-3.4-3.4-1.4 3.4-1.4z"/><path d="M40 86l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z"/></g>
    <path d="M70 66C57 68 52 80 51 100L45 152Q70 160 95 152L89 100C88 80 83 68 70 66Z" fill="url(#m-veste)" stroke="#cfc8b4" stroke-width="1"/>
    <path d="M64 112Q62 132 58 150M76 112Q78 132 82 150M70 118V154" fill="none" stroke="#cfc8b4" stroke-width="1" stroke-linecap="round"/>
    <path d="M70 15C54 15 47 29 48 46C49 62 58 72 70 72C82 72 91 62 92 46C93 29 86 15 70 15Z" fill="#fffdf6" stroke="#cfc8b4" stroke-width="1"/>
    <path d="M70 18C57 18 50 30 51 45" fill="none" stroke="#e6e0cf" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="70" cy="47" rx="14" ry="17" fill="#f4d5b8"/>
    <path d="M56 42C57 31 63 27 70 27C77 27 83 31 84 42C79 35 74 33 70 33C66 33 61 35 56 42Z" fill="#fffdf6"/>
    <path d="M57 41C60 36 65 34 70 34C75 34 80 36 83 41" fill="none" stroke="#7a4e30" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
    <path d="M70 48Q68.5 54 71 55" fill="none" stroke="#d3a483" stroke-width="1.2" stroke-linecap="round"/>
    <circle cx="60" cy="56" r="3.6" fill="#f2a79c" opacity=".38"/><circle cx="80" cy="56" r="3.6" fill="#f2a79c" opacity=".38"/>
    <path d="M60.5 41.6Q64 40 67.5 41.4M72.5 41.4Q76 40 79.5 41.6" fill="none" stroke="#8a5e40" stroke-width="1.1" stroke-linecap="round" class="m-sobrancelha"/>
    <g class="m-olhos-fechados" fill="none" stroke="#4a2f22" stroke-width="1.8" stroke-linecap="round"><path d="M60 47.5Q64 51 68 47.5"/><path d="M72 47.5Q76 51 80 47.5"/><path d="M59.5 47.8l-1.6-1.2M80.5 47.8l1.6-1.2" stroke-width="1.2"/></g>
    <g class="m-olhos-abertos"><ellipse cx="64" cy="47.5" rx="3.3" ry="3.8" fill="#fff"/><ellipse cx="76" cy="47.5" rx="3.3" ry="3.8" fill="#fff"/><circle cx="64.2" cy="48" r="2.4" fill="#4a2f22"/><circle cx="76.2" cy="48" r="2.4" fill="#4a2f22"/><circle cx="65" cy="47" r=".9" fill="#fff"/><circle cx="77" cy="47" r=".9" fill="#fff"/></g>
    <path class="m-boca-serena" d="M65.5 62Q70 64.4 74.5 62" fill="none" stroke="#b05a50" stroke-width="1.8" stroke-linecap="round"/>
    <path class="m-boca-sorriso" d="M62.5 60.5Q70 70 77.5 60.5Q70 63.4 62.5 60.5Z" fill="#fffaf2" stroke="#b05a50" stroke-width="1.6" stroke-linejoin="round"/>
    <g class="m-reza">
      <path d="M50 74C46 84 49 96 58 102L62 98C57 92 55 84 56 76Z" fill="url(#m-veste)" stroke="#cfc8b4" stroke-width="1"/>
      <path d="M90 74C94 84 91 96 82 102L78 98C83 92 85 84 84 76Z" fill="url(#m-veste)" stroke="#cfc8b4" stroke-width="1"/>
      <path d="M70 76C65 79 64 90 66 102L70 106L74 102C76 90 75 79 70 76Z" fill="#f4d5b8" stroke="#d2a888" stroke-width="1"/>
      <path d="M70 80V104" stroke="#d2a888" stroke-width="1" stroke-linecap="round"/>
      <path d="M62 98L78 98L76 106L64 106Z" fill="url(#m-veste)" stroke="#cfc8b4" stroke-width="1"/>
    </g>
    <g class="m-ok">
      <path d="M52 80C50 92 56 102 66 104" fill="none" stroke="#cfc8b4" stroke-width="13" stroke-linecap="round"/>
      <path d="M52 80C50 92 56 102 66 104" fill="none" stroke="url(#m-veste)" stroke-width="11" stroke-linecap="round"/>
      <circle cx="68" cy="104" r="5" fill="#f4d5b8" stroke="#d2a888" stroke-width="1"/>
      <path d="M92 90C100 86 104 80 105 72" fill="none" stroke="#cfc8b4" stroke-width="15" stroke-linecap="round"/>
      <path d="M92 90C100 86 104 80 105 72" fill="none" stroke="url(#m-veste)" stroke-width="13" stroke-linecap="round"/>
      <g transform="translate(106 62)">
        <g fill="#f4d5b8" stroke="#d2a888" stroke-width="1"><rect x="-1.6" y="-20" width="5.4" height="15" rx="2.7" transform="rotate(-8)"/><rect x="3.6" y="-18" width="5.2" height="14" rx="2.6" transform="rotate(8)"/><rect x="8" y="-13" width="5" height="12" rx="2.5" transform="rotate(24)"/><ellipse cx="2" cy="2" rx="8.5" ry="8"/></g>
        <circle cx="-1.5" cy="-2" r="5" fill="#fffaf2" stroke="#d2a888" stroke-width="1"/>
        <path d="M-6.5 -1C-8 -6 -3 -9 .5 -6M-4.5 6C-9 5 -9.5 -1 -6.5 -1" fill="none" stroke="#f4d5b8" stroke-width="3.4" stroke-linecap="round"/>
        <circle cx="-1.5" cy="-2" r="5" fill="none" stroke="#d2a888" stroke-width="1"/>
      </g>
      <g class="m-brilhos" fill="url(#m-ouro)"><path d="M124 42l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M20 70l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z"/><path d="M118 96l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z"/></g>
    </g>
  </g>
  <g class="m-aura"><ellipse cx="70" cy="11" rx="28" ry="7.5" fill="none" stroke="url(#m-ouro)" stroke-width="3.6"/></g>
</svg>`;

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
  if (!INSTRUMENTOS[cfg.instrumento]) { cfg.instrumento = 'violao'; cfg.afinacao = 'padrao'; }
  if (!INSTRUMENTOS[cfg.instrumento].afinacoes[cfg.afinacao]) cfg.afinacao = Object.keys(INSTRUMENTOS[cfg.instrumento].afinacoes)[0];
  const cordas = () => cordasDoInstrumento(cfg.instrumento, cfg.afinacao);
  if (typeof cfg.modo === 'number' && cfg.modo >= cordas().length) cfg.modo = 'auto';
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
      <div class="barra" style="margin:4px 0 0">
        <label class="campo" style="margin:0;flex:1 1 140px"><span>Instrumento</span><select id="instrumento">${Object.entries(INSTRUMENTOS).map(([k, v]) => `<option value="${k}" ${cfg.instrumento === k ? 'selected' : ''}>${v.nome}</option>`).join('')}</select></label>
        <label class="campo" id="campo-afinacao" style="margin:0;flex:1 1 160px"><span>Afinação</span><select id="afinacao"></select></label>
      </div>
      <div class="cordas" id="cordas" role="group" aria-label="Corda"></div>
      <label class="campo" style="margin:4px 0 0"><span>Precisão</span><select id="precisao">
        ${Object.entries(PRECISOES).map(([k, p]) => `<option value="${k}" ${cfg.precisao === k ? 'selected' : ''}>${p.nome}</option>`).join('')}</select></label>
      <label class="pequeno" style="display:flex;gap:8px;align-items:center;margin:6px 0 0"><input type="checkbox" id="ruido" ${cfg.filtroRuido ? 'checked' : ''}> Filtro de ruído <span class="suave">(só aceita notas perto das cordas: ignora voz, conversa e ventilador)</span></label>
      <div class="maria" aria-hidden="true">${MARIA}</div>
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
    aceitar: cfg.filtroRuido && cfg.modo !== 'cromatico' ? (typeof cfg.modo === 'number' ? aceitarCorda(cfg.modo, cfg.la, 150, cordas()) : aceitarCordas(cfg.la, 70, cordas())) : null });
  // botões das cordas e lista de afinações dependem do instrumento escolhido
  const desenharCordas = () => {
    $('#cordas').innerHTML = `<button class="btn peq" data-modo="auto">Automático</button>${cordas().map((c, i) => `<button class="btn peq" data-modo="${i}" title="${c.corda}ª corda">${c.corda}ª ${c.nome}${c.oitava}</button>`).join('')}<button class="btn peq" data-modo="cromatico" title="Qualquer nota">Cromático</button>`;
    const afs = INSTRUMENTOS[cfg.instrumento].afinacoes, ks = Object.keys(afs);
    $('#afinacao').innerHTML = ks.map(k => `<option value="${k}" ${cfg.afinacao === k ? 'selected' : ''}>${afs[k].nome}</option>`).join('');
    $('#campo-afinacao').hidden = ks.length < 2;
    $('#cordas').querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { cfg.modo = b.dataset.modo === 'auto' || b.dataset.modo === 'cromatico' ? b.dataset.modo : +b.dataset.modo; salvarPrefs(); marcarModo(); if (sessao) sessao.leitor = novoLeitor(); });
    marcarModo();
  };
  const trocouInstrumento = () => { cfg.modo = 'auto'; salvarPrefs(); desenharCordas(); marcarPrecisao(); if (sessao) sessao.leitor = novoLeitor(); };
  $('#instrumento').onchange = e => { cfg.instrumento = e.target.value; cfg.afinacao = Object.keys(INSTRUMENTOS[cfg.instrumento].afinacoes)[0]; trocouInstrumento(); };
  $('#afinacao').onchange = e => { cfg.afinacao = e.target.value; trocouInstrumento(); };
  const marcarModo = () => tela.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('primario', String(cfg.modo) === b.dataset.modo));
  // faixa verde (afinado) nas duas escalas e textos que dependem da precisão
  const marcarPrecisao = () => {
    const t = tol(), ef = escalaFina();
    $('#alvo-faixa').style.cssText = `left:${50 - t}%;width:${2 * t}%`;
    $('#alvo-fino').style.cssText = `left:${50 - 50 * t / ef}%;width:${100 * t / ef}%`;
    $('#fino-min').textContent = '−' + String(ef).replace('.', ','); $('#fino-max').textContent = '+' + String(ef).replace('.', ',');
    $('#dica').textContent = `Afinado = até ${String(t).replace('.', ',')} cent${t > 1 ? 's' : ''} da nota (${PRECISOES[cfg.precisao].nome.split(' ')[0]}). Toque uma corda solta de cada vez, com o aparelho perto do ${INSTRUMENTOS[cfg.instrumento].nome.toLowerCase()}, e deixe a nota soar.`;
  };
  desenharCordas(); marcarPrecisao();
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
    else if (cfg.modo === 'auto') { const c = cordaDe(f, cfg.la, cordas()); corda = c; ({ alvo, nome, oitava, cents } = c); }
    else { const c = cordas()[cfg.modo]; corda = c; nome = c.nome; oitava = c.oitava; alvo = freqDoMidi(midiDe(c.nome, c.oitava), cfg.la); cents = centsEntre(f, alvo); }
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
