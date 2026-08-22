import { invoke, isTauri } from "@tauri-apps/api/core";

/** 用户信息（与后端 users / knock_stats 表对应） */
export interface User {
  id: number;
  nickname: string;
  wish: string;
  avatar: string;
  total_knocks: number;
  created_at: number;
}

/** 一次敲击的结果 */
export interface KnockResult {
  count: number;
  blessing: string;
}

/** API 错误（携带 HTTP 状态码） */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// 浏览器开发模式下的后端地址（独立运行后端时使用）
const DEV_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://127.0.0.1:17823";

/** 解析后端 base URL：桌面端通过 Tauri 命令获取内嵌后端端口；浏览器模式用固定端口 */
async function resolveBase(): Promise<string> {
  try {
    if (isTauri()) {
      const port = await invoke<number>("get_backend_port");
      return `http://127.0.0.1:${port}`;
    }
  } catch (e) {
    console.warn("获取后端端口失败，回退到默认端口:", e);
  }
  return DEV_BASE;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await resolveBase();
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return (body as { data: T }).data;
}

export const api = {
  /** 获取用户信息；未设置时抛出 404 */
  getUser: () => request<User>("/api/user"),

  /** 首次启动设置用户信息（仅可设置一次） */
  createUser: (p: { nickname: string; wish?: string; avatar?: string }) =>
    request<User>("/api/user", { method: "POST", body: JSON.stringify(p) }),

  /** 敲击一次木鱼 */
  knock: () => request<KnockResult>("/api/knock", { method: "POST" }),

  /** 获取累计敲击次数 */
  getCount: () => request<{ count: number }>("/api/count"),
};
