<script setup lang="ts">
import { CloseOutline, PersonCircleOutline, SettingsOutline } from "@vicons/ionicons5";
import { computed, h } from "vue";
import { NButton, NDropdown, NIcon } from "naive-ui";
import { useRouter } from "../utils/router-lite";
import { useAuthStore } from "../stores/auth";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";

// 渲染下拉菜单图标，保持 Naive UI 风格
const renderIcon = (icon: any) => () => h(NIcon, null, { default: () => h(icon) });

// 登录态及用户信息
const { state, clearSession } = useAuthStore();
const isLoggedIn = computed(() => Boolean(state.token));
const userInitial = computed(() => state.displayName?.[0]?.toUpperCase() ?? "M");
const router = useRouter();

// 下拉菜单配置
const userDropdownOptions = [
  { label: "设置", key: "settings", icon: renderIcon(SettingsOutline) },
  { label: "退出", key: "exit", icon: renderIcon(CloseOutline) },
];

// 处理下拉菜单点击
const handleUserSelect = async (key: string) => {
  if (key === "settings") {
    await router.push({ name: "settings" });
    return;
  }

  if (key === "exit") {
    await clearSession();
    
    // 创建新的登录窗口
    const loginWindow = new WebviewWindow("auth", {
      url: "/#/login",
      title: "登录 MusicBoom",
      width: 460,
      height: 640,
      resizable: false,
      decorations: false,
      center: true,
      transparent: true, // 关键：开启透明背景以支持圆角阴影
      shadow: false,
      visible: false, // 先隐藏，加载完成后显示
    });

    // 监听创建错误
    loginWindow.once("tauri://error", (e) => {
      console.error("无法创建登录窗口:", e);
      // 如果创建失败（例如窗口已存在），尝试路由跳转作为兜底
      router.replace({ name: "login" });
    });

    // 稍作延迟后显示并关闭当前窗口
    // 注意：在某些平台上，立即关闭当前窗口可能会导致进程退出，
    // 但因为我们开启了新窗口，理论上应用会继续运行。
    try {
      // 这里的延时是为了让新窗口有时间初始化，避免闪烁
      setTimeout(async () => {
        await loginWindow.show();
        await loginWindow.setFocus();
        const current = getCurrentWindow();
        await current.close();
      }, 500);
    } catch (error) {
      console.error("切换窗口失败:", error);
      router.replace({ name: "login" });
    }
  }
};
</script>

<template>
  <n-dropdown
    v-if="isLoggedIn"
    trigger="click"
    placement="bottom-end"
    :options="userDropdownOptions"
    @select="handleUserSelect"
  >
    <n-button quaternary circle strong class="user-action-button" title="个人菜单">
      <div class="user-avatar">
        <n-icon size="28" :component="PersonCircleOutline" />
        <span class="user-initial">{{ userInitial }}</span>
      </div>
    </n-button>
  </n-dropdown>
  <n-button v-else type="primary" strong round class="px-4">登录 / 主菜单</n-button>
</template>

<style scoped>
/* 登录后个人菜单按钮，突出图形感 */
.user-action-button {
  padding: 0 !important;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  background: radial-gradient(circle at 30% 30%, rgba(111, 198, 255, 0.45), rgba(79, 134, 255, 0.3)) !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.user-action-button :deep(.n-button__content) {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-avatar {
  position: relative;
  display: grid;
  place-items: center;
  color: #0b0f17;
  font-weight: 700;
  font-size: 12px;
}

.user-avatar .n-icon {
  width: 100%;
  height: 100%;
  color: #e8f1ff;
  opacity: 0.75;
}

.user-initial {
  position: absolute;
  bottom: 6px;
  right: 6px;
  padding: 2px 6px;
  border-radius: 12px;
  background: rgba(11, 15, 23, 0.85);
  color: #9bc7ff;
  font-size: 10px;
  letter-spacing: 0.04em;
}
</style>
