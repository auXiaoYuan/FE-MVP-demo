# 构建指南（BUILD.md）

本文档说明如何在本地从源代码构建「敲木鱼」桌面应用（Windows / macOS），
以及如何获取已经构建好的产物。

## 1. 前置要求

| 平台 | 要求 |
| --- | --- |
| 通用 | Node.js 18+（建议 20/22/24）、Rust stable（1.77+） |
| Windows | Visual Studio 2022（含 **使用 C++ 的桌面开发** 工作负载）、WebView2 Runtime（Win10/11 自带） |
| macOS | Xcode（含 Command Line Tools）；构建 `.dmg` 需要 macOS 环境 |

> Windows 安装 Rust：`rustup-init.exe -y --default-host x86_64-pc-windows-msvc`
> macOS 安装 Rust：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

## 2. 快速一键构建

### Windows（PowerShell）

```powershell
.\scripts\build.ps1
```

产物输出到 `release/`：
- `muyu_0.1.0_x64-setup.exe` —— NSIS 安装包（双击安装）
- `muyu.exe` —— 免安装版（双击直接运行）

### macOS（Terminal）

```bash
./scripts/build.sh
```

产物输出到 `src-tauri/target/release/bundle/`：`muyu.app`、`muyu_0.1.0_aarch64.dmg`（Apple Silicon）
或 `muyu_0.1.0_x64.dmg`（Intel，在 macOS 13 上构建）。

## 3. 手动分步构建

### 3.1 后端（可选，独立运行用）

```bash
cd backend
cargo run                     # 启动在 127.0.0.1:17823，数据库 ./data/muyu.db
cargo run -- --port 9000      # 自定义端口
cargo test                    # 运行单元测试
```

### 3.2 前端

```bash
cd frontend
npm install
npm run dev                   # 开发模式（http://localhost:1420）
npm run build                 # 产物输出到 frontend/dist
```

### 3.3 桌面应用（Tauri，Windows / macOS 通用）

```bash
# 在仓库根目录（FE-MVP-demo/）执行：
npm run tauri dev             # 开发模式（自动启动 Vite 再打开桌面窗口）
npm run tauri build           # 构建发布产物
```

> 说明：tauri CLI 要求当前目录能定位到 `src-tauri/`，因此必须在**仓库根目录**运行
> （根目录 `package.json` 已配置便捷脚本，无需单独安装根依赖）。
> `tauri build` 会自动完成：前端构建（`tsc + vite build`）→ 后端编译（cargo，含内嵌服务）
> → 打包（Windows: NSIS；macOS: .app + .dmg）。

### 3.4 应用图标（首次或修改图标后）

```bash
node scripts/gen-icon.mjs                      # 生成 1024x1024 源图（src-tauri/app-icon.png）
npx tauri icon -o src-tauri/icons src-tauri/app-icon.png   # 派生全部平台图标
```

## 4. 浏览器开发模式（纯前端，不依赖桌面壳）

```bash
# 终端 1：启动后端
cd backend && cargo run

# 终端 2：启动前端
cd frontend && npm install && npm run dev
# 浏览器打开 http://localhost:1420
```

> 浏览器模式下前端固定访问 `http://127.0.0.1:17823`；可用环境变量 `VITE_API_BASE` 覆盖。

## 5. 获取构建产物（无需本地构建）

| 平台 | 途径 |
| --- | --- |
| Windows（本仓库已包含） | `release/muyu_0.1.0_x64-setup.exe`、`release/muyu.exe` |
| Windows / macOS（最新） | 仓库 GitHub **Actions** 页面 → 对应 workflow run → Artifacts（`muyu-windows-x64`、`muyu-macos-arm64`、`muyu-macos-x64`） |

## 6. 常见问题（FAQ）

**Q1：macOS 打开提示「无法验证开发者」？**
产物未签名。请**右键点击应用 → 打开**，或在「系统设置 → 隐私与安全性」中点击「仍要打开」。

**Q2：Windows SmartScreen 提示「已保护你的电脑」？**
产物未签名属正常现象。点击「更多信息 → 仍要运行」。

**Q3：数据存在哪里？删除后如何重置？**
- Windows：`%APPDATA%\com.muyu.demo\muyu.db`
- macOS：`~/Library/Application Support/com.muyu.demo/muyu.db`
删除该文件后重新打开应用即可重新设置（仅首次可设置）。

**Q4：端口冲突？**
桌面版后端使用随机空闲端口，不会冲突。独立运行后端默认 17823，可用 `--port` 修改。

**Q5：Windows 上 `cargo build` 报 link.exe 找不到？**
需安装 VS 2022「使用 C++ 的桌面开发」工作负载，并确保 rustup 默认 host 为
`x86_64-pc-windows-msvc`。

## 7. 测试验证记录（本次交付实测）

- ✅ `cargo test -p muyu-backend`：数据库初始化、创建用户、敲击累计、祝福语返回全部通过
- ✅ 后端 HTTP 冒烟测试：health / user(404) / 创建用户 / 连续敲击 / count 全部符合预期
- ✅ `npm run build`（tsc 严格模式 + vite）：通过
- ✅ 桌面应用（Windows）：打包产物启动正常，设置信息 → 敲击动画/音效/飘字/祝福语/计数均正常，
  重启后数据持久化
