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
  EllipsisHorizontal,
} from "@vicons/ionicons5";
import { NButton, NIcon, NDropdown } from "naive-ui";
import SongContextMenu from "../components/SongContextMenu.vue";

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
const pendingPlayState = ref<boolean | null>(null);
const shellRef = ref<HTMLElement | null>(null);
const miniWindow = getCurrentWindow();

// 播放列表hover状态
const hoveredSongId = ref<string | null>(null);

// 右键菜单
const showContextMenu = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextRow = ref<MiniTrack | null>(null);

const displayTitle = computed(() => miniState.track?.title || "尚未播放");
const displayArtist = computed(() => miniState.track?.artist || "等待下一首");
const isFavorite = computed(() => {
  if (!miniState.track) return false;
  return miniState.favoriteIds.has(miniState.track.id);
});

function setActionVisible(visible: boolean) {
  actionVisible.value = visible;
}

function handleMouseEnter() {
  setActionVisible(true);
}

function handleMouseLeave() {
  setActionVisible(false);
  hoveredSongId.value = null;
}

// 播放列表hover处理
function handleSongHover(songId: string) {
  hoveredSongId.value = songId;
}

function handleSongLeave() {
  hoveredSongId.value = null;
}

// 右键菜单处理
function handleContextMenu(event: MouseEvent, song: MiniTrack) {
  event.preventDefault();
  event.stopPropagation();
  contextRow.value = song;
  showContextMenu.value = false;
  nextTick(() => {
    contextMenuX.value = event.clientX;
    contextMenuY.value = event.clientY;
    showContextMenu.value = true;
  });
}

// 更多按钮点击处理
function handleMoreButtonClick(event: MouseEvent, song: MiniTrack) {
  event.preventDefault();
  event.stopPropagation();
  contextRow.value = song;
  showContextMenu.value = false;
  nextTick(() => {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    contextMenuX.value = rect.left;
    contextMenuY.value = rect.bottom + 4;
    showContextMenu.value = true;
    console.log('Context menu opened:', { x: contextMenuX.value, y: contextMenuY.value, song: song });
  });
}

function handleMenuClickoutside() {
  showContextMenu.value = false;
}

function handleMenuSelect(key: string | number) {
  showContextMenu.value = false;
  const target = contextRow.value;
  if (!target) return;

  if (key === "play") {
    handlePlayById(target.id);
    return;
  }

  if (key === "play-next") {
    // 查找当前歌曲在列表中的位置
    const index = miniState.playlist.findIndex((s) => s.id === target.id);
    if (index !== -1 && index < miniState.playlist.length - 1) {
      const nextSong = miniState.playlist[index + 1];
      handlePlayById(nextSong.id);
    }
    return;
  }

  if (key === "favorite") {
    toggleSongFavorite(target);
    return;
  }
}

function handleAddToPlaylist(payload: { playlistId: string }) {
  const target = contextRow.value;
  if (!target) return;

  // 转换 MiniTrack 为完整歌曲信息（如果有的话）
  const songWithAlbum = {
    ...target,
    album: '',
    duration: 0,
    created: undefined,
  };

  sendCommand("add-to-playlist", {
    songId: target.id,
    playlistId: payload.playlistId,
    song: songWithAlbum,
  });
}

function toggleSongFavorite(song: MiniTrack) {
  const isFav = miniState.favoriteIds.has(song.id);
  if (isFav) {
    miniState.favoriteIds.delete(song.id);
    sendCommand("toggle-favorite", { songId: song.id, remove: true });
  } else {
    miniState.favoriteIds.add(song.id);
    sendCommand("toggle-favorite", { songId: song.id, add: true });
  }
}

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
    // 如果播放列表展开，限制最大高度，让滚动条发挥作用
    if (playlistOpen.value) {
      const maxHeight = 480; // 播放列表展开时的最大高度
      const height = Math.min(Math.ceil(rect.height), maxHeight);
      await miniWindow.setSize(new LogicalSize(Math.ceil(rect.width), height));
    } else {
      await miniWindow.setSize(new LogicalSize(Math.ceil(rect.width), Math.ceil(rect.height)));
    }
  } catch (error) {
    console.error("调整精简窗口尺寸失败:", error);
  }
}

function toggleFavorite() {
  if (!miniState.track) return;
  sendCommand("toggle-favorite", { songId: miniState.track.id });
}

function handlePlayById(id: string) {
  console.log("Playing song:", id);
  // 如果点击的是当前歌曲，切换播放/暂停状态
  if (id === miniState.track?.id) {
    // 立即更新本地状态以提供即时反馈
    pendingPlayState.value = !miniState.isPlaying;
    miniState.isPlaying = pendingPlayState.value;
    sendCommand("toggle-play");
  } else {
    // 如果点击的是其他歌曲，播放该歌曲并设置为正在播放状态
    miniState.isPlaying = true;
    sendCommand("play-by-id", { songId: id });
  }
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
  await setupStateListener();
  requestState();
  await resizeWindowToContent();

  // 阻止双击卡片区域的默认行为（防止最大化/还原），但不影响窗口拖动
  const shell = shellRef.value;
  if (shell) {
    shell.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true });
  }
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
    <!-- 添加一个透明的拖动区域，确保有足够的空间进行拖动 -->
    <div class="drag-region" :class="{ 'expanded': playlistOpen }"></div>
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
        display: playlistOpen ? 'flex' : 'none'
      }"
    >
      <transition name="playlist-fade">
        <div v-if="playlistOpen" class="playlist-panel">
          <div class="playlist-scroll">
            <RecycleScroller
              class="playlist-list"
              :items="miniState.playlist"
              :item-size="56"
              key-field="id"
              v-slot="{ item }"
            >
              <div
                class="playlist-item"
                :class="{ active: miniState.track?.id === item.id }"
                @click="handlePlayById(item.id)"
                @mouseenter="handleSongHover(item.id)"
                @mouseleave="handleSongLeave"
                @contextmenu="(e) => handleContextMenu(e, item)"
              >
                <span class="song-title">{{ item.title }}</span>
                <span class="song-artist">{{ item.artist }}</span>
                <div v-show="hoveredSongId === item.id" class="song-actions">
                  <n-button
                    quaternary
                    circle
                    size="tiny"
                    class="action-btn"
                    :title="miniState.track?.id === item.id && miniState.isPlaying ? '暂停' : '播放'"
                    @click.stop="handlePlayById(item.id)"
                  >
                    <n-icon :component="miniState.track?.id === item.id && miniState.isPlaying ? PauseCircle : PlayCircle" size="14" />
                  </n-button>
                  <n-button
                    quaternary
                    circle
                    size="tiny"
                    class="action-btn"
                    :title="miniState.favoriteIds.has(item.id) ? '取消收藏' : '收藏'"
                    @click.stop="toggleSongFavorite(item)"
                  >
                    <n-icon
                      :component="miniState.favoriteIds.has(item.id) ? HeartSharp : HeartOutline"
                      :color="miniState.favoriteIds.has(item.id) ? '#ef4444' : '#9ab4d8'"
                      size="14"
                    />
                  </n-button>
                  <n-button
                    ref="moreButtonRefs"
                    quaternary
                    circle
                    size="tiny"
                    class="action-btn"
                    title="更多"
                    @click.stop="(e) => handleMoreButtonClick(e, item)"
                  >
                    <n-icon :component="EllipsisHorizontal" size="14" />
                  </n-button>
                </div>
              </div>
            </RecycleScroller>
          </div>
        </div>
      </transition>
    </div>
    <!-- 右键菜单 -->
    <n-dropdown
      trigger="manual"
      placement="bottom-start"
      :x="contextMenuX"
      :y="contextMenuY"
      :show="showContextMenu"
      :scrollable="true"
      @clickoutside="handleMenuClickoutside"
    >
      <template #default>
        <song-context-menu
          :row="contextRow"
          @play="handleMenuSelect('play')"
          @play-next="handleMenuSelect('play-next')"
          @toggle-favorite="handleMenuSelect('favorite')"
          @add-to-playlist="handleAddToPlaylist"
        >
          <template #default="{ options, onSelect }">
            <n-dropdown
              :options="options"
              @select="onSelect"
            />
          </template>
        </song-context-menu>
      </template>
    </n-dropdown>
  </div>
</template>

<style scoped>
.mini-shell {
  @apply relative flex w-full flex-col;
  padding: 0;
  background: transparent;
  -webkit-app-region: drag;
  overflow: hidden;
  border-radius: 16px;
}

.drag-region {
  @apply absolute top-0 left-0 w-full h-16;
  -webkit-app-region: drag;
  z-index: 1;
  pointer-events: none;
  border-radius: 16px;
}

.drag-region.expanded {
  @apply h-[104px];
  border-radius: 16px 16px 0 0;
}

.mini-card {
  @apply relative flex h-auto w-full items-center gap-3 bg-[#1c1f26]/95 px-4 py-3 shadow-2xl;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  background: radial-gradient(circle at 20% 20%, rgba(41, 51, 73, 0.65), transparent 55%),
    rgba(10, 14, 20, 0.94);
  flex-shrink: 0;
  max-width: 100%;
  margin: 0 auto;
  user-select: none;
  border-radius: 16px;
}

.mini-shell.playlist-expanded .mini-card {
  border-radius: 16px 16px 0 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
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
  @apply max-w-xl shadow-lg;
  width: 100%;
  max-height: 360px;
  z-index: 1;
  border-radius: 0 0 16px 16px;
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  -webkit-app-region: no-drag;
  background: radial-gradient(circle at 20% 20%, rgba(41, 51, 73, 0.5), transparent 60%),
    rgba(10, 14, 20, 0.9);
  margin-top: 0;
  padding: 12px;
}

.playlist-scroll {
  overflow: hidden;
  height: 336px;
  width: 100%;
}

/* 自定义滚动条样式 */
.playlist-scroll ::-webkit-scrollbar {
  width: 6px;
}

.playlist-scroll ::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.playlist-scroll ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  transition: background 0.2s;
}

.playlist-scroll ::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.playlist-list {
  @apply m-0 list-none p-0;
  width: 100%;
  height: 100%;
}

.vue-recycle-scroller__item-view {
  width: 100%;
  height: 56px;
}

.vue-recycle-scroller__item-wrapper {
  height: 56px;
}

.playlist-item {
  @apply cursor-pointer px-3 transition-all;
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  align-items: center;
  width: 100%;
  gap: 8px;
  border-radius: 8px;
  height: 56px;
}

.playlist-item:hover {
  background: rgba(112, 209, 255, 0.08);
}

.playlist-item.active {
  background: rgba(30, 215, 96, 0.15);
}

.song-title {
  @apply block text-sm text-white;
  flex: 1;
  min-width: 0;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-artist {
  @apply block text-xs text-[#c6cfe0];
  flex: 1;
  min-width: 0;
  line-height: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-actions {
  @apply flex items-center gap-2;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
  z-index: 10;
}

.playlist-item:hover .song-actions {
  opacity: 1;
  pointer-events: auto;
}

.action-btn {
  @apply grid place-items-center rounded-full;
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #e9eefb;
  transition: all 0.2s;
  pointer-events: auto;
}

.action-btn:hover {
  background: rgba(112, 209, 255, 0.2);
  border-color: rgba(112, 209, 255, 0.4);
  transform: translateY(-1px);
}

.playlist-placeholder {
  overflow: hidden;
  transition: height 0.25s ease;
  min-height: 0;
  -webkit-app-region: no-drag;
  border-radius: 0 0 16px 16px;
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

/* 确保 n-dropdown 在最上层 */
:deep(.n-dropdown-menu) {
  z-index: 1000 !important;
}

:deep(.n-dropdown) {
  z-index: 1000 !important;
}
</style>
