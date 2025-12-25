import { requestJson } from "../../utils/request";
import type {
  FetchSongsOptions,
  NavidromeSong,
  PaginatedResponse,
  SubsonicAlbum,
  SubsonicArtist,
  SubsonicResponseBody,
  SubsonicSong,
  SubsonicTokenAuth,
} from "../../types/navidrome";
import {
  buildCoverUrl,
  buildNavidromeUrl,
  buildSubsonicTokenParams,
  buildSubsonicUrl,
  resolveSubsonicAuth,
} from "./utils";

// 使用 Bearer Token 调用 /api/library/tracks
async function fetchSongsWithBearer(baseUrl: string, token: string) {
  const pageSize = 200;
  const results: NavidromeSong[] = [];
  let offset = 0;

  while (true) {
    const endpoint = buildNavidromeUrl(
      baseUrl,
      `api/library/tracks?limit=${pageSize}&offset=${offset}`
    );

    const response = await requestJson<PaginatedResponse<NavidromeSong>>(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    results.push(...response.items);

    if (response.items.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return results;
}

// 提取 Subsonic 响应中的错误信息
function assertSubsonicOk(payload: SubsonicResponseBody["subsonic-response"]) {
  if (payload.status === "ok") return;
  const hint = payload.error?.message || "Subsonic 接口返回异常";
  throw new Error(hint);
}

// 分类：先拉取艺人列表
async function fetchArtistsWithToken(baseUrl: string, auth: SubsonicTokenAuth) {
  const endpoint = buildSubsonicUrl(baseUrl, "getArtists", auth);
  const response = await requestJson<SubsonicResponseBody>(endpoint, { method: "GET" });
  const payload = response["subsonic-response"];
  assertSubsonicOk(payload);

  const groups = payload.artists?.index ?? [];
  return groups
    .flatMap((group) => group.artist ?? [])
    .filter((item): item is SubsonicArtist => Boolean(item));
}

// 分类：按艺人拉取专辑
async function fetchAlbumsByArtist(
  baseUrl: string,
  auth: SubsonicTokenAuth,
  artistId: string
) {
  const endpoint = buildSubsonicUrl(baseUrl, `getArtist?id=${artistId}`, auth);
  const response = await requestJson<SubsonicResponseBody>(endpoint, { method: "GET" });
  const payload = response["subsonic-response"];
  assertSubsonicOk(payload);
  return payload.artist?.album ?? [];
}

// 分类：按专辑拉取歌曲
async function fetchSongsByAlbum(
  baseUrl: string,
  auth: SubsonicTokenAuth,
  album: SubsonicAlbum,
  artistNameFallback: string
) {
  const endpoint = buildSubsonicUrl(baseUrl, `getAlbum?id=${album.id}`, auth);
  const response = await requestJson<SubsonicResponseBody>(endpoint, { method: "GET" });
  const payload = response["subsonic-response"];
  assertSubsonicOk(payload);

  const songs = payload.album?.song ?? [];
  const songArray = Array.isArray(songs) ? songs : [songs];

  return songArray
    .filter((item): item is SubsonicSong => Boolean(item))
    .map<NavidromeSong>((item) => ({
      id: item.id,
      title: item.title || "未知标题",
      artist: item.artist || album.artist || artistNameFallback || "未知歌手",
      album: item.album || album.name || "未知专辑",
      duration: item.duration || 0,
      coverUrl: buildCoverUrl(baseUrl, auth, item.coverArt || album.coverArt),
      size: item.size,
      comment: item.comment,
    }));
}

// 使用 Subsonic/OpenSubsonic 兼容接口拉取歌曲列表（分类：艺人 -> 专辑 -> 歌曲）
async function fetchSongsWithSubsonic(
  baseUrl: string,
  auth: SubsonicTokenAuth
): Promise<NavidromeSong[]> {
  const results: NavidromeSong[] = [];
  const artists = await fetchArtistsWithToken(baseUrl, auth);

  for (const artist of artists) {
    const albums = await fetchAlbumsByArtist(baseUrl, auth, artist.id);
    for (const album of albums) {
      const songs = await fetchSongsByAlbum(
        baseUrl,
        auth,
        album,
        artist.name || album.artist || "未知歌手"
      );
      results.push(...songs);
    }
  }

  return results;
}

// 构造可直接播放的音频流地址，供播放器组件使用
export function buildStreamUrl(options: FetchSongsOptions & { songId: string }) {
  const baseUrl = options.baseUrl.trim();
  if (!baseUrl) {
    throw new Error("缺少 Navidrome 基础地址，无法生成播放链接");
  }

  const auth = resolveSubsonicAuth(options);
  if (!auth) {
    throw new Error("缺少 Subsonic 凭据，无法生成播放链接");
  }

  const params = buildSubsonicTokenParams(auth);
  params.set("id", options.songId);
  return buildNavidromeUrl(baseUrl, `rest/stream?${params.toString()}`);
}

// 支持 Bearer Token 与 Subsonic 双栈拉取歌曲
export async function fetchAllSongs(options: FetchSongsOptions): Promise<NavidromeSong[]> {
  const baseUrl = options.baseUrl.trim();
  if (!baseUrl) {
    throw new Error("缺少 Navidrome 基础地址，无法请求歌曲列表");
  }

  const errors: string[] = [];

  if (options.bearerToken && options.bearerToken.trim()) {
    try {
      return await fetchSongsWithBearer(baseUrl, options.bearerToken);
    } catch (error) {
      const fallback = error instanceof Error ? error.message : String(error);
      errors.push(`Bearer 鉴权失败：${fallback}`);
    }
  }

  const subsonicAuth = resolveSubsonicAuth(options);
  if (subsonicAuth) {
    try {
      return await fetchSongsWithSubsonic(baseUrl, subsonicAuth);
    } catch (error) {
      const fallback = error instanceof Error ? error.message : String(error);
      errors.push(`Subsonic 接口失败：${fallback}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("；"));
  }

  throw new Error("缺少有效的 Subsonic token 或账号密码，无法请求歌曲列表");
}

// 对外暴露的统一歌曲获取方法，便于组件使用更直观的命名
export async function getSongs(options: FetchSongsOptions): Promise<NavidromeSong[]> {
  return fetchAllSongs(options);
}

// 根据歌曲 ID 获取完整元信息，便于恢复播放
export async function getSongById(
  options: FetchSongsOptions & { songId: string }
): Promise<NavidromeSong> {
  const baseUrl = options.baseUrl.trim();
  if (!baseUrl) {
    throw new Error("缺少 Navidrome 基础地址，无法获取歌曲详情");
  }

  // 优先使用 Subsonic token 获取单曲，避免拉取全量列表
  const auth = resolveSubsonicAuth(options);
  if (auth) {
    const params = buildSubsonicTokenParams(auth);
    params.set("id", options.songId);
    const endpoint = buildNavidromeUrl(baseUrl, `rest/getSong?${params.toString()}`);
    const response = await requestJson<SubsonicResponseBody>(endpoint, { method: "GET" });
    const payload = response["subsonic-response"];
    assertSubsonicOk(payload);

    const song = payload.song || payload.songList?.song;
    if (song) {
      const normalized = Array.isArray(song) ? song[0] : song;
      return {
        id: normalized.id,
        title: normalized.title || "未知标题",
        artist: normalized.artist || "未知歌手",
        album: normalized.album || "未知专辑",
        duration: normalized.duration || 0,
        coverUrl: buildCoverUrl(baseUrl, auth, normalized.coverArt),
        size: normalized.size,
      };
    }
  }

  // Bearer token 场景只能回退到全量查询
  const list = await fetchAllSongs(options);
  const found = list.find((item) => item.id === options.songId);
  if (found) return found;

  throw new Error("无法从服务器获取指定歌曲信息");
}
