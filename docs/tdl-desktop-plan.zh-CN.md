# tgdesk：以 tdl 为内核的桌面环境技术方案

> 分析日期：2026-11-11  
> 分析对象：`iyear/tdl` master（commit `70c561c`）与最新 release `v0.20.4`  
> 本文所有临时验证代码都在 `temp/` 下，不进入正式工程。

---

## 0. 结论先行

### 0.1 三句话结论

1. **tdl 现在不只是一个 CLI，它已经把可复用能力拆成了公开 Go module**：`github.com/iyear/tdl`、`github.com/iyear/tdl/core`、`github.com/iyear/tdl/extension` 都有 `v0.20.4` 版本。桌面端可以直接 import，不需要 fork，也不需要改上游一行代码。
2. **不要把 `tdl.exe` 的终端输出当作主集成接口**。tdl 没有 daemon、没有下载进度 JSON、没有登录 RPC；进度是带 ANSI 的终端进度条，日志写文件，登录是交互式 survey 提示。用 CLI 包装能做 MVP，但长期会很脆。
3. **已确定采用“源码级内核”**：把 tdl 作为 Go module 依赖，升级时改 `go.mod`、重新构建、发新版；不要求 UI 不重装就能替换内核二进制。基于这个前提，主线方案是 **Wails v3 + React/TypeScript + 进程内 Go 内核**；Tauri/Electron + Go sidecar 保留为未来需要进程隔离或闭源分发时的备选。

### 0.1.1 已确认决策

- **2026-11-11：选择“升级依赖后重新构建”**，即源码级内核，不做“UI 不重装、直接替换内核二进制”。
- 当前主线：**Wails v3.1 + React 19/TypeScript + 进程内 Go 内核**。
- 2026-11-11：骨架已落地，`wails3 build` 通过，生成 `bin/tgdesk.exe`。
- 2026-11-11：Telegram Desktop 风格 UI 壳已实现（Tailwind 4 + Radix + Tabler，浅色/深色、聊天列表、消息气泡、下载管理、右侧信息栏、About）；设置页（General/Appearance/Downloads/Network/Advanced/About）完成；界面支持 English / 简体中文 / 日本語，默认跟随系统语言；详见 `docs/ui.md`。
- 2026-11-11：登录页已接 **真实 gotd QR / 手机号 / 验证码 / 2FA flow**，通过 kernel 的 `auth:event` 驱动；QR 已用 HTTP 代理 `127.0.0.1:7897` 实测生成并完成真实账号登录。会话写入独立 `tgdesk` namespace，`AuthStatus` 要求 session + 已登录用户标记。
- 2026-11-11：聊天列表和最近 50 条消息已接真实 Telegram 数据（`GetChats` / `GetMessages`，opaque peer ID + 共享 session）；媒体下载任务已接 `core/tmedia` + `core/downloader`，支持真实进度/暂停/继续/取消、文件名模板和 Explorer 打开目录。任务元数据持久化到 `<exe>/data/downloads.json`，重启后恢复为 paused，并从 `.tmp` 字节偏移继续；CDN redirect 暂回退完整重下。聊天 Pin/Mute/Mark read 仍是本地动作。
- 2026-11-11：改为**便携模式**。运行时默认只写 `tgdesk.exe` 同目录：`tdata/`（tdl 登录会话）、`data/webview`（设置/主题/语言）、`data/downloads.json`、`downloads/`。旧 `~/.tdl` 会话与旧 WebView 配置只读取并一次性迁移。
- 2026-11-11：支持直接复制 **Telegram Desktop 的 `tdata`** 到 `<exe>/tdata` 登录：用 `gotd/td/session/tdesktop` 解析授权 key，`session.Loader.Save` 到 tdl KV；已有 session 先备份为 `tgdesk.bak`，tdata 源文件不改。带本地 passcode 的 tdata 暂不支持。
- 已确认：产品范围 = 下载管理器 + 聊天浏览；许可证 = AGPL 开源；目标平台 = Windows only。

### 0.2 推荐技术栈（默认方案）

| 层 | 选择 | 理由 |
|---|---|---|
| 桌面壳 | **Wails v3.1.x**（保守可用 v2.17.1） | Go 后端 + 系统 WebView，单二进制，直接调用 tdl Go 包，不需要 Rust/Node 主进程 |
| 前端 | **React 19 + TypeScript + Vite** | 生态最成熟，复杂列表/媒体/状态管理资料最多 |
| UI | **Tailwind CSS 4 + Radix + Tabler Icons** | 无样式行为交给 Radix，视觉全部自己控制，避免成品库的默认气质 |
| 列表 | **TanStack Virtual** | 聊天列表、消息列表、任务列表都必须虚拟化 |
| 状态 | **Zustand + TanStack Query** | 轻量本地状态 + 服务端数据缓存 |
| 内核 | **Go + tdl `core`/`pkg` 公共包** | 不 fork 上游，升级只改 `go.mod` 版本 |
| 持久化 | tdl bolt KV（`tgdesk` namespace：会话/peers）+ 应用自己的 SQLite/JSON（任务/设置） | 与 tdl CLI 的 `default` 隔离，避免 bolt 锁冲突；首次需单独登录 |
| 打包 | Wails 自带打包 + Windows 代码签名 | 单 exe/安装包；后续可加自动更新 |

### 0.3 已经做过的可行性验证

在 `temp/spike` 下建了一个独立 Go module，使用 **Go 1.25.8**，直接依赖：

```text
github.com/iyear/tdl v0.20.4
github.com/iyear/tdl/core v0.20.4
```

最小程序成功：

- import `github.com/iyear/tdl/pkg/kv`、`pkg/tclient`；
- 打开 tdl 的 bolt 存储、读取内置 App 凭据；
- 用 `core/storage.NewSession` 完成 session 的写入/读取 round-trip；
- 构造 `core/downloader.Downloader`。

实测输出：

```text
app_id=15055931 app_hash=021d433426cbb920eeb95164498fe3d3
session=*storage.Session downloader=*downloader.Downloader
session_roundtrip=spike-session
```

这说明 **“桌面端直接复用 tdl 公共模块”这条路是通的**。本次没有测试真实 Telegram 登录/下载，因为需要真实账号；这是下一步 spike 的内容。

### 0.4 还需确认的问题

1. **产品范围**：是“下载管理器 + 聊天浏览”，还是“完整 Telegram 客户端”？两者工作量差 5～10 倍。
2. **许可证/商业模式**：tdl 是 **AGPL-3.0**。源码级内核会直接链接它的代码，整个应用通常要按 AGPL 开源；如果要闭源商业分发，需要重新评估进程边界方案并咨询律师。
3. **目标平台**：Windows only，还是 Windows + macOS / 三平台？
4. **Wails 版本**：接受 v3.1 的早期风险（API 较新、weekly release），还是先用更成熟的 v2.17.1？

---

## 1. tdl 项目分析

### 1.1 它是什么

`iyear/tdl` 是一个用 Go 写的 Telegram 工具箱，基于 **gotd/td**（纯 Go 的 MTProto 实现），不是 TDLib。它的能力包括：

- 登录：导入 Telegram Desktop 的 `tdata`、手机号验证码、QR 登录、2FA；
- 下载：从公开/受保护聊天、消息链接、官方客户端导出的 JSON 下载媒体；
- 下载参数：线程数、并发任务数、扩展名过滤、命名模板、跳过同名同大小、相册/分组、takeout、断点续传、HTTP serve；
- 上传：文件/图片/视频/音频上传到指定聊天；
- 转发：direct / clone 两种模式，受保护内容可走重新上传；
- 工具：列出聊天（支持 JSON 输出）、导出消息、导出成员、备份/恢复/迁移；
- 扩展：独立 Go 二进制扩展，`tdl extension install` 安装；
- 自更新：master 上已有 `tdl update`（v0.20.4 release 之后加入）。

### 1.2 代码结构（按“能不能复用”分类）

| 目录 | 作用 | 桌面端能否直接用 |
|---|---|---|
| `cmd/` | Cobra 命令、全局 flag、viper 绑定 | 不建议直接用；CLI 入口，和终端强耦合 |
| `app/dl` | 下载业务流程、迭代器、终端进度 | 逻辑可参考，但 `Options`、viper、survey、终端进度耦合，不能直接当 API |
| `app/login` | 登录流程 | 终端 survey 交互，不能直接用于 GUI；需要自己实现状态机 |
| `app/chat` | 聊天列表、消息导出、成员导出 | 查询逻辑可参考；输出是 stdout/文件，不是可复用服务 |
| `app/up`、`app/forward` | 上传、转发流程 | 同上，逻辑可参考 |
| `core/downloader` | 多线程下载器、`Progress` 接口、`Elem`/`Iter` 抽象 | **可以直接用**，这是最有价值的包 |
| `core/uploader` | 上传器 | **可以直接用** |
| `core/forwarder` | 转发/克隆 | **可以直接用** |
| `core/tclient` | 创建 gotd Telegram client、默认中间件、`RunWithAuth` | **可以直接用** |
| `core/dcpool` | 多 DC 连接池、takeout | **可以直接用** |
| `core/storage` | Storage 接口、Session、Peers 持久化 | **可以直接用** |
| `core/tmedia` | 从消息提取媒体信息（文件名/大小/DC/缩略图） | **可以直接用** |
| `core/middlewares` | retry、recovery、takeout、floodwait | **可以直接用** |
| `pkg/kv` | bolt/file/legacy 存储驱动、namespace | **可以直接用** |
| `pkg/tclient` | App 凭据、基于 KV 的 session client | **可以直接用** |
| `pkg/tmessage` | 从 URL/JSON 解析消息来源 | **可以直接用** |
| `pkg/tplfunc` | 文件名模板函数 | **可以直接用** |
| `pkg/texpr` | 消息/聊天过滤表达式 | 可选复用 |
| `pkg/prog` | 终端进度条 | 不适合 GUI，建议自己实现 Progress |
| `extension/` | 扩展 SDK（Go） | 可选；实验性，见 2.D |

关键结论：**tdl 的“内核”价值集中在 `core/` 和 `pkg/`，而不是 `cmd/` 和 `app/`。** 我们应该复用的是前两者，自己重写 GUI 需要的业务流程（登录、聊天查询、任务队列、预览）。

### 1.3 运行数据布局

默认在用户主目录下：

```text
~/.tdl/
├── data/
│   └── <namespace>        # 每个账号一个 bolt 数据库文件
├── log/
│   └── latest.log         # zap console encoder，按大小轮转
├── extensions/
│   ├── tdl-xxx/           # 扩展二进制
│   └── data/<ext>/        # 扩展数据
└── ...
```

- namespace 对应账号，默认 `default`，CLI 用 `-n/--ns` 指定。
- `pkg/kv` 的 bolt 驱动是 **每个 namespace 一个文件**，bbolt 会对文件加锁。
- 因此：**不同 namespace 可以多进程同时使用；同一个 namespace 不能 GUI 和 CLI 同时打开**。这一点会直接影响桌面端和 CLI 的共存设计。
- session 存在 bolt 里，没有额外的加密层；文件权限和系统账户安全很重要。

### 1.4 对外接口现状（这是方案的关键）

| 能力 | 现状 | 对桌面端的影响 |
|---|---|---|
| 下载进度 | 终端进度条（ANSI、`\r` 刷新），无 JSON/事件 | CLI 包装必须解析终端输出，脆弱；直接用 `core/downloader.Progress` 才能拿到结构化进度 |
| 日志 | 写入 `~/.tdl/log/latest.log`，console 格式，不是 stdout | 不能靠 stdout 做机器接口；tail 日志也不适合做任务状态 |
| 登录 | `survey` 交互式提示；QR 是终端 ASCII 二维码 | GUI 需要自己实现登录状态机，或驱动 PTY（不推荐） |
| 守护进程 | 无 | 不能“启动一次 tdl，持续发命令” |
| HTTP API | 无；`download --serve` 只是把选中的媒体用 HTTP 提供下载 | 不是控制面 API，不能当 RPC |
| JSON 输出 | 只有 `chat ls -o json` 等少数工具 | 可做辅助，不足以支撑整个 UI |
| 扩展 | 独立 Go 二进制；tdl 通过临时 env 文件传 session/app 信息；官方文档标注 experimental | 可以作为“桥”，但生命周期、登录、稳定性都受限 |
| 版本 | 0.x，pre-1.0；`core`/`extension` 独立版本号 | 升级可能 breaking；必须锁版本、做适配层测试 |

### 1.5 版本与许可证

- 最新 release：`v0.20.4`，发布于 **2026-08-23**。
- master 最新提交：`70c561c`，**2026-08-29**，新增 `tdl update`。
- Go 版本要求：`go 1.25.8`。
- 根模块、`core`、`extension` 都在 Go module proxy 上有 `v0.20.4`。
- 许可证：**AGPL-3.0**。

> 建议：MVP 锁 `v0.20.4`，不要直接跟 master。等 `tdl update` 进入下一个 release 再评估。

---

## 2. 四种集成方式

### A. 直接包装 `tdl.exe` CLI

**做法**：桌面端把 `tdl.exe` 作为 sidecar，拼接命令行参数，解析 stdout/stderr，读取 `~/.tdl`。

**优点**

- 最快出 MVP；
- 上游二进制可独立替换，升级简单；
- 不需要 import tdl 代码，进程边界清晰；
- 已有先例可参考（见 2.E）。

**缺点**

- 下载进度只能解析终端进度条，tdl 改一下格式就可能坏；
- 登录要驱动交互式终端/PTY，QR 只能从 ASCII 输出里抠；
- 无法做真正的任务暂停/恢复、逐文件状态、速度统计；
- 没有结构化错误码；
- 同一个 namespace 下 GUI 和 CLI 会抢 bbolt 锁；
- 聊天浏览、消息分页需要额外 helper。

**适用**：只做“链接下载器”的 MVP，或作为高级用户的“原始参数”兜底。

### B. Go 库内嵌（已选：源码级内核）

**做法**：桌面应用本身是 Go 程序（Wails），直接 import `tdl/core`、`tdl/pkg`，在进程内创建 Telegram client、下载器、上传器。

**优点**

- 真正的结构化进度/错误/状态；
- 登录可以用 gotd 的 auth flow 自己做，QR 直接拿 URL 渲染成图片；
- 单二进制，无 IPC，性能最好；
- 不需要 fork，升级只改 `go.mod`；
- 可以直接复用 tdl 的 session、peers、模板、媒体解析。

**缺点**

- 内核和 UI 在同一进程，内核 panic 可能带崩 UI；
- 升级内核 = 重新构建整个应用，不能只换一个二进制；
- 直接链接 AGPL 代码，整个应用通常要 AGPL；
- tdl 的 `core` API 仍是 0.x，升级可能编译不过，需要适配层。

**适用**：你接受“升级依赖后重新发版”，追求开发效率和体验。

### C. Go 内核 sidecar（推荐用于长期产品）

**做法**：单独一个 `tgdesk-kernel` Go 二进制，import tdl 公共包，负责登录、Telegram 连接、聊天查询、下载/上传；UI 壳通过 **JSON-RPC over stdio** 或本地 WebSocket 与它通信。

**优点**

- 内核可独立构建、独立替换、独立测试（headless）；
- UI 壳和内核崩溃隔离；
- UI 技术栈可以换（Tauri/Electron/Wails 都行）；
- 协议稳定后，上游 API 变化只影响内核适配层；
- 更容易做“内核版本兼容检查/回滚”。

**缺点**

- 多一个进程、一套协议、一套生命周期管理；
- 高频进度事件需要批处理和背压；
- 开发量比 B 多，调试链路更长；
- 仍然要处理 bbolt 单写者问题。

**适用**：你把“内核独立更新/进程隔离”作为硬需求，或未来可能换 UI/做 headless/CLI。

### D. tdl extension 桥

**做法**：写一个 tdl 扩展二进制，tdl 启动它时通过 `TDL_EXTENSION` env 文件传入 session/app 信息；扩展里用 `extension.New` 拿到已认证的 gotd client，然后开一个本地 RPC 服务给 GUI。

**优点**

- 官方二进制就是内核，升级 `tdl.exe` 即可；
- 扩展 SDK 直接给 session，省去自己解析登录态；
- 可以复用 `core` 的下载/上传/转发。

**缺点**

- 扩展必须先有登录态才能启动（`tdl` 的扩展命令会加载 session）；
- 扩展是 `tdl` 的子进程，stdio 被 tdl 占用，RPC 要走额外 socket/port；
- 官方文档明确说扩展仍是 experimental，CLI 可能变；
- 首次登录仍要另做；
- 用户必须理解/安装扩展，产品体验复杂。

**适用**：极客向、必须“官方 tdl 二进制即内核”的场景；不建议作为第一版的主架构。

### E. 已有先例：`shine0228/tdl-desktop`

GitHub 上已有一个 AGPL 的 Tauri 项目 [shine0228/tdl-desktop](https://github.com/shine0228/tdl-desktop)，思路是：

- Tauri + React；
- 打包 `tdl.exe` 作为 sidecar；
- Rust 管理下载进程，解析 ANSI 进度条；
- 另写一个 Go `tdl-helper`，直接 import tdl/core 做登录态检查、聊天/消息读取；
- 通过 Tauri command 把 helper 的 JSON 输出给前端。

它验证了“Tauri + tdl sidecar + Go helper”可行，但也暴露了 A 方案的核心问题：`download.rs` 里大量代码在处理 `\r`、ANSI、百分比、文件名映射、节流；`login.rs` 里在解析终端 QR 块。我们如果重做，应该把这块收进 Go 内核，而不是继续在 Rust/TS 里解析终端。

### F. 四种方案对比

| 维度 | A CLI 包装 | B 库内嵌 | C 内核 sidecar | D extension 桥 |
|---|---|---|---|---|
| 开发速度 | 最快 | 快 | 中 | 慢 |
| 进度/错误结构化 | 差 | 最好 | 好 | 好 |
| 登录 GUI 化 | 差（PTY/解析） | 好 | 好 | 中（先有登录态） |
| 内核独立替换 | 最好 | 差 | 好 | 最好 |
| 崩溃隔离 | 好 | 差 | 好 | 好 |
| 上游升级影响 | 小（但输出格式易变） | 中 | 小（协议层隔离） | 中 |
| 许可证压力 | 较低（独立进程） | 高（AGPL 链接） | 中（独立进程） | 中 |
| 适合 | 下载器 MVP | 单二进制产品 | 长期产品 | 极客实验 |

---

## 3. 推荐架构

### 3.1 总体结构

默认推荐 **B（Wails 进程内内核）**，但代码上把内核做成可抽出的模块；如果后面要 C，只需要把 `kernel` 包换成 RPC client，UI 不动。

```text
┌──────────────────────────────────────────────────────────────┐
│                        Wails v3 Application                  │
│                                                              │
│  ┌────────────────────────┐      ┌─────────────────────────┐ │
│  │  React 19 + TypeScript │      │  Go Presentation Layer  │ │
│  │  Vite / Tailwind       │◄────►│  Wails bindings/events  │ │
│  │  TanStack Virtual      │      │  window/tray/dialog     │ │
│  └────────────────────────┘      └───────────┬─────────────┘ │
│                                              │               │
│                                  ┌───────────▼─────────────┐ │
│                                  │   internal/kernel       │ │
│                                  │   Auth/Chat/Message     │ │
│                                  │   Download/Upload       │ │
│                                  │   Settings/Events       │ │
│                                  └───────────┬─────────────┘ │
│                                              │               │
│              ┌───────────────────────────────┼────────────┐  │
│              │                               │            │  │
│   ┌──────────▼─────────┐         ┌───────────▼──────────┐ │  │
│   │ tdl core/pkg        │         │  App Store            │ │  │
│   │ gotd client         │         │  SQLite/JSON          │ │  │
│   │ downloader/uploader │         │  tasks/settings       │ │  │
│   │ session/peers       │         │  cache index          │ │  │
│   └──────────┬──────────┘         └───────────────────────┘ │  │
│              │                                              │  │
│   ┌──────────▼─────────┐                                    │  │
│   │ ~/.tdl/data/<ns>   │  bbolt（session/peers/resume）      │  │
│   └────────────────────┘                                    │  │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 为什么要多一层 `internal/kernel`

不要让 React 代码或 Wails binding 直接碰 `tg.*`、`gotd` 类型。原因：

1. **上游 API 会变**：tdl 0.x，`core` 也可能改签名；适配层是唯一需要改的地方。
2. **UI 需要稳定 DTO**：`tg.Message` 字段极多且包含大量指针/接口，直接序列化给前端又大又难用。
3. **可测试**：kernel 可以 headless 跑单测，不依赖 WebView。
4. **可替换**：今天进程内，明天可以换成 sidecar，UI 的 service 接口不变。

建议的 Go 接口（简化）：

```go
type Kernel interface {
    Auth() AuthService
    Chats() ChatService
    Messages() MessageService
    Downloads() DownloadService
    Uploads() UploadService
    Settings() SettingsService
    Close(ctx context.Context) error
}

type AuthService interface {
    Status(ctx context.Context) (AuthStatus, error)
    StartQR(ctx context.Context) (<-chan AuthEvent, error)
    SubmitPhone(ctx context.Context, phone string) error
    SubmitCode(ctx context.Context, code string) error
    SubmitPassword(ctx context.Context, password string) error
    Logout(ctx context.Context) error
}
```

事件用统一的 bus 往外发：

```go
type Event struct {
    Type string      `json:"type"`
    Seq  uint64      `json:"seq"`
    Data any         `json:"data"`
}
```

Wails 层只做 `runtime.EventsEmit(ctx, "kernel:"+e.Type, e.Data)`。

### 3.3 建议的工程结构

Wails 的具体模板目录可能略有差异，但建议把“UI 壳 / 内核 / 平台能力”分开：

```text
tgdesk/
├─ main.go                     # Wails 应用入口（或 cmd/tgdesk/main.go）
├─ internal/
│  ├─ app/                     # Wails bindings、窗口/托盘/菜单、事件桥
│  ├─ kernel/                  # UI 无关的内核接口与实现
│  │  ├─ auth.go
│  │  ├─ chats.go
│  │  ├─ messages.go
│  │  ├─ downloads.go
│  │  ├─ uploads.go
│  │  ├─ settings.go
│  │  └─ events.go
│  ├─ telegram/                # gotd 封装、peer 解析、tg -> DTO
│  ├─ store/                   # SQLite/JSON：任务、设置、窗口状态
│  ├─ media/                   # 缩略图、缓存、本地资源服务
│  └─ platform/                # 路径、代理、通知、单实例、开机启动
├─ frontend/
│  ├─ src/
│  │  ├─ routes/
│  │  ├─ components/
│  │  ├─ stores/
│  │  ├─ lib/
│  │  └─ i18n/
│  ├─ package.json
│  └─ vite.config.ts
├─ build/                      # 图标、manifest、安装器资源
├─ temp/                       # 所有临时分析/spike（.gitignore）
└─ go.mod
```

原则：

- `internal/kernel` 不 import Wails；
- `internal/telegram` 不 import React/前端 DTO 之外的东西；
- `internal/app` 只做绑定和平台能力，不写 Telegram 业务；
- 所有 `tg.*` 类型止步于 `internal/telegram`，不要泄漏到 binding/前端。

### 3.4 登录：不要复用 `app/login`，自己写状态机

`app/login` 依赖 `survey`、`viper` 和终端，不适合 GUI。但底层 gotd 的 auth flow 很清晰，建议在 kernel 里实现：

**QR 登录（首选）**

1. 打开 tdl 的 KV，设置 `key.App()` 为 `tdl/pkg/tclient.AppDesktop`（tdl 的 QR 登录也这么做）。
2. 用 `pkg/tclient.New(..., login=true)` 创建 client。
3. `client.Run` 内调用 `client.QR().Auth(ctx, qrlogin.OnLoginToken(dispatcher), callback)`。
4. callback 拿到 `token.URL()`，通过事件发给 UI；UI 用 `qrcode` 库渲染成图片。
5. 如果返回 `SESSION_PASSWORD_NEEDED`，发 `auth.need_password` 事件，等待 UI 提交 2FA 密码，再 `client.Auth().Password`。
6. 成功后 gotd 会把 session 写入 `storage.Session`，后续 `pkg/tclient.New(..., login=false)` 直接复用。

**手机号验证码（可选）**

实现 `auth.UserAuthenticator` 的 `Phone/Code/Password`，每个方法阻塞等待 UI 的答复 channel：

```go
type uiAuth struct {
    events  chan<- AuthEvent
    answers <-chan string
}
```

**导入 tdata（高级）**

复用 `gotd/td/session/tdesktop`，读取 Telegram Desktop 的 `tdata`，再 `session.Loader.Save` 到 tdl KV。已实现自动导入；带本地 passcode 的 tdata 仍需后续支持。

**注意**

- 不要把手机号、验证码、2FA 密码写日志。
- QR 登录使用的是 tdesktop 的公开 API ID；这是 tdl 已有的做法，但第三方客户端仍有账号风控风险，不建议高频自动化。
- 登录成功后不要立刻并发大量请求；先 `Ping`/`Self`，再拉聊天列表。

### 3.5 下载：用 `core/downloader`，自己做任务调度

`core/downloader` 的模型是：

```go
type Progress interface {
    OnAdd(elem Elem)
    OnDownload(elem Elem, state ProgressState)
    OnDone(elem Elem, err error)
}

type Options struct {
    Pool     dcpool.Pool
    Threads  int
    Iter     Iter
    Progress Progress
}

func (d *Downloader) Download(ctx context.Context, limit int) error
```

它很适合做“单文件多线程下载”，但 `Download(ctx, limit)` 是一个批次级别的 API。桌面端需要“每个任务可单独暂停/取消”，建议：

- **每个任务一个 `Downloader` 实例**，`Iter` 只吐一个 `Elem`，`limit=1`；
- 用一个全局 worker pool 控制同时下载的任务数；
- 每个任务有自己的 `context.WithCancel`，暂停/取消只 cancel 这个任务；
- `dcpool.Pool` 全局共享，避免每个任务重复建连接池；
- `Progress.OnDone` 里更新任务状态；`OnDownload` 里按 100～250ms 聚合后发事件。

伪代码：

```go
type taskRunner struct {
    pool    dcpool.Pool
    threads int
}

func (r *taskRunner) run(ctx context.Context, t *Task, elem downloader.Elem) error {
    d := downloader.New(downloader.Options{
        Pool:     r.pool,
        Threads:  r.threads,
        Iter:     newSingleIter(elem),
        Progress: newTaskProgress(t),
    })
    return d.Download(ctx, 1)
}
```

注意一个容易踩的细节：`core/downloader` 对“非用户取消”的单文件错误是 **记日志后吞掉** 的，`Download` 本身可能返回 `nil`。所以任务失败状态必须在 `Progress.OnDone(elem, err)` 的 `err` 里判断，不能只看 `Download` 的返回值；`context.Canceled` 则映射为 `paused/canceled`，不要当失败。

**断点续传的现实**

tdl 的 resume 是 **文件级** 的：它在 KV 里记录已完成的消息位置，重新运行时跳过已完成文件；单个文件下载失败/取消时，`.tmp` 文件会被删除，下次从 0 开始。它不是字节级断点续传。

所以第一版建议：

- 任务级“暂停”= 取消当前下载，标记 `paused`，恢复时从 0 重下；
- 或者把“暂停”定义为“不开始下一个任务”，当前文件继续下完；
- 真正的字节级续传需要自己实现 range 下载/分片状态，放到 P2。

**文件命名/去重**

- 复用 `pkg/tplfunc` 的模板函数，支持 `{{ .DialogID }}_{{ .MessageID }}_{{ filenamify .FileName }}`；
- 复用 `core/util/fsutil` 的后缀/文件名处理；
- 下载前检查目标文件是否存在、大小是否一致；`--skip-same` 语义可复用；
- 文件名必须做 Windows 非法字符/保留名清理，注意路径长度。

### 3.6 聊天/消息查询：tdl 没有现成服务，需要自己写

`app/chat` 是 CLI 输出导向的，不能直接当 API。建议在 kernel 里用 gotd 的 query API 自己实现：

**聊天列表**

```go
manager := peers.Options{Storage: storage.NewPeers(kvd)}.Build(api)
iter := query.GetDialogs(api).BatchSize(100).Iter()
```

- 遍历 `dialogs.Elem`，用 `peers.Manager.Apply` 更新 access hash；
- 映射成 DTO：`id/title/type/username/unread/lastMessage/photo`；
- 分页/增量刷新；
- 参考 `app/chat/ls.go` 里对 deleted/inaccessible dialog 的容错处理。

**消息历史**

```go
iter := query.Messages(api).GetHistory(peer.InputPeer()).BatchSize(50).Iter()
```

- 只取 `*tg.Message`，过滤 service message；
- 用 `core/tmedia` 提取媒体信息；
- 转 DTO 时保留 `grouped_id`、`reply_to`、`topic_id`、`date`、`text`、`entities`；
- 文本渲染不要直接 `innerHTML`；把 Telegram entities 转成受控的富文本片段。

**头像/缩略图**

- 头像：`users.getFullUser` / `photos.getUserPhotos`，或直接用 `tg.User.Photo` 的小尺寸；
- 媒体缩略图：`tmedia.GetDocumentThumb`、`tg.PhotoSize`；
- 用 `upload.getFile` 拉小图，落盘缓存；
- UI 通过自定义协议/本地 HTTP 读取缓存文件，不要把大图 base64 塞进事件。

### 3.7 事件、背压与性能

下载进度是高频事件。如果每个 `WriteAt` 都往前端发一次，WebView bridge 会被打爆。建议：

- kernel 内部按任务维护 `downloaded/total/speed/eta`；
- 每 **200ms** 聚合一次，发一个批次：

```json
{
  "type": "download.progress",
  "data": [
    {"taskId":"t1","done":123,"total":456,"speed":789,"eta":12},
    {"taskId":"t2","done":100,"total":100,"speed":0,"eta":0}
  ]
}
```

- 任务状态变化（queued/running/paused/done/failed）立即发，不节流；
- 事件带 `seq`，前端丢弃过期批次；
- UI 侧用 `requestAnimationFrame`/浅比较更新，避免整棵列表重渲染；
- 如果走 sidecar，stdout 只允许 JSON-RPC；日志走 stderr。

### 3.8 存储与 bbolt 锁

这是桌面端和 CLI 共存时最容易踩的坑。

- tdl 的 session、peers、resume 都在 `~/.tdl/data/<namespace>` 的 bbolt 文件里。
- bbolt 是单写者、文件锁；**同一个 namespace 同时开 GUI 和 `tdl` CLI 会报 “database is used by another process”**。
- 设计选择：
  1. **GUI 独占当前 namespace**：GUI 运行时，CLI 不要用同一个 `-n`；提供一个“退出内核以使用 CLI”的按钮/说明。
  2. **GUI 使用独立 namespace**：例如 `tgdesk`，但这样不能复用用户已有的 `default` 登录态，首次要重新登录。**当前采用此方案**，避免 GUI 与 CLI 抢 bolt 锁，也避免 Logout 清掉 CLI 会话。
  3. **登录态导入/导出**：GUI 启动时短暂打开 `default` 读取 session，复制到自己的 namespace；之后 GUI 独占自己的库。这个方案体验最好，但要多写同步逻辑。
  4. **file 驱动**：tdl 支持 `--storage type=file`，但性能和并发也不好，不建议作为桌面主存储。

建议 MVP 用 **方案 1 + 明确的错误提示**，P1 再做方案 3。

应用自己的数据（任务历史、设置、窗口状态、缓存索引）不要写进 tdl 的 bolt；用单独的 SQLite 或 JSON。SQLite 建议 `modernc.org/sqlite`（纯 Go，无 CGO）；如果不想加依赖，MVP 可以先用 bbolt/JSON，接口留好。

### 3.9 更新模型

**如果是 B（进程内）**

- 内核升级 = 升级 `go.mod` 里的 `github.com/iyear/tdl` / `core` 版本，重新构建应用；
- 应用更新器负责整包更新；
- 启动时显示 `tdl core version`，方便报错排查。

**如果是 C（sidecar）**

- `tgdesk-kernel` 单独版本号，内置 `tdl core version`；
- UI 启动时握手，检查 `protocolVersion` 和 `kernelVersion`；
- 内核更新可以随应用更新，也可以单独下载替换；
- 替换前必须确保没有运行中的任务，校验 SHA-256，原子 rename；
- 保留上一版内核，启动失败可回滚。

**上游升级策略**

- 锁精确版本（不要 `@latest`）；
- 适配层写 contract tests：登录状态、聊天列表 DTO、下载进度、取消、错误映射；
- 每次升级先跑 `go test ./...` + 一个真实账号的 smoke test；
- 关注 `core` 的 breaking change；0.x 没有语义化版本保证。

### 3.10 安全

- 本地服务只绑定 `127.0.0.1`（如果走 WebSocket），加随机 token + Origin 校验；
- 如果走 stdio，父子进程私有通道，不需要端口；
- 不在日志/崩溃报告里输出手机号、验证码、2FA 密码、session、代理密码；
- Windows 上 `~/.tdl` 目录 ACL 收紧；Unix 上 `0700` 目录、`0600` 文件；
- 前端 CSP 禁止远程脚本；消息文本按纯文本/受控实体渲染，禁止 `dangerouslySetInnerHTML`；
- 代理密码可以放系统凭据库（Windows Credential Manager / macOS Keychain），不要明文写 JSON；
- 文件下载路径做目录穿越校验，禁止 `..` 逃逸。

---

## 4. 技术栈对比

### 4.1 候选对比（2026-11 版本）

| 方案 | 最新稳定版 | 语言 | 包体 | UI 一致性 | Go 内核集成 | 跨平台 | 开发效率 | 适合 |
|---|---|---|---|---|---|---|---|---|
| **Wails v3** | 3.1.0（2026-11-01） | Go + TS | 小（系统 WebView） | Windows 好，Linux WebKitGTK 一般 | **进程内直接调用** | Win/mac/Linux | 高 | Go 团队、单二进制 |
| Wails v2 | 2.17.1 | Go + TS | 小 | 同上 | 直接调用 | Win/mac/Linux | 高 | 保守、成熟 |
| **Tauri 2** | 2.12.5（2026-10-21） | Rust + TS | 小 | 系统 WebView | 需要 Go sidecar/FFI | Win/mac/Linux | 中 | 强安全/ updater、愿意写 Rust |
| **Electron** | 45.3.0（2026-11-10） | TS/Node | 大（100MB+） | **最好**（自带 Chromium） | 需要 Go sidecar | Win/mac/Linux | 最高（前端） | 媒体重、JS 团队 |
| Flutter | 3.x | Dart | 中 | 好（Skia） | FFI/sidecar | Win/mac/Linux | 中 | 已有 Flutter 团队 |
| Fyne/Gio | - | Go | 中 | 一般 | 直接调用 | Win/mac/Linux | 低（复杂 UI） | 工具型小应用 |

> Tauri 3 目前还是 `3.0.0-alpha.6`（2026-11-06），不建议生产使用；Tauri 2 是稳定线。
> Wails v3 很新，发布节奏是 weekly；生产要锁 `v3.1.0` 并关注 changelog。保守可选 v2.17.1。

### 4.2 首选组合：Wails v3 + React

**为什么是 Wails 而不是 Tauri/Electron**

- tdl 是 Go 的，Wails 的后端也是 Go，**可以直接 import `core`，不需要 sidecar、不需要 FFI、不需要 Rust**；
- 单二进制，包体远小于 Electron；
- Wails v3 有服务注册、事件、托盘、菜单、多窗口、文件对话框，覆盖桌面端需求；
- WebView2 在 Windows 11 上默认存在，Windows 10 可引导安装；
- 前端可以用最成熟的 React 生态。

**风险**

- Wails v3 刚发布不久，API 可能还会动；锁版本，必要时选 v2.17.1；
- Linux 的 WebKitGTK 渲染/视频编解码一致性不如 Chromium；如果 Linux 是重点，考虑 Electron；
- macOS 公证/签名需要 macOS 构建机。

**推荐依赖**

- 前端：`react`, `react-dom`, `typescript`, `vite`, `tailwindcss`, `@radix-ui/*`, `@tabler/icons-react`, `clsx`, `tailwind-merge`, `@tanstack/react-virtual`, `@tanstack/react-query`, `zustand`, `i18next`, `yet-another-react-lightbox`。
- Go：`github.com/iyear/tdl`, `github.com/iyear/tdl/core`, `go.uber.org/zap`, `golang.org/x/sync`, `modernc.org/sqlite`（可选）。
- 测试：Go `testing` + `testify`；前端 `vitest` + `playwright`；协议 contract tests。

### 4.3 备选：Tauri 2 + Go sidecar

**适合**

- 你把“内核独立替换/进程隔离”作为第一优先级；
- 你愿意维护 Rust 壳（其实很薄：窗口、托盘、sidecar 管理、updater、deep link）；
- 你希望用 Tauri 的 updater/权限模型/插件生态。

**结构**

```text
Tauri (Rust) ── spawn ──> tgdesk-kernel (Go)
     │                         │
     └── React UI <── events ──┘
            JSON-RPC over stdio
```

**注意**

- Rust 不要解析 tdl 终端输出；所有 Telegram 逻辑都放 Go kernel；
- Rust 只做进程管理、窗口、托盘、文件对话框、更新；
- sidecar 的 stdout 只走 JSON-RPC，stderr 走日志；
- 用 Tauri 的 sidecar/updater 能力，不要自己造轮子。

### 4.4 备选：Electron 45 + Go sidecar

**适合**

- 你要做“完整 Telegram 客户端”，大量视频/音频/图片预览；
- 团队是前端/Node 背景，不想碰 Rust/Go UI；
- 不介意 100MB+ 安装包和更高内存。

**优点**

- Chromium 自带较完整的媒体编解码，视频播放一致性最好；
- Node 的 `child_process`/IPC/自动更新/打包生态最成熟；
- 前端开发速度最快。

**缺点**

- 包体/内存大；
- 需要维护 Electron 主进程 + Go kernel 两套生命周期；
- 安全面更大（Node integration、CSP、远程内容）。

### 4.5 不推荐

- **Flutter**：UI 可以做得很漂亮，但 Go 集成要 FFI/sidecar，桌面端托盘/更新/文件对话框生态不如 Wails/Tauri/Electron；对这个项目没有明显收益。
- **Fyne/Gio**：纯 Go 很诱人，但聊天列表、消息富文本、媒体预览、主题化这些复杂 UI 的开发效率明显低于 Web 技术。
- **tdl extension 作为主架构**：实验性 + 登录态前置 + 额外 socket，产品复杂度高，适合极客实验，不适合第一版。

---

## 5. 功能范围与里程碑

### 5.1 产品定位建议

第一版不要做“完整 Telegram 客户端”。建议定位：

> **一个以 tdl 为下载内核、带聊天浏览的 Telegram 媒体下载与管理桌面端。**

也就是：能登录、能看聊天/消息、能选择消息下载、能管理任务；不强调发消息、通话、Secret Chat、贴纸/表情生态。

### 5.2 界面信息架构

**界面骨架（Telegram 式三栏）**

```text
┌────────────────────────────────────────────────────────────────────┐
│ 账号 ▾   搜索聊天/消息   连接状态   任务(3)   设置                  │
├──────────────┬─────────────────────────────────┬───────────────────┤
│ 聊天列表      │ 消息列表                         │ 下载任务           │
│ [全部]       │ ┌─────────────────────────────┐ │ [进行中 2]         │
│ [频道]       │ │ 文件卡片 / 图片缩略图        │ │ 文件 A  42%  ███   │
│ [群组]       │ │ 文件名、大小、下载按钮       │ │ 文件 B  排队中      │
│ ...          │ └─────────────────────────────┘ │ [已完成]           │
│              │ ...                             │ ...                │
└──────────────┴─────────────────────────────────┴───────────────────┘
```

- 右栏可折叠；窗口窄时变成抽屉；
- 聊天列表/消息列表用虚拟滚动；
- 任务面板是“下载器”产品的核心，不要藏太深；
- 深色/浅色主题、紧凑/舒适密度；
- 中文/英文 i18n 从第一天做，不要后补。

### 5.3 MVP（P0，建议 4～6 周，单人熟悉技术栈）

**账户**

- QR 登录（首选）、手机号验证码 + 2FA（可选）、退出登录、登录态检测；
- 单账号；namespace 可配置。

**聊天/消息**

- 聊天列表（虚拟滚动、搜索过滤、未读/类型图标）；
- 消息历史（分页、媒体卡片、图片缩略图）；
- 消息链接粘贴解析（`t.me/...`）；
- 不发送消息，不做实时更新（或只做轮询刷新）。

**下载**

- 从消息/链接/相册创建下载任务；
- 任务队列：并发数、开始/暂停/取消/重试；
- 实时进度：文件级进度、总进度、速度、ETA；
- 下载目录、命名模板、扩展名过滤、跳过同名同大小、takeout；
- 完成后打开文件夹/定位文件。

**应用**

- 设置：代理、并发/线程、下载目录、模板、主题、语言；
- 托盘：显示/隐藏、暂停全部、退出；
- 通知：完成/失败；
- 日志/诊断信息（脱敏）；
- Windows 安装包/便携版。

### 5.4 P1（第二阶段）

- 多账号（多 namespace）；
- 消息搜索、按类型/日期过滤；
- 批量选择/批量下载；
- 上传；
- 转发/克隆（direct/clone）；
- 导出消息 JSON（复用/参考 `app/chat/export.go`）；
- 图片/视频预览缓存；
- 任务历史持久化、失败重试策略；
- 自动更新；
- 更完整的代理/NTP/限速设置。

### 5.5 P2（第三阶段）

- 字节级断点续传；
- 视频在线播放/拖动（需要 range server + 缓存）；
- 定时任务/订阅；
- 扩展市场/tdl 扩展管理；
- 备份/恢复/迁移；
- 多平台（macOS/Linux）；
- 插件/脚本。

### 5.6 明确不做（第一版）

- 发送普通消息/媒体消息（除非 P1 上传）；
- 语音/视频通话；
- Secret Chat；
- 完整的贴纸/GIF/表情生态；
- 多账号同时在线（P1 再说）；
- 自建 Telegram API 服务。

---

## 6. 关键风险与决策点

### 6.1 AGPL-3.0（最高优先级）

tdl 是 AGPL-3.0。两条路：

1. **直接 import/link tdl 代码**（B/C 的内核仍然 link）：整个衍生应用通常需要按 AGPL-3.0 分发，提供源码。适合开源项目。
2. **仅通过独立进程调用未修改的 `tdl.exe`**（A）：法律上更接近“聚合”，但仍有争议；如果闭源商业，务必找律师确认，不要仅凭工程判断。

> 这不是法律意见。建议在写第一行代码前确定许可证策略。

### 6.2 bbolt 单写者

- GUI 和 CLI 同 namespace 不能同时开；
- 多账号可以不同 namespace 并行；
- 设计好“GUI 独占/导入登录态/退出内核”的交互，避免用户困惑。

### 6.3 登录与账号风控

- QR 登录最顺手，但依赖 tdesktop API ID；
- 手机号登录需要处理验证码、2FA、多次重发、flood wait；
- 不要自动高频重试；
- 不要在日志里记录敏感信息；
- 第三方客户端有账号风险，产品文案要说明。

### 6.4 断点续传的预期管理

tdl 的 resume 是文件级，不是字节级。UI 上不要把“暂停”宣传成“随时续传同一个文件的任意位置”；第一版要么从 0 重下，要么明确“当前文件下完再暂停”。

### 6.5 媒体编解码

- Wails/Tauri 用系统 WebView：Windows WebView2 对 H.264/AAC 没问题，但 HEVC/AV1/MKV 支持取决于系统；
- 如果视频预览是核心卖点，Electron 更稳；
- 第一版可以只做图片预览，视频先下载再打开系统播放器。

### 6.6 上游 API 变化

- tdl 0.x，`core` 没有稳定 API 承诺；
- 锁版本 + 适配层 + contract tests；
- 不要在上百个文件里直接 import `gotd`/`tg`，集中到 `internal/telegram`；
- 升级时先跑编译和一个最小 smoke test。

### 6.7 命名

搜索结果显示已有一个 Telegram CRM 产品使用 “TGDesk” 名称（`tg.wadesk.io`）。如果这个项目要公开发布，建议先做商标/搜索冲突检查，或换一个更独特的名字。

### 6.8 Windows 分发

- 代码签名（EV/OV 证书）能减少 SmartScreen 警告；
- WebView2 Runtime 在 Win11 自带，Win10 需要检测/引导安装；
- 安装包/便携版两条线；
- 杀软误报：未签名 + 下载 Telegram 内容的工具容易被误报，签名和透明构建很重要。

---

## 7. 下一步建议

### 7.1 先做一个 1～2 天的技术 spike

目标不是做 UI，而是验证最危险的假设：

1. Wails v3 hello world 能在这台 Windows 上跑起来；
2. 在 Wails 的 Go 后端 import `tdl/core`、`pkg/tclient`，能创建 client；
3. QR 登录能拿到 token URL，前端能渲染二维码；
4. 登录后能拉取聊天列表（前 20 个）；
5. 选一条消息，用 `core/downloader` 下载一个文件，进度能到前端；
6. 退出应用后 session 还在，下次不用重新登录。

如果这 6 步都通，后面就是工程化；如果第 2/3 步卡住，再考虑 Tauri + sidecar。

### 7.2 还需确认的问题

1. **范围**：A) 下载管理器 + 聊天浏览（推荐 MVP）；B) 完整 Telegram 客户端；C) 只做批量下载/转发工具。
2. **许可证/商业模式**：A) AGPL 开源；B) 闭源商业；C) 内部使用，不分发。
3. **目标平台**：Windows only / Windows + macOS / 三平台。
4. **团队技术偏好**：Go 熟 / TS 熟 / 愿意写 Rust / 不想碰 Rust。

已确认：**内核更新 = 升级依赖后重新构建**，因此当前不走 sidecar 主线。

我的默认假设是：**Windows 优先、AGPL 开源、MVP 先做下载管理器 + 聊天浏览**。如果许可证或范围不成立，技术选型需要调整（尤其是闭源商业场景）。

---

## 附录 A：如果走 sidecar，JSON-RPC 草案

**传输**：stdio，一行一个 JSON 对象；stdout 只走协议，stderr 走日志。

**握手**

```json
{"jsonrpc":"2.0","method":"kernel.ready","params":{"protocol":1,"kernelVersion":"0.1.0","tdlVersion":"v0.20.4"}}
```

**请求**

```json
{"jsonrpc":"2.0","id":1,"method":"auth.status","params":{}}
{"jsonrpc":"2.0","id":2,"method":"auth.startQr","params":{"namespace":"default"}}
{"jsonrpc":"2.0","id":3,"method":"auth.submit","params":{"kind":"password","value":"..."}}
{"jsonrpc":"2.0","id":4,"method":"chats.list","params":{"limit":100,"offset":0}}
{"jsonrpc":"2.0","id":5,"method":"messages.list","params":{"chatId":"...","limit":50,"offsetId":0}}
{"jsonrpc":"2.0","id":6,"method":"download.enqueue","params":{"items":[...],"dir":"D:\\Downloads"}}
{"jsonrpc":"2.0","id":7,"method":"download.pause","params":{"taskId":"..."}}
{"jsonrpc":"2.0","id":8,"method":"download.cancel","params":{"taskId":"..."}}
```

**通知**

```json
{"jsonrpc":"2.0","method":"auth.event","params":{"kind":"qr","url":"tg://login?token=..."}}
{"jsonrpc":"2.0","method":"download.progress","params":{"seq":42,"items":[{"taskId":"t1","done":123,"total":456,"speed":789}]}}
{"jsonrpc":"2.0","method":"download.state","params":{"taskId":"t1","state":"done","path":"D:\\..."}}
```

**约定**

- `protocol` 不兼容时 UI 拒绝连接；
- 所有耗时方法立即返回 `accepted`，结果通过事件推送；
- 进度通知可丢中间帧，最终状态不可丢；
- 退出时先 `kernel.shutdown`，等待任务落盘，再杀进程。

## 附录 B：tdl 代码地图

| 你要做的事 | 先看这些文件 |
|---|---|
| 创建 Telegram client | `core/tclient/tclient.go`、`pkg/tclient/tclient.go` |
| 登录 | `app/login/qr.go`、`app/login/code.go`、`app/login/desktop.go` |
| 下载 | `core/downloader/downloader.go`、`core/downloader/progress.go`、`app/dl/iter.go` |
| 上传 | `core/uploader/uploader.go`、`app/up/iter.go` |
| 转发 | `core/forwarder/forwarder.go`、`app/forward/iter.go` |
| 聊天列表 | `app/chat/ls.go` |
| 消息导出 | `app/chat/export.go` |
| 媒体信息 | `core/tmedia/*.go` |
| 存储/会话 | `core/storage/*.go`、`pkg/kv/*.go`、`pkg/key/key.go` |
| 链接解析 | `pkg/tmessage/urls.go`、`core/util/tutil/*.go` |
| 命名模板 | `pkg/tplfunc/*.go` |
| 全局 flag/配置 | `cmd/root.go` |
| 扩展机制 | `extension/extension.go`、`cmd/extension.go`、`pkg/extensions/manager.go` |

## 附录 C：参考资料

- tdl 仓库：<https://github.com/iyear/tdl>
- tdl 文档：<https://docs.iyear.me/tdl/>
- tdl v0.20.4 release：<https://github.com/iyear/tdl/releases/tag/v0.20.4>
- core 模块：<https://pkg.go.dev/github.com/iyear/tdl/core>
- extension 模块：<https://github.com/iyear/tdl/tree/master/extension>
- 已有 Tauri 先例：<https://github.com/shine0228/tdl-desktop>
- Wails v3.1.0：<https://github.com/wailsapp/wails/releases/tag/v3.1.0>
- Tauri v2.12.5：<https://github.com/tauri-apps/tauri/releases/tag/tauri-v2.12.5>
- Electron v45.3.0：<https://github.com/electron/electron/releases/tag/v45.3.0>
