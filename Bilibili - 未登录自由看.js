// ==UserScript==
// @name         Bilibili - 未登录自由看
// @namespace    https://bilibili.com/
// @version      4.0.0-alpha.9
// @description  🎬 B 站未登录解放脚本 | 双兼容解锁：协议级 + 客户端兼容双重保护——协议级模式伪造 DedeUserID cookie + 清空 __playinfo__ SSR + 重签 WBI playurl（try_look=1/qn=80）服务端直接出 1080P；客户端兼容模式自动试用画质 + 拦截画质劫持，fallback 兜底拔高 · 拦 rcmd 清 buvid3 防登录弹窗（DD1969 思路）· 彻底屏蔽自动暂停 · WBI 签名自调评论 API，视频/动态/专栏评论完整解锁 · 直播分区接口兜底 · 可视化面板可切 1080/720/480/360P
// @license      GPL-3.0
// @author       zhikanyeye
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/list/*
// @match        https://www.bilibili.com/festival/*
// @match        https://www.bilibili.com/opus/*
// @match        https://www.bilibili.com/read/cv*
// @match        https://t.bilibili.com/*
// @match        https://space.bilibili.com/*
// @match        https://live.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @require      https://cdnjs.cloudflare.com/ajax/libs/spark-md5/3.0.2/spark-md5.min.js
// @require      https://update.greasyfork.org/scripts/512574/1464548/inject-bilibili-comment-style.js
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(async function () {
  'use strict';

  // 最早保存原生 fetch，避免后续自劫持互相递归
  const nativePageFetch = (unsafeWindow.fetch || fetch).bind(unsafeWindow);

  /* ========== 0. 公共配置 ========== */
  const CONFIG = {
    QUALITY_CHECK_INTERVAL: 1500,
    PLAYER_CHECK_INTERVAL: 300,
    QUALITY_SWITCH_DELAY: 5000,
    BUTTON_CLICK_DELAY: 800,
    TOAST_CHECK_INTERVAL: 100,
    CLICK_TIMEOUT: 800,
    AUTO_RESUME_INTERVAL: 1200,
    TRIAL_TIMEOUT: 3e8,
    // 兜底拔高配置（fallback 内使用）
    RE_UNLOCK_DELAY: 5000,
    RE_UNLOCK_INTERVAL: 3000
  };

  const options = {
    preferQuality: GM_getValue('preferQuality', '1080'),
    isWaitUntilHighQualityLoaded: GM_getValue('isWaitUntilHighQualityLoaded', false),
    enableCommentUnlock: GM_getValue('enableCommentUnlock', true),
    enableReplyPagination: GM_getValue('enableReplyPagination', false),
    enableLiveAreaUnlock: GM_getValue('enableLiveAreaUnlock', true),
    enableProtocolUnlock: GM_getValue('enableProtocolUnlock', true)  // false 时回退旧客户端架构
  };

  const PAGE_RE = {
    video: /^https:\/\/www\.bilibili\.com\/video\//,
    dynamic: /^https:\/\/t\.bilibili\.com\/\d+/,
    opus: /^https:\/\/www\.bilibili\.com\/opus\/\d+/,
    space: /^https:\/\/space\.bilibili\.com\/\d+/,
    article: /^https:\/\/www\.bilibili\.com\/read\/cv\d+/,
    festival: /^https:\/\/www\.bilibili\.com\/festival\//,
    list: /^https:\/\/www\.bilibili\.com\/list\//,
    live: /^https:\/\/live\.bilibili\.com\//
  };

  /* ========== 工具函数 ========== */
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) return resolve(element);

      const root = document.body || document.documentElement;
      if (!root) {
        reject(new Error(`等待元素失败: 无 document root`));
        return;
      }

      const observer = new MutationObserver((_mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });
      observer.observe(root, { childList: true, subtree: true });

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

  function isBilibiliLoggedIn() {
    return document.cookie.includes('DedeUserID__ckMd5=') && /\S/.test(document.cookie.match(/DedeUserID__ckMd5=([^;]+)/)?.[1] || '');
  }

  // 注入伪造 DedeUserID 让服务端按登录态响应。ckMd5 带签名不可伪造，故 isBilibiliLoggedIn 校验它。
  function ensureFakeLoginCookie() {
    if (document.cookie.match(/DedeUserID__ckMd5=([^;]+)/)?.[1]) return;
    const fakeUid = String(Math.floor(Math.random() * 1e10));
    document.cookie = `DedeUserID=${fakeUid}; path=/; domain=.bilibili.com`;
  }

  // 拦 top/feed/rcmd 前清 buvid3，避免 B 站按游客跟踪触发登录弹窗（DD1969 思路）
  let rcmdGuardInstalled = false;
  function installRcmdLoginGuard() {
    if (rcmdGuardInstalled || isBilibiliLoggedIn()) return;
    rcmdGuardInstalled = true;
    const originFetch = unsafeWindow.fetch?.bind(unsafeWindow);
    if (!originFetch) return;
    unsafeWindow.fetch = function(input, init) {
      const rawUrl = typeof input === 'string' ? input : (input?.url ?? '');
      if (rawUrl && rawUrl.includes('top/feed/rcmd')) {
        document.cookie = 'buvid3=;expires=Thu, 01 Jan 1970 00:00:01 GMT;domain=.bilibili.com;path=/';
      }
      return originFetch(input, init);
    };
  }

  // 吞掉 SSR 写入的低质 __playinfo__，只接受 writePlayinfo 写入的高清数据
  let _playinfoCache = null;
  let _playinfoWriteAllow = false;
  let _playinfoKey = ''; // aid_cid，避免 SPA 切视频串流
  function clearPlayinfoSSR() {
    try {
      _playinfoCache = null;
      _playinfoKey = '';
      Object.defineProperty(unsafeWindow, '__playinfo__', {
        get: () => _playinfoCache,
        set: (v) => { if (_playinfoWriteAllow) _playinfoCache = v; },
        configurable: true
      });
      const s = document.createElement('script');
      s.textContent = 'window.playurlSSRData = {}';
      document.documentElement.appendChild(s);
      document.documentElement.removeChild(s);
    } catch (e) {
      try { unsafeWindow.__playinfo__ = null; } catch (e2) {}
    }
  }

  function getPlayurlRequestKey(rawUrl) {
    try {
      const u = new URL(rawUrl, location.href);
      const aid = u.searchParams.get('avid') || u.searchParams.get('aid') || '';
      const cid = u.searchParams.get('cid') || '';
      const bvid = u.searchParams.get('bvid') || '';
      return `${bvid || aid}_${cid}`;
    } catch (e) {
      return '';
    }
  }

  function isPlayurlRequestUrl(rawUrl) {
    if (!rawUrl) return false;
    return rawUrl.includes('/x/player/wbi/playurl')
      || rawUrl.includes('/x/player/playurl')
      || rawUrl.includes('/pgc/player/web/playurl')
      || rawUrl.includes('/pgc/player/web/v2/playurl');
  }

  // 协议级模式下也主动 requestQuality，避免 SPA 切推荐后卡在 360P
  function forcePlayerTargetQuality(reason = 'protocol') {
    try {
      const map = { 1080: 80, 720: 64, 480: 32, 360: 16 };
      const target = map[options.preferQuality] || 80;
      const player = unsafeWindow.player;
      if (!player?.requestQuality) return false;
      const supported = player.getSupportedQualityList?.();
      if (Array.isArray(supported) && supported.length && !supported.includes(target)) {
        const best = Math.max(...supported.filter(q => q <= target), ...supported);
        Promise.resolve(player.requestQuality(best)).catch(() => {});
        return true;
      }
      Promise.resolve(player.requestQuality(target)).catch(() => {});
      return true;
    } catch (e) {
      return false;
    }
  }

  function scheduleForceQuality(times = 6, gap = 800) {
    let n = 0;
    const tick = () => {
      forcePlayerTargetQuality('spa-retry-' + n);
      n += 1;
      if (n < times) setTimeout(tick, gap);
    };
    setTimeout(tick, 300);
  }

  // SPA 切视频时清空旧高清缓存，强制重新走 playurl 拦截并拔高画质
  function installSpaPlayinfoReset() {
    const reset = () => {
      _playinfoCache = null;
      _playinfoKey = '';
      ensureFakeLoginCookie();
      try {
        const s = document.createElement('script');
        s.textContent = 'window.playurlSSRData = {}';
        document.documentElement.appendChild(s);
        document.documentElement.removeChild(s);
      } catch (e) {}
      scheduleForceQuality();
    };
    const wrapHistory = (type) => {
      const origin = history[type];
      if (typeof origin !== 'function' || origin.__bfqPatched) return;
      const wrapped = function (...args) {
        const ret = origin.apply(this, args);
        reset();
        return ret;
      };
      wrapped.__bfqPatched = true;
      history[type] = wrapped;
    };
    try {
      wrapHistory('pushState');
      wrapHistory('replaceState');
      window.addEventListener('popstate', reset);
    } catch (e) {}
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

  /* ========== 评论模块 ========== */
  let commentOid, commentType, commentCreatorID;
  let commentCurrentSortType = 2;
  let commentIsLoading = false;
  let commentIsEnd = false;
  let commentNextOffset = '';
  let commentPageOffsets = [''];
  let commentCurrentPage = 0;
  let commentTotalCount = 0;
  const COMMENT_SORT = { LATEST: 0, HOT: 2 };
  const COMMENT_PAGE_SIZE = 20;

  let _wbiMixinKey = null;
  let _wbiMixinKeyTs = 0;
  async function getWbiMixinKey() {
    if (_wbiMixinKey && Date.now() - _wbiMixinKeyTs < 3600e3) return _wbiMixinKey;
    const { img_url, sub_url } = await nativePageFetch('https://api.bilibili.com/x/web-interface/nav', { credentials: 'include' })
      .then(res => res.json())
      .then(json => json.data.wbi_img);
    const imgKey = img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.'));
    const subKey = sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'));
    const originKey = imgKey + subKey;
    const mixinKeyEncryptTable = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
    _wbiMixinKey = mixinKeyEncryptTable.map(n => originKey[n]).join('').slice(0, 32);
    _wbiMixinKeyTs = Date.now();
    return _wbiMixinKey;
  }

  async function getWbiQueryString(params) {
    const mixinKey = await getWbiMixinKey();
    const p = { ...params };
    delete p.w_rid;
    p.wts = Math.round(Date.now() / 1000);
    const query = Object.keys(p).sort().map(key => {
      const value = p[key].toString().replace(/[!'()*]/g, '');
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }).join('&');
    const wbiSign = SparkMD5.hash(query + mixinKey);
    return query + '&w_rid=' + wbiSign;
  }

  function b2a(bvid) {
    const XOR_CODE = 23442827791579n;
    const MASK_CODE = 2251799813685247n;
    const BASE = 58n;
    const ALPHABET = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf'.split('');
    const DIGIT_MAP = [0,1,2,9,7,5,6,4,8,3,10,11];
    const BV_LEN = 12;
    let r = 0n;
    for (let i = 3; i < BV_LEN; i++) {
      r = r * BASE + BigInt(ALPHABET.indexOf(bvid[DIGIT_MAP[i]]));
    }
    return `${r & MASK_CODE ^ XOR_CODE}`;
  }

  function isVideoCommentPage() {
    return PAGE_RE.video.test(location.href) || PAGE_RE.list.test(location.href) || PAGE_RE.festival.test(location.href);
  }

  function isCommentDetailPage() {
    return isVideoCommentPage() || PAGE_RE.dynamic.test(location.href) || PAGE_RE.opus.test(location.href) || PAGE_RE.article.test(location.href);
  }

  // 需要自绘评论的页面：动态/专栏等官方组件在未登录下常挂；视频页走协议级，不自绘
  function needsCustomCommentRender() {
    return PAGE_RE.dynamic.test(location.href) || PAGE_RE.opus.test(location.href) || PAGE_RE.article.test(location.href);
  }

  // 协议级评论解锁：拦截 reply 请求并 credentials:omit（对齐 beefreely），不替换 DOM
  let replyUnlockInstalled = false;
  function installReplyProtocolUnlock() {
    if (!options.enableCommentUnlock || replyUnlockInstalled || isBilibiliLoggedIn()) return;
    replyUnlockInstalled = true;

    const isReplyUrl = (u) => u && (
      u.includes('/x/v2/reply/wbi/main') ||
      u.includes('/x/v2/reply/reply') ||
      u.includes('/x/v2/reply/wbi/reply')
    );

    const originFetch = unsafeWindow.fetch?.bind(unsafeWindow);
    if (originFetch) {
      unsafeWindow.fetch = function(input, init) {
        const rawUrl = typeof input === 'string' ? input : (input?.url ?? '');
        if (!isReplyUrl(rawUrl)) return originFetch(input, init);
        const nextInit = { ...(init || {}), credentials: 'omit' };
        if (input instanceof Request) {
          try {
            return originFetch(new Request(rawUrl, { ...input, credentials: 'omit' }), nextInit);
          } catch (e) {
            return originFetch(rawUrl, nextInit);
          }
        }
        return originFetch(rawUrl, nextInit);
      };
    }

    const XHR = unsafeWindow.XMLHttpRequest;
    if (!XHR || XHR.prototype.__bfqReplyPatched) return;
    XHR.prototype.__bfqReplyPatched = true;
    const originOpen = XHR.prototype.open;
    const originSend = XHR.prototype.send;
    XHR.prototype.open = function(method, url, ...rest) {
      this.__bfqReplyUrl = typeof url === 'string' ? url : (url?.url ?? '');
      return originOpen.call(this, method, url, ...rest);
    };
    XHR.prototype.send = function(...args) {
      if (isReplyUrl(this.__bfqReplyUrl)) {
        try { this.withCredentials = false; } catch (e) {}
      }
      return originSend.apply(this, args);
    };
  }

  function getDynamicIdFromLocation() {
    const match = location.pathname.match(/(?:\/opus\/|^\/)(\d+)/);
    return match ? match[1] : '';
  }

  function getArticleIdFromLocation() {
    const match = location.pathname.match(/\/read\/cv(\d+)/i);
    return match ? match[1] : '';
  }

  async function getDynamicCommentTarget(dynamicId) {
    if (!dynamicId) return null;
    const res = await fetch(`https://api.bilibili.com/x/polymer/web-dynamic/v1/detail?id=${dynamicId}`, {
      credentials: 'include'
    });
    const json = await res.json();
    const item = json.data?.item;
    const basic = item?.basic || {};
    const oid = basic.comment_id_str || basic.comment_id || item?.id_str || dynamicId;
    const type = Number(basic.comment_type || basic.comment_type_str || 17);
    const creator = item?.modules?.module_author?.mid || item?.modules?.module_author?.uid || 0;
    return oid ? { oid: String(oid), type, creator } : null;
  }

  function getVideoCommentTarget() {
    const state = unsafeWindow.__INITIAL_STATE__;
    let oid = String(state?.aid || state?.videoData?.aid || '');
    if (!oid || oid === 'undefined') {
      const bvMatch = location.pathname.match(/BV[\w]+/i);
      if (bvMatch) oid = b2a(bvMatch[0]);
    }
    return oid ? {
      oid,
      type: 1,
      creator: state?.upData?.mid || state?.videoData?.owner?.mid || 0
    } : null;
  }

  function getArticleCommentTarget() {
    const state = unsafeWindow.__INITIAL_STATE__ || {};
    const oid = String(
      state?.readInfo?.id ||
      state?.readInfo?.cvid ||
      state?.readInfo?.cid ||
      state?.detail?.id ||
      state?.articleInfo?.id ||
      getArticleIdFromLocation()
    );
    const creator = state?.readInfo?.mid || state?.readInfo?.author?.mid || state?.articleInfo?.author?.mid || 0;
    return oid && oid !== 'undefined' ? { oid, type: 12, creator } : null;
  }

  async function resolveCommentTarget() {
    try {
      if (isVideoCommentPage()) return getVideoCommentTarget();
      if (PAGE_RE.article.test(location.href)) return getArticleCommentTarget();
      if (PAGE_RE.dynamic.test(location.href) || PAGE_RE.opus.test(location.href)) {
        return await getDynamicCommentTarget(getDynamicIdFromLocation());
      }
    } catch(e) {
      console.error('[评论模块] 获取评论目标失败:', e);
    }
    return null;
  }

  function setupDynamicCommentBtnModifier() {
    if (!PAGE_RE.live.test(location.href) && !PAGE_RE.space.test(location.href)) return;

    const getDynamicLink = (node) => {
      const root = node.closest?.('[data-did], [data-dynamic-id], .opus-card, .bili-dyn-item, .dynamic-card, .card');
      const linkEl = root?.querySelector?.('a[href*="/opus/"], a[href*="t.bilibili.com/"]') ||
        node.closest?.('a[href*="/opus/"], a[href*="t.bilibili.com/"]');
      if (linkEl?.href) return linkEl.href;
      const did = root?.dataset?.did || root?.dataset?.dynamicId;
      return did ? `https://www.bilibili.com/opus/${did}` : '';
    };

    const bind = () => {
      document.querySelectorAll('[class*="comment"], [aria-label*="评论"], [title*="评论"]').forEach((btn) => {
        if (btn.dataset.bfqCommentBound) return;
        const text = (btn.textContent || btn.getAttribute('aria-label') || btn.getAttribute('title') || '').trim();
        if (!/评论/.test(text)) return;
        const href = getDynamicLink(btn);
        if (!href) return;
        btn.dataset.bfqCommentBound = '1';
        btn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          location.href = href;
        }, true);
      });
    };

    const start = () => {
      bind();
      new MutationObserver(bind).observe(document.body, { childList: true, subtree: true });
    };

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
  }

  function getLiveAreaFallbackUrl(rawUrl) {
    try {
      const url = new URL(rawUrl, location.href);
      if (url.hostname !== 'api.live.bilibili.com') return null;
      if (url.pathname !== '/xlive/web-interface/v1/second/getList') return null;

      const params = url.searchParams;
      const fallback = new URL('https://api.live.bilibili.com/room/v3/area/getRoomList');
      fallback.searchParams.set('platform', 'web');
      fallback.searchParams.set('parent_area_id', params.get('parent_area_id') || '0');
      fallback.searchParams.set('area_id', params.get('area_id') || '0');
      fallback.searchParams.set('page', params.get('page') || '1');
      fallback.searchParams.set('page_size', params.get('page_size') || '30');
      fallback.searchParams.set('sort_type', params.get('sort_type') || '');
      return {
        url: fallback.toString(),
        page: Number(params.get('page') || '1'),
        pageSize: Number(params.get('page_size') || '30'),
        parentAreaId: Number(params.get('parent_area_id') || '0'),
        areaId: Number(params.get('area_id') || '0')
      };
    } catch(e) {
      return null;
    }
  }

  function isUsableLiveAreaResponse(json, requestInfo) {
    if (!json || json.code !== 0) return false;
    const data = json.data || {};
    if (!Array.isArray(data.list)) return false;

    // case 1：空列表，仅在合理终态时视为可用
    if (data.list.length === 0) {
      return requestInfo.page > 1 || ('has_more' in data && Number(data.has_more) === 0);
    }

    // case 2：列表非空但明显被登录态裁剪——count 与 list 长度严重不匹配
    const count = Number(data.count || 0);
    const pageSize = requestInfo.pageSize || 30;
    const listLen = data.list.length;

    if (count > 0 && listLen < pageSize) {
      const expectedEndPage = Math.ceil(count / pageSize);
      const isLastPage = requestInfo.page >= expectedEndPage;
      if (!isLastPage) {
        console.warn('[直播分区] 列表疑似被登录态裁剪，走兜底:', {
          areaId: requestInfo.areaId, page: requestInfo.page, listLen, pageSize, count
        });
        return false;
      }
    }

    // case 3：has_more 标记与 list 长度矛盾（has_more=0 但 list 满，或反过来）→ 可能裁剪
    if ('has_more' in data) {
      const hasMore = Number(data.has_more);
      if (hasMore === 0 && listLen >= pageSize && count > requestInfo.page * pageSize) {
        console.warn('[直播分区] has_more 标记与列表长度矛盾，走兜底:', {
          areaId: requestInfo.areaId, page: requestInfo.page, listLen, pageSize, count, hasMore
        });
        return false;
      }
    }

    return true;
  }

  function createLiveAreaJsonResponse(json, NativeResponse) {
    return new NativeResponse(JSON.stringify(json), {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  async function fetchLiveAreaFallbackJson(originFetch, requestInfo, init) {
    const fallbackInit = {
      ...init,
      method: 'GET',
      body: undefined,
      credentials: 'omit'
    };
    const res = await originFetch(requestInfo.url, fallbackInit);
    return mapLiveAreaRoomList(await res.json(), requestInfo);
  }

  async function resolveLiveAreaJson(originFetch, requestInfo, originRequest, originInit) {
    let originJson = null;
    try {
      const originRes = await originFetch(originRequest, originInit);
      originJson = await originRes.clone().json();
      if (isUsableLiveAreaResponse(originJson, requestInfo)) {
        return { json: originJson, response: originRes };
      }
    } catch (e) {
      console.warn('[直播分区] 原接口请求失败，尝试旧接口兜底:', e);
    }

    try {
      return {
        json: await fetchLiveAreaFallbackJson(originFetch, requestInfo, originInit),
        response: null
      };
    } catch (e) {
      console.warn('[直播分区] 旧接口兜底失败:', e);
      if (originJson) return { json: originJson, response: null };
      throw e;
    }
  }

  function mapLiveAreaRoomList(json, requestInfo) {
    if (!json || json.code !== 0) return json;
    const oldData = json.data || {};
    const list = (oldData.list || []).map((item) => {
      const roomid = item.roomid || item.room_id;
      return {
        ...item,
        roomid,
        uid: item.uid || item.anchor_id || 0,
        title: item.title || '',
        uname: item.uname || item.user_name || '',
        cover: item.cover || item.user_cover || item.system_cover || '',
        user_cover: item.user_cover || item.cover || item.system_cover || '',
        system_cover: item.system_cover || item.keyframe || item.cover || '',
        face: item.face || item.avatar || '',
        link: item.link || `/${roomid}`,
        parent_id: item.parent_id || requestInfo.parentAreaId,
        area_id: item.area_id || requestInfo.areaId,
        area_v2_id: item.area_v2_id || item.area_id || requestInfo.areaId,
        area_v2_parent_id: item.area_v2_parent_id || item.parent_id || requestInfo.parentAreaId,
        area_v2_name: item.area_v2_name || item.area_name || '',
        area_v2_parent_name: item.area_v2_parent_name || item.parent_area_name || '',
        show_cover: item.show_cover || 'roomCover',
        is_auto_play: item.is_auto_play || 0,
        pendant_info: item.pendant_info || {},
        watched_show: item.watched_show || {}
      };
    });
    const count = Number(oldData.count || 0);
    const pageSize = Math.max(requestInfo.pageSize || 30, list.length || 0, 1);
    // 宁可多翻一页空也不提前停：count 已知时严格按 count 判；count 缺失时倾向 has_more=1，
    // 让前端多翻一页验证，避免旧接口真实数据被误判为末页导致「显示不全」
    let hasMore;
    if (count > 0) {
      hasMore = requestInfo.page * pageSize < count ? 1 : 0;
    } else {
      hasMore = list.length >= pageSize ? 1 : 0;
      if (list.length > 0 && list.length < pageSize) {
        console.warn('[直播分区] 旧接口返回不完整但 count 缺失，保守置 has_more=1:', {
          areaId: requestInfo.areaId, page: requestInfo.page, listLen: list.length, pageSize
        });
        hasMore = 1;
      }
    }
    return {
      code: 0,
      msg: json.msg || 'success',
      message: json.message || json.msg || 'success',
      ttl: json.ttl ?? 1,
      data: {
        list,
        count,
        total: count,
        total_count: count,
        page: requestInfo.page,
        page_size: requestInfo.pageSize,
        banner: oldData.banner || [],
        tags: oldData.tags || [],
        new_tags: oldData.new_tags || [],
        has_more: hasMore,
        vajra: oldData.vajra || [],
        cover_source: oldData.cover_source || 0
      }
    };
  }

  /* ========== 协议级画质解锁（拦截 playurl，服务端直接出 1080P）========== */
  const PROTOCOL_UNLOCK_TARGET_QN = 80;
  let playurlUnlockInstalled = false;

  function writePlayinfo(json, requestKey = '') {
    try {
      if (!json || json.code !== 0) return;
      if (requestKey) _playinfoKey = requestKey;
      _playinfoWriteAllow = true;
      _playinfoCache = json;
      try { unsafeWindow.__playinfo__ = json; } catch (e) {}
      _playinfoWriteAllow = false;
      // 写入高清流后主动切画质，覆盖 SPA 切推荐后默认 360P
      setTimeout(() => forcePlayerTargetQuality('after-playinfo'), 200);
      setTimeout(() => forcePlayerTargetQuality('after-playinfo-2'), 1200);
    } catch (e) {
      _playinfoWriteAllow = false;
    }
  }

  function emitXhrFakeResponse(xhr, json) {
    const text = JSON.stringify(json);
    const responseType = xhr.responseType || '';
    Object.defineProperties(xhr, {
      readyState: { value: 4, configurable: true },
      status: { value: 200, configurable: true },
      statusText: { value: 'OK', configurable: true },
      responseText: { value: text, configurable: true },
      response: { value: responseType === 'json' ? json : text, configurable: true },
      responseURL: { value: xhr.__bfqPlayurlUrl || '', configurable: true },
    });
    try {
      if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
    } catch (e) {}
    try {
      if (typeof xhr.onload === 'function') xhr.onload();
    } catch (e) {}
    try {
      if (typeof xhr.onloadend === 'function') xhr.onloadend();
    } catch (e) {}
    try { xhr.dispatchEvent(new Event('readystatechange')); } catch (e) {}
    try { xhr.dispatchEvent(new Event('load')); } catch (e) {}
    try { xhr.dispatchEvent(new Event('loadend')); } catch (e) {}
  }

  function getTargetQn() {
    const map = { 1080: 80, 720: 64, 480: 32, 360: 16 };
    return map[options.preferQuality] || PROTOCOL_UNLOCK_TARGET_QN;
  }

  async function buildPlayurlUrl(rawUrl, useTryLook = true) {
    const url = new URL(rawUrl, location.href);
    const params = {};
    for (const [k, v] of url.searchParams.entries()) {
      if (k === 'w_rid' || k === 'wts') continue;
      params[k] = v;
    }
    params.qn = String(getTargetQn());
    if (useTryLook) params.try_look = '1';
    else delete params.try_look;
    const signedQuery = await getWbiQueryString(params);
    return `${url.origin}${url.pathname}?${signedQuery}`;
  }

  function isTrialOnlyPlayurl(json) {
    try {
      if (!json || json.code !== 0) return true;
      const data = json.data || {};
      if (data.isPreview === 1 || data.preview === 1) return true;
      if (data.need_login === 1 || data.need_login === true) return true;
      const target = getTargetQn();
      const minAccept = Math.min(target, 64);
      if (data.dash && Array.isArray(data.dash.video) && data.dash.video.length > 0) {
        return Math.max(...data.dash.video.map(v => v.id || 0)) < minAccept;
      }
      if (Array.isArray(data.durl) && data.durl.length > 0) {
        return (data.quality || 0) < minAccept;
      }
      if (Array.isArray(data.accept_quality) && data.accept_quality.length > 0) {
        return Math.max(...data.accept_quality) < minAccept;
      }
      return false;
    } catch (e) { return true; }
  }

  async function parseFetchResponseJson(res) {
    try {
      return await res.clone().json();
    } catch (e) {
      try { return JSON.parse(await res.clone().text()); } catch (e2) { return null; }
    }
  }

  function installPlayurlUnlock() {
    if (!options.enableProtocolUnlock) return;
    if (!PAGE_RE.video.test(location.href) && !PAGE_RE.festival.test(location.href) && !PAGE_RE.list.test(location.href)) return;
    if (isBilibiliLoggedIn()) return;
    if (playurlUnlockInstalled) return;
    playurlUnlockInstalled = true;

    ensureFakeLoginCookie();
    clearPlayinfoSSR();
    installSpaPlayinfoReset();

    const fetchPlayurlJson = async (rawUrl, useTryLook) => {
      const signed = await buildPlayurlUrl(rawUrl, useTryLook);
      const res = await nativePageFetch(signed, { credentials: 'include', method: 'GET' });
      const json = await parseFetchResponseJson(res);
      return { res, json };
    };

    /* ---- fetch 链 ---- */
    const originFetch = unsafeWindow.fetch?.bind(unsafeWindow) || nativePageFetch;
    if (originFetch) {
      unsafeWindow.fetch = async function(input, init) {
        let rawUrl = typeof input === 'string' ? input : (input?.url ?? '');

        if (!isPlayurlRequestUrl(rawUrl)) {
          return originFetch(input, init);
        }

        try {
          const url = new URL(rawUrl, location.href);
          if (url.hostname !== 'api.bilibili.com') return originFetch(input, init);

          const reqKey = getPlayurlRequestKey(rawUrl);
          // 切到新 aid/cid 时先清旧缓存，防止串流
          if (reqKey && _playinfoKey && reqKey !== _playinfoKey) {
            _playinfoCache = null;
            _playinfoKey = '';
          }
          ensureFakeLoginCookie();

          let { json: json1 } = await fetchPlayurlJson(rawUrl, true);
          if (json1 && !isTrialOnlyPlayurl(json1)) {
            writePlayinfo(json1, reqKey);
            return new Response(JSON.stringify(json1), {
              status: 200,
              statusText: 'OK',
              headers: { 'content-type': 'application/json; charset=utf-8' }
            });
          }

          console.warn('[Bilibili脚本] try_look=1 仍给试看，重试仅 qn=' + getTargetQn());
          let { res: res2, json: json2 } = await fetchPlayurlJson(rawUrl, false);
          if (json2) writePlayinfo(json2, reqKey);
          if (!json2) return res2;
          return new Response(JSON.stringify(json2), {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        } catch (e) {
          console.warn('[Bilibili脚本] playurl 解锁失败，回退:', e);
          return originFetch(input, init);
        }
      };
    }

    /* ---- XHR 链 ---- */
    const XHR = unsafeWindow.XMLHttpRequest;
    if (!XHR || XHR.prototype.__bfqPlayurlPatched) return;
    XHR.prototype.__bfqPlayurlPatched = true;

    const originOpen = XHR.prototype.open;
    const originSend = XHR.prototype.send;

    XHR.prototype.open = function(method, url, ...rest) {
      this.__bfqPlayurlUrl = typeof url === 'string' ? url : (url?.url ?? '');
      this.__bfqPlayurlMethod = method;
      return originOpen.call(this, method, url, ...rest);
    };

    XHR.prototype.send = function(...args) {
      const rawUrl = this.__bfqPlayurlUrl;
      if (!isPlayurlRequestUrl(rawUrl)) {
        return originSend.apply(this, args);
      }

      const xhr = this;
      (async () => {
        try {
          const url = new URL(rawUrl, location.href);
          if (url.hostname !== 'api.bilibili.com') {
            return originSend.apply(xhr, args);
          }

          const reqKey = getPlayurlRequestKey(rawUrl);
          if (reqKey && _playinfoKey && reqKey !== _playinfoKey) {
            _playinfoCache = null;
            _playinfoKey = '';
          }
          ensureFakeLoginCookie();

          let { json } = await fetchPlayurlJson(rawUrl, true);
          if (isTrialOnlyPlayurl(json)) {
            console.warn('[Bilibili脚本] XHR try_look=1 仍给试看，重试');
            ({ json } = await fetchPlayurlJson(rawUrl, false));
          }
          writePlayinfo(json, reqKey);
          emitXhrFakeResponse(xhr, json || {});
        } catch (e) {
          console.warn('[Bilibili脚本] XHR playurl 解锁失败:', e);
          try { originSend.apply(xhr, args); } catch (e2) {}
        }
      })();
    };
  }

  function installLiveAreaUnlock() {
    if (!options.enableLiveAreaUnlock || !PAGE_RE.live.test(location.href) || isBilibiliLoggedIn()) return;

    const NativeResponse = unsafeWindow.Response || Response;
    const originFetch = unsafeWindow.fetch?.bind(unsafeWindow);
    if (originFetch) {
      unsafeWindow.fetch = async function(input, init) {
        const rawUrl = typeof input === 'string' ? input : input?.url;
        const fallback = getLiveAreaFallbackUrl(rawUrl);
        if (!fallback) return originFetch(input, init);

        const result = await resolveLiveAreaJson(originFetch, fallback, input, init);
        return result.response || createLiveAreaJsonResponse(result.json, NativeResponse);
      };
    }

    const XHR = unsafeWindow.XMLHttpRequest;
    if (!XHR || XHR.prototype.__bfqLiveAreaPatched) return;
    XHR.prototype.__bfqLiveAreaPatched = true;

    const fakeStates = new WeakMap();
    const originOpen = XHR.prototype.open;
    const originSend = XHR.prototype.send;
    const originSetRequestHeader = XHR.prototype.setRequestHeader;
    const originGetResponseHeader = XHR.prototype.getResponseHeader;
    const originGetAllResponseHeaders = XHR.prototype.getAllResponseHeaders;

    const nativeGetters = {};
    ['readyState', 'status', 'statusText', 'response', 'responseText', 'responseURL'].forEach((prop) => {
      nativeGetters[prop] = Object.getOwnPropertyDescriptor(XHR.prototype, prop)?.get;
    });

    const emit = (xhr, type) => {
      const event = new unsafeWindow.Event(type);
      xhr.dispatchEvent(event);
      const handler = xhr[`on${type}`];
      if (typeof handler === 'function') handler.call(xhr, event);
    };

    const setReadyState = (xhr, state, readyState) => {
      state.readyState = readyState;
      emit(xhr, 'readystatechange');
    };

    XHR.prototype.open = function(method, url, async = true) {
      const fallback = getLiveAreaFallbackUrl(url);
      if (!fallback) return originOpen.apply(this, arguments);

      fakeStates.set(this, {
        matched: true,
        method,
        url: String(url),
        fallback,
        async: async !== false,
        headers: {},
        readyState: 1,
        status: 0,
        statusText: '',
        response: null,
        responseText: '',
        responseURL: fallback.url,
        responseHeaders: 'content-type: application/json; charset=utf-8\r\n'
      });
      setTimeout(() => emit(this, 'readystatechange'), 0);
    };

    XHR.prototype.setRequestHeader = function(name, value) {
      const state = fakeStates.get(this);
      if (state?.matched) {
        state.headers[name] = value;
        return;
      }
      return originSetRequestHeader.apply(this, arguments);
    };

    XHR.prototype.send = function(body) {
      const state = fakeStates.get(this);
      if (!state?.matched) return originSend.apply(this, arguments);

      emit(this, 'loadstart');
      setReadyState(this, state, 2);

      resolveLiveAreaJson(originFetch, state.fallback, state.url, {
        method: state.method || 'GET',
        headers: state.headers,
        credentials: this.withCredentials ? 'include' : 'same-origin'
      })
        .then(({ json }) => {
          state.status = 200;
          state.statusText = 'OK';
          state.responseText = JSON.stringify(json);
          state.response = this.responseType === 'json' ? json : state.responseText;
          setReadyState(this, state, 4);
          emit(this, 'load');
          emit(this, 'loadend');
        })
        .catch((err) => {
          state.status = 0;
          state.statusText = String(err);
          setReadyState(this, state, 4);
          emit(this, 'error');
          emit(this, 'loadend');
        });
    };

    XHR.prototype.getResponseHeader = function(name) {
      const state = fakeStates.get(this);
      if (state?.matched) return String(name).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null;
      return originGetResponseHeader.apply(this, arguments);
    };

    XHR.prototype.getAllResponseHeaders = function() {
      const state = fakeStates.get(this);
      if (state?.matched) return state.responseHeaders;
      return originGetAllResponseHeaders.apply(this, arguments);
    };

    ['readyState', 'status', 'statusText', 'response', 'responseText', 'responseURL'].forEach((prop) => {
      if (!nativeGetters[prop]) return;
      Object.defineProperty(XHR.prototype, prop, {
        configurable: true,
        get() {
          const state = fakeStates.get(this);
          if (state?.matched) return state[prop];
          return nativeGetters[prop].call(this);
        }
      });
    });
  }

  function commentFormatTime(ts) {
    const d = new Date(ts * 1000);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}天前`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderReplyContent(reply) {
    let text = escapeHtml(reply.content?.message || '');
    if (reply.content?.emote) {
      Object.entries(reply.content.emote).forEach(([key, emote]) => {
        const esc = escapeHtml(key);
        text = text.replace(
          new RegExp(esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          `<img class="reply-emote" src="${escapeHtml(emote.url)}" alt="${esc}" />`
        );
      });
    }
    text = text.replace(/@([^\s,，：:@\n]+)/g, '<a class="reply-mention" href="javascript:void(0)">@$1</a>');
    return text;
  }

  function appendCommentItem(replyData, isTop) {
    const list = document.getElementById('bili-comment-list');
    if (!list) return;

    const isVip = replyData.member?.vip?.vipStatus === 1;
    const isUp = Number(replyData.mid) === Number(commentCreatorID);
    const level = replyData.member?.level_info?.current_level || 0;
    const nameStyle = isVip ? ' style="color:#fb7299"' : '';
    const upBadge = isUp ? '<span class="reply-up-badge">UP主</span>' : '';
    const subReplies = (replyData.replies || []).slice(0, 3);
    const subCount = replyData.rcount || 0;

    let subHtml = '';
    if (subReplies.length > 0) {
      const subItems = subReplies.map(sub => {
        const sVip = sub.member?.vip?.vipStatus === 1;
        const sUp = Number(sub.mid) === Number(commentCreatorID);
        return `<div class="sub-reply-item">
          <a class="sub-reply-avatar" href="https://space.bilibili.com/${sub.mid}" target="_blank"><img src="${escapeHtml(sub.member?.avatar || '')}" alt="" loading="lazy" /></a>
          <div class="sub-reply-main">
            <a class="sub-reply-username" href="https://space.bilibili.com/${sub.mid}" target="_blank"${sVip ? ' style="color:#fb7299"' : ''}>${escapeHtml(sub.member?.uname || '')}</a>${sUp ? '<span class="reply-up-badge reply-up-badge-sm">UP主</span>' : ''}：<span class="sub-reply-text">${renderReplyContent(sub)}</span>
            <span class="sub-reply-time">${commentFormatTime(sub.ctime)}</span>
          </div>
        </div>`;
      }).join('');
      const moreBtn = subCount > 3
        ? `<div class="sub-reply-more" data-rpid="${replyData.rpid}" data-count="${subCount}">共 ${subCount} 条回复，点击查看全部 &gt;</div>`
        : '';
      subHtml = `<div class="sub-reply-list">${subItems}${moreBtn}</div>`;
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<div class="reply-item${isTop ? ' reply-top' : ''}" data-rpid="${replyData.rpid}">
      <a class="reply-avatar" href="https://space.bilibili.com/${replyData.mid}" target="_blank"><img src="${escapeHtml(replyData.member?.avatar || '')}" alt="" loading="lazy" /></a>
      <div class="reply-main">
        <div class="reply-header">
          <a class="reply-username" href="https://space.bilibili.com/${replyData.mid}" target="_blank"${nameStyle}>${escapeHtml(replyData.member?.uname || '')}</a>${upBadge}<span class="reply-level lv-${level}">Lv.${level}</span>
        </div>
        <div class="reply-text">${renderReplyContent(replyData)}</div>
        <div class="reply-footer">
          <span class="reply-time">${commentFormatTime(replyData.ctime)}</span>
          <span class="reply-likes">👍 ${replyData.like || 0}</span>
        </div>
        ${subHtml}
      </div>
    </div>`;

    const item = wrapper.firstElementChild;
    const moreEl = item.querySelector('.sub-reply-more');
    if (moreEl) {
      moreEl.addEventListener('click', () => {
        loadSubReplies(replyData.rpid, item.querySelector('.sub-reply-list'), parseInt(moreEl.dataset.count), 1);
      });
    }
    list.appendChild(item);
  }

  async function loadSubReplies(rootReplyID, container, totalCount, pageNum) {
    if (!container) return;
    const loadEl = document.createElement('div');
    loadEl.className = 'sub-reply-loading';
    loadEl.textContent = '加载中...';
    container.appendChild(loadEl);
    try {
      const res = await nativePageFetch(
        `https://api.bilibili.com/x/v2/reply/reply?oid=${commentOid}&root=${rootReplyID}&pn=${pageNum}&ps=10&type=${commentType}`,
        { credentials: 'omit' }
      );
      const data = await res.json();
      loadEl.remove();
      if (data.code === 0 && data.data?.replies) {
        if (pageNum === 1) container.innerHTML = '';
        data.data.replies.forEach(sub => {
          const sVip = sub.member?.vip?.vipStatus === 1;
          const sUp = Number(sub.mid) === Number(commentCreatorID);
          const el = document.createElement('div');
          el.className = 'sub-reply-item';
          el.innerHTML = `
            <a class="sub-reply-avatar" href="https://space.bilibili.com/${sub.mid}" target="_blank"><img src="${escapeHtml(sub.member?.avatar || '')}" alt="" loading="lazy" /></a>
            <div class="sub-reply-main">
              <a class="sub-reply-username" href="https://space.bilibili.com/${sub.mid}" target="_blank"${sVip ? ' style="color:#fb7299"' : ''}>${escapeHtml(sub.member?.uname || '')}</a>${sUp ? '<span class="reply-up-badge reply-up-badge-sm">UP主</span>' : ''}：<span class="sub-reply-text">${renderReplyContent(sub)}</span>
              <span class="sub-reply-time">${commentFormatTime(sub.ctime)}</span>
            </div>`;
          container.appendChild(el);
        });
        const loaded = pageNum * 10;
        if (loaded < totalCount) {
          const nextBtn = document.createElement('div');
          nextBtn.className = 'sub-reply-more';
          nextBtn.textContent = `继续加载（还有 ${totalCount - loaded} 条）`;
          nextBtn.addEventListener('click', () => { nextBtn.remove(); loadSubReplies(rootReplyID, container, totalCount, pageNum + 1); });
          container.appendChild(nextBtn);
        }
      }
    } catch(e) {
      loadEl.remove();
      console.error('[评论模块] 子评论加载失败:', e);
    }
  }

  async function getCommentPaginationData(offset) {
    const mode = commentCurrentSortType === COMMENT_SORT.HOT ? 3 : 2;
    const paginationStr = JSON.stringify({ offset: offset || '' });
    const wts = Math.floor(Date.now() / 1000);
    const qs = await getWbiQueryString({ oid: commentOid, type: commentType, mode, ps: COMMENT_PAGE_SIZE, pagination_str: paginationStr, wts });
    const res = await nativePageFetch(`https://api.bilibili.com/x/v2/reply/wbi/main?${qs}`, { credentials: 'omit' });
    return res.json();
  }

  async function loadCommentPage(offset, appendToList) {
    if (commentIsLoading) return;
    commentIsLoading = true;
    const loader = document.getElementById('bili-comment-loader');
    if (loader) loader.style.display = 'block';
    try {
      const data = await getCommentPaginationData(offset);
      if (data.code !== 0) {
        console.error('[评论模块] API错误:', data.code, data.message);
        return;
      }
      const list = document.getElementById('bili-comment-list');
      if (!appendToList && list) list.innerHTML = '';
      if (!appendToList) {
        const topReply = data.data?.top?.upper;
        if (topReply) appendCommentItem(topReply, true);
      }
      (data.data?.replies || []).forEach(r => appendCommentItem(r, false));
      commentTotalCount = Number(data.data?.cursor?.all_count || data.data?.cursor?.total || commentTotalCount || 0);
      const nextOffset = data.data?.cursor?.pagination_reply?.next_offset || '';
      const isEnd = !nextOffset || !!data.data?.cursor?.is_end;
      commentIsEnd = isEnd;
      commentNextOffset = nextOffset;
      if (options.enableReplyPagination) {
        if (!isEnd) commentPageOffsets[commentCurrentPage + 1] = nextOffset;
        updatePaginationControls();
      } else {
        if (isEnd) {
          const endEl = document.getElementById('bili-comment-end');
          if (endEl) endEl.style.display = 'block';
        }
      }
    } catch(e) {
      console.error('[评论模块] 加载评论失败:', e);
    } finally {
      commentIsLoading = false;
      if (loader) loader.style.display = 'none';
    }
  }

  function updatePaginationControls() {
    const pageInfo = document.getElementById('bili-page-info');
    const prevBtn = document.getElementById('bili-prev-page');
    const nextBtn = document.getElementById('bili-next-page');
    const jumpInput = document.getElementById('bili-jump-page-input');
    const totalPages = commentTotalCount ? Math.max(1, Math.ceil(commentTotalCount / COMMENT_PAGE_SIZE)) : 0;
    if (pageInfo) pageInfo.textContent = totalPages ? `第 ${commentCurrentPage + 1} / ${totalPages} 页` : `第 ${commentCurrentPage + 1} 页`;
    if (prevBtn) prevBtn.disabled = commentCurrentPage === 0;
    if (nextBtn) nextBtn.disabled = commentIsEnd;
    if (jumpInput) {
      jumpInput.max = totalPages || '';
      jumpInput.placeholder = totalPages ? `1-${totalPages}` : '页码';
    }
  }

  async function ensureCommentPageOffset(targetPage) {
    if (targetPage < 0) return false;
    if (commentPageOffsets[targetPage] !== undefined) return true;

    let knownIndex = commentPageOffsets.length - 1;
    while (knownIndex >= 0 && commentPageOffsets[knownIndex] === undefined) knownIndex--;
    if (knownIndex < 0) return false;

    while (knownIndex < targetPage) {
      const data = await getCommentPaginationData(commentPageOffsets[knownIndex] || '');
      if (data.code !== 0) return false;
      const nextOffset = data.data?.cursor?.pagination_reply?.next_offset || '';
      if (!nextOffset) return false;
      commentPageOffsets[knownIndex + 1] = nextOffset;
      knownIndex++;
    }
    return true;
  }

  async function jumpToCommentPage(pageNum) {
    if (commentIsLoading) return;
    const totalPages = commentTotalCount ? Math.max(1, Math.ceil(commentTotalCount / COMMENT_PAGE_SIZE)) : 0;
    if (!Number.isFinite(pageNum) || pageNum < 1) return;
    if (totalPages && pageNum > totalPages) pageNum = totalPages;

    const targetIndex = pageNum - 1;
    const loader = document.getElementById('bili-comment-loader');
    commentIsLoading = true;
    if (loader) {
      loader.textContent = `正在定位第 ${pageNum} 页...`;
      loader.style.display = 'block';
    }
    const ok = await ensureCommentPageOffset(targetIndex);
    commentIsLoading = false;
    if (loader) {
      loader.textContent = '加载中...';
      loader.style.display = 'none';
    }
    if (!ok) return;

    commentCurrentPage = targetIndex;
    commentIsEnd = false;
    await loadCommentPage(commentPageOffsets[targetIndex] || '', false);
  }

  async function initCommentModule() {
    if (!options.enableCommentUnlock) return;
    if (!isCommentDetailPage()) return;

    // 协议级 + 自绘并存：协议级保证官方组件也能拉全量；自绘保证未登录可见评论区
    // 挂载用 isSafeCommentRoot，避免 hide 误伤顶栏
    installReplyProtocolUnlock();

    commentCurrentSortType = COMMENT_SORT.HOT;
    commentIsLoading = false;
    commentIsEnd = false;
    commentNextOffset = '';
    commentPageOffsets = [''];
    commentCurrentPage = 0;
    commentTotalCount = 0;

    GM_addStyle(`
#bili-custom-comments{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif;font-size:14px;color:#222;padding:16px 0}
.bili-comment-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e3e5e7}
.bili-comment-title{font-size:18px;font-weight:700;color:#18191c}
.bili-comment-sort{display:flex;gap:16px}
.sort-btn{cursor:pointer;color:#9499a0;font-size:14px;padding:4px 8px;border-radius:4px;transition:color .2s}
.sort-btn.active{color:#00aeec;font-weight:700}
.sort-btn:hover{color:#00aeec}
.reply-item{display:flex;gap:12px;padding:16px 0;border-bottom:1px solid #e3e5e7}
.reply-item.reply-top{background:#fef9f0;border-radius:8px;padding:16px;margin-bottom:8px;border-bottom:none}
.reply-avatar img{width:40px;height:40px;border-radius:50%;object-fit:cover;background:#e3e5e7}
.reply-main{flex:1;min-width:0}
.reply-header{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px}
.reply-username{color:#61666d;font-weight:600;text-decoration:none}
.reply-username:hover{color:#00aeec}
.reply-level{font-size:11px;padding:1px 4px;border-radius:3px;background:#e3e5e7;color:#9499a0}
.lv-3,.lv-4{background:#e8ffe8;color:#52c41a}
.lv-5,.lv-6{background:#fff7e6;color:#fa8c16}
.reply-up-badge{font-size:11px;padding:1px 4px;border-radius:3px;background:#fb7299;color:#fff}
.reply-up-badge-sm{font-size:10px;padding:0 3px}
.reply-text{color:#18191c;line-height:1.7;word-break:break-word;margin-bottom:8px}
.reply-emote{height:20px;vertical-align:middle}
.reply-mention{color:#00aeec;text-decoration:none}
.reply-footer{display:flex;align-items:center;gap:16px;color:#9499a0;font-size:12px}
.sub-reply-list{margin-top:10px;background:#f6f7f8;border-radius:8px;padding:8px 12px}
.sub-reply-item{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #e3e5e7}
.sub-reply-item:last-child{border-bottom:none}
.sub-reply-avatar img{width:24px;height:24px;border-radius:50%;object-fit:cover;background:#e3e5e7}
.sub-reply-main{flex:1;min-width:0;font-size:13px;line-height:1.6}
.sub-reply-username{color:#61666d;font-weight:600;text-decoration:none;margin-right:2px}
.sub-reply-username:hover{color:#00aeec}
.sub-reply-text{color:#18191c;word-break:break-word}
.sub-reply-time{color:#9499a0;font-size:11px;margin-left:6px}
.sub-reply-more{cursor:pointer;color:#00aeec;font-size:13px;padding:8px 0;text-align:center}
.sub-reply-more:hover{opacity:.8}
.sub-reply-loading{color:#9499a0;font-size:13px;padding:6px 0;text-align:center}
#bili-comment-loader{text-align:center;padding:16px;color:#9499a0}
#bili-comment-end{text-align:center;padding:16px;color:#9499a0;font-size:13px}
#bili-scroll-anchor{height:1px}
#bili-comment-pagination{display:flex;justify-content:center;align-items:center;gap:16px;padding:16px 0}
#bili-comment-pagination button{padding:6px 16px;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:#fff;color:#555;transition:all .2s}
#bili-comment-pagination button:hover:not(:disabled){border-color:#00aeec;color:#00aeec}
#bili-comment-pagination button:disabled{opacity:.5;cursor:not-allowed}
#bili-page-info{color:#555;font-size:14px}
.bili-page-jump{display:flex;align-items:center;gap:6px;color:#555;font-size:14px}
#bili-jump-page-input{width:72px;height:30px;padding:0 8px;border:1px solid #ddd;border-radius:4px;outline:none}
#bili-jump-page-input:focus{border-color:#00aeec}
`);

    // 收窄选择器：去掉 #comment / 裸 .comment-container，避免误伤顶栏等布局节点
    const nativeCommentSelector = 'bili-comments, #commentapp bili-comments, #commentapp, .bili-comment-container';
    const isSafeCommentRoot = (el) => {
      if (!el || el.nodeType !== 1) return false;
      if (el.closest?.('.bili-header, #bili-header-container, #biliMainHeader, .fixed-header')) return false;
      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'BILI-COMMENTS' || tag === 'BILI-COMMENT-CONTAINER') return true;
      if (el.id === 'commentapp') return true;
      if (el.classList?.contains('bili-comment-container')) return true;
      return false;
    };
    let commentSection;
    let hasNativeCommentSection = true;
    try {
      commentSection = await waitForElement(nativeCommentSelector, 12000);
      if (!isSafeCommentRoot(commentSection)) {
        hasNativeCommentSection = false;
        commentSection = document.querySelector('.article-container, .opus-detail, .opus-detail-content, main, #app') || document.body;
      }
    } catch(e) {
      console.warn('[评论模块] 未找到官方评论容器，改用页面底部挂载:', e.message);
      hasNativeCommentSection = false;
      commentSection = document.querySelector('.article-container, .opus-detail, .opus-detail-content, main, #app') || document.body;
      if (!commentSection) return;
    }

    const target = await resolveCommentTarget();
    if (!target?.oid) {
      console.warn('[评论模块] 无法获取评论目标');
      return;
    }

    commentOid = target.oid;
    commentType = target.type;
    commentCreatorID = target.creator || 0;

    console.log(`[评论模块] 初始化，oid=${commentOid}, type=${commentType}, creator=${commentCreatorID}`);

    const customEl = document.createElement('div');
    customEl.id = 'bili-custom-comments';
    customEl.innerHTML = `
      <div class="bili-comment-header">
        <span class="bili-comment-title">评论</span>
        <div class="bili-comment-sort">
          <span class="sort-btn active" data-sort="2">最热</span>
          <span class="sort-btn" data-sort="0">最新</span>
        </div>
      </div>
      <div id="bili-comment-list"></div>
      <div id="bili-comment-loader" style="display:none">加载中...</div>
      <div id="bili-comment-end" style="display:none">没有更多评论了</div>
      ${options.enableReplyPagination
        ? `<div id="bili-comment-pagination"><button id="bili-prev-page" disabled>上一页</button><span id="bili-page-info">第 1 页</span><button id="bili-next-page">下一页</button><label class="bili-page-jump">跳至 <input id="bili-jump-page-input" type="number" min="1" inputmode="numeric" /><button id="bili-jump-page">跳转</button></label></div>`
        : `<div id="bili-scroll-anchor"></div>`}`;

    const hideOfficialComment = (el) => {
      if (!isSafeCommentRoot(el)) return false;
      el.style.setProperty('display', 'none', 'important');
      return true;
    };

    const mountCustomComments = () => {
      if (document.getElementById('bili-custom-comments') === customEl && customEl.isConnected) return;
      const nativeSection = document.querySelector(nativeCommentSelector);
      if (nativeSection?.parentNode && isSafeCommentRoot(nativeSection)) {
        if (!customEl.isConnected) nativeSection.parentNode.insertBefore(customEl, nativeSection.nextSibling);
        hideOfficialComment(nativeSection);
        return;
      }
      if (hasNativeCommentSection && commentSection?.parentNode && isSafeCommentRoot(commentSection)) {
        if (!customEl.isConnected) commentSection.parentNode.insertBefore(customEl, commentSection.nextSibling);
        hideOfficialComment(commentSection);
        return;
      }
      if (!customEl.isConnected) {
        (commentSection || document.body).appendChild(customEl);
      }
    };

    mountCustomComments();

    // 守护范围缩到评论父节点，避免全站 MutationObserver 误伤顶栏
    const guardRoot = customEl.parentNode || commentSection || document.body;
    const commentGuard = new MutationObserver(() => {
      if (!document.getElementById('bili-custom-comments')) mountCustomComments();
      guardRoot.querySelectorAll?.('bili-comments, bili-comment-container')?.forEach((node) => {
        if (isSafeCommentRoot(node)) hideOfficialComment(node);
      });
    });
    if (guardRoot) commentGuard.observe(guardRoot, { childList: true, subtree: true });

    customEl.querySelectorAll('.sort-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sort = parseInt(btn.dataset.sort);
        if (sort === commentCurrentSortType) return;
        commentCurrentSortType = sort;
        customEl.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        commentNextOffset = '';
        commentPageOffsets = [''];
        commentCurrentPage = 0;
        commentTotalCount = 0;
        commentIsEnd = false;
        document.getElementById('bili-comment-end').style.display = 'none';
        await loadCommentPage('', false);
      });
    });

    if (options.enableReplyPagination) {
      document.getElementById('bili-next-page').addEventListener('click', async () => {
        if (commentIsEnd || commentIsLoading) return;
        commentCurrentPage++;
        await loadCommentPage(commentPageOffsets[commentCurrentPage] || '', false);
      });
      document.getElementById('bili-prev-page').addEventListener('click', async () => {
        if (commentCurrentPage <= 0 || commentIsLoading) return;
        commentCurrentPage--;
        commentIsEnd = false;
        await loadCommentPage(commentPageOffsets[commentCurrentPage] || '', false);
      });
      const jumpInput = document.getElementById('bili-jump-page-input');
      document.getElementById('bili-jump-page').addEventListener('click', async () => {
        await jumpToCommentPage(Number(jumpInput.value));
      });
      jumpInput.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') await jumpToCommentPage(Number(jumpInput.value));
      });
      await loadCommentPage('', false);
    } else {
      const anchor = document.getElementById('bili-scroll-anchor');
      const scrollObserver = new IntersectionObserver(async () => {
        if (!commentIsLoading && !commentIsEnd) {
          await loadCommentPage(commentNextOffset, commentNextOffset !== '');
        }
      }, { rootMargin: '300px' });
      scrollObserver.observe(anchor);
    }

    /* ========== 监听视频切换，自动更新评论区 ========== */
    let lastOid = commentOid;
    setInterval(() => {
      let newOid;
      try {
        const state = unsafeWindow.__INITIAL_STATE__;
        if (state?.aid) newOid = String(state.aid);
        else if (state?.videoData?.aid) newOid = String(state.videoData.aid);
        else {
          const bvMatch = location.pathname.match(/BV[\w]+/i);
          if (bvMatch) newOid = b2a(bvMatch[0]);
        }
      } catch (e) {}
      
      if (newOid && newOid !== lastOid) {
        lastOid = newOid;
        commentOid = newOid;
        const state = unsafeWindow.__INITIAL_STATE__;
        commentCreatorID = state?.upData?.mid || state?.videoData?.owner?.mid || 0;
        
        console.log(`[评论模块] 检测到视频切换，新 oid=${newOid}, creator=${commentCreatorID}`);
        
        // 重置评论区状态
        commentCurrentSortType = COMMENT_SORT.HOT;
        document.querySelectorAll('#bili-custom-comments .sort-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('#bili-custom-comments .sort-btn[data-sort="2"]')?.classList.add('active');
        commentNextOffset = '';
        commentPageOffsets = [''];
        commentCurrentPage = 0;
        commentTotalCount = 0;
        commentIsEnd = false;
        
        // 清空评论列表
        const list = document.getElementById('bili-comment-list');
        if (list) list.innerHTML = '';
        const endEl = document.getElementById('bili-comment-end');
        if (endEl) endEl.style.display = 'none';
        
        // 重新加载评论
        loadCommentPage('', false);
      }
    }, 1500);
  }

  /* ========== 1. 已登录退出 + 主模块安装 ========== */

  installRcmdLoginGuard();
  installReplyProtocolUnlock();
  installLiveAreaUnlock();
  installPlayurlUnlock();
  setupDynamicCommentBtnModifier();

  /* ========== 初始化评论模块（无论是否登录都执行） ========== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCommentModule);
  } else {
    initCommentModule();
  }

  /* ========== 1. 如果已登录直接退出 ========== */
  if (isBilibiliLoggedIn()) return;

  /* ========== 2. 阻止登录弹窗 / 自动暂停 ========== */

  /* 2-1 登录遮罩 / 弹窗选择器 */
  const LOGIN_MASK_SELECTOR = [
    '.bili-mini-mask',
    '.bili-mini-login-mask',
    '.mini-login-mask',
    '.bili-login-v2-mask',
    '.login-panel-mask',
    '.v-popover-wrap .login-panel-popover',
    '[class*="login-mask"]',
    '[class*="mini-login-mask"]'
  ].join(',');

  const LOGIN_POPUP_SELECTOR = [
    '.bili-mini-login',
    '.mini-login',
    '.bili-login-v2-container',
    '.passport-login-pop',
    '.passport-login-container',
    '.login-panel-popover',
    '.bili-mini-login-right-panel',
    '.login-panel',
    '[class*="mini-login"]',
    '[class*="login-panel"]'
  ].join(',');

  const PLAYER_LOGIN_SELECTOR = [
    '.passport-login-tip-container',
    '.login-tip',
    '.bpx-player-toast-confirm-login',
    '.bpx-player-ending-content-login',
    '[class*="login-tip"]'
  ].join(',');

  /* 2-2 CSS：顶栏最高层级 + 更广登录层隐藏（仍避开顶栏内部） */
  GM_addStyle(`
    .bili-header, #bili-header-container, .bili-header__bar, #biliMainHeader, .fixed-header {
      position: relative !important; z-index: 100001 !important;
      pointer-events: auto !important; visibility: visible !important; opacity: 1 !important;
    }
    .bili-header .center-search-container, .bili-header .nav-search, .bili-header .nav-search-input,
    .bili-header .search-panel, .bili-header .search-panel-popover {
      position: relative !important; z-index: 100002 !important;
      pointer-events: auto !important; visibility: visible !important; opacity: 1 !important;
    }
    .bili-mini-mask, .bili-mini-login-mask, .mini-login-mask, .bili-login-v2-mask,
    .login-panel-mask, [class*="login-mask"], [class*="mini-login-mask"],
    body > .bili-mini-login, body > .mini-login, body > .bili-login-v2-container,
    body > .passport-login-pop, body > .passport-login-container,
    body > .login-panel-popover, body > .login-panel,
    .bpx-player-container .passport-login-tip-container,
    .bpx-player-container .login-tip {
      display: none !important; pointer-events: none !important;
      opacity: 0 !important; visibility: hidden !important;
    }
  `);

  // 2-3 兜底：DOM MutationObserver 处理仍漏出的弹窗
  const hideElement = (el) => {
    if (!el || el.nodeType !== 1) return;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('opacity', '0', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
  };

  const isInHeader = (el) => !!el.closest?.(
    '.bili-header, #bili-header-container, .bili-header__bar, #biliMainHeader, .fixed-header'
  );

  const isViewportLoginLayer = (el) => {
    if (!el || el.nodeType !== 1 || isInHeader(el)) return false;
    // 顶栏登录按钮本身不隐藏
    if (el.closest?.('.header-login-entry, .header-avatar-wrap, .right-entry')) return false;
    if (el.matches?.(LOGIN_MASK_SELECTOR) || el.matches?.(LOGIN_POPUP_SELECTOR)) return true;

    const cls = typeof el.className === 'string' ? el.className : '';
    const looksLogin = /mini-login|login-panel|login-mask|passport-login|bili-login/i.test(cls);
    if (!looksLogin && !el.matches?.(PLAYER_LOGIN_SELECTOR)) return false;

    const style = unsafeWindow.getComputedStyle?.(el) || getComputedStyle(el);
    const rect = el.getBoundingClientRect?.();
    const isLayerPosition = ['fixed', 'absolute', 'sticky'].includes(style.position) || el.parentElement === document.body;
    const isLargeLayer = rect && rect.width >= Math.min(280, unsafeWindow.innerWidth * 0.3) && rect.height >= Math.min(160, unsafeWindow.innerHeight * 0.18);
    const hasLoginForm = !!el.querySelector?.('input[type="password"], input[placeholder*="密码"], input[placeholder*="登录"], button, [class*="login"]');
    return isLayerPosition && (isLargeLayer || hasLoginForm || looksLogin);
  };

  const hideLoginLayersInNode = (node) => {
    if (!node || node.nodeType !== 1) return;
    if (isViewportLoginLayer(node)) hideElement(node);
    node.querySelectorAll?.(`${LOGIN_MASK_SELECTOR},${LOGIN_POPUP_SELECTOR},${PLAYER_LOGIN_SELECTOR}`)?.forEach((el) => {
      if (isInHeader(el)) return;
      if (el.closest?.('.header-login-entry, .header-avatar-wrap, .right-entry')) return;
      hideElement(el);
    });
    // 类名模糊匹配：覆盖 B 站改版后的登录层
    node.querySelectorAll?.('[class*="mini-login"], [class*="login-mask"], [class*="login-panel"], [class*="passport-login"]')?.forEach((el) => {
      if (isInHeader(el)) return;
      if (el.closest?.('.header-login-entry, .header-avatar-wrap, .right-entry')) return;
      if (isViewportLoginLayer(el) || /mask|panel|pop|modal|dialog/i.test(el.className || '')) hideElement(el);
    });
  };

  if (document.documentElement) hideLoginLayersInNode(document.documentElement);

  const startLoginLayerGuard = () => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => hideLoginLayersInNode(node));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.body) {
    startLoginLayerGuard();
  } else {
    document.addEventListener('DOMContentLoaded', startLoginLayerGuard, { once: true });
  }

  (function blockLoginAndAutoPause() {
    /* 2-1 等待播放器就绪后屏蔽 getMediaInfo 返回值 */
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
      const player = unsafeWindow.player;
      const originGet = player.getMediaInfo;
      player.getMediaInfo = function () {
        const info = originGet.call(this);
        return { absolutePlayTime: 0, relativePlayTime: info.relativePlayTime, playUrl: info.playUrl };
      };

      let lastTrustedActionTime = 0;
      let allowInternalPause = false;
      let currentMedia = null;
      let isUserPaused = false;
      let hasPlaybackStarted = false;

      const markTrustedAction = (event) => {
        if (event && event.isTrusted === false) return;
        lastTrustedActionTime = Date.now();
      };

      const canPauseNow = () => {
        return allowInternalPause || Date.now() - lastTrustedActionTime <= CONFIG.CLICK_TIMEOUT;
      };

      document.addEventListener('pointerdown', markTrustedAction, { passive: true, capture: true });
      document.addEventListener('keydown', (e) => {
        if (!e.isTrusted) return;
        if (e.code === 'Space' || e.code === 'KeyK' || e.key === ' ' || e.key === 'k' || e.key === 'K') {
          markTrustedAction(e);
        }
      }, { passive: true, capture: true });

      const originPause = typeof player.pause === 'function' ? player.pause.bind(player) : null;
      if (originPause) {
        player.pause = function () {
          if (currentMedia && !hasPlaybackStarted) return originPause(...arguments);
          if (!canPauseNow()) return;
          return originPause(...arguments);
        };
      }

      const bindMediaGuard = (media) => {
        if (!media || media.dataset.bfqPauseGuardBound) return;
        const originMediaPause = media.pause.bind(media);

        media.pause = function () {
          if (!hasPlaybackStarted) return originMediaPause();
          if (!canPauseNow()) return;
          return originMediaPause();
        };

        media.addEventListener('pause', () => {
          if (!hasPlaybackStarted) return;
          if (allowInternalPause) return;

          if (Date.now() - lastTrustedActionTime <= CONFIG.CLICK_TIMEOUT) {
            isUserPaused = true;
            return;
          }

          isUserPaused = false;
          Promise.resolve().then(() => media.play()).catch(() => {});
        }, true);

        media.addEventListener('play', () => {
          hasPlaybackStarted = true;
          isUserPaused = false;
        }, true);

        media.dataset.bfqPauseGuardBound = '1';
      };

      const trackCurrentMedia = () => {
        try {
          const media = unsafeWindow.player?.mediaElement?.();
          if (media && media !== currentMedia) {
            currentMedia = media;
            hasPlaybackStarted = !media.paused && !media.ended;
            isUserPaused = false;
            bindMediaGuard(media);
          }
        } catch (e) {}
      };

      trackCurrentMedia();
      setInterval(trackCurrentMedia, 500);

      if (player && typeof player.mediaElement === 'function') {
        const originMediaElementGetter = player.mediaElement.bind(player);
        player.mediaElement = function () {
          const media = originMediaElementGetter();
          bindMediaGuard(media);
          if (media && media !== currentMedia) {
            currentMedia = media;
            hasPlaybackStarted = !media.paused && !media.ended;
            isUserPaused = false;
          } else {
            currentMedia = media || currentMedia;
          }
          return media;
        };
      }

      setInterval(() => {
        const media = currentMedia;
        if (!media || !hasPlaybackStarted || media.ended || document.hidden || allowInternalPause || isUserPaused) return;
        if (media.paused) {
          media.play().catch(() => {});
        }
      }, CONFIG.AUTO_RESUME_INTERVAL);

      unsafeWindow.__BFQ_ALLOW_INTERNAL_PAUSE__ = () => {
        allowInternalPause = true;
        setTimeout(() => {
          allowInternalPause = false;
        }, CONFIG.CLICK_TIMEOUT);
      };
    }).catch(err => {
      console.warn('[Bilibili脚本] 播放器初始化失败:', err);
    });
  })();

  /* ========== 客户端兜底（关闭协议级解锁时启用）========== */
  const installClientArchFallback = () => {
    const originDef = Object.defineProperty;
    let definePropertyCallCount = 0;
    Object.defineProperty = function (obj, prop, desc) {
      if (prop === 'isViewToday' || prop === 'isVideoAble') {
        let isLikelyPlayerState = true;
        try {
          if (obj === globalThis || obj === unsafeWindow || obj === window) isLikelyPlayerState = false;
          else if (obj instanceof Element) isLikelyPlayerState = false;
          else if (desc && 'value' in desc && !('get' in desc) && !('set' in desc)) isLikelyPlayerState = false;
          else if (desc && typeof desc.get === 'function') {
            const getterText = String(desc.get);
            if (!/play|trial|view|able|quality|qn/i.test(getterText)) {
              isLikelyPlayerState = false;
            }
          }
        } catch (e) { isLikelyPlayerState = false; }

        definePropertyCallCount++;
        if (isLikelyPlayerState) {
          desc = { get: () => true, enumerable: false, configurable: true };
        }
      }
      return originDef.call(this, obj, prop, desc);
    };

    /* 3-2 试用倒计时延长到 3 亿秒 */
    const originSetTimeout = unsafeWindow.setTimeout;
    const originSetInterval = unsafeWindow.setInterval;
    const shouldExtendTrialTimer = (fn, delayNum) => {
      if (delayNum !== 30000 && delayNum !== 60000 && delayNum !== 62000 && delayNum !== 90000) return false;
      const fnText = typeof fn === 'function' ? String(fn) : String(fn || '');
      return (
        fnText.includes('试看') ||
        fnText.includes('trial') ||
        fnText.includes('isViewToday') ||
        fnText.includes('isVideoAble') ||
        fnText.includes('absolutePlayTime')
      );
    };

    unsafeWindow.setTimeout = (fn, delay) => {
      const delayNum = Number(delay);
      if (shouldExtendTrialTimer(fn, delayNum)) {
        delay = CONFIG.TRIAL_TIMEOUT;
      }
      return originSetTimeout.call(unsafeWindow, fn, delay);
    };
    unsafeWindow.setInterval = (fn, delay) => {
      const delayNum = Number(delay);
      if (shouldExtendTrialTimer(fn, delayNum)) {
        delay = CONFIG.TRIAL_TIMEOUT;
      }
      return originSetInterval.call(unsafeWindow, fn, delay);
    };

    /* 3-3 点击试用按钮 + 画质切换 + 兜底拔高 */
    const QUALITY_MAP = { 1080: 80, 720: 64, 480: 32, 360: 16 };
    const TARGET_QUALITY = () => QUALITY_MAP[options.preferQuality] || 80;

    let qualityDropWatcherStarted = false;
    let reUnlockTimerId = null;

    const requestTargetQuality = (reason = 'manual') => {
      const target = TARGET_QUALITY();
      try {
        if (unsafeWindow.player?.getSupportedQualityList?.()?.includes(target)) {
          Promise.resolve(unsafeWindow.player.requestQuality(target)).catch((err) => {
            if (!String(err?.message || err).includes('Same as current quality')) {
              console.warn('[Bilibili脚本] 画质切换失败:', err, '来源:', reason);
            }
          });
          return true;
        }
      } catch (err) {
        console.warn('[Bilibili脚本] 画质切换失败:', err, '来源:', reason);
      }
      return false;
    };

    // 试用后再补一次画质请求
    const scheduleReUnlockAfterTrial = () => {
      requestTargetQuality('reunlock-immediate');
      startQualityDropWatcher();
      if (reUnlockTimerId) clearTimeout(reUnlockTimerId);
      reUnlockTimerId = originSetTimeout.call(unsafeWindow, () => {
        requestTargetQuality('reunlock-after-trial');
        startQualityDropWatcher();
      }, CONFIG.RE_UNLOCK_DELAY);
    };

    // 画质掉回低时自动拔高
    const startQualityDropWatcher = () => {
      if (qualityDropWatcherStarted) return;
      qualityDropWatcherStarted = true;

      originSetInterval.call(unsafeWindow, () => {
        try {
          const cur = unsafeWindow.player?.getCurrentQuality?.();
          const supported = unsafeWindow.player?.getSupportedQualityList?.();
          const target = TARGET_QUALITY();
          if (cur != null && supported?.includes(target) && cur !== target) {
            requestTargetQuality('drop-watch');
          }
        } catch (err) {}
      }, CONFIG.RE_UNLOCK_INTERVAL);

      try {
        const player = unsafeWindow.player;
        const media = player?.mediaElement?.();
        if (media && typeof media.addEventListener === 'function') {
          media.addEventListener('media_qualitychange' in media ? 'media_qualitychange' : 'qualitychange', () => {
            try {
              const cur = player?.getCurrentQuality?.();
              const target = TARGET_QUALITY();
              if (cur != null && cur !== target) requestTargetQuality('qualitychange-event');
            } catch (err) {}
          });
        }
      } catch (err) {}
    };

    // 使用 MutationObserver 而不是 setInterval 来监听按钮出现，性能更好
    const observeTrialButton = () => {
      const observer = new MutationObserver(() => {
        const btn = document.querySelector('.bpx-player-toast-confirm-login');
        if (!btn) return;
        if (btn.dataset.clicked) return;
        btn.dataset.clicked = 'true';

        setTimeout(() => {
          btn.click();
          scheduleReUnlockAfterTrial();
          startQualityDropWatcher();

          if (options.isWaitUntilHighQualityLoaded && unsafeWindow.player?.mediaElement) {
            const media = unsafeWindow.player.mediaElement();
            const wasPlaying = !media.paused;
            if (wasPlaying) {
              unsafeWindow.__BFQ_ALLOW_INTERNAL_PAUSE__?.();
              media.pause();
            }
            const checkToast = setInterval(() => {
              const toastTexts = document.querySelectorAll('.bpx-player-toast-text');
              if ([...toastTexts].some(el => el.textContent.endsWith('试用中'))) {
                if (wasPlaying) media.play().catch(() => {});
                clearInterval(checkToast);
                requestTargetQuality('trial-toast-detected');
              }
            }, CONFIG.TOAST_CHECK_INTERVAL);
            setTimeout(() => clearInterval(checkToast), 10000);
          }

          setTimeout(() => requestTargetQuality('trial-button'), CONFIG.QUALITY_SWITCH_DELAY);
          setTimeout(() => delete btn.dataset.clicked, 2000);
        }, CONFIG.BUTTON_CLICK_DELAY);
      });

      observer.observe(document.body, { childList: true, subtree: true });
    };

    if (document.body) observeTrialButton();
    else document.addEventListener('DOMContentLoaded', observeTrialButton);
  };

  if (!options.enableProtocolUnlock) {
    installClientArchFallback();
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
        <span class="qp-label">分页加载评论</span>
        <span class="switch" data-key="enableReplyPagination" data-status="${options.enableReplyPagination ? 'on' : 'off'}"></span>
      </div>
      <div class="qp-section-divider"></div>
      <div class="qp-title">📺 直播设置</div>
      <div class="qp-row">
        <span class="qp-label">直播分区连续加载</span>
        <span class="switch" data-key="enableLiveAreaUnlock" data-status="${options.enableLiveAreaUnlock ? 'on' : 'off'}"></span>
      </div>
      <div class="qp-section-divider"></div>
      <div class="qp-title">🛡️ 解锁模式</div>
      <div class="qp-row">
        <span class="qp-label">协议级解锁（推荐·无副作用）</span>
        <span class="switch" data-key="enableProtocolUnlock" data-status="${options.enableProtocolUnlock ? 'on' : 'off'}"></span>
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

  let entryAdded = false;
  const addSettingsEntry = () => {
    if (entryAdded) return;
    
    const others = document.querySelector('.bpx-player-ctrl-setting-others-content');
    if (!others) return;
    
    const entry = document.createElement('div');
    entry.textContent = '🎬 脚本设置 >';
    entry.style.cssText = 'cursor:pointer;height:20px;line-height:20px;padding:4px 8px;transition:background .2s';
    entry.onmouseenter = () => { entry.style.background = 'rgba(0,174,236,0.1)'; };
    entry.onmouseleave = () => { entry.style.background = ''; };
    entry.onclick = () => { panel.style.display = 'flex'; };
    others.appendChild(entry);
    entryAdded = true;
  };
  
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

        if (key === 'isWaitUntilHighQualityLoaded') {
          options.isWaitUntilHighQualityLoaded = isOn;
        } else if (key === 'enableCommentUnlock') {
          options.enableCommentUnlock = isOn;
        } else if (key === 'enableReplyPagination') {
          options.enableReplyPagination = isOn;
        } else if (key === 'enableLiveAreaUnlock') {
          options.enableLiveAreaUnlock = isOn;
        } else if (key === 'enableProtocolUnlock') {
          options.enableProtocolUnlock = isOn;
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
