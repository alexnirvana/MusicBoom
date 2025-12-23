import { join } from "@tauri-apps/api/path";
import { exists, mkdir, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { computed, reactive } from "vue";
import type { NavidromeSong } from "../api/navidrome";
import { buildStreamUrl, getSongById } from "../api/navidrome";
import { readSetting, writeSetting } from "../services/settings-table";
import { SETTING_KEYS } from "../constants/setting-keys";
import type {
  PlayAuthContext,
  PlayMode,
  PlaybackSnapshot,
  PlayerState,
} from "../types/player";
import type { DownloadSettings } from "../types/settings";

const audio = new Audio();
audio.preload = "metadata";

const state = reactive<PlayerState>({
  playlist: [],
  currentIndex: -1,
  mode: "list",
  isPlaying: false,
  loading: false,
  progress: 0,
  duration: 0,
  volume: 1,
  error: null,
  authContext: null,
});

audio.volume = state.volume;

// 允许的播放模式集合，读取存储时用于校验（随机、顺序、单曲、列表循环）
const PLAY_MODES: PlayMode[] = ["shuffle", "order", "single", "list"];

// 从设置表恢复音量，默认保持 100% 音量
readSetting<number>(SETTING_KEYS.PLAYER_VOLUME)
  .then((stored) => {
    if (stored === null) {
      writeSetting(SETTING_KEYS.PLAYER_VOLUME, state.volume).catch((error) => {
        console.warn("写入默认音量失败", error);
      });
      return;
    }
    const ratio = clampPercent(stored);
    state.volume = ratio;
    audio.volume = ratio;
  })
  .catch((error) => {
    console.warn("读取音量偏好失败，已使用默认音量", error);
  });

// 从设置表恢复播放模式，若缺失则写入默认的列表循环
readSetting<PlayMode>(SETTING_KEYS.PLAYER_MODE)
  .then((storedMode) => {
    if (storedMode === null) {
      writeSetting(SETTING_KEYS.PLAYER_MODE, state.mode).catch((error) => {
        console.warn("写入默认播放模式失败", error);
      });
      return;
    }
    if (PLAY_MODES.includes(storedMode)) {
      state.mode = storedMode;
    } else {
      console.warn("读取到未知的播放模式，已回退为列表循环", storedMode);
      state.mode = "list";
    }
  })
  .catch((error) => {
    console.warn("读取播放模式失败，已回退为列表循环", error);
  });

// 计算当前播放的歌曲，未选择时返回 null
const currentTrack = computed(() => {
  if (state.currentIndex < 0 || state.currentIndex >= state.playlist.length) return null;
  return state.playlist[state.currentIndex];
});

// 更新进度信息，避免外部依赖 DOM 事件
function syncProgress() {
  state.progress = audio.currentTime || 0;
  state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
}

// 附加全局事件监听
function bindAudioEvents() {
  audio.addEventListener("timeupdate", syncProgress);
  audio.addEventListener("loadedmetadata", syncProgress);
  audio.addEventListener("ended", handleEnded);
  audio.addEventListener("play", () => {
    state.isPlaying = true;
  });
  audio.addEventListener("pause", () => {
    state.isPlaying = false;
  });
  audio.addEventListener("error", () => {
    state.error = "音频加载失败，请检查连接或登录状态";
  });
}

bindAudioEvents();

// 根据播放模式处理自动切歌
function handleEnded() {
  if (state.mode === "single") {
    playCurrent();
    return;
  }

  if (state.mode === "order" && state.currentIndex >= state.playlist.length - 1) {
    // 顺序播放走到末尾后直接停止
    state.isPlaying = false;
    return;
  }
  playNext();
}

// 将百分比换算为 0-1 的安全比例
function clampPercent(value: number) {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// 音频 MIME 类型，统一生成 Blob URL 时使用
const AUDIO_MIME = "audio/mpeg";

// 将当前播放信息持久化，便于刷新或重新登录后恢复
async function persistSnapshot() {
  const track = currentTrack.value;
  if (!track) {
    await writeSetting(SETTING_KEYS.PLAYER_SNAPSHOT, null);
    return;
  }

  const snapshot: PlaybackSnapshot = {
    trackId: track.id,
    mode: state.mode,
    volume: state.volume,
    updatedAt: Date.now(),
  };

  await writeSetting(SETTING_KEYS.PLAYER_SNAPSHOT, snapshot);
}

// 计算可播放的音频地址，若配置了缓存目录则先尝试落盘
async function resolvePlayableSource(track: NavidromeSong, context: PlayAuthContext) {
  const downloadSettings = await readSetting<DownloadSettings>(SETTING_KEYS.DOWNLOAD);
  const cacheDir = downloadSettings?.cacheDir?.trim();
  let cachePath: string | null = null;

  if (cacheDir) {
    try {
      await mkdir(cacheDir, { recursive: true });
      cachePath = await join(cacheDir, `${track.id}.mp3`);

      if (await exists(cachePath)) {
        const cachedBuffer = await readFile(cachePath);
        return URL.createObjectURL(new Blob([cachedBuffer], { type: AUDIO_MIME }));
      }
    } catch (error) {
      console.warn("创建或检查缓存目录失败，将直接播放流", error);
      cachePath = null;
    }
  }

  const streamUrl = buildStreamUrl({ ...context, songId: track.id });
  if (!cachePath) return streamUrl;

  try {
    const response = await fetch(streamUrl);
    if (!response.ok) {
      throw new Error(`拉取音频流失败，状态码 ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    await writeFile(cachePath, new Uint8Array(buffer));
    return URL.createObjectURL(new Blob([buffer], { type: AUDIO_MIME }));
  } catch (error) {
    console.warn("写入缓存失败，将回退为在线播放", error);
    return streamUrl;
  }
}

// 封装统一的播放入口
let playSessionId = 0;

async function playCurrent() {
  const track = currentTrack.value;
  const context = state.authContext;
  if (!track || !context) return;

  // 记录当前播放请求编号，避免并发切歌时旧请求覆盖新状态
  const sessionId = ++playSessionId;

  // 立即暂停当前播放，防止在新歌曲加载时旧音乐继续响起
  audio.pause();
  state.isPlaying = false;

  state.loading = true;
  state.error = null;
  try {
    const source = await resolvePlayableSource(track, context);
    // 如果在加载过程中用户已经切换到其他歌曲，则直接放弃当前请求
    if (sessionId !== playSessionId) return;

    if (audio.src !== source) {
      audio.src = source;
    }
    await audio.play();
    state.isPlaying = true;
    await persistSnapshot();
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    state.error = `播放失败：${hint}`;
    state.isPlaying = false;
  } finally {
    // 仅在最新请求收尾时更新状态，避免旧请求覆盖
    if (sessionId === playSessionId) {
      state.loading = false;
      syncProgress();
    }
  }
}

// 设置播放列表并立即开始播放指定歌曲
async function playFromList(
  list: NavidromeSong[],
  targetId: string,
  context: PlayAuthContext
) {
  state.playlist = [...list];
  state.authContext = context;
  const nextIndex = state.playlist.findIndex((item) => item.id === targetId);
  state.currentIndex = nextIndex >= 0 ? nextIndex : 0;
  await playCurrent();
}

// 插入为下一首播放，若当前无队列则立即播放目标歌曲
async function queueNext(track: NavidromeSong, context: PlayAuthContext) {
  state.authContext = context;

  if (state.playlist.length === 0) {
    state.playlist = [track];
    state.currentIndex = 0;
    await playCurrent();
    return;
  }

  const existingIndex = state.playlist.findIndex((item) => item.id === track.id);
  if (existingIndex >= 0) {
    state.playlist.splice(existingIndex, 1);
    if (existingIndex <= state.currentIndex && state.currentIndex > 0) {
      state.currentIndex -= 1;
    }
  }

  const insertIndex = Math.min(state.currentIndex + 1, state.playlist.length);
  state.playlist = [
    ...state.playlist.slice(0, insertIndex),
    track,
    ...state.playlist.slice(insertIndex),
  ];
}

// 在现有播放列表中切换到指定歌曲
async function playSongById(songId: string) {
  if (!state.authContext) return;
  const nextIndex = state.playlist.findIndex((item) => item.id === songId);
  if (nextIndex < 0) return;
  state.currentIndex = nextIndex;
  await playCurrent();
}

// 清空播放列表并重置播放状态
function clearPlaylist() {
  audio.pause();
  audio.src = "";
  state.playlist = [];
  state.currentIndex = -1;
  state.isPlaying = false;
  state.loading = false;
  state.progress = 0;
  state.duration = 0;
  state.error = null;
  writeSetting(SETTING_KEYS.PLAYER_SNAPSHOT, null).catch((error) => {
    console.warn("清空播放快照失败", error);
  });
}

// 登录或应用启动后从数据库恢复播放记录
async function restoreFromSnapshot(context: PlayAuthContext) {
  try {
    const snapshot = await readSetting<PlaybackSnapshot>(SETTING_KEYS.PLAYER_SNAPSHOT);
    if (!snapshot) return;

    const sanitizedSnapshot: PlaybackSnapshot = {
      trackId: snapshot.trackId,
      mode: snapshot.mode,
      volume: snapshot.volume ?? state.volume,
      updatedAt: snapshot.updatedAt,
    };

    const track = await getSongById({ ...context, songId: sanitizedSnapshot.trackId });
    state.authContext = context;
    state.playlist = [track];
    state.currentIndex = 0;
    state.mode = PLAY_MODES.includes(sanitizedSnapshot.mode)
      ? sanitizedSnapshot.mode
      : "list";
    state.volume = clampPercent(sanitizedSnapshot.volume ?? state.volume);
    audio.volume = state.volume;
    state.progress = 0;
    state.duration = 0;

    const source = await resolvePlayableSource(track, context);
    audio.src = source;
    syncProgress();

    // 回写去除进度信息的快照，确保数据库不再保存播放时间
    await writeSetting(SETTING_KEYS.PLAYER_SNAPSHOT, sanitizedSnapshot);
  } catch (error) {
    console.warn("恢复播放记录失败", error);
  }
}

// 切换播放/暂停
async function togglePlay() {
  if (!currentTrack.value) return;
  if (audio.paused) {
    await playCurrent();
  } else {
    audio.pause();
    state.isPlaying = false;
  }
}

// 播放下一首，遵循随机/顺序/列表循环
async function playNext() {
  if (state.playlist.length === 0) return;

  if (state.mode === "shuffle") {
    const next = Math.floor(Math.random() * state.playlist.length);
    state.currentIndex = next;
  } else if (state.mode === "order") {
    if (state.currentIndex >= state.playlist.length - 1) return;
    state.currentIndex += 1;
  } else {
    state.currentIndex = (state.currentIndex + 1) % state.playlist.length;
  }

  await playCurrent();
}

// 播放上一首
async function playPrev() {
  if (state.playlist.length === 0) return;

  if (state.mode === "shuffle") {
    const prev = Math.floor(Math.random() * state.playlist.length);
    state.currentIndex = prev;
  } else if (state.mode === "order") {
    state.currentIndex = Math.max(0, state.currentIndex - 1);
  } else {
    state.currentIndex =
      (state.currentIndex - 1 + state.playlist.length) % state.playlist.length;
  }

  await playCurrent();
}

// 进度跳转
function seekTo(percent: number) {
  if (!state.duration) return;
  const ratio = clampPercent(percent);
  audio.currentTime = ratio * state.duration;
  syncProgress();
}

// 设置音量
function setVolume(value: number) {
  const ratio = clampPercent(value);
  state.volume = ratio;
  audio.volume = ratio;
  writeSetting(SETTING_KEYS.PLAYER_VOLUME, ratio).catch((error) => {
    console.warn("保存音量偏好失败", error);
  });
  persistSnapshot().catch((error) => {
    console.warn("写入播放快照失败", error);
  });
}

// 直接设置目标播放模式，便于弹窗选择
function setMode(mode: PlayMode) {
  if (!PLAY_MODES.includes(mode)) return;
  state.mode = mode;
  writeSetting(SETTING_KEYS.PLAYER_MODE, state.mode).catch((error) => {
    console.warn("保存播放模式失败", error);
  });
  persistSnapshot().catch((error) => {
    console.warn("写入播放快照失败", error);
  });
}

// 切换播放模式
function cycleMode() {
  const index = PLAY_MODES.indexOf(state.mode);
  state.mode = PLAY_MODES[(index + 1) % PLAY_MODES.length];
  writeSetting(SETTING_KEYS.PLAYER_MODE, state.mode).catch((error) => {
    console.warn("保存播放模式失败", error);
  });
  persistSnapshot().catch((error) => {
    console.warn("写入播放快照失败", error);
  });
}

export function usePlayerStore() {
  return {
    state,
    currentTrack,
    playFromList,
    togglePlay,
    playNext,
    playPrev,
    seekTo,
    setVolume,
    setMode,
    cycleMode,
    restoreFromSnapshot,
    playSongById,
    queueNext,
    clearPlaylist,
  };
}
