<script setup lang="ts">
import { AddOutline, Heart, HeartOutline, Play, PlaySkipForward } from "@vicons/ionicons5";
import { NIcon, type DropdownOption } from "naive-ui";
import { computed, h, type Component } from "vue";
import { usePlaylistsStore } from "../stores/playlists";
import { useFavoriteStore } from "../stores/favorites";
import { useMessage } from "naive-ui";

type SongItem = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  created?: string;
};

const props = defineProps<{
  row: SongItem | null;
}>();

const emit = defineEmits<{
  (event: "play"): void;
  (event: "play-next"): void;
  (event: "toggle-favorite"): void;
  (event: "add-to-playlist", payload: { playlistId: string }): void;
}>();

const playlists = usePlaylistsStore();
const favorites = useFavoriteStore();
const message = useMessage();

function renderIcon(icon: Component, color = "#9ab4d8") {
  return () => h(NIcon, { size: 16, color }, { default: () => h(icon) });
}

const dropdownOptions = computed<DropdownOption[]>(() => {
  if (!props.row) return [];

  const isFav = favorites.isFavorite(props.row.id);

  // 构建歌单子菜单选项
  const playlistChildren = playlists.state.items.map((p) => ({
    label: p.name,
    key: `playlist:${p.id}`,
  }));

  // 如果没有歌单，就不显示"添加到"菜单
  if (playlistChildren.length === 0) {
    // 不添加任何选项，这样菜单中不会显示"添加到"
  }

  return [
    {
      label: "播放",
      key: "play",
      icon: renderIcon(Play),
    },
    {
      label: "下一首播放",
      key: "play-next",
      icon: renderIcon(PlaySkipForward),
    },
    { type: "divider", key: "divider-1" },
    {
      label: "我喜欢",
      key: "favorite",
      icon: renderIcon(isFav ? Heart : HeartOutline, isFav ? "#ef4444" : "#9ab4d8"),
    },
    {
      label: "添加到",
      key: "add-to",
      icon: renderIcon(AddOutline),
      children: playlistChildren,
    },
  ];
});

function handleMenuSelect(key: string | number) {
  const target = props.row;
  if (!target) return;

  if (key === "play") {
    emit("play");
    return;
  }

  if (key === "play-next") {
    emit("play-next");
    return;
  }

  if (key === "favorite") {
    emit("toggle-favorite");
    return;
  }

  // 处理添加到歌单
  if (typeof key === "string" && key.startsWith("playlist:")) {
    const playlistId = key.replace("playlist:", "");
    const playlist = playlists.state.items.find((p) => p.id === playlistId);
    if (!playlist) {
      message.error("歌单不存在");
      return;
    }
    emit("add-to-playlist", { playlistId });
  }
}
</script>

<template>
  <slot :options="dropdownOptions" :on-select="handleMenuSelect"></slot>
</template>

