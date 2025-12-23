<script setup lang="ts">
import { computed, ref } from "vue";
import { useMessage } from "naive-ui";
import { uploadOpenlistFile } from "../api/openlist";

interface UploadItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  speed: number;
  status: "pending" | "uploading" | "success" | "error";
  file: File;
  targetDir: string;
  message?: string;
}

const props = defineProps<{ baseUrl?: string; token?: string; activeDir: string }>();
const emit = defineEmits<{ (e: "uploaded"): void }>();

const message = useMessage();
const uploaderHover = ref(false);
const uploadQueue = ref<UploadItem[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploading = ref(false);

const currentDir = computed(() => props.activeDir || "/");

// 触发原生文件选择框
const triggerFileInput = () => {
  fileInputRef.value?.click();
};

// 将字节数格式化为易读文本
const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

// 将网速格式化为易读文本
const formatSpeed = (bytesPerSecond: number) => {
  if (bytesPerSecond <= 0) return "0 B/s";
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
};

// 统一处理文件列表入口
const handleFiles = (files: File[]) => {
  if (!files.length) return;

  if (!props.baseUrl || !props.token) {
    message.warning("请先登录 OpenList 网盘后再上传");
    return;
  }

  // 根目录仅用于展示存储列表，实际上传需进入具体存储路径
  if (!currentDir.value || currentDir.value === "/") {
    message.warning("请先进入某个存储目录，再尝试上传文件");
    return;
  }

  const tasks = files.map<UploadItem>((file) => ({
    id: `${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
    name: file.name,
    size: file.size,
    progress: 0,
    speed: 0,
    status: "pending",
    file,
    targetDir: currentDir.value,
  }));

  uploadQueue.value = [...tasks, ...uploadQueue.value];
  processQueue();
};

// 处理拖拽进入的视觉反馈
const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
  uploaderHover.value = true;
};

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault();
  uploaderHover.value = false;
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  uploaderHover.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  handleFiles(files);
};

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files || []);
  handleFiles(files);
  target.value = "";
};

// 顺序处理队列，便于显示速度和进度
const processQueue = async () => {
  if (uploading.value) return;

  uploading.value = true;

  while (true) {
    const task = uploadQueue.value.find((item) => item.status === "pending");
    if (!task) break;

    task.status = "uploading";
    console.log(`[Upload] Starting upload for ${task.name} to ${task.targetDir}`);
    
    try {
      await uploadOpenlistFile(
        props.baseUrl!,
        props.token!,
        task.targetDir,
        task.file,
        ({ loaded, total, speed }) => {
          const percent = total ? Math.round((loaded / total) * 100) : 0;
          task.progress = Math.min(percent, 100);
          task.speed = speed;
        },
      );
      task.progress = 100;
      task.speed = 0;
      task.status = "success";
      emit("uploaded");
    } catch (error) {
      console.error(`[Upload] Failed to upload ${task.name}:`, error);
      const fallback = error instanceof Error ? error.message : String(error);
      task.status = "error";
      // 优化错误提示
      if (fallback.includes("storage not found")) {
         task.message = "当前目录未挂载存储，请进入具体的挂载目录（如 /mnt/music）后再上传";
      } else {
         task.message = fallback;
      }
      message.error(`文件 ${task.name} 上传失败：${task.message}`);
    }
  }

  uploading.value = false;
};
</script>

<template>
  <div
    class="rounded-2xl border border-white/10 bg-[#0f1320]/70 p-4 text-white"
    :class="uploaderHover ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[#0f1320]' : ''"
    @dragover.prevent="handleDragOver"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="m-0 text-sm text-[#9ab4d8]">当前上传目录</p>
        <p class="m-0 text-lg font-semibold">{{ currentDir }}</p>
        <p class="m-0 text-xs text-[#9ab4d8]">可拖拽文件到此区域，或点击按钮选择文件</p>
      </div>
      <div class="flex items-center gap-2">
        <n-button type="primary" :loading="uploading" @click="triggerFileInput">选择文件</n-button>
        <n-tag type="info" round size="small">支持多文件拖拽</n-tag>
      </div>
    </div>

    <div
      class="mt-3 flex min-h-[140px] cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5 px-4 text-center"
      :class="uploaderHover ? 'border-blue-400/70 bg-blue-400/10' : ''"
      @click="triggerFileInput"
    >
      <div>
        <p class="m-0 text-lg font-semibold">拖拽文件到这里上传</p>
        <p class="m-0 text-sm text-[#9ab4d8]">也可以点击上方按钮手动选择</p>
      </div>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="hidden"
      @change="handleFileChange"
    />
<n-scrollbar style="max-height: 420px">
    <div v-if="uploadQueue.length" class="mt-4 space-y-3">
      <div class="flex items-center justify-between text-sm text-[#9ab4d8]">
        <span>上传队列</span>
        <span>{{ uploadQueue.length }} 个任务</span>
      </div>
      <div
        v-for="task in uploadQueue"
        :key="task.id"
        class="rounded-xl border border-white/5 bg-white/5 p-3"
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="m-0 text-base font-semibold text-white">{{ task.name }}</p>
            <p class="m-0 text-xs text-[#9ab4d8]">{{ formatSize(task.size) }}</p>
            <p class="m-0 text-xs text-[#9ab4d8]">目录：{{ task.targetDir }}</p>
          </div>
          <div class="text-right text-xs text-[#9ab4d8]">
            <p class="m-0">进度：{{ task.progress }}%</p>
            <p class="m-0">速度：{{ formatSpeed(task.speed) }}</p>
          </div>
        </div>
        <div class="mt-2 h-2 rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all"
            :class="task.status === 'error' ? 'from-red-500 to-pink-500' : ''"
            :style="{ width: `${task.progress}%` }"
          />
        </div>
        <p v-if="task.status === 'error' && task.message" class="mt-2 text-xs text-red-400">
          {{ task.message }}
        </p>
        <p v-else-if="task.status === 'success'" class="mt-2 text-xs text-green-400">上传完成</p>
      </div>
    </div>
    </n-scrollbar>
  </div>
</template>
