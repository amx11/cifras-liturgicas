// Baixa (devagar, com novas tentativas) as partituras das músicas que não têm cifra em texto,
// para tools/cache/pdf/<id>-par.pdf. Uso: node tools/baixar-partituras.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const RAIZ = new URL('../', import.meta.url).pathname;
const dados = JSON.parse(readFileSync(RAIZ + 'app/data/musicas.json', 'utf8'));
mkdirSync(RAIZ + 'tools/cache/pdf', { recursive: true });
const espera = ms => new Promise(r => setTimeout(r, ms));
// primeiro as sem cifra (viram cifra), depois as demais (para ver a partitura no app)
const alvo = [...dados.musicas.filter(m => !m.chordpro && m.partitura), ...dados.musicas.filter(m => m.chordpro && m.partitura)];
let ok = 0, ja = 0, falhas = [];
for (const [i, m] of alvo.entries()) {
  const arq = `${RAIZ}tools/cache/pdf/${m.id}-par.pdf`;
  if (existsSync(arq)) { ja++; continue; }
  let feito = false;
  for (let t = 1; t <= 5 && !feito; t++) {
    try {
      // o servidor só acha o arquivo com o acento na forma composta (NFC); tenta a original depois
      const url = t % 2 ? encodeURI(decodeURI(m.partitura).normalize('NFC')) : m.partitura;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (cifras-liturgicas)' }, signal: AbortSignal.timeout(30000) });
      if (r.status === 404 && t > 1) break;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const b = Buffer.from(await r.arrayBuffer());
      if (b.slice(0, 4).toString() !== '%PDF') throw new Error('não é PDF');
      writeFileSync(arq, b); ok++; feito = true;
    } catch (e) { await espera(t % 2 ? 1000 : 6000 * t); }
  }
  if (!feito) falhas.push(m.id);
  if ((i + 1) % 20 === 0) console.log(`${i + 1}/${alvo.length} (baixadas ${ok}, já tinha ${ja}, falhas ${falhas.length})`);
  await espera(1500);
}
console.log(`Pronto: ${ok} baixadas, ${ja} já existiam, ${falhas.length} falharam: ${falhas.join(' ')}`);
