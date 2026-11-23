// Exportar a missa em PDF: monta os cantos (tom e versão escolhidos) e baixa o arquivo
import { estado, musica } from './dados.js';
import { linhasCifra, semitonsEntre, preferirBemol } from './cifra.js';
import { gerarPDF } from './pdf-missa.js';
import { esc, aviso, modal, nomeTempo } from './ui.js';
import { paginasComoImagens } from './visualizar-pdf.js';
import { CAPAS, capaPorId, capaAutomatica, svgCapa, urlSvg, pngCapa, textosDaCapa } from './capas.js';
import { salvarMissas, estado as estadoApp } from './dados.js';

let carregando = null;
export function carregarJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  carregando ||= new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/jspdf.umd.min.js', import.meta.url).href;
    s.onload = () => (window.jspdf?.jsPDF ? ok(window.jspdf.jsPDF) : falha(new Error('gerador de PDF inválido')));
    s.onerror = () => { carregando = null; falha(new Error('não foi possível carregar o gerador de PDF')); };
    document.head.append(s);
  });
  return carregando;
}

export function dadosDaMissa(x, { acordes = true } = {}) {
  const data = x.data ? new Date(x.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const partes = [data, x.tempo ? nomeTempo(x.tempo) : '', x.ano ? estado.taxonomia.anos[x.ano] : ''].filter(Boolean);
  const cantos = [];
  for (const it of x.itens) {
    const m = it.chave && musica(it.chave);
    if (!m || it.modo === 'rezada') continue;   // parte rezada: sem canto
    const tom = it.tom || estado.tons[m.chave] || m.tom || '';
    const semitons = m.tom && tom ? semitonsEntre(m.tom, tom) : 0;
    cantos.push({
      rotulo: it.rotulo || 'Canto', nome: (m.num ? m.num + '. ' : '') + m.nome, tom,
      complemento: m.personalizada ? 'Versão personalizada' : (m.complemento || ''), pdfImagem: !m.chordpro ? m.pdfImagem : null,
      linhas: linhasCifra(m.chordpro || '', { semitons, bemol: tom ? preferirBemol(tom) : false, mostrarAcordes: acordes }),
    });
  }
  return { titulo: x.titulo, subtitulo: partes.join('  ·  '), cantos };
}

export function exportarMissa(x) {
  const n = x.itens.filter(it => it.chave && musica(it.chave) && it.modo !== 'rezada').length;
  if (!n) { aviso('Escolha pelo menos um canto antes de exportar'); return; }
  const { el, fechar } = modal(`
    <h2 style="margin-top:0">Exportar “${esc(x.titulo)}” em PDF</h2>
    <p class="pequeno suave">${n} ${n === 1 ? 'canto' : 'cantos'}, cada um no tom e na versão escolhidos para a missa.</p>
    <label style="display:block;margin:8px 0"><input type="checkbox" id="ac" checked> Incluir os acordes (cifra)</label>
    <label style="display:block;margin:8px 0"><input type="checkbox" id="um"> Um canto por página</label>
    <label style="display:block;margin:8px 0"><input type="checkbox" id="gr"> Letra maior (mais fácil de ler no estante)</label>
    <label style="display:block;margin:8px 0">Capa: <select id="capa"></select></label>
    <img id="prev-capa" alt="Prévia da capa" style="width:140px;border-radius:4px;display:block;margin:4px 0 8px;box-shadow:0 1px 4px #0003">
    <div class="barra" style="justify-content:flex-end"><button class="btn" data-fechar>Cancelar</button><button class="btn primario" id="ok">⬇ Baixar PDF</button></div>
    <p id="msg" class="pequeno suave"></p>`);
  const selCapa = el.querySelector('#capa'), prev = el.querySelector('#prev-capa'), auto = capaAutomatica(x);
  selCapa.innerHTML = `<option value="auto">Automática: ${esc(auto.nome)}</option>${CAPAS.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}<option value="nenhuma">Sem capa</option>`;
  selCapa.value = x.capa || 'auto';
  const capaEscolhida = () => (selCapa.value === 'nenhuma' ? null : selCapa.value === 'auto' ? auto : capaPorId(selCapa.value));
  const A4 = { largura: 1240, altura: 1754 };
  const mostrarPrevia = () => { const c = capaEscolhida(); prev.hidden = !c; if (c) prev.src = urlSvg(svgCapa(c, { ...textosDaCapa(x, c, estadoApp.prefs.paroquia), ...A4 })); };
  selCapa.onchange = () => { x.capa = selCapa.value; salvarMissas(); mostrarPrevia(); };
  mostrarPrevia();
  el.querySelector('#ok').onclick = async () => {
    const msg = el.querySelector('#msg'), btn = el.querySelector('#ok');
    btn.disabled = true; msg.textContent = 'Gerando o PDF...';
    try {
      const acordes = el.querySelector('#ac').checked;
      const JsPDF = await carregarJsPDF();
      const dados = dadosDaMissa(x, { acordes });
      for (const c of dados.cantos) {
        if (!c.pdfImagem) continue;
        msg.textContent = `Incluindo a cifra escaneada de “${c.nome}”...`;
        try { c.imagens = await paginasComoImagens(c.pdfImagem); } catch { c.imagens = null; }
      }
      const c = capaEscolhida();
      const capa = c ? await pngCapa(c, { ...textosDaCapa(x, c, estadoApp.prefs.paroquia), ...A4 }) : null;
      const doc = gerarPDF(JsPDF, dados, { acordes, umaPorPagina: el.querySelector('#um').checked, grande: el.querySelector('#gr').checked, capa });
      const nome = `${x.data || 'missa'} - ${x.titulo}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
      doc.save(nome);
      aviso('PDF gerado: ' + nome, 4000);
      fechar();
    } catch (err) {
      btn.disabled = false; msg.textContent = 'Não foi possível gerar o PDF: ' + err.message;
    }
  };
}
