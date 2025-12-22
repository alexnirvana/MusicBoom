<script setup lang="ts">
import { computed, onMounted } from "vue";
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";

const props = withDefaults(
  defineProps<{
    width?: number;
    height?: number;
    alwaysOnTop?: boolean;
    center?: boolean;
    rounded?: boolean;
    radius?: string;
  }>(),
  {
    width: 460,
    height: 640,
    alwaysOnTop: true,
    center: true,
    rounded: true,
    radius: "16px",
  }
);

const containerStyle = computed(() => ({
  borderRadius: props.rounded ? props.radius : "0px",
}));

// 统一管理无边框窗口属性，便于在不同页面重用
onMounted(async () => {
  const win = getCurrentWindow();

  try {
    await win.setDecorations(false);
  } catch (e) {
    console.warn("Failed to set decorations:", e);
  }

  try {
    await win.setResizable(false);
  } catch (e) {
    console.warn("Failed to set resizable:", e);
  }

  try {
    if (props.width && props.height) {
      await win.setSize(new LogicalSize(props.width, props.height));
    }
  } catch (e) {
    console.warn("Failed to set size:", e);
  }

  try {
    if (props.center) {
      await win.center();
    }
  } catch (e) {
    console.warn("Failed to center window:", e);
  }

  try {
    if (props.alwaysOnTop !== undefined) {
      await win.setAlwaysOnTop(props.alwaysOnTop);
    }
  } catch (e) {
    console.warn("Failed to set always on top:", e);
  }
});
</script>

<template>
  <div class="frameless-layout">
    <div class="frameless-content" :style="containerStyle">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.frameless-layout {
  /* 留出足够的 padding 给阴影 */
  @apply w-full h-full flex justify-center items-center bg-transparent p-6;
}

.frameless-content {
  /* 强制占满剩余空间（减去 padding），应用圆角和阴影 */
  @apply w-full h-full overflow-hidden shadow-2xl bg-transparent relative;
  /* 阴影颜色调整，使其在暗色背景下更柔和但可见 */
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
}
</style>
