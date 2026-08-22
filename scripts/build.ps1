# ============================================================
# 敲木鱼 · Windows 一键构建脚本
# 产物输出：release/ 目录
#   - release/muyu_0.1.0_x64-setup.exe   NSIS 安装包
#   - release/muyu.exe                   免安装可执行文件
# 前置要求：Node.js 18+、Rust stable、VS 2022 C++ 工具链、WebView2
# ============================================================
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> [1/3] 安装前端依赖"
Push-Location frontend
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install 失败" }
Pop-Location

Write-Host "==> [2/3] 构建 Tauri 桌面应用（含前端构建 + 后端编译）"
npm --prefix frontend run tauri build
if ($LASTEXITCODE -ne 0) { throw "tauri build 失败" }

Write-Host "==> [3/3] 复制产物到 release/"
New-Item -ItemType Directory -Force -Path release | Out-Null
Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" -ErrorAction SilentlyContinue |
    Copy-Item -Destination release
if (Test-Path "src-tauri\target\release\muyu.exe") {
    Copy-Item "src-tauri\target\release\muyu.exe" "release\muyu.exe" -Force
}

Write-Host ""
Write-Host "构建完成！产物位于 release/ 目录："
Get-ChildItem release | Select-Object Name, @{n='Size(MB)';e={[math]::Round($_.Length/1MB,1)}}
