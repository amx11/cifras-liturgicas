// Ouvir pelo microfone: acorde ao vivo, gravar e cifrar, reconhecer a música pelo trecho cantado
import { estado, reconhecerPorLetra, salvarTons } from './dados.js';
import { esc, aviso } from './ui.js';
import { criarDetectorAoVivo, analisarAudio, montarChordPro } from './acordes-audio.js';
import { telaEditar } from './app.js';

let sessao = null;

export function pararOuvir() {
  if (!sessao) return;
  cancelAnimationFrame(sessao.quadro);
  sessao.gravador?.state === 'recording' && sessao.gravador.stop();
  sessao.stream.getTracks().forEach(t => t.stop());
  sessao.ctx.close();
  sessao = null;
}

export function telaOuvir(tela) {
  tela.innerHTML = `
    <h1>Ouvir</h1>
    <div class="cartao">
      <div class="barra" style="justify-content:space-between;margin-top:0">
        <button class="btn primario" id="ligar">🎙 Ligar microfone</button>
        <span class="pequeno suave">Tom provável: <b id="tom">—</b></span>
      </div>
      <div class="acorde-grande" id="acorde" aria-live="polite"></div>
      <div class="medidor" aria-hidden="true"><div id="nivel"></div></div>
      <h2>Acordes ouvidos</h2>
      <div class="historico" id="hist"><span class="suave pequeno" style="font-weight:400">Toque ou cante perto do aparelho.</span></div>
      <div class="barra"><button class="btn peq" id="limpar">Limpar</button></div>
    </div>
    <div class="cartao">
      <h2 style="margin-top:0">Gravar e cifrar</h2>
      <p class="pequeno suave">Grave a música inteira (ou um trecho). Os acordes são reconhecidos aqui no aparelho; a letra é transcrita se o servidor com Whisper estiver ligado.</p>
      <div class="barra"><button class="btn" id="gravar" disabled>⏺ Gravar</button><span id="tempo" class="pequeno suave"></span></div>
      <h2>Que música é esta?</h2>
      <p class="pequeno suave">Grava ~12 segundos, transcreve o que foi cantado e procura no acervo (precisa do servidor com Whisper).</p>
      <button class="btn" id="reconhecer" disabled>🔎 Reconhecer pelo canto</button>
      <div id="prog" class="progresso"></div>
      <div id="achadas"></div>
    </div>`;

  const $ = s => tela.querySelector(s);
  const hist = [];
  const prog = $('#prog');
  const log = t => { prog.textContent += t + '\n'; };

  const desenharHist = () => {
    $('#hist').innerHTML = hist.length ? hist.slice(-40).map(esc).join(' <span class="suave">·</span> ') : '<span class="suave pequeno" style="font-weight:400">Nenhum acorde ainda.</span>';
  };

  $('#ligar').onclick = async () => {
    if (sessao) { pararOuvir(); $('#ligar').textContent = '🎙 Ligar microfone'; $('#gravar').disabled = $('#reconhecer').disabled = true; return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const fonte = ctx.createMediaStreamSource(stream);
      const det = criarDetectorAoVivo(ctx, fonte);
      sessao = { stream, ctx, det };
      $('#ligar').textContent = '⏹ Desligar';
      $('#gravar').disabled = $('#reconhecer').disabled = false;
      let ultimo = 0;
      const passo = agora => {
        if (!sessao) return;
        if (agora - ultimo > 90) {
          ultimo = agora;
          const r = det.ler();
          $('#nivel').style.width = Math.round(r.nivel * 100) + '%';
          $('#acorde').textContent = r.acorde;
          if (r.tom) $('#tom').textContent = r.tom;
          if (r.trocou && r.acorde && hist.at(-1) !== r.acorde) { hist.push(r.acorde); desenharHist(); }
        }
        sessao.quadro = requestAnimationFrame(passo);
      };
      sessao.quadro = requestAnimationFrame(passo);
    } catch (err) {
      aviso(err.name === 'NotAllowedError' ? 'Permita o uso do microfone no navegador' : 'Microfone indisponível: ' + err.message, 4000);
    }
  };
  $('#limpar').onclick = () => { hist.length = 0; sessao?.det.zerar(); $('#tom').textContent = '—'; desenharHist(); };

  // Grava do mesmo microfone; devolve Blob
  const gravar = (limiteSeg, aoTick) => new Promise((ok, falha) => {
    const g = new MediaRecorder(sessao.stream);
    const partes = [];
    g.ondataavailable = e => partes.push(e.data);
    g.onstop = () => { clearInterval(tick); ok(new Blob(partes, { type: g.mimeType })); };
    g.onerror = e => falha(e.error);
    sessao.gravador = g;
    const ini = Date.now();
    const tick = setInterval(() => {
      const s = (Date.now() - ini) / 1000;
      aoTick?.(s);
      if (limiteSeg && s >= limiteSeg) g.stop();
    }, 250);
    g.start();
  });

  async function transcrever(blob) {
    const srv = estado.prefs.servidor;
    const st = await (await fetch(srv + '/api/status')).json();
    if (!st.whisper) throw new Error('o servidor não tem o Whisper instalado');
    const r = await fetch(srv + '/api/transcrever', { method: 'POST', body: blob });
    if (!r.ok) throw new Error('falha na transcrição');
    return (await r.json()).palavras || [];
  }

  $('#gravar').onclick = async () => {
    if (sessao?.gravador?.state === 'recording') { sessao.gravador.stop(); return; }
    prog.textContent = '';
    $('#gravar').textContent = '⏹ Parar e cifrar';
    const blob = await gravar(0, s => { $('#tempo').textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; });
    $('#gravar').textContent = '⏺ Gravar';
    try {
      log('Reconhecendo acordes...');
      const ctx = new AudioContext();
      const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      ctx.close();
      const { acordes, tom } = await analisarAudio(buffer);
      log(`Tom provável: ${tom}`);
      let palavras = null;
      try { log('Transcrevendo a letra...'); palavras = await transcrever(blob); } catch (e) { log(`Sem letra: ${e.message}.`); }
      telaEditar(null, { nome: 'Gravação ' + new Date().toLocaleString('pt-BR'), complemento: 'Cifrada pelo microfone — revisar', chordpro: montarChordPro(acordes, palavras) });
    } catch (err) { log('Erro: ' + err.message); }
  };

  $('#reconhecer').onclick = async () => {
    prog.textContent = '';
    $('#achadas').innerHTML = '';
    $('#reconhecer').disabled = true;
    log('Ouvindo por 12 segundos...');
    const blob = await gravar(12);
    try {
      log('Transcrevendo...');
      const palavras = await transcrever(blob);
      const texto = palavras.map(p => p.texto).join(' ');
      log(`Ouvi: “${texto.trim()}”`);
      const achadas = reconhecerPorLetra(texto, 5);
      const tom = $('#tom').textContent;
      $('#achadas').innerHTML = achadas.length
        ? '<h2>Pode ser:</h2>' + achadas.map(({ m }) => `<a class="item" href="#/musica/${esc(m.chave)}" data-chave="${esc(m.chave)}"><span class="tom">${esc(m.tom || '')}</span><span class="info"><span class="nome">${esc(m.nome)}</span>${m.complemento ? `<div class="comp">${esc(m.complemento)}</div>` : ''}</span></a>`).join('')
          + (tom && tom !== '—' ? `<p class="pequeno suave">Ao abrir, a cifra já vem no tom ouvido (${esc(tom)}) quando o modo (maior/menor) bate.</p>` : '')
        : '<p class="vazio">Não encontrei no acervo. Tente um trecho mais longo ou mais perto do microfone.</p>';
      $('#achadas').onclick = e => {
        const a = e.target.closest('[data-chave]'); if (!a) return;
        const m = achadas.find(x => x.m.chave === a.dataset.chave)?.m;
        if (m?.tom && tom && tom !== '—' && m.tom.endsWith('m') === tom.endsWith('m')) { estado.tons[m.chave] = tom; salvarTons(); }
      };
    } catch (err) { log('Erro: ' + err.message + '. Ligue o servidor (node server/servidor.mjs).'); }
    $('#reconhecer').disabled = !sessao;
  };
}
