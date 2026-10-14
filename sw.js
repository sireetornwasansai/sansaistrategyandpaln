/* Service worker — Plan Sansai (PWA)
   - ไม่แตะคำขอ API (POST / ข้ามโดเมนไป Apps Script) เด็ดขาด เพื่อไม่ให้ข้อมูลหรือสิทธิ์ค้างแคช
   - ไฟล์ของแอป: network-first (ได้เวอร์ชันล่าสุดเสมอเมื่อออนไลน์) สำรองด้วยแคชเมื่อออฟไลน์
   เมื่อออกเวอร์ชันใหม่ ให้เปลี่ยน VERSION เพื่อล้างแคชเก่า */
const VERSION = 'plan-sansai-v2.7.0';
const SHELL = ['./', 'index.html', 'config.js', 'assets/style.css', 'assets/access.css', 'assets/favicon.png', 'assets/logo.png', 'assets/logo-mark.png',
  'js/core.js', 'js/pages.js', 'js/boards.js', 'js/modules.js', 'js/admin.js', 'js/profile.js', 'js/access.js', 'js/pwa.js', 'js/main.js', 'offline.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;     // API / CDN / Google: ปล่อยผ่าน
  if (url.pathname.endsWith('/sw.js')) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') { const c = await caches.open(VERSION); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('index.html')) || (await caches.match('offline.html'));
      return Response.error();
    }
  })());
});
