<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, nextTick, ref, watch } from "vue";
import type { Component } from "vue";
import { useMessage } from "naive-ui";
import {
  DownloadOutline,
  EllipsisHorizontal,
  HeartSharp,
  HeartOutline,
  ListOutline,
  PauseCircle,
  PlayCircle,
  PlaySkipBackSharp,
  PlaySkipForwardSharp,
  Repeat,
  RepeatOutline,
  ReorderThreeOutline,
  Shuffle,
  VolumeHighOutline,
} from "@vicons/ionicons5";
import { usePlayerStore } from "../stores/player";
import type { PlayMode } from "../types/player";
import {
  addFavorite,
  isFavorite,
  listFavorites,
  removeFavorite,
} from "../services/favorite";
import PlaylistNotification from "./PlaylistNotification.vue";
import type { NavidromeSong } from "../types/navidrome";
import { useRouter } from "../utils/router-lite";
import { emitLocateRequest } from "../utils/playlist-locator";

// 接收左侧偏移，避免播放器横跨侧边栏
const props = withDefaults(defineProps<{ offsetLeft?: number }>(), {
  offsetLeft: 0,
});

// 复用播放器全局状态
const player = usePlayerStore();
const message = useMessage();
const playlistPanelRef = ref<InstanceType<typeof PlaylistNotification> | null>(null);
const playerBarRef = ref<HTMLElement | null>(null);
const router = useRouter();

// 记录播放器高度，便于其他组件（如播放列表）计算可用空间
const updatePlayerHeight = () => {
  const height = playerBarRef.value?.offsetHeight || 0;
  document.documentElement.style.setProperty("--player-bar-height", `${height}px`);
};

onMounted(() => {
  nextTick(updatePlayerHeight);
  window.addEventListener("resize", updatePlayerHeight);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updatePlayerHeight);
});

// 收藏态：根据当前歌曲动态判断，并在切换时刷新
const isCurrentFavorite = ref(false);
const favoriteLoading = ref(false);
let favoriteCheckToken = 0;
const favoriteIds = ref<Set<string>>(new Set());
const favoritesReady = ref(false);

// 播放模式信息，提供随机、顺序、单曲、列表四种模式
const modes: { key: PlayMode; label: string; icon: Component }[] = [
  { key: "shuffle", label: "随机播放", icon: Shuffle },
  { key: "order", label: "顺序播放", icon: ReorderThreeOutline },
  { key: "single", label: "单曲循环", icon: RepeatOutline },
  { key: "list", label: "列表循环", icon: Repeat },
];

// 基于全局状态计算当前模式
const currentMode = computed(() => modes.find((item) => item.key === player.state.mode) || modes[1]);

// 进度百分比与格式化时间，双向绑定以便拖动
const progressPercent = computed({
  get: () => {
    if (!player.state.duration) return 0;
    return (player.state.progress / player.state.duration) * 100;
  },
  set: (value: number) => {
    if (!player.state.duration) return;
    player.seekTo(value / 100);
  },
});

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remain = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remain}`;
}

const formattedDuration = computed(() => formatTime(player.state.duration || 0));
const formattedProgress = computed(() => formatTime(player.state.progress || 0));

// 音量百分比，便于在滑块与展示中共用
const volumePercent = computed({
  get: () => Math.round(player.state.volume * 100),
  set: (value: number) => {
    player.setVolume(value / 100);
  },
});

// 封面占位，避免无数据时出现破图
const coverUrl = computed(
  () =>
    player.currentTrack.value?.coverUrl ||
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=200&q=80"
);

// 更新收藏状态，避免上一首的查询结果覆盖最新状态
async function refreshFavoriteStatus(songId: string | null) {
  const token = ++favoriteCheckToken;
  if (!songId) {
    isCurrentFavorite.value = false;
    favoriteLoading.value = false;
    return;
  }

  favoriteLoading.value = true;
  try {
    const result = await isFavorite(songId);
    if (token !== favoriteCheckToken) return;
    isCurrentFavorite.value = result;
  } catch (error) {
    if (token !== favoriteCheckToken) return;
    const hint = error instanceof Error ? error.message : String(error);
    message.warning(`读取收藏状态失败：${hint}`);
    isCurrentFavorite.value = false;
  } finally {
    if (token === favoriteCheckToken) {
      favoriteLoading.value = false;
    }
  }
}

// 读取收藏库供播放列表弹窗使用
async function loadFavoriteSet() {
  try {
    const records = await listFavorites();
    favoriteIds.value = new Set(records.map((item) => item.songId));
    favoritesReady.value = true;
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.warning(`读取收藏状态失败：${hint}`);
  }
}

// 维护收藏集合，便于播放列表快捷标记
function updateFavoriteCache(songId: string, favored: boolean) {
  if (favored) {
    favoriteIds.value.add(songId);
  } else {
    favoriteIds.value.delete(songId);
  }
  favoriteIds.value = new Set(favoriteIds.value);
}

// 播放歌曲切换时立即检查收藏状态
watch(
  () => player.currentTrack.value?.id || null,
  (songId) => {
    refreshFavoriteStatus(songId);
  },
  { immediate: true }
);

// 允许在播放器直接切换收藏态
async function toggleFavorite() {
  const track = player.currentTrack.value;
  if (!track) return;

  const token = ++favoriteCheckToken;
  favoriteLoading.value = true;
  try {
    if (isCurrentFavorite.value) {
      await removeFavorite(track.id);
      if (token === favoriteCheckToken) {
        isCurrentFavorite.value = false;
      }
      updateFavoriteCache(track.id, false);
      message.success("已取消收藏");
      return;
    }

    await addFavorite({
      songId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
    });
    if (token === favoriteCheckToken) {
      isCurrentFavorite.value = true;
    }
    updateFavoriteCache(track.id, true);
    message.success("已添加到收藏");
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`更新收藏状态失败：${hint}`);
  } finally {
    if (token === favoriteCheckToken) {
      favoriteLoading.value = false;
    }
  }
}

// 在播放列表中播放指定歌曲
async function handlePlayFromPlaylist(songId: string) {
  try {
    await player.playSongById(songId);
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`播放失败：${hint}`);
  }
}

// 播放列表内的收藏切换
async function toggleFavoriteFromPlaylist(song: NavidromeSong) {
  const isFav = favoriteIds.value.has(song.id);
  try {
    if (isFav) {
      await removeFavorite(song.id);
      updateFavoriteCache(song.id, false);
      if (song.id === player.currentTrack.value?.id) {
        isCurrentFavorite.value = false;
      }
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
    updateFavoriteCache(song.id, true);
    if (song.id === player.currentTrack.value?.id) {
      isCurrentFavorite.value = true;
    }
    message.success("已添加到收藏");
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`更新收藏状态失败：${hint}`);
  }
}

// 清空播放列表
function handleClearPlaylist() {
  player.clearPlaylist();
  message.success("已清空播放列表");
  closePlaylistPanel();
}

// 批量操作占位
function handleBatchAction() {
  message.info("批量操作即将上线，敬请期待");
}

// 打开或收起播放列表通知
function closePlaylistPanel() {
  playlistPanelRef.value?.close();
}

async function togglePlaylistPanel() {
  if (!favoritesReady.value) {
    await loadFavoriteSet();
  }
  playlistPanelRef.value?.toggle();
}

// 播放列表的定位事件：根据收藏状态跳转到对应页面并广播定位请求
function handleLocateFromPlaylist(song: NavidromeSong) {
  const target = favoriteIds.value.has(song.id) ? { name: "favorites" } : { name: "my-music" };
  router.push(target);
  emitLocateRequest(song);
  closePlaylistPanel();
}

// 播放队列数量展示，用于按钮徽标
const playlistCount = computed(() => player.state.playlist.length);

watch(
  () => player.state.playlist.length,
  (size) => {
    if (!size) {
      closePlaylistPanel();
    }
  }
);
</script>

<template>
  <div
    class="fixed bottom-0 right-0 z-30 border-t border-white/10 bg-[#121724]/95 shadow-[0_-6px_24px_rgba(0,0,0,0.35)]"
    ref="playerBarRef"
    :style="{ left: `${props.offsetLeft}px` }"
  >
    <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#4f86ff]/12 via-transparent to-[#70d1ff]/12"></div>
    <div class="relative px-6 pt-4">
      <div class="mb-4 flex items-center gap-3 pb-1">
        <n-slider
          v-model:value="progressPercent"
          :step="0.1"
          :min="0"
          :max="100"
          class="flex-1 progress-slider"
          :tooltip="false"
        />
      </div>

      <div class="grid grid-cols-[320px_1fr_180px] items-center gap-4 pb-2">
        <div class="flex items-center gap-3 text-[#e8ecf2]">
          <img :src="coverUrl" alt="cover" class="h-12 w-12 rounded-lg object-cover shadow-lg" />
          <div class="flex min-w-0 flex-col gap-2">
            <p class="m-0 truncate text-lg font-semibold text-white">
              {{
                `${player.currentTrack.value?.title || "尚未开始播放"} - ${
                  player.currentTrack.value?.artist || "未知歌手"
                }`
              }}
            </p>
            <div class="flex items-center gap-2">
              <n-button
                quaternary
                circle
                class="border border-white/15 bg-white/5 text-[#f2f5ff]"
                :title="isCurrentFavorite ? '取消收藏' : '收藏'"
                :loading="favoriteLoading"
                :disabled="!player.currentTrack.value"
                @click="toggleFavorite"
              >
                <n-icon
                  :component="isCurrentFavorite ? HeartSharp : HeartOutline"
                  :color="isCurrentFavorite ? '#ef4444' : '#f2f5ff'"
                />
              </n-button>
              <n-button quaternary circle class="border border-white/15 bg-white/5 text-[#f2f5ff]" title="下载">
                <n-icon :component="DownloadOutline" />
              </n-button>
              <n-button quaternary circle class="border border-white/15 bg-white/5 text-[#f2f5ff]" title="更多">
                <n-icon :component="EllipsisHorizontal" />
              </n-button>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-center gap-3">
          <n-popover
            trigger="click"
            placement="top"
            :show-arrow="false"
            overlay-class="transparent-popover"
            :overlay-style="{
              background: 'transparent',
              boxShadow: 'none',
              padding: '0px'
            }"
          >
            <template #trigger>
              <n-button
                quaternary
                circle
                size="small"
                class="flex items-center justify-center border border-white/20 text-[#f2f5ff] mode-trigger"
                :title="currentMode.label"
              >
                <span class="relative flex items-center justify-center mode-icon">
                  <n-icon :component="currentMode.icon" />
                  <span v-if="currentMode.key === 'single'" class="mode-badge">1</span>
                </span>
              </n-button>
            </template>
            <div class="flex flex-col gap-2">
              <div
                v-for="item in modes"
                :key="item.key"
                class="flex items-center justify-between gap-3 mode-row"
                @click="player.setMode(item.key)"
              >
                <div class="flex items-center gap-3">
                  <span class="relative flex items-center justify-center mode-icon">
                    <n-icon :component="item.icon" />
                    <span v-if="item.key === 'single'" class="mode-badge">1</span>
                  </span>
                  <span>{{ item.label }}</span>
                </div>
                <span v-if="item.key === player.state.mode" class="text-xs text-[#22d68a]">✓</span>
              </div>
            </div>
          </n-popover>
          <div class="flex items-center gap-2">
            <n-button quaternary circle class="border border-white/15 text-[#f2f5ff]" title="上一首" @click="player.playPrev">
              <n-icon :component="PlaySkipBackSharp" />
            </n-button>
            <n-button
              type="primary"
              circle
              strong
              size="large"
              class="text-[#0f121d]"
              title="播放/暂停"
              :loading="player.state.loading"
              @click="player.togglePlay"
            >
              <template #icon>
                <n-icon
                  v-if="!player.state.loading"
                  :component="player.state.isPlaying ? PauseCircle : PlayCircle"
                  size="22"
                />
              </template>
            </n-button>
            <n-button quaternary circle class="border border-white/15 text-[#f2f5ff]" title="下一首" @click="player.playNext">
              <n-icon :component="PlaySkipForwardSharp" />
            </n-button>
            <n-popover
              trigger="click"
              placement="top"
              :show-arrow="false"
              overlay-class="transparent-popover"
              :overlay-style="{
                background: 'transparent',
                boxShadow: 'none',
                padding: '0px'
              }"
            >
              <template #trigger>
                <n-button quaternary circle class="border border-white/15 text-[#f2f5ff]" title="音量">
                  <n-icon :component="VolumeHighOutline" />
                </n-button>
              </template>
              <div class="volume-popover">
                <div class="flex flex-col items-center gap-3">
                  <div class="relative flex flex-col items-center gap-2 volume-slider">
                    <n-slider
                      v-model:value="volumePercent"
                      vertical
                      :step="1"
                      :min="0"
                      :max="100"
                      :rail-style="() => ({ backgroundColor: 'rgba(255,255,255,0.14)' })"
                      :track-style="() => ({ backgroundColor: '#1dd87c' })"
                      :handle-style="() => ({
                        width: '14px',
                        height: '14px',
                        borderColor: '#1dd87c',
                        backgroundColor: '#1dd87c',
                        boxShadow: '0 0 0 2px rgba(29,216,124,0.25)'
                      })"
                    />
                    <span class="volume-value">{{ volumePercent }}%</span>
                  </div>
                  <n-icon :component="VolumeHighOutline" class="text-lg text-[#c6d2e8]" />
                </div>
              </div>
            </n-popover>
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 text-[#e8ecf2]">
          <div class="text-sm text-[#c6d2e8] tabular-nums">{{ formattedProgress }} / {{ formattedDuration }}</div>
          <n-badge :value="playlistCount" type="info" show-zero :max="999" class="playlist-badge">
            <n-button
              quaternary
              circle
              class="border border-white/15 text-[#f2f5ff]"
              title="播放列表"
              @click="togglePlaylistPanel"
            >
              <n-icon :component="ListOutline" />
            </n-button>
          </n-badge>
        </div>
        </div>
      <PlaylistNotification
        ref="playlistPanelRef"
        :songs="player.state.playlist"
        :current-id="player.currentTrack.value?.id || ''"
        :favorite-ids="favoriteIds"
        @play="handlePlayFromPlaylist"
        @toggle-favorite="toggleFavoriteFromPlaylist"
        @clear="handleClearPlaylist"
        @batch="handleBatchAction"
        @locate="handleLocateFromPlaylist"
      />
    </div>
  </div>
</template>

<style scoped>
/* 仅在 hover 时显示进度滑块的圆点，保持整体简洁 */
.progress-slider :deep(.n-slider-handle) {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.progress-slider:hover :deep(.n-slider-handle),
.progress-slider:focus-within :deep(.n-slider-handle) {
  opacity: 1;
}



.mode-row {
  padding: 10px;
  border-radius: 10px;
  color: #e8ecf2;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.mode-row:hover {
  background: rgba(112, 209, 255, 0.12);
  color: #ffffff;
}

.mode-icon {
  width: 20px;
  height: 20px;
}

/* 播放模式按钮改为等宽高的圆形外观 */
.mode-trigger {
  width: 34px;
  height: 34px;
  border-radius: 9999px;
}

.mode-badge {
  position: absolute;
  right: -2px;
  top: -6px;
  font-size: 10px;
  color: #1dd87c;
}

.volume-slider :deep(.n-slider) {
  height: 150px;
}

.volume-value {
  font-size: 13px;
  color: #22d68a;
}

.playlist-badge :deep(.n-badge-sup) {
  background: linear-gradient(120deg, #4f86ff, #70d1ff);
  color: #0b0f17;
  box-shadow: 0 4px 10px rgba(79, 134, 255, 0.35);
}

/* 让模式与音量弹层背景透明，避免覆盖自定义渐变 */
:deep(.transparent-popover .n-popover__content) {
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
  overflow: visible;
}

</style>
