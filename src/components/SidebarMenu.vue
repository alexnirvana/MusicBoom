<script setup lang="ts">
import {
  AlbumsOutline,
  CloudOutline,
  DiscOutline,
  HeartOutline,
  HomeOutline,
  ListOutline,
  SpeedometerOutline,
  AddOutline,
  Play,
  TrashOutline,
  CreateOutline,
} from "@vicons/ionicons5";
import { computed, h, nextTick, ref, watch } from "vue";
import { NDropdown, NIcon, NInput, NButton, useMessage } from "naive-ui";
import type { InputInst } from "naive-ui";
import { useRouter } from "../utils/router-lite";
import { usePlaylistsStore } from "../stores/playlists";

// 菜单图标渲染，保持 Naive UI 风格
const renderIcon = (icon: any) => () => h(NIcon, null, { default: () => h(icon) });

const message = useMessage();
const playlists = usePlaylistsStore();

// 左侧菜单选项
const menuOptions = computed(() => {
  const playlistChildren = [];
  if (creating.value) {
    playlistChildren.push({
      label: "创建歌单",
      key: "playlist:create",
    });
  }
  for (const p of playlists.state.items) {
    playlistChildren.push({
      label: p.name,
      key: `playlist:${p.id}`,
      icon: renderIcon(ListOutline),
    });
  }
  return [
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
      children: playlistChildren,
    },
  ];
});

// 记录展开与选中状态
const expandedKeys = ref<string[]>(["online", "playlist"]);
const activeKey = ref<string | null>("recommend");
const router = useRouter();
const creating = ref(false);
const newName = ref("");
const submitting = ref(false);
const renamingId = ref<string | null>(null);
const renameValue = ref("");
const createInputRef = ref<InputInst | null>(null);
const renameInputRef = ref<InputInst | null>(null);

const dropdownShow = ref(false);
const dropdownX = ref(0);
const dropdownY = ref(0);
const contextId = ref<string | null>(null);

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
  if (val.startsWith("playlist:")) {
    const id = val.replace(/^playlist:/, "");
    playlists.selectPlaylist(id);
    router.push({ name: "playlists" });
    return;
  }
  if (val === "playlist:create") {
    return;
  }
  const target = routeMap[val];
  if (target) {
    router.push(target);
  }
};

const handleExpandedUpdate = (keys: string[]) => {
  expandedKeys.value = keys;
};

function startCreate() {
  if (creating.value) return;
  creating.value = true;
  newName.value = playlists.nextDefaultName();
  nextTick(() => {
    createInputRef.value?.focus();
    createInputRef.value?.select?.();
  });
}

async function finishCreate(isBlur = false) {
  if (submitting.value || !creating.value) return;
  let name = newName.value.trim();
  
  // 失去焦点时，如果名字为空，则使用默认名字
  if (isBlur && !name) {
    name = playlists.nextDefaultName();
  }

  if (!name) {
    creating.value = false;
    return;
  }
  submitting.value = true;
  try {
    await playlists.createPlaylist(name);
    creating.value = false;
    router.push({ name: "playlists" });
  } catch (error) {
    // 如果是失去焦点（没有明确确认），且创建失败（可能是重名），尝试使用默认名字作为后备方案
    if (isBlur) {
      try {
        const defaultName = playlists.nextDefaultName();
        // 避免死循环，如果当前名字已经是默认名字且失败了，就不再尝试
        if (name !== defaultName) {
          await playlists.createPlaylist(defaultName);
          creating.value = false;
          router.push({ name: "playlists" });
          return;
        }
      } catch (e) {
        // 后备方案也失败，忽略
      }
    }
    const reason = error instanceof Error ? error.message : String(error);
    message.error(reason);
    // 保持创建状态，便于继续修改
  } finally {
    submitting.value = false;
  }
}

function openContext(e: MouseEvent, id: string) {
  e.preventDefault();
  contextId.value = id;
  dropdownShow.value = false;
  nextTick(() => {
    dropdownX.value = e.clientX;
    dropdownY.value = e.clientY;
    dropdownShow.value = true;
  });
}

function closeContext() {
  dropdownShow.value = false;
  contextId.value = null;
}

function startRename(id: string) {
  renamingId.value = id;
  const target = playlists.state.items.find((p: { id: string }) => p.id === id);
  renameValue.value = target?.name || "";
  nextTick(() => {
    renameInputRef.value?.focus();
    renameInputRef.value?.select?.();
  });
}

async function finishRename() {
  if (submitting.value) return;
  const id = renamingId.value;
  if (!id) return;
  const name = renameValue.value.trim();
  if (!name) {
    renamingId.value = null;
    return;
  }
  submitting.value = true;
  try {
    await playlists.renamePlaylist(id, name);
    renamingId.value = null;
    message.success("已重命名歌单");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    message.error(reason);
    // 保持重命名状态，便于继续修改
  } finally {
    submitting.value = false;
  }
}

function renderMenuLabel(option: any) {
  if (option.key === "playlist") {
    return h(
      "div",
      { class: "flex items-center justify-between w-full" },
      [
        h("span", null, option.label as string),
        h(
          NButton,
          {
            quaternary: true,
            circle: true,
            size: "tiny",
            title: "新建歌单",
            onClick: (e: MouseEvent) => {
              e.stopPropagation();
              startCreate();
            },
          },
          { default: () => h(NIcon, null, { default: () => h(AddOutline) }) }
        ),
      ]
    );
  }
  if (option.key === "playlist:create") {
    return h(NInput, {
      id: "playlist-create-input",
      value: newName.value,
      size: "small",
      autofocus: true,
      ref: (inst: unknown) => (createInputRef.value = inst as InputInst | null),
      onUpdateValue: (v: string) => (newName.value = v),
      onFocus: (e: FocusEvent) => {
        const el = e.target as HTMLInputElement | null;
        el?.select?.();
      },
      onBlur: () => finishCreate(true),
      onKeyup: (e: KeyboardEvent) => {
        if (e.key === "Enter") finishCreate(false);
      },
    });
  }
  if (typeof option.key === "string" && option.key.startsWith("playlist:")) {
    const id = option.key.replace(/^playlist:/, "");
    if (renamingId.value === id) {
      return h(NInput, {
        id: "playlist-rename-input",
        value: renameValue.value,
        size: "small",
        autofocus: true,
        ref: (inst: unknown) => (renameInputRef.value = inst as InputInst | null),
        onUpdateValue: (v: string) => (renameValue.value = v),
        onFocus: (e: FocusEvent) => {
          const el = e.target as HTMLInputElement | null;
          el?.select?.();
        },
        onBlur: finishRename,
        onKeyup: (e: KeyboardEvent) => {
          if (e.key === "Enter") finishRename();
        },
      });
    }
    return h(
      "div",
      {
        class: "flex items-center justify-between w-full",
        onContextmenu: (e: MouseEvent) => openContext(e, id),
      },
      [
        h("span", { class: "truncate" }, option.label as string),
        h("span", { class: "text-xs text-[#9ab4d8]" }, String(playlists.state.items.find((p: { id: string; count: number }) => p.id === id)?.count ?? 0)),
      ]
    );
  }
  return option.label as string;
}

const dropdownOptions = [
  { label: "播放", key: "play", icon: renderIcon(Play) },
  { label: "删除", key: "delete", icon: renderIcon(TrashOutline) },
  { label: "重命名", key: "rename", icon: renderIcon(CreateOutline) },
];

function handleDropdownSelect(key: string | number) {
  const id = contextId.value;
  closeContext();
  if (!id) return;
  if (key === "play") {
    playlists.selectPlaylist(id);
    router.push({ name: "playlists" });
  } else if (key === "delete") {
    playlists.removePlaylist(id).then(() => message.success("已删除歌单"));
  } else if (key === "rename") {
    startRename(id);
  }
}

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
        :render-label="renderMenuLabel"
        accordion
        @update:value="handleMenuUpdate"
        @update:expanded-keys="handleExpandedUpdate"
      />
      <n-dropdown
        trigger="manual"
        placement="bottom-start"
        :x="dropdownX"
        :y="dropdownY"
        :show="dropdownShow"
        :options="dropdownOptions"
        @select="handleDropdownSelect"
        @clickoutside="closeContext"
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
