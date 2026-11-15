// Repertórios propostos pela Comissão de Música Litúrgica da Arquidiocese de Porto Alegre
// (arquipoa.com/musica-liturgica/repertorios-propostos): um por fim de semana/solenidade, com os cantos em ordem.
// Gera app/data/repertorios.json. Uso: node tools/importar-repertorios.mjs [--tudo]
//   sem --tudo, só baixa de novo os repertórios que ainda não estão no arquivo (e sempre os 8 mais recentes)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const RAIZ = new URL('../', import.meta.url).pathname;
const SAIDA = RAIZ + 'app/data/repertorios.json';
const BASE = 'https://www.arquipoa.com/';
const H = { 'User-Agent': 'Mozilla/5.0 (cifras-liturgicas)', 'X-Requested-With': 'XMLHttpRequest' };
const esperar = ms => new Promise(r => setTimeout(r, ms));
const limpar = s => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function post(caminho) {
  for (let t = 0; t < 3; t++) {
    try { const r = await fetch(BASE + caminho, { method: 'POST', headers: H }); if (r.ok) return await r.text(); } catch { /* tenta de novo */ }
    await esperar(1500);
  }
  throw new Error('falhou: ' + caminho);
}

// "2026.12.25-Natal Dia", "27.09.26 - 26DTC", "01/11/2026 ..." → ISO; sem ano → null
function dataDoTitulo(t) {
  let m = t.match(/^\s*(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/);          // "Cristo Rei - 24/11/2024", "(18/08/24)"
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}
const iso = (a, me, d) => (me >= 1 && me <= 12 && d >= 1 && d <= 31) ? `${a}-${String(me).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
// nome curto: tira a data do começo ("2026.11.15-33DTC" → "33DTC")
const nomeCurto = t => t.replace(/^\s*\d{1,4}[.\/-]\d{1,2}([.\/-]\d{2,4})?\s*[-–]?\s*/, '').trim() || t;

const anterior = existsSync(SAIDA) ? JSON.parse(readFileSync(SAIDA, 'utf8')) : { repertorios: [] };
const jaTem = new Map(anterior.repertorios.map(r => [r.id, r]));
const tudo = process.argv.includes('--tudo');

const lista = await post('musica/getRepertorios/9999');
const itens = lista.split(/class="titulo-repertorio[^"]*">/).slice(1).map(s => {
  const titulo = limpar(s.slice(0, s.search(/<(a|button|img)\b/i) > 0 ? s.search(/<(a|button|img)\b/i) : 300)).replace(/\s*Visualiza.*$/i, '');
  const id = +(s.match(/visualizacao-rapida[^>]*data-id="(\d+)"|data-id="(\d+)"[^>]*visualizacao-rapida/) || [])[1] || +(s.match(/data-id="(\d+)"/) || [])[1];
  return { id, titulo, fixo: /FIXO|Ed\. Especial|ENCOMENDA/i.test(s.slice(0, 600)) };
}).filter(r => r.id && r.titulo);

const saida = [];
let baixados = 0;
for (const [n, r] of itens.entries()) {
  const velho = jaTem.get(r.id);
  if (velho && !tudo && n >= 8) { saida.push({ ...velho, titulo: r.titulo, nome: nomeCurto(r.titulo), data: dataDoTitulo(r.titulo) }); continue; }
  const html = await post('musica/visualizacaoRapida/' + r.id);
  const musicas = html.split('lista-de-musicas-item').slice(1).map(b => {
    const texto = limpar((b.match(/<p>([\s\S]*?)<\/p>/) || [])[1] || '');
    const id = +(b.match(/\((\d+)\);\s*return false/) || [])[1] || null;
    return { id, texto };
  }).filter(x => x.id || x.texto);
  saida.push({ id: r.id, titulo: r.titulo, nome: nomeCurto(r.titulo), data: dataDoTitulo(r.titulo), fixo: r.fixo || undefined, musicas });
  baixados++;
  await esperar(250);
}
writeFileSync(SAIDA, JSON.stringify({ atualizado: new Date().toISOString(), repertorios: saida }));
const acervo = new Set(JSON.parse(readFileSync(RAIZ + 'app/data/musicas.json', 'utf8')).musicas.map(m => m.id));
const fora = saida.flatMap(r => r.musicas.filter(m => m.id && !acervo.has(m.id)).map(m => `${m.id} (${r.nome})`));
console.log(`${saida.length} repertórios (${baixados} baixados agora), ${saida.filter(r => r.data).length} com data` +
  (fora.length ? ` · cantos fora do acervo: ${fora.slice(0, 20).join(', ')}${fora.length > 20 ? '…' : ''}` : ' · todos os cantos estão no acervo'));
