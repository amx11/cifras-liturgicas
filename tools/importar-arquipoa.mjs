// Importa o acervo de música litúrgica da Arquidiocese de Porto Alegre
// (https://www.arquipoa.com/musica-liturgica/musicas) para app/data/musicas.json.
// Uso: node tools/importar-arquipoa.mjs
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfParaCifra } from '../app/js/pdf.js';
import { detectarTom } from '../app/js/cifra.js';
import { anexarEscaneadas } from './anexar-escaneadas.mjs';

const BASE = 'https://www.arquipoa.com/';
const CACHE = new URL('./cache/', import.meta.url).pathname;
const SAIDA = new URL('../app/data/musicas.json', import.meta.url).pathname;
mkdirSync(CACHE + 'pdf', { recursive: true });
mkdirSync(CACHE + 'html', { recursive: true });

export const TEMPOS = { 1: 'Advento', 4: 'Tempo do Natal', 5: 'Tempo Comum', 2: 'Quaresma',
  6: 'Semana Santa e Tríduo Pascal', 3: 'Tempo Pascal', 7: 'Solenidades e Festas' };
export const PARTES = { 4: 'Entrada / Abertura', 19: 'Presidência e Assembleia', 5: 'Ato Penitencial / Kyrie',
  1: 'Glória', 6: 'Salmo Responsorial', 3: 'Aclamação / Sequências / Creio / Preces',
  10: 'Apresentação das Oferendas', 2: 'Santo / Prece Eucarística', 15: 'Cordeiro de Deus',
  16: 'Comunhão', 18: 'Outros / Temáticos / Refrão Orante' };
export const CATEGORIAS = { 1: 'Cantos do Presidente/Assembleia', 2: 'Partes Fixas / Ordinário', 3: 'Próprio do Tempo', 4: 'Diversos' };
export const ANOS = { 1: 'Ano A', 2: 'Ano B', 3: 'Ano C' };

const espera = ms => new Promise(r => setTimeout(r, ms));

async function buscar(url, opcoes = {}, tentativas = 3) {
  for (let t = 1; ; t++) {
    try {
      const r = await fetch(url, { ...opcoes, headers: { 'User-Agent': 'Mozilla/5.0 (cifras-liturgicas)', 'X-Requested-With': 'XMLHttpRequest', ...(opcoes.headers || {}) } });
      if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
      return r;
    } catch (e) {
      if (t >= tentativas) throw e;
      await espera(1000 * t);
    }
  }
}

function decodificar(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function lerLista(html) {
  const itens = [];
  for (const bloco of html.split('lista-de-musicas-item').slice(1)) {
    const titulo = decodificar((bloco.match(/<p>\s*([\s\S]*?)\s*<\/p>/) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const id = (bloco.match(/\w+\((\d+)\); return false/) || [])[1];
    if (!id || !titulo) continue;
    const recursos = [...bloco.matchAll(/onclick="(\w+)\(\d+\)/g)].map(m => m[1]);
    itens.push({ id: Number(id), titulo, recursos });
  }
  return itens;
}

// Percorre todas as páginas de um filtro
async function listar(filtros) {
  const todos = [];
  for (let pagina = 0; pagina < 500; pagina++) {
    const corpo = new URLSearchParams({ pagina: String(pagina), term: '' });
    for (const [chave, valores] of Object.entries(filtros)) for (const v of valores) corpo.append(`${chave}[]`, v);
    const r = await buscar(BASE + 'musica/pagina/', { method: 'POST', body: corpo });
    const itens = lerLista(await r.text());
    if (!itens.length) break;
    todos.push(...itens);
    await espera(150);
  }
  return todos;
}

async function modal(tipo, id) {
  const arq = `${CACHE}html/${tipo}-${id}.html`;
  if (existsSync(arq)) return readFileSync(arq, 'utf8');
  const html = await (await buscar(`${BASE}musica/${tipo}/${id}`, { method: 'POST' })).text();
  writeFileSync(arq, html);
  await espera(100);
  return html;
}

// Os arquivos no servidor usam nomes com acentos decompostos (NFD)
function urlArquivo(url) {
  const u = new URL(decodificar(url));
  const caminho = decodeURIComponent(u.pathname).normalize('NFD');
  return u.origin + encodeURI(caminho);
}

async function baixarPdf(url, nome) {
  const arq = `${CACHE}pdf/${nome}.pdf`;
  if (existsSync(arq)) return new Uint8Array(readFileSync(arq));
  for (const tentativa of [urlArquivo(url), encodeURI(decodificar(url))]) {
    try {
      const r = await buscar(tentativa, {}, 2);
      if (!(r.headers.get('content-type') || '').includes('pdf')) continue;
      const dados = new Uint8Array(await r.arrayBuffer());
      writeFileSync(arq, dados);
      return dados;
    } catch { /* tenta a próxima forma de codificar a URL */ }
  }
  return null;
}

function linkPdf(html) {
  const m = html.match(/href="(https:\/\/www\.arquipoa\.com\/uploads\/Musicas\/[^"]+\.pdf)"/i);
  return m ? decodificar(m[1]) : null;
}

async function emParalelo(lista, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < lista.length) { const k = i++; await fn(lista[k], k); }
  }));
}

async function main() {
  const musicas = new Map();
  const garantir = it => {
    if (!musicas.has(it.id)) musicas.set(it.id, { ...it, tempos: [], partes: [], categorias: [], anos: [] });
    return musicas.get(it.id);
  };

  console.log('Listando todas as músicas...');
  for (const it of await listar({})) garantir(it);
  console.log(`  ${musicas.size} músicas`);

  const marcar = async (campo, chaveFiltro, mapa) => {
    for (const id of Object.keys(mapa)) {
      const lista = await listar({ [chaveFiltro]: [id] });
      for (const it of lista) { const m = garantir(it); if (!m[campo].includes(+id)) m[campo].push(+id); }
      console.log(`  ${mapa[id]}: ${lista.length}`);
    }
  };
  console.log('Tempos litúrgicos:'); await marcar('tempos', 'tempo', TEMPOS);
  console.log('Partes da missa:'); await marcar('partes', 'partes', PARTES);
  console.log('Categorias:'); await marcar('categorias', 'categoria', CATEGORIAS);
  console.log('Anos litúrgicos:'); await marcar('anos', 'ano', ANOS);

  const lista = [...musicas.values()];
  let feitas = 0, comCifra = 0, falhas = [];
  console.log('Baixando cifras, letras, áudio e vídeos...');
  await emParalelo(lista, 4, async m => {
    try {
      if (m.recursos.includes('listeningMusic')) {
        const src = (await modal('modalMusica', m.id)).match(/src="([^"]+\.(?:mp3|m4a|mp4|wav|aac|ogg|oga|wma|flac))"/i);
        if (src) m.audio = urlArquivo(src[1]);
      }
      if (m.recursos.includes('viewYoutube')) {
        const yt = (await modal('modalYoutube', m.id)).match(/youtube\.com\/embed\/([\w-]{6,})/);
        if (yt) m.youtube = yt[1];
      }
      if (m.recursos.includes('partituraMusica')) {
        const p = linkPdf(await modal('modalPartitura', m.id));
        if (p) m.partitura = urlArquivo(p);
      }
      for (const [recurso, tipo, sufixo] of [['cifraMusica', 'modalCifra', 'cif'], ['letraMusica', 'modalLetra', 'let']]) {
        if (!m.recursos.includes(recurso)) continue;
        const url = linkPdf(await modal(tipo, m.id));
        if (!url) continue;
        const dados = await baixarPdf(url, `${m.id}-${sufixo}`);
        if (!dados) { falhas.push(`${m.id} ${sufixo}`); continue; }
        const r = await pdfParaCifra(pdfjs, dados);
        if (!r.chordpro.trim()) continue;
        m.pdf = urlArquivo(url);
        m.cabecalho = r.cabecalho;
        m.chordpro = r.chordpro;
        m.temCifra = r.chordpro.includes('[');
        if (m.temCifra) { comCifra++; break; }
      }
      m.tom = m.chordpro ? detectarTom(m.chordpro) : '';
    } catch (e) {
      falhas.push(`${m.id}: ${e.message}`);
    }
    if (++feitas % 50 === 0) console.log(`  ${feitas}/${lista.length}`);
  });

  const saida = lista
    .map(({ recursos, ...m }) => ({ ...m, ...separarNumero(m.titulo) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const final = {
    fonte: 'Arquidiocese de Porto Alegre — Música Litúrgica',
    url: 'https://www.arquipoa.com/musica-liturgica/musicas',
    atualizado: new Date().toISOString(),
    tempos: TEMPOS, partes: PARTES, categorias: CATEGORIAS, anos: ANOS,
    musicas: saida,
  };
  const escaneadas = anexarEscaneadas(final);
  writeFileSync(SAIDA, JSON.stringify(final));
  console.log(`  ${escaneadas} cifras escaneadas (imagem) anexadas em app/data/pdf/`);
  console.log('Depois rode: node tools/links-audio.mjs  (links de áudio/vídeo com nomes partidos e acentos)');
  console.log(`Pronto: ${saida.length} músicas, ${comCifra} com cifra, ${saida.filter(m => m.chordpro && !m.temCifra).length} só com letra.`);
  if (falhas.length) console.log(`Falhas (${falhas.length}):\n  ` + falhas.slice(0, 30).join('\n  '));
}

// "10. Das alturas orvalhem os céus - Entrada 4D Adv." -> numero, nome e complemento
function separarNumero(titulo) {
  // "10. Título", "812 - Título", "922/638. Título" (mais de um número: o primeiro)
  const m = titulo.match(/^(\d+[a-zA-Z]?)(?:\/\d+)*\s*(?:[.)]|\s[-–])\s*(.*)$/);
  const resto = m ? m[2] : titulo;
  const [nome, ...comp] = resto.split(/\s+[-–]\s+/);
  return { numero: m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : m[1]) : null, nome: nome.trim(), complemento: comp.join(' - ').trim() };
}

main().catch(e => { console.error(e); process.exit(1); });
