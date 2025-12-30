<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, nextTick, ref, watch, h } from "vue";
import type { Component } from "vue";
import { useMessage } from "naive-ui";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { emit, listen } from "@tauri-apps/api/event";
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

  ReorderThreeOutline,
  Shuffle,
  VolumeHighOutline,
} from "@vicons/ionicons5";
import { usePlayerStore } from "../stores/player";
import { useFavoriteStore } from "../stores/favorites";
import type { PlayMode } from "../types/player";
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
const favorites = useFavoriteStore();
const message = useMessage();
const playlistPanelRef = ref<InstanceType<typeof PlaylistNotification> | null>(null);
const playerBarRef = ref<HTMLElement | null>(null);
const router = useRouter();
const commandUnlisten = ref<UnlistenFn | null>(null);
const stateRequestUnlisten = ref<UnlistenFn | null>(null);
const miniWatchStop = ref<null | (() => void)>(null);

// 记录播放器高度，便于其他组件（如播放列表）计算可用空间
const updatePlayerHeight = () => {
  const height = playerBarRef.value?.offsetHeight || 0;
  document.documentElement.style.setProperty("--player-bar-height", `${height}px`);
};

onMounted(() => {
  nextTick(updatePlayerHeight);
  window.addEventListener("resize", updatePlayerHeight);
  setupMiniBridge().catch((error) => {
    console.warn("初始化精简模式桥接失败", error);
  });
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updatePlayerHeight);
  commandUnlisten.value?.();
  stateRequestUnlisten.value?.();
  miniWatchStop.value?.();
});

// 收藏态：根据当前歌曲动态判断，并在切换时刷新
const isCurrentFavorite = ref(false);
const favoriteLoading = ref(false);
let favoriteCheckToken = 0;

const IconLoop = {
  name: "IconLoop",
  render: () =>
    h(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        "xmlns:xlink": "http://www.w3.org/1999/xlink",
        viewBox: "0 0 24 24",
      },
      [
        h(
          "g",
          {
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          },
          [
            h("path", { d: "M4 12V9a3 3 0 0 1 3-3h13m-3-3l3 3l-3 3" }),
            h("path", { d: "M20 12v3a3 3 0 0 1-3 3H4m3 3l-3-3l3-3" }),
          ]
        ),
      ]
    ),
};

const IconSingleLoop = {
  name: "IconSingleLoop",
  render: () =>
    h(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        "xmlns:xlink": "http://www.w3.org/1999/xlink",
        viewBox: "0 0 24 24",
      },
      [
        h(
          "g",
          {
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          },
          [
            h("path", { d: "M4 12V9a3 3 0 0 1 3-3h13m-3-3l3 3l-3 3" }),
            h("path", { d: "M20 12v3a3 3 0 0 1-3 3H4m3 3l-3-3l3-3" }),
            h("path", { d: "M11 11l1-1v4" }),
          ]
        ),
      ]
    ),
};

// 播放模式信息，提供随机、顺序、单曲、列表四种模式
const modes: { key: PlayMode; label: string; icon: Component }[] = [
  { key: "shuffle", label: "随机播放", icon: Shuffle },
  { key: "order", label: "顺序播放", icon: ReorderThreeOutline },
  { key: "single", label: "单曲循环", icon: IconSingleLoop },
  { key: "list", label: "列表循环", icon: IconLoop },
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
    const result = favorites.isFavorite(songId);
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
    const isFav = await favorites.toggleFavorite(
      track.id,
      {
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        created: track.created,
      }
    );
    if (token === favoriteCheckToken) {
      isCurrentFavorite.value = isFav;
    }
    message.success(isFav ? "已添加到收藏" : "已取消收藏");
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
  try {
    const isFav = await favorites.toggleFavorite(
      song.id,
      {
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        created: song.created,
      }
    );
    if (song.id === player.currentTrack.value?.id) {
      isCurrentFavorite.value = isFav;
    }
    message.success(isFav ? "已添加到收藏" : "已取消收藏");
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
  playlistPanelRef.value?.toggle();
}

// 播放列表的定位事件：根据收藏状态跳转到对应页面并广播定位请求
function handleLocateFromPlaylist(song: NavidromeSong) {
  const target = favorites.isFavorite(song.id) ? { name: "favorites" } : { name: "my-music" };
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

// 生成迷你窗口所需的序列化播放状态
const miniState = computed(() => {
  const track = player.currentTrack.value;
  return {
    track: track
      ? {
          id: track.id,
          title: track.title,
          artist: track.artist,
          coverUrl: coverUrl.value,
          album: track.album,
        }
      : null,
    isPlaying: player.state.isPlaying,
    progress: player.state.progress,
    duration: player.state.duration,
    playlist: player.state.playlist.map((item) => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      coverUrl: item.coverUrl,
    })),
    favoriteIds: Array.from(favorites.state.favoriteIds),
    playSource: player.state.playSource,
    loading: player.state.loading,
  };
});

// 将播放状态广播给精简模式窗口
async function emitMiniState() {
  try {
    await emit("player:state", miniState.value);
  } catch (error) {
    console.warn("广播迷你窗口状态失败", error);
  }
}

// 处理来自精简模式的指令
async function handleMiniCommand(payload: { type: string; songId?: string }) {
  switch (payload.type) {
    case "toggle-play":
      await player.togglePlay();
      break;
    case "next":
      player.playNext();
      break;
    case "prev":
      player.playPrev();
      break;
    case "toggle-favorite":
      await toggleFavorite();
      break;
    case "play-by-id":
      if (payload.songId) {
        await handlePlayFromPlaylist(payload.songId);
      }
      break;
    default:
      break;
  }
  await emitMiniState();
}

// 监听精简模式事件，启动与销毁时清理
async function setupMiniBridge() {
  await emitMiniState();
  commandUnlisten.value = await listen("player:command", async (event) => {
    await handleMiniCommand(event.payload as { type: string; songId?: string });
  });

  stateRequestUnlisten.value = await listen("player:state-request", emitMiniState);

  miniWatchStop.value = watch(
    () => [
      player.currentTrack.value?.id,
      player.state.isPlaying,
      player.state.progress,
      player.state.duration,
      player.state.playlist.map((item) => item.id).join(","),
      favorites.state.refreshCounter,
      player.state.playSource,
      player.state.loading,
    ],
    () => {
      emitMiniState();
    }
  );
}
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
              <!-- 播放源指示器 -->
              <span 
                v-if="player.currentTrack.value"
                class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full"
                :class="{
                  'bg-green-500/20 text-green-400 border border-green-500/30': player.state.playSource === 'local',
                  'bg-blue-500/20 text-blue-400 border border-blue-500/30': player.state.playSource === 'downloaded',
                  'bg-purple-500/20 text-purple-400 border border-purple-500/30': player.state.playSource === 'cached',
                  'bg-orange-500/20 text-orange-400 border border-orange-500/30': player.state.playSource === 'online'
                }"
              >
                <span v-if="player.state.playSource === 'local'" class="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                <span v-if="player.state.playSource === 'downloaded'" class="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                <span v-if="player.state.playSource === 'cached'" class="w-1.5 h-1.5 bg-purple-400 rounded-full"></span>
                <span v-if="player.state.playSource === 'online'" class="w-1.5 h-1.5 bg-orange-400 rounded-full"></span>
                {{
                  player.state.playSource === 'local' ? '本地' :
                  player.state.playSource === 'downloaded' ? '已下载' :
                  player.state.playSource === 'cached' ? '缓存' : '在线'
                }}
              </span>
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
                  size="50"
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
        :favorite-ids="favorites.state.favoriteIds"
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
