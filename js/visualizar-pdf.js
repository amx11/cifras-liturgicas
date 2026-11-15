// Mostra PDFs escaneados (cifra em imagem) dentro do app e converte as páginas em imagens para o PDF da missa
let pdfjs;
export async function carregarPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('../vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}

const urlDoApp = caminho => new URL('../' + caminho, import.meta.url).href;

async function abrir(caminho) {
  const lib = await carregarPdfjs();
  return lib.getDocument({ url: urlDoApp(caminho), isEvalSupported: false }).promise;
}

// Desenha todas as páginas no elemento (largura do elemento, nitidez da tela)
export async function desenharPDF(caminho, alvo) {
  alvo.innerHTML = '<p class="pequeno suave">Carregando a cifra escaneada...</p>';
  try {
    const doc = await abrir(caminho);
    alvo.innerHTML = '';
    const largura = Math.max(320, alvo.clientWidth || 800);
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.getPage(p);
      const base = pg.getViewport({ scale: 1 });
      const escala = (largura / base.width) * Math.min(2, window.devicePixelRatio || 1);
      const vp = pg.getViewport({ scale: escala });
      const cv = document.createElement('canvas');
      cv.width = vp.width; cv.height = vp.height;
      cv.className = 'pagina-escaneada';
      cv.setAttribute('aria-label', `Página ${p} da cifra escaneada`);
      await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      alvo.append(cv);
    }
    await doc.destroy();
  } catch (e) {
    alvo.innerHTML = `<p class="vazio">Não foi possível abrir a cifra escaneada (${e.message}).</p>`;
  }
}

// Páginas como JPEG (dataURL) para embutir no PDF da missa
export async function paginasComoImagens(caminho, larguraPx = 1400) {
  const doc = await abrir(caminho);
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pg = await doc.getPage(p);
    const base = pg.getViewport({ scale: 1 });
    const vp = pg.getViewport({ scale: larguraPx / base.width });
    const cv = document.createElement('canvas');
    cv.width = vp.width; cv.height = vp.height;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push({ dataUrl: cv.toDataURL('image/jpeg', 0.85), w: cv.width, h: cv.height });
  }
  await doc.destroy();
  return out;
}

// ---------- Recortes ampliados (conferência de pontos duvidosos do OCR) ----------
// Página renderizada uma vez (em alta resolução) e reaproveitada para todos os recortes dela.
const paginasCache = new Map();
async function paginaEmCanvas(caminho, n, escala = 4) {
  const chave = `${caminho}#${n}`;
  if (!paginasCache.has(chave)) {
    paginasCache.set(chave, (async () => {
      const doc = await abrir(caminho);
      const pg = await doc.getPage(n);
      const vp = pg.getViewport({ scale: escala });
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      return { cv, escala };
    })());
    if (paginasCache.size > 12) paginasCache.delete(paginasCache.keys().next().value);
  }
  return paginasCache.get(chave);
}

async function imagemEmCanvas(dataUrl) {
  if (!paginasCache.has(dataUrl)) paginasCache.set(dataUrl, (async () => {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.getContext('2d').drawImage(img, 0, 0);
    return { cv, escala: img.naturalWidth / 595 };   // fotos: coordenadas em pontos de uma folha A4
  })());
  return paginasCache.get(dataUrl);
}

// Recorte em volta de (x, y) em pontos: a linha de acordes (que termina em y) e a letra embaixo.
// fonte: { pdf: caminho } ou { imagens: [dataUrl...] }. Marca o lugar do acorde com uma seta.
export async function recorte(fonte, { p, x, y }, larguraPt = 300) {
  const { cv, escala } = fonte.pdf ? await paginaEmCanvas(fonte.pdf, p) : await imagemEmCanvas(fonte.imagens[p - 1]);
  // y = base da linha de acordes: mostra um pouco acima (espaço para a seta) e a linha da letra embaixo
  const x0 = Math.max(0, (x - larguraPt / 2) * escala), y0 = Math.max(0, (y - 30) * escala);
  const w = Math.min(cv.width - x0, larguraPt * escala), h = Math.min(cv.height - y0, 54 * escala);
  const out = document.createElement('canvas');
  out.width = Math.round(w); out.height = Math.round(h);
  const ctx = out.getContext('2d');
  ctx.drawImage(cv, x0, y0, w, h, 0, 0, w, h);
  // seta vermelha logo acima do acorde (a ponta encosta no topo das letras do acorde)
  const ax = x * escala - x0 + 3 * escala, ponta = (y - 12) * escala - y0, t = 3.2 * escala;
  ctx.fillStyle = 'rgba(220, 38, 38, .95)';
  ctx.beginPath(); ctx.moveTo(ax - t, ponta - t * 1.6); ctx.lineTo(ax + t, ponta - t * 1.6); ctx.lineTo(ax, ponta); ctx.closePath(); ctx.fill();
  out.className = 'recorte-original';
  return out;
}
