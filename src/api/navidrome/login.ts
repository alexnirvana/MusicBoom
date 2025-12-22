import { requestJson } from "../../utils/request";
import type { LoginPayload, LoginSuccess } from "../../types/auth";
import type { SubsonicResponseBody } from "../../types/navidrome";
import {
  buildNavidromeUrl,
  buildSubsonicTokenParams,
  buildTokenAuthWithPassword,
} from "./utils";

// Navidrome 登录接口，改为通过 Subsonic/OpenSubsonic 的 token 方案进行健康检查
export async function loginNavidrome(payload: LoginPayload): Promise<LoginSuccess> {
  const { baseUrl, username, password } = payload;
  const auth = buildTokenAuthWithPassword(username, password);
  const params = buildSubsonicTokenParams(auth);

  // 需要保留用户填写的路径（例如自定义反向代理下的 /music/ 前缀）
  const endpoint = buildNavidromeUrl(baseUrl, `rest/ping?${params.toString()}`);

  const response = await requestJson<SubsonicResponseBody>(endpoint, {
    method: "GET",
  });

  const result = response["subsonic-response"];
  if (result.status !== "ok") {
    const hint = result.error?.message || "Subsonic ping 失败";
    throw new Error(hint);
  }

  return {
    token: auth.token,
    salt: auth.salt,
    displayName: username,
    username,
  };
}
