<script setup lang="ts">
import { h, onBeforeUnmount, ref, watch, type PropType } from "vue";
import { useNotification, type NotificationOptions } from "naive-ui";
import PlaylistPanelContent from "./PlaylistPanelContent.vue";
import type { NavidromeSong } from "../types/navidrome";

// 入参与原始面板保持一致，便于复用
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
  (event: "locate", song: NavidromeSong): void;
}>();

const notification = useNotification();
const notificationHolder = ref<ReturnType<typeof notification.create> | null>(null);

function close() {
  if (notificationHolder.value) {
    notificationHolder.value.destroy();
    notificationHolder.value = null;
  }
}

function open() {
  if (notificationHolder.value) return;
  notificationHolder.value = notification.create({
    // 使用透明通知容器承载播放列表，确保样式保持与页面一致
    content: () =>
      h(PlaylistPanelContent, {
        songs: props.songs,
        currentId: props.currentId,
        favoriteIds: props.favoriteIds,
        onPlay: (id: string) => emit("play", id),
        onToggleFavorite: (song: NavidromeSong) => emit("toggle-favorite", song),
        onClear: () => emit("clear"),
        onBatch: () => emit("batch"),
        onLocate: (song: NavidromeSong) => emit("locate", song),
        onCollapse: close,
      }),
    closable: false,
    duration: 0,
    keepAliveOnHover: true,
    containerClass: "playlist-panel-notification",
    containerStyle: {
      padding: "0",
      background: "transparent",
      boxShadow: "none",
      border: "none",
      width: "auto",
    },
  } as NotificationOptions & { class?: string });
}

function toggle() {
  if (notificationHolder.value) {
    close();
  } else {
    open();
  }
}

function refresh(propsUpdated?: boolean) {
  if (!notificationHolder.value) return;
  if (propsUpdated) {
    // 重新创建以同步最新数据
    close();
    open();
  }
}

watch(
  () => props.songs.length,
  (size) => {
    if (!size) {
      close();
    } else {
      refresh(true);
    }
  }
);

watch(
  () => [props.currentId, props.favoriteIds],
  () => refresh(true)
);

onBeforeUnmount(() => {
  close();
});

defineExpose({ open, close, toggle });
</script>

<template></template>
