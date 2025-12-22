<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import MainLayout from "../layouts/MainLayout.vue";
import SongTable from "../components/SongTable.vue";
import { getSongs, type FetchSongsOptions, type NavidromeSong } from "../api/navidrome";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";
import { usePlayerStore } from "../stores/player";
import { addFavorite, listFavorites, removeFavorite } from "../services/favorite";
import { useRouter } from "../utils/router-lite";
import { listenLocateRequest } from "../utils/playlist-locator";

// 状态管理：加载态、歌曲列表、收藏集
const loading = ref(false);
const songs = ref<NavidromeSong[]>([]);
const favoriteIds = ref<Set<string>>(new Set());
const message = useMessage();
const { state: authState } = useAuthStore();
const { state: settingsState, ready: settingsReady } = useSettingsStore();
const player = usePlayerStore();
const tableRef = ref<InstanceType<typeof SongTable> | null>(null);
const router = useRouter();
const pendingLocateId = ref<string | null>(null);

// 统一解析 Navidrome 鉴权上下文，供列表加载与播放器复用
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

// 从 Navidrome 拉取所有歌曲
async function loadSongs() {
  loading.value = true;
  try {
    await settingsReady;
    const context = resolveNavidromeContext();
    songs.value = await getSongs(context);
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`获取歌曲列表失败：${fallback}`);
  } finally {
    loading.value = false;
  }
}

// 读取收藏列表，保持表格中的爱心标记同步
async function loadFavorites() {
  try {
    const records = await listFavorites();
    favoriteIds.value = new Set(records.map((item) => item.songId));
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`读取收藏状态失败：${hint}`);
  }
}

// 双击播放：将组件内过滤后的列表作为播放队列，保持顺序一致
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

// 右键菜单：插入为下一首播放
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

// 切换收藏状态，空心表示未收藏，红色实心表示已收藏
async function toggleFavorite(row: NavidromeSong) {
  const isFav = favoriteIds.value.has(row.id);
  try {
    if (isFav) {
      await removeFavorite(row.id);
      favoriteIds.value.delete(row.id);
      favoriteIds.value = new Set(favoriteIds.value);
      message.success("已取消收藏");
      return;
    }

    await addFavorite({
      songId: row.id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      duration: row.duration,
    });
    favoriteIds.value.add(row.id);
    favoriteIds.value = new Set(favoriteIds.value);
    message.success("已添加到收藏");
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`更新收藏状态失败：${hint}`);
  }
}

function tryLocate(targetId: string) {
  const exists = songs.value.some((item) => item.id === targetId);
  if (!exists) return false;
  tableRef.value?.locateRow(targetId);
  return true;
}

const stopLocate = listenLocateRequest((song) => {
  if (router.currentRoute.value.name !== "my-music") return;
  pendingLocateId.value = song.id;
  const located = tryLocate(song.id);
  if (!located) {
    message.warning("当前页面未找到该歌曲，尝试同步后再试。");
  }
});

watch(
  () => songs.value.length,
  () => {
    if (pendingLocateId.value) {
      const done = tryLocate(pendingLocateId.value);
      if (done) {
        pendingLocateId.value = null;
      }
    }
  }
);

onMounted(() => {
  loadFavorites();
  loadSongs();
});

onBeforeUnmount(() => {
  stopLocate();
});
</script>

<template>
  <MainLayout>
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <div>
          <p class="m-0 text-sm uppercase tracking-[0.08em] text-[#8bb8ff]">我的音乐</p>
          <h1 class="m-0 text-3xl font-semibold text-white">来自 Navidrome 的全部歌曲</h1>
          <p class="m-0 text-[#c6d2e8]">打开页面后自动同步 Navidrome 中的曲库，便于统一搜索与管理。</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <n-button type="primary" color="#6366f1" :loading="loading" @click="loadSongs">立即同步</n-button>
        </div>
      </div>

      <SongTable
        title="全部歌曲"
        :songs="songs"
        :loading="loading"
        :favorite-ids="favoriteIds"
        empty-hint="暂无歌曲数据，尝试同步或检查 Navidrome 连接。"
        ref="tableRef"
        @toggle-favorite="toggleFavorite"
        @play="handlePlay"
        @play-next="handlePlayNext"
      />
    </div>
  </MainLayout>
</template>
