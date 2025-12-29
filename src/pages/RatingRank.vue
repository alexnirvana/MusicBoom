<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useMessage } from "naive-ui";
import MainLayout from "../layouts/MainLayout.vue";
import SongTable from "../components/SongTable.vue";
import { listTopRated } from "../services/ratings";
import { useSettingsStore } from "../stores/settings";
import { useAuthStore } from "../stores/auth";
import { usePlayerStore } from "../stores/player";
import type { FetchSongsOptions, NavidromeSong } from "../api/navidrome";

const loading = ref(false);
const ratedSongs = ref<NavidromeSong[]>([]);
const message = useMessage();
const { state: authState } = useAuthStore();
const { state: settingsState, ready: settingsReady } = useSettingsStore();
const player = usePlayerStore();

// 统一获取 Navidrome 播放上下文，便于双击或右键直接播放
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

// 拉取评分排行，按评分与更新时间排序
async function loadTopRated() {
  loading.value = true;
  try {
    const rows = await listTopRated(300);
    ratedSongs.value = rows.map<NavidromeSong>((item) => ({
      id: item.songId,
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      created: item.updatedAt ? new Date(item.updatedAt).toISOString() : item.created || undefined,
      coverUrl: item.coverUrl || undefined,
      rating: item.rating,
    }));
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`读取评分排行失败：${hint}`);
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

onMounted(() => {
  void loadTopRated();
});
</script>

<template>
  <MainLayout>
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <div>
          <p class="m-0 text-sm uppercase tracking-[0.08em] text-[#8bb8ff]">评分排行</p>
          <h1 class="m-0 text-3xl font-semibold text-white">用户评分最高的歌曲</h1>
          <p class="m-0 text-[#c6d2e8]">基于本地评分记录，按评分与更新时间排序。</p>
        </div>
      </div>

      <SongTable
        title="评分最高的歌曲"
        :songs="ratedSongs"
        :loading="loading"
        :default-sort="{ columnKey: 'rating', order: 'descend', sorter: 'default' }"
        empty-hint="还没有评分数据，为歌曲打星后即可在此查看排行。"
        created-column-label="最近更新评分"
        @play="handlePlay"
        @play-next="handlePlayNext"
      />
    </div>
  </MainLayout>
</template>
