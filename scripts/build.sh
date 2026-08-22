#!/usr/bin/env bash
# ============================================================
# 敲木鱼 · macOS / Linux 一键构建脚本
# 产物输出：src-tauri/target/release/bundle/
#   macOS: .app + .dmg    Linux: deb/appimage
# 前置要求：Node.js 18+、Rust stable、Xcode(仅 macOS)
# ============================================================
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

echo "==> [1/2] 安装前端依赖"
(cd frontend && npm install)

echo "==> [2/2] 构建 Tauri 桌面应用"
(cd frontend && npm run tauri build)

echo ""
echo "构建完成！产物位于 src-tauri/target/release/bundle/"
