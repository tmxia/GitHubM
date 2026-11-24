/*
 * GitHubM 离线缓存 Service Worker
 *
 * 策略（运行时缓存，不做 precache 清单、不引入 PWA 插件）：
 *   - 壳入口 / 导航请求：network-first，在线更新并回写缓存，离线回退缓存。
 *   - 同源静态资源（assets/ 与 js/css/图标/字体）：stale-while-revalidate，
 *     先出缓存再后台刷新，弱网二次打开更快。
 *   - 跨域请求（GitHub API、头像、raw、LLM 端点、本地反代）：一律放行，
 *     避免陈旧数据。
 *   - 非 GET 请求不拦截。
 *
 * 缓存名随版本递增；activate 时清理旧版本缓存。
 */

const CACHE_NAME = 'githubm-shell-v1';

// 安装时预缓存壳入口与基础图标（缺失项静默跳过，不阻塞 SW 激活）。
const PRECACHE = ['./', './index.html', './logo.svg'];

const STATIC_EXT = /\.(?:js|css|svg|png|ico|jpg|jpeg|gif|webp|woff2?|ttf|eot)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  // 仅处理同源；跨域 API / 头像 / LLM / 本地反代不缓存。
  if (url.origin !== self.location.origin) return;
  if (!/^https?:$/.test(url.protocol)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith('/assets/') || STATIC_EXT.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
