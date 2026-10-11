/*!
 * core-bridge.js — 同源驱动内嵌的传输核心（core/send.html、core/receive.html）
 * ---------------------------------------------------------------------------
 * 核心页面是上游 Release 产物，本目录保持逐字节一致、不做任何改动，因此引导流程
 * 用「同源 iframe + 注入样式 + 模拟用户操作」的方式驱动它：
 *
 *   · 注入样式：隐藏核心自带的页头 / 页脚 / 表单等外壳，只留下二维码舞台或摄像头画面；
 *   · 模拟操作：把 File 塞进 <input type=file>、点击「启动摄像头」「开始传输」等按钮；
 *   · 读取状态：镜像核心的状态文字、进度与结果节点，用 mdui 组件重新呈现。
 *
 * 这一层只在「同源」时可用（http/https 下的同一站点）。file:// 打开时浏览器把每个
 * 文件当成独立来源，注入会被拒绝——此时页面会退化成「手动模式」提示。
 */
(function () {
  'use strict';

  var OFT = (window.OFT = window.OFT || {});

  function createBridge(options) {
    var frame = options.frame;
    var src = options.src;
    var css = options.css || '';
    var readySelector = options.readySelector || 'body';
    var styleId = 'oft-bridge-style';

    var loaded = false;
    var loadWaiters = [];
    var readyHandlers = [];

    function doc() {
      if (!frame) return null;
      try {
        var d = frame.contentDocument;
        return d && d.documentElement ? d : null;
      } catch (error) {
        return null;
      }
    }

    function win() {
      try { return frame.contentWindow; } catch (error) { return null; }
    }

    function available() { return !!doc(); }

    function find(selector) {
      var d = doc();
      return d ? d.querySelector(selector) : null;
    }

    function findAll(selector) {
      var d = doc();
      return d ? Array.prototype.slice.call(d.querySelectorAll(selector)) : [];
    }

    function injectCss() {
      var d = doc();
      if (!d || !css) return;
      var existing = d.getElementById(styleId);
      if (existing) existing.remove();
      var style = d.createElement('style');
      style.id = styleId;
      style.textContent = css;
      (d.head || d.documentElement).appendChild(style);
    }

    function dispatchResize() {
      var w = win();
      if (!w) return;
      try { w.dispatchEvent(new w.Event('resize')); } catch (error) { /* 忽略 */ }
    }

    function fireReady() {
      injectCss();
      dispatchResize();
      readyHandlers.slice().forEach(function (handler) {
        try { handler(); } catch (error) { /* 忽略 */ }
      });
    }

    frame.addEventListener('load', function () {
      if (!frame.getAttribute('src')) return;
      loaded = true;
      var waiters = loadWaiters;
      loadWaiters = [];
      if (doc()) fireReady();
      waiters.forEach(function (resolve) { resolve(); });
    });

    function whenLoaded() {
      if (loaded) return Promise.resolve();
      return new Promise(function (resolve) { loadWaiters.push(resolve); });
    }

    function ensureReady() {
      var started = Date.now();
      return new Promise(function (resolve, reject) {
        (function tick() {
          if (!frame.isConnected) { reject(new Error('iframe 已从文档中移除')); return; }
          var d = doc();
          if (d && d.readyState !== 'loading' && d.querySelector(readySelector)) { resolve(); return; }
          if (Date.now() - started > 12000) { reject(new Error('核心页面加载超时')); return; }
          window.setTimeout(tick, 100);
        })();
      });
    }

    /** 载入核心页（只导航一次）并等它就绪 */
    function load() {
      if (!frame.getAttribute('src')) frame.setAttribute('src', src);
      return whenLoaded().then(ensureReady).then(function () { loaded = true; });
    }

    /** 重新载入核心页：同源用 location.reload，跨源退化为重设 src */
    function reload() {
      loaded = false;
      injectCss();
      var d = doc();
      if (d) {
        try {
          d.location.reload();
          return whenLoaded().then(ensureReady);
        } catch (error) { /* 落到下面 */ }
      }
      frame.setAttribute('src', 'about:blank');
      return new Promise(function (resolve) {
        window.setTimeout(function () {
          frame.setAttribute('src', src);
          resolve(whenLoaded().then(ensureReady));
        }, 30);
      });
    }

    /** 每次核心页加载/重载完成后回调一次（用于重新挂观察器） */
    function onReady(handler) {
      if (typeof handler !== 'function') return function () {};
      readyHandlers.push(handler);
      return function () {
        var index = readyHandlers.indexOf(handler);
        if (index >= 0) readyHandlers.splice(index, 1);
      };
    }

    function text(selector) {
      var node = find(selector);
      return node ? (node.textContent || '').trim() : '';
    }

    function click(selector) {
      var node = find(selector);
      if (!node) return false;
      try { node.click(); return true; } catch (error) { return false; }
    }

    /** 把 File 塞进核心的 <input type=file> 并派发 change（同源下允许） */
    function setFiles(selector, files) {
      var input = find(selector);
      var w = win();
      if (!input || !w || !w.DataTransfer) return false;
      try {
        var transfer = new w.DataTransfer();
        files.forEach(function (file) { transfer.items.add(file); });
        input.files = transfer.files;
        input.dispatchEvent(new w.Event('change', { bubbles: true }));
        return true;
      } catch (error) {
        return false;
      }
    }

    function setValue(selector, value) {
      var node = find(selector);
      var w = win();
      if (!node || !w) return false;
      try {
        node.value = value;
        node.dispatchEvent(new w.Event('input', { bubbles: true }));
        node.dispatchEvent(new w.Event('change', { bubbles: true }));
        return true;
      } catch (error) {
        return false;
      }
    }

    /** 观察核心页里的某个节点（例如结果容器），返回停止函数 */
    function observe(selector, handler, settings) {
      var d = doc();
      var w = win();
      if (!d || !w || !w.MutationObserver) return function () {};
      var target = d.querySelector(selector);
      if (!target) return function () {};
      var observer = new w.MutationObserver(function (records) { handler(records, target); });
      observer.observe(target, Object.assign({ childList: true, subtree: true, attributes: true }, settings || {}));
      return function () { observer.disconnect(); };
    }

    function canvasDataUrl(selector) {
      var node = find(selector);
      if (!node || typeof node.toDataURL !== 'function') return '';
      try { return node.toDataURL('image/png'); } catch (error) { return ''; }
    }

    function wait(ms) {
      return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
    }

    /** 轮询直到条件成立 */
    function waitUntil(check, timeout, interval) {
      var limit = timeout === undefined ? 8000 : timeout;
      var step = interval || 120;
      var started = Date.now();
      return new Promise(function (resolve, reject) {
        (function tick() {
          var value;
          try { value = check(); } catch (error) { value = false; }
          if (value) { resolve(value); return; }
          if (Date.now() - started > limit) { reject(new Error('等待条件超时')); return; }
          window.setTimeout(tick, step);
        })();
      });
    }

    return {
      frame: frame,
      load: load,
      reload: reload,
      onReady: onReady,
      available: available,
      doc: doc,
      win: win,
      find: find,
      findAll: findAll,
      text: text,
      click: click,
      setFiles: setFiles,
      setValue: setValue,
      observe: observe,
      canvasDataUrl: canvasDataUrl,
      wait: wait,
      waitUntil: waitUntil,
      injectCss: injectCss,
      dispatchResize: dispatchResize
    };
  }

  /* ------------------------------------------------ 注入核心页的两套样式 */
  var SEND_CSS = [
    // 根元素也要撑满，否则 body 的 100% 会退化成内容高度，舞台底部露出底色
    'html{height:100% !important}',
    'html,body{background:transparent !important}',    'body{padding:0 !important;margin:0 !important;display:block !important;gap:0 !important;',
    'min-height:0 !important;height:100% !important;overflow:hidden !important}',
    '.site-header,.site-footer,.tool-intro,.mode-picker,.file-picker,.demo-picker,.note-composer,',
    'details.settings,#specs,#footer-hint,.optical-standalone-back-wrap,.optical-standalone-note{display:none !important}',
    '.send-shell{display:block !important;width:100% !important;height:100% !important;margin:0 !important;padding:0 !important}',
    // 核心在开始传输后才摘掉 #stage 的 hidden；这里让它在整块舞台里居中放大。
    // padding 会被核心的排版函数读进尺寸计算，于是二维码四周自然留出白边。
    '#stage{display:flex !important;align-items:center;justify-content:center;width:100% !important;',
    'height:100% !important;margin:0 !important;padding:14px !important;border-radius:0 !important;',
    'background:#fff !important;cursor:default !important;box-shadow:none !important}',
    '#stage[hidden]{display:none !important}',
    '#qr{max-width:100%;max-height:100%}'
  ].join('');

  var RECEIVE_CSS = [
    'html{height:100% !important}',
    'html,body{background:#000 !important}',
    'body{padding:0 !important;margin:0 !important;display:block !important;gap:0 !important;',
    'min-height:0 !important;height:100% !important;overflow:hidden !important;color:#fff !important}',
    '.site-header,.site-footer,.receiver-heading,#start,details.settings,#diagnostics,',
    '.no-signal-toast,#no-signal-dialog,.optical-standalone-back-wrap,.optical-standalone-note{display:none !important}',
    '.receiver-shell{width:100% !important;max-width:none !important;height:100% !important;margin:0 !important;padding:0 !important}',
    '.receiver-primary{height:100% !important;gap:0 !important;justify-content:center}',
    '#preview{width:100% !important;height:100% !important}',
    // 核心给 .preview 设了 aspect-ratio 与 max-height（为它自己的 HUD 留位置），
    // 这里要一起放掉，画面才能真正铺满取景框
    '.preview{width:100% !important;height:100% !important;max-height:none !important;aspect-ratio:auto !important;',
    'border:0 !important;border-radius:0 !important}',
    '.preview video{width:100% !important;height:100% !important;object-fit:cover !important;border-radius:0 !important}',
    '.transfer-hud{display:none !important}',
    // 核心的「接收完成」结果页：换成和外壳一致的 MD3 观感
    '#result{width:100% !important;height:100% !important;padding:1.25rem !important;gap:.75rem !important;',
    'overflow:auto !important;color:#fff !important;justify-content:center !important}',
    '#result .done{color:#fff !important;font-size:1.125rem !important;font-weight:700 !important;letter-spacing:0 !important}',
    '#result .hint{color:rgba(255,255,255,.72) !important;text-align:center !important;max-width:none !important}',
    '#result .received-note{color:rgba(255,255,255,.92) !important;text-align:start !important;max-width:100% !important;',
    'max-height:34vh !important;overflow:auto !important;white-space:pre-wrap !important;overflow-wrap:anywhere !important;',
    'font-size:.9rem !important;line-height:1.65 !important}',
    '#result .received{max-width:100% !important;max-height:46vh !important;object-fit:contain !important;border-radius:.75rem !important}',
    '#result .download,#result button{display:inline-flex !important;align-items:center !important;justify-content:center !important;',
    'min-height:2.75rem !important;padding:0 1.25rem !important;border:0 !important;border-radius:999px !important;',
    'background:rgb(var(--mdui-color-primary)) !important;color:rgb(var(--mdui-color-on-primary)) !important;',
    'font:500 .95rem/1 system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif !important;',
    'text-decoration:none !important;cursor:pointer !important}',
    '#result button.text-button{background:transparent !important;color:rgb(var(--mdui-color-inverse-primary)) !important;',
    'font-weight:500 !important;letter-spacing:0 !important;text-transform:none !important;font-size:.95rem !important}',
    '#result .note-actions{display:flex !important;flex-wrap:wrap !important;gap:.625rem !important;justify-content:center !important}',
    '#result pre,#result .snippet{max-width:100% !important;max-height:38vh !important;overflow:auto !important;',
    'padding:.875rem 1rem !important;border-radius:.75rem !important;background:rgba(255,255,255,.08) !important;',
    'color:#fff !important;font-size:.85rem !important;line-height:1.6 !important;white-space:pre-wrap !important;word-break:break-word !important}'
  ].join('');

  OFT.bridge = {
    create: createBridge,
    sendCss: SEND_CSS,
    receiveCss: RECEIVE_CSS
  };
})();
