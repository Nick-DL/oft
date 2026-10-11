/*!
 * app.js — 页面外壳：主题按钮、PWA（安装 / 更新 / 缓存）、环境检测、通用工具
 * ---------------------------------------------------------------------------
 * 依赖：vendor/mdui/mdui.global.js（全局 mdui）与 js/theme.js（已设好配色与主题）。
 * 所有页面都加载本文件；页面专属逻辑在 home.js / flow-send.js / flow-receive.js。
 */
(function () {
  'use strict';

  var OFT = (window.OFT = window.OFT || {});

  /* ------------------------------------------------------------ 通用工具 */
  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function toast(message, options) {
    var settings = Object.assign({ message: message, placement: 'bottom', autoCloseDelay: 3200 }, options || {});
    try {
      if (window.mdui && window.mdui.snackbar) return window.mdui.snackbar(settings);
    } catch (error) { /* 忽略 */ }
    return null;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    var units = ['KB', 'MB', 'GB'];
    var value = bytes / 1024;
    var index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
    return (value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)) + ' ' + units[index];
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch (error) {
      return false;
    }
  }

  /** 权威的「另一台设备该打开哪个地址」：当前页面同目录下的 receive.html */
  function receivePageUrl() {
    try { return new URL('receive.html', window.location.href).href; } catch (error) { return './receive.html'; }
  }

  /** 当前是否处于安全上下文（摄像头能不能用） */
  function cameraContext() {
    var protocol = window.location.protocol;
    if (protocol === 'file:') return { ok: false, reason: 'file' };
    if (window.isSecureContext === false) return { ok: false, reason: 'insecure' };
    if (window.isSecureContext === true) return { ok: true, reason: 'secure' };
    return { ok: true, reason: 'unknown' };
  }

  function environmentText() {
    var protocol = window.location.protocol;
    var camera = cameraContext();
    if (protocol === 'file:') {
      return '当前用 file:// 直接打开：传输逻辑可用，但浏览器会限制摄像头与跨文档脚本，建议改用本地服务器（例如在本目录执行 python -m http.server 8000 后访问 http://localhost:8000/）。';
    }
    if (!camera.ok) {
      return '当前不是安全上下文：浏览器会拒绝摄像头，接收端无法工作。请改用 https:// 或 http://localhost 打开本页。';
    }
    if (window.isSecureContext === undefined) {
      return '无法确认安全上下文（浏览器未提供 isSecureContext），摄像头是否可用取决于当前地址是否为 https:// 或 localhost。';
    }
    return '环境正常：安全上下文已满足，接收端可以直接调用摄像头。';
  }

  OFT.util = {
    $: $, $$: $$, toast: toast, formatBytes: formatBytes, copyText: copyText,
    receivePageUrl: receivePageUrl, cameraContext: cameraContext, environmentText: environmentText
  };

  /* -------------------------------------------------------------- 返回首页 */
  /* 发送页 / 接收页左上角的返回按钮：回到入口页（离开即释放摄像头） */
  $$('#back-home').forEach(function (button) {
    button.addEventListener('click', function () {
      var target = './index.html';
      try {
        // 从首页点进来时优先用历史后退，保留滚动位置；直接打开本页则回首页
        if (window.history.length > 1 && document.referrer &&
          new URL(document.referrer, window.location.href).origin === window.location.origin) {
          window.location.href = target;
          return;
        }
      } catch (error) { /* 忽略 */ }
      window.location.href = target;
    });
  });

  /* -------------------------------------------------------------- 主题按钮 */
  $$('#theme-toggle').forEach(function (button) {
    var icons = { auto: 'brightness_auto', light: 'light_mode', dark: 'dark_mode' };
    function sync() {
      var theme = OFT.theme || 'auto';
      button.setAttribute('icon', icons[theme] || 'brightness_auto');
      button.setAttribute('aria-label', theme === 'auto' ? '外观：跟随系统' : theme === 'light' ? '外观：浅色' : '外观：深色');
    }
    sync();
    button.addEventListener('click', function () {
      var theme = OFT.cycleTheme ? OFT.cycleTheme() : 'auto';
      sync();
      toast(theme === 'auto' ? '外观：跟随系统' : theme === 'light' ? '外观：浅色' : '外观：深色', { autoCloseDelay: 1600 });
    });
    document.addEventListener('oft:theme', sync);
  });

  /* ------------------------------------------------------------ 环境检测 */
  var envNode = $('#help-env');
  if (envNode) envNode.textContent = environmentText();
  var originNode = $('#kv-origin');
  if (originNode) originNode.textContent = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
  var mduiNode = $('#kv-mdui');
  if (mduiNode && window.mdui && window.mdui.version) mduiNode.textContent = 'mdui ' + window.mdui.version + ' · Material Design 3';

  /* ------------------------------------------------------------------ PWA */
  (function pwa() {
    var supported = 'serviceWorker' in navigator && window.location.protocol !== 'file:';
    var stateTitle = $('#pwa-state-title');
    var stateDetail = $('#pwa-state-detail');
    var installButton = $('#pwa-install');
    var updateButton = $('#pwa-update');
    var clearButton = $('#pwa-clear');
    var cacheState = $('#pwa-cache-state');
    var cacheUsage = $('#pwa-cache-usage');
    var networkState = $('#pwa-network');

    var registration = null;
    var deferredPrompt = null;
    var waitingWorker = null;
    var reloading = false;
    var standalone = window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;

    function setState(title, detail) {
      if (stateTitle) stateTitle.textContent = title;
      if (stateDetail) stateDetail.textContent = detail;
    }

    function setInstallEnabled(enabled, label) {
      if (!installButton) return;
      installButton.disabled = !enabled;
      if (label) installButton.textContent = label;
    }

    function refreshNetwork() {
      if (!networkState) return;
      var online = navigator.onLine;
      networkState.textContent = online ? '在线（离线缓存仍可用）' : '离线（正在使用本机缓存）';
    }

    function refreshUsage() {
      if (!cacheUsage || !navigator.storage || !navigator.storage.estimate) return;
      navigator.storage.estimate().then(function (estimate) {
        cacheUsage.textContent = formatBytes(estimate.usage || 0) + ' / 配额 ' + formatBytes(estimate.quota || 0);
      }, function () { cacheUsage.textContent = '不可用'; });
    }

    function refreshCacheState() {
      if (!cacheState) return;
      if (!supported) { cacheState.textContent = '不可用（需要 https:// 或 localhost）'; return; }
      if (!navigator.serviceWorker.controller) { cacheState.textContent = '尚未就绪（刷新一次即可）'; return; }
      if (waitingWorker) { cacheState.textContent = '已有新版本等待启用'; return; }
      cacheState.textContent = '已就绪：断网也能打开';
    }

    function markUpdateReady(worker) {
      waitingWorker = worker;
      setState('有新版本可用', '离线缓存已更新，重启页面即可生效');
      if (updateButton) { updateButton.textContent = '立即更新'; updateButton.setAttribute('icon', 'system_update'); }
      refreshCacheState();
      toast('发现新版本，可在「更多 → 离线」里更新', { action: '立即更新', onActionClick: applyUpdate });
    }

    function applyUpdate() {
      if (!waitingWorker) { window.location.reload(); return; }
      reloading = true;
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }

    if (!supported) {
      setState('当前环境不支持离线安装', 'Service Worker 需要 https:// 或 http://localhost');
      setInstallEnabled(false);
      if (updateButton) updateButton.disabled = true;
      if (clearButton) clearButton.disabled = true;
      if (cacheState) cacheState.textContent = '不可用';
      if (cacheUsage) cacheUsage.textContent = '不可用';
    } else {
      if (standalone) setState('已作为应用运行', '离线缓存随应用一起工作');
      else setState('可安装为应用', '安装后无需网络即可打开本页与传输核心');

      /* 后台刷新：每小时最多一次，向 Service Worker 要一次外壳更新 */
      var REFRESH_KEY = 'oft:last-refresh';
      function backgroundRefresh(reg) {
        var now = Date.now();
        var last = 0;
        try { last = Number(window.localStorage.getItem(REFRESH_KEY) || 0); } catch (error) { last = 0; }
        if (now - last < 60 * 60 * 1000) return;
        if (!navigator.onLine || !navigator.serviceWorker.controller) return;
        try { window.localStorage.setItem(REFRESH_KEY, String(now)); } catch (error) { /* 忽略 */ }
        navigator.serviceWorker.controller.postMessage({ type: 'REFRESH' });
      }

      navigator.serviceWorker.addEventListener('message', function (event) {
        var data = event.data || {};
        if (data.type === 'OFT_REFRESHED') {
          setState('已缓存最新版本', '刷新页面即可使用新版本');
          refreshCacheState();
          toast('已下载新版本，刷新即可生效', { action: '刷新', autoCloseDelay: 8000, onActionClick: function () { window.location.reload(); } });
        }
      });

      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function (reg) {
          registration = reg;
          refreshCacheState();
          refreshUsage();
          if (reg.waiting && navigator.serviceWorker.controller) markUpdateReady(reg.waiting);
          reg.addEventListener('updatefound', function () {
            var installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', function () {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) markUpdateReady(installing);
            });
          });
          // 静默检查一次 SW 更新（浏览器也会自己按 24 小时节流），然后请 SW 刷新外壳
          reg.update().catch(function () { /* 离线时忽略 */ });
          backgroundRefresh(reg);
        }, function () {
          setState('离线缓存注册失败', '可以正常使用，但断网后无法打开');
          if (cacheState) cacheState.textContent = '注册失败';
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (reloading) { reloading = false; window.location.reload(); }
      });
    }

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredPrompt = event;
      setState('可以安装到本机', '安装后从桌面/主屏启动，断网可用');
      setInstallEnabled(true, '安装到本机');
    });

    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      standalone = true;
      setState('已安装', '从桌面或主屏图标启动即可离线使用');
      setInstallEnabled(false, '已安装');
      toast('已安装到本机，可离线使用');
    });

    if (installButton) {
      if (standalone) setInstallEnabled(false, '已安装');
      else setInstallEnabled(false, '安装到本机');
      installButton.addEventListener('click', function () {
        if (!deferredPrompt) {
          toast('当前浏览器没有提供自动安装，请用浏览器菜单里的「安装应用 / 添加到主屏幕」');
          return;
        }
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (choice) {
          if (choice && choice.outcome === 'accepted') setState('正在安装…', '安装完成后即可离线使用');
          deferredPrompt = null;
          setInstallEnabled(false, '安装到本机');
        });
      });
    }

    if (updateButton) {
      updateButton.addEventListener('click', function () {
        if (waitingWorker) { applyUpdate(); return; }
        if (!registration) { toast('离线缓存尚未就绪，请稍后重试'); return; }
        updateButton.setAttribute('loading', '');
        setState('正在检查更新…', '向服务器确认是否有新版本');
        registration.update().then(function () {
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'REFRESH' });
          }
          window.setTimeout(function () {
            updateButton.removeAttribute('loading');
            if (registration.waiting || registration.installing) {
              if (registration.waiting) markUpdateReady(registration.waiting);
              else setState('正在下载更新…', '稍后会自动提示');
            } else {
              setState(standalone ? '已是最新版本' : '可安装为应用', '离线缓存已经是最新的');
              toast('已是最新版本');
            }
            refreshCacheState();
          }, 1400);
        }, function () {
          updateButton.removeAttribute('loading');
          setState('检查更新失败', '可能处于离线状态，稍后再试');
        });
      });
    }

    if (clearButton) {
      clearButton.addEventListener('click', function () {
        if (!window.caches) { toast('当前环境不支持缓存管理'); return; }
        clearButton.setAttribute('loading', '');
        window.caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) { return window.caches.delete(key); }));
        }).then(function () {
          if (registration && registration.active) registration.active.postMessage({ type: 'RECACHE' });
          return refreshUsage();
        }).then(function () {
          clearButton.removeAttribute('loading');
          cacheState.textContent = '已清除，正在重新缓存';
          toast('离线缓存已清除，正在重新下载');
          window.setTimeout(function () { window.location.reload(); }, 1200);
        }, function () {
          clearButton.removeAttribute('loading');
          toast('清除失败，请稍后重试');
        });
      });
    }

    window.addEventListener('online', refreshNetwork);
    window.addEventListener('offline', refreshNetwork);
    refreshNetwork();
    refreshCacheState();
  })();
})();
