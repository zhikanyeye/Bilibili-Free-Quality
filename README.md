# Bilibili - 未登录自由看

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Version: alpha.24](https://img.shields.io/badge/version-alpha.24-orange.svg)](#更新日志)
[![Greasy Fork](https://img.shields.io/badge/Greasy%20Fork-安装脚本-orange)](https://greasyfork.org/zh-CN/scripts/542804-bilibili-%E6%9C%AA%E7%99%BB%E5%BD%95%E8%87%AA%E7%94%B1%E7%9C%8B)
[![jsDelivr](https://img.shields.io/badge/jsDelivr-CDN-blue.svg)](https://cdn.jsdelivr.net/gh/zhikanyeye/Bilibili-Free-Quality@37f327759b4590f38493d0d75f789b3e4e12e309/Bilibili%20-%20%E6%9C%AA%E7%99%BB%E5%BD%95%E8%87%AA%E7%94%B1%E7%9C%8B.js)

当前版本：`4.0.0-alpha.24`

## 📌 简介

**「Bilibili - 未登录自由看」** 让未登录用户也能轻松观看高画质B站视频，并补齐评论、动态、专栏与直播分区在未登录状态下的常见限制。

**v4.0 起** 采用 **协议级 + 客户端兼容** 双模式架构，默认走协议级解锁、保留旧客户端架构作为一键回退兜底：

| 模式 | 实现方式 | 副作用 |
|---|---|---|
| **协议级解锁**（v4 默认）| 伪造 `DedeUserID` cookie + 清空 `__playinfo__` SSR + 重签 WBI `playurl`（`try_look=1` + `qn=80`）+ 安全改写 `player/wbi/v2`，**服务端直接出 1080P 全片流**；SPA 切视频等待 state 对齐后重签 | 无顶栏/搜索栏消失、无 30 秒截断 |
| **客户端兼容**（一键回退）| 延长试用倒计时 + 自动点击试用按钮 + 画质兜底拔高 + 窄化 `Object.defineProperty` 劫持 | 沿用 v3.5.6 修复，仅作为兜底 |

您是否也遇到这些烦恼？
- 未登录只能看 360P？
- 一天只有一次 30 秒的高画质试用？
- 视频看一半突然弹出「请先登录」？
- 没点暂停却被脚本强行暂停？
- 直播分区下拉到后面只剩「正在玩命加载ing」？
- 动态、专栏、直播间下方动态的评论打不开或显示不全？

### 核心功能

- ✅ **协议级 1080P 全片流**：伪造登录态 cookie + WBI 重签 playurl，服务端直接返回 1080P，无试用倒计时截断
- ✅ **客户端兼容兜底**：关闭协议级解锁即回退旧的试用倒计时延长 + 按钮自动点击 + 画质兜底拔高三重防护
- ✅ **彻底屏蔽**登录弹窗与自动暂停
- ✅ **真正可用的评论解锁**：自调 B站 API（含 WBI 签名），绕开官方评论组件
- ✅ **视频 / 动态 / 专栏评论**：支持未登录查看；直播间与空间动态的评论入口会跳转到动态详情页查看
- ✅ **分页 / 无限滚动**两种评论加载模式可切换，分页模式支持输入页码跳转
- ✅ **直播分区连续加载**：未登录下拉分区列表时自动兜底旧接口，避免一直卡在加载中
- ✅ **尊重自动播放设置**：防暂停逻辑只在已开始播放后恢复，不再强制初始自动播放
- ✅ **全登录态倍速播放**：登录与未登录均在播放器原生控制栏显示倍速按钮，支持预设和自定义倍速；全屏时自动隐藏
- ✅ **全屏左右跳转**：半屏、网页全屏和浏览器全屏点击视频区均显示左右小图标，默认后退 10 秒、前进 15 秒
- ✅ **长按临时倍速**：按住前进按钮 2 秒进入自定义临时倍速，松手恢复长按前的实际倍速
- ✅ **可视化面板**，一键切换 1080P / 720P / 480P / 360P，并可切换解锁模式
- ✅ **Edge / Chrome / Firefox** 全平台兼容
- ✅ **登录态隔离**：登录后仅保留通用倍速功能，未登录解锁、评论重绘和防登录逻辑自动停用

## 🖼️ 功能演示

![功能演示](https://img.flexxi.me/file/3OD0iMtk.png)

## ⚙️ 安装与使用

### 安装地址

| 渠道 | 地址 | 用途 |
|---|---|---|
| Greasy Fork | [安装稳定发布版](https://greasyfork.org/zh-CN/scripts/542804-bilibili-%E6%9C%AA%E7%99%BB%E5%BD%95%E8%87%AA%E7%94%B1%E7%9C%8B) | 推荐给普通用户，使用平台更新机制 |
| jsDelivr CDN | [安装 v4.0.0-alpha.24](https://cdn.jsdelivr.net/gh/zhikanyeye/Bilibili-Free-Quality@37f327759b4590f38493d0d75f789b3e4e12e309/Bilibili%20-%20%E6%9C%AA%E7%99%BB%E5%BD%95%E8%87%AA%E7%94%B1%E7%9C%8B.js) | 固定提交地址，包含协议解锁加固与前进按钮长按倍速 |
| GitHub | [查看源码](https://github.com/zhikanyeye/Bilibili-Free-Quality) | 查看源码、提交记录和问题反馈 |

jsDelivr 地址格式：

```text
https://cdn.jsdelivr.net/gh/user/repo@version/file
```

当前脚本版本为 `v4.0.0-alpha.24`，CDN 使用 `@37f327759b4590f38493d0d75f789b3e4e12e309` 固定提交地址提供协议解锁加固与前进按钮长按倍速版本。

| 步骤 | 操作 |
|---|---|
| 1 | 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/) |
| 2 | 从上方 Greasy Fork 或 jsDelivr CDN 地址安装脚本 |
| 3 | 打开支持的 B 站页面（建议未登录测试） |
| 4 | 视频页播放器设置 → **脚本设置** 可调画质、评论和直播分区选项；右侧控制栏可调倍速 |

## 🛠️ 自定义设置

- **首选画质**：1080p / 720p / 480p / 360p
- **🛡️ 解锁模式**：协议级解锁（推荐·无副作用，默认）/ 客户端兼容（关闭即回退旧架构兜底）
- **切换时暂停**：开 / 关（防止音画不同步）
- **解锁全部评论**：开 / 关（视频、动态、专栏页自调 API 渲染评论）
- **分页加载评论**：开 / 关（开启后支持上一页、下一页和输入页码跳转；关闭则使用无限滚动模式）
- **直播分区连续加载**：开 / 关（未登录下拉分区列表时启用接口兜底）
- **倍速播放**：0.5 / 0.75 / 1 / 1.25 / 1.5 / 2 / 2.5 / 3 倍预设，支持 0.07-16 自定义输入
- **倍速强制**：开 / 关；已选择倍速通过 `GM_setValue` 持久保存，SPA 切视频后自动恢复
- **左右跳转**：后退默认 10 秒、前进默认 15 秒，可在倍速弹层中分别设置 1-300 秒
- **长按临时倍速**：默认 2 倍，可在倍速弹层中设置 1-16 倍；长按前进按钮 2 秒生效，松手恢复原倍速
- **登录后行为**：保留倍速控制器，其余未登录专属功能自动停用

## 📊 脚本信息

- **适用页面**  
  `https://www.bilibili.com/video/*`  
  `https://www.bilibili.com/list/*`  
  `https://www.bilibili.com/festival/*`  
  `https://www.bilibili.com/opus/*`  
  `https://www.bilibili.com/read/cv*`  
  `https://t.bilibili.com/*`  
  `https://space.bilibili.com/*`  
  `https://live.bilibili.com/*`

- **运行时机**  
  `document-start`（越早越好）

- **体积**  
  约 130 KB（包含评论渲染、WBI 签名、直播分区兜底、倍速控制与设置面板）

## 💡 工作原理

本脚本采用 **协议级 + 客户端兼容** 双模式架构：

### 协议级解锁（v4 默认，推荐）

1. **伪造登录态 cookie**：向 `.bilibili.com` 注入 `DedeUserID`，让服务端在所有后续 API 请求中按登录用户响应
2. **清空 `__playinfo__` SSR**：赋 `null` + 注入 `window.playurlSSRData={}`，强制播放器走 fetch/XHR 链拿 playurl（拦截链才能命中）
3. **拦截 `/x/player/wbi/playurl`**：删除原 `w_rid`/`wts`，重设 `qn=80(1080P)` + `try_look=1`，用本地 WBI 算法重签；fetch 与 XHR 双链拦截，try_look 失败自动去 try_look 重试一次
4. **拦截 `/x/player/wbi/v2`**：改写 `login_mid`/`level_info`/`need_login_subtitle`，让播放器 UI 按登录态渲染
5. **回写 `__playinfo__`**：把拦截到的高清 playurl 响应赋回全局，播放器初值即读到 1080P 数据

### 客户端兼容模式（兜底，关闭协议级解锁时启用）

1. 拦截和修改B站的API请求与响应
2. 阻止登录提示弹窗的DOM元素加载
3. 覆盖原生视频控制函数，防止平台自动暂停，同时保留用户主动暂停和站内自动播放设置
4. 自动触发高清画质试用，并移除时间限制
5. 试用结束后 N 秒主动补一次画质请求（兜底路径 C-1）+ 周期性监听画质掉落（兜底路径 C-2）

### 公共模块

1. 直接调用 B站评论 API（`/x/v2/reply/wbi/main`），实现完整 WBI 签名，绕开官方评论组件
2. 动态详情通过 `x/polymer/web-dynamic/v1/detail` 获取评论目标；专栏使用专栏评论类型直接加载
3. 自建评论渲染逻辑，支持无限滚动、分页、页码跳转与子评论展开
4. 直播分区接口异常时，将 `/xlive/web-interface/v1/second/getList` 兜底到 `/room/v3/area/getRoomList` 并转换数据结构
5. 倍速控制器在登录与未登录状态均安装，等待播放器稳定后接入原生右侧控制栏；SPA 重建播放器时自动重挂载

## 🔄 更新日志

### v4.0.0-alpha.24 (2026-07-20)
- **前进按钮复用**：短按前进按钮继续按配置跳转，长按 2 秒进入临时倍速，保持播放器界面轻量
- **原生交互恢复**：播放器画面不再监听长按或屏蔽系统菜单，保留 B 站内置复制视频地址等操作
- **手势状态加固**：移动取消、暂停状态和松手场景统一释放 Pointer Capture，避免后续按钮手势受残留状态影响

### v4.0.0-alpha.23 (2026-07-20)
- **倍速开关修复**：关闭“启用倍速强制”时仅恢复当前媒体为 1 倍速，保留用户已保存的倍速配置，重新开启后可继续使用原倍速

### v4.0.0-alpha.22 (2026-07-20)
- **WBI 兜底修复**：`/x/web-interface/nav` 返回异常结构时直接降级并抛出可控错误，避免评论签名和 playurl 重签链路被 `TypeError` 打断
- **评论 SPA 轮询加固**：页面切换检测加入串行闸门，避免网络慢时重复启动评论目标解析和重载流程

### v4.0.0-alpha.21 (2026-07-20)
- **长按挂载修复**：播放器画面加载后立即绑定长按手势，控制栏隐藏期间也能正常触发
- **指针事件加固**：长按期间捕获指针并在结束时释放，提升鼠标与触摸设备的松手恢复可靠性
- **触摸兼容**：禁用播放器画面的系统长按菜单，避免触摸端长按被浏览器提前取消

### v4.0.0-alpha.20 (2026-07-20)
- **全屏跳转**：移除 alpha.19 的全屏隐藏限制，半屏、网页全屏和浏览器全屏均显示前进/后退按钮
- **长按临时倍速**：按住视频画面 2 秒后切换到临时倍速，松手恢复长按前的实际倍速
- **自定义临时倍速**：倍速弹层新增 1-16 倍设置，默认 2 倍并持久保存
- **交互保护**：手指或鼠标移动超过 12px 取消长按；松手、触摸取消、窗口失焦和页面隐藏均恢复原倍速
- **点击保护**：临时倍速生效后松手会抑制随后一次播放器点击，避免意外暂停

### v4.0.0-alpha.19 (2026-07-19)
- **左右跳转**：点击视频区后显示后退与前进图标，默认后退 10 秒、前进 15 秒
- **自定义时间**：倍速弹层新增左右跳转秒数设置，范围 1-300 秒并通过 `GM_setValue` 持久保存
- **低干扰交互**：仅点击图标执行跳转，按钮显示 2 秒后自动淡出，标准全屏和网页全屏自动隐藏
- **SPA 兼容**：播放器视频层重建后自动重新挂载跳转按钮

### v4.0.0-alpha.18 (2026-07-19)
- **原生控制栏**：倍速按钮接入播放器右侧控制栏，跟随宿主布局和控制栏显隐
- **稳定挂载**：等待页面可见、视频元数据和控制栏尺寸就绪后再挂载，减少后台标签页错位
- **SPA 恢复**：播放器或 video 节点被替换后自动重挂载并恢复已保存倍速
- **生命周期参考**：参考 `hanydd/BilibiliSponsorBlock` 的播放器就绪与重挂载设计，保持当前 Userscript 轻量结构
- **README/CDN**：补齐当前功能、登录后行为和倍速设置说明；新增 jsDelivr 固定提交安装地址，版本徽章缩短为 `alpha.18`

### v4.0.0-alpha.17 (2026-07-19)
- ▶️ **倍速播放**：将倍速控制器移到登录态退出逻辑之前，登录与未登录均可使用悬浮倍速按钮
- 📌 **版本展示**：README 增加纯文本当前版本，CDN 徽章异常时仍可直接看到版本号

### v4.0.0-alpha.16 (2026-07-19)
- 🎬 **倍速按钮**：进入播放器全屏时自动隐藏悬浮按钮并关闭倍速弹层，退出全屏后自动恢复

### v4.0.0-alpha.15 (2026-07-19)
- 🐛 **修复**：SPA 切推荐视频卡在 360P，必须手动刷新才出 1080P
  - 等待 `__INITIAL_STATE__` 与 URL BV 对齐后再主动 WBI 重签 playurl，避免用旧 aid/cid 抢跑
  - 安全改写 `/x/player/wbi/v2` 登录态字段（`login_mid`/`need_login_subtitle`），XHR 只改 `responseText` 不重建 body
  - `normalizePlayurlQuality` 清除 `need_login`/`need_vip`，对齐 `support_formats`，菜单可点 1080P
  - 同步 `localStorage.bpx_player_profile` 默认画质；高清流写入后尝试 `updatePlayurl/setQuality`
  - 掉落监听在持续低档时节流重签 playurl
- 📚 **README**：版本 badge → alpha.15

### v4.0.0-alpha.14 (2026-07-19)
- 🐛 **修复**：刷新后默认静音——防暂停自动 `play()` 触发浏览器自动播放静音策略
  - 记录用户音量意图；`play/playing/loadedmetadata` 后恢复非静音
  - 用户手势（点击/按键）时强制取消脚本触发的静音
  - 自动恢复播放改为 `safePlay`，避免反复把音量打到 0
- 📚 **README**：版本 badge → alpha.14

### v4.0.0-alpha.13 (2026-07-19)
- ✨ **新增**：播放器底部悬浮倍速按钮，支持 0.5/0.75/1/1.25/1.5/2/2.5/3 预设 + 0.07-16 自定义输入
- 🛡️ **强制生效**：借鉴 polywock/globalSpeed GhostMode 机制——原型级 `HTMLMediaElement.prototype.playbackRate` setter 拦截 + 校验回写，绕过 B 站对 `playbackRate` 的自定义 setter 限制
- 🔄 **持久守护**：周期间断 `setInterval` + MutationObserver + ratechange 事件三重保护，B 站 SPA 切集把倍速 reset 回 1 时自动校正
- ⚙️ **可关闭**：弹窗内「启用倍速强制」开关，默认开；与已装的 globalSpeed 共存（幂等跳过）
- 💾 **记忆**：倍速与自定义值通过 `GM_setValue` 持久化
- 📚 **README**：版本 badge → alpha.13

### v4.0.0-alpha.12 (2026-07-19)
- 🐛 **修复**：评论重绘误伤顶栏——学习 DD1969（greasyfork/473498）：只替换评论容器内部，删除全站 `display:none` 守护与宽选择器 hide
- 🛡️ **安全挂载**：`isSafeCommentHost` 禁止替换 `#app`/顶栏/body；动态页仅局部拦截 `BILI-COMMENTS` appendChild
- 📚 **README**：版本 badge → alpha.12

### v4.0.0-alpha.11 (2026-07-19)
- 🛡️ **安全**：移除 GreasyFork 远程 `@require` 样式依赖，避免安装/更新时自动下载第三方脚本
- 🛡️ **安全**：评论渲染对 mid/rpid 做数字校验，头像/表情 URL 仅允许 bilibili CDN
- 🐛 **修复**：SPA 切视频（推荐栏）默认 360P——`history` + `aid/cid` 双检测，清 playinfo 后多轮 `requestQuality` 强制目标档
- 🐛 **修复**：媒体 `play/loadeddata` 事件与画质掉落监听补强，减少需手动刷新才出 1080P
- 📚 **README**：版本 badge → alpha.11

### v4.0.0-alpha.10 (2026-07-19)
- 🔄 **评论**：取消协议级 reply 劫持，统一回到纯重绘评论（WBI 自调 API + 隐藏官方组件 + 全站守护）
- 🐛 **修复**：首屏立刻加载第一页评论（此前无限滚动模式需滚到底才请求，看起来像“没评论”）
- 🐛 **修复**：画质未达目标档（480/360）时强制重试；normalize quality；协议级也装试用按钮 + 掉落监听 + requestQuality
- 📚 **README**：版本 badge → alpha.10

### v4.0.0-alpha.9 (2026-07-19)
- 🐛 **修复**：视频页评论区不可见——恢复安全自绘评论（协议级 + 自绘并存），挂载仍用 isSafeCommentRoot 保护顶栏
- 🛡️ **增强**：登录弹窗屏蔽选择器加宽（mask/panel/passport/模糊 class），仍避开顶栏登录入口
- 🐛 **修复**：详情页点推荐切视频默认 360P——SPA 切换后清 playinfo + 多次 requestQuality 强制目标画质
- 📚 **README**：版本 badge → alpha.9

### v4.0.0-alpha.8 (2026-07-19)
- 🐛 **修复**：评论自绘误伤视频页顶栏——视频/list/festival 改为协议级评论（`credentials:omit`），保留官方 `bili-comments`，不再 hide 官方评论 DOM
- 🐛 **修复**：SPA 切视频后 1080P 间歇失效——按 aid/cid 清 `__playinfo__` 缓存，hook pushState/replaceState/popstate，扩展 playurl 拦截范围并用 nativePageFetch 重签
- 🛡️ **优化**：动态/专栏仍走自绘 fallback，挂载选择器收窄 + 禁止 hide 顶栏内节点
- 📚 **README**：版本 badge → alpha.8

### v4.0.0-alpha.7 (2026-07-18)
- 🐛 **修复**：顶栏仍消失——`Node.prototype.appendChild` 全局劫持拦截 `miniLogin` 会误伤 B 站顶栏依赖的脚本加载链路
  - 回滚 `installMiniLoginGuard` 的 appendChild 劫持，登录弹窗拦截回到安全的 DOM 层屏蔽（2-2 CSS + 2-3 MutationObserver）
- 🐛 **修复**：1080P 间歇不生效——XHR 链路用 `fetch(..., { credentials: 'omit' })` 把刚注入的伪造 `DedeUserID` 排除在请求外，服务端按游客返回试看流
  - XHR 链与 fetch 链统一改 `credentials: 'include'`，与 `ensureFakeLoginCookie` 协同生效
- 📚 **README**：版本 badge → alpha.7；简介移除「改写 player/wbi/v2」已废弃说明

### v4.0.0-alpha.6 (2026-07-18)
- 🐛 **根因修复**：视频页导航栏消失——`patchPlayerWbiV2` 用 `new Response(text, …)` 重建会破坏 body 一次性消费特性，影响播放器后续 `.text()/.arrayBuffer()` 二次读取，连带波及顶栏渲染链
  - 直接删除 `patchPlayerWbiV2` 和 `installPlayerInfoUnlock`：协议级模式注入伪造 DedeUserID 后，服务端在 `/x/player/wbi/v2` 自然按登录态返回 `login_mid/level_info/need_login_subtitle`，无需在 fetch/XHR 层手动改写
- 🛡️ **新增**：参考 DD1969 v1.3 思路从源头拦截 `miniLogin` 脚本，窄化命中 `tagName==='SCRIPT' && src.includes('miniLogin')`，不误伤顶栏渲染链
  - 提早到 `isBilibiliLoggedIn return` 之前装载，document-start 阶段即生效
  - DOM MutationObserver 仅作兜底处理硬编码漏出
- 📚 **README**：版本 badge → alpha.6

### v4.0.0-alpha.5 (2026-07-18)
- 🛡️ **新增**：吸收 DD1969「首页防登录」脚本思路——拦截 `top/feed/rcmd` 推荐流，每次请求前清掉 `buvid3`，避免 B 站基于游客 buvid3 跟踪触发登录弹窗
  - 泛化到所有 @match 页面（不仅限首页），在登录弹窗触发链路源头防御
- 📚 **README**：版本 badge → alpha.5

### v4.0.0-alpha.4 (2026-07-18)
- 🐛 **修复**：切视频时顶栏消失——`__playinfo__` 用 `defineProperty` 锁定 descriptor，B 站 SPA 二次加载无法重新注入 SSR，连带波及顶栏渲染链
  - `clearPlayinfoSSR` / `writePlayinfo` 改用直接赋值替代 `defineProperty`，descriptor 不再残留
- 📝 **回归**：`@description` 改回双兼容描述：协议级 + 客户端兼容双重保护 + 旧客户端架构保留可一键回退
- 📚 **README**：补齐 v4.0 双模式架构说明、更新自定义设置与工作原理

### v4.0.0-alpha.3 (2026-07-18)
- 🐛 **根因修复**：对照 [beefreely](https://github.com/vruses/beefreely) 源码重新排查，补齐 alpha.2 缺失的四要素，1080P 真正生效
  - `ensureFakeLoginCookie`：注入伪造 `DedeUserID` 到 `.bilibili.com`，服务端按登录态出 1080P
  - `isBilibiliLoggedIn`：改严格校验 `DedeUserID__ckMd5`（带签名），区分真登录与伪造
  - `clearPlayinfoSSR`：清空 SSR 注入的 `__playinfo__` + `playurlSSRData`，拦截链才能命中
  - `patchPlayerWbiV2` / `installPlayerInfoUnlock`：改写 `/x/player/wbi/v2` 的 `login_mid`/`level_info`/`need_login_subtitle`
  - `writePlayinfo`：把解锁后高清响应回写 `__playinfo__`

### v4.0.0-alpha.2 (2026-07-18)
- 🚧 **新增**：XHR 链路 playurl 拦截，覆盖老播放器或某些走 XHR 的页面
- 🛡️ **新增**：`try_look=1` 失败兜底——若服务端仍只给试看片段，自动去掉 `try_look` 仅保留 `qn=80` 重试一次
- 🔧 **重构**：旧客户端架构（试用倒计时延长/按钮自动点击/`Object.defineProperty` 劫持）整体包成 `installClientArchFallback()`，仅当 v4 开关关闭时启用
- ⚙️ **新增**：设置面板「🛡️ v4 协议级解锁」开关，默认开；关闭即回退旧客户端架构
- 🐛 **修复根因**：v3.5.6 的试用结束问题——协议级解锁不再依赖客户端试用倒计时，服务端直接出 1080P 全片流

### v4.0.0-alpha.1 (2026-07-18)
- 🚧 **新增**：协议级画质解锁（第一刀），参考 beefreely 项目做法
  - 拦截 `/x/player/wbi/playurl` 请求，改参数为 `qn=80(1080P)+try_look=1`，删除旧 `w_rid`/`wts` 后用本地 WBI 算法重签
  - 服务端直接返回 1080P 流，前端 `__playinfo__` 自动拿到正确数据
  - **不动 `Object.defineProperty`、不改 `setTimeout/setInterval`** → 不再有顶栏/搜索栏消失副作用
- 🔁 **保留**：旧的客户端架构（按钮劫持、试用倒计时延长、兜底拔高）暂时保留作为兜底，后续 alpha 版本逐步移除
- 📌 **说明**：本版为 alpha，仅最小新增、不删除旧逻辑，验证协议级解锁在生产环境稳定后切到正式 v4.0
- 🙏 **致谢**：协议级思路参考 [beefreely](https://github.com/vruses/beefreely) 项目

### v3.5.6 (2026-07-18)
- 🐛 **缓解**：窄化 `Object.defineProperty` 对 `isViewToday`/`isVideoAble` 的劫持范围，避免误伤顶栏/搜索栏组件初始化链
  - 现仅当目标对象疑似 player state 时才替换（带 player 上下文线索的 accessor、非 Element/Window、非 data descriptor）
  - 这是治标方案，长期将改协议级解锁（v4.0）彻底解决家族遗传 bug
- 📌 **说明**：参考 beefreely 项目（https://github.com/vruses/beefreely）做法，v4.0 将改为拦截 `/x/player/wbi/playurl` 协议层，移除 `setTimeout`/`setInterval` 全局劫持

### v3.5.5 (2026-07-18)
- 🐛 **修复**：试用结束后第二次解锁失效问题——B 站试用倒计时被延长后不再弹按钮，原 MutationObserver 监听失效
- 🐛 **修复**：试用结束瞬间画质掉回 360P 的回归——兜底改为按钮点击后立即启动，不依赖 `试用中` toast
- 🛡️ **新增**：试用「试用中」toast 出现后，N 秒主动补一次画质请求兜底（路径 C-1）
- 🛡️ **新增**：独立的画质掉落循环监听 + player 画质变化事件即时拔高（路径 C-2），不再依赖按钮 DOM
- ⚙️ **优化**：兜底轮询周期 30s → 3s，掉回低画质恢复更快
- 🐛 **修复**：生活区等分区直播列表「显示不全」问题——`isUsableLiveAreaResponse` 收紧判定，检测到 `count` 与 `list.length` 严重不匹配视为登录态裁剪走兜底
- 🛡️ **优化**：旧接口 `has_more` 计算改为「宁可多翻一页」策略，避免误判末页导致显示不全
- ⚙️ **新增**：设置面板「试用后自动续命画质」开关，可一键关闭两路兜底
- 🔧 **重构**：抽出公共 `requestTargetQuality` 函数，按钮触发路与兜底路复用

### v3.5.4 (2026-05-31)
- 🐛 **修复**：不再延长 `miniLogin` 相关定时器，避免顶部工具栏/搜索框初始化链路被误延迟导致加载异常或只剩空白占位

### v3.5.3 (2026-05-31)
- 🐛 **修复**：恢复 `miniLogin.js` 正常加载，避免试用高清画质后视频页顶部工具栏、搜索框区域只剩空白占位
- 🛡️ **优化**：登录层屏蔽改为只隐藏真正遮挡页面的登录遮罩/弹窗，避免误伤顶部导航组件

### v3.5.2 (2026-05-31)
- 🧭 **优化**：参考同类未登录脚本的低干扰策略，已登录时不再安装直播分区接口拦截，便于登录账号正常对照测试

### v3.5.1 (2026-05-31)
- 🐛 **修复**：直播分区连续加载改为“原接口优先、失败才兜底旧接口”，避免生活区等部分分区被旧接口结果覆盖后显示更少
- 📺 **优化**：旧接口兜底结果补齐分页统计字段，降低前端误判末页导致加载不完整的概率

### v3.5 (2026-05-22)
- 💬 **新增**：支持动态详情页、`opus` 页和专栏页未登录查看评论
- 🧭 **新增**：直播间与空间动态列表的评论入口跳转到动态详情页，便于查看完整评论
- 📺 **新增**：直播分区未登录连续加载，解决下拉后只显示「正在玩命加载ing」的问题
- 🔢 **增强**：评论分页模式新增页码输入与快速跳转
- ▶️ **修复**：防暂停逻辑不再覆盖站内自动播放设置，避免默认强制开始播放
- 🛠️ **设置**：新增「直播分区连续加载」开关
- 📚 **说明**：同步更新 README 的适用页面、功能范围与工作原理

### v3.4 (2026-04-13)
- 🛡️ **重写**：从源头拦截 `miniLogin.js` 加载（参考 DD1969 原始方案），彻底阻止登录弹窗生成
- 🧭 **修复**：顶部工具栏/搜索栏被登录遮罩覆盖的问题（CSS 层级保护 `.bili-header` 区域）
- 🎯 **优化**：登录遮罩分两类处理——全屏遮罩无条件隐藏，播放器内提示仅在播放器区域内隐藏
- 📐 **架构**：三层防御体系（脚本拦截 → CSS 规则 → DOM MutationObserver）

### v3.3 (2026-04-02)
- 🐛 **修复**：未登录播放约 1 分钟后可能被自动暂停（重写防暂停判定，保留用户主动暂停）
- 🧭 **修复**：视频详情页顶部工具栏/搜索栏被误屏蔽（登录层屏蔽仅作用于播放器区域）
- 🛡️ **优化**：收敛试看计时器拦截条件，仅拦截高置信度回调，减少对页面其他模块影响
- 🔢 **更新**：脚本版本号升级至 3.3

### v3.2 (2026-03)
- 🔧 **说明**：该阶段为多次稳定性修复迭代，原 README 的逐条描述不准确，现改为基于提交记录整理
- 🐛 **修复**：集中处理“约 1 分钟自动暂停”与“导航/搜索栏误伤”问题
- 💬 **优化**：评论容器在页面切换时的重新插入逻辑，减少对导航区域影响
- 🧹 **调整**：收敛试看计时器拦截策略，降低全局副作用

### v3.1 (2026-02-25)
- 🐛 **修复**：播放视频或页面数据加载完成后评论消失的问题
- 🛡️ **防御**：在 document-start 阶段拦截官方 `<bili-comments>` 组件挂载
- 🔒 **守护**：新增 MutationObserver 守护自定义评论容器，防止被覆盖
- 🔧 **合并**：统一 Node.prototype 覆写，消除潜在的多重覆写冲突

### v3.0 (2026-02-25)
- 🔧 **重大修复**：彻底重写评论模块，解决评论无法加载的问题
- 💬 **新方案**：自行调用 B站评论 API（含 WBI 签名），完全绕开官方评论组件
- 📄 **分页模式**：新增「分页加载」选项，可在无限滚动与翻页模式间切换
- 🗑️ **移除**：删除已失效的 API 拦截方案

### v2.0 (2026-02-01)
- 🎉 **重磅更新**：新增评论解锁功能
- 💬 **评论解锁**：未登录可查看全部评论，突破3条限制
- 🔄 **自动加载**：可选自动加载所有评论（最多20页）
- ⚡ **性能优化**：API拦截机制，零性能损耗
- 🎨 **设置面板**：新增评论相关设置项

### v1.1-optimized (2026-01-27)
- ⚡ **性能优化**：使用 MutationObserver 替代 setInterval，大幅降低 CPU 占用
- 🛡️ **错误处理**：添加完善的异常处理和超时保护机制
- 🎨 **UI 增强**：优化设置面板样式，支持 ESC 键和点击背景关闭
- 💾 **内存优化**：避免重复创建观察器，减少内存泄漏风险
- ⌨️ **用户体验**：添加视觉反馈和 emoji 图标，提升交互体验
- 📝 **代码质量**：提取常量配置，增强代码可维护性

### v1.0-fusion (2025-07-17)
- 首次发布
- 融合了防暂停和高画质两个功能脚本
- 添加了可视化控制面板

## 🙏 致谢

本脚本融合了两款由 **DD1969** 大佬开发的优秀组件，在此致以诚挚感谢：

- [Bilibili - 防止视频被自动暂停及弹出登录窗口](https://greasyfork.org/zh-CN/scripts/467474)
- [Bilibili - 在未登录的情况下自动并无限试用最高画质](https://greasyfork.org/zh-CN/scripts/467511)
- [Bilibili - 在未登录的情况下照常加载评论](https://greasyfork.org/zh-CN/scripts/473498)
- [小电视空降助手 BilibiliSponsorBlock](https://github.com/hanydd/BilibiliSponsorBlock)（播放器生命周期与原生控制栏挂载设计）

## 📬 反馈与支持

如果遇到问题或有任何建议：

- [GitHub Issues](https://github.com/zhikanyeye/Bilibili-Free-Quality/issues)
- [Greasy Fork 讨论区](https://greasyfork.org/zh-CN/scripts/542804/feedback)
- 在评论区留言

## 📜 许可证

本项目基于 [GPL-3.0 许可证](https://www.gnu.org/licenses/gpl-3.0.html) 开源。

---
**🎁 AI 写作编程利器 · AgentRouter 大模型中转站**

免费用 Claude Opus 4-8 / Claude Opus 4-7 / GPT-5.5 / GLM-5.2，写脚本、改代码、查 bug 都顺手。
通过邀请链接注册，注册即送好友 **$50 奖励**：[点击跳转 AgentRouter](https://agentrouter.org/register?aff=e8bc)

**Enjoy free 1080P without login!** 🎬✨
