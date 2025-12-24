<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { appCacheDir, appDataDir, downloadDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readDir, stat } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { useMessage } from "naive-ui";
import MainLayout from "../layouts/MainLayout.vue";
import { useAuthStore } from "../stores/auth";
import {
  useSettingsStore,
} from "../stores/settings";
import type {
  DownloadSettings,
  GeneralSettings,
  NavidromeConfig,
  OpenlistConfig,
  PlaybackSettings,
} from "../types/settings";
import type { Ref } from "vue";

// 消息提示实例
const message = useMessage();

// 登录状态与服务器地址展示
const { state: authState } = useAuthStore();

// 设置存储
const { state: settingsState, ready, updateNavidrome, updateOpenlist, updateDownload, updateGeneral, updatePlayback } =
  useSettingsStore();

// Navidrome 连接配置表单
const navidromeForm = reactive<NavidromeConfig>({
  baseUrl: "",
  username: "",
  password: "",
  remember: false,
});

// OpenList 连接配置表单
const openlistForm = reactive<OpenlistConfig>({
  baseUrl: "",
  username: "",
  password: "",
  remember: false,
});

// 下载与缓存配置表单
const downloadForm = reactive<DownloadSettings>({
  musicDir: "",
  organizeByAlbum: true,
  downloadLyrics: true,
  overwriteExisting: false,
  sourcePreference: "latest",
  cacheDir: "",
  speedLimitMode: "auto",
  speedLimit: 3072,
  tags: {
    enableApev2: false,
    enableId3v1: false,
    enableId3v2: true,
    id3v2Version: "2.4",
    charset: "utf8",
  },
});

// 通用行为配置表单
const generalForm = reactive<GeneralSettings>({
  closeAction: "minimize",
  enableNotifications: true,
  setDefaultPlayer: false,
});

// 播放相关配置表单
const playbackForm = reactive<PlaybackSettings>({
  enableCrossfade: true,
  crossfadeDuration: 4,
});

// 默认下载与缓存路径
const defaultMusicDir = ref("");
const defaultCacheDir = ref("");

// 目录体积显示
const musicDirSize = ref("未设置");
const cacheDirSize = ref("未设置");

// 用于控制保存按钮的加载状态
const savingNavidrome = ref(false);
const savingOpenlist = ref(false);
const savingDownload = ref(false);
const savingGeneral = ref(false);
const savingPlayback = ref(false);

// 服务器地址展示优先使用表单中的数据
const serverAddress = computed(
  () => navidromeForm.baseUrl || authState.baseUrl || "尚未配置服务器地址"
);

// 预估插件-sql 默认的数据库位置
const databasePath = ref("正在获取本地数据库路径...");

// 目录大小格式化，便于直观展示
function formatBytes(bytes: number) {
  if (bytes < 0 || Number.isNaN(bytes)) return "未知";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

// 递归计算指定目录的体积，跳过软链接避免循环
async function calculateDirectorySize(targetPath: string): Promise<number> {
  const info = await stat(targetPath);
  if (info.isFile) return info.size;
  if (!info.isDirectory) return 0;

  const entries = await readDir(targetPath);
  let total = 0;

  for (const entry of entries) {
    if (entry.isSymlink) continue;
    const entryPath = await join(targetPath, entry.name);

    if (entry.isFile) {
      const detail = await stat(entryPath);
      total += detail.size;
    } else if (entry.isDirectory) {
      total += await calculateDirectorySize(entryPath);
    }
  }

  return total;
}

// 更新目录大小的显示，兼容空路径与错误提示
async function ensureDirectory(dir: string, label: string) {
  const alreadyExists = await exists(dir);
  if (alreadyExists) return true;

  try {
    await mkdir(dir, { recursive: true });
    message.success(`${label}已自动创建`);
    return true;
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`自动创建${label}失败：${fallback}`);
    return false;
  }
}

// 更新目录大小的显示，兼容空路径与错误提示，同时缺失时自动创建
async function refreshDirectorySize(dir: string, holder: Ref<string>, label: string) {
  if (!dir) {
    holder.value = "未设置";
    return;
  }

  holder.value = "计算中...";

  try {
    const available = await ensureDirectory(dir, label);
    if (!available) {
      holder.value = "创建失败";
      return;
    }

    const size = await calculateDirectorySize(dir);
    holder.value = formatBytes(size);
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    holder.value = "读取失败";
    message.warning(`计算目录大小失败：${fallback}`);
  }
}

// 将存储中的数据同步到本地表单，避免直接编辑响应式全局状态
function syncFormFromStore() {
  Object.assign(navidromeForm, { ...settingsState.navidrome });
  Object.assign(openlistForm, { ...settingsState.openlist });
  Object.assign(downloadForm, {
    ...settingsState.download,
    tags: { ...settingsState.download.tags },
  });
  Object.assign(generalForm, { ...settingsState.general });
  Object.assign(playbackForm, { ...settingsState.playback });
}

// 初始化本地路径与表单数据
onMounted(async () => {
  try {
    const dir = await appDataDir();
    databasePath.value = await join(dir, "musicboom.db");
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    databasePath.value = `获取数据库路径失败：${fallback}`;
  }

  try {
    const dir = await downloadDir();
    defaultMusicDir.value = await join(dir, "MusicBoom");
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    defaultMusicDir.value = "";
    message.warning(`获取下载目录失败：${fallback}`);
  }

  try {
    const dir = await appCacheDir();
    defaultCacheDir.value = await join(dir, "musicboom-cache");
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    defaultCacheDir.value = "";
    message.warning(`获取缓存目录失败：${fallback}`);
  }

  await ready;
  syncFormFromStore();
  const pendingDownloadUpdate: Partial<DownloadSettings> = {};

  if (!downloadForm.musicDir && defaultMusicDir.value) {
    downloadForm.musicDir = defaultMusicDir.value;
    pendingDownloadUpdate.musicDir = defaultMusicDir.value;
  }

  if (!downloadForm.cacheDir && defaultCacheDir.value) {
    downloadForm.cacheDir = defaultCacheDir.value;
    pendingDownloadUpdate.cacheDir = defaultCacheDir.value;
  }

  if (Object.keys(pendingDownloadUpdate).length > 0) {
    await updateDownload(pendingDownloadUpdate);
  }
});

// 监听目录变更并实时刷新体积显示
watch(
  () => downloadForm.musicDir,
  (dir) => {
    refreshDirectorySize(dir, musicDirSize, "下载目录");
  },
  { immediate: true }
);

watch(
  () => downloadForm.cacheDir,
  (dir) => {
    refreshDirectorySize(dir, cacheDirSize, "缓存目录");
  },
  { immediate: true }
);

// 保存 Navidrome 连接信息到设置表
async function handleSaveNavidrome() {
  savingNavidrome.value = true;
  try {
    await updateNavidrome({ ...navidromeForm });
    message.success("Navidrome 配置已保存");
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`保存连接信息失败：${fallback}`);
  } finally {
    savingNavidrome.value = false;
  }
}

// 保存 OpenList 连接信息到设置表
async function handleSaveOpenlist() {
  savingOpenlist.value = true;
  try {
    await updateOpenlist({ ...openlistForm });
    message.success("OpenList 配置已保存");
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`保存 OpenList 连接失败：${fallback}`);
  } finally {
    savingOpenlist.value = false;
  }
}

// 保存下载与缓存设置
async function handleSaveDownload() {
  savingDownload.value = true;
  try {
    await updateDownload(JSON.parse(JSON.stringify(downloadForm)));
    message.success("下载与缓存设置已保存");
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`保存下载设置失败：${fallback}`);
  } finally {
    savingDownload.value = false;
  }
}

// 保存关联、通知等通用设置
async function handleSaveGeneral() {
  savingGeneral.value = true;
  try {
    await updateGeneral({ ...generalForm });
    message.success("通用设置已保存");
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`保存通用设置失败：${fallback}`);
  } finally {
    savingGeneral.value = false;
  }
}

// 保存播放相关设置
async function handleSavePlayback() {
  savingPlayback.value = true;
  try {
    await updatePlayback({ ...playbackForm });
    message.success("播放设置已保存");
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`保存播放设置失败：${fallback}`);
  } finally {
    savingPlayback.value = false;
  }
}

// 选择下载目录
async function selectDownloadDirectory() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择下载目录"
    });
    if (selected && !Array.isArray(selected)) {
      downloadForm.musicDir = selected;
    }
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`选择目录失败：${fallback}`);
  }
}

// 选择缓存目录
async function selectCacheDirectory() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择缓存目录"
    });
    if (selected && !Array.isArray(selected)) {
      downloadForm.cacheDir = selected;
    }
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`选择目录失败：${fallback}`);
  }
}

// 打开下载目录
async function openDownloadDirectory() {
  try {
    if (downloadForm.musicDir) {
      await openPath(downloadForm.musicDir);
    } else {
      message.warning("请先设置下载目录");
    }
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`打开目录失败：${fallback}`);
  }
}

// 打开缓存目录
async function openCacheDirectory() {
  try {
    if (downloadForm.cacheDir) {
      await openPath(downloadForm.cacheDir);
    } else {
      message.warning("请先设置缓存目录");
    }
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`打开目录失败：${fallback}`);
  }
}
</script>

<template>
  <MainLayout :hide-sidebar="false">
    <div class="space-y-5">
      <div class="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <p class="m-0 text-sm uppercase tracking-[0.08em] text-[#9ab4d8]">系统</p>
            <h1 class="m-0 text-2xl font-semibold text-white">设置</h1>
            <p class="m-0 text-[#c6d2e8]">配置 Navidrome 与 OpenList 连接、下载缓存以及播放等偏好。</p>
          </div>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="rounded-xl border border-white/10 bg-[#0f1320]/70 px-4 py-3">
            <p class="m-0 text-sm text-[#9ab4d8]">服务器地址</p>
            <p class="mt-2 break-all text-lg font-semibold text-white">{{ serverAddress }}</p>
          </div>
          <div class="rounded-xl border border-white/10 bg-[#0f1320]/70 px-4 py-3">
            <p class="m-0 text-sm text-[#9ab4d8]">本地数据库路径</p>
            <p class="mt-2 break-all text-lg font-semibold text-white">{{ databasePath }}</p>
          </div>
        </div>
      </div>

      <div class="grid gap-5 xl:grid-cols-3">
        <div class="rounded-2xl border border-white/10 bg-[#0f1320]/70 px-5 py-4">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <p class="m-0 text-sm text-[#9ab4d8]">Navidrome</p>
              <h2 class="m-0 text-xl font-semibold text-white">连接配置</h2>
              <p class="m-0 text-[#c6d2e8]">修改服务器地址、账号与密码并持久化保存。</p>
            </div>
          </div>
          <n-form label-placement="top" :show-feedback="false" class="space-y-2">
            <n-form-item label="服务器地址">
              <n-input v-model:value="navidromeForm.baseUrl" placeholder="例如 http://your-navidrome" clearable />
            </n-form-item>
            <div class="grid gap-3 sm:grid-cols-2">
              <n-form-item label="用户名">
                <n-input v-model:value="navidromeForm.username" placeholder="请输入账号" clearable />
              </n-form-item>
              <n-form-item label="密码">
                <n-input
                  v-model:value="navidromeForm.password"
                  type="password"
                  show-password-on="click"
                  placeholder="请输入密码"
                />
              </n-form-item>
            </div>
            <div class="flex justify-end pt-1">
              <n-button type="primary" color="#6366f1" :loading="savingNavidrome" @click="handleSaveNavidrome">
                保存连接
              </n-button>
            </div>
          </n-form>
        </div>

        <div class="rounded-2xl border border-white/10 bg-[#0f1320]/70 px-5 py-4">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <p class="m-0 text-sm text-[#9ab4d8]">OpenList</p>
              <h2 class="m-0 text-xl font-semibold text-white">网盘连接</h2>
              <p class="m-0 text-[#c6d2e8]">填写 OpenList 地址与账号，便于在主页直接登录网盘。</p>
            </div>
          </div>
          <n-form label-placement="top" :show-feedback="false" class="space-y-2">
            <n-form-item label="网盘地址">
              <n-input v-model:value="openlistForm.baseUrl" placeholder="例如 http://your-openlist" clearable />
            </n-form-item>
            <div class="grid gap-3 sm:grid-cols-2">
              <n-form-item label="用户名">
                <n-input v-model:value="openlistForm.username" placeholder="请输入网盘账号" clearable />
              </n-form-item>
              <n-form-item label="密码">
                <n-input
                  v-model:value="openlistForm.password"
                  type="password"
                  show-password-on="click"
                  placeholder="请输入密码"
                />
              </n-form-item>
            </div>
            <div class="flex justify-end pt-1">
              <n-button type="primary" color="#22c55e" :loading="savingOpenlist" @click="handleSaveOpenlist">
                保存网盘连接
              </n-button>
            </div>
          </n-form>
        </div>

        <div class="rounded-2xl border border-white/10 bg-[#0f1320]/70 px-5 py-4">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <p class="m-0 text-sm text-[#9ab4d8]">播放</p>
              <h2 class="m-0 text-xl font-semibold text-white">播放偏好</h2>
              <p class="m-0 text-[#c6d2e8]">控制音乐淡入淡出等播放体验（默认已开启淡入淡出）。</p>
            </div>
          </div>
          <div class="space-y-4">
            <div class="rounded-xl border border-white/10 bg-[#11172a]/70 p-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="m-0 text-base font-semibold text-white">音乐淡入淡出</p>
                  <p class="m-0 text-sm text-[#c6d2e8]">切换歌曲时平滑过渡，避免突兀跳变。</p>
                </div>
                <n-switch v-model:value="playbackForm.enableCrossfade" />
              </div>
              <div class="mt-4 flex items-center gap-3" v-if="playbackForm.enableCrossfade">
                <span class="text-sm text-[#c6d2e8]">淡入淡出时长 (秒)</span>
                <n-slider
                  v-model:value="playbackForm.crossfadeDuration"
                  :step="1"
                  :min="1"
                  :max="10"
                  style="flex: 1"
                />
                <n-tag type="info">{{ playbackForm.crossfadeDuration }}s</n-tag>
              </div>
            </div>
            <div class="flex justify-end">
              <n-button type="primary" color="#6366f1" :loading="savingPlayback" @click="handleSavePlayback">
                保存播放设置
              </n-button>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-white/10 bg-[#0f1320]/70 px-5 py-4">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <p class="m-0 text-sm text-[#9ab4d8]">下载与缓存</p>
            <h2 class="m-0 text-xl font-semibold text-white">文件保存、缓存与标签</h2>
            <p class="m-0 text-[#c6d2e8]">调整下载目录、缓存路径、限速以及 MP3 标签写入方式。</p>
          </div>
        </div>
        <n-form label-placement="top" :show-feedback="false" class="space-y-3">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="rounded-xl border border-white/10 bg-[#11172a]/70 p-4 space-y-3">
              <n-form-item label="下载目录">
                <div class="flex items-center gap-3">
                  <n-input v-model:value="downloadForm.musicDir" placeholder="选择音乐下载目录" clearable style="flex: 1" />
                  <n-button @click="selectDownloadDirectory" title="选择目录">
                    <template #icon>
                      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </template>
                  </n-button>
                  <n-tag type="info" size="small">{{ musicDirSize }}</n-tag>
                </div>
              </n-form-item>
              <div class="grid gap-3 sm:grid-cols-2">
                <n-button
                  tertiary
                  class="w-full"
                  @click="downloadForm.musicDir = defaultMusicDir || ''"
                >
                  设为默认路径
                </n-button>
                <n-button tertiary class="w-full" @click="openDownloadDirectory">打开文件夹</n-button>
              </div>
              <div class="space-y-2">
                <p class="m-0 text-sm text-[#9ab4d8]">下载模式</p>
                <n-radio-group v-model:value="downloadForm.organizeByAlbum">
                  <div class="grid gap-2 sm:grid-cols-2">
                    <n-radio :value="false">不分文件夹</n-radio>
                    <n-radio :value="true">按来源专辑归档</n-radio>
                  </div>
                </n-radio-group>
                <n-checkbox v-model:checked="downloadForm.downloadLyrics">同时下载歌词</n-checkbox>
                <n-checkbox v-model:checked="downloadForm.overwriteExisting">同名文件覆盖</n-checkbox>
              </div>
              <div class="space-y-1">
                <p class="m-0 text-sm text-[#9ab4d8]">来源偏好</p>
                <n-radio-group v-model:value="downloadForm.sourcePreference" class="flex flex-wrap gap-3">
                  <n-radio value="latest">最新歌曲</n-radio>
                  <n-radio value="hifi">高音质优先</n-radio>
                </n-radio-group>
              </div>
            </div>

            <div class="rounded-xl border border-white/10 bg-[#11172a]/70 p-4 space-y-3">
              <n-form-item label="缓存路径">
                <div class="flex items-center gap-3">
                  <n-input v-model:value="downloadForm.cacheDir" placeholder="用于下载缓存" clearable style="flex: 1" />
                  <n-button @click="selectCacheDirectory" title="选择目录">
                    <template #icon>
                      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </template>
                  </n-button>
                  <n-tag type="info" size="small">{{ cacheDirSize }}</n-tag>
                </div>
              </n-form-item>
              <div class="grid gap-3 sm:grid-cols-2">
                <n-button
                  tertiary
                  class="w-full"
                  @click="downloadForm.cacheDir = defaultCacheDir || ''"
                >
                  设为默认缓存
                </n-button>
                <n-button tertiary class="w-full" @click="openCacheDirectory">打开缓存文件夹</n-button>
              </div>
              <div class="space-y-2">
                <p class="m-0 text-sm text-[#9ab4d8]">下载限速</p>
                <n-radio-group v-model:value="downloadForm.speedLimitMode" class="flex flex-wrap gap-3">
                  <n-radio value="auto">自动</n-radio>
                  <n-radio value="manual">手动</n-radio>
                </n-radio-group>
                <div v-if="downloadForm.speedLimitMode === 'manual'" class="flex items-center gap-3">
                  <n-slider v-model:value="downloadForm.speedLimit" :step="256" :min="512" :max="8192" style="flex: 1" />
                  <n-tag type="info">{{ downloadForm.speedLimit }} MB</n-tag>
                </div>
              </div>
              <div class="space-y-2">
                <p class="m-0 text-sm text-[#9ab4d8]">MP3 标签编码</p>
                <div class="flex flex-wrap gap-3">
                  <n-checkbox v-model:checked="downloadForm.tags.enableApev2">APEv2</n-checkbox>
                  <n-checkbox v-model:checked="downloadForm.tags.enableId3v1">ID3v1</n-checkbox>
                  <n-checkbox v-model:checked="downloadForm.tags.enableId3v2">ID3v2</n-checkbox>
                </div>
                <div class="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p class="m-0 text-xs text-[#9ab4d8]">ID3v2 版本</p>
                    <n-radio-group v-model:value="downloadForm.tags.id3v2Version" class="flex flex-col gap-1">
                      <n-radio value="2.4">ID3v2.4</n-radio>
                      <n-radio value="2.3">ID3v2.3</n-radio>
                    </n-radio-group>
                  </div>
                  <div>
                    <p class="m-0 text-xs text-[#9ab4d8]">标签编码</p>
                    <n-radio-group v-model:value="downloadForm.tags.charset" class="flex flex-col gap-1">
                      <n-radio value="utf8">UTF8（推荐）</n-radio>
                      <n-radio value="auto">自动转换</n-radio>
                      <n-radio value="iso-8859-1">ISO-8859-1</n-radio>
                    </n-radio-group>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="flex justify-end pt-2">
            <n-button type="primary" color="#6366f1" :loading="savingDownload" @click="handleSaveDownload">
              保存下载设置
            </n-button>
          </div>
        </n-form>
      </div>

      <div class="rounded-2xl border border-white/10 bg-[#0f1320]/70 px-5 py-4">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <p class="m-0 text-sm text-[#9ab4d8]">关联与通知</p>
            <h2 class="m-0 text-xl font-semibold text-white">关闭主面板与系统通知</h2>
            <p class="m-0 text-[#c6d2e8]">控制关闭行为、托盘常驻以及是否将播放器设为默认。</p>
          </div>
        </div>
        <div class="space-y-4">
          <div class="rounded-xl border border-white/10 bg-[#11172a]/70 p-4 space-y-3">
            <p class="m-0 text-sm text-[#9ab4d8]">关闭主面板</p>
            <n-radio-group v-model:value="generalForm.closeAction" class="flex flex-col gap-2">
              <n-radio value="minimize">最小化到托盘，不退出程序</n-radio>
              <n-radio value="exit">退出程序</n-radio>
            </n-radio-group>
          </div>
          <div class="rounded-xl border border-white/10 bg-[#11172a]/70 p-4 space-y-3">
            <p class="m-0 text-sm text-[#9ab4d8]">关联与通知</p>
            <n-checkbox v-model:checked="generalForm.setDefaultPlayer">将 MusicBoom 设为默认播放器</n-checkbox>
            <n-checkbox v-model:checked="generalForm.enableNotifications">开启播放提醒与系统通知</n-checkbox>
          </div>
          <div class="flex justify-end">
            <n-button type="primary" color="#6366f1" :loading="savingGeneral" @click="handleSaveGeneral">
              保存通用设置
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </MainLayout>
</template>
