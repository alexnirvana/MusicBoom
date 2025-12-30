<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { emit, listen } from "@tauri-apps/api/event";
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import {
  HeartOutline,
  HeartSharp,
  ListOutline,
  PauseCircle,
  PlayCircle,
  PlaySkipBackSharp,
  PlaySkipForwardSharp,
  CloseOutline,
} from "@vicons/ionicons5";
import { NButton, NIcon, NScrollbar } from "naive-ui";

type MiniTrack = {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
};

const miniState = reactive<{
  track: MiniTrack | null;
  playlist: MiniTrack[];
  isPlaying: boolean;
  progress: number;
  duration: number;
  favoriteIds: Set<string>;
  playSource: string;
  loading: boolean;
}>({
  track: null,
  playlist: [],
  isPlaying: false,
  progress: 0,
  duration: 0,
  favoriteIds: new Set(),
  playSource: "online",
  loading: false,
});

const actionVisible = ref(false);

function handleMouseEnter() {
  console.log('Mouse enter shell', actionVisible.value);
  actionVisible.value = true;
}

function handleMouseLeave() {
  console.log('Mouse leave shell', actionVisible.value);
  actionVisible.value = false;
}
const playlistOpen = ref(false);
const unlistenState = ref<(() => void) | null>(null);
const pendingPlayState = ref<boolean | null>(null);
const shellRef = ref<HTMLElement | null>(null);
const miniWindow = getCurrentWindow();

const displayTitle = computed(() => miniState.track?.title || "尚未播放");
const displayArtist = computed(() => miniState.track?.artist || "等待下一首");
const isFavorite = computed(() => {
  if (!miniState.track) return false;
  return miniState.favoriteIds.has(miniState.track.id);
});

// 向主窗口发送指令
async function sendCommand(type: string, payload?: Record<string, unknown>) {
  try {
    if (type === "toggle-play" && miniState.track) {
      // 本地记录期望的播放态，先行更新按钮，等待主窗口回传后再校正
      const target = !miniState.isPlaying;
      pendingPlayState.value = target;
      miniState.isPlaying = target;
    }
    await emit("player:command", { type, ...payload });
  } catch (error) {
    console.error("发送控制指令失败:", error);
    // 指令失败时清理预期态，避免卡死在错误的按钮状态上
    if (type === "toggle-play") {
      pendingPlayState.value = null;
    }
  }
}

// 根据实际内容高度动态调整精简模式窗口，避免出现多余透明区域或内容被裁切
async function resizeWindowToContent() {
  await nextTick();
  const shell = shellRef.value;
  if (!shell) return;
  const rect = shell.getBoundingClientRect();
  try {
    await miniWindow.setSize(new LogicalSize(Math.ceil(rect.width), Math.ceil(rect.height)));
  } catch (error) {
    console.error("调整精简窗口尺寸失败:", error);
  }
}

function toggleFavorite() {
  if (!miniState.track) return;
  sendCommand("toggle-favorite", { songId: miniState.track.id });
}

function handlePlayById(id: string) {
  sendCommand("play-by-id", { songId: id });
}

async function restoreMainWindow() {
  try {
    await emit("mini-player:restore");
    const win = getCurrentWindow();
    await win.close();
  } catch (error) {
    console.error("关闭精简窗口失败:", error);
  }
}

function requestState() {
  emit("player:state-request");
}

// 监听主窗口广播的播放状态
async function setupStateListener() {
  unlistenState.value = await listen("player:state", (event) => {
    const payload = event.payload as any;
    miniState.track = payload.track || null;
    miniState.playlist = payload.playlist || [];
    miniState.isPlaying = payload.isPlaying;
    // 当主窗口状态与期望一致时，清理预期标记
    if (pendingPlayState.value !== null && payload.isPlaying === pendingPlayState.value) {
      pendingPlayState.value = null;
    } else if (pendingPlayState.value !== null && payload.isPlaying !== pendingPlayState.value) {
      // 主窗口回传与期望不符，也需要释放预期标记，避免状态长时间悬挂
      pendingPlayState.value = null;
    }
    miniState.progress = payload.progress;
    miniState.duration = payload.duration;
    miniState.playSource = payload.playSource;
    miniState.loading = payload.loading;
    miniState.favoriteIds = new Set(payload.favoriteIds || []);
  });
}

onMounted(async () => {
  console.log("MiniPlayer onMounted, actionVisible initial:", actionVisible.value);
  await setupStateListener();
  requestState();
  await resizeWindowToContent();

  // 阻止双击窗口默认行为（防止最大化/还原）
  document.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, { capture: true });
});

onBeforeUnmount(() => {
  unlistenState.value?.();
});

watch(playlistOpen, () => {
  resizeWindowToContent();
});

watch(
  () => miniState.playlist.length,
  () => {
    if (playlistOpen.value) {
      resizeWindowToContent();
    }
  }
);
</script>

<template>
  <div
    class="mini-shell"
    :class="{ 'playlist-expanded': playlistOpen }"
    ref="shellRef"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="mini-card">
      <div class="cover-wrap">
        <img
          :src="
            miniState.track?.coverUrl ||
            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=200&q=80'
          "
          alt="cover"
          class="cover-img"
        />
      </div>

      <div class="info-area">
        <div v-show="!actionVisible" class="title-block">
          <p class="title">{{ displayTitle }}</p>
          <p class="artist">{{ displayArtist }}</p>
        </div>

        <div v-show="actionVisible" class="actions">
          <n-button quaternary circle size="small" class="icon-btn" :class="{ active: isFavorite }" :title="isFavorite ? '取消收藏' : '收藏'" @click="toggleFavorite">
            <n-icon :component="isFavorite ? HeartSharp : HeartOutline" />
          </n-button>
          <n-button quaternary circle size="small" class="icon-btn" title="上一首" @click="sendCommand('prev')">
            <n-icon :component="PlaySkipBackSharp" />
          </n-button>
          <n-button quaternary circle size="medium" class="icon-btn play" :title="miniState.isPlaying ? '暂停' : '播放'" @click="sendCommand('toggle-play')">
            <n-icon :component="miniState.isPlaying ? PauseCircle : PlayCircle" />
          </n-button>
          <n-button quaternary circle size="small" class="icon-btn" title="下一首" @click="sendCommand('next')">
            <n-icon :component="PlaySkipForwardSharp"/>
          </n-button>
          <n-button
            quaternary
            circle
            size="small"
            class="icon-btn playlist-indicator"
            :class="{ active: playlistOpen }"
            :title="playlistOpen ? '收起播放列表' : '播放列表'"
            @click="playlistOpen = !playlistOpen"
          >
            <n-icon :component="ListOutline" />
          </n-button>
        </div>
      </div>

      <n-button
        v-show="actionVisible"
        quaternary
        circle
        size="tiny"
        class="close-btn"
        title="返回主界面"
        @click="restoreMainWindow"
      >
        <n-icon :component="CloseOutline" />
      </n-button>
    </div>

    <div
      class="playlist-placeholder"
      :style="{
        display: playlistOpen ? 'flex' : 'none',
        paddingTop: playlistOpen ? '8px' : '0px'
      }"
    >
      <transition name="playlist-fade">
        <div v-if="playlistOpen" class="playlist-panel">
          <div class="playlist-header">
            <span class="label">播放列表</span>
          </div>
          <n-scrollbar class="playlist-scroll">
            <ul class="playlist-list">
              <li
                v-for="item in miniState.playlist"
                :key="item.id"
                class="playlist-item"
                :class="{ active: miniState.track?.id === item.id }"
                @click="handlePlayById(item.id)"
              >
                <span class="song-title">{{ item.title }}</span>
                <span class="song-artist">{{ item.artist }}</span>
              </li>
            </ul>
          </n-scrollbar>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.mini-shell {
  @apply relative flex w-full flex-col;
  padding: 0;
  background: transparent;
  -webkit-app-region: drag;
}

.mini-shell.playlist-expanded {
  padding-bottom: 8px;
}

.mini-card {
  @apply relative flex h-auto w-full items-center gap-3  bg-[#1c1f26]/95 px-4 py-3 shadow-2xl;
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  background: radial-gradient(circle at 20% 20%, rgba(41, 51, 73, 0.65), transparent 55%),
    rgba(10, 14, 20, 0.94);
  flex-shrink: 0;
  max-width: 100%;
  margin: 0 auto;
  user-select: none;
}

.cover-wrap {
  @apply flex-shrink-0;
  user-select: none;
  -webkit-app-region: no-drag;
}

.cover-img {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  object-fit: cover;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
}

.info-area {
  @apply flex-1 overflow-hidden;
  min-height: 64px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  -webkit-app-region: no-drag;
}

.title-block {
  cursor: default;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  user-select: none;
}

.title {
  @apply m-0 truncate text-base font-semibold text-white;
}

.artist {
  @apply m-0 truncate text-sm text-[#c6cfe0];
}

.actions {
  @apply flex items-center gap-2 transition-opacity duration-200;
  -webkit-app-region: no-drag;
}

.icon-btn {
  @apply grid h-9 w-9 place-items-center rounded-full border border-white/10 text-[#e9eefb] transition-all;
  background: rgba(255, 255, 255, 0.04);
}

.icon-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(112, 209, 255, 0.6);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}

.icon-btn.play {
  background: linear-gradient(120deg, #1ed760, #12c48b);
  color: #0b0f17;
  border-color: transparent;
}

.icon-btn.active {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.4);
}

.playlist-indicator {
  background: rgba(255, 255, 255, 0.04);
  color: #e9eefb;
  transition: all 0.2s ease;
}

.playlist-indicator:hover {
  border-color: rgba(112, 209, 255, 0.6);
  background: rgba(112, 209, 255, 0.08);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.playlist-indicator.active {
  border-color: rgba(79, 134, 255, 0.6);
  background: rgba(79, 134, 255, 0.12);
  color: #4f86ff;
}

.close-btn {
  @apply absolute right-4 top-3 h-8 w-8;
  background: rgba(255, 255, 255, 0.04);
  color: #e9eefb;
  transition: all 0.2s ease;
  z-index: 10;
  -webkit-app-region: no-drag;
}

.close-btn:hover {
  border-color: rgba(239, 68, 68, 0.6);
  background: rgba(239, 68, 68, 0.08);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.playlist-panel {
  @apply max-w-xl rounded-2xl bg-[#1c1f26]/95 p-3 shadow-lg;
  width: 100%;
  height: 100%;
  max-height: 360px;
  z-index: 1;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  -webkit-app-region: no-drag;
}

.playlist-header {
  @apply mb-2 flex items-center;
}

.playlist-header .label {
  @apply text-sm text-[#9eb5d6];
}

.playlist-scroll {
  @apply flex-1;
  min-height: 0;
  max-height: 280px;
}

.playlist-list {
  @apply m-0 list-none space-y-2 p-0;
}

.playlist-item {
  @apply cursor-pointer rounded-xl border border-transparent bg-white/5 px-3 py-2 transition-all;
}

.playlist-item:hover {
  border-color: rgba(112, 209, 255, 0.4);
  background: rgba(112, 209, 255, 0.08);
}

.playlist-item.active {
  border-color: rgba(30, 215, 96, 0.5);
  background: rgba(30, 215, 96, 0.12);
}

.song-title {
  @apply block truncate text-sm text-white;
}

.song-artist {
  @apply block truncate text-xs text-[#c6cfe0];
}

.playlist-placeholder {
  overflow: hidden;
  transition: height 0.25s ease, padding-top 0.25s ease;
  min-height: 0;
  -webkit-app-region: no-drag;
}

.playlist-fade-enter-active,
.playlist-fade-leave-active {
  transition: all 0.2s ease;
}

.playlist-fade-enter-from,
.playlist-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
