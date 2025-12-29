// 统一整理 OpenList 基础地址，去除末尾多余的斜杠
export function normalizeOpenlistBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    throw new Error("请填写网盘基础地址");
  }

  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalized);
    // 仅保留协议 + 域名（含端口），如果用户误粘贴了形如 /share/xxx 的路径，自动丢弃避免接口 404/500
    return `${parsed.protocol}//${parsed.host}`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`无法识别的地址：${reason}`);
  }
}

// OpenList 接口统一响应结构，便于做业务态校验
export interface OpenlistApiResponse<T> {
  code?: number;
  message?: string;
  error?: string;
  data?: T;
}

// 标记 OpenList 接口的业务异常，便于上层识别是否需要退出登录
export class OpenlistApiError extends Error {
  code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = "OpenlistApiError";
    this.code = code;
  }

  // code 401 代表登录已失效，需要回到登录页
  get shouldLogout() {
    return this.code === 401;
  }
}

// 检查接口业务状态码，统一抛出可识别的错误
export function ensureOpenlistSuccess<T>(payload: OpenlistApiResponse<T>): T {
  const code = typeof payload.code === "number" ? payload.code : 200;
  if (code === 200) {
    return (payload.data ?? {}) as T;
  }

  const reason = payload.message || payload.error || `OpenList 接口返回异常（${code}）`;
  throw new OpenlistApiError(reason, code);
}
