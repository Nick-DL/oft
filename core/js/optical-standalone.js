/*!
 * optical-standalone.js — 光学传输核心页的独立运行适配层
 * ---------------------------------------------------------------------------
 * 上游的独立构建产物默认面向 decimen.app：分享弹窗里的“接收链接”指向官网，
 * 页面里也没有回到本目录入口的入口。原站点（yunso）是用父页面的 iframe 桥接脚本
 * 补这些事的：注入样式、改写接收链接、把收到的内容接管进快传历史。
 *
 * 脱离站点后，这里只补齐与“独立运行”有关的最小部分，**不触碰任何传输逻辑**，
 * 也不碰核心自带的 12 语言体系（v0.5.3 会自己按浏览器语言选语言、页脚可切换）：
 *   1. 在内容区顶部插入“返回入口”链接；
 *   2. 发送端分享弹窗的“接收链接”默认指向同目录的 receive.html，并补一条跨设备提示；
 *   3. 非安全上下文（局域网 http / file://）下给出摄像头为何不可用的说明。
 *
 * 同时兼容 v0.5.3（自带 i18n，data-i18n 属性）与 v0.3.0（纯英文 DOM）。
 */
(function () {
  'use strict';

  var LABELS = {
    zh: { back: '← 返回光学传输入口', hint: '跨设备使用：在另一台设备打开同一地址下的 receive.html；摄像头接收需要 HTTPS 或 localhost。', insecure: '当前页面不是安全环境，浏览器会拒绝摄像头；请用 https:// 或 http://localhost 打开。' },
    en: { back: '← Back to Optical Transfer', hint: 'Cross-device: open receive.html from the same address on the other device. Camera capture needs HTTPS or localhost.', insecure: 'This page is not a secure context, so the browser will refuse the camera. Open it over https:// or http://localhost.' }
  };

  var strings = LABELS.en;

  function readLang() {
    var lang = (document.documentElement.getAttribute('lang') || navigator.language || 'en');
    return /^zh/i.test(lang) ? 'zh' : 'en';
  }

  function applyLang() {
    strings = LABELS[readLang()];
    var link = document.getElementById('optical-standalone-back');
    if (link) link.textContent = strings.back;
    var hint = document.getElementById('optical-standalone-hint');
    if (hint) hint.textContent = strings.hint;
    var insecure = document.getElementById('optical-standalone-insecure');
    if (insecure) insecure.textContent = strings.insecure;
  }

  function injectStyles() {
    if (document.getElementById('optical-standalone-style')) return;
    var style = document.createElement('style');
    style.id = 'optical-standalone-style';
    style.textContent = [
      '.optical-standalone-back-wrap{margin:0 0 10px;font:500 12.5px/1.2 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}',
      '.optical-standalone-back{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;',
      'color:var(--text,#e9edf7);background:rgba(255,255,255,.06);border:1px solid var(--line,rgba(255,255,255,.16));',
      'text-decoration:none;transition:background .16s ease}',
      '.optical-standalone-back:hover{background:rgba(255,255,255,.14)}',
      '.optical-standalone-note{margin:6px 0 0;font-size:12px;line-height:1.5;opacity:.75}'
    ].join('');
    document.head.appendChild(style);
  }

  function injectBackLink() {
    var main = document.querySelector('main');
    if (!main || document.getElementById('optical-standalone-back')) return;
    var wrap = document.createElement('p');
    wrap.className = 'optical-standalone-back-wrap';
    var link = document.createElement('a');
    link.id = 'optical-standalone-back';
    link.className = 'optical-standalone-back';
    link.href = './index.html';
    link.textContent = strings.back;
    wrap.appendChild(link);
    main.insertBefore(wrap, main.firstChild);
  }

  function patchShareUrl() {
    var input = document.getElementById('share-url');
    if (!input) return;
    try {
      input.value = new URL('receive.html', window.location.href).href;
    } catch (error) {
      return;
    }
    var row = input.parentElement;
    if (!row || document.getElementById('optical-standalone-hint')) return;
    var hint = document.createElement('p');
    hint.id = 'optical-standalone-hint';
    hint.className = 'hint optical-standalone-note';
    hint.textContent = strings.hint;
    row.insertAdjacentElement('afterend', hint);
  }

  function isLocalHost() {
    var host = (window.location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || /\.localhost$/.test(host);
  }

  function warnOnInsecureCamera() {
    if (!document.getElementById('start')) return;                     // 只在接收端提示
    if (window.location.protocol === 'file:') return;
    // 浏览器只在 http 的非本机地址上会拒绝摄像头；isSecureContext 未实现时不做提示，避免误报。
    if (window.isSecureContext !== false || isLocalHost()) return;
    if (document.getElementById('optical-standalone-insecure')) return;
    var start = document.getElementById('start');
    var note = document.createElement('p');
    note.id = 'optical-standalone-insecure';
    note.className = 'hint optical-standalone-note';
    note.textContent = strings.insecure;
    start.insertAdjacentElement('afterend', note);
  }

  function start() {
    strings = LABELS[readLang()];
    injectStyles();
    injectBackLink();
    patchShareUrl();
    warnOnInsecureCamera();
    // 核心的 i18n 是异步加载的：语言确定后会改写 <html lang>，这里跟着更新文案。
    if (window.MutationObserver) {
      new MutationObserver(applyLang).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }
    window.setTimeout(applyLang, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
