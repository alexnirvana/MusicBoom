<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from "vue";
import type { TreeOption } from "naive-ui";
import { useMessage } from "naive-ui";
import MainLayout from "../layouts/MainLayout.vue";
import { listOpenlistDirectory, removeOpenlistEntries } from "../api/openlist";
import type { OpenlistFileEntry } from "../api/openlist/list";
import { useOpenlistStore } from "../stores/openlist";
import { useRouter } from "../utils/router-lite";
import OpenlistUploader from "../components/OpenlistUploader.vue";

const router = useRouter();
const message = useMessage();
const { state, ready, clearSession } = useOpenlistStore();

const sessionSignature = computed(
  () => `${state.baseUrl ?? ""}|${state.username ?? ""}|${state.token ?? ""}`,
);

const directoryTree = ref<TreeOption[]>([
  {
    key: "/",
    label: "根目录",
    children: [],
  },
]);
const expandedKeys = ref<Array<string | number>>(["/"]);

// 根目录较多时提供筛选，避免左侧栏视觉拥挤
const rootOptions = ref<{ label: string; value: string }[]>([]);
const activeRoot = ref<string>("/");

// 根据筛选后的根节点裁剪展示树，只保留目标根目录
const displayTree = computed<TreeOption[]>(() => {
  if (activeRoot.value === "/") return directoryTree.value;
  const targetRoot = findTreeNode(directoryTree.value, activeRoot.value);
  if (!targetRoot) return directoryTree.value;
  return [
    {
      key: targetRoot.key,
      label: targetRoot.label,
      children: targetRoot.children,
    },
  ];
});

const files = ref<OpenlistFileEntry[]>([]);
const sortKey = ref<"name" | "type" | "size" | "updated">("updated");
const sortOrder = ref<"asc" | "desc">("desc");
const activeDir = ref("/");
const loading = ref(false);
const deleting = ref(false);
const lastSessionSignature = ref<string | null>(null);
const selectionMode = ref(false);
const selectedPaths = ref<Set<string>>(new Set());
const viewMode = ref<"detail" | "thumb">("detail");
const uploaderVisible = ref(false);

const driveAddress = computed(() => state.baseUrl || "尚未填写地址");
const selectedCount = computed(() => selectedPaths.value.size);
const hasSelection = computed(() => selectedCount.value > 0);
const isLoggedIn = computed(() => Boolean(state.token));
const sortedFiles = computed(() => {
  // 根据排序选项返回新的文件数组，避免原始列表被直接修改
  const list = [...files.value];
  const orderFactor = sortOrder.value === "asc" ? 1 : -1;

  const pickValue = (file: OpenlistFileEntry) => {
    if (sortKey.value === "updated") return file.updatedTime ?? 0;
    if (sortKey.value === "size") return file.sizeValue ?? -1;
    if (sortKey.value === "type") return file.type;
    return file.name;
  };

  return list.sort((a, b) => {
    const aValue = pickValue(a);
    const bValue = pickValue(b);

    if (typeof aValue === "number" && typeof bValue === "number") {
      if (aValue === bValue) return a.name.localeCompare(b.name) * orderFactor;
      return (aValue - bValue) * orderFactor;
    }

    const result = String(aValue).localeCompare(String(bValue));
    if (result === 0) return a.name.localeCompare(b.name) * orderFactor;
    return result * orderFactor;
  });
});

// 递归查找树节点，便于替换其子节点
const findTreeNode = (nodes: TreeOption[], key: string): TreeOption | null => {
  for (const node of nodes) {
    if (node.key === key) return node;
    if (node.children) {
      const found = findTreeNode(node.children, key);
      if (found) return found;
    }
  }
  return null;
};

// 刷新指定目录下的子目录，用真实接口覆盖模拟数据
const updateTreeChildren = (parentKey: string, children: TreeOption[]) => {
  const target = findTreeNode(directoryTree.value, parentKey);
  if (target) {
    target.children = children;
    return true;
  }
  return false;
};

// 计算目录名称，便于为树节点命名
const getDirLabel = (path: string) => {
  const segments = path.split("/").filter(Boolean);
  return segments.length ? segments[segments.length - 1] : "根目录";
};

// 计算祖先路径，便于一次性展开层级较深的目录
const buildAncestorKeys = (path: string) => {
  const normalized = path || "/";
  if (normalized === "/") return ["/"];

  const segments = normalized.split("/").filter(Boolean);
  const keys: string[] = ["/"];
  let current = "";

  for (const segment of segments) {
    current += `/${segment}`;
    keys.push(current);
  }

  return keys;
};

// 若节点不存在则补齐父节点并插入，确保深层路径也能正常展示
const attachToParent = (path: string, children: TreeOption[]) => {
  const normalizedPath = path || "/";
  if (normalizedPath === "/") {
    directoryTree.value = [
      {
        key: "/",
        label: "根目录",
        children,
      },
    ];
    return;
  }

  const segments = normalizedPath.split("/").filter(Boolean);
  const parentKey = segments.length > 1 ? `/${segments.slice(0, -1).join("/")}` : "/";
  const parentNode = findTreeNode(directoryTree.value, parentKey);

  if (parentNode) {
    parentNode.children = parentNode.children || [];
    const existing = parentNode.children.find((child) => child.key === normalizedPath);
    if (existing) {
      existing.children = children;
    } else {
      parentNode.children.push({
        key: normalizedPath,
        label: getDirLabel(normalizedPath),
        children,
      });
    }
  }
};

// 拉取真实网盘目录
const fetchDirectory = async (path: string) => {
  if (!state.token || !state.baseUrl) {
    message.warning("请先登录 OpenList 网盘");
    router.push({ name: "openlist-login" });
    return;
  }

  loading.value = true;
  try {
    const normalizedPath = path || "/";
    const { entries, directories } = await listOpenlistDirectory(
      state.baseUrl,
      state.token,
      normalizedPath
    );

    files.value = entries;
    selectedPaths.value.clear();
    selectionMode.value = false;
    activeDir.value = normalizedPath;
    expandedKeys.value = Array.from(
      new Set([...expandedKeys.value, ...buildAncestorKeys(normalizedPath)]),
    );

    const children = directories.map<TreeOption>((dir) => ({
      key: dir.path,
      label: dir.name,
      children: [],
    }));

    // 记录根目录列表，便于下拉筛选
    if (normalizedPath === "/") {
      rootOptions.value = directories.map((dir) => ({
        label: dir.name,
        value: dir.path,
      }));
    }

    // 确保树节点存在，即使用户手动输入了深层路径
    if (!updateTreeChildren(normalizedPath, children)) {
      attachToParent(normalizedPath, children);
    }
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`获取目录失败：${fallback}`);
  } finally {
    loading.value = false;
  }
};

// 变更根目录筛选时，自动展开所选根目录，避免左侧树被收起
watch(activeRoot, (value) => {
  expandedKeys.value = Array.from(new Set([...expandedKeys.value, value]));
});

// 切换目录时刷新文件列表
const handleDirectorySelect = (keys: Array<string | number>) => {
  const firstKey = keys[0];
  if (typeof firstKey === "string") {
    fetchDirectory(firstKey);
  }
};

// 上传完成后刷新目录，保持文件列表最新
const handleUploadFinished = () => {
  fetchDirectory(activeDir.value);
};

// 打开上传弹窗，需先校验登录状态
const openUploaderDialog = () => {
  if (!state.token || !state.baseUrl) {
    message.warning("请先登录 OpenList 网盘");
    router.push({ name: "openlist-login" });
    return;
  }
  uploaderVisible.value = true;
};

// 关闭上传弹窗
const closeUploaderDialog = () => {
  uploaderVisible.value = false;
};

// 开关批量选择
const toggleSelectionMode = () => {
  selectionMode.value = !selectionMode.value;
  if (!selectionMode.value) {
    selectedPaths.value.clear();
  }
};

// 处理单个文件的选中状态，仅作用于右侧列表
const toggleFileSelection = (file: OpenlistFileEntry) => {
  const current = new Set(selectedPaths.value);
  if (current.has(file.path)) {
    current.delete(file.path);
  } else {
    current.add(file.path);
  }
  selectedPaths.value = current;
};

// 调用删除接口，按当前目录批量删除
const handleRemoveSelected = async () => {
  if (!hasSelection.value) return;

  if (!state.token || !state.baseUrl) {
    message.warning("请先登录 OpenList 网盘");
    router.push({ name: "openlist-login" });
    return;
  }

  const names = files.value
    .filter((item) => selectedPaths.value.has(item.path))
    .map((item) => item.name.replace(/\/$/, ""));

  deleting.value = true;
  try {
    await removeOpenlistEntries(state.baseUrl, state.token, activeDir.value, names);
    message.success("删除成功，正在刷新目录");
    fetchDirectory(activeDir.value);
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    message.error(`删除失败：${fallback}`);
  } finally {
    deleting.value = false;
  }
};

// 切换右侧展示模式
const setViewMode = (mode: "detail" | "thumb") => {
  viewMode.value = mode;
};

// 切换排序字段与方向，默认按更新时间倒序
const toggleSort = (key: "name" | "type" | "size" | "updated") => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
    return;
  }

  sortKey.value = key;
  sortOrder.value = key === "updated" || key === "size" ? "desc" : "asc";
};

// 友好的排序标识，便于用户理解当前排序方式
const renderSortIndicator = (key: "name" | "type" | "size" | "updated") => {
  if (sortKey.value !== key) return "↕";
  return sortOrder.value === "asc" ? "↑" : "↓";
};

// 退出网盘登录并返回登录页
const handleLogout = async () => {
  await clearSession();
  message.info("已退出网盘登录");
  router.push({ name: "openlist-login" });
};

onMounted(async () => {
  await ready;
  if (!state.token) {
    message.warning("请先登录 OpenList 网盘");
    router.push({ name: "openlist-login" });
    return;
  }

  // 登录后立即拉取根目录，确保展示真实文件
  lastSessionSignature.value = sessionSignature.value;
  fetchDirectory("/");
});

onActivated(async () => {
  await ready;
  if (!state.token) {
    message.warning("请先登录 OpenList 网盘");
    router.push({ name: "openlist-login" });
    return;
  }

  const currentSignature = sessionSignature.value;
  if (currentSignature !== lastSessionSignature.value) {
    lastSessionSignature.value = currentSignature;
    fetchDirectory("/");
  }
});
</script>

<template>
  <MainLayout>
    <div class="space-y-4">
      <div class="rounded-2xl border border-white/10 bg-[#0f1320]/70 px-5 py-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="m-0 text-sm text-[#9ab4d8]">OpenList 网盘</p>
            <h1 class="m-0 text-2xl font-semibold text-white">网盘文件</h1>
            <p class="m-0 text-[#c6d2e8]">左侧选择目录，右侧浏览文件列表。</p>
          </div>
          <div class="text-right">
            <p class="m-0 text-xs text-[#9ab4d8]">当前地址</p>
            <p class="m-0 text-white">{{ driveAddress }}</p>
            <p class="m-0 text-xs text-[#9ab4d8]">登录用户：{{ state.username || "未登录" }}</p>
          </div>
        </div>
      </div>

      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0f1320]/70 px-5 py-3"
      >
        <div class="flex flex-wrap items-center gap-3 text-white">
          <n-button secondary :type="selectionMode ? 'info' : 'default'" @click="toggleSelectionMode">
            {{ selectionMode ? "取消批量选择" : "批量选择" }}
          </n-button>
          <n-button v-if="hasSelection" type="error" :loading="deleting" @click="handleRemoveSelected">
            删除
          </n-button>
          <span v-if="selectionMode" class="text-sm text-[#9ab4d8]">已选择 {{ selectedCount }} 项</span>
        </div>

        <div class="flex items-center gap-2 text-sm text-white">
          <span class="text-[#9ab4d8]">显示模式</span>
          <n-button-group size="small">
            <n-button :type="viewMode === 'detail' ? 'primary' : 'default'" @click="setViewMode('detail')">
              详情模式
            </n-button>
            <n-button :type="viewMode === 'thumb' ? 'primary' : 'default'" @click="setViewMode('thumb')">
              缩略图模式
            </n-button>
          </n-button-group>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div class="rounded-2xl border border-white/10 bg-[#0f1320]/70 px-4 py-3">
          <div class="mb-2 flex items-center justify-between text-white">
            <span class="text-sm font-semibold">目录</span>
            <n-tag size="small" type="info">树形</n-tag>
          </div>
          <n-select
            v-model:value="activeRoot"
            class="mb-3"
            size="small"
            :options="[{ label: '全部根目录', value: '/' }, ...rootOptions]"
            placeholder="选择根目录以收起其他目录"
          />
          <div class="max-h-[500px] overflow-y-auto overflow-x-hidden pr-2">
            <n-tree
              block-line
              :data="displayTree"
              :selected-keys="[activeDir]"
              v-model:expanded-keys="expandedKeys"
              @update:selected-keys="handleDirectorySelect"
            />
          </div>
        </div>

        <div class="rounded-2xl border border-white/10 bg-[#0f1320]/70 px-4 py-3">
          <div class="mb-3 flex items-center justify-between text-white">
            <div>
              <p class="m-0 text-sm text-[#9ab4d8]">当前目录</p>
              <h2 class="m-0 text-xl font-semibold">{{ activeDir }}</h2>
            </div>
            <div class="flex items-center gap-2">
              <n-button tertiary type="primary" @click="openUploaderDialog">上传</n-button>
              <n-button
                v-if="!isLoggedIn"
                tertiary
                type="primary"
                @click="router.push({ name: 'openlist-login' })"
              >
                登录
              </n-button>
              <n-button v-else tertiary type="error" @click="handleLogout">退出登录</n-button>
            </div>
          </div>

          <div class="max-h-[500px] overflow-auto rounded-xl border border-white/5">
            <n-spin :show="loading">
              <template v-if="viewMode === 'detail'">
                <div class="overflow-x-auto">
                  <table class="w-full min-w-[480px] text-left text-sm text-[#c6d2e8]">
                    <thead class="bg-white/5 text-xs uppercase tracking-wide text-[#9ab4d8]">
                      <tr>
                        <th v-if="selectionMode" class="px-4 py-3">选择</th>
                        <th class="px-4 py-3">
                          <button
                            class="flex items-center gap-1 text-left font-semibold text-white"
                            type="button"
                            @click="toggleSort('name')"
                          >
                            <span>文件名</span>
                            <span class="text-xs text-[#9ab4d8]">{{ renderSortIndicator('name') }}</span>
                          </button>
                        </th>
                        <th class="px-4 py-3">
                          <button
                            class="flex items-center gap-1 text-left font-semibold text-white"
                            type="button"
                            @click="toggleSort('type')"
                          >
                            <span>类型</span>
                            <span class="text-xs text-[#9ab4d8]">{{ renderSortIndicator('type') }}</span>
                          </button>
                        </th>
                        <th class="px-4 py-3">
                          <button
                            class="flex items-center gap-1 text-left font-semibold text-white"
                            type="button"
                            @click="toggleSort('size')"
                          >
                            <span>大小</span>
                            <span class="text-xs text-[#9ab4d8]">{{ renderSortIndicator('size') }}</span>
                          </button>
                        </th>
                        <th class="px-4 py-3">
                          <button
                            class="flex items-center gap-1 text-left font-semibold text-white"
                            type="button"
                            @click="toggleSort('updated')"
                          >
                            <span>更新日期</span>
                            <span class="text-xs text-[#9ab4d8]">{{ renderSortIndicator('updated') }}</span>
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="file in sortedFiles" :key="file.path" class="border-t border-white/5">
                        <td v-if="selectionMode" class="px-4 py-3">
                          <input
                            class="h-4 w-4 rounded border-white/30 bg-transparent text-blue-500"
                            type="checkbox"
                            :checked="selectedPaths.has(file.path)"
                            @change="toggleFileSelection(file)"
                          />
                        </td>
                        <td class="px-4 py-3 text-white">{{ file.name }}</td>
                        <td class="px-4 py-3">{{ file.type }}</td>
                        <td class="px-4 py-3">{{ file.size }}</td>
                        <td class="px-4 py-3">{{ file.updated }}</td>
                      </tr>
                      <tr v-if="!sortedFiles.length && !loading">
                        <td :colspan="selectionMode ? 5 : 4" class="px-4 py-6 text-center text-[#9ab4d8]">
                          当前目录暂无文件
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>

              <template v-else>
                <div
                  v-if="sortedFiles.length"
                  class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                >
                  <div
                    v-for="file in sortedFiles"
                    :key="file.path"
                    class="relative rounded-xl border border-white/5 bg-white/5 p-3 text-sm text-[#c6d2e8]"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <p class="m-0 text-base font-semibold text-white">{{ file.name }}</p>
                        <p class="m-0 text-xs text-[#9ab4d8]">{{ file.type }}</p>
                      </div>
                      <span class="rounded-full bg-white/10 px-2 py-1 text-[10px] text-white">{{ file.size }}</span>
                    </div>
                    <p class="mt-3 mb-0 text-xs text-[#9ab4d8]">更新：{{ file.updated }}</p>

                    <label
                      v-if="selectionMode"
                      class="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-white"
                    >
                      <input
                        class="h-4 w-4 rounded border-white/30 bg-transparent text-blue-500"
                        type="checkbox"
                        :checked="selectedPaths.has(file.path)"
                        @change="toggleFileSelection(file)"
                      />
                      <span class="text-xs">选择</span>
                    </label>
                  </div>
                </div>
                <div v-else class="p-8 text-center text-[#9ab4d8]">当前目录暂无文件</div>
              </template>
            </n-spin>
          </div>
        </div>
      </div>
    </div>

    <n-modal
      v-model:show="uploaderVisible"
      preset="card"
      title="上传文件"
      :style="{ maxWidth: '780px' }"
      content-style="padding: 0"
      :on-after-leave="closeUploaderDialog"
      :mask-closable="false"
      :close-on-esc="false"
    >
      <OpenlistUploader
        :base-url="state.baseUrl || ''"
        :token="state.token || ''"
        :active-dir="activeDir"
        @uploaded="handleUploadFinished"
      />
    </n-modal>
  </MainLayout>
</template>
