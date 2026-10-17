/*!
 * flow-receive.js — 接收流程（三步向导）
 * ---------------------------------------------------------------------------
 *   第 1 步：说明 + 开始
 *   第 2 步：扫码（摄像头画面、进度、状态都镜像核心）
 *   第 3 步：接收成功（保存文件 / 复制文字 / 再接收一个）
 *
 * 解码与校验全部由 core/receive.html（上游产物，逐字节未改）完成；本文件只做
 * 引导、状态镜像与结果交付。
 */
(function () {
  'use strict';

  var OFT = window.OFT || {};
  var U = OFT.util;
  if (!U || !OFT.bridge || !OFT.createStepper) return;

  var $ = U.$;

  var els = {
    stage: $('#stage'),
    stageEmptyTitle: $('#stage-empty-title'),
    stageEmptyText: $('#stage-empty-text'),
    stageStatus: $('#stage-status'),
    stageStatusText: $('#stage-status-text'),
    stageCaption: $('#stage-caption'),
    progress: $('#stage-progress'),
    progressBar: $('#progress-bar'),
    progressLabel: $('#progress-label'),
    progressEta: $('#progress-eta'),
    fullscreen: $('#stage-fullscreen'),
    startScan: $('#start-scan'),
    retry: $('#retry-camera'),
    backStep1: $('#back-step-1'),
    backToScan: $('#back-to-scan'),
    scanStatus: $('#scan-status'),
    manualNote: $('#manual-note'),
    manualReason: $('#manual-reason'),
    hero: $('#success-hero'),
    resultIcon: $('#result-icon'),
    resultTitle: $('#recv-step3-title'),
    resultDetail: $('#result-detail'),
    resultMeta: $('#result-meta'),
    resultName: $('#result-name'),
    resultSize: $('#result-size'),
    resultChecksum: $('#result-checksum'),
    saveFile: $('#save-file'),
    copyText: $('#copy-text'),
    receiveAgain: $('#receive-again'),
    shareWechat: $('#share-wechat')
  };

  var bridge = OFT.bridge.create({
    frame: $('#core-frame'),
    src: './core/receive.html',
    css: OFT.bridge.receiveCss,
    readySelector: '#start'
  });

  var state = {
    manual: false,
    cameraAsked: false,
    cameraReady: false,
    result: null,
    polling: 0
  };

  /* ------------------------------------------------------------ 舞台 */
  function stageView(view) {
    if (!els.stage) return;
    els.stage.dataset.view = view;
  }
  function scanning(on) {
    if (els.stage) els.stage.dataset.scan = on ? 'on' : 'off';
  }
  function setEmpty(title, text) {
    if (els.stageEmptyTitle) els.stageEmptyTitle.textContent = title;
    if (els.stageEmptyText) els.stageEmptyText.textContent = text;
  }
  function setStatus(text) {
    if (!text) return;
    if (els.stageStatusText) els.stageStatusText.textContent = text;
    if (els.scanStatus) els.scanStatus.textContent = text;
    // 状态药丸跟着「正在做的事」出现：第 1 步保持干净的空舞台
    if (els.stageStatus && flow && flow.current !== 1) els.stageStatus.hidden = false;
  }

  function enterManualMode(reason) {
    if (state.manual) return;
    state.manual = true;
    document.body.classList.add('is-manual');
    if (els.manualNote) els.manualNote.hidden = false;
    if (els.manualReason) els.manualReason.textContent = reason;
    if (els.startScan) els.startScan.disabled = true;
    stageView('frame');
    setStatus('手动模式：请在右侧核心页面里点「启动摄像头」');
  }

  /* ------------------------------------------------- 镜像核心状态 */
  function coreStats() { return bridge.text('#stats'); }

  function progressValue() {
    var bar = bridge.find('#progress');
    if (!bar) return null;
    var raw = bar.getAttribute('aria-valuenow');
    var value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function mirrorProgress() {
    var value = progressValue();
    var label = bridge.text('#progress-label');
    var eta = bridge.text('#eta-label');
    var visible = bridge.find('#progress');
    var shown = visible && visible.style.display !== 'none';
    if (!shown || value === null || value <= 0) {
      if (els.progress && !state.result) els.progress.hidden = true;
      return;
    }
    if (els.progress) els.progress.hidden = false;
    if (els.progressBar) els.progressBar.value = value;
    if (els.progressLabel) els.progressLabel.textContent = label || value + '%';
    if (els.progressEta) els.progressEta.textContent = eta || '';
  }

  function readResult() {
    var node = bridge.find('#result');
    if (!node || !node.children.length) return null;
    var failed = !!node.querySelector('.failed');
    var download = node.querySelector('a.download');
    var buttons = Array.prototype.slice.call(node.querySelectorAll('button'));
    var copy = buttons.filter(function (button) {
      return /复制|拷贝|copy/i.test(button.textContent || '');
    })[0];
    var another = buttons.filter(function (button) {
      return /再接收|接收另一|another/i.test(button.textContent || '');
    })[0];
    var hint = node.querySelector('.hint');
    var done = node.querySelector('.done');
    // 文字流的结果正文放在 p.received-note 里（失败时同一个类名装的是错误说明）
    var note = node.querySelector('.received-note');
    // 图片 / 视频预览：核心会插一个 .received 元素，图片可以走微信长按转发
    var preview = node.querySelector('img.received');
    return {
      failed: failed,
      detail: (hint && hint.textContent ? hint.textContent.trim() : '') || (done ? done.textContent.trim() : ''),
      name: download ? (download.getAttribute('download') || '文件') : (failed ? '' : '文字内容'),
      hasDownload: !!download,
      downloadNode: download,
      copyNode: copy || null,
      anotherNode: another || null,
      imageSrc: !failed && preview ? (preview.currentSrc || preview.src || '') : '',
      text: !failed && note ? (note.value || note.textContent || '') : ''
    };
  }

  /* ------------------------------------------------- 摄像头 / 轮询 */
  function previewLive() {
    var preview = bridge.find('#preview');
    return !!preview && preview.style.display !== 'none' && (!preview.videoWidth || preview.videoWidth > 0);
  }

  function startCamera() {
    if (state.manual) return Promise.resolve(false);
    return bridge.load().then(function () {
      if (!bridge.available()) {
        enterManualMode(window.location.protocol === 'file:' ? 'file://' : '跨源');
        return false;
      }
      // 从第 1 / 3 步回到扫码步骤：核心的摄像头一直在跑，把舞台切回实时画面即可，
      // 不要因为 cameraReady 就直接返回（那样舞台会停在上一步留下的占位状态）。
      if (state.cameraReady && previewLive()) {
        if (els.retry) els.retry.hidden = true;
        scanning(true);
        stageView('frame');
        setStatus(coreStats() || '正在扫描二维码…');
        return true;
      }
      if (state.cameraReady) state.cameraReady = false;
      setStatus('正在等待摄像头授权…');
      // 记下点击前的状态文字，用来区分「核心报错」与「还没开始」
      if (state.initialStats === undefined) state.initialStats = coreStats();
      bridge.click('#start');
      state.cameraAsked = true;
      return bridge.waitUntil(function () {
        if (previewLive()) return 'ok';
        var stats = coreStats();
        var start = bridge.find('#start');
        if (start && !start.disabled && stats && stats !== state.initialStats) return 'error';
        return false;
      }, 30000, 250).then(function (outcome) {
        if (outcome === 'ok') {
          state.cameraReady = true;
          scanning(true);
          stageView('frame');
          setStatus(coreStats() || '正在扫描二维码…');
          return true;
        }
        scanning(false);
        var stats = coreStats();
        setStatus(stats || '摄像头没有启动成功，请检查浏览器权限后重试');
        if (els.retry) els.retry.hidden = false;
        U.toast(stats || '摄像头启动失败，请检查权限或改用 https:// 打开');
        return false;
      }, function () {
        scanning(false);
        var stats = coreStats();
        setStatus(stats && stats !== state.initialStats ? stats : '还在等待摄像头授权：请在浏览器提示里选择「允许」，或点「重新启动摄像头」');
        if (els.retry) els.retry.hidden = false;
        return false;
      });
    });
  }

  function startPolling() {
    stopPolling();
    state.polling = window.setInterval(function () {
      if (!bridge.available()) return;
      mirrorProgress();
      var stats = coreStats();
      if (stats && !state.result) setStatus(stats);
      var result = readResult();
      if (result && !state.result) {
        state.result = result;
        stopPolling();
        deliverResult(result);
      }
    }, 400);
  }

  function stopPolling() {
    if (state.polling) {
      window.clearInterval(state.polling);
      state.polling = 0;
    }
  }

  /* ------------------------------------------------- 第 3 步：交付结果 */
  function deliverResult(result) {
    if (els.progress) els.progress.hidden = true;
    scanning(false);
    stageView('frame');
    flow.go(3, { force: true });

    var panel = flow.panelFor(3);
    if (panel) panel.classList.toggle('is-error', !!result.failed);

    if (result.failed) {
      if (els.resultIcon) els.resultIcon.setAttribute('name', 'error');
      if (els.resultTitle) els.resultTitle.textContent = '接收失败';
      if (els.resultDetail) els.resultDetail.textContent = result.detail || '数据没有通过校验，请让发送端重新发送。';
      if (els.resultMeta) els.resultMeta.hidden = true;
      if (els.saveFile) els.saveFile.hidden = true;
      if (els.copyText) els.copyText.hidden = true;
      hideShareImage();
      if (els.backToScan) els.backToScan.hidden = false;
      if (els.receiveAgain) els.receiveAgain.hidden = false;
      setStatus('传输失败');
      U.toast('接收失败，请重试');
      return;
    }

    if (els.resultIcon) els.resultIcon.setAttribute('name', 'check_circle');
    if (els.resultTitle) els.resultTitle.textContent = result.name === '文字内容' ? '文字接收成功' : '文件接收成功';
    if (els.resultDetail) els.resultDetail.textContent = result.detail || '内容已通过 SHA-256 校验，可以保存了。';
    if (els.resultMeta) els.resultMeta.hidden = false;
    if (els.resultName) els.resultName.textContent = result.name || '—';
    if (els.resultSize) els.resultSize.textContent = result.detail || '—';
    if (els.resultChecksum) els.resultChecksum.textContent = /sha-?256/i.test(result.detail || '') ? '已通过 SHA-256 校验' : '由核心完成校验';

    if (els.saveFile) {
      els.saveFile.hidden = !result.hasDownload;
      els.saveFile.textContent = result.name && result.name !== '文字内容' ? '保存「' + shorten(result.name) + '」' : '保存文件';
    }
    if (els.copyText) els.copyText.hidden = !result.copyNode;
    if (els.backToScan) els.backToScan.hidden = true;

    // 微信里收到图片：给出「分享到微信」——长按大图即可转发（文件类型没有这条路）
    captureShareImage(result);

    setStatus(result.detail || '接收完成');
    U.toast('接收完成' + (result.name && result.name !== '文字内容' ? '：' + shorten(result.name) : ''));
  }

  /* ------------------------------------------------- 微信：分享收到的图片 */
  /* 核心的图片预览用的是 blob: 地址（页面里能看，但微信的长按转发只认 data:/http(s)），
     所以先把字节抓下来存好，点分享时再转成 base64 大图。 */
  var WECHAT_IMAGE_LIMIT = 20 * 1024 * 1024;   // 微信转发图片上限 25 MB，留点余量

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('读取图片失败')); };
      reader.readAsDataURL(blob);
    });
  }

  function hideShareImage() {
    if (els.shareWechat) {
      els.shareWechat.hidden = true;
      els.shareWechat.onclick = null;
      els.shareWechat.removeAttribute('loading');
    }
    state.shareImage = null;
  }

  function captureShareImage(result) {
    hideShareImage();
    var wechat = OFT.wechat;
    if (!els.shareWechat || !wechat || !wechat.isWeChat || !result.imageSrc) return;
    fetch(result.imageSrc).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.blob();
    }).then(function (blob) {
      state.shareImage = { blob: blob, name: result.name };
      els.shareWechat.hidden = false;
      els.shareWechat.onclick = openShareImage;
    }, function () {
      // 抓不到字节就退回原地址（还能看到图，但微信大概率转发不了）
      state.shareImage = { src: result.imageSrc, name: result.name };
      els.shareWechat.hidden = false;
      els.shareWechat.onclick = openShareImage;
    });
  }

  function openShareImage() {
    var data = state.shareImage;
    var wechat = OFT.wechat;
    if (!data || !wechat || !els.shareWechat) return;
    if (!data.blob) {
      wechat.imageUnavailable('这张图片的数据已经不可用，请让发送端重发一次。', els.shareWechat);
      return;
    }
    if (data.blob.size > WECHAT_IMAGE_LIMIT) {
      wechat.imageUnavailable('它大约 ' + U.formatBytes(data.blob.size) + '，超过微信 25 MB 的转发上限。', els.shareWechat);
      return;
    }
    els.shareWechat.setAttribute('loading', '');
    blobToDataUrl(data.blob).then(function (url) {
      els.shareWechat.removeAttribute('loading');
      wechat.imageGuide(url, data.name, els.shareWechat);
    }, function () {
      els.shareWechat.removeAttribute('loading');
      wechat.imageUnavailable('这张图片没法转成微信能识别的格式。', els.shareWechat);
    });
  }

  function shorten(name, max) {
    var limit = max || 18;
    if (!name || name.length <= limit) return name || '';
    var dot = name.lastIndexOf('.');
    var ext = dot > 0 ? name.slice(dot) : '';
    return name.slice(0, limit - ext.length - 1) + '…' + ext;
  }

  /* ------------------------------------------------------------ 步骤机 */
  var flow = OFT.createStepper({
    onEnter: function (step) {
      if (step === 1) {
        if (els.stageStatus) els.stageStatus.hidden = true;
        if (els.progress) els.progress.hidden = true;
        return Promise.resolve();
      }
      if (step === 2) {
        scanning(false);
        stageView('empty');
        setEmpty('正在启动摄像头…', '请在浏览器提示里允许使用摄像头');
        if (els.progress) els.progress.hidden = true;
        return startCamera().then(function (ok) {
          if (ok) startPolling();
          return ok;
        });
      }
      if (step === 3) {
        stopPolling();
        scanning(false);
      }
      return Promise.resolve();
    }
  });

  /* ------------------------------------------------------------ 按钮 */
  if (els.startScan) els.startScan.addEventListener('click', function () { flow.go(2); });
  if (els.retry) {
    els.retry.addEventListener('click', function () {
      state.cameraReady = false;
      els.retry.hidden = true;
      startCamera().then(function (ok) { if (ok) startPolling(); });
    });
  }
  if (els.backStep1) els.backStep1.addEventListener('click', function () { flow.go(1); });

  /** 再收一份：核心页重载回初始状态，再回到扫码步骤重新申请摄像头 */
  function restartReceive() {
    state.result = null;
    state.cameraReady = false;
    state.initialStats = undefined;
    stopPolling();
    scanning(false);
    stageView('empty');
    setEmpty('正在重新准备…', '马上重新打开摄像头');
    if (els.progress) els.progress.hidden = true;
    hideShareImage();
    bridge.reload().then(function () {
      return flow.go(2, { force: true });
    }, function () {
      U.toast('核心页面重载失败，请刷新本页');
    });
  }
  if (els.backToScan) els.backToScan.addEventListener('click', restartReceive);
  if (els.receiveAgain) els.receiveAgain.addEventListener('click', restartReceive);
  if (els.saveFile) {
    els.saveFile.addEventListener('click', function () {
      var node = state.result && state.result.downloadNode;
      if (!node) { U.toast('没有可保存的文件'); return; }
      try {
        node.click();
        U.toast('已开始保存');
      } catch (error) {
        U.toast('保存失败，请在右侧结果区里点击保存按钮');
      }
    });
  }
  if (els.copyText) {
    els.copyText.addEventListener('click', function () {
      var node = state.result && state.result.copyNode;
      if (node) {
        try { node.click(); U.toast('已复制到剪贴板'); return; } catch (error) { /* 落到下面 */ }
      }
      var text = (state.result && state.result.text) || '';
      if (!text) { U.toast('没有可复制的文字'); return; }
      U.copyText(text).then(function (ok) { U.toast(ok ? '已复制到剪贴板' : '复制失败'); });
    });
  }

  /* 全屏取景 */
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
      els.fullscreen.setAttribute('aria-label', active ? '退出全屏' : '全屏取景');
    });
  }

  /* ------------------------------------------------------------ 启动 */
  stageView('empty');
  if (els.stageCaption) {
    els.stageCaption.textContent = '画面只在本机解码；进度到 100% 后会校验 SHA-256 才交付结果。';
  }
  // 状态药丸只在摄像头跑起来之后才出现（空舞台不需要它）
  if (els.stageStatus) els.stageStatus.hidden = true;
  if (els.scanStatus) els.scanStatus.textContent = '点「开始扫描」后浏览器会请求摄像头权限。';

  bridge.load().then(function () {
    if (!bridge.available()) enterManualMode(window.location.protocol === 'file:' ? 'file://' : '跨源');
  }, function () {
    U.toast('核心页面加载失败，请检查 core/receive.html 是否存在');
  });

  flow.go(flow.initialStep, { force: true });

  // 离开页面时停止轮询（摄像头由核心自己管理）
  window.addEventListener('pagehide', stopPolling);
})();
