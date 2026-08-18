/* 營養追蹤 — Service Worker
   App 本體（HTML/CSS/JS）走 network-first：有網路一定拿到最新版，離線才退回快取。
   圖示、字型這種幾乎不變的走 cache-first，省流量。
   AI 代理與其他 POST 一律走網路，不進快取。

   為什麼不是 cache-first：
   之前用 cache-first + 背景更新，結果是「index.html 已經是新版，
   但 styles.css / app.js 還是舊快取」——版面跑掉、改的東西沒生效，
   而且要使用者點「有新版本」才會換。同一支 App 混著兩個版本的檔案是最難查的狀況，
   所以改成有網路就以伺服器為準。 */

const VER  = 'nutristart-v1.2.0';       // 改這行會清掉舊快取
const CORE = VER + '-core';        // App 本體

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-32.png',
  './fonts/dm-mono-1.woff2',
  './fonts/dm-mono-2.woff2'
];

// 幾乎不變的靜態檔，用 cache-first 就好
const STATIC = /\.(png|ico|svg|webmanifest|woff2)$|manifest\.json$/i;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CORE)
      // 個別 add，任何一支 404 不會整包失敗（例如圖示還沒上傳）
      .then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => {}))))
      // 不等使用者點「更新」，新版裝好就直接接手。
      // 搭配 network-first，使用者打開就是最新版，不會卡在舊版。
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CORE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// 保留舊的手動觸發，前端若還有送這個訊息也不會壞
self.addEventListener('message', e => {
  if(e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;                       // POST（AI 代理、同步）直接放行

  const url = new URL(req.url);
  if(!isSelf) return;                                    // 跨網域一律不管（字型已自架）

  // 圖示 / manifest：cache-first + 背景更新
  if(STATIC.test(url.pathname)){
    e.respondWith(
      caches.open(CORE).then(c => c.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if(res && res.ok) c.put(req, res.clone());
          return res;
        }).catch(() => null);
        if(hit){ e.waitUntil(net); return hit; }
        return net.then(res => res || new Response('離線中', {status: 503}));
      }))
    );
    return;
  }

  // App 本體：network-first。連得上就用伺服器版本並更新快取，連不上才用快取。
  e.respondWith(
    caches.open(CORE).then(c =>
      fetch(req)
        .then(res => {
          if(res && res.ok) c.put(req, res.clone());
          return res;
        })
        .catch(() => c.match(req).then(hit => hit || (
          // 離線又沒快取：導覽請求退回首頁，其餘回 503
          req.mode === 'navigate'
            ? c.match('./index.html').then(h => h || new Response('離線中', {status: 503}))
            : new Response('離線中', {status: 503})
        )))
    )
  );
});
