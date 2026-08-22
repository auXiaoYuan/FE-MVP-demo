# 敲木鱼 · 设计文档（DESIGN.md）

> 版本：0.1.0 ｜ 日期：见 git 提交记录 ｜ 状态：MVP 已完成

## 1. 概述

「敲木鱼」是一个极简的桌面应用 MVP：用户首次启动时设置个人信息，之后进入敲击主界面，
每次点击木鱼触发动画与音效、累计敲击次数 +1，并由后端随机返回一句祝福语。

核心原则：**功能最简单、前后端分离、数据本地持久化（SQLite）、开箱即用**。

## 2. 需求梳理

| 编号 | 需求 | 说明 |
| --- | --- | --- |
| R1 | 首次启动设置界面 | 选择头像、填写昵称/法号（必填）、心愿（可选）；设置后**不可更改** |
| R2 | 敲击主界面 | 木鱼敲击动画、音效、`+1` 飘字、波纹、累计次数展示 |
| R3 | 随机祝福语 | 每次敲击由后端随机返回一句祝福语 |
| R4 | 前后端分离 | 前端通过 HTTP 调用后端 API；后端独立、可单独运行 |
| R5 | 数据存储 | SQLite：用户表 + 累计敲击次数 |
| R6 | 交付物 | 源代码、设计文档、构建脚本、Windows/macOS 构建产物、GitHub 仓库 + PR |

## 3. 技术选型

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 前端 | React 18 + Vite 5 + TypeScript | 生态成熟、构建快、类型安全 |
| 后端 | Rust（axum + rusqlite） | 独立 HTTP 服务、SQLite 内嵌（`bundled` 零系统依赖）、单文件二进制、性能好 |
| 桌面壳 | Tauri 2 | 产物小（≈10MB）、系统 WebView、Rust 后端可直接内嵌 |
| 音效 | Web Audio API 实时合成 | 无需音频资源文件，仓库干净 |
| 数据库 | SQLite（rusqlite bundled） | 单文件、零运维，适合本地单用户应用 |
| CI | GitHub Actions | 自动构建 Windows / macOS（Intel + Apple Silicon）产物 |

### 为什么这样组合

- 用户要求「React + Next.js + Vite + Tauri」：React 与 Vite 是前端构建核心；Tauri 提供桌面壳。
  本项目无需服务端渲染，因此不引入 Next.js（其 SSR 特性在纯本地桌面场景无收益，反而增加复杂度），
  在 README 中已说明取舍。
- 后端选择 Rust 而非 Node：桌面端产物需要「免安装、免运行时」的单文件可执行程序；
  Rust 编译产物天然满足，且可与 Tauri 共享同一工具链（只需 Rust + 系统 WebView）。

## 4. 总体架构

```
┌──────────────────────────── 桌面进程（Tauri 应用） ────────────────────────────┐
│                                                                                │
│  ┌───────────────────┐   HTTP (127.0.0.1:随机端口)   ┌──────────────────────┐ │
│  │  React 前端 (SPA) │ ───────────────────────────▶ │  后端 muyu-backend    │ │
│  │  - 设置界面        │                               │  (axum + rusqlite)   │ │
│  │  - 敲击界面        │ ◀─────────────────────────── │  SQLite: users /     │ │
│  │  WebView2/WKWebView│                               │  knock_stats         │ │
│  └───────────────────┘   JSON API                    └──────────────────────┘ │
│          ▲  ▲                                            ▲ 内嵌于同一进程      │
│          │  └── Tauri invoke: get_backend_port（获取后端端口）                  │
│          └── 首次启动通过 POST /api/user 设置信息                               │
└────────────────────────────────────────────────────────────────────────────────┘

浏览器开发模式：
  前端 Vite dev (localhost:1420) ──▶ 后端独立运行 (127.0.0.1:17823)
```

- **后端既独立又可内嵌**：`backend/` 是独立 Rust crate，`cargo run -p muyu-backend` 可单独
  运行（默认 `127.0.0.1:17823`）；桌面端启动时将其作为本地 HTTP 服务内嵌运行（随机端口），
  代码与数据完全一致。
- **数据库位置**：桌面端使用系统应用数据目录
  （Windows：`%APPDATA%\com.muyu.demo\muyu.db`；macOS：`~/Library/Application Support/com.muyu.demo/muyu.db`），
  独立运行模式默认 `./data/muyu.db`。

## 5. 后端设计

### 5.1 接口（共 5 个）

所有接口返回 JSON，成功统一包裹 `{ "data": ... }`，失败返回 `{ "error": "..." }`。

| 方法 | 路径 | 说明 | 请求体 | 成功响应 | 失败 |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | 健康检查 | - | `{ "data": { "ok": true } }` | - |
| GET | `/api/user` | 获取用户信息 | - | `{ "data": User }` | 404 `USER_NOT_SETUP` |
| POST | `/api/user` | 首次设置用户信息 | `{ nickname, wish?, avatar? }` | 201 `{ "data": User }` | 400 参数错误 / 409 已设置 |
| POST | `/api/knock` | 敲击一次 | - | `{ "data": { "count", "blessing" } }` | 404 `USER_NOT_SETUP` |
| GET | `/api/count` | 获取累计敲击次数 | - | `{ "data": { "count" } }` | - |

`User` 结构：

```json
{
  "id": 1,
  "nickname": "小和尚",
  "wish": "愿家人平安健康",
  "avatar": "🙏",
  "total_knocks": 3,
  "created_at": 1730000000
}
```

校验规则：昵称必填、去空格、≤30 字符；心愿 ≤100 字符；头像 ≤4 个字符（emoji）。
用户信息一旦创建即不可修改、不可重复创建（防御性校验 409）。

### 5.2 数据库

```sql
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname   TEXT NOT NULL,
  wish       TEXT NOT NULL DEFAULT '',
  avatar     TEXT NOT NULL DEFAULT '🙏',
  created_at INTEGER NOT NULL
);

CREATE TABLE knock_stats (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id),
  total_knocks    INTEGER NOT NULL DEFAULT 0,
  last_knocked_at INTEGER
);
```

- 单用户语义：`users` 最多一行（首次启动设置）。
- `knock_stats` 与 `users` 一对一，`total_knocks` 通过
  `INSERT ... ON CONFLICT DO UPDATE` 原子自增，避免并发敲击丢失计数。

### 5.3 祝福语

后端内置 10 句中文祝福语池，每次敲击用 `rand` 随机选取返回；数量与文案可在
`backend/src/lib.rs` 的 `BLESSINGS` 常量中扩展。

## 6. 前端设计

### 6.1 界面一：设置信息（首次启动）

- 头像选择（10 个 emoji 网格，默认 🙏）
- 昵称/法号（必填，≤30 字）
- 心愿（可选，≤100 字）
- 「⚠️ 设置完成后将不可更改」提示
- 提交 → `POST /api/user` → 进入敲击界面
- 应用启动时先 `GET /api/user`：404 则显示设置界面，否则直接进入敲击界面

### 6.2 界面二：敲击主界面

自上而下布局：

1. **头部**：头像 + 昵称（左）、心愿（右）
2. **累计次数**：大号数字，每次变化触发缩放动画
3. **敲击区**（点击任意位置触发敲击）：
   - 木鱼 SVG（俯视造型：渐变鱼身、眼睛、空心嘴缝）
   - 木槌 SVG（右上角，敲击时旋转敲击动画）
   - 敲击动画：Web Animations API 挤压回弹（`scale(0.92,0.86)` → `scale(1.05,1.08)` → 复原），可快速连击、随时打断重播
   - 点击位置飘出红色 `+1` 并上浮淡出；同时扩散一圈波纹
4. **祝福语**：后端返回的祝福语以圆角胶囊 Toast 展示（上滑淡入）

交互细节：

- **乐观更新**：点击立即 `+1` 并播放动画音效，同时异步调用 `POST /api/knock`；
  响应到达后取 `max(当前显示, 服务端值)` 校准，避免乱序响应导致数字回退。
- **连击支持**：请求序号（`reqSeq`）丢弃过期响应，动画可重入。

### 6.3 音效（Web Audio 合成）

无需音频文件，`playKnock()` 实时合成三层：

1. 低频正弦「咚」：240Hz → 118Hz 快速降频，0.18s 指数衰减 —— 腔体共鸣
2. 三角波「梆」：880Hz → 520Hz，0.12s 衰减 —— 木质敲击感
3. 30ms 白噪声脉冲 —— 击打接触声

首次交互时自动创建 `AudioContext`（符合浏览器自动播放策略）。

### 6.4 前后端通信

```ts
// 桌面端：通过 Tauri 命令获取内嵌后端随机端口
isTauri() ? invoke("get_backend_port") → http://127.0.0.1:{port}
// 浏览器开发模式：固定 http://127.0.0.1:17823（可用 VITE_API_BASE 覆盖）
```

## 7. 桌面端集成（Tauri 2）

- 启动流程：`setup` 钩子中创建应用数据目录 → 内嵌启动后端（端口 0 自动分配）→
  将端口存入 Tauri State → 前端 `invoke("get_backend_port")` 获取后调用 API。
- 窗口：440×780，可缩放（最小 380×640），居中。
- 安全：CSP 限制 `connect-src` 仅允许 `http://127.0.0.1:*`（本地后端）。
- 打包：NSIS 安装包（当前用户安装，无需管理员）+ 免安装 exe（Windows）；
  `.app` + `.dmg`（macOS，由 CI 构建）。

## 8. 构建与产物

| 产物 | 生成方式 | 位置 |
| --- | --- | --- |
| Windows NSIS 安装包 | 本地 `scripts/build.ps1` / CI | `release/`、CI artifacts |
| Windows 免安装 exe | 同上 | `release/muyu.exe` |
| macOS .app / .dmg（arm64/x64） | GitHub Actions CI | CI artifacts |

- 一键脚本：`scripts/build.ps1`（Windows）、`scripts/build.sh`（macOS/Linux）。
- CI 工作流：`.github/workflows/build.yml`，在 PR / push 时构建
  `windows-latest`、`macos-latest`（arm64）、`macos-13`（x64）三份产物。

## 9. 测试

- 后端：`cargo test`（数据库读写、敲击累计、祝福语返回等单元测试）+ 手工 HTTP 冒烟测试。
- 前端：`tsc` 严格类型检查 + `vite build` 构建验证。
- 桌面端：本地运行打包产物，验证设置流程、敲击动画/音效/计数、数据持久化。
- 详细验证记录见 BUILD.md 附录。

## 10. 已知限制与后续扩展

- 单用户语义（无登录）；删除应用数据目录可重置。
- 次数仅本地累计，无排行榜/云同步。
- macOS 产物未签名（个人使用需右键打开）。
- 可扩展方向：多用户、每日目标、分享截图、更多音效/皮肤、自动更新。
