// 下载与本地音乐的状态管理，集中处理批量下载、进度与本地歌曲列表
import { computed, reactive } from "vue";
import type { NavidromeSong } from "../types/navidrome";
import type { DownloadRecord, DownloadStatus, LocalSongRecord } from "../services/library";
import {
  listDownloadRecords,
  listLocalSongs,
  removeDownloadRecord,
  removeDownloadRecords,
  removeLocalSongs,
  upsertDownloadRecord,
  upsertLocalSong,
} from "../services/library";

// 下载页使用的标签类型，方便在页面间传递意图
export type DownloadTab = "local" | "downloaded" | "downloading";

interface DownloadTask extends DownloadRecord {
  controller?: AbortController;
}

interface DownloadState {
  localSongs: LocalSongRecord[];
  downloads: DownloadTask[];
  loading: boolean;
  // 记录希望展示的标签，便于从批量下载页跳转后自动切换
  preferredTab?: DownloadTab;
}

const state = reactive<DownloadState>({
  localSongs: [],
  downloads: [],
  loading: false,
});

// 设置希望在本地与下载页默认展示的标签
function setPreferredTab(tab: DownloadTab) {
  state.preferredTab = tab;
}

// 读取并清除预设的标签，避免影响后续的普通访问
function consumePreferredTab(defaultTab: DownloadTab = "local") {
  const tab = state.preferredTab ?? defaultTab;
  state.preferredTab = undefined;
  return tab;
}

async function refreshLocalSongs() {
  state.localSongs = await listLocalSongs();
}

async function refreshDownloads(status?: DownloadStatus) {
  const records = await listDownloadRecords(status);
  state.downloads = records.map((item) => ({ ...item }));
}

async function addLocalSongFromPath(path: string, size: number) {
  const filename = path.split(/\\|\//).pop() || "未知文件";
  const title = filename.replace(/\.[^.]+$/, "");
  const record: LocalSongRecord = {
    id: crypto.randomUUID(),
    title,
    album: "本地文件",
    artist: "本地文件",
    path,
    size,
  };
  await upsertLocalSong(record);
  await refreshLocalSongs();
}

function markDownload(task: DownloadTask) {
  const existingIndex = state.downloads.findIndex((item) => item.songId === task.songId);
  if (existingIndex >= 0) {
    state.downloads.splice(existingIndex, 1, task);
  } else {
    state.downloads.push(task);
  }
}

async function persistDownload(task: DownloadTask) {
  await upsertDownloadRecord(task);
  markDownload(task);
}

async function clearDownload(songId: string) {
  await removeDownloadRecord(songId);
  state.downloads = state.downloads.filter((item) => item.songId !== songId);
}

async function clearDownloads(songIds: string[]) {
  if (!songIds.length) return;
  await removeDownloadRecords(songIds);
  state.downloads = state.downloads.filter((item) => !songIds.includes(item.songId));
}

async function deleteLocalSongs(ids: string[]) {
  if (!ids.length) return;
  await removeLocalSongs(ids);
  state.localSongs = state.localSongs.filter((item) => !ids.includes(item.id));
}

async function trackDownload(
  song: NavidromeSong,
  updater: (
    signal: AbortSignal,
    targetPath?: string,
    updateProgress?: (percent: number) => void
  ) => Promise<{ filePath?: string | null }>,
  targetPath?: string
) {
  // 尝试复用已有的下载记录，方便恢复时保持路径一致
  const existing = state.downloads.find((item) => item.songId === song.id);
  const task: DownloadTask = existing
    ? { ...existing }
    : {
        songId: song.id,
        title: song.title,
        album: song.album,
        size: song.size || 0,
        status: "pending",
        progress: 0,
      };

  if (targetPath) {
    task.filePath = targetPath;
  }

  markDownload(task);

  const updateProgress = (percent: number) => {
    const normalized = Math.min(99, Math.max(0, Math.round(percent)));
    if (normalized === task.progress) return;
    task.progress = normalized;
    markDownload(task);
  };

  const controller = new AbortController();
  task.controller = controller;
  task.status = "downloading";
  task.progress = Math.max(task.progress || 0, 5);
  await persistDownload(task);

  try {
    const result = await updater(controller.signal, task.filePath || targetPath, updateProgress);
    if (controller.signal.aborted) {
      task.status = "cancelled";
      task.progress = 0;
      await persistDownload(task);
      return;
    }

    task.status = "success";
    task.progress = 100;
    task.filePath = result.filePath || task.filePath || targetPath;
    await persistDownload(task);
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    task.status = "failed";
    task.progress = 0;
    task.errorMessage = hint;
    await persistDownload(task);
  }
}

async function cancelDownload(songId: string) {
  const target = state.downloads.find((item) => item.songId === songId);
  target?.controller?.abort();
  if (target) {
    target.status = "cancelled";
    target.progress = 0;
    // 立即同步数据库，避免刷新后又自动恢复
    await persistDownload(target);
    // 从当前列表中移除，给用户即时反馈
    state.downloads = state.downloads.filter((item) => item.songId !== songId);
  }
}

async function cancelDownloads(songIds: string[]) {
  if (!songIds.length) return;
  for (const id of songIds) {
    await cancelDownload(id);
  }
}

const downloadingList = computed(() =>
  state.downloads.filter((item) => item.status === "pending" || item.status === "downloading")
);
const downloadedList = computed(() => state.downloads.filter((item) => item.status === "success"));

export function useDownloadStore() {
  return {
    state,
    downloadingList,
    downloadedList,
    setPreferredTab,
    consumePreferredTab,
    refreshLocalSongs,
    refreshDownloads,
    addLocalSongFromPath,
    trackDownload,
    cancelDownload,
    cancelDownloads,
    clearDownload,
    clearDownloads,
    deleteLocalSongs,
  };
}

