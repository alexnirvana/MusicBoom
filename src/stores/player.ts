import { join } from "@tauri-apps/api/path";
import { exists, mkdir, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { computed, reactive } from "vue";
import type { NavidromeSong } from "../api/navidrome";
import { buildStreamUrl, getSongById } from "../api/navidrome";
import { listDownloadRecords, listLocalSongs } from "../services/library";
import type {
  PlayAuthContext,
  PlayMode,
  PlaySource,
  PlaybackSnapshot,
  PlayerState,
} from "../types/player";
import type { DownloadSettings } from "../types/settings";
import { playerConfigManager } from "../services/player-config";
import { readSetting } from "../services/settings-table";
import { SETTING_KEYS } from "../constants/setting-keys";
import { recordRecentPlay } from "../services/recent-plays";
import { emitRecentPlayUpdated } from "../utils/recent-play-events";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const audio = new Audio();
audio.preload = "metadata";

// 简单的系统判断，仅在 Windows 下才同步任务栏状态
const isWindows = navigator.userAgent.toLowerCase().includes("windows");

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
  playSource: "online",
});

audio.volume = state.volume;

// 允许的播放模式集合，读取存储时用于校验（随机、顺序、单曲、列表循环）
const PLAY_MODES: PlayMode[] = ["shuffle", "order", "single", "list"];

// 随机模式的播放历史，便于返回上一首时精确回退
const shuffleHistory: number[] = [];

// 缩略工具栏事件监听（Windows 任务栏按钮）
listen("windows-thumb-button", async (event) => {
  const action = event.payload as string;
  if (action === "prev") {
    await playPrev();
  } else if (action === "next") {
    await playNext();
  } else if (action === "toggle") {
    await togglePlay();
  }
}).catch((error) => {
  console.warn("监听任务栏按钮事件失败", error);
});

// 任务栏封面缓存，避免重复编码
const taskbarCoverCache: { lastTrackId: string | null; coverBase64: string | null } = {
  lastTrackId: null,
  coverBase64: null,
};

// 从本地配置恢复音量与播放模式
initializePlayerPreferences().catch((error) => {
  console.warn("恢复播放器基础配置失败，已使用默认值", error);
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

// 初始化播放器的基础偏好（音量与模式）
async function initializePlayerPreferences() {
  await playerConfigManager.initialize();
  const persisted = playerConfigManager.getState();
  if (!persisted) return;

  if (PLAY_MODES.includes(persisted.mode)) {
    state.mode = persisted.mode;
  } else {
    console.warn("读取到未知的播放模式，已回退为列表循环", persisted.mode);
    state.mode = "list";
  }

  const ratio = clampPercent(persisted.volume);
  state.volume = ratio;
  audio.volume = ratio;
}

// 记录随机播放模式下的历史轨迹，便于返回上一首
function recordShuffleHistory() {
  if (state.currentIndex < 0 || state.currentIndex >= state.playlist.length) return;
  const last = shuffleHistory.length > 0 ? shuffleHistory[shuffleHistory.length - 1] : undefined;
  if (last === state.currentIndex) return;

  shuffleHistory.push(state.currentIndex);
  const MAX_HISTORY = 200;
  if (shuffleHistory.length > MAX_HISTORY) {
    shuffleHistory.shift();
  }
}

// 清空随机模式的历史记录
function resetShuffleHistory() {
  shuffleHistory.length = 0;
}

// 将封面 URL 下载为 base64，避免任务栏调用跨域受限
async function fetchCoverBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  } catch (error) {
    console.warn("封面下载失败，任务栏缩略图将使用空图", error);
    return null;
  }
}

// 同步 Windows 任务栏缩略图与缩略工具栏状态
async function syncWindowsTaskbar() {
  if (!isWindows) return;

  const track = currentTrack.value;
  let coverBase64: string | null = null;

  if (track?.coverUrl) {
    if (taskbarCoverCache.lastTrackId === track.id && taskbarCoverCache.coverBase64) {
      coverBase64 = taskbarCoverCache.coverBase64;
    } else {
      coverBase64 = await fetchCoverBase64(track.coverUrl);
      taskbarCoverCache.lastTrackId = track.id;
      taskbarCoverCache.coverBase64 = coverBase64;
    }
  } else {
    taskbarCoverCache.lastTrackId = null;
    taskbarCoverCache.coverBase64 = null;
  }

  try {
    await invoke("update_windows_thumbnail", {
      payload: {
        cover_data: coverBase64,
        is_playing: state.isPlaying,
        title: track?.title ?? null,
      },
    });
  } catch (error) {
    console.warn("同步任务栏缩略图失败", error);
  }
}

// 计算随机模式下的下一首索引，尽量避免重复当前歌曲
function getNextShuffleIndex() {
  const length = state.playlist.length;
  if (length <= 1) return 0;

  const candidates = Array.from({ length }, (_, index) => index).filter(
    (index) => index !== state.currentIndex
  );
  const randomIndex = Math.floor(Math.random() * candidates.length);
  return candidates[randomIndex];
}

// 音频 MIME 类型，统一生成 Blob URL 时使用
const AUDIO_MIME = "audio/mpeg";

// 将当前播放信息持久化，便于刷新或重新登录后恢复
async function persistSnapshot() {
  const track = currentTrack.value;
  if (!track) {
    await playerConfigManager.saveState({ snapshot: null });
    return;
  }

  const snapshot: PlaybackSnapshot = {
    trackId: track.id,
    mode: state.mode,
    volume: state.volume,
    updatedAt: Date.now(),
  };

  await playerConfigManager.saveState({
    mode: state.mode,
    volume: state.volume,
    snapshot,
  });
}



// 计算可播放的音频地址，优先使用本地文件，返回播放源类型
async function resolvePlayableSource(track: NavidromeSong, context: PlayAuthContext): Promise<{ url: string; source: PlaySource }> {
  // 1. 首先检查本地音乐库
  const localSongs = await listLocalSongs();
  const localSong = localSongs.find(song => song.id === track.id);
  if (localSong && await exists(localSong.path)) {
    const localBuffer = await readFile(localSong.path);
    console.log(`使用本地音乐播放: ${track.title}`);
    state.playSource = "local";
    return { url: URL.createObjectURL(new Blob([localBuffer], { type: AUDIO_MIME })), source: "local" };
  }

  // 2. 检查下载记录中是否有成功下载的文件
  const downloadRecords = await listDownloadRecords("success");
  const downloadRecord = downloadRecords.find(record => record.songId === track.id);
  if (downloadRecord?.filePath && await exists(downloadRecord.filePath)) {
    const downloadBuffer = await readFile(downloadRecord.filePath);
    console.log(`使用下载文件播放: ${track.title}`);
    state.playSource = "downloaded";
    return { url: URL.createObjectURL(new Blob([downloadBuffer], { type: AUDIO_MIME })), source: "downloaded" };
  }

  // 3. 检查缓存目录
  const downloadSettings = await readSetting<DownloadSettings>(SETTING_KEYS.DOWNLOAD);
  const cacheDir = downloadSettings?.cacheDir?.trim();
  let cachePath: string | null = null;

  if (cacheDir) {
    try {
      await mkdir(cacheDir, { recursive: true });
      cachePath = await join(cacheDir, `${track.id}.mp3`);

      if (await exists(cachePath)) {
        const cachedBuffer = await readFile(cachePath);
        console.log(`使用缓存文件播放: ${track.title}`);
        state.playSource = "cached";
        return { url: URL.createObjectURL(new Blob([cachedBuffer], { type: AUDIO_MIME })), source: "cached" };
      }
    } catch (error) {
      console.warn("创建或检查缓存目录失败，将直接播放流", error);
      cachePath = null;
    }
  }

  // 4. 回退到在线流播放
  const streamUrl = buildStreamUrl({ ...context, songId: track.id });
  console.log(`使用在线流播放: ${track.title}`);
  state.playSource = "online";
  
  if (!cachePath) return { url: streamUrl, source: "online" };

  try {
    const response = await fetch(streamUrl);
    if (!response.ok) {
      throw new Error(`拉取音频流失败，状态码 ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    await writeFile(cachePath, new Uint8Array(buffer));
    return { url: URL.createObjectURL(new Blob([buffer], { type: AUDIO_MIME })), source: "cached" };
  } catch (error) {
    console.warn("写入缓存失败，将回退为在线播放", error);
    return { url: streamUrl, source: "online" };
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
    const { url } = await resolvePlayableSource(track, context);
    // 如果在加载过程中用户已经切换到其他歌曲，则直接放弃当前请求
    if (sessionId !== playSessionId) return;

    if (audio.src !== url) {
      audio.src = url;
    }
    await audio.play();
    state.isPlaying = true;
    try {
      const recorded = await recordRecentPlay(track);
      if (recorded) {
        emitRecentPlayUpdated();
      }
    } catch (error) {
      console.warn("记录最近播放失败", error);
    }
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
      await syncWindowsTaskbar();
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
  resetShuffleHistory();
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
  if (state.mode === "shuffle" && nextIndex !== state.currentIndex) {
    recordShuffleHistory();
  }
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
  resetShuffleHistory();
  playerConfigManager.saveState({ snapshot: null }).catch((error) => {
    console.warn("清空播放快照文件失败", error);
  });
}

// 登录或应用启动后从本地配置恢复播放记录
async function restoreFromSnapshot(context: PlayAuthContext) {
  try {
    await playerConfigManager.initialize();
    const persisted = playerConfigManager.getState();
    const snapshot = persisted?.snapshot;
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
    resetShuffleHistory();
    state.mode = PLAY_MODES.includes(sanitizedSnapshot.mode)
      ? sanitizedSnapshot.mode
      : "list";
    state.volume = clampPercent(sanitizedSnapshot.volume ?? state.volume);
    audio.volume = state.volume;
    state.progress = 0;
    state.duration = 0;

    const { url } = await resolvePlayableSource(track, context);
    audio.src = url;
    syncProgress();

    // 回写去除进度信息的快照，确保本地文件只保存必要信息
    await playerConfigManager.saveState({
      mode: state.mode,
      volume: state.volume,
      snapshot: sanitizedSnapshot,
    });
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
    await syncWindowsTaskbar();
  }
}

// 播放下一首，遵循随机/顺序/列表循环
async function playNext() {
  if (state.playlist.length === 0) return;

  if (state.mode === "shuffle") {
    recordShuffleHistory();
    state.currentIndex = getNextShuffleIndex();
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
    const prev = shuffleHistory.pop();
    if (prev === undefined) return;
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
  playerConfigManager.saveState({ volume: ratio }).catch((error) => {
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
  playerConfigManager.saveState({ mode: state.mode }).catch((error) => {
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
  playerConfigManager.saveState({ mode: state.mode }).catch((error) => {
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
