# Bilibili - 未登录自由看

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
![Version](https://img.shields.io/badge/version-2.0-green)
[![Greasy Fork](https://img.shields.io/badge/Greasy%20Fork-安装脚本-orange)](https://greasyfork.org/zh-CN/scripts/542804-bilibili-%E6%9C%AA%E7%99%BB%E5%BD%95%E8%87%AA%E7%94%B1%E7%9C%8B)

## 📌 简介

**「Bilibili - 未登录自由看」** 让未登录用户也能轻松观看高画质B站视频，不再受平台限制困扰。

您是否也遇到这些烦恼？
- 未登录只能看 360P？
- 一天只有一次 30 秒的高画质试用？
- 视频看一半突然弹出「请先登录」？
- 没点暂停却被脚本强行暂停？

### 核心功能

- ✅ **无限次**自动触发 1080P 试用，**不限时长**
- ✅ **彻底屏蔽**登录弹窗与自动暂停
- ✅ **解锁全部评论**，突破未登录只能看3条的限制
- ✅ **可选自动加载**所有评论（最多20页）
- ✅ **可视化面板**，一键切换 1080P / 720P / 480P / 360P
- ✅ **Edge / Chrome / Firefox** 全平台兼容
- ✅ **零配置**，安装即用；已登录用户自动退出，零干扰

## 🖼️ 功能演示

![功能演示](https://img.lansq.xyz/file/3OD0iMtk.png)

## ⚙️ 安装与使用

| 步骤 | 操作 |
|---|---|
| 1 | 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/) |
| 2 | [点击这里安装此脚本](https://greasyfork.org/zh-CN/scripts/542804-bilibili-%E6%9C%AA%E7%99%BB%E5%BD%95%E8%87%AA%E7%94%B1%E7%9C%8B) |
| 3 | 打开任意 B 站视频页（**确保未登录**） |
| 4 | 右下角齿轮 → **脚本设置** 可调画质等选项 |

## 🛠️ 自定义设置

- **首选画质**：1080p / 720p / 480p / 360p
- **切换时暂停**：开 / 关（防止音画不同步）
- **解锁全部评论**：开 / 关（突破未登录3条限制）
- **自动加载所有评论**：开 / 关（可选加载最多20页）
- **已登录自动退出**：零冲突、零性能损耗

## 📊 脚本信息

- **适用页面**  
  `https://www.bilibili.com/video/*`  
  `https://www.bilibili.com/list/*`  
  `https://www.bilibili.com/festival/*`

- **运行时机**  
  `document-start`（越早越好）

- **体积**  
  约 12 KB（已优化性能与内存占用）

## 💡 工作原理

本脚本通过以下机制实现功能：

1. 拦截和修改B站的API请求与响应
2. 阻止登录提示弹窗的DOM元素加载
3. 覆盖原生视频控制函数，防止自动暂停
4. 自动触发高清画质试用，并移除时间限制
5. 拦截评论API接口，移除登录限制标记
6. 自动清理"登录后查看更多评论"的提示元素

## 🔄 更新日志

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

## 📬 反馈与支持

如果遇到问题或有任何建议：

- [GitHub Issues](https://github.com/zhikanyeye/Bilibili-Free-Quality/issues)
- [Greasy Fork 讨论区](https://greasyfork.org/zh-CN/scripts/542804/feedback)
- 在评论区留言

## 📜 许可证

本项目基于 [GPL-3.0 许可证](https://www.gnu.org/licenses/gpl-3.0.html) 开源。

---

**Enjoy free 1080P without login!** 🎬✨
