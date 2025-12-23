<script setup lang="ts">
import { NConfigProvider, NGlobalStyle, NMessageProvider, NNotificationProvider } from "naive-ui";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { RouterView } from "./utils/router-lite";
import { appTheme, appThemeOverrides } from "./theme";

// 记录当前内容区的刷新标记，拦截 F5 时仅刷新页面组件而不重载整个应用
const viewRefreshKey = ref(0);

function handleSoftRefresh(event: KeyboardEvent) {
  if (event.key !== "F5") return;
  event.preventDefault();
  viewRefreshKey.value += 1;
}

onMounted(() => {
  window.addEventListener("keydown", handleSoftRefresh);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleSoftRefresh);
});
</script>

<template>
  <NConfigProvider :theme="appTheme" :theme-overrides="appThemeOverrides" class="h-full w-full">
    <NNotificationProvider placement="top-right">
      <NMessageProvider>
        <RouterView :key="viewRefreshKey" />
      </NMessageProvider>
    </NNotificationProvider>
    <NGlobalStyle />
  </NConfigProvider>
</template>
