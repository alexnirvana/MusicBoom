import { reactive } from "vue";
import { Store } from "@tauri-apps/plugin-store";
import type { AuthState, LoginSuccess } from "../types/auth";

const STORAGE_KEY = "session";
let sessionStore: Store | null = null;

const state = reactive<AuthState>({
  baseUrl: null,
  token: null,
  salt: null,
  username: null,
  displayName: null,
});

async function ensureStore() {
  if (!sessionStore) {
    sessionStore = await Store.load("session.dat");
  }
  return sessionStore;
}

// 初始化时从 Tauri Store 里恢复登录态，方便多窗口共享
async function hydrateFromStore() {
  try {
    const store = await ensureStore();
    const saved = await store.get<AuthState | null>(STORAGE_KEY);
    if (saved) {
      state.baseUrl = saved.baseUrl;
      state.token = saved.token;
      state.salt = saved.salt;
      state.username = saved.username;
      state.displayName = saved.displayName;
    }
  } catch (error) {
    console.warn("读取登录态失败，将从空状态启动", error);
  }
}

const ready = hydrateFromStore();

// 更新登录状态并持久化到本地 Store
async function setSession(payload: LoginSuccess & { baseUrl: string }) {
  const store = await ensureStore();
  state.baseUrl = payload.baseUrl;
  state.token = payload.token;
  state.salt = payload.salt;
  state.username = payload.username;
  state.displayName = payload.displayName;
  try {
    await store.set(STORAGE_KEY, { ...state });
    await store.save();
  } catch (error) {
    // 持久化失败不应阻断登录流程，继续以内存态运行并提示警告
    console.warn("写入登录态到 Tauri Store 失败，已改为仅在内存中保存", error);
  }
}

// 清除本地状态与持久化存储
async function clearSession() {
  const store = await ensureStore();
  state.baseUrl = null;
  state.token = null;
  state.salt = null;
  state.username = null;
  state.displayName = null;
  await store.delete(STORAGE_KEY);
  await store.save();
}

export function useAuthStore() {
  return {
    state,
    ready,
    setSession,
    clearSession,
  };
}
