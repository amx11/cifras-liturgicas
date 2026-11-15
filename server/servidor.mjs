// Servidor local: serve o app e oferece YouTube (yt-dlp) e transcrição de letra (faster-whisper).
// Uso: node server/servidor.mjs   →   abra http://localhost:8765
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, extname, normalize } from 'node:path';
import { networkInterfaces, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PORTA = +process.env.PORTA || 8765;
const RAIZ = fileURLToPath(new URL('../app/', import.meta.url));
const TEMP = join(tmpdir(), 'cifras-liturgicas');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const SCRIPT_WHISPER = fileURLToPath(new URL('./transcrever.py', import.meta.url));
await mkdir(TEMP, { recursive: true });

const tem = (cmd, args = ['--version']) => { try { return spawnSync(cmd, args, { stdio: 'ignore' }).status === 0; } catch { return false; } };
const AUDIVERIS = join(process.env.HOME || '', '.local/audiveris/opt/audiveris/bin/Audiveris');
const recursos = () => ({
  audiveris: existsSync(AUDIVERIS),
  ytdlp: tem('yt-dlp') || tem(PY, ['-m', 'yt_dlp', '--version']),
  ffmpeg: tem('ffmpeg', ['-version']),
  whisper: tem(PY, ['-c', 'import faster_whisper']),
});
let cache = recursos();
setInterval(() => { cache = recursos(); }, 60_000);

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.m4a': 'audio/mp4', '.webm': 'audio/webm', '.mp3': 'audio/mpeg', '.opus': 'audio/ogg' };

function rodar(cmd, args, opcoes = {}) {
  return new Promise((ok, falha) => {
    const p = spawn(cmd, args, { ...opcoes, windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', falha);
    p.on('close', c => (c === 0 ? ok(out) : falha(new Error(err.trim().split('\n').at(-1) || `${cmd} saiu com código ${c}`))));
  });
}

const ytdlp = args => (tem('yt-dlp') ? rodar('yt-dlp', args) : rodar(PY, ['-m', 'yt_dlp', ...args]));

async function transcrever(arquivo) {
  const saida = await rodar(PY, [SCRIPT_WHISPER, arquivo], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  return JSON.parse(saida);
}

async function limparAntigos() {
  for (const f of await readdir(TEMP)) {
    const p = join(TEMP, f);
    if (Date.now() - (await stat(p)).mtimeMs > 6 * 3600e3) await unlink(p).catch(() => {});
  }
}

function json(res, codigo, obj) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function api(req, res, url) {
  if (url.pathname === '/api/status') return json(res, 200, { ok: true, ...cache });

  if (url.pathname === '/api/youtube') {
    const id = url.searchParams.get('id') || '';
    if (!/^[\w-]{11}$/.test(id)) return json(res, 400, { erro: 'id do YouTube inválido' });
    if (!cache.ytdlp) return json(res, 501, { erro: 'yt-dlp não instalado' });
    await limparAntigos();
    const existente = (await readdir(TEMP)).find(f => f.startsWith(id + '.') && !f.endsWith('.json') && !f.endsWith('.part'));
    let titulo = '';
    try { titulo = (await ytdlp(['--no-playlist', '--get-title', `https://www.youtube.com/watch?v=${id}`])).trim(); } catch { /* segue sem título */ }
    let arquivo = existente;
    if (!arquivo) {
      // m4a decodifica direto no navegador, sem precisar de ffmpeg
      await ytdlp(['--no-playlist', '-f', 'bestaudio[ext=m4a]/bestaudio', '-o', join(TEMP, `${id}.%(ext)s`), `https://www.youtube.com/watch?v=${id}`]);
      arquivo = (await readdir(TEMP)).find(f => f.startsWith(id + '.') && !f.endsWith('.part') && !f.endsWith('.json'));
    }
    if (!arquivo) return json(res, 500, { erro: 'não foi possível baixar o áudio' });
    let palavras = null;
    if (url.searchParams.get('letra') === '1' && cache.whisper) {
      const cacheLetra = join(TEMP, id + '.letra.json');
      if (existsSync(cacheLetra)) palavras = JSON.parse(await readFile(cacheLetra, 'utf8'));
      else { palavras = (await transcrever(join(TEMP, arquivo))).palavras; await writeFile(cacheLetra, JSON.stringify(palavras)); }
    }
    return json(res, 200, { titulo, audio: '/api/arquivo/' + encodeURIComponent(arquivo), palavras });
  }

  if (url.pathname.startsWith('/api/arquivo/')) {
    const nome = decodeURIComponent(url.pathname.slice(13));
    if (!/^[\w-]{11}\.\w+$/.test(nome)) return json(res, 400, { erro: 'nome inválido' });
    const p = join(TEMP, nome);
    if (!existsSync(p)) return json(res, 404, { erro: 'não encontrado' });
    res.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    return createReadStream(p).pipe(res);
  }

  // Leitura óptica de partitura (Audiveris): recebe imagem/PDF da partitura, devolve o MusicXML
  if (url.pathname === '/api/omr' && req.method === 'POST') {
    if (!cache.audiveris) return json(res, 501, { erro: 'Audiveris não instalado' });
    const partes = [];
    let tamanho = 0;
    for await (const c of req) { tamanho += c.length; if (tamanho > 60e6) return json(res, 413, { erro: 'arquivo grande demais' }); partes.push(c); }
    const ext = (url.searchParams.get('ext') || 'pdf').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'pdf';
    const nome = `omr-${Date.now()}`, dir = join(TEMP, nome);
    await mkdir(dir, { recursive: true });
    const arq = join(dir, `${nome}.${ext}`);
    await writeFile(arq, Buffer.concat(partes));
    await rodar(AUDIVERIS, ['-batch', '-export', '-output', dir, '-constant', 'org.audiveris.omr.text.Language.defaultSpecification=por', '--', arq],
      { env: { ...process.env, TESSDATA_PREFIX: join(process.env.HOME || '', '.local/audiveris/tessdata') } }).catch(() => {});
    const mxl = join(dir, `${nome}.mxl`);
    if (!existsSync(mxl)) return json(res, 422, { erro: 'o Audiveris não reconheceu a partitura' });
    res.writeHead(200, { 'Content-Type': 'application/vnd.recordare.musicxml' });
    return createReadStream(mxl).pipe(res);
  }

  // Repertórios propostos da Arquidiocese: atualiza (só os mais recentes e os novos) e devolve o arquivo
  if (url.pathname === '/api/repertorios') {
    const arq = join(RAIZ, 'data', 'repertorios.json');
    const idade = existsSync(arq) ? Date.now() - (await stat(arq)).mtimeMs : Infinity;
    if (idade > 6 * 3600e3) await new Promise(ok => {
      const p = spawn(process.execPath, [fileURLToPath(new URL('../tools/importar-repertorios.mjs', import.meta.url))], { stdio: 'ignore' });
      const t = setTimeout(() => { p.kill(); ok(); }, 60_000);
      p.on('close', () => { clearTimeout(t); ok(); }); p.on('error', () => { clearTimeout(t); ok(); });
    });
    if (!existsSync(arq)) return json(res, 404, { erro: 'sem repertórios' });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
    return createReadStream(arq).pipe(res);
  }

  if (url.pathname === '/api/correcao' && req.method === 'POST') {
    let corpo = '';
    for await (const c of req) { corpo += c; if (corpo.length > 2e6) return json(res, 413, { erro: 'grande demais' }); }
    const { id, chordpro, cabecalho } = JSON.parse(corpo || '{}');
    if (!Number.isInteger(id) || typeof chordpro !== 'string' || !chordpro.trim()) return json(res, 400, { erro: 'dados inválidos' });
    const arq = join(RAIZ, 'data', 'correcoes.json');
    const atuais = existsSync(arq) ? JSON.parse(await readFile(arq, 'utf8')) : {};
    atuais[id] = { chordpro, cabecalho: Array.isArray(cabecalho) ? cabecalho : undefined, data: new Date().toISOString() };
    await writeFile(arq, JSON.stringify(atuais, null, 1));
    return json(res, 200, { ok: true, total: Object.keys(atuais).length });
  }

  if (url.pathname === '/api/transcrever' && req.method === 'POST') {
    if (!cache.whisper) return json(res, 501, { erro: 'faster-whisper não instalado' });
    const partes = [];
    let tamanho = 0;
    for await (const c of req) { tamanho += c.length; if (tamanho > 200e6) return json(res, 413, { erro: 'arquivo grande demais' }); partes.push(c); }
    const p = join(TEMP, `gravacao-${Date.now()}.audio`);
    await writeFile(p, Buffer.concat(partes));
    try { return json(res, 200, await transcrever(p)); } finally { unlink(p).catch(() => {}); }
  }
  return json(res, 404, { erro: 'rota desconhecida' });
}

async function estatico(req, res, url) {
  let caminho = decodeURIComponent(url.pathname);
  if (caminho.endsWith('/')) caminho += 'index.html';
  const p = normalize(join(RAIZ, caminho));
  if (!p.startsWith(normalize(RAIZ))) { res.writeHead(403); return res.end(); }
  try {
    const s = await stat(p);
    if (!s.isFile()) throw new Error();
    res.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream', 'Content-Length': s.size, 'Cache-Control': 'no-cache' });
    createReadStream(p).pipe(res);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Não encontrado'); }
}

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await estatico(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { erro: e.message });
  }
}).listen(PORTA, '0.0.0.0', () => {
  console.log(`Cifras Litúrgicas rodando em http://localhost:${PORTA}`);
  for (const lista of Object.values(networkInterfaces())) for (const i of lista || [])
    if (i.family === 'IPv4' && !i.internal) console.log(`  na rede local: http://${i.address}:${PORTA}`);
  console.log(`  YouTube: ${cache.ytdlp ? 'ok' : 'falta yt-dlp (pip install yt-dlp)'} · Letra: ${cache.whisper ? 'ok' : 'falta faster-whisper (pip install faster-whisper)'} · Partitura (Audiveris): ${cache.audiveris ? 'ok' : 'não instalado'}`);
});
