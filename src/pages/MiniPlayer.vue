<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
import { NIcon, NScrollbar } from "naive-ui";

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
const playlistOpen = ref(false);
const unlistenState = ref<(() => void) | null>(null);

const displayTitle = computed(() => miniState.track?.title || "尚未播放");
const displayArtist = computed(() => miniState.track?.artist || "等待下一首");
const isFavorite = computed(() => {
  if (!miniState.track) return false;
  return miniState.favoriteIds.has(miniState.track.id);
});

// 向主窗口发送指令
async function sendCommand(type: string, payload?: Record<string, unknown>) {
  try {
    await emit("player:command", { type, ...payload });
  } catch (error) {
    console.error("发送控制指令失败:", error);
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
    miniState.progress = payload.progress;
    miniState.duration = payload.duration;
    miniState.playSource = payload.playSource;
    miniState.loading = payload.loading;
    miniState.favoriteIds = new Set(payload.favoriteIds || []);
  });
}

onMounted(async () => {
  await setupStateListener();
  requestState();
});

onBeforeUnmount(() => {
  unlistenState.value?.();
});
</script>

<template>
  <div
    class="mini-shell"
    @mouseenter="actionVisible = true"
    @mouseleave="actionVisible = false"
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
        <div class="title-block" @click="restoreMainWindow">
          <p class="title">{{ displayTitle }}</p>
          <p class="artist">{{ displayArtist }}</p>
        </div>

        <div class="actions" :class="{ visible: actionVisible }">
          <button class="icon-btn" :class="{ active: isFavorite }" :title="isFavorite ? '取消收藏' : '收藏'" @click="toggleFavorite">
            <n-icon :component="isFavorite ? HeartSharp : HeartOutline" />
          </button>
          <button class="icon-btn" title="上一首" @click="sendCommand('prev')">
            <n-icon :component="PlaySkipBackSharp" />
          </button>
          <button class="icon-btn play" :title="miniState.isPlaying ? '暂停' : '播放'" @click="sendCommand('toggle-play')">
            <n-icon :component="miniState.isPlaying ? PauseCircle : PlayCircle" />
          </button>
          <button class="icon-btn" title="下一首" @click="sendCommand('next')">
            <n-icon :component="PlaySkipForwardSharp" />
          </button>
          <button class="icon-btn" title="播放列表" @click="playlistOpen = !playlistOpen">
            <n-icon :component="ListOutline" />
          </button>
        </div>
      </div>

      <button class="icon-btn close-btn" title="返回主界面" @click="restoreMainWindow">
        <n-icon :component="CloseOutline" />
      </button>
    </div>

    <transition name="playlist-fade">
      <div v-if="playlistOpen" class="playlist-panel">
        <div class="playlist-header">
          <span class="label">播放列表</span>
          <button class="toggle-btn" @click="playlistOpen = false">收起</button>
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
</template>

<style scoped>
.mini-shell {
  @apply h-screen w-screen flex items-start justify-center bg-transparent;
}

.mini-card {
  @apply relative flex items-center gap-3 rounded-2xl bg-[#1c1f26]/95 px-4 py-3 shadow-2xl;
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  min-width: 360px;
}

.cover-wrap {
  @apply flex-shrink-0;
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
}

.title-block {
  cursor: pointer;
}

.title {
  @apply m-0 truncate text-base font-semibold text-white;
}

.artist {
  @apply m-0 truncate text-sm text-[#c6cfe0];
}

.actions {
  @apply mt-2 flex items-center gap-2 opacity-0 transition-opacity duration-200;
}

.actions.visible {
  opacity: 1;
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

.close-btn {
  @apply absolute right-2 top-2 h-7 w-7;
}

.playlist-panel {
  @apply mt-3 w-full max-w-xl rounded-2xl bg-[#1c1f26]/95 p-3 shadow-lg;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
}

.playlist-header {
  @apply mb-2 flex items-center justify-between;
}

.playlist-header .label {
  @apply text-sm text-[#9eb5d6];
}

.toggle-btn {
  @apply rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-[#e9eefb];
}

.playlist-scroll {
  max-height: 220px;
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

.playlist-fade-enter-active,
.playlist-fade-leave-active {
  transition: all 0.2s ease;
}

.playlist-fade-enter-from,
.playlist-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
