import { KeepAlive, computed, defineComponent, h, inject, markRaw, shallowRef } from "vue";
import type { Component, ShallowRef } from "vue";

// 路由记录的数据结构
export interface RouteRecord {
  path: string;
  name?: string;
  component?: Component;
  meta?: Record<string, unknown>;
  redirect?: { name?: string; path?: string };
}

export interface RouterOptions {
  history?: unknown;
  routes: RouteRecord[];
}

export interface RouteLocation {
  path: string;
  name?: string;
  meta: Record<string, unknown>;
  component: Component;
  redirect?: { name?: string; path?: string };
}

export interface Router {
  currentRoute: ShallowRef<RouteLocation>;
  beforeEach: (guard: NavigationGuard) => void;
  push: (location: RouteLocationRaw) => void;
  replace: (location: RouteLocationRaw) => void;
  install: (app: any) => void;
}

export type NavigationGuard = (to: RouteLocation, from: RouteLocation, next: (payload?: RouteLocationRaw | false) => void) => void;
export type RouteLocationRaw = { name?: string; path?: string };

const RouterSymbol = Symbol("router-lite");
const EmptyView = defineComponent({
  name: "EmptyView",
  setup: () => () => null,
});

// 创建一个简单的哈希历史对象，主要用于语义化
export function createWebHashHistory() {
  return { mode: "hash" };
}

// 创建路由实例
export function createRouter(options: RouterOptions): Router {
  const routeMap = new Map<string, RouteRecord>();
  options.routes.forEach((route) => {
    if (route.name) {
      routeMap.set(`name:${route.name}`, route);
    }
    routeMap.set(`path:${route.path}`, route);
  });

  const guards: NavigationGuard[] = [];

  // 解析哈希路径
  function resolveByPath(path: string): RouteRecord | undefined {
    return routeMap.get(`path:${path}`);
  }

  // 解析路由信息
  function resolve(location: RouteLocationRaw): RouteRecord | undefined {
    if (location.name) {
      return routeMap.get(`name:${location.name}`);
    }
    if (location.path) {
      return resolveByPath(location.path);
    }
    return undefined;
  }

  // 获取当前哈希对应的路由
  function getInitialRoute(): RouteRecord {
    const hashPath = window.location.hash.replace(/^#/, "") || "/";
    const matched = resolve({ path: hashPath }) ?? options.routes[0];
    if (matched.redirect) {
      const target = resolve(matched.redirect);
      return target ?? matched;
    }
    return matched;
  }

  // 路由对象不需要被深度代理，避免组件实例被转成响应式对象
  const currentRoute = shallowRef<RouteLocation>(normalize(getInitialRoute()));

  // 执行守卫并完成跳转
  function runGuardsAndNavigate(target: RouteRecord, replaceState = false) {
    if (target.redirect) {
      const redirected = resolve(target.redirect);
      if (redirected) {
        runGuardsAndNavigate(redirected, replaceState);
        return;
      }
    }

    const to = normalize(target);
    const from = currentRoute.value;

    for (const guard of guards) {
      let redirected: RouteLocationRaw | null = null;
      let blocked = false;
      guard(to, from, (payload) => {
        if (payload === false) {
          blocked = true;
        } else if (payload) {
          redirected = payload;
        }
      });

      if (blocked) {
        return;
      }

      if (redirected) {
        const resolved = resolve(redirected);
        if (resolved) {
          runGuardsAndNavigate(resolved, replaceState);
        }
        return;
      }
    }

    currentRoute.value = to;
    const hash = to.path.startsWith("/") ? `#${to.path}` : `#/${to.path}`;
    if (replaceState) {
      window.location.replace(hash);
    } else {
      window.location.hash = hash;
    }
  }

  // 标准化路由对象
  function normalize(record: RouteRecord): RouteLocation {
    return {
      path: record.path,
      name: record.name,
      meta: record.meta ?? {},
      component: markRaw(record.component ?? EmptyView),
      redirect: record.redirect,
    };
  }

  // hash 变化时同步路由
  function onHashChange() {
    const path = window.location.hash.replace(/^#/, "") || "/";
    const matched = resolve({ path }) ?? options.routes[0];
    runGuardsAndNavigate(matched, true);
  }

  // 安装插件
  function install(app: any) {
    app.provide(RouterSymbol, router);
    app.config.globalProperties.$router = router;
    window.addEventListener("hashchange", onHashChange);
  }

  // 公开 router 实例
  const router: Router = {
    currentRoute,
    beforeEach(guard: NavigationGuard) {
      guards.push(guard);
    },
    push(location: RouteLocationRaw) {
      const matched = resolve(location);
      if (matched) {
        runGuardsAndNavigate(matched, false);
      }
    },
    replace(location: RouteLocationRaw) {
      const matched = resolve(location);
      if (matched) {
        runGuardsAndNavigate(matched, true);
      }
    },
    install,
  };

  return router;
}

// RouterView 组件：渲染当前匹配的组件
export const RouterView = defineComponent({
  name: "RouterViewLite",
  setup() {
    const router = inject<Router>(RouterSymbol)!;
    const activeComponent = computed(() => router.currentRoute.value.component);
    const activeKey = computed(
      () => router.currentRoute.value.name ?? router.currentRoute.value.path,
    );

    // 使用 KeepAlive 保持所有页面的实例状态，避免每次切换都重新刷新
    return () =>
      h(
        KeepAlive,
        null,
        h(activeComponent.value, {
          key: activeKey.value,
        }),
      );
  },
});

// useRouter 辅助函数
export function useRouter(): Router {
  const router = inject<Router>(RouterSymbol);
  if (!router) {
    throw new Error("未找到路由实例，请确保在 app.use(router) 之后调用 useRouter。");
  }
  return router;
}
