<script setup lang="ts">
import { NConfigProvider, NGlobalStyle, NMessageProvider, NNotificationProvider } from "naive-ui";
import { RouterView } from "./utils/router-lite";
import { appTheme, appThemeOverrides } from "./theme";
</script>

<template>
  <NConfigProvider :theme="appTheme" :theme-overrides="appThemeOverrides" class="h-full w-full">
    <NNotificationProvider placement="top-right">
      <NMessageProvider>
        <RouterView />
      </NMessageProvider>
    </NNotificationProvider>
    <NGlobalStyle />
  </NConfigProvider>
</template>
