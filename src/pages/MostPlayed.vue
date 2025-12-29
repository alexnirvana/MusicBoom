<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useMessage } from "naive-ui";
import MainLayout from "../layouts/MainLayout.vue";
import SongTable from "../components/SongTable.vue";
import { listMostPlayed } from "../services/recent-plays";
import { useSettingsStore } from "../stores/settings";
import { useAuthStore } from "../stores/auth";
import { usePlayerStore } from "../stores/player";
import type { FetchSongsOptions, NavidromeSong } from "../api/navidrome";
import { listenRecentPlayUpdated } from "../utils/recent-play-events";

const loading = ref(false);
const mostPlayedSongs = ref<NavidromeSong[]>([]);
const message = useMessage();
const { state: authState } = useAuthStore();
const { state: settingsState, ready: settingsReady } = useSettingsStore();
const player = usePlayerStore();
let stopListener: (() => void) | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

// 复用 Navidrome 鉴权上下文，便于直接播放
function resolveNavidromeContext(): FetchSongsOptions {
  const baseUrl = (authState.baseUrl || settingsState.navidrome.baseUrl || "").trim();
  if (!baseUrl) {
    throw new Error("缺少 Navidrome 基础地址，请先登录或在设置中填写连接信息");
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

// 从本地数据库读取播放次数最高的歌曲，按次数与最近播放时间排序
async function loadMostPlayed() {
  loading.value = true;
  try {
    const rows = await listMostPlayed(300);
    mostPlayedSongs.value = rows.map<NavidromeSong>((item) => ({
      id: item.songId,
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      created: new Date(item.lastPlayed).toISOString(),
      coverUrl: item.coverUrl || undefined,
      playCount: item.playCount,
    }));
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`读取最多播放列表失败：${hint}`);
  } finally {
    loading.value = false;
  }
}

// 双击或右键菜单播放
async function handlePlay(payload: { row: NavidromeSong; list: NavidromeSong[] }) {
  try {
    await settingsReady;
    const context = resolveNavidromeContext();
    await player.playFromList(payload.list, payload.row.id, context);
    message.success(`正在播放：${payload.row.title}`);
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`播放失败：${hint}`);
  }
}

// 下一首播放
async function handlePlayNext(payload: { row: NavidromeSong; list: NavidromeSong[] }) {
  try {
    await settingsReady;
    const context = resolveNavidromeContext();
    await player.queueNext(payload.row, context);
    message.success(`已添加为下一首播放：${payload.row.title}`);
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`操作失败：${hint}`);
  }
}

// 节流刷新，避免频繁更新 UI
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void loadMostPlayed();
  }, 400);
}

onMounted(() => {
  loadMostPlayed();
  stopListener = listenRecentPlayUpdated(scheduleRefresh);
});

onUnmounted(() => {
  stopListener?.();
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
});
</script>

<template>
  <MainLayout>
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <div>
          <p class="m-0 text-sm uppercase tracking-[0.08em] text-[#8bb8ff]">最多播放</p>
          <h1 class="m-0 text-3xl font-semibold text-white">播放次数最高的歌曲排行</h1>
          <p class="m-0 text-[#c6d2e8]">基于本地播放记录自动汇总，次数相同时按最近播放时间排序。</p>
        </div>
      </div>

      <SongTable
        title="最多播放的歌曲"
        :songs="mostPlayedSongs"
        :loading="loading"
        :show-play-count="true"
        play-count-label="播放次数"
        created-column-label="最近播放时间"
        :default-sort="{ columnKey: 'playCount', order: 'descend', sorter: 'default' }"
        empty-hint="暂无播放数据，开始听歌后会自动累计播放次数。"
        @play="handlePlay"
        @play-next="handlePlayNext"
      />
    </div>
  </MainLayout>
</template>
