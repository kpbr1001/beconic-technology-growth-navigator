/* BECONIC 적합성 진단 — 앱 설치·오프라인용 서비스 워커.
   화면은 네트워크 우선(새 버전 즉시 반영), 실패하면 캐시. AI 서버 함수(/api/)는 절대 캐시하지 않는다. */
const CACHE = 'psf-' + (new URL(location.href).searchParams.get('v') || 'dev');   // 버전은 index.html APP_VERSION(등록 시 ?v=)
const SHELL = ['./', 'index.html', 'assets/icon-192.png', 'assets/manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/.netlify/')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
