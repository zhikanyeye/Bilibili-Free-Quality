// ==UserScript==
// @name         Bilibili - 未登录自由看
// @namespace    https://bilibili.com/
// @version      1.1-optimized
// @description  未登录自动无限试用最高画质 + 阻止登录弹窗/自动暂停（性能优化版）
// @license      GPL-3.0
// @author       zhikanyeye
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/list/*
// @match        https://www.bilibili.com/festival/*
// @icon         https://www.bilibili.com/favicon.ico
// @require      https://cdnjs.cloudflare.com/ajax/libs/spark-md5/3.0.2/spark-md5.min.js
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(async function () {
  'use strict';

  /* ========== 0. 公共配置 ========== */
  const CONFIG = {
    QUALITY_CHECK_INTERVAL: 1500,
    PLAYER_CHECK_INTERVAL: 300,
    QUALITY_SWITCH_DELAY: 5000,
    BUTTON_CLICK_DELAY: 800,
    TOAST_CHECK_INTERVAL: 100,
    CLICK_TIMEOUT: 500,
    TRIAL_TIMEOUT: 3e8
  };

  const options = {
    preferQuality: GM_getValue('preferQuality', '1080'),
    isWaitUntilHighQualityLoaded: GM_getValue('isWaitUntilHighQualityLoaded', false)
  };

  /* ========== 1. 如果已登录直接退出 ========== */
  if (document.cookie.includes('DedeUserID')) return;

  /* ========== 2. 阻止登录弹窗 / 自动暂停 ========== */
  (function blockLoginAndAutoPause() {
    /* 2-1 拦截 miniLogin.js 加载 */
    const originAppend = Node.prototype.appendChild;
    Node.prototype.appendChild = function (el) {
      if (el.tagName === 'SCRIPT' && el.src && el.src.includes('miniLogin')) return el;
      return originAppend.call(this, el);
    };

    /* 2-2 等待播放器就绪后屏蔽 getMediaInfo 返回值 */
    const waitPlayer = () => new Promise((resolve, reject) => {
      const maxAttempts = 50; // 最多等待15秒
      let attempts = 0;
      const checkPlayer = setInterval(() => {
        if (unsafeWindow.player && unsafeWindow.player.getMediaInfo) {
          clearInterval(checkPlayer);
          resolve();
        } else if (++attempts >= maxAttempts) {
          clearInterval(checkPlayer);
          reject(new Error('Player initialization timeout'));
        }
      }, CONFIG.PLAYER_CHECK_INTERVAL);
    });

    waitPlayer().then(() => {
      const originGet = unsafeWindow.player.getMediaInfo;
      unsafeWindow.player.getMediaInfo = function () {
        const info = originGet.call(this);
        return { absolutePlayTime: 0, relativePlayTime: info.relativePlayTime, playUrl: info.playUrl };
      };

      /* 2-3 禁止脚本自动暂停 */
      let clicked = false;
      document.addEventListener('click', () => {
        clicked = true;
        setTimeout(() => (clicked = false), CONFIG.CLICK_TIMEOUT);
      }, { passive: true }); // 使用 passive 事件监听器提升性能
      
      const originPause = unsafeWindow.player.pause;
      unsafeWindow.player.pause = function () {
        if (!clicked) return;
        return originPause.apply(this, arguments);
      };
    }).catch(err => {
      console.warn('[Bilibili脚本] 播放器初始化失败:', err);
    });
  })();

  /* ========== 3. 无限试用核心 ========== */
  /* 3-1 放行试用标识 */
  const originDef = Object.defineProperty;
  Object.defineProperty = function (obj, prop, desc) {
    if (prop === 'isViewToday' || prop === 'isVideoAble') {
      desc = { get: () => true, enumerable: false, configurable: true };
    }
    return originDef.call(this, obj, prop, desc);
  };

  /* 3-2 把 30s 试用倒计时延长到 3 亿秒 */
  const originSetTimeout = unsafeWindow.setTimeout;
  unsafeWindow.setTimeout = (fn, delay) => {
    if (delay === 30000) delay = CONFIG.TRIAL_TIMEOUT;
    return originSetTimeout.call(unsafeWindow, fn, delay);
  };

  /* 3-3 自动点击试用按钮 + 画质切换 */
  const QUALITY_MAP = { 1080: 80, 720: 64, 480: 32, 360: 16 };
  
  // 使用 MutationObserver 而不是 setInterval 来监听按钮出现，性能更好
  const observeTrialButton = () => {
    const observer = new MutationObserver((mutations) => {
      const btn = document.querySelector('.bpx-player-toast-confirm-login');
      if (!btn) return;
      
      // 防抖：避免重复点击
      if (btn.dataset.clicked) return;
      btn.dataset.clicked = 'true';
      
      setTimeout(() => {
        btn.click();
        
        /* 可选：暂停→切画质→继续播放 */
        if (options.isWaitUntilHighQualityLoaded && unsafeWindow.player?.mediaElement) {
          const media = unsafeWindow.player.mediaElement();
          const wasPlaying = !media.paused;
          if (wasPlaying) media.pause();

          const checkToast = setInterval(() => {
            const toastTexts = document.querySelectorAll('.bpx-player-toast-text');
            if ([...toastTexts].some(el => el.textContent.endsWith('试用中'))) {
              if (wasPlaying) media.play().catch(err => console.warn('[Bilibili脚本] 播放失败:', err));
              clearInterval(checkToast);
            }
          }, CONFIG.TOAST_CHECK_INTERVAL);
          
          // 超时保护：最多等待10秒
          setTimeout(() => clearInterval(checkToast), 10000);
        }

        /* 画质切换 */
        const target = QUALITY_MAP[options.preferQuality] || 80;
        setTimeout(() => {
          try {
            if (unsafeWindow.player?.getSupportedQualityList?.()?.includes(target)) {
              unsafeWindow.player.requestQuality(target);
            }
          } catch (err) {
            console.warn('[Bilibili脚本] 画质切换失败:', err);
          }
        }, CONFIG.QUALITY_SWITCH_DELAY);
        
        // 重置点击标记
        setTimeout(() => delete btn.dataset.clicked, 2000);
      }, CONFIG.BUTTON_CLICK_DELAY);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };
  
  // 等待 DOM 加载完成后启动观察器
  if (document.body) {
    observeTrialButton();
  } else {
    document.addEventListener('DOMContentLoaded', observeTrialButton);
  }

  /* ========== 4. 设置面板 ========== */
  GM_addStyle(`
#qp-panel{position:fixed;inset:0;z-index:999999;display:none;place-items:center;background:rgba(0,0,0,.6);backdrop-filter:blur(2px)}
.qp-wrapper{width:90%;max-width:420px;padding:20px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:16px;font-size:14px;font-family:sans-serif}
.qp-title{margin:0 0 8px;font-size:22px;font-weight:600;color:#333;border-bottom:2px solid #00aeec;padding-bottom:8px}
.qp-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0}
.qp-label{color:#555;font-weight:500}
select{padding:6px 10px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;transition:border-color .2s}
select:hover{border-color:#00aeec}
.switch{cursor:pointer;display:inline-block;width:44px;height:24px;background:#ccc;border-radius:12px;position:relative;transition:background .3s}
.switch[data-status='on']{background:#00aeec}
.switch:after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;background:#fff;border-radius:50%;transition:left .3s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.switch[data-status='on']:after{left:23px}
.qp-close-btn{padding:10px;background:#00aeec;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;transition:background .2s}
.qp-close-btn:hover{background:#0098d1}
`);

  const panel = document.createElement('div');
  panel.id = 'qp-panel';
  panel.innerHTML = `
    <div class="qp-wrapper">
      <div class="qp-title">🎬 画质设置</div>
      <div class="qp-row">
        <span class="qp-label">偏好分辨率</span>
        <select data-key="preferQuality">
          <option value="1080" ${options.preferQuality === '1080' ? 'selected' : ''}>1080p 高清</option>
          <option value="720" ${options.preferQuality === '720' ? 'selected' : ''}>720p 清晰</option>
          <option value="480" ${options.preferQuality === '480' ? 'selected' : ''}>480p 流畅</option>
          <option value="360" ${options.preferQuality === '360' ? 'selected' : ''}>360p 省流</option>
        </select>
      </div>
      <div class="qp-row">
        <span class="qp-label">切换时暂停播放</span>
        <span class="switch" data-key="isWaitUntilHighQualityLoaded" data-status="${options.isWaitUntilHighQualityLoaded ? 'on' : 'off'}"></span>
      </div>
      <button class="qp-close-btn" onclick="this.parentElement.parentElement.style.display='none'">✓ 保存并关闭</button>
    </div>`;
  
  // 等待 body 加载完成再添加面板
  const addPanel = () => {
    if (document.body) {
      document.body.appendChild(panel);
    } else {
      document.addEventListener('DOMContentLoaded', () => document.body.appendChild(panel));
    }
  };
  addPanel();

  /* 注册 GM 菜单 & 播放器入口 */
  GM_registerMenuCommand('🎬 画质设置', () => (panel.style.display = 'flex'));
  
  // 使用 MutationObserver 而不是 setInterval 来添加设置入口
  let entryAdded = false;
  const addSettingsEntry = () => {
    if (entryAdded) return;
    
    const others = document.querySelector('.bpx-player-ctrl-setting-others-content');
    if (!others) return;
    
    const entry = document.createElement('div');
    entry.textContent = '🎬 脚本设置 >';
    entry.style.cssText = 'cursor:pointer;height:20px;line-height:20px;padding:4px 8px;transition:background .2s';
    entry.onmouseenter = () => entry.style.background = 'rgba(0,174,236,0.1)';
    entry.onmouseleave = () => entry.style.background = '';
    entry.onclick = () => (panel.style.display = 'flex');
    others.appendChild(entry);
    entryAdded = true;
  };
  
  // 监听设置面板的出现
  const settingsObserver = new MutationObserver(() => {
    if (!entryAdded) addSettingsEntry();
  });
  
  const startObserving = () => {
    const settingsPanel = document.querySelector('.bpx-player-ctrl-setting');
    if (settingsPanel) {
      settingsObserver.observe(settingsPanel, { childList: true, subtree: true });
    }
  };
  
  if (document.body) {
    startObserving();
  } else {
    document.addEventListener('DOMContentLoaded', startObserving);
  }

  /* 事件绑定：即时存储 */
  panel.querySelectorAll('[data-key]').forEach(el => {
    if (el.tagName === 'SELECT') {
      el.onchange = e => {
        const value = e.target.value;
        options.preferQuality = value;
        GM_setValue(el.dataset.key, value);
      };
    } else {
      el.onclick = () => {
        const newStatus = el.dataset.status === 'on' ? 'off' : 'on';
        el.dataset.status = newStatus;
        const isOn = newStatus === 'on';
        options.isWaitUntilHighQualityLoaded = isOn;
        GM_setValue(el.dataset.key, isOn);
      };
    }
  });
  
  // 支持 ESC 键关闭面板
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.style.display === 'flex') {
      panel.style.display = 'none';
    }
  });
  
  // 点击背景关闭面板
  panel.addEventListener('click', (e) => {
    if (e.target === panel) {
      panel.style.display = 'none';
    }
  });
})();
