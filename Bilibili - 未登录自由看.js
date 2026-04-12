// ==UserScript==
// @name         Bilibili - 未登录自由看
// @namespace    https://bilibili.com/
// @version      3.4
// @description  v3.4：未登录无限试用最高画质 + 拦截miniLogin加载 + 保护顶部工具栏/搜索栏 + 真正可用的评论解锁
// @license      GPL-3.0
// @author       zhikanyeye
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/list/*
// @match        https://www.bilibili.com/festival/*
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

  /* ========== 0. 公共配置 ========== */
  const CONFIG = {
    QUALITY_CHECK_INTERVAL: 1500,
    PLAYER_CHECK_INTERVAL: 300,
    QUALITY_SWITCH_DELAY: 5000,
    BUTTON_CLICK_DELAY: 800,
    TOAST_CHECK_INTERVAL: 100,
    CLICK_TIMEOUT: 800,
    AUTO_RESUME_INTERVAL: 1200,
    TRIAL_TIMEOUT: 3e8
  };

  const options = {
    preferQuality: GM_getValue('preferQuality', '1080'),
    isWaitUntilHighQualityLoaded: GM_getValue('isWaitUntilHighQualityLoaded', false),
    enableCommentUnlock: GM_getValue('enableCommentUnlock', true),
    enableReplyPagination: GM_getValue('enableReplyPagination', false)
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

  /* ========== 评论模块 ========== */
  let commentOid, commentType, commentCreatorID;
  let commentCurrentSortType = 2;
  let commentIsLoading = false;
  let commentIsEnd = false;
  let commentNextOffset = '';
  let commentPageOffsets = [''];
  let commentCurrentPage = 0;
  const COMMENT_SORT = { LATEST: 0, HOT: 2 };

  async function getWbiQueryString(params) {
    const { img_url, sub_url } = await fetch('https://api.bilibili.com/x/web-interface/nav')
      .then(res => res.json())
      .then(json => json.data.wbi_img);
    const imgKey = img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.'));
    const subKey = sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'));
    const originKey = imgKey + subKey;
    const mixinKeyEncryptTable = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
    const mixinKey = mixinKeyEncryptTable.map(n => originKey[n]).join('').slice(0, 32);
    const query = Object.keys(params).sort().map(key => {
      const value = params[key].toString().replace(/[!'()*]/g, '');
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
      const res = await fetch(
        `https://api.bilibili.com/x/v2/reply/reply?oid=${commentOid}&root=${rootReplyID}&pn=${pageNum}&ps=10&type=${commentType}`
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
    const qs = await getWbiQueryString({ oid: commentOid, type: commentType, mode, pagination_str: paginationStr, wts });
    const res = await fetch(`https://api.bilibili.com/x/v2/reply/wbi/main?${qs}`);
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
    if (pageInfo) pageInfo.textContent = `第 ${commentCurrentPage + 1} 页`;
    if (prevBtn) prevBtn.disabled = commentCurrentPage === 0;
    if (nextBtn) nextBtn.disabled = commentIsEnd;
  }

  async function initCommentModule() {
    if (!options.enableCommentUnlock) return;

    commentCurrentSortType = COMMENT_SORT.HOT;
    commentIsLoading = false;
    commentIsEnd = false;
    commentNextOffset = '';
    commentPageOffsets = [''];
    commentCurrentPage = 0;

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
`);

    let commentSection;
    try {
      commentSection = await waitForElement('bili-comments, .comment-container, #commentapp', 20000);
    } catch(e) {
      console.warn('[评论模块] 未找到评论容器:', e.message);
      return;
    }

    try {
      const state = unsafeWindow.__INITIAL_STATE__;
      commentOid = String(state?.aid || state?.videoData?.aid || '');
      if (!commentOid || commentOid === 'undefined') {
        const bvMatch = location.pathname.match(/BV[\w]+/i);
        if (bvMatch) commentOid = b2a(bvMatch[0]);
      }
      commentType = 1;
      commentCreatorID = state?.upData?.mid || state?.videoData?.owner?.mid || 0;
    } catch(e) {
      console.error('[评论模块] 获取视频信息失败:', e);
      return;
    }

    if (!commentOid) {
      console.warn('[评论模块] 无法获取视频AID');
      return;
    }

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
        ? `<div id="bili-comment-pagination"><button id="bili-prev-page" disabled>上一页</button><span id="bili-page-info">第 1 页</span><button id="bili-next-page">下一页</button></div>`
        : `<div id="bili-scroll-anchor"></div>`}`;

    commentSection.parentNode.insertBefore(customEl, commentSection.nextSibling);
    commentSection.style.display = 'none';

    // 守护自定义评论容器，防止被官方组件重新挂载时覆盖
    const commentGuard = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // 如果自定义容器被移出 DOM，重新插入
        if (!document.getElementById('bili-custom-comments')) {
          console.log('[评论模块] 检测到自定义评论容器被移除，重新插入...');
          const commentSectionNow = document.querySelector('bili-comments, .comment-container, #commentapp');
          if (commentSectionNow && commentSectionNow.parentNode) {
            // 使用 insertBefore 而不是 appendChild，保持原有位置关系
            commentSectionNow.parentNode.insertBefore(customEl, commentSectionNow.nextSibling);
            commentSectionNow.style.display = 'none';
          }
        }
        // 如果有新的 bili-comments 被插入，立刻隐藏它
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && (node.tagName === 'BILI-COMMENTS' || node.tagName === 'BILI-COMMENT-CONTAINER')) {
            node.style.display = 'none';
            console.log('[评论模块] 守护：隐藏新出现的 bili-comments');
          }
        }
      }
    });
    commentGuard.observe(document.body, { childList: true, subtree: true });

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

  /* ========== 初始化评论模块（无论是否登录都执行） ========== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCommentModule);
  } else {
    initCommentModule();
  }

  /* ========== 1. 如果已登录直接退出 ========== */
  if (document.cookie.includes('DedeUserID')) return;

  /* ========== 2. 阻止登录弹窗 / 自动暂停 ========== */

  /* 2-0 从源头拦截 miniLogin.js 加载（参考 DD1969 方案） */
  const originAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function (child) {
    if (child && child.tagName === 'SCRIPT' && child.src && child.src.includes('miniLogin')) {
      console.log('[Bilibili脚本] 已拦截 miniLogin.js 加载');
      return child;                   // 不执行 appendChild，返回原节点即可
    }
    return originAppendChild.call(this, child);
  };

  /* 2-1 登录遮罩 / 弹窗选择器 */
  // —— 全屏遮罩 / 登录弹窗：直接挂在 body 上，覆盖整个页面 ——
  const GLOBAL_LOGIN_SELECTOR = [
    '.bili-mini-mask',
    '.bili-mini-login',
    '.mini-login',
    '.mini-login-mask',
    '.bili-login-v2-mask',
    '.bili-login-v2-container'
  ].join(',');

  // —— 播放器内部登录提示 ——
  const PLAYER_LOGIN_SELECTOR = [
    '.passport-login-tip-container',
    '.login-tip'
  ].join(',');

  /* 2-2 CSS 保护顶部导航栏，确保工具栏/搜索栏始终可见可交互 */
  GM_addStyle(`
    /* 顶部导航区域始终保持最高层级 */
    .bili-header,
    #bili-header-container,
    .bili-header__bar,
    #biliMainHeader,
    .fixed-header {
      position: relative !important;
      z-index: 100001 !important;
      pointer-events: auto !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    /* 全局登录遮罩直接干掉 */
    body > .bili-mini-mask,
    body > .bili-mini-login,
    body > .mini-login,
    body > .mini-login-mask,
    body > .bili-login-v2-mask,
    body > .bili-login-v2-container {
      display: none !important;
      pointer-events: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }
  `);

  /* 2-3 DOM 级别隐藏：处理动态插入的登录弹窗 */
  const hideElement = (el) => {
    if (!el || el.nodeType !== 1) return;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('opacity', '0', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
  };

  const hideLoginLayersInNode = (node) => {
    if (!node || node.nodeType !== 1) return;

    // 全局级登录遮罩 / 弹窗 —— 无论在哪都隐藏
    if (node.matches?.(GLOBAL_LOGIN_SELECTOR)) hideElement(node);
    node.querySelectorAll?.(GLOBAL_LOGIN_SELECTOR)?.forEach(hideElement);

    // 播放器内部登录提示 —— 仅隐藏播放器区域内的
    const isInPlayer = (el) => !!el.closest(
      '.bpx-player-container, .bpx-player-video-area, .bpx-player-video-wrap, #bilibili-player'
    );
    if (node.matches?.(PLAYER_LOGIN_SELECTOR) && isInPlayer(node)) hideElement(node);
    node.querySelectorAll?.(PLAYER_LOGIN_SELECTOR)?.forEach((el) => {
      if (isInPlayer(el)) hideElement(el);
    });
  };

  // 初始扫描
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
          if (!canPauseNow()) return;
          return originPause(...arguments);
        };
      }

      const bindMediaGuard = (media) => {
        if (!media || media.dataset.bfqPauseGuardBound) return;
        const originMediaPause = media.pause.bind(media);

        media.pause = function () {
          if (!canPauseNow()) return;
          return originMediaPause();
        };

        media.addEventListener('pause', () => {
          if (allowInternalPause) return;

          if (Date.now() - lastTrustedActionTime <= CONFIG.CLICK_TIMEOUT) {
            isUserPaused = true;
            return;
          }

          isUserPaused = false;
          Promise.resolve().then(() => media.play()).catch(() => {});
        }, true);

        media.addEventListener('play', () => {
          isUserPaused = false;
        }, true);

        media.dataset.bfqPauseGuardBound = '1';
      };

      const trackCurrentMedia = () => {
        try {
          const media = unsafeWindow.player?.mediaElement?.();
          if (media && media !== currentMedia) {
            currentMedia = media;
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
          currentMedia = media || currentMedia;
          return media;
        };
      }

      setInterval(() => {
        const media = currentMedia;
        if (!media || media.ended || document.hidden || allowInternalPause || isUserPaused) return;
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

  /* ========== 3. 无限试用核心 ========== */
  /* 3-1 放行试用标识 */
  const originDef = Object.defineProperty;
  Object.defineProperty = function (obj, prop, desc) {
    if (prop === 'isViewToday' || prop === 'isVideoAble') {
      desc = { get: () => true, enumerable: false, configurable: true };
    }
    return originDef.call(this, obj, prop, desc);
  };

  /* 3-2 把试用倒计时延长到 3 亿秒 */
  const originSetTimeout = unsafeWindow.setTimeout;
  const originSetInterval = unsafeWindow.setInterval;
  const shouldExtendTrialTimer = (fn, delayNum) => {
    if (delayNum === 30000) return true;
    if (delayNum !== 60000 && delayNum !== 62000 && delayNum !== 90000) return false;
    const fnText = typeof fn === 'function' ? String(fn) : String(fn || '');
    return (
      fnText.includes('miniLogin') ||
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
          if (wasPlaying) {
            unsafeWindow.__BFQ_ALLOW_INTERNAL_PAUSE__?.();
            media.pause();
          }

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
        <span class="qp-label">分页加载评论</span>
        <span class="switch" data-key="enableReplyPagination" data-status="${options.enableReplyPagination ? 'on' : 'off'}"></span>
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
        } else if (key === 'enableReplyPagination') {
          options.enableReplyPagination = isOn;
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
