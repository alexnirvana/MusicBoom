<script setup lang="ts">
import {
  AlbumsOutline,
  CloudOutline,
  DiscOutline,
  HeartOutline,
  HomeOutline,
  ListOutline,
  SpeedometerOutline,
} from "@vicons/ionicons5";
import { h, ref, watch } from "vue";
import { NIcon } from "naive-ui";
import { useRouter } from "../utils/router-lite";

// 菜单图标渲染，保持 Naive UI 风格
const renderIcon = (icon: any) => () => h(NIcon, null, { default: () => h(icon) });

// 左侧菜单选项
const menuOptions = [
  {
    label: "在线音乐",
    key: "online",
    children: [
      { label: "推荐", key: "recommend", icon: renderIcon(HomeOutline) },
      { label: "我的音乐", key: "mine", icon: renderIcon(DiscOutline) },
      { label: "我喜欢", key: "favorite", icon: renderIcon(HeartOutline) },
      { label: "本地和下载", key: "local", icon: renderIcon(AlbumsOutline) },
      { label: "最近播放", key: "recent", icon: renderIcon(ListOutline) },
      { label: "最多播放", key: "most", icon: renderIcon(SpeedometerOutline) },
      { label: "评分排行", key: "rank", icon: renderIcon(SpeedometerOutline) },
      { label: "我的网盘", key: "openlist", icon: renderIcon(CloudOutline) },
    ],
  },
  {
    label: "歌单",
    key: "playlist",
    children: [{ label: "示例的歌单", key: "sample-playlist", icon: renderIcon(ListOutline) }],
  },
];

// 记录展开与选中状态
const expandedKeys = ref<string[]>(["online", "playlist"]);
const activeKey = ref<string | null>("recommend");
const router = useRouter();

const routeMap: Record<string, { name: string }> = {
  recommend: { name: "home" },
  mine: { name: "my-music" },
  favorite: { name: "favorites" },
  local: { name: "local-download" },
  openlist: { name: "openlist-drive" },
};

// 处理菜单选中与展开
const handleMenuUpdate = (val: string) => {
  activeKey.value = val;
  const target = routeMap[val];
  if (target) {
    router.push(target);
  }
};

const handleExpandedUpdate = (keys: string[]) => {
  expandedKeys.value = keys;
};

watch(
  () => router.currentRoute.value.name,
  (name) => {
    if (typeof name === "string") {
      const matchedEntry = Object.entries(routeMap).find(([, route]) => route.name === name);
      if (matchedEntry) {
        activeKey.value = matchedEntry[0];
      } else {
        activeKey.value = null;
      }
    }
  },
  { immediate: true }
);
</script>

<template>
  <div
    class="relative z-10 flex h-full min-h-0 flex-col border-r border-white/10 bg-[#0f1320]/95 backdrop-blur"
  >
    <div class="flex items-center gap-3 px-4 py-4 no-drag">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#4f86ff] to-[#6fc6ff] text-[#0b0f17] font-bold">
        MB
      </div>
      <div>
        <p class="m-0 text-sm text-[#9ab4d8]">MusicBoom</p>
        <p class="m-0 text-lg font-semibold text-white">Navi 风格</p>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto px-3 pb-4">
      <n-menu
        :value="activeKey"
        :options="menuOptions"
        :collapsed-width="0"
        :indent="18"
        :expanded-keys="expandedKeys"
        accordion
        @update:value="handleMenuUpdate"
        @update:expanded-keys="handleExpandedUpdate"
      />
    </div>
  </div>
</template>

<style scoped>
/* 防止菜单区域被拖拽，保持交互正常 */
.no-drag {
  -webkit-app-region: no-drag;
}
</style>
