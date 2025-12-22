import md5 from "spark-md5";
import type {
  FetchSongsOptions,
  SubsonicTokenAuth,
} from "../../types/navidrome";

// 统一规范化 Navidrome 基础地址：
// 1) 如果缺少协议则默认补齐为 https
// 2) 规范路径分隔，避免自定义反向代理前缀被覆盖
export function normalizeBaseUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("缺少 Navidrome 基础地址");
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const base = new URL(withProtocol);

  // 保证基础路径以 / 结尾，便于相对路径拼接
  if (!base.pathname.endsWith("/")) {
    base.pathname = `${base.pathname}/`;
  }

  return base.toString();
}

// 统一在基础地址上追加路径，确保不会丢失自定义反向代理前缀
export function buildNavidromeUrl(baseUrl: string, path: string) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  return new URL(path, normalizedBase).toString();
}

// 生成 Subsonic/OpenSubsonic 的随机盐
export function generateSalt() {
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(randomBytes)
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

// 使用 token 方案构造 Subsonic/OpenSubsonic 通用鉴权参数
export function buildSubsonicTokenParams(auth: SubsonicTokenAuth) {
  const params = new URLSearchParams();
  params.set("u", auth.username);
  params.set("t", auth.token);
  params.set("s", auth.salt);
  params.set("v", "1.16.1");
  params.set("c", "musicboom");
  params.set("f", "json");
  return params;
}

// 基于密码即时生成 token 鉴权对象
export function buildTokenAuthWithPassword(
  username: string,
  password: string
): SubsonicTokenAuth {
  const salt = generateSalt();
  const token = md5.hash(`${password}${salt}`);
  return { username, salt, token };
}

// 生成带 token 的请求地址
export function buildSubsonicUrl(
  baseUrl: string,
  path: string,
  auth: SubsonicTokenAuth
) {
  // 需要兼容已经携带查询参数的路径（例如 getAlbum?id=xxx），因此先构造 URL 后再叠加鉴权参数
  const url = new URL(`rest/${path}`, normalizeBaseUrl(baseUrl));
  const params = buildSubsonicTokenParams(auth);
  params.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

// 便于生成封面地址，避免重复拼接参数
export function buildCoverUrl(
  baseUrl: string,
  auth: SubsonicTokenAuth,
  coverId?: string
) {
  if (!coverId) return undefined;
  const params = buildSubsonicTokenParams(auth);
  params.set("id", coverId);
  return buildNavidromeUrl(baseUrl, `rest/getCoverArt?${params.toString()}`);
}

// 从外部参数解析出 token 鉴权
export function resolveSubsonicAuth(
  options: FetchSongsOptions
): SubsonicTokenAuth | null {
  const username = options.username?.trim();
  if (!username) return null;

  if (options.token?.trim() && options.salt?.trim()) {
    return {
      username,
      token: options.token.trim(),
      salt: options.salt.trim(),
    };
  }

  if (options.password?.trim()) {
    return buildTokenAuthWithPassword(username, options.password.trim());
  }

  return null;
}
