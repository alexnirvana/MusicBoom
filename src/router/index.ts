import { createRouter, createWebHashHistory } from "../utils/router-lite";
import Login from "../pages/Login.vue";
import Home from "../pages/Home.vue";
import Settings from "../pages/Settings.vue";
import MyMusic from "../pages/MyMusic.vue";
import FavoriteMusic from "../pages/FavoriteMusic.vue";
import OpenlistDrive from "../pages/OpenlistDrive.vue";
import OpenlistLogin from "../pages/OpenlistLogin.vue";
import { useAuthStore } from "../stores/auth";
import { useOpenlistStore } from "../stores/openlist";

// 路由配置：登录页为入口，首页需要鉴权
const routes = [
  { path: "/", redirect: { name: "login" } },
  { path: "/login", name: "login", component: Login },
  { path: "/home", name: "home", component: Home, meta: { requiresAuth: true } },
  { path: "/my-music", name: "my-music", component: MyMusic, meta: { requiresAuth: true } },
  { path: "/favorites", name: "favorites", component: FavoriteMusic, meta: { requiresAuth: true } },
  { path: "/openlist/login", name: "openlist-login", component: OpenlistLogin },
  { path: "/openlist", name: "openlist-drive", component: OpenlistDrive },
  { path: "/settings", name: "settings", component: Settings, meta: { requiresAuth: true } },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// 基础前置守卫：未登录访问需要鉴权的页面会被重定向到登录页
router.beforeEach((to, _from, next) => {
  const { state } = useAuthStore();
  const { state: openlistState, hydrated: openlistHydrated } = useOpenlistStore();

  if (to.meta.requiresAuth && !state.token) {
    next({ name: "login" });
    return;
  }

  if (to.name === "login" && state.token) {
    next({ name: "home" });
    return;
  }

  // 网盘文件页需要单独的 OpenList 登录态，避免复用歌曲库的登录状态
  if (
    to.name === "openlist-drive" &&
    openlistHydrated.value &&
    !openlistState.token
  ) {
    next({ name: "openlist-login" });
    return;
  }

  // 已登录网盘时访问网盘登录页，直接跳转到文件页
  if (
    to.name === "openlist-login" &&
    openlistHydrated.value &&
    openlistState.token
  ) {
    next({ name: "openlist-drive" });
    return;
  }

  next();
});

export default router;
