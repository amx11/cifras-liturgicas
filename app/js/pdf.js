// Extrai itens de texto com posição de um PDF usando pdf.js (navegador ou Node)
import { itensParaChordPro } from './cifra.js';

export async function pdfParaItens(pdfjsLib, dados) {
  const doc = await pdfjsLib.getDocument({ data: dados, useSystemFonts: true, isEvalSupported: false }).promise;
  const itens = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const { height } = pagina.getViewport({ scale: 1 });
    const conteudo = await pagina.getTextContent();
    for (const it of conteudo.items) {
      if (!('str' in it)) continue;
      const [, , , escalaY, x, y] = it.transform;
      const h = Math.abs(escalaY) || it.height || 10;
      itens.push({ str: it.str, x, y: height - y, w: it.width, h, pagina: p });
    }
  }
  await doc.destroy();
  return itens;
}

// Retorna { titulo, cabecalho: [linhas], chordpro }
export async function pdfParaCifra(pdfjsLib, dados) {
  const itens = await pdfParaItens(pdfjsLib, dados);
  const corpo = itensParaChordPro(itens);
  return separarCabecalho(corpo);
}

// As primeiras linhas antes do primeiro acorde costumam ser título, autor e observações
export function separarCabecalho(corpo) {
  const linhas = corpo.split('\n');
  const primeiraCifrada = linhas.findIndex(l => l.includes('['));
  let cabecalho = [];
  if (primeiraCifrada > 0 && primeiraCifrada <= 6) {
    cabecalho = linhas.slice(0, primeiraCifrada).map(l => l.trim()).filter(Boolean);
    linhas.splice(0, primeiraCifrada);
  }
  const titulo = cabecalho.shift() || '';
  return { titulo, cabecalho, chordpro: linhas.join('\n').replace(/^\n+/, '') };
}
