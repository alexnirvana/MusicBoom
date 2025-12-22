<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useMessage } from "naive-ui";
import MainLayout from "../layouts/MainLayout.vue";
import { loginOpenlist } from "../api/openlist";
import type { OpenlistLoginPayload } from "../types/openlist";
import { useOpenlistStore } from "../stores/openlist";
import { useSettingsStore } from "../stores/settings";
import { useRouter } from "../utils/router-lite";

const message = useMessage();
const router = useRouter();
const loading = ref(false);
const remember = ref(false);
const { state: settingsState, ready: settingsReady, updateOpenlist } = useSettingsStore();

const form = reactive<OpenlistLoginPayload>({
  baseUrl: "http://",
  username: "",
  password: "",
});

const { state, ready, setSession, clearSession } = useOpenlistStore();

const isLoggedIn = computed(() => Boolean(state.token));

// 从设置表中恢复 OpenList 登录凭据，方便快速登录
async function hydrateCredential() {
  try {
    await settingsReady;
    const saved = settingsState.openlist;
    form.baseUrl = saved.baseUrl || form.baseUrl;
    form.username = saved.username || form.username;
    form.password = saved.password || form.password;
    remember.value = Boolean(saved.remember);
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.warning(`读取网盘登录信息失败：${fallback}`);
  }
}

// 登录 OpenList
async function handleLogin() {
  loading.value = true;
  try {
    const result = await loginOpenlist(form);
    await setSession(result);

    if (remember.value) {
      await updateOpenlist({ ...form, remember: true });
    } else {
      await updateOpenlist({ baseUrl: "", username: "", password: "", remember: false });
    }

    message.success("网盘登录成功，正在跳转...");
    router.push({ name: "openlist-drive" });
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`登录网盘失败：${fallback}`);
  } finally {
    loading.value = false;
  }
}

// 退出 OpenList 登录
async function handleLogout() {
  await clearSession();
  message.info("已退出网盘登录");
}

onMounted(async () => {
  await ready;
  await hydrateCredential();
});
</script>

<template>
  <MainLayout>
    <div class="space-y-4 max-w-4xl mx-auto">
      <div class="rounded-2xl border border-white/10 bg-[#0f1320]/70 px-5 py-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="m-0 text-sm text-[#9ab4d8]">OpenList 网盘</p>
            <h1 class="m-0 text-2xl font-semibold text-white">登录我的网盘</h1>
            <p class="m-0 text-[#c6d2e8]">填写凭据后即可跳转到网盘文件页。</p>
          </div>
          <n-tag type="info">{{ isLoggedIn ? "已登录" : "未登录" }}</n-tag>
        </div>
      </div>

      <div class="rounded-2xl border border-white/10 bg-[#0f1320]/70 px-5 py-4">
        <div class="mb-3">
          <p class="m-0 text-sm text-[#9ab4d8]">OpenList 登录</p>
          <h2 class="m-0 text-xl font-semibold text-white">连接我的网盘</h2>
          <p class="m-0 text-[#c6d2e8]">输入开放网盘的地址、用户名与密码即可登录。</p>
        </div>
        <n-form
          :model="form"
          label-placement="top"
          :show-feedback="false"
          class="space-y-3 max-w-xl mx-auto"
        >
          <n-form-item label="网盘地址" path="baseUrl">
            <n-input v-model:value="form.baseUrl" placeholder="例如 http://your-openlist" clearable />
          </n-form-item>
          <div class="grid gap-3 sm:grid-cols-2">
            <n-form-item label="用户名" path="username">
              <n-input v-model:value="form.username" placeholder="请输入网盘账号" clearable />
            </n-form-item>
            <n-form-item label="密码" path="password">
              <n-input v-model:value="form.password" type="password" placeholder="请输入密码" />
            </n-form-item>
          </div>
          <div class="flex items-center text-xs text-white/70">
            <n-checkbox v-model:checked="remember" size="small">记住并自动填充</n-checkbox>
          </div>
          <div class="flex justify-center gap-3 pt-1">
            <n-button type="primary" color="#22c55e" :loading="loading" @click="handleLogin">登录网盘</n-button>
            <n-button secondary @click="handleLogout">退出登录</n-button>
          </div>
        </n-form>
      </div>
    </div>
  </MainLayout>
</template>
