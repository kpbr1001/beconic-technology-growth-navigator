/* 앱 설치(PWA)는 v2.3에서 제거했습니다. 이 파일은 v2.2에서 이미 등록된 서비스 워커를 스스로 해제하는 정리용입니다.
   새로 등록되지 않으며(index.html에서 등록 코드 삭제), 기존 기기가 업데이트를 확인할 때 이 파일을 받아 캐시를 지우고 해제됩니다. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k.startsWith('psf-')).map(k => caches.delete(k)));
    await self.registration.unregister();
    const cs = await self.clients.matchAll({ type: 'window' });
    cs.forEach(c => c.navigate(c.url));   // 캐시가 아닌 최신 화면으로 다시 열기
  })());
});
