<script setup lang="ts">
import {
  EllipsisHorizontal,
  Heart,
  HeartOutline,
  Locate,
  Play,
  CheckboxOutline,
  TrashOutline,
  ChevronDownOutline,
} from "@vicons/ionicons5";
import { NButton, NIcon, NScrollbar, NTag } from "naive-ui";
import {
  computed,
  nextTick,
  ref,
  watch,
  type ComponentPublicInstance,
  type PropType,
} from "vue";
import type { NavidromeSong } from "../types/navidrome";
import { colorTokens } from "../theme/colors";

// 入参：队列、当前播放歌曲与收藏状态
const props = defineProps({
  songs: { type: Array as PropType<NavidromeSong[]>, default: () => [] },
  currentId: { type: String, default: "" },
  favoriteIds: { type: Object as PropType<Set<string>>, default: () => new Set<string>() },
});

const emit = defineEmits<{
  (event: "play", songId: string): void;
  (event: "toggle-favorite", song: NavidromeSong): void;
  (event: "clear"): void;
  (event: "batch"): void;
  (event: "collapse"): void;
  (event: "locate", song: NavidromeSong): void;
}>();

const rowRefs = new Map<string, HTMLElement>();
const focusedId = ref<string>("");

// 格式化 mm:ss，保持与播放器一致
function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remain = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remain}`;
}

function registerRow(el: Element | ComponentPublicInstance | null, id: string) {
  if (el instanceof HTMLElement) {
    rowRefs.set(id, el);
  } else {
    rowRefs.delete(id);
  }
}

// 定位到指定歌曲并短暂高亮
function locateRow(id: string) {
  const target = rowRefs.get(id);
  if (!target) return;
  focusedId.value = id;
  nextTick(() => {
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => {
      if (focusedId.value === id) {
        focusedId.value = "";
      }
    }, 1200);
  });
}

// 播放列表数量展示
const playlistSize = computed(() => props.songs.length);

// 将配色注入 CSS 变量，方便维护与切换主题
const panelStyleVars = computed(() => ({
  "--playlist-bg": colorTokens.surface,
  "--playlist-border": colorTokens.border,
  "--playlist-divider": colorTokens.divider,
  "--playlist-text": colorTokens.textPrimary,
  "--playlist-subtext": colorTokens.textSecondary,
  "--playlist-muted": colorTokens.textMuted,
  "--playlist-accent": colorTokens.primary,
  "--playlist-accent-bg": colorTokens.primarySoft,
  "--playlist-accent-border": colorTokens.primaryBorder,
  "--playlist-highlight": colorTokens.success,
  "--playlist-highlight-bg": colorTokens.successSoft,
  "--playlist-highlight-border": colorTokens.successBorder,
  "--playlist-control-bg": colorTokens.controlBg,
  "--playlist-control-border": colorTokens.controlBorder,
  "--playlist-control-hover-border": colorTokens.controlHoverBorder,
  "--playlist-control-hover-bg": colorTokens.controlHoverBg,
  "--playlist-muted-accent": colorTokens.textAccent,
}));

watch(
  () => props.currentId,
  (id) => {
    if (id) locateRow(id);
  },
  { immediate: true }
);
</script>

<template>
  <div
    class="playlist-panel grid w-full grid-rows-[auto,1fr,auto] overflow-hidden"
    :style="panelStyleVars"
  >
    <div class="playlist-panel__header flex items-start justify-between gap-4 px-[18px] pb-2 pt-[16px]">
      <div class="space-y-1.5">
        <p class="playlist-panel__tagline m-0 text-xs uppercase tracking-[0.08em]">播放队列</p>
        <div class="playlist-panel__title-row flex flex-wrap items-center gap-2">
          <h3 class="playlist-panel__title m-0 text-[17px] font-bold leading-tight">当前播放列表</h3>
          <n-tag type="info" size="small" class="playlist-size-tag">
            {{ playlistSize }} 首
          </n-tag>
          <div class="playlist-panel__source">
            <span class="source-label">来源</span>
            <span class="source-chip">我的音乐</span>
            <span class="source-sep">/</span>
            <span class="source-chip">我的收藏</span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <n-button quaternary circle size="small" class="playlist-toolbar-btn" title="批量操作" @click="emit('batch')">
          <n-icon :component="CheckboxOutline" />
        </n-button>
        <n-button
          quaternary
          circle
          size="small"
          type="error"
          class="playlist-toolbar-btn"
          title="清空"
          @click="emit('clear')"
        >
          <n-icon :component="TrashOutline" />
        </n-button>
      </div>
    </div>

    <n-scrollbar class="h-full min-h-0 px-[10px] pb-2 pt-2 pl-3" trigger="hover">
      <div class="space-y-1">
        <div
          v-for="song in songs"
          :key="song.id"
          :ref="(el) => registerRow(el, song.id)"
          class="playlist-row group relative grid grid-cols-[1fr,120px] items-center gap-2 px-3 py-[10px]"
          :class="{
            'playlist-row--active': song.id === currentId,
            'playlist-row--focused': song.id === focusedId,
          }"
        >
          <div class="min-w-0 flex flex-col justify-center">
            <p class="playlist-row__title m-0 truncate text-[15px] font-semibold" :title="song.title">
              {{ song.title }}
            </p>
            <p class="playlist-row__artist mt-1 truncate text-sm" :title="song.artist">{{ song.artist }}</p>
          </div>
          <div class="relative flex min-w-0 items-center justify-end">
            <div
              class="playlist-row__duration text-sm transition-all duration-200 group-hover:translate-y-[2px] group-hover:opacity-0"
            >
              {{ formatDuration(song.duration) }}
            </div>
            <div
              class="absolute right-0 flex h-9 items-center gap-1.5 opacity-0 pointer-events-none transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 pl-2"
            >
              <n-button quaternary circle size="tiny" class="playlist-icon-btn" @click.stop="emit('play', song.id)">
                <n-icon :component="Play" size="22" />
              </n-button>
              <n-button
                quaternary
                circle
                size="tiny"
                class="playlist-icon-btn"
                :title="favoriteIds.has(song.id) ? '取消收藏' : '收藏'"
                @click.stop="emit('toggle-favorite', song)"
              >
                <n-icon :component="favoriteIds.has(song.id) ? Heart : HeartOutline" size="22" />
              </n-button>
              <n-button
                quaternary
                circle
                size="tiny"
                class="playlist-icon-btn"
                title="定位当前歌曲"
                @click.stop="emit('locate', song)"
              >
                <n-icon :component="Locate" size="22" />
              </n-button>
              <n-button quaternary circle size="tiny" class="playlist-icon-btn" title="更多操作">
                <n-icon :component="EllipsisHorizontal" size="22" />
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </n-scrollbar>

    <div class="playlist-panel__footer flex items-center justify-end px-[18px] py-[10px]">
      <n-button quaternary size="small" class="playlist-footer-btn px-3" @click="emit('collapse')">
        <n-icon :component="ChevronDownOutline" class="mr-1" />
        收起
      </n-button>
    </div>
  </div>
</template>

<style scoped>
.playlist-panel {
  border: none;
  border-radius: 0;
  background-color: var(--playlist-bg);
  color: var(--playlist-text);
  /* 根据播放器高度动态收缩，避免与底部播放器重叠 */
  min-height: calc(95vh - var(--player-bar-height, 0px));
  max-height: calc(95vh - var(--player-bar-height, 0px));
}

.playlist-panel__tagline {
  color: var(--playlist-muted-accent);
}

.playlist-panel__title {
  color: var(--playlist-text);
}

.playlist-panel__title-row {
  column-gap: 12px;
  row-gap: 8px;
}

.playlist-size-tag {
  border: 1px solid var(--playlist-accent-border);
  background: var(--playlist-accent-bg);
  color: var(--playlist-accent);
  border-radius: 0;
  padding: 0 10px;
}

.playlist-panel__source {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--playlist-subtext);
  font-size: 13px;
}

.source-label {
  padding: 2px 8px;
  background: var(--playlist-control-bg);
  color: var(--playlist-text);
  border: 1px solid var(--playlist-control-border);
  border-radius: 0;
}

.source-chip {
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--playlist-divider);
  border-radius: 0;
}

.source-sep {
  color: var(--playlist-muted);
}

.playlist-toolbar-btn {
  border: 1px solid var(--playlist-control-border);
  background: var(--playlist-control-bg);
  color: var(--playlist-text);
  border-radius: 0;
}

.playlist-toolbar-btn:hover {
  border-color: var(--playlist-control-hover-border);
  background: var(--playlist-control-hover-bg);
}

.playlist-row {
  transition: all 0.2s ease-out;
}

.playlist-row:hover {
  transform: translateX(-2px);
  background: var(--playlist-control-hover-bg);
  box-shadow: inset 0 0 0 1px var(--playlist-control-hover-border);
}

.playlist-row--active {
  background: var(--playlist-highlight-bg);
  box-shadow: inset 0 0 0 1px var(--playlist-highlight-border);
}

.playlist-row--focused {
  box-shadow: inset 0 0 0 1px var(--playlist-accent-border);
}

.playlist-row__title {
  color: var(--playlist-text);
}

.playlist-row__artist {
  color: var(--playlist-subtext);
}

.playlist-row__duration {
  color: var(--playlist-subtext);
}



.playlist-icon-btn {
  border: none;
  background: transparent;
  color: var(--playlist-text);
  border-radius: 0;
}

.playlist-icon-btn:hover {
  color: var(--playlist-accent);
}

.playlist-panel__footer {
  border-top: none;
  background: var(--playlist-bg);
}

.playlist-footer-btn {
  border: 1px solid var(--playlist-control-border);
  background: var(--playlist-control-bg);
  color: var(--playlist-text);
  border-radius: 0;
}

.playlist-footer-btn:hover {
  border-color: var(--playlist-control-hover-border);
  background: var(--playlist-control-hover-bg);
}

/* 通过通知容器类名控制外观，避免全局样式污染 */
:global(.playlist-panel-notification) {
  padding: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  border: none !important;
  width: auto !important;
}

:global(.playlist-panel-notification .n-notification-main),
:global(.playlist-panel-notification .n-notification-main__content),
:global(.playlist-panel-notification .n-notification__content) {
  padding: 0 !important;
  background: transparent !important;
  border-radius: 0 !important;
}
</style>
