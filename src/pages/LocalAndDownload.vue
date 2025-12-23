<script setup lang="ts">
import { exists, remove, stat } from "@tauri-apps/plugin-fs";
import { computed, h, onActivated, onMounted, ref } from "vue";
import { NButton, useMessage } from "naive-ui";
import MainLayout from "../layouts/MainLayout.vue";
import { useDownloadStore, type DownloadTab } from "../stores/download";

const {
  state,
  downloadingList,
  downloadedList,
  refreshLocalSongs,
  refreshDownloads,
  addLocalSongFromPath,
  cancelDownload,
  consumePreferredTab,
  clearDownloads,
  deleteLocalSongs,
} = useDownloadStore();
const message = useMessage();
const activeTab = ref<DownloadTab>("local");
const addingLocal = ref(false);
const deletingLocal = ref(false);
const deletingDownloaded = ref(false);
const selectedLocalIds = ref<string[]>([]);
const selectedDownloadedIds = ref<string[]>([]);

// 标签配置，用于实现更现代的视觉展示
const tabItems = computed(() => [
  {
    key: "local" as DownloadTab,
    label: "本地歌曲",
    description: "已导入的离线曲库",
    count: state.localSongs.length,
  },
  {
    key: "downloaded" as DownloadTab,
    label: "下载完成",
    description: "可离线播放的歌曲",
    count: downloadedList.value.length,
  },
  {
    key: "downloading" as DownloadTab,
    label: "正在下载",
    description: "当前排队与下载中",
    count: downloadingList.value.length,
  },
]);

function formatSize(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return "未知";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

onMounted(() => {
  refreshLocalSongs();
  refreshDownloads();
  activeTab.value = consumePreferredTab("local");
});

onActivated(() => {
  refreshLocalSongs();
  refreshDownloads();
  activeTab.value = consumePreferredTab(activeTab.value);
});

async function handleAddLocal() {
  addingLocal.value = true;
  try {
    const input = window.prompt("请输入本地音乐的完整路径，可用英文逗号分隔多个文件");
    if (!input) return;
    const paths = input
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    for (const path of paths) {
      const info = await stat(path);
      await addLocalSongFromPath(path, info.size || 0);
    }
    message.success("已添加到本地音乐库");
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`添加本地音乐失败：${hint}`);
  } finally {
    addingLocal.value = false;
  }
}

async function handleDeleteLocal() {
  if (selectedLocalIds.value.length === 0) {
    message.warning("请先选择要删除的本地歌曲");
    return;
  }

  const confirm = window.confirm("删除后本地文件也会被移除，确定继续吗？");
  if (!confirm) return;

  deletingLocal.value = true;
  try {
    const targets = state.localSongs.filter((item) => selectedLocalIds.value.includes(item.id));
    for (const item of targets) {
      try {
        if (await exists(item.path)) {
          await remove(item.path);
        }
      } catch (error) {
        console.warn("删除本地文件失败，跳过", error);
      }
    }

    await deleteLocalSongs(selectedLocalIds.value);
    selectedLocalIds.value = [];
    await refreshLocalSongs();
    message.success(`已删除 ${targets.length} 首本地歌曲`);
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`删除本地歌曲失败：${hint}`);
  } finally {
    deletingLocal.value = false;
  }
}

async function handleDeleteDownloaded() {
  if (selectedDownloadedIds.value.length === 0) {
    message.warning("请先选择要删除的已下载歌曲");
    return;
  }

  const confirm = window.confirm("删除后下载的文件将被移除，确定继续吗？");
  if (!confirm) return;

  deletingDownloaded.value = true;
  try {
    const targets = state.downloads.filter(
      (item) => selectedDownloadedIds.value.includes(item.songId) && item.status === "success"
    );

    for (const item of targets) {
      if (!item.filePath) continue;
      try {
        if (await exists(item.filePath)) {
          await remove(item.filePath);
        }
      } catch (error) {
        console.warn("删除已下载文件失败，跳过", error);
      }
    }

    await clearDownloads(selectedDownloadedIds.value);
    selectedDownloadedIds.value = [];
    await refreshDownloads();
    message.success(`已删除 ${targets.length} 首已下载歌曲`);
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`删除已下载歌曲失败：${hint}`);
  } finally {
    deletingDownloaded.value = false;
  }
}

function updateSelectedLocal(keys: (string | number)[]) {
  selectedLocalIds.value = keys as string[];
}

function updateSelectedDownloaded(keys: (string | number)[]) {
  selectedDownloadedIds.value = keys as string[];
}

const baseColumns = [
  { type: "selection" as const, width: 60 },
  { title: "歌曲名称", key: "title", minWidth: 180, ellipsis: true },
  { title: "专辑名", key: "album", minWidth: 140, ellipsis: true },
  { title: "大小", key: "size", width: 120, render: (row: any) => formatSize(row.size) },
];

function renderAction(row: any) {
  if (row.status === "downloading" || row.status === "pending") {
    return h(
      NButton,
      {
        quaternary: true,
        type: "warning",
        size: "small",
        onClick: () => cancelDownload(row.songId),
      },
      { default: () => "取消" }
    );
  }
  return "-";
}

const activeDownloadingColumns = [
  ...baseColumns,
  { title: "状态", key: "status", width: 120 },
  { title: "百分比", key: "progress", width: 120, render: (row: any) => `${row.progress}%` },
  { title: "操作", key: "action", width: 120, render: renderAction },
];

const successColumns = [
  ...baseColumns,
  { title: "状态", key: "status", width: 120, render: () => "下载成功" },
];
</script>

<template>
  <MainLayout>
    <div class="space-y-4">
      <div class="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <div>
          <h2 class="m-0 text-xl font-semibold text-white">本地和下载</h2>
          <p class="m-0 text-sm text-[#c6d2e8]">管理本地导入、已下载与下载中歌曲。</p>
        </div>
        <n-button type="primary" color="#22c55e" :loading="addingLocal" @click="handleAddLocal">
          新增本地歌曲
        </n-button>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <div class="flex flex-wrap gap-3">
          <button
            v-for="item in tabItems"
            :key="item.key"
            class="tab-card"
            :class="{ 'is-active': activeTab === item.key }"
            @click="activeTab = item.key"
          >
            <div class="flex items-center gap-3">
              <div class="rounded-full bg-white/10 px-3 py-1 text-sm text-white">{{ item.label }}</div>
              <span class="rounded-full bg-emerald-500/15 px-2 text-xs font-semibold text-emerald-300">
                {{ item.count }}
              </span>
            </div>
            <p class="m-0 mt-2 text-left text-xs text-[#c8d5ef]">{{ item.description }}</p>
            <div class="active-indicator" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div v-if="activeTab === 'local'" class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm text-[#9ab4d8]">已选择 {{ selectedLocalIds.length }} 首本地歌曲</span>
            <div class="flex items-center gap-2">
              <n-button quaternary type="error" :loading="deletingLocal" @click="handleDeleteLocal">
                删除选中
              </n-button>
            </div>
          </div>
          <n-data-table
            :columns="baseColumns"
            :data="state.localSongs"
            :bordered="false"
            :pagination="false"
            :row-key="(row: any) => row.id"
            :checked-row-keys="selectedLocalIds"
            @update:checked-row-keys="updateSelectedLocal"
          />
        </div>

        <div v-else-if="activeTab === 'downloaded'" class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm text-[#9ab4d8]">已选择 {{ selectedDownloadedIds.length }} 首已下载歌曲</span>
            <div class="flex items-center gap-2">
              <n-button quaternary type="error" :loading="deletingDownloaded" @click="handleDeleteDownloaded">
                删除选中
              </n-button>
            </div>
          </div>
          <n-data-table
            :columns="successColumns"
            :data="downloadedList"
            :bordered="false"
            :pagination="false"
            :row-key="(row: any) => row.songId"
            :checked-row-keys="selectedDownloadedIds"
            @update:checked-row-keys="updateSelectedDownloaded"
          />
        </div>

        <div v-else>
          <n-data-table
            :columns="activeDownloadingColumns"
            :data="downloadingList"
            :bordered="false"
            :pagination="false"
            :row-key="(row: any) => row.songId"
          />
        </div>
      </div>
    </div>
  </MainLayout>
</template>

<style scoped>
.tab-card {
  @apply relative min-w-[220px] max-w-[260px] rounded-xl bg-gradient-to-b from-white/5 to-white/0 px-4 py-3 text-left shadow-[0_8px_24px_rgba(15,23,42,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/10;
}

.tab-card .active-indicator {
  @apply absolute inset-x-4 bottom-1 h-1 rounded-full bg-white/10;
}

.tab-card.is-active {
  @apply ring-2 ring-emerald-400/70 bg-emerald-500/10 shadow-[0_8px_30px_rgba(16,185,129,0.25)];
}

.tab-card.is-active .active-indicator {
  @apply bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-400;
}
</style>
