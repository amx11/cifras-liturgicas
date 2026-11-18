// Baixa os arquivos MuseScore (.mscz) das músicas da arquidiocese para tools/cache/mscz/<id>.mscz
// (o .mscz traz, nota por nota, o acorde e a sílaba de cada estrofe). Retoma de onde parou.
// Uso: node tools/baixar-mscz.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const RAIZ = new URL('../', import.meta.url).pathname;
const CACHE = RAIZ + 'tools/cache/', BASE = 'https://www.arquipoa.com/';
const H = { 'User-Agent': 'Mozilla/5.0 (cifras-liturgicas)', 'X-Requested-With': 'XMLHttpRequest' };
const espera = ms => new Promise(r => setTimeout(r, ms));
const dados = JSON.parse(readFileSync(RAIZ + 'app/data/musicas.json', 'utf8'));
let baixados = 0, sem = 0, falhas = [];
for (const m of dados.musicas.filter(m => m.id < 100000)) {
  const destino = `${CACHE}mscz/${m.id}.mscz`;
  if (existsSync(destino)) continue;
  const arqModal = `${CACHE}html/modalMuse-${m.id}.html`;
  let html;
  if (existsSync(arqModal)) html = readFileSync(arqModal, 'utf8');
  else {
    try { html = await (await fetch(`${BASE}musica/modalMuse/${m.id}`, { method: 'POST', headers: H })).text(); } catch { falhas.push(m.id); continue; }
    writeFileSync(arqModal, html); await espera(120);
  }
  const url = (html.match(/href="(https:\/\/www\.arquipoa\.com\/uploads\/[^"]+\.mscz)"/i) || [])[1];
  if (!url) { sem++; continue; }
  let ok = false;
  for (const forma of ['NFC', 'NFD']) {
    try {
      const u = encodeURI(decodeURI(url).normalize(forma));
      const r = await fetch(u, { headers: { 'User-Agent': H['User-Agent'] } });
      const b = Buffer.from(await r.arrayBuffer());
      if (r.ok && b[0] === 0x50 && b[1] === 0x4b) { writeFileSync(destino, b); ok = true; break; }   // zip ("PK")
    } catch { /* tenta a outra forma */ }
  }
  if (ok) baixados++; else falhas.push(m.id);
  await espera(200);
  if ((baixados + falhas.length) % 50 === 0) console.log(`… ${baixados} baixados, ${falhas.length} falhas`);
}
console.log(`${baixados} baixados agora · ${sem} sem MuseScore · falhas: ${falhas.join(', ') || 'nenhuma'}`);
