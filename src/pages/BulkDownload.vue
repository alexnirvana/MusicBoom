<script setup lang="ts">
import { exists, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { computed, onActivated, onMounted, ref } from "vue";
import { useMessage } from "naive-ui";
import MainLayout from "../layouts/MainLayout.vue";
import { getSongs, buildStreamUrl, type NavidromeSong } from "../api/navidrome";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";
import { useDownloadStore } from "../stores/download";
import { useRouter } from "../utils/router-lite";
import { buildNavidromeContext } from "../utils/navidrome-context";
import { resolveSongTargetPath } from "../utils/download-path";

const { state: authState } = useAuthStore();
const { state: settingsState, ready: settingsReady } = useSettingsStore();
const downloadStore = useDownloadStore();
const router = useRouter();
const message = useMessage();

const loading = ref(false);
const downloading = ref(false);
const songs = ref<NavidromeSong[]>([]);
const checkedRowKeys = ref<string[]>([]);

const downloadDirLabel = computed(() => settingsState.download.musicDir || "未设置");
const reservedPaths = new Set<string>();
const selectedSongs = computed(() =>
  songs.value.filter((item) => checkedRowKeys.value.includes(item.id))
);

async function loadSongs() {
  loading.value = true;
  try {
    await settingsReady;
    const context = buildNavidromeContext(authState, settingsState);
    songs.value = await getSongs(context);
    checkedRowKeys.value = songs.value.map((item) => item.id);
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`拉取歌曲失败：${hint}`);
  } finally {
    loading.value = false;
  }
}

function formatSize(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return "未知";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function downloadOne(song: NavidromeSong) {
  const targetPath = await resolveSongTargetPath(song, settingsState.download, {
    ensureDir: true,
    occupied: reservedPaths,
  });

  await downloadStore.trackDownload(song, async (signal, plannedPath, updateProgress) => {
    await settingsReady;
    const context = buildNavidromeContext(authState, settingsState);

    let buffer: Uint8Array | null = null;
    const cacheDir = settingsState.download.cacheDir?.trim();
    if (cacheDir) {
      try {
        const cachePath = await join(cacheDir, `${song.id}.mp3`);
        if (await exists(cachePath)) {
          buffer = await readFile(cachePath);
          updateProgress?.(80);
        }
      } catch (error) {
        console.warn("检查缓存失败，继续远程下载", error);
      }
    }

    if (!buffer) {
      const streamUrl = buildStreamUrl({ ...context, songId: song.id });
      const response = await fetch(streamUrl, { signal });
      if (!response.ok) {
        throw new Error(`下载失败，状态码 ${response.status}`);
      }
      const reader = response.body?.getReader();
      const contentLength = Number(response.headers.get("content-length")) || song.size || 0;

      if (reader) {
        const chunks: Uint8Array[] = [];
        let received = 0;
        let fallbackProgress = 5;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;

            if (contentLength > 0) {
              const percent = 5 + (received / contentLength) * 90;
              updateProgress?.(percent);
            } else {
              fallbackProgress = Math.min(95, fallbackProgress + 3);
              updateProgress?.(fallbackProgress);
            }
          }
        }

        buffer = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }
      } else {
        const arrayBuffer = await response.arrayBuffer();
        buffer = new Uint8Array(arrayBuffer);
        updateProgress?.(95);
      }
    }

    const finalPath = plannedPath || targetPath;
    await writeFile(finalPath, buffer);
    return { filePath: finalPath };
  }, targetPath);
}

async function filterDownloadTargets(list: NavidromeSong[]) {
  const pending: NavidromeSong[] = [];
  const skipped: string[] = [];

  console.log("[批量下载] 准备过滤下载目标，总数：", list.length);

  for (const song of list) {
    try {
      const finished = downloadStore.state.downloads.find(
        (item) => item.songId === song.id && item.status === "success" && item.filePath
      );
      if (!settingsState.download.overwriteExisting && finished?.filePath) {
        try {
          if (await exists(finished.filePath)) {
            console.log(
              "[批量下载] 跳过已完成的历史任务：",
              song.title || song.id,
              "历史文件：",
              finished.filePath
            );
            skipped.push(song.title || song.id);
            continue;
          }
        } catch (error) {
          console.warn("检查历史下载文件失败，继续下载", error);
        }
      }

      pending.push(song);
      console.log("[批量下载] 加入下载队列：", song.title || song.id);
    } catch (error) {
      console.warn("计算文件路径失败，跳过该歌曲", error);
    }
  }

  if (skipped.length) {
    const display = skipped.slice(0, 3).join("、");
    const moreHint = skipped.length > 3 ? ` 等 ${skipped.length} 首` : "";
    message.info(`已跳过已存在的歌曲：${display}${moreHint}`);
  }

  console.log(
    "[批量下载] 过滤完成，待下载：",
    pending.length,
    "首，跳过：",
    skipped.length,
    "首"
  );
  return pending;
}

async function handleDownloadSelected() {
  if (selectedSongs.value.length === 0) {
    message.warning("请先选择需要下载的歌曲");
    return;
  }

  downloading.value = true;
  try {
    const targets = await filterDownloadTargets(selectedSongs.value);
    if (targets.length === 0) {
      message.success("所选歌曲均已存在，无需重复下载");
      return;
    }
    // 启动全部下载任务后立即跳转，确保能立刻看到进度
    const tasks = targets.map((song) => downloadOne(song));
    downloadStore.setPreferredTab("downloading");
    router.push({ name: "local-download" });
    await Promise.allSettled(tasks);
    message.success("下载任务已提交，已为你跳转到下载进度页");
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`下载过程中出现问题：${hint}`);
  } finally {
    downloading.value = false;
  }
}

function goSettings() {
  router.push({ name: "settings" });
}

function exitPage() {
  router.push({ name: "my-music" });
}

onMounted(() => {
  loadSongs();
  downloadStore.refreshDownloads().then(() => {
    downloadStore.state.downloads.forEach((item) => {
      if (item.filePath) {
        reservedPaths.add(item.filePath);
      }
    });
  });
});

onActivated(() => {
  loadSongs();
  downloadStore.refreshDownloads().then(() => {
    downloadStore.state.downloads.forEach((item) => {
      if (item.filePath) {
        reservedPaths.add(item.filePath);
      }
    });
  });
});

const columns = [
  { type: "selection" as const, width: 60 },
  {
    title: "歌曲名称",
    key: "title",
    minWidth: 200,
    ellipsis: true,
    render: (row: NavidromeSong) => `${row.title} - ${row.artist}`,
  },
  { title: "专辑名", key: "album", minWidth: 160, ellipsis: true },
  {
    title: "歌曲文件大小",
    key: "size",
    width: 140,
    render: (row: NavidromeSong) => formatSize(row.size),
  },
];
</script>

<template>
  <MainLayout>
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <div class="flex flex-wrap items-center gap-3 text-white">
          <n-button
            v-if="selectedSongs.length > 0"
            type="primary"
            color="#22c55e"
            :loading="downloading"
            @click="handleDownloadSelected"
          >
            下载选中（{{ selectedSongs.length }}）
          </n-button>
          <span class="text-sm text-[#c6d2e8]">下载到：{{ downloadDirLabel }}</span>
          <n-button quaternary type="primary" color="#0ea5e9" @click="goSettings">更改目录</n-button>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-sm text-[#9ab4d8]">已选择 {{ selectedSongs.length }} 首歌曲</span>
          <n-button quaternary type="primary" color="#f43f5e" @click="exitPage">退出批量下载</n-button>
        </div>
      </div>

      <n-card :bordered="true" class="bg-white/5 border-white/10">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h3 class="m-0 text-lg font-semibold text-white">选择要下载的歌曲</h3>
              <span class="text-sm text-[#9ab4d8]">共 {{ songs.length }} 首</span>
            </div>
            <n-button quaternary type="primary" color="#6366f1" :loading="loading" @click="loadSongs">
              重新同步
            </n-button>
          </div>
        </template>

        <n-data-table
          :columns="columns"
          :data="songs"
          :loading="loading"
          :row-key="(row: NavidromeSong) => row.id"
          :checked-row-keys="checkedRowKeys"
          @update:checked-row-keys="(keys: (string | number)[]) => (checkedRowKeys = keys as string[])"
        />
      </n-card>
    </div>
  </MainLayout>
</template>
