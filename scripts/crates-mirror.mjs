/**
 * crates.io 本地镜像代理（仅用于解决沙箱/受限环境下 cargo 无法使用 schannel TLS 的问题）。
 *
 * cargo 配置（写入 CARGO_HOME/config.toml，不入仓库）：
 *   [source.crates-io]
 *   replace-with = "local-mirror"
 *   [source.local-mirror]
 *   registry = "sparse+http://127.0.0.1:19000/"
 *
 * 用法：node scripts/crates-mirror.mjs [端口] [缓存目录]
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.argv[2] ?? 19000);
const CACHE = process.argv[3] ?? join(process.env.TEMP ?? ".", "crates-mirror-cache");
const INDEX_BASE = "https://index.crates.io";
const DL_BASE = "https://static.crates.io";

mkdirSync(CACHE, { recursive: true });

const cacheKey = (p) => join(CACHE, Buffer.from(p).toString("hex"));

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    console.log(`[mirror] ${req.method} ${url.pathname} (ua=${req.headers["user-agent"] ?? "-"})`);
    let upstream;
    if (url.pathname === "/config.json") {
      const body = JSON.stringify({ dl: `http://127.0.0.1:${PORT}/dl`, api: "https://crates.io" });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
      return;
    }
    if (url.pathname.startsWith("/dl/")) {
      const parts = url.pathname.split("/"); // ["", "dl", crate, version, "download"]
      const crate = parts[2];
      const version = parts[3];
      upstream = `${DL_BASE}/crates/${crate}/${crate}-${version}.crate`;
    } else {
      upstream = `${INDEX_BASE}${url.pathname}`;
    }

    const key = cacheKey(upstream);
    if (existsSync(key)) {
      const data = readFileSync(key);
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": data.length });
      res.end(data);
      return;
    }

    const r = await fetch(upstream);
    if (!r.ok) {
      res.writeHead(r.status);
      res.end(String(r.status));
      return;
    }
    const data = Buffer.from(await r.arrayBuffer());
    writeFileSync(key, data);
    res.writeHead(200, {
      "content-type": r.headers.get("content-type") ?? "application/octet-stream",
      "content-length": data.length,
    });
    res.end(data);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`crates mirror ready: http://127.0.0.1:${PORT} (cache: ${CACHE})`);
});
