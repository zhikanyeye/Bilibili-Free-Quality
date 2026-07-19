# Requirements Document

## Introduction

播放器左右跳转控件为视频页提供可配置的快速后退和前进操作，并保持播放器现有点击行为。

## Glossary

- **跳转控件**：显示在视频画面左右两侧的后退和前进图标按钮。
- **播放器视频区**：当前 B 站播放器承载视频画面的 DOM 区域。
- **全屏状态**：浏览器标准全屏或 B 站网页全屏状态。

## Requirements

### Requirement 1

**User Story:** AS 视频观看者, I want 使用左右图标快速调整播放位置, so that 我可以快速回看或跳过内容。

#### Acceptance Criteria

1. WHEN 用户点击播放器视频区, THE 脚本 SHALL 显示后退和前进图标 2 秒。
2. WHEN 用户点击后退图标, THE 脚本 SHALL 将当前播放时间减少配置的后退秒数。
3. WHEN 用户点击前进图标, THE 脚本 SHALL 将当前播放时间增加配置的前进秒数。
4. WHEN 跳转目标超出视频范围, THE 脚本 SHALL 将播放时间限制在 0 到视频时长之间。

### Requirement 2

**User Story:** AS 视频观看者, I want 自定义左右跳转秒数, so that 跳转幅度符合个人观看习惯。

#### Acceptance Criteria

1. THE 脚本 SHALL 默认使用后退 10 秒和前进 15 秒。
2. WHEN 用户保存跳转设置, THE 脚本 SHALL 接受 1-300 秒范围内的整数值。
3. WHEN 用户保存跳转设置, THE 脚本 SHALL 持久保存后退和前进秒数。
4. WHEN 页面重新加载或 SPA 切换视频, THE 脚本 SHALL 恢复已保存的跳转秒数。

### Requirement 3

**User Story:** AS 视频观看者, I want 跳转控件保持低干扰, so that 控件不会影响播放器原有操作。

#### Acceptance Criteria

1. WHEN 用户点击跳转图标以外的视频区域, THE 脚本 SHALL 保留播放器原有点击处理。
2. WHILE 播放器处于全屏状态, THE 脚本 SHALL 隐藏跳转控件。
3. WHEN 播放器视频层被 SPA 替换, THE 脚本 SHALL 将跳转控件挂载到当前视频层。
4. WHILE 用户处于登录或未登录状态, THE 脚本 SHALL 提供跳转控件。
