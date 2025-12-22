import { requestJson } from "../../utils/request";
import { normalizeOpenlistBaseUrl } from "./utils";

interface RawOpenlistEntry {
  name: string;
  size?: number;
  modified?: string;
  is_dir?: boolean;
}

export interface OpenlistFileEntry {
  name: string;
  type: string;
  size: string;
  updated: string;
  isDir: boolean;
  path: string;
}

export interface OpenlistDirectoryResult {
  entries: OpenlistFileEntry[];
  directories: { name: string; path: string }[];
}

interface OpenlistListResponse {
  data?: { content?: RawOpenlistEntry[] };
  message?: string;
  error?: string;
}

function formatSize(size?: number) {
  if (!size || size <= 0) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let currentSize = size;
  let unitIndex = 0;

  while (currentSize >= 1024 && unitIndex < units.length - 1) {
    currentSize /= 1024;
    unitIndex += 1;
  }

  return `${currentSize.toFixed(currentSize >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function joinPath(parent: string, name: string) {
  if (!parent || parent === "/") return `/${name}`;
  return `${parent}/${name}`;
}

// 拉取指定路径下的真实目录与文件列表
export async function listOpenlistDirectory(
  baseUrl: string,
  token: string,
  path = "/"
): Promise<OpenlistDirectoryResult> {
  const normalizedBaseUrl = normalizeOpenlistBaseUrl(baseUrl);
  const currentPath = path || "/";
  const trimmedToken = token?.trim();

  if (!trimmedToken) {
    throw new Error("未提供 Token，请重新登录后重试");
  }

  const authorization = trimmedToken.replace(/^Bearer\s+/i, "");

  try {
    const payload = await requestJson<OpenlistListResponse>(`${normalizedBaseUrl}/api/fs/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: { path: currentPath, password: "" },
    });

    const rawList: RawOpenlistEntry[] = payload.data?.content || [];
    const entries: OpenlistFileEntry[] = rawList.map((item) => {
      const isDir = Boolean(item.is_dir);
      return {
        name: isDir ? `${item.name}/` : item.name,
        type: isDir ? "文件夹" : "文件",
        size: isDir ? "--" : formatSize(item.size),
        updated: formatDate(item.modified),
        isDir,
        path: joinPath(currentPath, item.name),
      };
    });

    const directories = entries
      .filter((item) => item.isDir)
      .map((dir) => ({ name: dir.name.replace(/\/$/, ""), path: dir.path }));

    return { entries, directories };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`获取目录失败：${reason}`);
  }
}
