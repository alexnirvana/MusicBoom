<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import MainLayout from "../layouts/MainLayout.vue";
import SongTable from "../components/SongTable.vue";
import { getSongs, type FetchSongsOptions, type NavidromeSong } from "../api/navidrome";
import { useAuthStore } from "../stores/auth";
import { useSettingsStore } from "../stores/settings";
import { usePlayerStore } from "../stores/player";
import { useRouter } from "../utils/router-lite";
import { listenLocateRequest } from "../utils/playlist-locator";
import { checkSongsDownloadStatus } from "../utils/download-status";
import { getRecordByAnchorId } from "../services/upload-records/db";
import { extractAppAnchorId, type AnchorStatus } from "../utils/anchor-status";

// 状态管理：加载态、歌曲列表、收藏集
const loading = ref(false);
const songs = ref<NavidromeSong[]>([]);
const downloadStatuses = ref(new Map<string, any>());
const anchorStatuses = ref(new Map<string, AnchorStatus>());
const message = useMessage();
const { state: authState } = useAuthStore();
const { state: settingsState, ready: settingsReady } = useSettingsStore();
const player = usePlayerStore();
const tableRef = ref<InstanceType<typeof SongTable> | null>(null);
const router = useRouter();
const pendingLocateId = ref<string | null>(null);

// 统一解析 Navidrome 鉴权上下文，供列表加载与播放器复用
function resolveNavidromeContext(): FetchSongsOptions {
  const baseUrl = (authState.baseUrl || settingsState.navidrome.baseUrl || "").trim();
  if (!baseUrl) {
    throw new Error("缺少 Navidrome 基础地址，请先登录或在设置中填写连接信息");
  }

  return {
    baseUrl,
    bearerToken: null,
    token: authState.token,
    salt: authState.salt,
    username: authState.username || settingsState.navidrome.username,
    password: settingsState.navidrome.password,
  };
}

// 从 Navidrome 拉取所有歌曲
async function loadSongs() {
  loading.value = true;
  try {
    await settingsReady;
    const context = resolveNavidromeContext();
    songs.value = await getSongs(context);
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`获取歌曲列表失败：${fallback}`);
  } finally {
    loading.value = false;
  }
}

// 读取下载状态，保持表格中的下载标记同步
async function loadDownloadStatuses() {
  try {
    downloadStatuses.value = await checkSongsDownloadStatus(songs.value);
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    console.error(`读取下载状态失败：${hint}`);
  }
}

// 读取锚定状态，检查 comment 中的 APP_ANCHOR_ID 并查询 upload_records
async function loadAnchorStatuses() {
  const statuses = new Map<string, AnchorStatus>();
  for (const song of songs.value) {
    const anchorId = extractAppAnchorId(song.comment);
    if (!anchorId) {
      statuses.set(song.id, "no-id");
      continue;
    }
    try {
      const record = await getRecordByAnchorId(anchorId);
      statuses.set(song.id, record ? "uploaded" : "no-upload");
    } catch (error) {
      console.error(`查询锚定记录失败：${song.id}`, error);
      statuses.set(song.id, "no-upload");
    }
  }
  anchorStatuses.value = statuses;
}

// 双击播放：将组件内过滤后的列表作为播放队列，保持顺序一致
async function handlePlay(payload: { row: NavidromeSong; list: NavidromeSong[] }) {
  try {
    await settingsReady;
    const context = resolveNavidromeContext();
    await player.playFromList(payload.list, payload.row.id, context);
    message.success(`正在播放：${payload.row.title}`);
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`播放失败：${hint}`);
  }
}

// 播放全部：替换当前播放列表并从第一首开始播放
async function handlePlayAll() {
  if (songs.value.length === 0) {
    message.warning("暂无可播放的歌曲，请先同步。");
    return;
  }

  try {
    await settingsReady;
    const context = resolveNavidromeContext();
    await player.playFromList(songs.value, songs.value[0].id, context);
    message.success("已替换播放列表并开始播放第一首歌曲");
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`播放全部失败：${hint}`);
  }
}

// 跳转到批量下载页面
function goDownloadPage() {
  router.push({ name: "batch-download" });
}

// 右键菜单：插入为下一首播放
async function handlePlayNext(payload: { row: NavidromeSong; list: NavidromeSong[] }) {
  try {
    await settingsReady;
    const context = resolveNavidromeContext();
    await player.queueNext(payload.row, context);
    message.success(`已添加为下一首播放：${payload.row.title}`);
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    message.error(`操作失败：${hint}`);
  }
}

function tryLocate(targetId: string) {
  const exists = songs.value.some((item) => item.id === targetId);
  if (!exists) return false;
  tableRef.value?.locateRow(targetId);
  return true;
}

const stopLocate = listenLocateRequest((song) => {
  if (router.currentRoute.value.name !== "my-music") return;
  pendingLocateId.value = song.id;
  const located = tryLocate(song.id);
  if (!located) {
    message.warning("当前页面未找到该歌曲，尝试同步后再试。");
  }
});

watch(
  () => songs.value.length,
  () => {
    if (pendingLocateId.value) {
      const done = tryLocate(pendingLocateId.value);
      if (done) {
        pendingLocateId.value = null;
      }
    }
  }
);

onMounted(() => {
  loadSongs();
});

// 监听歌曲列表变化，自动更新下载状态和锚定状态
watch(
  () => songs.value,
  async () => {
    if (songs.value.length > 0) {
      await loadDownloadStatuses();
      await loadAnchorStatuses();
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  stopLocate();
});
</script>

<template>
  <MainLayout>
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <div class="flex flex-col gap-1">
          <h1 class="m-0 text-2xl font-semibold text-white">全部歌曲</h1>
          <p class="m-0 text-[#c6d2e8]">快速播放、批量下载，保持曲库与播放队列同步。</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <n-button tertiary type="primary" color="#22c55e" @click="handlePlayAll">播放全部</n-button>
          <n-button secondary type="primary" color="#0ea5e9" @click="goDownloadPage">批量下载</n-button>
          <n-button type="primary" color="#6366f1" :loading="loading" @click="loadSongs">立即同步</n-button>
        </div>
      </div>

      <SongTable
        title="全部歌曲"
        :songs="songs"
        :loading="loading"
        :download-statuses="downloadStatuses"
        :anchor-statuses="anchorStatuses"
        empty-hint="暂无歌曲数据，尝试同步或检查 Navidrome 连接。"
        ref="tableRef"
        @play="handlePlay"
        @play-next="handlePlayNext"
      />
    </div>
  </MainLayout>
</template>
