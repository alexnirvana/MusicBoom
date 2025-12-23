<script setup lang="ts">
import { Play } from "@vicons/ionicons5";
import { NButton, NIcon, useMessage } from "naive-ui";
import { computed, h, onMounted, ref, watch, type Component } from "vue";
import MainLayout from "../layouts/MainLayout.vue";
import PageHeader from "../components/PageHeader.vue";
import SongTable from "../components/SongTable.vue";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";
import { usePlayerStore } from "../stores/player";
import { usePlaylistsStore } from "../stores/playlists";
import { addFavorite, listFavorites, removeFavorite } from "../services/favorite";
import type { FetchSongsOptions, NavidromeSong } from "../api/navidrome";

const playlists = usePlaylistsStore();
const player = usePlayerStore();
const message = useMessage();
const { state: authState } = useAuthStore();
const { state: settingsState, ready: settingsReady } = useSettingsStore();

// 获取当前选中的歌单
const currentPlaylist = playlists.current;
const playlistSongs = computed(() => currentPlaylist.value?.songs || []);
const loading = computed(() => !playlists.state.ready);

// 收藏相关状态
const favoriteIds = ref<Set<string>>(new Set());

// 统一解析 Navidrome 鉴权上下文
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

// 处理播放相关操作
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

// 处理收藏切换
async function handleToggleFavorite(song: NavidromeSong) {
  const isFav = favoriteIds.value.has(song.id);
  try {
    if (isFav) {
      await removeFavorite(song.id);
      favoriteIds.value.delete(song.id);
      favoriteIds.value = new Set(favoriteIds.value);
      message.success("已取消收藏");
      return;
    }

    await addFavorite({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      duration: song.duration,
    });
    favoriteIds.value.add(song.id);
    favoriteIds.value = new Set(favoriteIds.value);
    message.success("已添加到收藏");
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`更新收藏状态失败：${hint}`);
  }
}

// 渲染操作按钮
function renderIcon(icon: Component) {
  return () => h(NIcon, { size: 18 }, { default: () => h(icon) });
}

// 读取收藏列表
async function loadFavorites() {
  try {
    const records = await listFavorites();
    favoriteIds.value = new Set(records.map((item) => item.songId));
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`读取收藏状态失败：${hint}`);
  }
}

// 监听当前歌单ID变化，加载歌曲数据
watch(
  () => playlists.state.currentId,
  (newId) => {
    if (newId) {
      playlists.loadSongsForPlaylist(newId).catch(() => {
        message.error("加载歌单歌曲失败");
      });
    }
  },
  { immediate: true }
);

// 组件挂载时，加载收藏列表并选中歌单
onMounted(() => {
  loadFavorites();
  if (!playlists.state.currentId && playlists.state.items.length > 0) {
    playlists.selectPlaylist(playlists.state.items[0].id);
  }
});
</script>

<template>
  <MainLayout>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-3">
          <h1 class="m-0 text-2xl font-bold text-white">
            {{ currentPlaylist?.name || "歌单" }}
          </h1>
          <span class="text-sm text-[#9ab4d8]">
            {{ playlistSongs.length }} 首歌曲
          </span>
        </div>
      </template>
      
      <template #actions>
        <div class="flex items-center gap-2">
          <NButton
            v-if="playlistSongs.length > 0"
            type="primary"
            size="medium"
            :render-icon="renderIcon(Play)"
            @click="handlePlay({ row: playlistSongs[0], list: playlistSongs })"
          >
            播放全部
          </NButton>
        </div>
      </template>
    </PageHeader>

    <div class="space-y-6">
      <SongTable
        :title="currentPlaylist?.name || '歌单'"
        :songs="playlistSongs"
        :loading="loading"
        :favorite-ids="favoriteIds"
        :empty-hint="currentPlaylist ? '该歌单暂无歌曲，快去添加一些吧！' : '请从左侧选择一个歌单'"
        @toggle-favorite="handleToggleFavorite"
        @play="handlePlay"
        @play-next="handlePlayNext"
      />
    </div>
  </MainLayout>
</template>