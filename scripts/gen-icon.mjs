/**
 * 生成 1024x1024 应用图标（木鱼造型，纯 Node 实现，无第三方依赖）。
 *
 * 用法：node scripts/gen-icon.mjs [输出路径]（默认 src-tauri/app-icon.png）
 * 生成后可用 `npx tauri icon` 派生所有平台图标：
 *   npx tauri icon -o src-tauri/icons src-tauri/app-icon.png
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SIZE = 1024;
const buf = new Uint8Array(SIZE * SIZE * 4);

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

function blend(x, y, r, g, b, a) {
  const i = (y * SIZE + x) * 4;
  const sa = a / 255;
  const da = buf[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / oa);
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa);
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa);
  buf[i + 3] = Math.round(oa * 255);
}

function ellipseSDF(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return Math.sqrt(dx * dx + dy * dy) - 1;
}

/** 椭圆边缘覆盖率（0..1），AA 基于真实像素距离（抗锯齿带宽度 AA_PX） */
function ellipseCoverage(x, y, cx, cy, rx, ry, aaPx) {
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  const r = Math.sqrt(nx * nx + ny * ny);
  if (r === 0) return 1;
  const d = r - 1; // 归一化距离
  // 将归一化距离换算为真实像素距离：除以归一化梯度模长
  const gradMag = Math.sqrt((nx * nx) / (rx * rx) + (ny * ny) / (ry * ry)) / r;
  const realDist = d / gradMag;
  return clamp01(0.5 - realDist / aaPx);
}

function circleDist(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r;
}

/** 二次贝塞尔曲线到点的近似最短距离（分段采样） */
function quadDist(x, y, p0, p1, p2) {
  let best = Infinity;
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const mt = 1 - t;
    const qx = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0];
    const qy = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1];
    const d = Math.hypot(x - qx, y - qy);
    if (d < best) best = d;
  }
  return best;
}

const AA = 1.6;
const AA_PX = 1.5;
const CX = 512;
const CY = 545;
const RX = 420;
const RY = 340;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const px = x + 0.5;
    const py = y + 0.5;

    // 1) 外圈暖光
    const glow = Math.max(0, 1 - Math.hypot(px - CX, py - CY) / 760);
    if (glow > 0) blend(x, y, 255, 218, 158, glow * glow * 0.12 * 255);

    // 2) 鱼身（径向渐变：中心亮、边缘深）
    const dBody = ellipseSDF(px, py, CX, CY, RX, RY);
    if (dBody < AA) {
      const cov = ellipseCoverage(px, py, CX, CY, RX, RY, AA_PX);
      if (cov > 0) {
        const t = clamp01(Math.hypot(px - CX, py - CY) / RX);
        const r = lerp(205, 138, t);
        const g = lerp(128, 68, t);
        const b = lerp(50, 19, t);
        blend(x, y, r, g, b, cov * 255);
        // 左上高光
        const hl = ellipseSDF(px, py, CX - 130, CY - 120, 210, 125);
        if (hl < 0 && dBody < 0) blend(x, y, 255, 236, 200, 0.09 * 255);
      }
    }

    // 3) 嘴缝（深色弧线 + 内部更深的阴影）
    const dSlit = quadDist(px, py, [150, 468], [512, 650], [874, 468]);
    if (dSlit < 30) {
      const cov = clamp01(0.5 - (dSlit - 30) / AA);
      blend(x, y, 58, 34, 12, cov * 255);
    }
    if (dSlit < 15) {
      const cov = clamp01(0.5 - (dSlit - 15) / AA);
      blend(x, y, 28, 15, 6, cov * 255);
    }

    // 4) 眼睛与高光
    const dE1 = circleDist(px, py, 358, 356, 54);
    const dE2 = circleDist(px, py, 666, 356, 54);
    if (dE1 < AA) blend(x, y, 46, 28, 10, clamp01(0.5 - dE1 / AA) * 255);
    if (dE2 < AA) blend(x, y, 46, 28, 10, clamp01(0.5 - dE2 / AA) * 255);
    const dH1 = circleDist(px, py, 372, 340, 17);
    const dH2 = circleDist(px, py, 680, 340, 17);
    if (dH1 < AA) blend(x, y, 255, 250, 235, clamp01(0.5 - dH1 / AA) * 255);
    if (dH2 < AA) blend(x, y, 255, 250, 235, clamp01(0.5 - dH2 / AA) * 255);
  }
}

// ---------------- PNG 编码 ----------------
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const stride = SIZE * 4;
const raw = Buffer.alloc((stride + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (stride + 1)] = 0; // filter: None
  Buffer.from(buf.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "app-icon.png");
writeFileSync(out, png);
console.log("icon written:", out, `(${png.length} bytes)`);
