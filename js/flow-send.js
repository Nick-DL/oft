/*!
 * flow-send.js — 发送流程（三步向导）
 * ---------------------------------------------------------------------------
 *   第 1 步：选文件（或输入文字）
 *   第 2 步：让对端扫码 / 输入网址打开接收页（二维码由核心渲染后镜像过来）
 *   第 3 步：展示数据二维码，等待对端扫描
 *
 * 传输本身完全由 core/send.html（上游产物，逐字节未改）完成；本文件只做引导、
 * 状态镜像与参数传递。
 */
(function () {
  'use strict';

  var OFT = window.OFT || {};
  var U = OFT.util;
  if (!U || !OFT.bridge || !OFT.createStepper) return;

  var $ = U.$;
  var FILE_LIMIT = 64 * 1024 * 1024;
  var SNIPPET_LIMIT = 4 * 1024 * 1024;

  var els = {
    stage: $('#stage'),
    stageQr: $('#stage-qr'),
    stageEmptyTitle: $('#stage-empty-title'),
    stageEmptyText: $('#stage-empty-text'),
    stageStatus: $('#stage-status'),
    stageStatusText: $('#stage-status-text'),
    stageCaption: $('#stage-caption'),
    fullscreen: $('#stage-fullscreen'),
    modeGroup: $('#mode-group'),
    paneFile: $('#pane-file'),
    paneSnippet: $('#pane-snippet'),
    dropZone: $('#drop-zone'),
    fileInput: $('#file-input'),
    pickFile: $('#pick-file'),
    fileCard: $('#file-card'),
    fileName: $('#file-name'),
    fileSize: $('#file-size'),
    clearFile: $('#clear-file'),
    snippet: $('#snippet-input'),
    toStep2: $('#to-step-2'),
    step1Hint: $('#step1-hint'),
    toStep1: $('#to-step-1'),
    toStep3: $('#to-step-3'),
    toStep2b: $('#to-step-2b'),
    reset: $('#reset-flow'),
    receiveUrl: $('#receive-url'),
    copyUrl: $('#copy-url'),
    openUrl: $('#open-url'),
    manualNote: $('#manual-note'),
    manualReason: $('#manual-reason'),
    streamSpecs: $('#stream-specs'),
    spec: {
      fps: $('#spec-fps'),
      frame: $('#spec-frame'),
      qr: $('#spec-qr'),
      payload: $('#spec-payload'),
      compression: $('#spec-compression'),
      k: $('#spec-k')
    },
    settings: {
      fps: $('#cfg-fps'),
      bytes: $('#cfg-bytes'),
      grid: $('#cfg-grid'),
      ecc: $('#cfg-ecc')
    }
  };

  var bridge = OFT.bridge.create({
    frame: $('#core-frame'),
    src: './core/send.html',
    css: OFT.bridge.sendCss,
    readySelector: '#cfg-file'
  });

  var state = {
    mode: 'file',
    file: null,
    text: '',
    manual: false,
    streamStarted: false,
    linkQr: ''
  };

  var receiveUrl = U.receivePageUrl();

  /* ------------------------------------------------------------ 舞台控制 */
  function stageView(view) {
    if (!els.stage) return;
    els.stage.dataset.view = view;
    if (els.stageStatus) els.stageStatus.hidden = view !== 'frame';
  }

  function setStageStatus(text) {
    if (els.stageStatusText && text) els.stageStatusText.textContent = text;
  }

  function setEmpty(title, text) {
    if (els.stageEmptyTitle) els.stageEmptyTitle.textContent = title;
    if (els.stageEmptyText) els.stageEmptyText.textContent = text;
  }

  /* ------------------------------------------------------------ 第 1 步 */
  function fileOk(file) {
    if (!file) return '没有选择文件';
    if (file.size === 0) return '文件是空的';
    if (file.size > FILE_LIMIT) return '文件超过 64 MB 上限';
    return '';
  }

  function renderFileCard() {
    var has = !!state.file;
    if (els.fileCard) els.fileCard.hidden = !has;
    if (els.dropZone) els.dropZone.hidden = has;
    if (has) {
      els.fileName.textContent = state.file.name;
      els.fileSize.textContent = U.formatBytes(state.file.size) + (state.file.type ? ' · ' + state.file.type : '');
    }
  }

  function refreshStep1() {
    var ready = state.mode === 'file' ? !!state.file && !fileOk(state.file) : state.text.trim().length > 0;
    if (els.toStep2) els.toStep2.disabled = !ready || state.manual;
    if (els.step1Hint) {
      if (state.manual) els.step1Hint.textContent = '手动模式：请在右侧核心页面里直接操作';
      else if (ready) els.step1Hint.textContent = state.mode === 'file' ? '文件已就绪，可以继续' : '文字已就绪，可以继续';
      else els.step1Hint.textContent = state.mode === 'file' ? '先选择文件，或切换到「文字」输入内容' : '先在上面的输入框里输入文字';
    }
  }

  function acceptFile(file) {
    var problem = fileOk(file);
    if (problem) {
      U.toast(problem);
      return;
    }
    state.file = file;
    renderFileCard();
    refreshStep1();
    setEmpty('二维码会显示在这里', '下一步：让另一台设备打开接收页');
  }

  if (els.pickFile) {
    els.pickFile.addEventListener('click', function (event) {
      event.stopPropagation();
      if (els.fileInput) els.fileInput.click();
    });
  }
  if (els.dropZone) {
    els.dropZone.addEventListener('click', function () { if (els.fileInput) els.fileInput.click(); });
    ['dragenter', 'dragover'].forEach(function (type) {
      els.dropZone.addEventListener(type, function (event) {
        event.preventDefault();
        els.dropZone.classList.add('is-drag');
      });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (type) {
      els.dropZone.addEventListener(type, function () { els.dropZone.classList.remove('is-drag'); });
    });
    els.dropZone.addEventListener('drop', function (event) {
      event.preventDefault();
      var files = event.dataTransfer && event.dataTransfer.files;
      if (files && files.length) acceptFile(files[0]);
    });
  }
  if (els.fileInput) {
    els.fileInput.addEventListener('change', function () {
      var files = els.fileInput.files;
      if (files && files.length) acceptFile(files[0]);
    });
  }
  if (els.clearFile) {
    els.clearFile.addEventListener('click', function () {
      state.file = null;
      if (els.fileInput) els.fileInput.value = '';
      renderFileCard();
      refreshStep1();
    });
  }
  if (els.modeGroup) {
    els.modeGroup.addEventListener('change', function (event) {
      state.mode = event.target.value === 'snippet' ? 'snippet' : 'file';
      if (els.paneFile) els.paneFile.hidden = state.mode !== 'file';
      if (els.paneSnippet) els.paneSnippet.hidden = state.mode !== 'snippet';
      refreshStep1();
    });
  }
  if (els.snippet) {
    els.snippet.addEventListener('input', function () {
      state.text = els.snippet.value || '';
      refreshStep1();
    });
  }

  /* ------------------------------------------------- 与核心页的交互 */
  function enterManualMode(reason) {
    if (state.manual) return;
    state.manual = true;
    document.body.classList.add('is-manual');
    if (els.manualNote) els.manualNote.hidden = false;
    if (els.manualReason) els.manualReason.textContent = reason;
    if (els.toStep2) els.toStep2.disabled = true;
    if (els.toStep3) els.toStep3.disabled = true;
    stageView('frame');
    setStageStatus('手动模式：请直接在核心页面里操作');
    refreshStep1();
  }

  function coreStatus() {
    var node = bridge.find('#specs');
    if (!node) return '';
    var text = '';
    Array.prototype.forEach.call(node.childNodes, function (child) {
      if (child.nodeType === 3) text += child.textContent;
    });
    var name = bridge.text('#specs .stream-file');
    text = text.trim();
    if (name) text = text ? text + ' · ' + name : name;
    return text;
  }

  /** 把选好的内容交给核心并等第一帧锁定 */
  function prepareStream() {
    if (state.manual) return Promise.resolve(false);
    if (state.streamStarted) return Promise.resolve(true);
    return bridge.load().then(function () {
      if (!bridge.available()) {
        enterManualMode('跨源 / file://');
        return false;
      }
      if (state.mode === 'file') {
        if (!state.file) throw new Error('还没有选择文件');
        var pushed = bridge.setFiles('#cfg-file', [state.file]);
        if (!pushed) throw new Error('无法把文件交给核心页面');
      } else {
        if (!state.text.trim()) throw new Error('还没有输入文字');
        if (state.text.length > SNIPPET_LIMIT) throw new Error('文字超过 4 MB 上限');
        bridge.setValue('#snippet-text', state.text);
        return bridge.wait(80).then(function () {
          if (!bridge.click('#send-snippet')) throw new Error('无法触发核心的发送按钮');
        });
      }
    }).then(function (result) {
      if (result === false) return false;
      return bridge.waitUntil(function () {
        var stage = bridge.find('#stage');
        return stage && !stage.hidden;
      }, 25000, 150).then(function () {
        state.streamStarted = true;
        return true;
      });
    });
  }

  /** 用核心渲染「接收页链接」的二维码，再把它镜像到我们自己的 <img> 上 */
  function buildLinkQr() {
    if (state.linkQr) return Promise.resolve(state.linkQr);
    var input = bridge.find('#share-url');
    if (!input) return Promise.resolve('');
    try { input.value = receiveUrl; } catch (error) { return Promise.resolve(''); }
    var buttons = bridge.findAll('#specs button');
    var share = buttons.filter(function (button) {
      return (button.className || '').indexOf('text-button') >= 0;
    })[0] || buttons[0];
    if (!share) return Promise.resolve('');
    try {
      share.click();
    } catch (error) {
      // 核心可能在绘制完二维码之后才抛错（例如弹窗已被打开），继续尝试读取画布
    }

    var dataUrl = '';
    return bridge.waitUntil(function () {
      var value = bridge.canvasDataUrl('#share-qr');
      if (value && value.length > 400) { dataUrl = value; return true; }
      return false;
    }, 6000, 120).then(function () {
      bridge.click('#share-close');
      state.linkQr = dataUrl;
      return dataUrl;
    }, function () {
      bridge.click('#share-close');
      return '';
    });
  }

  function readStreamSpecs() {
    if (!els.streamSpecs || state.manual) return;
    bridge.waitUntil(function () {
      var node = bridge.find('#stream-specs');
      return node && !node.hidden;
    }, 8000, 200).then(function () {
      var map = {
        fps: '#spec-fps', frame: '#spec-frame', qr: '#spec-qr',
        payload: '#spec-payload', compression: '#spec-compression', k: '#spec-k'
      };
      Object.keys(map).forEach(function (key) {
        var value = bridge.text(map[key]);
        if (els.spec[key] && value) els.spec[key].textContent = value;
      });
      els.streamSpecs.hidden = false;
    }, function () { /* 核心没给出参数时保持占位符 */ });
  }

  function mirrorStatus() {
    if (state.manual) return;
    var text = coreStatus();
    setStageStatus(text || '正在循环发送…');
  }

  bridge.onReady(function () {
    if (!bridge.available()) return;
    mirrorStatus();
    bridge.observe('#specs', function () { mirrorStatus(); });
    readStreamSpecs();
  });

  /* ------------------------------------------------- 传输设置 → 核心 */
  function pushSetting(key, selector) {
    var control = els.settings[key];
    if (!control) return;
    control.addEventListener('change', function () {
      var value = control.value;
      if (value === undefined || value === null || value === '') return;
      var ok = bridge.setValue(selector, String(value));
      if (!ok) U.toast('设置没能传给核心页面');
    });
  }
  pushSetting('fps', '#cfg-fps');
  pushSetting('bytes', '#cfg-bytes');
  pushSetting('grid', '#cfg-grid');
  pushSetting('ecc', '#cfg-ecc');

  /* ------------------------------------------------------------ 步骤机 */
  function contentReady() {
    return state.mode === 'file' ? !!state.file && !fileOk(state.file) : state.text.trim().length > 0;
  }

  function withLoading(button, promise) {
    if (!button) return promise;
    button.setAttribute('loading', '');
    return promise.then(function (value) {
      button.removeAttribute('loading');
      return value;
    }, function (error) {
      button.removeAttribute('loading');
      throw error;
    });
  }

  var flow = OFT.createStepper({
    onEnter: function (step, previous) {
      // 深层链接（#step-2 / #step-3）进来时如果还没选内容，先退回第 1 步
      if ((step === 2 || step === 3) && !state.manual && !contentReady()) {
        U.toast('请先选择要发送的内容');
        return flow.go(1, { force: true }).then(function () { return false; });
      }
      if (step === 2) {
        stageView(state.linkQr ? 'link' : 'empty');
        setEmpty('正在生成接收页二维码…', '马上就绪');
        if (state.manual) return Promise.resolve();
        return withLoading(els.toStep3, prepareStream().then(function (ok) {
          if (!ok) return;
          return buildLinkQr().then(function (dataUrl) {
            if (dataUrl && els.stageQr) {
              els.stageQr.src = dataUrl;
              els.stageQr.hidden = false;
              stageView('link');
              if (els.stageCaption) els.stageCaption.textContent = '让对方用手机相机扫这个二维码，即可打开接收页。';
            } else {
              stageView('empty');
              setEmpty('请手动输入网址', receiveUrl.replace(/^https?:\/\//, ''));
              if (els.stageCaption) els.stageCaption.textContent = '核心没能生成二维码，请在另一台设备上手动输入上面的地址。';
            }
          });
        })).catch(function (error) {
          U.toast('准备数据流失败：' + (error && error.message ? error.message : error));
          stageView('empty');
        });
      }
      if (step === 3) {
        stageView('frame');
        setEmpty('准备中…', '');
        if (state.manual) return Promise.resolve();
        return withLoading(els.toStep3, prepareStream()).then(function () {
          bridge.dispatchResize();
          window.setTimeout(function () { bridge.dispatchResize(); }, 260);
          window.setTimeout(function () { bridge.dispatchResize(); }, 900);
          mirrorStatus();
          readStreamSpecs();
          if (els.stageCaption) {
            els.stageCaption.textContent = '接收端正在读取这块屏幕上的二维码，请保持屏幕常亮、亮度最高。';
          }
          if (window.matchMedia('(max-width: 840px)').matches && els.stage && els.stage.scrollIntoView) {
            els.stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, function (error) {
          U.toast('启动传输失败：' + (error && error.message ? error.message : error));
        });
      }
      if (step === 1 && previous === 3) {
        stageView('empty');
        setEmpty('二维码会显示在这里', '继续下一步即可重新开始');
      }
      return Promise.resolve();
    }
  });

  /* ------------------------------------------------------------ 按钮 */
  if (els.toStep2) els.toStep2.addEventListener('click', function () { flow.go(2); });
  if (els.toStep1) els.toStep1.addEventListener('click', function () { flow.go(1); });
  if (els.toStep3) els.toStep3.addEventListener('click', function () { flow.go(3); });
  if (els.toStep2b) els.toStep2b.addEventListener('click', function () { flow.go(2); });
  if (els.reset) {
    els.reset.addEventListener('click', function () {
      state.streamStarted = false;
      state.linkQr = '';
      if (els.stageQr) { els.stageQr.hidden = true; els.stageQr.removeAttribute('src'); }
      if (els.streamSpecs) els.streamSpecs.hidden = true;
      stageView('empty');
      setEmpty('二维码会显示在这里', '重新选择内容后继续');
      if (!state.manual) bridge.reload().catch(function () { /* 忽略 */ });
      flow.go(1);
    });
  }

  /* 全屏展示二维码：直接对舞台容器请求全屏，核心会跟着自己的视口重新排版 */
  if (els.fullscreen && els.stage) {
    els.fullscreen.addEventListener('click', function () {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(function () { /* 忽略 */ });
        return;
      }
      var request = els.stage.requestFullscreen || els.stage.webkitRequestFullscreen;
      if (!request) { U.toast('当前浏览器不支持全屏'); return; }
      try { request.call(els.stage); } catch (error) { U.toast('无法进入全屏'); }
    });
    document.addEventListener('fullscreenchange', function () {
      var active = !!document.fullscreenElement;
      els.fullscreen.setAttribute('icon', active ? 'fullscreen_exit' : 'fullscreen');
      els.fullscreen.setAttribute('aria-label', active ? '退出全屏' : '全屏显示二维码');
      window.setTimeout(function () { bridge.dispatchResize(); }, 320);
    });
  }

  /* 复制 / 打开接收页地址 */
  if (els.receiveUrl) els.receiveUrl.textContent = receiveUrl;
  if (els.openUrl) els.openUrl.setAttribute('href', receiveUrl);
  if (els.copyUrl) {
    els.copyUrl.addEventListener('click', function () {
      U.copyText(receiveUrl).then(function (ok) {
        U.toast(ok ? '接收页地址已复制' : '复制失败，请手动选择地址');
      });
    });
  }
  if (els.stageCaption) els.stageCaption.textContent = '接收页地址：' + receiveUrl;

  /* ------------------------------------------------------------ 启动 */
  renderFileCard();
  refreshStep1();
  stageView('empty');

  bridge.load().then(function () {
    if (!bridge.available()) enterManualMode(window.location.protocol === 'file:' ? 'file://' : '跨源');
  }, function () {
    U.toast('核心页面加载失败，请检查 core/send.html 是否存在');
  });

  flow.go(flow.initialStep, { force: true });
})();
