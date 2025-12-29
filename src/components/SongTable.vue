<script setup lang="ts">
import { AddOutline, Heart, HeartOutline, InformationCircle, Play, PlaySkipForward } from "@vicons/ionicons5";
import {
  NButton,
  NDataTable,
  NDropdown,
  NIcon,
  NInput,
  NTag,
  NSpin,
  NTooltip,
  type DataTableColumns,
  type DropdownDividerOption,
  type DropdownOption,
  type DropdownGroupOption,
  useMessage,
} from "naive-ui";
import { computed, h, nextTick, ref, type Component, type PropType } from "vue";
import type { NavidromeSong } from "../types/navidrome";
import { usePlaylistsStore } from "../stores/playlists";
import { useFavoriteStore } from "../stores/favorites";
import type { DownloadStatus } from "../utils/download-status";
import type { AnchorStatus } from "../utils/anchor-status";

// 定义组件入参，方便在不同页面复用同一套表格渲染与筛选逻辑
const props = defineProps({
  title: { type: String, default: "歌曲列表" },
  songs: { type: Array as PropType<NavidromeSong[]>, default: () => [] },
  loading: { type: Boolean, default: false },
  downloadStatuses: { type: Object as PropType<Map<string, DownloadStatus>>, default: () => new Map() },
  anchorStatuses: { type: Object as PropType<Map<string, AnchorStatus>>, default: () => new Map() },
  emptyHint: { type: String, default: "暂无歌曲数据，尝试同步或检查连接。" },
  searchPlaceholder: { type: String, default: "搜索标题、歌手或专辑" },
});

const emit = defineEmits<{
  (event: "play", payload: { row: NavidromeSong; list: NavidromeSong[] }): void;
  (event: "play-next", payload: { row: NavidromeSong; list: NavidromeSong[] }): void;
}>();

// 获取歌单列表、收藏状态和消息提示
const playlists = usePlaylistsStore();
const favorites = useFavoriteStore();
const message = useMessage();

// 记录双击选中的行，便于高亮当前歌曲
const activeRowId = ref<string | null>(null);
const tableWrapperRef = ref<HTMLElement | null>(null);

// 右键菜单的可见性与定位，结合当前行数据动态渲染
const showContextMenu = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextRow = ref<NavidromeSong | null>(null);

// 关键字搜索与过滤逻辑抽离到组件内部，避免页面重复实现
const keyword = ref("");
const filteredSongs = computed(() => {
  if (!keyword.value.trim()) return props.songs;
  const term = keyword.value.toLowerCase();
  return props.songs.filter(
    (item) =>
      item.title.toLowerCase().includes(term) ||
      item.artist.toLowerCase().includes(term) ||
      item.album.toLowerCase().includes(term)
  );
});

// 将秒数转换为 mm:ss，保持展示一致
function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remain = Math.floor(seconds % 60);
  return `${minutes}:${remain.toString().padStart(2, "0")}`;
}

// 将 UTC 时间转换为北京时间并格式化
function formatCreatedTime(utcTime?: string): string {
  if (!utcTime) return "-";
  try {
    const date = new Date(utcTime);
    if (isNaN(date.getTime())) return "-";
    const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const year = beijingTime.getUTCFullYear();
    const month = String(beijingTime.getUTCMonth() + 1).padStart(2, "0");
    const day = String(beijingTime.getUTCDate()).padStart(2, "0");
    const hours = String(beijingTime.getUTCHours()).padStart(2, "0");
    const minutes = String(beijingTime.getUTCMinutes()).padStart(2, "0");
    const seconds = String(beijingTime.getUTCSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch {
    return "-";
  }
}

// 渲染带颜色的图标，便于复用
function renderIcon(icon: Component, color = "#9ab4d8") {
  return () => h(NIcon, { size: 18, color }, { default: () => h(icon) });
}

// 表格列配置，收藏按钮与播放行为均通过事件向外暴露
const columns = computed<DataTableColumns<NavidromeSong>>(() => [
  {
    title: "收藏",
    key: "favorite",
    width: 90,
    render: (row) => {
      const isFav = favorites.isFavorite(row.id);
      return h(
        NButton,
        {
          quaternary: true,
          circle: true,
          size: "small",
          onClick: (event: MouseEvent) => {
            event.stopPropagation();
            handleToggleFavorite(row);
          },
        },
        {
          icon: () =>
            h(
              NIcon,
              { color: isFav ? "#ef4444" : "#9ab4d8", size: 18 },
              { default: () => h(isFav ? Heart : HeartOutline) }
            ),
        }
      );
    },
  },
  {
    title: "标题",
    key: "title",
    minWidth: 200,
    ellipsis: true,
    sorter: (row1, row2) => row1.title.localeCompare(row2.title),
    render: (row) => h("span", { class: "text-white font-semibold" }, row.title),
  },
  { 
    title: "歌手", 
    key: "artist", 
    minWidth: 140, 
    ellipsis: true,
    sorter: (row1, row2) => row1.artist.localeCompare(row2.artist),
  },
  { 
    title: "专辑", 
    key: "album", 
    minWidth: 160, 
    ellipsis: true,
    sorter: (row1, row2) => row1.album.localeCompare(row2.album),
  },
  { 
    title: "时长", 
    key: "duration", 
    width: 100, 
    sorter: (row1, row2) => row1.duration - row2.duration,
    render: (row) => formatDuration(row.duration) 
  },
  {
    title: "创建时间",
    key: "created",
    minWidth: 180,
    ellipsis: true,
    // 默认期望按创建时间倒序展示，新歌靠前
    sorter: (row1, row2) => {
      if (!row1.created && !row2.created) return 0;
      if (!row1.created) return 1;
      if (!row2.created) return -1;
      return new Date(row2.created).getTime() - new Date(row1.created).getTime();
    },
    render: (row) => formatCreatedTime(row.created),
  },
  {
    title: "下载状态",
    key: "download",
    width: 120,
    render: (row) => {
      const status = props.downloadStatuses.get(row.id);
      if (status?.isDownloaded) {
        return h(
          NTag,
          { type: "success", size: "small" },
          { default: () => "已下载" }
        );
      }
      return h(
        NTag,
        { type: "default", size: "small" },
        { default: () => "未下载" }
      );
    },
  },
  {
    title: "锚定状态",
    key: "anchor",
    width: 130,
    render: (row) => {
      const status = props.anchorStatuses.get(row.id);
      if (status === "uploaded") {
        return h(
          NTag,
          { type: "success", size: "small" },
          { default: () => "已锚定" }
        );
      }
      if (status === "no-upload") {
        return h(
          NTag,
          { type: "warning", size: "small" },
          { default: () => "无上传锚定" }
        );
      }
      return h(
        NTag,
        { type: "default", size: "small" },
        { default: () => "无ID锚定" }
      );
    },
  },
]);

// 双击行后发出播放事件，外部可以结合播放器上下文处理
function rowProps(row: NavidromeSong) {
  return {
    onDblclick() {
      activeRowId.value = row.id;
      emit("play", { row, list: filteredSongs.value });
    },
    onContextmenu(event: MouseEvent) {
      event.preventDefault();
      contextRow.value = row;
      showContextMenu.value = false;
      nextTick(() => {
        contextMenuX.value = event.clientX;
        contextMenuY.value = event.clientY;
        showContextMenu.value = true;
      });
    },
  };
}

function rowClassName(row: NavidromeSong) {
  return activeRowId.value === row.id ? "active-row" : "";
}

// 右键菜单选项，收藏状态动态切换爱心样式
const dropdownOptions = computed<(DropdownOption | DropdownDividerOption | DropdownGroupOption)[]>(() => {
  const isFav = contextRow.value ? favorites.isFavorite(contextRow.value.id) : false;

  // 构建歌单子菜单选项
  const playlistChildren = playlists.state.items.map((p) => ({
    label: p.name,
    key: `playlist:${p.id}`,
  } as DropdownOption));

  // 如果没有歌单，添加一个提示
  if (playlistChildren.length === 0) {
    playlistChildren.push({
      label: "暂无歌单",
      key: "no-playlist",
      disabled: true,

    } as DropdownOption);
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

// 切换收藏状态
async function handleToggleFavorite(row: NavidromeSong) {
  try {
    const isFav = await favorites.toggleFavorite(
      row.id,
      {
        title: row.title,
        artist: row.artist,
        album: row.album,
        duration: row.duration,
        created: row.created,
      }
    );
    message.success(isFav ? "已添加到收藏" : "已取消收藏");
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`更新收藏状态失败：${hint}`);
  }
}

// 处理菜单点击，派发对应的操作
function handleMenuSelect(key: string | number) {
  const target = contextRow.value;
  if (!target) return;

  showContextMenu.value = false;
  if (key === "play") {
    activeRowId.value = target.id;
    emit("play", { row: target, list: filteredSongs.value });
    return;
  }

  if (key === "play-next") {
    emit("play-next", { row: target, list: filteredSongs.value });
    return;
  }

  if (key === "favorite") {
    handleToggleFavorite(target);
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
    playlists.addSongsToPlaylist(playlistId, [target])
      .then(() => message.success(`已添加到歌单：${playlist.name}`))
      .catch((error) => {
        const hint = error instanceof Error ? error.message : String(error);
        message.error(`添加到歌单失败：${hint}`);
      });
  }
}

// 点击空白处收起右键菜单，避免残留
function handleMenuClickoutside() {
  showContextMenu.value = false;
}

// 对外暴露的定位方法：清空搜索、标记行并滚动到可视区域
function locateRow(rowId: string) {
  keyword.value = "";
  nextTick(() => {
    activeRowId.value = rowId;
    const target = tableWrapperRef.value?.querySelector(
      `[data-row-key="${rowId}"]`
    ) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
}

defineExpose({ locateRow });
</script>

<template>
  <div ref="tableWrapperRef">
    <n-card :bordered="true" class="bg-white/5 border-white/10">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="m-0 text-lg font-semibold text-white">{{ title }}</h3>
            <p class="m-0 text-sm text-[#9ab4d8]">共 {{ songs.length }} 首</p>
            <n-tooltip v-if="anchorStatuses.size > 0">
              <template #trigger>
                <n-icon :component="InformationCircle" class="text-[#9ab4d8] cursor-help" size="18" />
              </template>
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-green-400">●</span>
                  <span>已锚定：comment 中有 APP_ANCHOR_ID 且已在上传记录中找到</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-orange-400">●</span>
                  <span>无上传锚定：comment 中有 APP_ANCHOR_ID 但未在上传记录中找到</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-gray-400">●</span>
                  <span>无ID锚定：comment 中没有 APP_ANCHOR_ID</span>
                </div>
              </div>
            </n-tooltip>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <slot name="actions" />
            <n-input
              v-model:value="keyword"
              size="medium"
              :placeholder="searchPlaceholder"
              clearable
              class="min-w-[220px]"
            />
          </div>
        </div>
      </template>

      <n-spin :show="loading">
        <div v-if="!loading && filteredSongs.length === 0" class="py-8 text-center text-[#9ab4d8]">
          {{ emptyHint }}
        </div>
        <n-data-table
          v-else
          :bordered="false"
          :columns="columns"
          :data="filteredSongs"
          :default-sort="{ columnKey: 'created', order: 'descend' }"
          :loading="loading"
          :pagination="false"
          :row-key="(row: NavidromeSong) => row.id"
          :row-props="rowProps"
          :row-class-name="rowClassName"
          size="small"
          max-height="500px"
          class="text-white song-table"
        />
      </n-spin>
      <n-dropdown
        trigger="manual"
        placement="bottom-start"
        :x="contextMenuX"
        :y="contextMenuY"
        :show="showContextMenu"
        :options="dropdownOptions"
        :scrollable="true"
        @select="handleMenuSelect"
        @clickoutside="handleMenuClickoutside"
      />
    </n-card>
  </div>
</template>
