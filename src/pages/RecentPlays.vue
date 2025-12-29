<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useMessage } from "naive-ui";
import MainLayout from "../layouts/MainLayout.vue";
import SongTable from "../components/SongTable.vue";
import { listRecentPlays } from "../services/recent-plays";
import { useSettingsStore } from "../stores/settings";
import { useAuthStore } from "../stores/auth";
import { usePlayerStore } from "../stores/player";
import type { FetchSongsOptions, NavidromeSong } from "../api/navidrome";
import { listenRecentPlayUpdated } from "../utils/recent-play-events";

const loading = ref(false);
const recentSongs = ref<NavidromeSong[]>([]);
const message = useMessage();
const { state: authState } = useAuthStore();
const { state: settingsState, ready: settingsReady } = useSettingsStore();
const player = usePlayerStore();
let stopRecentPlayListener: (() => void) | null = null;
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

// 从本地数据库读取最近播放记录，去重并按时间倒序排列
async function loadRecentSongs() {
  loading.value = true;
  try {
    const rows = await listRecentPlays(500);
    recentSongs.value = rows.map<NavidromeSong>((item) => ({
      id: item.songId,
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      coverUrl: item.coverUrl || undefined,
      created: new Date(item.lastPlayed).toISOString(),
    }));
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`读取最近播放失败：${hint}`);
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
    void loadRecentSongs();
  }, 400);
}

onMounted(() => {
  loadRecentSongs();
  stopRecentPlayListener = listenRecentPlayUpdated(scheduleRefresh);
});

onUnmounted(() => {
  stopRecentPlayListener?.();
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
          <p class="m-0 text-sm uppercase tracking-[0.08em] text-[#8bb8ff]">最近播放</p>
          <h1 class="m-0 text-3xl font-semibold text-white">自动同步最近播放的 500 首歌曲</h1>
          <p class="m-0 text-[#c6d2e8]">重复播放会将歌曲顶置且不重复显示，方便继续收听。</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <n-button type="primary" color="#6366f1" :loading="loading" @click="loadRecentSongs">刷新列表</n-button>
        </div>
      </div>

      <SongTable
        title="最近播放"
        :songs="recentSongs"
        :loading="loading"
        empty-hint="暂无播放记录，开始听歌后会自动记录最近的歌曲。"
        created-column-label="最近播放时间"
        @play="handlePlay"
        @play-next="handlePlayNext"
      />
    </div>
  </MainLayout>
</template>
