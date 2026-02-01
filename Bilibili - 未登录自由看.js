// ==UserScript==
// @name         Bilibili - 未登录自由看
// @namespace    https://bilibili.com/
// @version      2.0
// @description  未登录自动无限试用最高画质 + 阻止登录弹窗/自动暂停 + 解锁全部评论（v2.0）
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
    TRIAL_TIMEOUT: 3e8,
    // 评论配置
    COMMENT_AUTO_LOAD: false,      // 默认关闭自动加载全部评论
    COMMENT_MAX_PAGES: 20,         // 最多加载20页
    COMMENT_PAGE_SIZE: 49,         // 每页49条（API最大值）
    COMMENT_LOAD_DELAY: 800        // 加载延迟800ms
  };

  const options = {
    preferQuality: GM_getValue('preferQuality', '1080'),
    isWaitUntilHighQualityLoaded: GM_getValue('isWaitUntilHighQualityLoaded', false),
    enableCommentUnlock: GM_getValue('enableCommentUnlock', true),
    autoLoadAllComments: GM_getValue('autoLoadAllComments', false)
  };

  /* ========== 工具函数 ========== */
  // 等待元素出现
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) return resolve(element);
      
      const observer = new MutationObserver((mutations, obs) => {
        const element = document.querySelector(selector);
        if (element) {
          obs.disconnect();
          resolve(element);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`等待元素超时: ${selector}`));
      }, timeout);
    });
  }

  // 延迟函数
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 获取视频AID
  function getVideoOid() {
    try {
      const initialState = unsafeWindow.__INITIAL_STATE__;
      if (initialState?.aid) return initialState.aid;
      if (initialState?.videoData?.aid) return initialState.videoData.aid;
    } catch (e) {}
    
    const aidElement = document.querySelector('[data-aid]');
    if (aidElement) return aidElement.dataset.aid;
    
    return null;
  }

  /* ========== 评论解锁模块 ========== */
  function initCommentUnlock() {
    if (!options.enableCommentUnlock) return;
    
    console.log('[评论解锁] 初始化评论解锁模块');
    
    // API拦截 - Fetch
    const originalFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = function(...args) {
      const url = args[0];
      
      return originalFetch.apply(this, args).then(async response => {
        if (typeof url === 'string' && url.includes('api.bilibili.com/x/v2/reply')) {
          try {
            const clonedResponse = response.clone();
            const data = await clonedResponse.json();
            
            if (data.data) {
              data.data.show_bvid = true;
              data.data.need_login = false;
              
              if (data.data.upper && data.data.upper.top) {
                data.data.upper.top.need_login = false;
              }
              
              console.log('[评论解锁] Fetch请求已处理');
            }
            
            return new Response(JSON.stringify(data), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          } catch (e) {
            console.error('[评论解锁] Fetch处理失败:', e);
            return response;
          }
        }
        
        return response;
      });
    };
    
    // API拦截 - XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._url = url;
      return originalOpen.call(this, method, url, ...rest);
    };
    
    XMLHttpRequest.prototype.send = function(...args) {
      if (this._url && this._url.includes('api.bilibili.com/x/v2/reply')) {
        const originalOnLoad = this.onload;
        this.addEventListener('load', function() {
          try {
            const data = JSON.parse(this.responseText);
            if (data.data) {
              data.data.need_login = false;
              console.log('[评论解锁] XHR请求已处理');
            }
          } catch (e) {
            console.error('[评论解锁] XHR处理失败:', e);
          }
        });
      }
      return originalSend.apply(this, args);
    };
    
    // DOM清理 - 移除登录提示元素
    function cleanupLoginPrompts() {
      const selectors = [
        '.login-tip',
        '.reply-notice',
        '.login-panel',
        '.bili-comments-login-tip'
      ];
      
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          try {
            el.remove();
            console.log(`[评论解锁] 已移除登录提示: ${selector}`);
          } catch (e) {}
        });
      });
    }
    
    // 使用 MutationObserver 监听DOM变化
    const commentObserver = new MutationObserver(() => {
      cleanupLoginPrompts();
    });
    
    // 等待页面加载完成后启动观察器
    const startCommentObserver = () => {
      if (document.body) {
        commentObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
        cleanupLoginPrompts(); // 立即清理一次
      }
    };
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startCommentObserver);
    } else {
      startCommentObserver();
    }
    
    // 自动加载所有评论（可选）
    if (options.autoLoadAllComments) {
      console.log('[评论解锁] 启用自动加载所有评论');
      
      async function autoLoadComments() {
        try {
          await sleep(3000); // 等待页面加载
          
          const oid = getVideoOid();
          if (!oid) {
            console.warn('[评论解锁] 未找到视频AID，跳过自动加载');
            return;
          }
          
          console.log(`[评论解锁] 开始自动加载评论，视频AID: ${oid}`);
          
          for (let page = 1; page <= CONFIG.COMMENT_MAX_PAGES; page++) {
            try {
              const url = `https://api.bilibili.com/x/v2/reply?type=1&oid=${oid}&pn=${page}&ps=${CONFIG.COMMENT_PAGE_SIZE}`;
              const response = await fetch(url);
              const data = await response.json();
              
              if (data.code === 0 && data.data && data.data.replies && data.data.replies.length > 0) {
                console.log(`[评论解锁] 已加载第 ${page} 页评论，共 ${data.data.replies.length} 条`);
                await sleep(CONFIG.COMMENT_LOAD_DELAY);
              } else {
                console.log(`[评论解锁] 评论加载完成，共 ${page - 1} 页`);
                break;
              }
            } catch (e) {
              console.error(`[评论解锁] 加载第 ${page} 页失败:`, e);
              break;
            }
          }
        } catch (e) {
          console.error('[评论解锁] 自动加载失败:', e);
        }
      }
      
      // 延迟启动自动加载
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoLoadComments);
      } else {
        autoLoadComments();
      }
    }
  }

  /* ========== 初始化评论解锁（无论是否登录都执行） ========== */
  initCommentUnlock();

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
.qp-section-divider{height:1px;background:#e0e0e0;margin:8px 0}
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
      <div class="qp-section-divider"></div>
      <div class="qp-title">💬 评论设置</div>
      <div class="qp-row">
        <span class="qp-label">解锁全部评论</span>
        <span class="switch" data-key="enableCommentUnlock" data-status="${options.enableCommentUnlock ? 'on' : 'off'}"></span>
      </div>
      <div class="qp-row">
        <span class="qp-label">自动加载所有评论</span>
        <span class="switch" data-key="autoLoadAllComments" data-status="${options.autoLoadAllComments ? 'on' : 'off'}"></span>
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
        const key = el.dataset.key;
        
        // 更新对应的选项
        if (key === 'isWaitUntilHighQualityLoaded') {
          options.isWaitUntilHighQualityLoaded = isOn;
        } else if (key === 'enableCommentUnlock') {
          options.enableCommentUnlock = isOn;
        } else if (key === 'autoLoadAllComments') {
          options.autoLoadAllComments = isOn;
        }
        
        GM_setValue(key, isOn);
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
