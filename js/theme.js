/*!
 * theme.js — 在 <head> 里同步执行：配色方案与主题
 * ---------------------------------------------------------------------------
 * 放在这里（而不是 app.js）是为了在首帧之前就把松绿色配色和明暗主题定下来，
 * 避免页面先闪一下 mdui 的默认紫色主题。
 *
 * mdui 的颜色令牌是「RGB 三元组」字符串，读取时要用 rgb(var(--mdui-color-*))。
 */
(function () {
  'use strict';

  /** 默认种子色：松绿色（pine green）。改这一个常量即可整体换色。 */
  var SEED = '#01796F';

  var THEME_KEY = 'oft:theme';
  var THEMES = ['auto', 'light', 'dark'];

  function readTheme() {
    try {
      var saved = window.localStorage.getItem(THEME_KEY);
      return THEMES.indexOf(saved) >= 0 ? saved : 'auto';
    } catch (error) {
      return 'auto';
    }
  }

  function applyTheme(theme) {
    try { window.localStorage.setItem(THEME_KEY, theme); } catch (error) { /* 隐私模式忽略 */ }
    if (window.mdui && window.mdui.setTheme) window.mdui.setTheme(theme);
    else {
      var root = document.documentElement;
      root.classList.remove('mdui-theme-light', 'mdui-theme-dark', 'mdui-theme-auto');
      root.classList.add('mdui-theme-' + theme);
    }
    if (window.OFT) window.OFT.theme = theme;
  }

  function cycleTheme() {
    var next = THEMES[(THEMES.indexOf(readTheme()) + 1) % THEMES.length];
    applyTheme(next);
    return next;
  }

  /* 配色：一次调用同时生成亮色与暗色调色板 */
  if (window.mdui && window.mdui.setColorScheme) {
    try { window.mdui.setColorScheme(SEED); } catch (error) { /* 保留 mdui 默认色 */ }
  }
  applyTheme(readTheme());

  window.OFT = window.OFT || {};
  window.OFT.SEED = SEED;
  window.OFT.theme = readTheme();
  window.OFT.applyTheme = applyTheme;
  window.OFT.cycleTheme = cycleTheme;

  /* 中文本地化（只影响组件内部少数文案，例如对话框默认按钮）。
     loadLocale 不返回 Promise，setLocale 才返回；整体失败也不影响页面。 */
  if (window.mdui && window.mdui.loadLocale && window.mdui.setLocale && !/^file:$/.test(window.location.protocol)) {
    try {
      window.mdui.loadLocale(function () {
        // 动态 import 相对本脚本（js/theme.js）解析，所以要从 js/ 往上走一层
        return import('../vendor/mdui/locales/zh-cn.js').then(function (mod) {
          return { templates: mod.templates };
        });
      });
      var applied = window.mdui.setLocale('zh-cn');
      if (applied && typeof applied.catch === 'function') {
        applied.catch(function () { /* 语言包不可用时保持默认英文内部文案 */ });
      }
    } catch (error) { /* 忽略 */ }
  }
})();
