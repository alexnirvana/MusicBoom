<script setup lang="ts">
import { stat } from "@tauri-apps/plugin-fs";
import { computed, h, onMounted, ref } from "vue";
import { NButton, useMessage } from "naive-ui";
import MainLayout from "../layouts/MainLayout.vue";
import { useDownloadStore, type DownloadTab } from "../stores/download";

const { state, refreshLocalSongs, refreshDownloads, addLocalSongFromPath, cancelDownload, consumePreferredTab } =
  useDownloadStore();
const message = useMessage();
const activeTab = ref<DownloadTab>("local");
const addingLocal = ref(false);

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
    count: state.downloads.filter((item) => item.status === "success").length,
  },
  {
    key: "downloading" as DownloadTab,
    label: "正在下载",
    description: "当前排队与下载中",
    count: state.downloads.filter((item) => item.status === "pending" || item.status === "downloading").length,
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

const baseColumns = [
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
        <div class="grid gap-3 sm:grid-cols-3">
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

      <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div v-if="activeTab === 'local'">
          <n-data-table
            :columns="baseColumns"
            :data="state.localSongs"
            :bordered="false"
            :pagination="false"
            :row-key="(row: any) => row.id"
          />
        </div>

        <div v-else-if="activeTab === 'downloaded'">
          <n-data-table
            :columns="successColumns"
            :data="state.downloads.filter((item) => item.status === 'success')"
            :bordered="false"
            :pagination="false"
            :row-key="(row: any) => row.songId"
          />
        </div>

        <div v-else>
          <n-data-table
            :columns="activeDownloadingColumns"
            :data="state.downloads.filter((item) => item.status === 'pending' || item.status === 'downloading')"
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
  @apply relative w-full rounded-xl border border-white/5 bg-gradient-to-b from-white/5 to-white/0 px-4 py-3 text-left transition-all duration-200 hover:border-emerald-300/40 hover:bg-white/10;
}

.tab-card .active-indicator {
  @apply absolute inset-x-4 bottom-1 h-1 rounded-full bg-white/10;
}

.tab-card.is-active {
  @apply border-emerald-400/60 bg-emerald-500/10 shadow-[0_8px_30px_rgba(16,185,129,0.25)];
}

.tab-card.is-active .active-indicator {
  @apply bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-400;
}
</style>
