<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useMessage } from "naive-ui";
import { loginNavidrome } from "../api/navidrome";
import { testMysqlConnection } from "../api/mysql";
import { useAuthStore } from "../stores/auth";
import { usePlayerStore } from "../stores/player";
import type { LoginPayload } from "../types/auth";
import type { MysqlConfig } from "../types/settings";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import FramelessWindow from "../components/FramelessWindow.vue";
import { appCacheDir, downloadDir, join } from "@tauri-apps/api/path";
import { exists, mkdir } from "@tauri-apps/plugin-fs";
import { mysqlConnectionManager } from "../services/mysql-connection";
import { invoke } from "@tauri-apps/api/core";
import { mysqlConfigManager } from "../services/mysql-config";
import { navidromeConfigManager } from "../services/navidrome-config";
import { pathConfigManager } from "../services/path-config";

const message = useMessage();
const { setSession } = useAuthStore();
const player = usePlayerStore();
const loading = ref(false);
const currentWindow = getCurrentWindow();

// Navidrome配置
const navidromeConfigReady = ref(false);

// MySQL配置
const showMysqlModal = ref(false);
const mysqlForm = reactive<MysqlConfig>({
  host: "localhost",
  port: 3306,
  database: "",
  username: "",
  password: "",
});
const savingMysql = ref(false);
const testingMysql = ref(false);

// 登录成功后唤起主窗口，避免让登录窗口承担过多边框和布局
async function openMainWindow() {
  console.log("正在检查是否存在主窗口...");
  const existing = await WebviewWindow.getByLabel("main");

  if (existing) {
    console.log("找到已存在的主窗口，正在唤起...");
    await existing.show();
    await existing.setFocus();
    return existing;
  }

  console.log("未找到主窗口，开始创建新窗口...");
  // 确保 options 里的配置是合法的，有时过多的配置会导致问题
  const created = new WebviewWindow("main", {
    url: "/#/home",
    title: "MusicBoom",
    width: 1200,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    center: true,
    decorations: false,
    resizable: true,
    visible: true, // 显式设置为 true
  });

  // 监听创建失败事件（如果有）
  created.once("tauri://error", (e) => {
    console.error("窗口创建错误事件:", e);
    message.error("无法创建主窗口，权限不足或配置错误");
  });

  created.once("tauri://created", () => {
    console.log("主窗口创建成功事件触发");
  });

  console.log("WebviewWindow 实例已创建，正在调用 show()...");
  // 有些版本中 new 之后不一定立即可用，尝试简单的延时或直接操作
  try {
    // 显式调用 show 以防万一，虽然 visible: true 应该足够
    await created.show();
    await created.setFocus();
  } catch (e) {
    console.error("调用 created.show() 失败:", e);
    // 这里不抛出错误，因为窗口可能已经显示了
  }

  return created;
}

const form = reactive<LoginPayload>({
  baseUrl: "http://",
  username: "",
  password: "", // 出于安全考虑不预填密码
});

const remember = ref(false);

// 从配置文件读取已保存的登录信息
async function loadSavedCredential() {
  try {
    await navidromeConfigManager.initialize();
    navidromeConfigReady.value = true;
    const saved = navidromeConfigManager.getConfig();
    if (saved) {
      form.baseUrl = saved.baseUrl || "http://";
      form.username = saved.username || "";
      form.password = saved.password || "";
      remember.value = Boolean(saved.remember);
    }
  } catch (error) {
    console.warn("读取 Navidrome 配置失败", error);
  }
}

// 根据勾选状态决定是否持久化到配置文件
async function persistCredential() {
  try {
    if (!remember.value) {
      await navidromeConfigManager.saveConfig({
        baseUrl: "",
        username: "",
        password: "",
        remember: false,
      });
      return;
    }

    await navidromeConfigManager.saveConfig({
      baseUrl: form.baseUrl,
      username: form.username,
      password: form.password,
      remember: true,
    });
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    console.warn("持久化登录凭据失败，仅保留当前会话", error);
    message.warning(`保存登录信息失败：${fallback}`);
  }
}

// 登录后立即确保下载目录与缓存目录存在，避免需要先打开设置页
async function ensureDownloadDirectories() {
  // 初始化路径配置管理器
  await pathConfigManager.initialize().catch((error) => {
    console.warn("初始化路径配置失败", error);
  });

  const pendingUpdate: { musicDir?: string; cacheDir?: string } = {};
  const pathConfig = pathConfigManager.getConfig();
  let musicDir = pathConfig?.musicDir?.trim() || "";
  let cacheDir = pathConfig?.cacheDir?.trim() || "";

  if (!musicDir) {
    try {
      const dir = await downloadDir();
      musicDir = await join(dir, "MusicBoom");
      pendingUpdate.musicDir = musicDir;
    } catch (error) {
      const fallback = error instanceof Error ? error.message : String(error);
      message.warning(`获取默认下载目录失败：${fallback}`);
    }
  }

  if (!cacheDir) {
    try {
      const dir = await appCacheDir();
      cacheDir = await join(dir, "musicboom-cache");
      pendingUpdate.cacheDir = cacheDir;
    } catch (error) {
      const fallback = error instanceof Error ? error.message : String(error);
      message.warning(`获取默认缓存目录失败：${fallback}`);
    }
  }

  if (musicDir) await ensureDirectory(musicDir, "下载目录");
  if (cacheDir) await ensureDirectory(cacheDir, "缓存目录");

  if (Object.keys(pendingUpdate).length > 0) {
    await pathConfigManager.saveConfig(pendingUpdate);
  }
}

// 具体的目录检查与自动创建逻辑
async function ensureDirectory(target: string, label: string) {
  try {
    if (await exists(target)) return true;
    await mkdir(target, { recursive: true });
    message.success(`${label}已自动创建`);
    return true;
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.warning(`${label}自动创建失败：${fallback}`);
    return false;
  }
}

onMounted(() => {
  loadSavedCredential();
  // 初始化 MySQL 配置管理器
  mysqlConfigManager.initialize().catch(error => {
    console.error("初始化 MySQL 配置失败:", error);
  });
});

// 只有当所有输入都非空时才允许提交
const submitDisabled = computed(() =>
  !form.baseUrl.trim() || !form.username.trim() || !form.password.trim()
);

// 测试MySQL连接
async function testMysqlBeforeLogin(): Promise<boolean> {
  try {
    const mysqlConfig = mysqlConfigManager.getConfig();

    // 检查MySQL配置是否完整
    if (!mysqlConfig || !mysqlConfig.host || !mysqlConfig.database || !mysqlConfig.username) {
      message.warning("请先配置MySQL连接信息");
      openMysqlModal();
      return false;
    }

    // 测试MySQL连接
    const result = await testMysqlConnection(mysqlConfig);

    if (!result.success) {
      message.error(`MySQL连接失败: ${result.message}`);
      openMysqlModal();
      return false;
    }

    // 初始化MySQL连接并切换到MySQL存储
    await mysqlConnectionManager.initialize(mysqlConfig);
    message.success("MySQL连接成功");

    return true;
  } catch (error) {
    console.error("测试MySQL连接失败:", error);
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`MySQL连接测试出错: ${fallback}`);
    openMysqlModal();
    return false;
  }
}

async function handleSubmit() {
  loading.value = true;
  try {
    // 先测试MySQL连接
    const mysqlConnected = await testMysqlBeforeLogin();
    if (!mysqlConnected) {
      return;
    }

    const result = await loginNavidrome(form);
    await setSession({ ...result, baseUrl: form.baseUrl });
    await player.restoreFromSnapshot({
      baseUrl: form.baseUrl,
      bearerToken: null,
      token: result.token,
      salt: result.salt,
      username: result.username,
      password: form.password,
    });
    await ensureDownloadDirectories();
    await persistCredential();
    console.log("尝试创建主窗口...");
    try {
      await openMainWindow();
      console.log("主窗口创建流程完成");
    } catch (e) {
      console.error("创建主窗口失败:", e);
      throw e; // 重新抛出以便外层捕获
    }

    message.success(`登录成功`);

    // 延迟关闭当前窗口，确保主窗口有时间加载
    setTimeout(async () => {
      try {
        await currentWindow.close();
      } catch (e) {
        console.warn("关闭登录窗口失败:", e);
      }
    }, 1000);
  } catch (error) {
    console.error("登录流程错误:", error);
    const fallback = error instanceof Error ? error.message : "登录失败";
    message.error(`登录出错: ${fallback}`);
  } finally {
    loading.value = false;
  }
}

function handleCancel() {
  currentWindow.close();
}

// MySQL配置相关函数
// 解析主机名，如果是 http/https 地址则解析为 IP
async function resolveHost(host: string): Promise<string> {
  if (host.startsWith("http://") || host.startsWith("https://")) {
    try {
      const ip = await invoke<string>("resolve_hostname", { hostname: host });
      console.log(`[MySQL] 解析 ${host} -> ${ip}`);
      return ip;
    } catch (error) {
      console.warn("[MySQL] DNS 解析失败，使用原始主机名:", error);
      return host;
    }
  }
  return host;
}

async function loadMysqlConfig() {
  try {
    await mysqlConfigManager.initialize();
    const config = mysqlConfigManager.getConfig();
    if (config) {
      Object.assign(mysqlForm, { ...config });
    }
  } catch (error) {
    console.warn("读取MySQL配置失败", error);
  }
}

function openMysqlModal() {
  loadMysqlConfig();
  showMysqlModal.value = true;
}

function closeMysqlModal() {
  showMysqlModal.value = false;
}

async function handleTestMysql() {
  testingMysql.value = true;
  try {
    // 先解析主机名
    const resolvedHost = await resolveHost(mysqlForm.host);
    const configToTest = { ...mysqlForm, host: resolvedHost };

    const result = await testMysqlConnection(configToTest);
    if (result.success) {
      message.success(result.message);
    } else {
      message.error(result.message);
    }
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`测试MySQL连接失败：${fallback}`);
  } finally {
    testingMysql.value = false;
  }
}

async function handleSaveMysql() {
  savingMysql.value = true;
  try {
    // 先解析主机名
    const resolvedHost = await resolveHost(mysqlForm.host);
    const configToSave = { ...mysqlForm, host: resolvedHost };

    await mysqlConfigManager.saveConfig(configToSave);
    // 同时更新表单中的 host，保持一致
    mysqlForm.host = resolvedHost;

    message.success("MySQL配置已保存");
    closeMysqlModal();
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`保存MySQL配置失败：${fallback}`);
  } finally {
    savingMysql.value = false;
  }
}
</script>

<template>
  <FramelessWindow
    :width="400"
    :height="560"
    :always-on-top="true"
    :center="true"
    :rounded="true"
    radius="16px"
  >
    <div class="login-page-container" data-tauri-drag-region>
      <div class="content-wrapper">
        <div class="form-header">
          <div class="eyebrow">登录 Navidrome</div>
          <h1 class="title">欢迎回来</h1>
          <p class="subtitle">请连接到你的 Navidrome 服务</p>
        </div>

        <n-form
          :model="form"
          label-placement="top"
          :show-feedback="false"
          label-width="auto"
          class="space-y-0 no-drag"
          @submit.prevent="handleSubmit"
        >
          <n-form-item label="服务基础地址" path="baseUrl" class="mb-3">
            <n-input
              v-model:value="form.baseUrl"
              placeholder="例如 http://"
              size="small"
              clearable
              autocomplete="url"
            />
          </n-form-item>
          <n-form-item label="用户名" path="username" class="mb-3">
            <n-input
              v-model:value="form.username"
              placeholder="请输入用户名"
              size="small"
              clearable
              autocomplete="username"
            />
          </n-form-item>
          <n-form-item label="密码" path="password" class="mb-3">
            <n-input
              v-model:value="form.password"
              type="password"
              show-password-on="click"
              placeholder="请输入密码"
              size="small"
              autocomplete="current-password"
            />
          </n-form-item>

          <div class="flex items-center text-xs text-white/70 pt-0">
            <n-checkbox v-model:checked="remember" size="small">记住并下次自动填充</n-checkbox>
          </div>

          <!-- 增加一个显式的占位元素来确保间距 -->
          <div class="h-12"></div>

          <div class="grid grid-cols-2 gap-3">
            <n-button
              type="primary"
              color="#6366f1"
              size="large"
              :loading="loading"
              :disabled="submitDisabled"
              attr-type="submit"
              class="login-btn w-full"
            >
              登录
            </n-button>
            <n-button
              type="default"
              size="large"
              quaternary
              attr-type="button"
              @click="handleCancel"
              class="cancel-btn w-full"
            >
              取消
            </n-button>
          </div>

          <div class="flex justify-center pt-2">
            <n-button
              type="default"
              size="small"
              quaternary
              @click="openMysqlModal"
              class="text-white/60 hover:text-white"
            >
              <template #icon>
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </template>
              MySQL设置
            </n-button>
          </div>
        </n-form>
      </div>
    </div>
  </FramelessWindow>

  <!-- MySQL配置对话框 -->
  <n-modal
    v-model:show="showMysqlModal"
    preset="card"
    title="MySQL连接配置"
    :bordered="false"
    :style="{ width: '360px' }"
    :segmented="{ content: 'soft' }"
  >
    <n-form
      :model="mysqlForm"
      label-placement="left"
      :show-feedback="false"
      label-width="60px"
      label-align="right"
      class="space-y-2"
    >
      <n-form-item label="主机">
        <n-input
          v-model:value="mysqlForm.host"
          placeholder="localhost"
          clearable
          size="small"
        />
      </n-form-item>
      <n-form-item label="端口">
        <n-input-number
          v-model:value="mysqlForm.port"
          :min="1"
          :max="65535"
          class="w-full"
          size="small"
        />
      </n-form-item>
      <n-form-item label="数据库">
        <n-input
          v-model:value="mysqlForm.database"
          placeholder="musicboom"
          clearable
          size="small"
        />
      </n-form-item>
      <n-form-item label="用户">
        <n-input
          v-model:value="mysqlForm.username"
          placeholder="root"
          clearable
          size="small"
        />
      </n-form-item>
      <n-form-item label="密码">
        <n-input
          v-model:value="mysqlForm.password"
          type="password"
          show-password-on="click"
          placeholder="请输入密码"
          size="small"
        />
      </n-form-item>
    </n-form>
    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button size="small" @click="closeMysqlModal">取消</n-button>
        <n-button size="small" @click="handleTestMysql" :loading="testingMysql">测试</n-button>
        <n-button type="primary" size="small" color="#6366f1" :loading="savingMysql" @click="handleSaveMysql">保存</n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.login-page-container {
  @apply flex flex-col h-full bg-gradient-to-b from-[#0f111a] via-[#131624] to-[#0f111a] overflow-hidden;
  border-radius: inherit; /* 继承父级 FramelessWindow 的圆角 */
  /* 移除边框或使其更透明，避免底部出现明显的框线 */
  border: 1px solid rgba(255, 255, 255, 0.05);
}

/* 隐藏当前页面的滚动条 */
.login-page-container :deep(::-webkit-scrollbar) {
  display: none;
  width: 0;
  height: 0;
}

/* 允许拖拽 */
[data-tauri-drag-region] {
  -webkit-app-region: drag;
}

/* 禁止拖拽 */
.no-drag {
  -webkit-app-region: no-drag;
}

.content-wrapper {
  @apply flex-1 px-8 pt-10 pb-6 flex flex-col justify-center;
}

.form-header {
  @apply mb-8 text-center;
}

.eyebrow {
  @apply text-[11px] font-bold uppercase tracking-[0.15em] text-indigo-400 mb-2 opacity-90;
}

.title {
  @apply text-3xl font-bold text-white mb-2 tracking-tight;
}

.subtitle {
  @apply text-sm text-gray-400/80 font-medium;
}

.login-btn {
  font-weight: 600;
  letter-spacing: 0.02em;
}

.cancel-btn {
  @apply text-gray-400 hover:text-white transition-colors;
}
</style>
