import { reactive, ref } from "vue";
import { Store } from "@tauri-apps/plugin-store";
import type { OpenlistSessionState, OpenlistLoginSuccess } from "../types/openlist";

const STORAGE_KEY = "openlistSession";
let backingStore: Store | null = null;

const state = reactive<OpenlistSessionState>({
  baseUrl: null,
  token: null,
  username: null,
});

// 标记是否已完成本地会话恢复，便于路由层基于真实登录态决策
const hydrated = ref(false);

async function ensureStore() {
  if (!backingStore) {
    backingStore = await Store.load("openlist-session.dat");
  }
  return backingStore;
}

// 从持久化存储恢复 OpenList 登录态，便于自动复用
async function hydrateFromStore() {
  try {
    const store = await ensureStore();
    const saved = await store.get<OpenlistSessionState | null>(STORAGE_KEY);
    if (saved) {
      state.baseUrl = saved.baseUrl;
      state.token = saved.token;
      state.username = saved.username;
    }
  } catch (error) {
    console.warn("读取 OpenList 登录态失败，将从空状态启动", error);
  } finally {
    hydrated.value = true;
  }
}

const ready = hydrateFromStore();

// 写入 OpenList 登录态
async function setSession(payload: OpenlistLoginSuccess & { baseUrl: string }) {
  const store = await ensureStore();
  state.baseUrl = payload.baseUrl;
  state.token = payload.token;
  state.username = payload.username;
  try {
    await store.set(STORAGE_KEY, { ...state });
    await store.save();
  } catch (error) {
    console.warn("写入 OpenList 登录态到本地失败，仅保留内存状态", error);
  }
}

// 清空登录态
async function clearSession() {
  const store = await ensureStore();
  state.baseUrl = null;
  state.token = null;
  state.username = null;
  await store.delete(STORAGE_KEY);
  await store.save();
}

export function useOpenlistStore() {
  return {
    state,
    ready,
    hydrated,
    setSession,
    clearSession,
  };
}
