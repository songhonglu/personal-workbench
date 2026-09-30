/* 工作台 Service Worker v1.9.5 — 运行时缓存，离线可用
   • 只缓存同源 GET（页面/图标/manifest）
   • 云同步(pages.dev)与天气(open-meteo)是跨域请求，不拦截，永远走网络
   • v1.8: HTML/导航走 network-first(免手动 bump 版本)，静态资源走 cache-first
   • v1.9.3: HTML 请求强制 revalidate(cache:'no-cache')，避免 CDN/HTTP 缓存让设备拿到旧页面
   • v1.9.4: 随 v1.9.4 前端自动备份发布
   • v1.9.5 (v1.15.0 配套): 根治"清缓存后仍空白"——
     ① CACHE 升到 wb-v2.1.0，activate 时按前缀匹配清除所有旧版 wb-* 缓存
       （旧固定名 wb-v2.0.0 里冻结着 v1.13 旧页面，是清 localStorage 无效的原因）
     ② HTML network-first：网络可用就永远用网络响应（即使与缓存内容不同），
       只有断网时才回退缓存；顺带把新页面写回缓存替换旧版
     ③ 注册侧降频：去掉 visibilitychange 高频 reg.update()（旧代码每 5s 轮询时
       也会触发新 SW 激活 → controllerchange → location.reload() 循环，
       页面侧已有 _wbReloaded 标志做去重）
*/
const CACHE = 'wb-v2.3.0';
const CACHE_PREFIX = 'wb-';
const CORE = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // 清除当前缓存之外的所有 wb-* 历史缓存（含旧版 wb-v2.0.0 里冻结的旧页面）
      .then(ks => Promise.all(ks.filter(k => k !== CACHE && k.indexOf(CACHE_PREFIX) === 0).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 跨域 API 不拦
  // HTML/导航：network-first。网络成功 → 永远用网络版并替换缓存；仅断网时回退缓存。
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then(res => {
        if (res.ok && res.type === 'basic') {
          const cp = res.clone();
          caches.open(CACHE).then(c => c.put(req, cp));
          // 顺带清掉其它 wb-* 旧缓存（新 SW 可能刚被旧页面注册、activate 尚未生效的场景）
          caches.keys().then(ks => {
            Promise.all(ks.filter(k => k !== CACHE && k.indexOf(CACHE_PREFIX) === 0).map(k => caches.delete(k))).catch(() => {});
          });
        }
        return res;
      }).catch(() =>
        // 离线兜底：优先命中本次请求，否则回入口页
        caches.match(req).then(hit => hit || caches.match('./'))
      )
    );
    return;
  }
  // 静态资源：cache-first
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
