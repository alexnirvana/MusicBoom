<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import MainLayout from "../layouts/MainLayout.vue";
import SongTable from "../components/SongTable.vue";
import { useSettingsStore } from "../stores/settings";
import { useAuthStore } from "../stores/auth";
import { usePlayerStore } from "../stores/player";
import { useFavoriteStore } from "../stores/favorites";
import { listFavorites } from "../services/favorite";
import type { FetchSongsOptions, NavidromeSong } from "../api/navidrome";
import { useRouter } from "../utils/router-lite";
import { listenLocateRequest } from "../utils/playlist-locator";

// 收藏页使用数据库数据，单独维护列表与收藏状态集合
const favoriteSongs = ref<NavidromeSong[]>([]);
const loading = ref(false);
const message = useMessage();
const { state: authState } = useAuthStore();
const { state: settingsState, ready: settingsReady } = useSettingsStore();
const player = usePlayerStore();
const favorites = useFavoriteStore();
const tableRef = ref<InstanceType<typeof SongTable> | null>(null);
const router = useRouter();
const pendingLocateId = ref<string | null>(null);

// 播放器复用 Navidrome 鉴权上下文
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

// 从本地数据库读取收藏并转换为表格需要的结构
async function loadFavoriteSongs() {
  loading.value = true;
  try {
    const records = await listFavorites();
    favoriteSongs.value = records.map<NavidromeSong>((item) => ({
      id: item.songId,
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      created: item.created,
    }));
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`读取收藏列表失败：${hint}`);
  } finally {
    loading.value = false;
  }
}

// 双击播放：使用当前筛选后的收藏列表作为播放队列
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

// 右键菜单：添加为下一首播放
async function handlePlayNext(payload: { row: NavidromeSong; list: NavidromeSong[] }) {
  try {
    await settingsReady;
    const context = resolveNavidromeContext();
    await player.queueNext(payload.row, context);
    message.success(`已加入下一首播放：${payload.row.title}`);
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`操作失败：${hint}`);
  }
}

function tryLocate(targetId: string) {
  const exists = favoriteSongs.value.some((item) => item.id === targetId);
  if (!exists) return false;
  tableRef.value?.locateRow(targetId);
  return true;
}

const stopLocate = listenLocateRequest((song) => {
  if (router.currentRoute.value.name !== "favorites") return;
  pendingLocateId.value = song.id;
  const located = tryLocate(song.id);
  if (!located) {
    message.warning("收藏列表中暂无该歌曲，尝试刷新收藏后再试。");
  }
});

watch(
  () => favoriteSongs.value.length,
  () => {
    if (pendingLocateId.value) {
      const done = tryLocate(pendingLocateId.value);
      if (done) {
        pendingLocateId.value = null;
      }
    }
  }
);

onMounted(async () => {
  await favorites.ready;
  loadFavoriteSongs();
});

// 监听全局收藏状态刷新，自动更新收藏列表
watch(
  () => favorites.state.refreshCounter,
  () => {
    loadFavoriteSongs();
  }
);

onBeforeUnmount(() => {
  stopLocate();
});
</script>

<template>
  <MainLayout>
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <div>
          <p class="m-0 text-sm uppercase tracking-[0.08em] text-[#8bb8ff]">我喜欢</p>
          <h1 class="m-0 text-3xl font-semibold text-white">收藏的歌曲</h1>
          <p class="m-0 text-[#c6d2e8]">展示保存在本地数据库的收藏记录，仍可直接播放和取消收藏。</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <n-button type="primary" color="#22c55e" :loading="loading" @click="loadFavoriteSongs">刷新收藏</n-button>
        </div>
      </div>

      <SongTable
        title="我喜欢的歌曲"
        :songs="favoriteSongs"
        :loading="loading"
        empty-hint="尚未收藏任何歌曲，去曲库里点亮小爱心吧！"
        ref="tableRef"
        @play="handlePlay"
        @play-next="handlePlayNext"
      />
    </div>
  </MainLayout>
</template>
