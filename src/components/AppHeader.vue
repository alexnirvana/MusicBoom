<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  CloseOutline,
  CopyOutline,
  RemoveOutline,
  SearchOutline,
  SquareOutline,
} from "@vicons/ionicons5";
import { NButton, NIcon, NInput } from "naive-ui";
import type { UnlistenFn } from "@tauri-apps/api/event";
import UserMenu from "./UserMenu.vue";

// 窗口控制按钮配置，实时切换最大化按钮的图标
const currentWindow = getCurrentWindow();
const isMaximized = ref(false);
const resizeUnlisten = ref<UnlistenFn | null>(null);

const updateMaximizedState = async () => {
  try {
    isMaximized.value = await currentWindow.isMaximized();
  } catch (error) {
    console.error("无法获取窗口最大化状态:", error);
  }
};

const checkStateDebounced = () => {
  setTimeout(updateMaximizedState, 100);
};

onMounted(async () => {
  await updateMaximizedState();
  resizeUnlisten.value = await currentWindow.listen("tauri://resize", checkStateDebounced);
  window.addEventListener("resize", checkStateDebounced);
});

onUnmounted(() => {
  if (resizeUnlisten.value) {
    resizeUnlisten.value();
  }
  window.removeEventListener("resize", checkStateDebounced);
});

const windowActions = computed(() => [
  { icon: RemoveOutline, title: "最小化", onClick: () => currentWindow.minimize() },
  {
    icon: isMaximized.value ? CopyOutline : SquareOutline,
    title: isMaximized.value ? "还原窗口" : "最大化窗口",
    onClick: async () => {
      await currentWindow.toggleMaximize();
      // 立即检查一次
      await updateMaximizedState();
      // 稍后再次检查以防动画延迟
      setTimeout(updateMaximizedState, 200);
    },
  },
  { icon: CloseOutline, title: "关闭", onClick: () => currentWindow.close() },
]);
</script>

<template>
  <n-layout-header
    bordered
    class="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-[#0f131d]/85 px-5 py-3 backdrop-blur"
    data-tauri-drag-region
  >
    <div class="flex-1 no-drag">
      <n-input round clearable size="large" :placeholder="'搜索音乐、歌手或专辑'" class="w-full">
        <template #prefix>
          <n-icon :component="SearchOutline" />
        </template>
      </n-input>
    </div>
    <div class="no-drag flex items-center gap-3">
      <UserMenu />
      <div class="window-control-group">
        <n-button
          v-for="item in windowActions"
          :key="item.title"
          quaternary
          circle
          size="small"
          class="window-control"
          :title="item.title"
          @click="item.onClick()"
        >
          <n-icon :component="item.icon" />
        </n-button>
      </div>
    </div>
  </n-layout-header>
</template>

<style scoped>
/* 指定可拖动区域，隐藏原生标题栏后仍可拖动窗口 */
[data-tauri-drag-region] {
  -webkit-app-region: drag;
}

/* 防止交互元素被拖拽 */
.no-drag {
  -webkit-app-region: no-drag;
}

/* 右上角窗口控制按钮风格，强化 hover/点击反馈 */
.window-control-group {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(79, 134, 255, 0.12), rgba(111, 198, 255, 0.08));
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
}

.window-control :deep(.n-button__content) {
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
  color: #dce7ff;
}

.window-control {
  transition: transform 0.18s ease, background-color 0.18s ease, border-color 0.18s ease;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  background: rgba(255, 255, 255, 0.03) !important;
}

.window-control:hover {
  transform: translateY(-1px);
  background: rgba(111, 198, 255, 0.16) !important;
  border-color: rgba(111, 198, 255, 0.5) !important;
}

.window-control:active {
  transform: translateY(0);
  background: rgba(79, 134, 255, 0.18) !important;
}
</style>
