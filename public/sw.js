/* 럭키스팟 점주 PWA 서비스워커 (2026-11-23)
 *
 * 목적
 *  - 홈화면 앱으로 열었을 때 **껍데기(아이콘·폰트·CSS)** 를 즉시 그린다.
 *  - 전파가 약한 매장에서도 마지막으로 본 화면을 보여 준다(오프라인 안전).
 *
 * 안전 규칙 (지키지 않으면 매출이 낡은 값으로 보인다)
 *  - `/api/**` 는 절대 캐시하지 않는다 — 매출·발주는 항상 네트워크.
 *  - `/admin/**` 도 캐시하지 않는다(본사 화면).
 *  - 화면(navigation)은 **네트워크 우선**, 실패할 때만 캐시 → 오프라인 안내.
 *  - POST/PUT/PATCH/DELETE 는 건드리지 않는다.
 */

const VERSION = "luckyspot-shop-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

const PRECACHE = [
  "/web-app-manifest-192x192.png",
  "/web-app-manifest-512x512.png",
  "/app-icon-512-maskable.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/assets/") ||
    /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)
  );
}

const OFFLINE_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" /><title>오프라인 · 럭키스팟 점주</title>
<style>body{margin:0;background:#0F1412;color:#fff;font-family:system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px}
.card{max-width:360px;border:1px solid #2C3730;border-radius:20px;padding:24px}
h1{font-size:20px;margin:0 0 8px}b{color:#1DFF26}p{font-size:13px;line-height:1.7;color:#C8D0CA;margin:8px 0 0}
button{margin-top:16px;width:100%;height:48px;border:0;border-radius:14px;background:#1DFF26;color:#0F1412;font-weight:700;font-size:15px}</style>
</head><body><div class="card"><h1>지금은 오프라인입니다</h1>
<p>마지막으로 본 매출 화면을 보여 드릴 수 있지만, <b>새 매출·발주 상태는 연결되면 갱신</b>됩니다.</p>
<button onclick="location.reload()">다시 연결</button></div></body></html>`;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }),
    );
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request)
            .then((response) => {
              if (response && response.ok) {
                const copy = response.clone();
                caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
              }
              return response;
            })
            .catch(() => cached),
      ),
    );
  }
});
