<script setup lang="ts">
import PlayerBar from "../components/PlayerBar.vue";
import AppHeader from "../components/AppHeader.vue";
import SidebarMenu from "../components/SidebarMenu.vue";

// 通过 props 控制是否隐藏侧边栏，便于设置页使用无侧边栏布局
const props = withDefaults(defineProps<{ hideSidebar?: boolean }>(), {
  hideSidebar: false,
});
</script>

<template>
  <div class="h-screen overflow-hidden bg-[#0b0f17] text-[#e8ecf2]">
    <div
      class="absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(90,135,255,0.12),transparent_35%),radial-gradient(circle_at_80%_15%,rgba(110,198,255,0.12),transparent_36%),radial-gradient(circle_at_45%_80%,rgba(120,110,255,0.1),transparent_40%)]"
    ></div>
    <n-layout :has-sider="!props.hideSidebar" position="absolute" class="h-full" content-style="padding:0;">
      <n-layout-sider
        v-if="!props.hideSidebar"
        bordered
        collapse-mode="width"
        :collapsed-width="0"
        :native-scrollbar="false"
        width="240"
        class="relative z-10"
        content-style="height: 100%;"
        :scrollbar-props="{ 'content-style': 'height: 100%;' }"
      >
        <SidebarMenu />
      </n-layout-sider>

      <n-layout class="relative z-10 flex h-full flex-col overflow-hidden bg-transparent">
        <AppHeader />

        <n-layout-content class="flex min-h-0 flex-1 flex-col overflow-hidden pb-28">
          <div class="flex-1 overflow-auto">
            <section class="min-h-full px-6 py-6">
              <slot />
            </section>
          </div>
        </n-layout-content>
      </n-layout>
    </n-layout>

    <PlayerBar :offset-left="props.hideSidebar ? 0 : 240" />
  </div>
</template>
