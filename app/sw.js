// Service worker: guarda o app e o acervo para funcionar sem internet
const VERSAO = 'cl-v26';
const ARQUIVOS = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/ui.js', 'js/dados.js', 'js/cifra.js', 'js/pdf.js',
  'js/missas.js', 'js/importar.js', 'js/ouvir.js', 'js/tocar.js', 'js/painel.js', 'js/exportar.js', 'js/pdf-missa.js', 'js/visualizar-pdf.js', 'js/ocr.js', 'js/ocr-cifra.js', 'js/partitura.js', 'js/partitura-imagem.js', 'js/conferir.js', 'js/musicxml.js', 'vendor/fflate.mjs', 'vendor/jspdf.umd.min.js', 'js/acordes-audio.js', 'js/afinador.js', 'js/afinador-nucleo.js', 'manifest.webmanifest', 'icone.svg',
  'icone-192.png', 'icone-512.png', 'data/musicas.json', 'data/pasta.json', 'data/repertorios.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => Promise.all(ARQUIVOS.map(a => c.add(a).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rede primeiro (para pegar atualizações), cache quando estiver offline
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
