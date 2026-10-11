/*!
 * stepper.js — 极简分步流程控制（OOBE 式向导）
 * ---------------------------------------------------------------------------
 * 负责三件事：步骤条状态、步骤面板显隐、进入某一步时触发的回调。
 * 用法：
 *   const flow = OFT.createStepper({ onEnter(step, prev) { ... } });
 *   flow.go(2); flow.next(); flow.prev(); flow.current;
 */
(function () {
  'use strict';

  var OFT = (window.OFT = window.OFT || {});

  OFT.createStepper = function (options) {
    var config = options || {};
    var items = Array.prototype.slice.call(document.querySelectorAll('.stepper li[data-step]'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('.step-panel[data-step]'));
    var steps = items.map(function (item) { return Number(item.dataset.step); });
    var flow = { current: null, steps: steps };
    var busy = false;

    function panelFor(step) {
      return panels.filter(function (panel) { return Number(panel.dataset.step) === Number(step); })[0] || null;
    }

    function syncStepper(step) {
      items.forEach(function (item) {
        var value = Number(item.dataset.step);
        var state = value === Number(step) ? 'active' : value < Number(step) ? 'done' : 'todo';
        item.dataset.state = state;
        item.setAttribute('aria-current', state === 'active' ? 'step' : 'false');
      });
    }

    function syncPanels(step) {
      panels.forEach(function (panel) {
        var active = Number(panel.dataset.step) === Number(step);
        panel.classList.toggle('is-active', active);
        panel.toggleAttribute('inert', !active);
        if (active) panel.removeAttribute('aria-hidden');
        else panel.setAttribute('aria-hidden', 'true');
      });
    }

    /**
     * 进入某一步。
     * onEnter 可以返回 Promise：期间步骤条标记为忙碌，完成前不切换面板。
     */
    function go(step, options2) {
      var target = Number(step);
      var settings = options2 || {};
      if (steps.indexOf(target) < 0) return Promise.resolve(false);
      if (busy && !settings.force) return Promise.resolve(false);

      var previous = flow.current;
      if (previous === target && !settings.force) return Promise.resolve(true);

      function apply() {
        flow.current = target;
        syncStepper(target);
        syncPanels(target);
        if (typeof config.onEnter === 'function') {
          var result = config.onEnter(target, previous, settings);
          if (result && typeof result.then === 'function') {
            busy = true;
            return result.then(function () { busy = false; return true; }, function (error) { busy = false; throw error; });
          }
        }
        return Promise.resolve(true);
      }

      if (typeof config.onLeave === 'function' && previous !== null) {
        var leave = config.onLeave(previous, target);
        if (leave && typeof leave.then === 'function') {
          busy = true;
          return leave.then(function () { busy = false; return apply(); }, function () { busy = false; return apply(); });
        }
      }
      return apply();
    }

    flow.go = go;
    flow.next = function () {
      var index = steps.indexOf(flow.current);
      return go(steps[Math.min(steps.length - 1, index + 1)]);
    };
    flow.prev = function () {
      var index = steps.indexOf(flow.current);
      return go(steps[Math.max(0, index - 1)]);
    };
    flow.panelFor = panelFor;

    // 深层链接：#step-2 直接进入第 2 步（刷新后仍停在这一步）
    flow.initialStep = (function () {
      var match = /step-(\d+)/.exec(window.location.hash || '');
      var value = match ? Number(match[1]) : NaN;
      return steps.indexOf(value) >= 0 ? value : steps[0];
    })();

    if (config.hashSync !== false) {
      window.addEventListener('hashchange', function () {
        var match = /step-(\d+)/.exec(window.location.hash || '');
        if (!match) return;
        var value = Number(match[1]);
        if (steps.indexOf(value) >= 0 && value !== flow.current) go(value);
      });
    }

    return flow;
  };
})();
