// Links de áudio e vídeo de cada música, a partir das páginas do site já salvas (tools/cache/html):
//  - todos os <audio> da página (algumas músicas têm várias versões gravadas)
//  - o site parte o nome do arquivo nas vírgulas ("Glorifica_o_senhor" + "_Jerusalém.mp3"): junta os pedaços
//  - acentos: o servidor tem arquivos gravados em NFD e outros em NFC; fica a forma que abre
//  - YouTube em formato /live/ID?t=segundos
// Só guarda os links (não baixa o áudio). Uso: node tools/links-audio.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
const RAIZ = new URL('../', import.meta.url).pathname;
const ARQ = RAIZ + 'app/data/musicas.json', HTML = RAIZ + 'tools/cache/html/';
const dados = JSON.parse(readFileSync(ARQ, 'utf8'));
const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const status = async u => { for (let t = 0; t < 3; t++) { try { return (await fetch(u, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } })).status; } catch { await new Promise(r => setTimeout(r, 2000)); } } return 0; };
const formas = s => { const u = new URL(s); const p = decodeURIComponent(u.pathname); return [...new Set([p.normalize('NFD'), p.normalize('NFC')].map(x => u.origin + encodeURI(x)))]; };
async function queAbre(s) { for (const f of formas(s)) if (await status(f) === 200) return f; return null; }
const daMusica = id => dados.musicas.filter(m => m.id === id || Math.floor((m.id - 100000) / 10) === id);   // e as versões separadas

let comAudio = 0, quebrados = [];
for (const f of readdirSync(HTML).filter(f => /^modalMusica-\d+\.html$/.test(f))) {
  const id = +f.match(/\d+/)[0];
  const blocos = readFileSync(HTML + f, 'utf8').split(/<audio\b/).slice(1).map(b => (b.match(/src="([^"]+)"/) || [])[1]).filter(Boolean).map(dec);
  const links = [], ruins = [];
  for (let k = 0; k < blocos.length; k++) {
    let bom = await queAbre(blocos[k]);
    if (!bom) { let j = blocos[k], n = k; while (!bom && n + 1 < blocos.length && /\/_/.test(blocos[n + 1])) { n++; j += ',' + blocos[n].split('/').pop(); bom = await queAbre(j); } if (bom) k = n; }
    if (bom) links.push(bom); else if (!/\/_/.test(blocos[k])) ruins.push(formas(blocos[k])[0]);
  }
  for (const m of daMusica(id)) {
    delete m.audios; delete m.audioQuebrado;
    if (links.length) { m.audio = links[0]; if (links.length > 1) m.audios = links; }
    else if (ruins.length) { m.audio = ruins[0]; m.audioQuebrado = true; }
  }
  if (links.length) comAudio++; else if (ruins.length) quebrados.push(id);
}
let videos = 0;
for (const f of readdirSync(HTML).filter(f => /^modalYoutube-\d+\.html$/.test(f))) {
  const id = +f.match(/\d+/)[0], h = readFileSync(HTML + f, 'utf8');
  const e = h.match(/youtube\.com\/embed\/([\w-]{6,})/), l = h.match(/youtu(?:\.be\/|be\.com\/(?:live\/|watch\?v=))([\w-]{6,})(?:[^"'<\s]*[?&]t=(\d+))?/);
  const vid = e ? e[1] : l?.[1];
  if (!vid) continue;
  for (const m of daMusica(id)) { m.youtube = vid; if (!e && l[2]) m.youtubeInicio = +l[2]; else delete m.youtubeInicio; }
  videos++;
}
writeFileSync(ARQ, JSON.stringify(dados));
console.log(`${comAudio} músicas com áudio que abre · ${quebrados.length} com o arquivo quebrado no site (${quebrados.join(', ')}) · ${videos} com vídeo`);
