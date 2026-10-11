/*!
 * sw.js — 光学传输的离线缓存（Service Worker）
 * ---------------------------------------------------------------------------
 * 策略：
 *   · 安装时预缓存整套界面 + 传输核心（发送端 243 KB、接收端 979 KB），
 *     断网或飞行模式下整站仍可打开并完成一次光学传输；
 *   · 取用一律「缓存优先」，保证离线可靠、也不重复下载大文件；
 *   · 更新靠后台刷新：页面每次打开（默认每小时最多一次）会发 RECACHE，
 *     这里用 `cache: 'reload'` 重新拉一遍外壳文件并覆盖缓存，
 *     如果内容指纹变了就回一条「已更新」，页面提示刷新即可看到新版本；
 *   · 不删除核心自己用的 received-media 缓存（接收端媒体回放依赖它）。
 */
'use strict';

var VERSION = 'oft-v1';
var CACHE_PREFIX = 'oft-';

/* 外壳：体积小、更新频繁 —— 每次 RECACHE 都会重新拉取 */
var SHELL = [
  './',
  './index.html',
  './send.html',
  './receive.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/theme.js',
  './js/app.js',
  './js/home.js',
  './js/stepper.js',
  './js/core-bridge.js',
  './js/flow-send.js',
  './js/flow-receive.js',
  './core/index.html',
  './core/js/optical-standalone.js',
  './icons/favicon.svg'
];

/* 重货：传输核心与字体，体积大，只在外壳变化或首次安装时拉取 */
var HEAVY = [
  './vendor/mdui/mdui.css',
  './vendor/mdui/mdui.global.js',
  './vendor/mdui/locales/zh-cn.js',
  './vendor/material-icons/material-icons.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './core/send.html',
  './core/receive.html'
];

var ALL = SHELL.concat(HEAVY);

function cacheAdd(cache, url, options) {
  var request = new Request(url, options);
  return fetch(request).then(function (response) {
    if (!response || !response.ok) throw new Error('HTTP ' + (response && response.status));
    return cache.put(url, response.clone()).then(function () { return response; });
  });
}

function precacheAll() {
  return caches.open(VERSION).then(function (cache) {
    return Promise.all(ALL.map(function (url) {
      return cacheAdd(cache, url, { cache: 'reload' }).catch(function (error) {
        // 单个文件缺失不影响整体安装（在线时仍能取到），但会在控制台留下记录
        console.warn('[oft sw] 预缓存失败：', url, error && error.message);
      });
    }));
  });
}

/** 重新拉取外壳文件；返回内容指纹是否变化 */
function refreshShell() {
  return caches.open(VERSION).then(function (cache) {
    return Promise.all(SHELL.map(function (url) {
      return fetch(new Request(url, { cache: 'reload' })).then(function (response) {
        if (!response || !response.ok) return null;
        return response.text().then(function (body) {
          return { url: url, body: body, type: response.headers.get('content-type') || '' };
        });
      }).catch(function () { return null; });
    })).then(function (entries) {
      var usable = entries.filter(Boolean);
      if (!usable.length) return false;
      var fingerprint = usable.map(function (e) { return e.url + ':' + e.body.length; }).join('|');
      var changed = !!self.__oftShellFingerprint && self.__oftShellFingerprint !== fingerprint;
      self.__oftShellFingerprint = fingerprint;
      return Promise.all(usable.map(function (e) {
        return cache.put(e.url, new Response(e.body, {
          headers: { 'Content-Type': e.type || 'text/html; charset=utf-8' }
        }));
      })).then(function () {
        // 外壳变了说明版本更新了，重货也一起换掉，避免新旧混用
        if (!changed) return false;
        return Promise.all(HEAVY.map(function (url) {
          return cacheAdd(cache, url, { cache: 'reload' }).catch(function () { return null; });
        })).then(function () { return true; });
      });
    });
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(precacheAll());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        // 只清理本应用自己的旧版本缓存，保留核心的 received-media
        if (key !== VERSION && key.indexOf(CACHE_PREFIX) === 0) return caches.delete(key);
        return Promise.resolve(false);
      }));
    }).then(function () {
      if (self.registration.navigationPreload) return self.registration.navigationPreload.disable();
      return undefined;
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'REFRESH') {
    event.waitUntil(refreshShell().then(function (changed) {
      if (!changed || !event.source || !event.source.postMessage) return;
      event.source.postMessage({ type: 'OFT_REFRESHED' });
    }).catch(function () { /* 离线时忽略 */ }));
    return;
  }
  if (data.type === 'RECACHE') {
    event.waitUntil(precacheAll());
  }
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url;
  try { url = new URL(request.url); } catch (error) { return; }
  if (url.origin !== self.location.origin) return;                       // 跨源交给浏览器
  if (url.pathname.indexOf('/received-media/') >= 0) {
    // 核心自己写入的媒体缓存：命中就返回，未命中走网络（核心会回退到 blob URL）
    event.respondWith(caches.match(request, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(request);
    }));
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(VERSION).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        if (request.mode === 'navigate') return caches.match('./index.html');
        return new Response('离线且没有缓存：' + request.url, {
          status: 504,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    })
  );
});
