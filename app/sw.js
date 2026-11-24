// Service worker: guarda o app e o acervo para funcionar sem internet
const VERSAO = 'cl-v95';
const ARQUIVOS = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/ui.js', 'js/dados.js', 'js/cifra.js', 'js/pdf.js',
  'js/missas.js', 'js/importar.js', 'js/ouvir.js', 'js/tocar.js', 'js/painel.js', 'js/exportar.js', 'js/pdf-missa.js', 'js/visualizar-pdf.js', 'js/ocr.js', 'js/ocr-cifra.js', 'js/partitura.js', 'js/partitura-imagem.js', 'js/conferir.js', 'js/musicxml.js', 'vendor/fflate.mjs', 'vendor/jspdf.umd.min.js', 'js/acordes-audio.js', 'js/afinador.js', 'js/afinador-nucleo.js', 'js/sumario.js', 'js/classificar.js', 'js/mscx.js', 'js/folheto.js', 'js/oracoes.js', 'js/instrumentos.js', 'js/apresentacao.js', 'js/capas.js', 'js/nuvem.js', 'js/firebase-config.js', 'vendor/firebase/firebase-app.js', 'vendor/firebase/firebase-auth.js', 'vendor/firebase/firebase-firestore.js', 'vendor/pptxgen.bundle.js', 'vendor/jsQR.js', 'manifest.webmanifest', 'icone.svg',
  'icone-192.png', 'icone-512.png', 'data/musicas.json', 'data/pasta.json', 'data/repertorios.json', 'data/adicionadas.json', 'data/canal.json', 'data/salmodiai.json', 'data/versoes.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => Promise.all(ARQUIVOS.map(a => c.add(a).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO && k !== 'cl-compartilhados').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// PDF do folheto compartilhado de outro app (WhatsApp → Compartilhar → Cifras Litúrgicas): guarda e abre Missas,
// que lê o folheto e liga à missa do fim de semana
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'POST' || !url.pathname.endsWith('/compartilhar-folheto')) return;
  e.respondWith((async () => {
    try {
      const dados = await e.request.formData();
      const cache = await caches.open('cl-compartilhados');
      let n = 0;
      for (const f of dados.getAll('folheto')) if (f && f.size) await cache.put(`compartilhado/${Date.now()}-${n++}`, new Response(f, { headers: { 'Content-Type': f.type || 'application/pdf', 'X-Nome': encodeURIComponent(f.name || 'folheto.pdf') } }));
    } catch { /* segue para o app mesmo assim */ }
    return Response.redirect(new URL('./#/missas', self.registration.scope).href, 303);
  })());
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
