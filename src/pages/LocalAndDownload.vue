<script setup lang="ts">
import { stat } from "@tauri-apps/plugin-fs";
import { h, onMounted, ref } from "vue";
import { NButton, useMessage } from "naive-ui";
import MainLayout from "../layouts/MainLayout.vue";
import { useDownloadStore } from "../stores/download";

const { state, refreshLocalSongs, refreshDownloads, addLocalSongFromPath, cancelDownload } =
  useDownloadStore();
const message = useMessage();
const activeTab = ref("local");
const addingLocal = ref(false);

function formatSize(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return "未知";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

onMounted(() => {
  refreshLocalSongs();
  refreshDownloads();
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

      <n-tabs type="segment" v-model:value="activeTab">
        <n-tab-pane name="local" tab="本地歌曲">
          <n-data-table
            :columns="baseColumns"
            :data="state.localSongs"
            :bordered="false"
            :pagination="false"
            :row-key="(row: any) => row.id"
          />
        </n-tab-pane>

        <n-tab-pane name="downloaded" tab="下载歌曲">
          <n-data-table
            :columns="successColumns"
            :data="state.downloads.filter((item) => item.status === 'success')"
            :bordered="false"
            :pagination="false"
            :row-key="(row: any) => row.songId"
          />
        </n-tab-pane>

        <n-tab-pane name="downloading" tab="正在下载">
          <n-data-table
            :columns="activeDownloadingColumns"
            :data="state.downloads.filter((item) => item.status === 'pending' || item.status === 'downloading')"
            :bordered="false"
            :pagination="false"
            :row-key="(row: any) => row.songId"
          />
        </n-tab-pane>
      </n-tabs>
    </div>
  </MainLayout>
</template>
