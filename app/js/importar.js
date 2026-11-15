// Importação: foto ou PDF escaneado (OCR), PDF de texto, texto colado, arquivo de áudio e link do YouTube
import { estado } from './dados.js';
import { esc, aviso } from './ui.js';
import { pdfParaCifra, separarCabecalho } from './pdf.js';
import { textoParaChordPro } from './cifra.js';
import { telaEditar } from './app.js';
import { analisarAudio, montarChordPro } from './acordes-audio.js';

const semExt = n => n.replace(/\.[^.]+$/, '');
const ehMusicXml = arq => /\.(mxl|musicxml|xml)$/i.test(arq.name);

// MusicXML (exportado do MuseScore/Finale/Audiveris): conversão exata, acorde na sílaba da nota
async function textoMusicXml(dados, nome) {
  if (/\.mxl$/i.test(nome) || (dados[0] === 0x50 && dados[1] === 0x4b)) {            // compactado (zip)
    const { unzipSync, strFromU8 } = await import('../vendor/fflate.mjs');
    const z = unzipSync(dados);
    const raiz = z['META-INF/container.xml'] && /full-path="([^"]+)"/.exec(strFromU8(z['META-INF/container.xml']))?.[1];
    const nomeXml = raiz && z[raiz] ? raiz : Object.keys(z).find(n => /\.(xml|musicxml)$/i.test(n) && !n.startsWith('META-INF'));
    return nomeXml ? strFromU8(z[nomeXml]) : '';
  }
  return new TextDecoder().decode(dados);
}
export async function importarMusicXml(arq, out) {
  try {
    const xml = await textoMusicXml(new Uint8Array(await arq.arrayBuffer()), arq.name);
    const { musicxmlParaChordPro } = await import('./musicxml.js');
    const chordpro = musicxmlParaChordPro(xml);
    if (!chordpro.trim()) { out.textContent = 'Não encontrei letra nem acordes neste MusicXML.'; return; }
    const titulo = (/<work-title>([^<]*)<\/work-title>/.exec(xml) || /<movement-title>([^<]*)<\/movement-title>/.exec(xml) || [])[1] || semExt(arq.name);
    telaEditar(null, { nome: titulo, chordpro, complemento: 'Convertida de MusicXML' });
    aviso('Cifra montada a partir do MusicXML (exata): confira e salve', 3500);
  } catch (err) { out.textContent = 'Não foi possível ler o MusicXML: ' + err.message; }
}

// Audiveris no servidor do computador (leitura óptica de partitura): devolve a cifra, ou null
async function cifraPeloAudiveris(arq) {
  try {
    const st = await (await fetch(estado.prefs.servidor + '/api/status', { signal: AbortSignal.timeout(3000) })).json();
    if (!st.audiveris) return null;
    const ext = (arq.name.split('.').pop() || 'pdf').toLowerCase();
    const r = await fetch(`${estado.prefs.servidor}/api/omr?ext=${encodeURIComponent(ext)}`, { method: 'POST', body: arq });
    if (!r.ok) return null;
    const xml = await textoMusicXml(new Uint8Array(await r.arrayBuffer()), 'x.mxl');
    const { musicxmlParaChordPro } = await import('./musicxml.js');
    return musicxmlParaChordPro(xml);
  } catch { return null; }
}

// PDF de partitura (pentagrama do MuseScore/Finale): monta a cifra pela posição exata das notas.
// Devolve null se o PDF não tiver pauta (aí vale o conversor de cifra em texto).
async function cifraDePartitura(lib, dados) {
  const { partituraParaCifra, definirVocabulario } = await import('./partitura.js');
  // vocabulário do acervo para juntar sílabas encostadas sem hífen
  const vocab = new Set();
  for (const m of estado.base || []) if (m.chordpro && !m.ocr && !m.daPartitura)
    for (const w of m.chordpro.replace(/\[[^\]]*\]/g, '').split(/[\s\-–,.;:!?()"'“”]+/)) { const n = w.toLowerCase().normalize('NFC').replace(/[^a-zà-ÿ]/g, ''); if (n.length >= 2) vocab.add(n); }
  definirVocabulario([...vocab]);
  const r = await partituraParaCifra(lib, dados);
  return r.temPauta && (r.chordpro.match(/\[/g) || []).length >= 3 ? r : null;
}

// Lê foto(s) ou PDF escaneado e abre o editor com o original ao lado para conferir.
// `base`: campos já digitados no editor (título etc.), que são mantidos.
async function prepararVocabulario() {
  const { definirVocabulario } = await import('./partitura.js');
  const vocab = new Set();
  for (const m of estado.base || []) if (m.chordpro && !m.ocr && !m.daPartitura)
    for (const w of m.chordpro.replace(/\[[^\]]*\]/g, '').split(/[\s\-–,.;:!?()"'“”]+/)) { const n = w.toLowerCase().normalize('NFC').replace(/[^a-zà-ÿ]/g, ''); if (n.length >= 2) vocab.add(n); }
  definirVocabulario([...vocab]);
}

export async function lerEInserir(arquivos, out, base = {}) {
  const { lerCifra, ehImagem } = await import('./ocr.js');
  await prepararVocabulario();
  const mostrar = t => { if (out) out.textContent = t; };
  try {
    let r = await lerCifra(arquivos, mostrar);
    if (r.partitura && arquivos.length === 1) {
      mostrar('Pedindo uma segunda leitura ao Audiveris (servidor do computador)...');
      const aud = await cifraPeloAudiveris(arquivos[0]);
      const { vocabulario } = await import('./partitura.js');
      const V = vocabulario() || new Set();
      const conta = cp => (cp.match(/\[/g) || []).length;
      const legiveis = cp => { const ws = cp.replace(/\[[^\]]*\]/g, '').split(/[\s\-–,.;:!?()"'“”_]+/).map(w => w.toLowerCase()).filter(w => /^[a-zà-ÿ]{4,}$/.test(w)); return ws.length >= 8 ? ws.filter(w => V.has(w)).length / ws.length : 0; };
      if (aud && legiveis(aud) >= 0.8 && conta(aud) >= conta(r.chordpro) && legiveis(aud) > legiveis(r.chordpro) + 0.1) {
        r = { ...r, chordpro: aud, duvidasResumo: ['cifra lida pelo Audiveris: confira letra e acordes com a partitura ao lado'] };
      }
    }
    if (!r.chordpro.trim()) { mostrar('Não encontrei texto nessa imagem. Tente uma foto mais nítida, de frente e com boa luz.'); return; }
    const foto = arquivos.every(ehImagem);
    const duvidas = r.legibilidade < 0.6
      ? ['a leitura saiu muito ruim (foto tremida, torta ou partitura com pentagrama?)', ...r.duvidasResumo] : r.duvidasResumo;
    telaEditar(null, {
      ...base, nome: base.nome || r.titulo || semExt(arquivos[0].name), cabecalho: r.cabecalho,
      complemento: base.complemento || r.cabecalho.join(' · ').slice(0, 120), chordpro: r.chordpro,
      ocr: { duvidas: r.duvidasResumo, legibilidade: Math.round(r.legibilidade * 100) },
    }, { original: r.imagens, locais: r.locais, duvidas, origemLida: r.partitura ? 'partitura (imagem)' : foto ? (arquivos.length > 1 ? 'foto (várias páginas)' : 'foto') : 'PDF escaneado', voltar: '#/importar' });
    aviso('Leitura pronta: confira com o original e salve', 3500);
  } catch (err) {
    mostrar('Não foi possível ler: ' + err.message);
  }
}

let pdfjs;
async function carregarPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('../vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}

export function telaImportar(tela) {
  tela.innerHTML = `
    <h1>Importar</h1>
    <div class="cartao">
      <h2 style="margin-top:0">Foto ou PDF escaneado</h2>
      <p class="pequeno suave">Tire uma foto da folha de cifra (ou escolha a imagem / o PDF escaneado): o app lê a letra e os acordes, coloca cada acorde na sílaba certa e abre para você conferir com o original ao lado. Funciona sem internet. Várias fotos de uma vez = páginas da mesma música, na ordem escolhida.</p>
      <p class="pequeno suave">Dica: foto de frente, folha inteira e reta, boa luz, sem sombra.</p>
      <div class="barra">
        <label class="btn primario">📷 Tirar foto<input type="file" id="foto-cam" accept="image/*" capture="environment" hidden></label>
        <label class="btn">Escolher fotos ou PDF<input type="file" id="foto" accept="image/*,application/pdf,.pdf" multiple hidden></label>
      </div>
      <div id="res-foto" class="pequeno" style="white-space:pre-wrap"></div>
    </div>
    <div class="cartao">
      <h2 style="margin-top:0">PDF de cifra, letra ou partitura · MusicXML</h2>
      <p class="pequeno suave">PDFs de texto (como os da arquidiocese) são convertidos na hora. <b>Partitura</b> (pentagrama com acordes) vira cifra com cada acorde na sílaba da sua nota. PDF escaneado (imagem) é lido automaticamente pelo reconhecimento de texto. Os acordes ficam no formato padrão, prontos para transpor.
        <b>MusicXML</b> (.mxl/.musicxml, exportado do MuseScore ou Finale) vira cifra exata.</p>
      <label class="btn primario">Escolher arquivo<input type="file" id="pdf" accept="application/pdf,.pdf,.mxl,.musicxml,.xml" multiple hidden></label>
      <div id="res-pdf" class="pequeno"></div>
    </div>
    <div class="cartao">
      <h2 style="margin-top:0">Colar cifra</h2>
      <p class="pequeno suave">Cole uma cifra de qualquer site (acordes em cima da letra). A primeira linha vira o título.</p>
      <textarea id="texto" placeholder="Título da música&#10;&#10;G        D&#10;Senhor, tende piedade de nós" style="min-height:160px"></textarea>
      <div class="barra"><button class="btn primario" id="colar">Converter e revisar</button><a class="btn" href="#/nova">Digitar do zero</a></div>
    </div>
    <div class="cartao">
      <h2 style="margin-top:0">YouTube ou arquivo de áudio</h2>
      <p class="pequeno suave">Reconhece os acordes ouvindo a música. Com o servidor do computador ligado, também baixa o áudio do YouTube e transcreve a letra (Whisper). O resultado é um rascunho: revise antes de usar.</p>
      <label class="campo"><span>Link do YouTube</span><input type="url" id="yt" placeholder="https://www.youtube.com/watch?v=..."></label>
      <div class="barra"><button class="btn primario" id="cifrar-yt">Cifrar do YouTube</button>
        <label class="btn">Escolher arquivo de áudio<input type="file" id="audio" accept="audio/*,video/*" hidden></label>
        <label class="pequeno"><input type="checkbox" id="letra" checked> Transcrever a letra</label></div>
      <div id="prog" class="progresso"></div>
    </div>`;

  const $ = s => tela.querySelector(s);

  const fotos = async e => {
    const arquivos = [...e.target.files];
    e.target.value = '';
    if (!arquivos.length) return;
    // um PDF por vez; fotos podem ser várias (páginas)
    const pdfs = arquivos.filter(a => !a.type.startsWith('image/') && /pdf$/i.test(a.type || a.name));
    if (pdfs.length && arquivos.length > 1) { aviso('Escolha só fotos (páginas da mesma música) ou um PDF por vez'); return; }
    await lerEInserir(arquivos, $('#res-foto'));
  };
  $('#foto-cam').onchange = fotos;
  $('#foto').onchange = fotos;

  $('#pdf').onchange = async e => {
    const arquivos = [...e.target.files];
    if (!arquivos.length) return;
    const out = $('#res-pdf');
    if (arquivos.length === 1 && ehMusicXml(arquivos[0])) { await importarMusicXml(arquivos[0], out); return; }
    out.textContent = 'Lendo PDF...';
    try {
      const lib = await carregarPdfjs();
      if (arquivos.length === 1) {
        const bytes = new Uint8Array(await arquivos[0].arrayBuffer());
        const rp = await cifraDePartitura(lib, bytes.slice());
        if (rp) {
          telaEditar(null, { nome: rp.titulo || semExt(arquivos[0].name), cabecalho: rp.cabecalho, complemento: rp.cabecalho.join(' · ').slice(0, 120), chordpro: rp.chordpro });
          aviso('Cifra montada a partir da partitura: confira e salve', 3500);
          return;
        }
        const r = await pdfParaCifra(lib, bytes);
        if (!r.chordpro.trim()) { await lerEInserir(arquivos, out); return; } // escaneado: lê pela imagem
        telaEditar(null, { nome: r.titulo || arquivos[0].name.replace(/\.pdf$/i, ''), cabecalho: r.cabecalho, complemento: r.cabecalho.join(' · ').slice(0, 120), chordpro: r.chordpro });
        return;
      }
      // Vários PDFs: salva todos direto como músicas próprias
      const { salvarMinha } = await import('./dados.js');
      let ok = 0, lidas = 0, conferir = 0;
      const vazios = [];
      for (const [i, arq] of arquivos.entries()) {
        const rot = `(${i + 1}/${arquivos.length}) ${arq.name}: `;
        out.textContent = rot + 'lendo...';
        const bytes = new Uint8Array(await arq.arrayBuffer());
        let r = (await cifraDePartitura(lib, bytes.slice())) || await pdfParaCifra(lib, bytes);
        let ocr = null;
        if (!r.chordpro.trim()) { // escaneado: lê pela imagem e marca para conferir se houver dúvida
          const { lerCifra } = await import('./ocr.js');
          r = await lerCifra([arq], t => { out.textContent = rot + t; });
          if (!r.chordpro.trim()) { vazios.push(arq.name); continue; }
          ocr = { duvidas: r.duvidasResumo, legibilidade: Math.round(r.legibilidade * 100), revisar: r.duvidas.length > 0 || r.legibilidade < 0.85 };
          lidas++; if (ocr.revisar) conferir++;
        }
        salvarMinha({ nome: r.titulo || arq.name.replace(/\.pdf$/i, ''), cabecalho: r.cabecalho, chordpro: r.chordpro, ocr });
        ok++;
      }
      out.innerHTML = `${ok} músicas importadas para <a href="#/musicas">Músicas</a> (filtro “Só as minhas músicas”).`
        + (lidas ? `<br>${lidas} eram escaneadas e foram lidas pela imagem${conferir ? `; ${conferir} têm acordes a conferir (selo “revisar”)` : ''}.` : '')
        + (vazios.length ? `<br>Não deu para ler: ${vazios.map(esc).join(', ')}` : '');
    } catch (err) {
      out.textContent = 'Não foi possível ler o PDF: ' + err.message;
    }
  };

  $('#colar').onclick = () => {
    const bruto = $('#texto').value.replace(/\r/g, '');
    if (!bruto.trim()) { aviso('Cole uma cifra primeiro'); return; }
    const conv = bruto.includes('[') ? bruto : textoParaChordPro(bruto);
    const r = separarCabecalho(conv);
    const titulo = r.titulo || conv.split('\n').find(l => l.trim() && !l.includes('['))?.trim() || '';
    telaEditar(null, { nome: titulo, cabecalho: r.cabecalho, chordpro: r.titulo ? r.chordpro : conv });
  };

  const prog = $('#prog');
  const log = t => { prog.textContent += t + '\n'; };

  async function finalizar({ audio, titulo, palavras, youtube }) {
    log('Reconhecendo acordes (pode levar alguns segundos)...');
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = await ctx.decodeAudioData(audio);
    ctx.close();
    const { acordes, tom } = await analisarAudio(buffer, p => { prog.dataset.p = p; });
    log(`Tom provável: ${tom} · ${acordes.length} trocas de acorde`);
    const chordpro = montarChordPro(acordes, palavras);
    telaEditar(null, { nome: titulo || 'Música do áudio', complemento: youtube ? 'Cifrada automaticamente do YouTube — revisar' : 'Cifrada automaticamente — revisar',
      chordpro, youtube });
    aviso('Rascunho pronto. Revise e salve.');
  }

  $('#cifrar-yt').onclick = async () => {
    const url = $('#yt').value.trim();
    const id = (url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/) || [])[1];
    if (!id) { aviso('Link do YouTube inválido'); return; }
    prog.textContent = '';
    const srv = estado.prefs.servidor;
    try {
      log('Conectando ao servidor do computador...');
      const st = await (await fetch(srv + '/api/status')).json();
      if (!st.ytdlp) { log('O servidor precisa do yt-dlp para baixar do YouTube. Veja o LEIAME.'); return; }
      log('Baixando o áudio...');
      const r = await fetch(`${srv}/api/youtube?id=${id}&letra=${$('#letra').checked && st.whisper ? 1 : 0}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'falha no servidor');
      const info = await r.json();
      if (info.palavras) log(`Letra transcrita: ${info.palavras.length} palavras`);
      else if ($('#letra').checked && !st.whisper) log('Whisper não instalado: só os acordes serão reconhecidos.');
      const audio = await (await fetch(srv + info.audio)).arrayBuffer();
      await finalizar({ audio, titulo: info.titulo, palavras: info.palavras, youtube: id });
    } catch (err) {
      log(`Erro: ${err.message}. O servidor está ligado? (node server/servidor.mjs) Endereço em Ajustes: ${srv}`);
    }
  };

  $('#audio').onchange = async e => {
    const arq = e.target.files[0]; if (!arq) return;
    prog.textContent = '';
    try {
      let palavras = null;
      if ($('#letra').checked) {
        try {
          const st = await (await fetch(estado.prefs.servidor + '/api/status')).json();
          if (st.whisper) {
            log('Transcrevendo a letra no servidor...');
            const r = await fetch(estado.prefs.servidor + '/api/transcrever', { method: 'POST', body: arq });
            if (r.ok) palavras = (await r.json()).palavras;
          }
        } catch { log('Servidor indisponível: só os acordes serão reconhecidos.'); }
      }
      await finalizar({ audio: await arq.arrayBuffer(), titulo: arq.name.replace(/\.[^.]+$/, ''), palavras });
    } catch (err) { log('Erro: ' + err.message); }
  };
}
