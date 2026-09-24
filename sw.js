/* 工作台 Service Worker v1.5.0 — 运行时缓存，离线可用
   • 只缓存同源 GET（页面/图标/manifest）
   • 云同步(pages.dev)与天气(open-meteo)是跨域请求，不拦截，永远走网络
   • 版本号升级 = 缓存自动淘汰 */
const CACHE = 'wb-v1.7.0';
const CORE = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 跨域 API 不拦
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(req, cp));
      }
      return res;
    }).catch(() => caches.match('./')))   // 离线兜底回入口
  );
});

/* v1.5: 页面注册成功后把当前页面 URL 发给 SW 预热，避免首次离线访问白屏 */
self.addEventListener('message', e => {
  const u = e.data && e.data.precache;
  if (!u) return;
  e.waitUntil(caches.open(CACHE).then(c => c.add(new URL(u, self.location.origin).href)).catch(() => {}));
});
