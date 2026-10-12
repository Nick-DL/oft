/*!
 * wechat-share.js — 微信内置浏览器里的分享引导
 * ---------------------------------------------------------------------------
 * 微信 webview 有两个限制：没有 navigator.share，也用不上微信 JS-SDK（需要后端签名）。
 * 所以这里只做两件事，都是「告诉用户点哪里」：
 *
 *   linkGuide()            分享本页链接：箭头指向右上角「···」→ 发送给朋友 / 朋友圈，
 *                          并附「复制链接」兜底。用在发送页第 2 步（把接收页发给对方）。
 *   imageGuide(src, name)  分享收到的图片：铺一张大图，引导长按 → 发送给朋友 / 保存图片。
 *                          用在接收页收到图片之后（文件类型没有长按转发这条路）。
 *
 * 页面里带 data-wechat-only 的元素只在微信里显示；带 data-wechat-link 的按钮点了开链接引导。
 */
(function () {
  'use strict';

  var OFT = (window.OFT = window.OFT || {});
  var U = OFT.util || {};
  var isWeChat = /MicroMessenger/i.test(navigator.userAgent || '');

  var overlay = null;
  var lastFocus = null;

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function build() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'share-guide';
    overlay.hidden = true;
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) close();
    });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') close();
    });
    return overlay;
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    overlay.innerHTML = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function show(html, trigger, modifier) {
    var node = build();
    lastFocus = trigger || null;
    node.className = modifier ? 'share-guide ' + modifier : 'share-guide';
    node.innerHTML = html;
    node.hidden = false;

    var closer = node.querySelector('[data-share-close]');
    if (closer) closer.addEventListener('click', close);

    var copier = node.querySelector('[data-share-copy]');
    if (copier && U.copyText) {
      copier.addEventListener('click', function () {
        U.copyText(window.location.href).then(function (ok) {
          if (U.toast) U.toast(ok ? '链接已复制，到微信里粘贴发送即可' : '复制失败，请长按地址栏复制');
        });
      });
    }

    var card = node.querySelector('.share-guide-card');
    if (card && card.focus) card.focus({ preventScroll: true });
  }

  /** 分享本页链接：箭头指向右上角「···」 */
  function linkGuide(trigger) {
    show([
      '<span class="share-guide-pointer" aria-hidden="true"><mdui-icon name="north_east"></mdui-icon></span>',
      '<div class="share-guide-card" role="dialog" aria-modal="true" aria-labelledby="share-guide-title" tabindex="-1">',
      '<strong id="share-guide-title">分享到微信</strong>',
      '<p>点击右上角的「···」，选择「发送给朋友」或「分享到朋友圈」，把本页发给对方。</p>',
      '<div class="share-guide-actions">',
      '<mdui-button variant="filled" icon="link" data-share-copy>复制链接</mdui-button>',
      '<mdui-button variant="text" data-share-close>知道了</mdui-button>',
      '</div></div>'
    ].join(''), trigger);
  }

  /** 分享收到的图片：铺一张大图，引导长按转发 / 保存 */
  function imageGuide(src, name, trigger) {
    if (!src) {
      if (U.toast) U.toast('还没有可分享的图片');
      return;
    }
    show([
      '<div class="share-guide-card share-guide-image-card" role="dialog" aria-modal="true" aria-labelledby="share-guide-title" tabindex="-1">',
      '<span class="share-guide-image-wrap">',
      '<img class="share-guide-image" src="' + escapeHtml(src) + '" alt="' + escapeHtml(name || '接收到的图片') + '">',
      '<span class="share-guide-touch" aria-hidden="true"><mdui-icon name="touch_app"></mdui-icon></span>',
      '</span>',
      '<strong id="share-guide-title">长按图片转发</strong>',
      '<p>长按上面的图片，选「发送给朋友」就能转发；想存到相册就选「保存图片」。</p>',
      '<div class="share-guide-actions"><mdui-button variant="text" data-share-close>知道了</mdui-button></div>',
      '</div>'
    ].join(''), trigger, 'share-guide--image');
  }

  /**
   * 这张图没法走微信的长按转发：超过微信 25 MB 的转发上限，
   * 或者拿不到可分享的图片数据。给出替代做法。
   */
  function imageUnavailable(reason, trigger) {
    show([
      '<div class="share-guide-card" role="dialog" aria-modal="true" aria-labelledby="share-guide-title" tabindex="-1">',
      '<strong id="share-guide-title">这张图不能用微信转发</strong>',
      '<p>' + escapeHtml(reason || '微信只认普通图片地址，这里拿不到可分享的数据。') + '</p>',
      '<p>先点底部的「保存文件」把图片存到手机，再从微信聊天窗口里发送即可。</p>',
      '<div class="share-guide-actions"><mdui-button variant="text" data-share-close>知道了</mdui-button></div>',
      '</div>'
    ].join(''), trigger);
  }

  /** 显示页面里标记了 data-wechat-only 的元素，并接上 data-wechat-link 按钮 */
  function activate(root) {
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-wechat-only]'), function (node) {
      node.hidden = false;
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-wechat-link]'), function (button) {
      if (button.dataset.wechatWired === '1') return;
      button.dataset.wechatWired = '1';
      button.addEventListener('click', function () { linkGuide(button); });
    });
  }

  OFT.wechat = {
    isWeChat: isWeChat,
    linkGuide: linkGuide,
    imageGuide: imageGuide,
    imageUnavailable: imageUnavailable,
    activate: activate,
    close: close
  };

  if (isWeChat) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { activate(); }, { once: true });
    else activate();
  }
})();
