// Canal do YouTube "Santa Missa Jovem" (@santamissajovem): cada vídeo traz na descrição a letra e um link
// "Cifra:" (bit.ly → PDF no Google Drive). Baixa, para cada vídeo, o título, a descrição e o PDF da cifra.
// Lista de vídeos em tools/cache/canal/ids.txt (lida da página do canal). Retoma de onde parou.
// Também serve para o canal "Salmodiai ao nosso Deus" (cifra num Google Docs em fonte monoespaçada: baixa o texto).
// Uso: node tools/baixar-canal.mjs [pasta]   (pasta em tools/cache, padrão "canal")
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const RAIZ = new URL('../', import.meta.url).pathname;
const DIR = RAIZ + `tools/cache/${process.argv[2] || 'canal'}/`;
mkdirSync(DIR + 'pdf', { recursive: true });
mkdirSync(DIR + 'doc', { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const espera = ms => new Promise(r => setTimeout(r, ms));
const ids = readFileSync(DIR + 'ids.txt', 'utf8').split(/\s+/).filter(Boolean);
const arqInfo = DIR + 'videos.json';
const info = existsSync(arqInfo) ? JSON.parse(readFileSync(arqInfo, 'utf8')) : {};
let novos = 0, pdfs = 0;
for (const id of ids) {
  let v = info[id];
  if (!v) {
    try {
      const html = await (await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' } })).text();
      const m = html.match(/var ytInitialPlayerResponse = (\{.*?\});(?:var|<\/script>)/s);
      const vd = m ? JSON.parse(m[1]).videoDetails : null;
      if (!vd) { console.log('sem dados:', id); continue; }
      v = info[id] = { titulo: vd.title, descricao: vd.shortDescription || '' };
      novos++;
      await espera(400);
    } catch (e) { console.log('falhou', id, e.message); continue; }
  }
  // link da cifra: "Cifra: https://bit.ly/..." (ou direto no Drive)
  if (v.cifraUrl === undefined) {
    const doc = (v.descricao.match(/docs\.google\.com\/document\/d\/([\w-]{20,})/) || [])[1];
    if (doc) v.doc = doc;
    const link = doc ? null : (v.descricao.match(/cifra[^:\n]*:\s*(https?:\/\/\S+)/i) || v.descricao.match(/(https?:\/\/(?:bit\.ly|drive\.google\.com)\/\S+)/i) || [])[1] || null;
    v.cifraUrl = link;
    if (link) {
      try {
        let url = link;
        for (let k = 0; k < 5 && !/drive\.google\.com/.test(url); k++) {
          const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': UA } });
          const loc = r.headers.get('location'); if (!loc) break; url = loc;
        }
        v.drive = (url.match(/\/d\/([\w-]{20,})/) || url.match(/[?&]id=([\w-]{20,})/) || [])[1] || null;
      } catch { v.drive = null; }
    }
  }
  if (v.doc && !existsSync(`${DIR}doc/${id}.txt`)) {
    try {
      const r = await fetch(`https://docs.google.com/document/d/${v.doc}/export?format=txt`, { headers: { 'User-Agent': UA } });
      const t = await r.text();
      if (r.ok && !/<html/i.test(t.slice(0, 200))) { writeFileSync(`${DIR}doc/${id}.txt`, t.replace(/^\uFEFF/, '').replace(/\r/g, '')); pdfs++; } else v.semDoc = true;
      await espera(300);
    } catch (e) { console.log('doc falhou', id, e.message); }
  }
  if (v.drive && !existsSync(`${DIR}pdf/${id}.pdf`)) {
    try {
      const r = await fetch(`https://drive.google.com/uc?export=download&id=${v.drive}`, { headers: { 'User-Agent': UA } });
      const b = Buffer.from(await r.arrayBuffer());
      if (b.slice(0, 4).toString() === '%PDF') { writeFileSync(`${DIR}pdf/${id}.pdf`, b); pdfs++; } else v.semPdf = true;
      await espera(300);
    } catch (e) { console.log('pdf falhou', id, e.message); }
  }
  writeFileSync(arqInfo, JSON.stringify(info, null, 1));
}
const lista = Object.values(info);
console.log(`${ids.length} vídeos · ${novos} lidos agora · ${lista.filter(v => v.cifraUrl).length} com link de cifra · ${lista.filter(v => v.drive).length} PDFs no Drive · ${lista.filter(v => v.doc).length} no Google Docs · ${pdfs} arquivos baixados agora`);
