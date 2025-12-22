import type { OpenlistLoginPayload, OpenlistLoginSuccess } from "../../types/openlist";
import { requestJson } from "../../utils/request";
import { normalizeOpenlistBaseUrl } from "./utils";

interface OpenlistLoginResponse {
  data?: { token?: string };
  token?: string;
  message?: string;
  error?: string;
}

// OpenList 登录请求：通过真实接口换取 Token，确保凭据有效
export async function loginOpenlist(
  payload: OpenlistLoginPayload
): Promise<OpenlistLoginSuccess & { baseUrl: string }> {
  const baseUrl = normalizeOpenlistBaseUrl(payload.baseUrl);
  const { username, password } = payload;

  if (!username || !password) {
    throw new Error("请填写用户名和密码");
  }

  // 请求 OpenList 官方登录接口，成功后返回可复用的 Token
  try {
    const payload = await requestJson<OpenlistLoginResponse>(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: { username, password },
    });

    const token = payload.data?.token || payload.token;
    if (!token) {
      throw new Error("登录成功但未返回 Token，请检查 OpenList 版本");
    }

    return {
      baseUrl,
      token,
      username,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`请求 OpenList 登录接口失败：${reason}`);
  }
}
