import type { FetchSongsOptions } from "../types/navidrome";
import type { AuthState } from "../types/auth";
import type { SettingsState } from "../types/settings";

// 基于当前登录态与设置拼装 Navidrome 请求上下文，方便在多个页面共享逻辑
export function buildNavidromeContext(authState: AuthState, settingsState: SettingsState): FetchSongsOptions {
  const baseUrl = (authState.baseUrl || settingsState.navidrome.baseUrl || "").trim();
  if (!baseUrl) {
    throw new Error("缺少 Navidrome 基础地址，请先登录或填写设置");
  }

  return {
    baseUrl,
    bearerToken: null,
    token: authState.token,
    salt: authState.salt,
    username: authState.username || settingsState.navidrome.username,
    password: settingsState.navidrome.password,
  };
}
