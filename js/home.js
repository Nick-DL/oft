/*!
 * home.js — 首页：两个主按钮 + 「更多」对话框（左侧 NavigationRail）
 */
(function () {
  'use strict';

  var OFT = window.OFT || {};
  var $ = (OFT.util && OFT.util.$) || function (s) { return document.querySelector(s); };
  var $$ = (OFT.util && OFT.util.$$) || function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ------------------------------------------------------------ 进入流程 */
  var goSend = $('#go-send');
  var goReceive = $('#go-receive');
  if (goSend) goSend.addEventListener('click', function () { window.location.href = './send.html'; });
  if (goReceive) goReceive.addEventListener('click', function () { window.location.href = './receive.html'; });

  /* ------------------------------------------------------- 「更多」对话框 */
  var dialog = $('#more-dialog');
  var rail = $('#more-rail');
  var panels = $$('.more-panel');
  var openButton = $('#open-more');
  var closeButton = $('#more-close');

  function showPanel(name) {
    var found = false;
    panels.forEach(function (panel) {
      var active = panel.dataset.panel === name;
      panel.classList.toggle('is-active', active);
      if (active) found = true;
    });
    if (!found && panels.length) {
      panels[0].classList.add('is-active');
      name = panels[0].dataset.panel;
    }
    if (rail && rail.value !== name) rail.value = name;
    var active = panels.filter(function (p) { return p.dataset.panel === name; })[0];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
    var scroller = $('#more-panels');
    if (scroller) scroller.scrollTop = 0;
    return name;
  }

  if (rail) {
    rail.addEventListener('change', function (event) {
      showPanel(event.target.value);
    });
  }

  if (openButton && dialog) {
    openButton.addEventListener('click', function () {
      dialog.open = true;
    });
  }
  if (closeButton && dialog) {
    closeButton.addEventListener('click', function () { dialog.open = false; });
  }

  if (dialog) {
    dialog.addEventListener('opened', function () {
      var active = panels.filter(function (p) { return p.classList.contains('is-active'); })[0] || panels[0];
      if (active && active.focus) active.focus({ preventScroll: true });
    });
  }

  /* 深链接：#more / ?more=intro 之类可以直接打开对应小节 */
  (function deepLink() {
    if (!dialog) return;
    var hash = (window.location.hash || '').replace('#', '');
    var query = new URLSearchParams(window.location.search).get('more');
    var target = query || (hash === 'more' ? 'intro' : hash);
    if (!target) return;
    var exists = panels.some(function (p) { return p.dataset.panel === target; });
    if (!exists && target !== 'intro' && target !== 'more') return;
    showPanel(exists ? target : 'intro');
    window.setTimeout(function () { dialog.open = true; }, 60);
  })();
})();
