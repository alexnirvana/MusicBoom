import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

// 判定当前是否运行在 Tauri 环境，用插件请求可绕过跨域限制
function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_IPC__" in window;
}

type RequestBody = RequestInit["body"] | Record<string, unknown> | undefined;
type JsonRequestOptions = Omit<RequestInit, "body"> & { body?: RequestBody };

// 将请求体统一规范化为 fetch 可接受的类型，方便在插件与浏览器间复用
function normalizeBody(body: RequestBody) {
  if (!body) return undefined;
  if (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof ReadableStream ||
    ArrayBuffer.isView(body)
  ) {
    return body;
  }

  // 其他对象默认序列化为 JSON 字符串
  return JSON.stringify(body);
}

// 通用的 JSON 请求工具，负责统一的错误处理与响应反序列化
export async function requestJson<T>(url: string, options: JsonRequestOptions): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  const body = normalizeBody(options.body);

  // 仅在存在请求体时补充 Content-Type，避免 GET 请求携带多余头部导致部分反向代理或接口拒绝
  if (body && typeof body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const fetcher = isTauriEnvironment() ? tauriFetch : fetch;
  const response = await fetcher(url, {
    ...options,
    headers,
    body,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload?.message;
    const hint = message || `请求失败（HTTP ${response.status}）`;
    throw new Error(hint);
  }

  return payload as T;
}
