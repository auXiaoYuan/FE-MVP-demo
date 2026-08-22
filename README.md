# 敲木鱼 · Muyu（FE-MVP-demo）

一个极简的「敲木鱼」桌面应用 MVP：每次敲击木鱼，会随机收到一句祝福语，并累计敲击次数。
项目采用 **前后端分离** 架构：React + Vite 前端、独立 Rust 后端服务（SQLite 存储）、Tauri 2 桌面壳。

## ✨ 功能

- **首次启动设置界面**：选择头像、填写昵称/法号与心愿（可选）。设置完成后不可更改。
- **敲击主界面**：
  - 点击木鱼触发敲击动画（木鱼挤压回弹 + 木槌敲击动画 + 波纹扩散）
  - 每次敲击飘出 `+1` 动画，累计次数实时更新
  - 敲击音效（Web Audio 实时合成，无需音频文件）
  - 每次敲击由后端随机返回一句祝福语

## 🧱 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 + Vite 5 + TypeScript |
| 后端 | Rust（axum + rusqlite），独立 HTTP 服务，SQLite 存储 |
| 桌面壳 | Tauri 2（WebView2 / WKWebView） |
| 音效 | Web Audio API 实时合成（无音频资源文件） |
| CI | GitHub Actions（Windows + macOS 产物自动构建） |

## 📁 目录结构

```
FE-MVP-demo/
├── README.md              # 本文件
├── docs/
│   ├── DESIGN.md          # 设计文档（架构、接口、数据库、界面）
│   └── BUILD.md           # 构建指南（本地构建 Windows / macOS）
├── backend/               # 后端服务（Rust crate，可独立运行，也可被桌面端内嵌）
├── frontend/              # 前端（React + Vite）
├── src-tauri/             # Tauri 2 桌面壳（内嵌后端 + 加载前端产物）
├── scripts/               # 一键构建脚本（build.ps1 / build.sh）+ 图标生成脚本
├── release/               # 已构建好的 Windows 安装包 / 可执行文件
└── .github/workflows/     # CI：自动构建 Windows + macOS 产物
```

## 🚀 快速开始

### 浏览器模式（纯前端开发，需要手动启动后端）

```bash
# 1. 启动后端（监听 127.0.0.1:17823）
cd backend && cargo run

# 2. 另开终端，启动前端
cd frontend && npm install && npm run dev
# 打开 http://localhost:1420
```

### 桌面模式（Tauri）

```bash
cd frontend
npm install
npm run tauri dev        # 开发模式
npm run tauri build      # 构建桌面产物
```

> 详细步骤与各平台前置要求见 [docs/BUILD.md](docs/BUILD.md)。

## 📦 产物下载

- **Windows 直接运行**：`release/` 目录下已包含构建好的安装包（`muyu_0.1.0_x64-setup.exe`）与免安装可执行文件（`muyu.exe`），下载后双击即可运行。
- **Windows / macOS 最新产物**：GitHub Actions 会在每次推送/PR 时自动构建并上传产物（Windows NSIS 安装包、macOS .app / .dmg），可在仓库的 **Actions** 页面或 PR 的 Checks 中下载。

## 📄 文档

- 设计文档：[docs/DESIGN.md](docs/DESIGN.md)
- 构建指南：[docs/BUILD.md](docs/BUILD.md)

## ⚠️ 注意事项

- macOS 产物未做代码签名，首次打开需 **右键 → 打开**（或到「系统设置 → 隐私与安全性」中允许）。
- Windows 安装包未做代码签名，SmartScreen 可能提示「已保护你的电脑」，选择「更多信息 → 仍要运行」即可。
- 数据保存在系统应用数据目录（Windows：`%APPDATA%\com.muyu.demo\muyu.db`），删除该文件可重置应用。
