# 交接说明（Handover）

本文给接手者一份“现在能做什么、代码在哪、怎么验证、哪些坑不能踩”的快速说明。
英文的架构/开发/数据文档在 [`README.md`](README.md) 索引中。

## 1. 项目定位

tgdesk 是一个 **Windows-first** 的 Telegram 桌面客户端，基于：

- Wails v3（窗口 + WebView2 + Go 绑定）
- React 19 + TypeScript + Vite
- tdl / gotd（作为 Go module 使用，**不 fork、不打 patch**）

核心目标：登录 Telegram、浏览会话与消息、下载媒体，并在登录后生成
**官方 Telegram Desktop 兼容的 `tdata`**。

## 2. 当前完成度

已实现并验证：

- 二维码登录：真实 `tg://login?token=...`，自动轮换 token、显示剩余时间、过期手动刷新。
- 手机号登录：国家/地区选择（224 项，默认 `+86`）、验证码类型/位数、重发倒计时、
  错误码重试、2FA 密码提示、`FLOOD_WAIT` 倒计时。
- 登录后生成官方格式 `tdata/`（`key_datas`、`D877F783D5D3EF8Cs`、
  `D877F783D5D3EF8C/maps`），并由官方 Telegram Desktop 7.2.5 读取验证。
- 从官方 `tdata` 导入会话；按授权身份去重，避免官方客户端重写文件后重复导入。
- 会话列表、最近 50 条消息、纯文本发送。
- 媒体下载：断点续传、暂停/继续/取消、进度事件、任务持久化、缩略图缓存。
- 设置：语言、Enter 发送、下载目录/并发/线程/模板、代理、NTP。
- 三语言：English / 简体中文 / 日本語。
- Google Material 3 风格登录页（Roboto、浅色 surface、药丸按钮、可搜索国家选择器）；
  聊天主界面保留 Telegram 深色风格。

明确未实现：

- 消息分页、实时更新、reaction、服务端搜索、转发、编辑/删除。
- Pin/Mute/Read 仅本地 UI 状态，不写回 Telegram。
- 带本地 passcode 的 tdata 导入不支持。
- 只导出主 DC 的 auth key；其余 DC key 由官方客户端连接时补齐。
- Windows 以外的构建脚手架存在，但未做发布级验证。

## 3. 关键设计决策

| 决策 | 原因 |
|---|---|
| tdl/gotd 作为依赖，不 fork | 升级直接改 `go.mod`，减少维护面 |
| 便携目录 = exe 所在目录 | 绿色软件；`TGDESK_HOME` 可重定向 |
| tgdesk 自己的会话只放 `data/` | `tdata/` 只允许官方 Telegram Desktop 文件 |
| 登录后导出官方 tdata，而不是自定义格式 | 用户可直接用官方客户端打开 |
| tdata 只写 `s` 后缀 | 现代 Telegram Desktop 只保留/优先读取 `s` |
| 导入按 user id + main DC + key id 去重 | Telegram Desktop 每次启动会重写 `key_data`（新 salt），mtime 不可靠 |
| 手机号登录自写 `sendCode → signIn → checkPassword` | `auth.Flow` 拿不到验证码类型/长度，也不能优雅重发/重试 |
| 登录页 Material 3 浅色，聊天 Telegram 深色 | 登录页突出品牌；聊天区保持 Telegram 原生观感 |
| 代理密码不落盘 | 减少凭据泄露面；后续可接 Windows Credential Manager |

## 4. 代码地图

```text
main.go                         Wails 入口、窗口、服务注册、WebView 迁移
internal/app/service.go         Wails 适配层：只转调 kernel + 发事件
internal/kernel/
  auth.go                       二维码/手机号/2FA 状态机、AuthEvent、tdata 导出触发
  session.go                    共享已授权 Telegram client
  session_user.go               RefreshUser + ensureTData
  chats.go                      会话/消息/媒体 DTO 映射
  downloads.go                  下载管线、断点续传、进度
  download_store.go             下载任务持久化
  thumbs.go                     缩略图下载/缓存
  tdesktop_import.go            官方 tdata → tgdesk 会话
  tdesktop_export.go            tgdesk 会话 → 官方 tdata
internal/paths/paths.go         便携路径解析
frontend/src/
  App.tsx                       应用壳、会话/消息/下载状态、事件订阅
  components/auth/              登录页（Material 3）各步骤 + 国家选择器
  components/chat/              会话视图、消息、媒体、输入框
  components/downloads/         下载管理器
  components/layout/            TitleBar、Sidebar
  components/settings/          设置面板（settings-panel + settings-controls）
  components/ui/                通用原子组件
  data/countries.ts             224 个国家/地区 + 呼叫前缀
  data/telegram.ts              DTO → UI 模型、日期/媒体格式化
  hooks/useSettings.ts          localStorage 设置
  locales/                      en / zh / ja
frontend/bindings/              生成的 Wails 绑定；不要手改
docs/                           交接、架构、开发、数据、UI 文档
build/                          Wails 构建资产（Windows 为主）
```

## 5. 运行与构建

环境：Windows 10/11 + WebView2、Go 1.26+、Node 22+/npm 11+、Wails 3.1.0。

```powershell
# 依赖
cd frontend
npm ci
cd ..

# 开发
wails3 dev

# 生产构建
wails3 build
```

产物：`bin/tgdesk.exe`。从 `bin/` 启动，便携数据在 `bin/data`、`bin/tdata`、
`bin/downloads`。

**Windows 构建注意**：Wails 3.1.0 在 Windows 上可能在构建完成后打印
`uname/tail not found` 并以退出码 1 结束；只要 `bin/tgdesk.exe` 时间戳更新且能启动，
构建就是成功的。若 `wails3` 不在 PATH，使用 `$(go env GOPATH)\bin\wails3.exe`。

## 6. 验证方式

```powershell
go test ./internal/...
cd frontend
npm run build
cd ..
wails3 build
```

建议的快速烟测：

1. 用干净的 `TGDESK_HOME` 启动，确认欢迎/二维码/手机号/国家选择器布局。
2. 扫码或手机号登录，完成验证码/2FA。
3. 确认 exe 同目录生成 `tdata/`（3 类文件）和 `data/tdata-export.json`。
4. 关闭后重新启动，应直接进入会话列表。
5. 打开一个会话、发送一条纯文本、启动/暂停/恢复一个媒体下载。

干净的测试 home（避免复制本机旧会话）：

```powershell
$env:TGDESK_HOME = "E:\tg\tgdesk-test"
New-Item -ItemType Directory "$env:TGDESK_HOME\data" -Force
New-Item -ItemType Directory "$env:TGDESK_HOME\tdata" -Force
Set-Content "$env:TGDESK_HOME\data\.legacy-session-migrated" "1"
Set-Content "$env:TGDESK_HOME\data\.legacy-webview-migrated" "1"
```

WebView2 DevTools：

```powershell
$env:TGDESK_WEBVIEW_DEBUG = "1"
.\bin\tgdesk.exe
# http://127.0.0.1:9222/json/list
```

不要在日常构建中保留该环境变量。

## 7. tdata 重点与坑

- 官方文件布局：
  - `tdata/key_datas`：本地 key（空 passcode 包装）+ 账号索引
  - `tdata/D877F783D5D3EF8Cs`：MTP 授权（wide-id user id、main DC、auth key）
  - `tdata/D877F783D5D3EF8C/maps`：空账号 map
- 写入版本号故意使用很小的 `1`：Telegram Desktop 只拒绝“比自己新”的文件；旧版本号
  可被 5.x–7.x 接受，官方启动后会用自己的版本重写。
- 导出前会把现有官方认证文件备份到 `data/tdata-backup/`。
- 官方客户端启动后会重写 `key_data`/`maps`/`configs`；导入去重必须看授权身份，
  不能看 mtime。
- 带 passcode 的 `tdata` 无法读取，登录页会显示导入错误，但 QR 仍可用。
- 只导出主 DC 的 key 是预期行为；官方客户端连接后会补齐其它 DC。
- 登录验证码可能只能“App 内下发”。此时 `auth.resendCode` 可能返回
  `SEND_CODE_UNAVAILABLE`，验证码在 Telegram 的“Telegram”服务对话里，无法强制改短信。

## 8. 已知技术债 / 下一步

1. 消息分页、虚拟列表、实时 update（`updates` 事件循环）。
2. 会话 pin/mute/read 写回服务端。
3. reaction、转发、编辑/删除、服务端搜索。
4. 下载 CDN redirect 的完整续传。
5. 代理密码迁移到 Windows Credential Manager。
6. 设置面板继续补齐 Telegram 真实字段（目前只保留已接后端的项）。
7. 非 Windows 平台（macOS/Linux/Android/iOS）构建验证。
8. 单元测试目前集中在内核（auth/tdata）；可补下载/聊天 DTO 的回归测试。

## 9. 交接检查清单

- [ ] `git status` 干净；没有 `bin/`、`temp/`、`tdata/`、真实账号截图被提交。
- [ ] `go test ./internal/...` 通过。
- [ ] `npm run build` / `wails3 build` 通过（注意 Windows 退出码 1 的假失败）。
- [ ] 干净 home 下能走到登录二维码/手机号步骤。
- [ ] 登录后 `tdata/` 生成；重启仍已登录。
- [ ] 能打开会话并发送纯文本；下载可开始/暂停/恢复。
- [ ] 文档链接可点，`docs/README.md` 无历史死链。
- [ ] 不要把真实手机号、user id、聊天内容、验证码写进文档/提交。

## 10. 隐私红线

- 不提交 `tdata/`、`data/`、`bin/`、`temp/`、下载媒体、WebView 状态、日志。
- 不把真实账号的聊天截图放进仓库；登录页截图可提交（不含有效 token/手机号）。
- 测试 tdata 只用一次性副本；不要在唯一一份账号数据上做导入/导出实验。

更细的数据布局与 git 规则见 [`data-and-privacy.md`](data-and-privacy.md)。
