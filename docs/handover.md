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
- 会话列表、最近消息、历史自动分页（滚动到顶部即加载更早页面，不点按钮）、纯文本发送。
- 聊天信息面板与 Telegram Web 对齐：先 `messages.getSearchCounters`（内核缓存 60 秒）
  决定显示哪些分类（成员/媒体/文件/链接/音乐/语音/动图），每个分类各自用
  `messages.search` 过滤并无限滚动分页；媒体支持 Telegram Web 的照片/视频勾选过滤
  与 "N 张照片，M 个视频" 副标题；右键菜单按类别显示 转发/复制媒体/下载/在聊天中显示/
  选择/删除，支持多选操作；成员走 `channels.getParticipants` 分页（成员管理类菜单暂未实现）。
- 聊天资料/发言能力后端：`GetChatProfile` 一次拉取 `users.getFullUser` /
  `messages.getFullChat` / `channels.getFullChannel`（缓存 60 秒），返回类型
  （user/bot/saved/group/channel）、简介、用户名、联系人可见手机号、成员/订阅数、
  可发言/可发文本、慢速模式、管理员/群主、论坛、邀请链接、关联群、Bot 命令/菜单按钮/
  隐私政策；发言权限按 tweb hasRights 推导（频道管理员需 post_messages、send_plain
  只限制文本等）。
- 服务端 Pin/Mute：`SetChatMuted`（account.get/updateNotifySettings，先读后合并，
  永久静音用 0x7FFFFFFF）与 `SetChatPinned`（messages.toggleDialogPin），成功后清空
  dialog 缓存。
- Bot inline 键盘：`SendBotCallback`（messages.getBotCallbackAnswer，FLOOD_WAIT/
  BOT_RESPONSE_TIMEOUT 转可读错误）回读被点击消息并以 `chat:event` edit 推送刷新；
  按钮 DTO 带行号/样式，simple webview 单独映射为 `webview_simple`。
- Bot mini app：`RequestBotWebView`（messages.requestWebView）返回带签名的 URL；
  `OpenBotWebView`/`OpenMiniApp` 复用透明无边框 `mini-app` 窗口（480×688，本地
  `/miniapp.html` 包装页 + sandbox iframe，`TakeMiniAppState(session)` 传状态）。
- 聊天信息面板前端（`ChatInfoPanel`）：按资料类型显示 "用户信息/机器人信息/群组信息/
  频道信息/已保存消息"，头像/标题/N 位成员·订阅者；动作格按 Telegram 类型区分
  （用户：发消息/通话/静音/更多；机器人：发消息/静音/更多；群组：发消息/静音/更多；
  频道：静音/更多，可发言时多一个发消息；已保存：发消息/更多），"更多"菜单含
  置顶、标为已读、归档、在聊天中搜索；下方是图一式简介卡片（(i) 图标、可展开、
  自动识别链接）、@用户名 / t.me / 邀请链接 / 电话 / 成员·订阅者行、Bot 命令与
  菜单行，再接原有共享媒体 tab。
- 输入框按 Telegram Web K 重做（`composer/`）：同一块 24px 圆角浮动面板内放回复/编辑
  头、上传进度和输入行；按"能否发言"切换而不是按 chat.kind：私聊/机器人/已保存/群组
  /频道管理员显示输入框（频道占位符 "广播"），不可发言的广播频道显示整条
  Mute/取消静音 + 礼物按钮，受限群显示只读提示条。含 Bot 菜单胶囊（web app）、
  `/` 命令自动补全（↑↓/Enter/Esc）、慢速模式倒计时、附件菜单、Emoji 面板、单一
  morphing 发送/语音按钮、Enter/Shift+Enter/Ctrl+Enter 与草稿。
- Bot 内联键盘前端（`BotKeyboard`）：按 `row` 还原 Telegram 行/等宽格子、`style`
  着色、点击态 spinner；URL/复制/回调/webview 全部可用；回调走
  `SendBotCallback`，alert/URL 结果即时反馈，被机器人编辑的消息由 `chat:event` 刷新。
- Emoji 面板：1,895 个 emoji、7 分类 + 常用/最近、中英日搜索关键词、快捷分类过滤、
  明暗主题、键盘导航；从光标处插入并以纯文本发送，数据来自 MIT/Unicode 许可来源，
  离线打包（`data/emoji*.ts`，按语言懒加载关键词）。
- 会话列表：已保存消息按语言显示为 "已保存消息"，频道显示 "N 位订阅者"，机器人
  副标题显示 @username。
- Telegram Web 风格的消息操作：右键/悬停菜单、回复、复制、转发、编辑自己的文本消息、
  为自己/所有人删除、链接自动识别、照片大图查看。
- 实时消息推送：gotd `UpdateDispatcher` 处理新消息/编辑/删除/reaction/已读，通过
  `chat:event` 推给前端；短消息与 `updatesTooLong` 触发重载，重连后无需手动刷新。
- Emoji reaction：消息下方显示计数/chosen 状态，右键菜单打开表情面板，调用
  `messages.sendReaction`。
- 相册分组：同一 `grouped_id` 的连续消息渲染为一张 mosaic 气泡；转发/删除/下载
  使用相册内全部消息 id。
- 附件上传：原生多文件选择，512 KiB 分片上传，输入框内显示进度；支持 caption/回复。
- 消息界面按 Telegram Web K 重做：15/5px 圆角、无突出尾巴、4/9/5px 内边距、
  480px 文本列、固定头像槽、内联时间/已读、组尾头像、涂鸦壁纸画布、浅色绿色/深色钢蓝 outgoing。
- 富文本实体、语音波形、音频、TGS/WebM 贴纸、GIF、网页预览、投票/测验、
  清单、账单、赠送、付费媒体、Story、游戏、骰子、联系人、位置和 inline keyboard。
- 本地快照缓存 `data/cache/`：启动/重载先用 `GetCachedChats`、`GetCachedMessages`
  立即绘制，再被网络结果替换；图像 URL 不写入缓存，避免过期 loopback 端口。
- 图片按需加载：缩略图/头像/照片走 loopback HTTP（`/thumb`、`/avatar`、`/photo`），
  不再在 exe 同目录写 `data/thumbs`、`data/avatars` 的一堆 JPEG；内核只保留有界内存缓存，
  WebView 自己缓存 HTTP 图片。旧版缓存目录启动时自动删除。
- 消息列表切换会话时先用内存快照渲染，再后台刷新；图片不再逐张走 Wails base64 RPC。
  会话列表与 archived/folders 并行加载；内核有 20 秒 dialog 缓存，避免刷新/重载
  时重复 `messages.getDialogs` 触发 flood wait。
- 媒体下载：tdl 内核多连接传输（新文件用 tdl downloader，续传用 tdl DC 池并发分片），
  断点续传、全部暂停/全部开始、进度事件、任务持久化；移除任务会删除未完成的 `.tmp`，
  新任务只续传自己记录的临时文件，完成前校验文件大小，避免残留临时文件导致文件损坏。
- 设置：语言、Enter 发送、下载目录/并发/线程/模板、代理、NTP。
- 三语言：English / 简体中文 / 日本語。
- 全前端统一 F 视觉（Radix Themes 原子层、Lucide 图标、Inter + 系统中文字体、
  画布浮层卡片、明暗主题同一套 token）；登录页与聊天主界面共用设计系统和通用组件。

明确未实现：

- 服务端消息搜索、typing/在线状态、定时消息、多文件一次性发送为相册。
- 聊天信息中的 Stories/Gifts/相似频道/群组等 Web 分类尚未接入（当前覆盖
  成员、媒体、文件、链接、音乐、语音、动图）。
- 输入框的 send-as / 匿名管理员 / 定时消息 / 语音录制与发送菜单未实现（相关按钮
  隐藏或给出提示）；未订阅频道的 JOIN/SUBSCRIBE 底栏依赖加入聊天功能，暂不涉及。
- Bot mini app 还没有 Telegram JS bridge：`web_app_data_send`、`prolongWebView`、
  MainButton/返回事件、`web_app_ready` 均未转发；`botOwnerId` 在 gotd v0.140 的 TL
  层没有字段，保持为空。Emoji 面板暂无肤色选择，Windows 上国旗 emoji 渲染为字母对
  （Segoe UI Emoji 限制）；群组中的 bot 命令补全依赖资料里的 commands 数据。
- 聊天资料里的"通话"按钮会提示本版本暂不支持（未接语音通话）。
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
| 全前端统一 F（Radix Themes） | 登录页/聊天/下载/设置共用 token 与通用原子组件，避免拼贴感 |
| 代理密码不落盘 | 减少凭据泄露面；后续可接 Windows Credential Manager |

## 4. 代码地图

```text
main.go                         Wails 入口、窗口、服务注册、WebView 迁移
internal/app/service.go         Wails 适配层：只转调 kernel + 发事件
internal/app/media_viewer.go    独立媒体查看器窗口
internal/app/mini_app.go        Bot mini app 透明窗口（480×688、session、复用、焦点）
internal/kernel/
  auth.go                       二维码/手机号/2FA 状态机、AuthEvent、tdata 导出触发
  session.go                    共享已授权 Telegram client
  session_user.go               RefreshUser + ensureTData
  chats.go                      会话/消息/操作/媒体 DTO 与 URL 映射
  chat_profile.go               聊天资料 DTO、发言权限推导、60s 缓存
  chat_actions.go               服务端静音/取消静音、Pin/取消 Pin
  bots.go                       bot 回调答案、mini app requestWebView、错误转可读
  live.go                       Telegram updates → chat:event
  reactions.go                  表情回应
  attachments.go                原生文件选择、上传与进度事件
  images.go                     loopback 缩略图/头像/照片服务与内存缓存
  thumbs.go                     缩略图尺寸与头像照片选择
  downloads.go                  下载管线、断点续传、进度
  download_store.go             下载任务持久化
  tdesktop_import.go            官方 tdata → tgdesk 会话
  tdesktop_export.go            tgdesk 会话 → 官方 tdata
internal/paths/paths.go         便携路径解析
frontend/src/
  App.tsx                       应用壳、会话/消息/下载状态、事件订阅
  components/auth/              登录页（F）各步骤 + 国家选择器
  components/chat/              会话视图、消息与操作、图片/视频查看、右侧信息面板
  components/downloads/         下载管理器
  components/layout/            TitleBar、AppMenu、Sidebar
  components/settings/          设置 Dialog
  ui/                           F 原子组件层（Radix Themes）
  styles/                       设计 token 与基础样式
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

1. 用干净的 `TGDESK_HOME` 启动，确认直接进入二维码登录页，并可切换到手机号/国家选择器。
2. 扫码或手机号登录，完成验证码/2FA。
3. 确认 exe 同目录生成 `tdata/`（3 类文件）和 `data/tdata-export.json`。
4. 关闭后重新启动，应直接进入会话列表。
5. 打开一个会话、发送一条纯文本、回复一条消息、添加/移除一个 reaction、发送一个附件，
   并启动/暂停/恢复一个媒体下载。

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

1. 持久化的 updates 序列/gap recovery 与虚拟列表；当前断线只靠 `updatesTooLong` 重载。
2. Bot mini app 无 Telegram JS bridge（web_app_data_send、prolongWebView 未接）；
   `BotCallbackResultDTO` 不含非 alert 的 toast 文本；`botOwnerId` 本 TL 层无字段，留空。
3. 服务端搜索、typing/在线状态、定时消息、多文件一次性发相册。
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

