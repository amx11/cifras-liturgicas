// Gera o PDF de uma missa com jsPDF. Módulo puro (sem DOM): recebe a classe jsPDF e os dados já prontos.
// missa = { titulo, subtitulo, cantos: [{ rotulo, nome, complemento, tom, linhas: [{ tipo, texto }] }] }
// opcoes = { acordes: true, umaPorPagina: false, grande: false }

const MM_POR_PT = 0.3528;
const PAG = { l: 210, a: 297, esq: 16, dir: 16, topo: 16, base: 16 };

// As fontes padrão do PDF só cobrem Latin-1: troca aspas/travessões e descarta o que não cabe
export function limpar(s) {
  return String(s ?? '')
    .replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[   ]/g, ' ')
    .replace(/\t/g, '    ').replace(/[♯]/g, '#').replace(/[♭]/g, 'b')
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, '');
}

export function gerarPDF(JsPDF, missa, opcoes = {}) {
  const { acordes = true, umaPorPagina = false, grande = false, capa = null } = opcoes;
  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  // capa (imagem JPEG da página inteira) na 1ª página; a numeração começa na seguinte
  if (capa) { doc.addImage(capa, 'JPEG', 0, 0, 210, 297); doc.addPage(); }
  const pulo = capa ? 1 : 0;
  doc.setProperties({ title: limpar(missa.titulo), creator: 'Cifras Liturgicas' });
  const largUtil = PAG.l - PAG.esq - PAG.dir;
  const limite = PAG.a - PAG.base - 6; // deixa espaço para o rodapé
  let y = PAG.topo;
  const cor = { texto: [25, 25, 25], suave: [110, 110, 110], acorde: [165, 55, 20], refrao: [200, 16, 46], linha: [200, 200, 200], verde: [47, 93, 80] };
  const fonte = (nome, estilo, tam, c = cor.texto) => { doc.setFont(nome, estilo); doc.setFontSize(tam); doc.setTextColor(...c); };

  const novaPagina = () => { doc.addPage(); y = PAG.topo; };
  const garantir = h => { if (y + h > limite) novaPagina(); };

  // ----- Cabeçalho e roteiro -----
  fonte('helvetica', 'bold', 20, cor.verde);
  doc.text(limpar(missa.titulo), PAG.esq, y + 7);
  y += 11;
  if (missa.subtitulo) { fonte('helvetica', 'normal', 10.5, cor.suave); doc.text(limpar(missa.subtitulo), PAG.esq, y + 3); y += 7; }
  doc.setDrawColor(...cor.verde); doc.setLineWidth(0.6); doc.line(PAG.esq, y, PAG.l - PAG.dir, y);
  y += 6;

  const cantos = missa.cantos;
  if (!cantos.length) { fonte('helvetica', 'italic', 11, cor.suave); doc.text('Nenhum canto escolhido.', PAG.esq, y + 4); y += 8; }
  else {
    fonte('helvetica', 'bold', 9, cor.suave);
    doc.text('ROTEIRO', PAG.esq, y); y += 5;
    for (const c of cantos) {
      garantir(6);
      fonte('helvetica', 'bold', 10.5);
      const rot = limpar(c.rotulo) + ':';
      doc.text(rot, PAG.esq, y);
      fonte('helvetica', 'normal', 10.5);
      const x0 = PAG.esq + Math.max(32, doc.getTextWidth(rot) + 3);
      const nome = limpar(c.nome);
      doc.text(nome, x0, y);
      if (c.tom) {
        fonte('helvetica', 'bold', 10.5, cor.acorde);
        doc.text(limpar(c.tom), PAG.l - PAG.dir, y, { align: 'right' });
      }
      y += 5.4;
    }
    y += 3;
  }

  // ----- Cantos -----
  cantos.forEach((c, n) => {
    if (c.imagens?.length) { cantoImagem(c, n); return; }
    let linhas = c.linhas.filter(l => acordes || l.tipo !== 'acordes');
    while (linhas.length && linhas.at(-1).tipo === 'vazia') linhas.pop();
    const ESC_REFRAO = 1.15;   // refrão com letra 15% maior
    const maxCol = Math.max(10, ...linhas.map(l => limpar(l.texto).length * (l.refrao ? ESC_REFRAO : 1)));
    const maxTam = grande ? 12.5 : 10.5;
    const tam = Math.max(6.5, Math.min(maxTam, largUtil / (maxCol * 0.6 * MM_POR_PT)));
    const alt = tam * MM_POR_PT * 1.3;
    const alturaCorpo = linhas.reduce((h, l) => h + (l.tipo === 'vazia' ? alt * 0.55 : l.refrao ? alt * ESC_REFRAO : alt), 0);
    const alturaTitulo = 16;
    const util = limite - PAG.topo;

    // Mantém o canto inteiro na mesma página quando couber
    if (umaPorPagina) novaPagina();
    else if (y + alturaTitulo + alturaCorpo > limite && alturaTitulo + alturaCorpo <= util) novaPagina();
    else {
      // separador entre cantos na mesma página
      garantir(alturaTitulo + alt * 3);
      doc.setDrawColor(...cor.linha); doc.setLineWidth(0.25); doc.line(PAG.esq, y, PAG.l - PAG.dir, y); y += 5;
    }

    fonte('helvetica', 'bold', 8, cor.suave);
    doc.text(limpar(c.rotulo).toUpperCase(), PAG.esq, y + 2); y += 5.5;
    fonte('helvetica', 'bold', 14);
    doc.text(limpar(c.nome), PAG.esq, y + 3.5);
    if (c.tom) {
      fonte('helvetica', 'bold', 12, cor.acorde);
      doc.text('Tom: ' + limpar(c.tom), PAG.l - PAG.dir, y + 3.5, { align: 'right' });
    }
    y += 6;
    if (c.complemento) { fonte('helvetica', 'italic', 9, cor.suave); doc.text(limpar(c.complemento), PAG.esq, y + 1.5); y += 4.5; }
    y += 2;

    for (const l of linhas) {
      if (l.tipo === 'vazia') { y += alt * 0.55; continue; }
      const t = l.refrao ? tam * ESC_REFRAO : tam, a = l.refrao ? alt * ESC_REFRAO : alt;
      garantir(a + 1);
      // refrão: letra em negrito e maior; a linha de acordes dele no mesmo tamanho, para os acordes ficarem sobre a sílaba certa
      if (l.tipo === 'acordes') fonte('courier', 'bold', t, cor.acorde);
      else if (l.tipo === 'comentario') fonte('courier', 'italic', t, cor.suave);
      else if (l.refrao) fonte('courier', 'bold', t, cor.refrao);
      else fonte('courier', 'normal', t);
      doc.text(limpar(l.texto), PAG.esq, y + t * MM_POR_PT * 0.85);
      y += a;
    }
    y += 7;
  });

  // Cifra escaneada: cada página do PDF original vira uma imagem, ocupando a largura útil
  function cantoImagem(c, n) {
    novaPagina();
    fonte('helvetica', 'bold', 8, cor.suave);
    doc.text(limpar(c.rotulo).toUpperCase(), PAG.esq, y + 2); y += 5.5;
    fonte('helvetica', 'bold', 14);
    doc.text(limpar(c.nome), PAG.esq, y + 3.5);
    if (c.tom) { fonte('helvetica', 'bold', 12, cor.acorde); doc.text('Tom: ' + limpar(c.tom), PAG.l - PAG.dir, y + 3.5, { align: 'right' }); }
    y += 8;
    c.imagens.forEach((img, k) => {
      let w = largUtil, h = img.h * w / img.w;
      const disp = limite - y;
      if (h > disp) { if (k > 0 || disp < 120) { novaPagina(); } const d2 = limite - y; if (h > d2) { h = d2; w = img.w * h / img.h; } }
      doc.addImage(img.dataUrl, 'JPEG', PAG.esq, y, w, h, undefined, 'FAST');
      y += h + 4;
    });
  }

  // ----- Rodapé com numeração -----
  const total = doc.getNumberOfPages();
  for (let p = 1 + pulo; p <= total; p++) {
    doc.setPage(p);
    fonte('helvetica', 'normal', 8, cor.suave);
    doc.text(limpar(missa.titulo), PAG.esq, PAG.a - 9);
    doc.text(`${p - pulo} / ${total - pulo}`, PAG.l - PAG.dir, PAG.a - 9, { align: 'right' });
  }
  return doc;
}
