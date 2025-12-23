import { exists, mkdir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import type { DownloadSettings } from "../types/settings";
import type { NavidromeSong } from "../types/navidrome";

// 处理文件名非法字符，避免写入磁盘时出现异常
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  return cleaned || "未知文件";
}

interface ResolvePathOptions {
  ensureDir?: boolean;
  occupied?: Set<string>;
}

// 为下载任务生成不会冲突的目标路径，自动在同名时追加序号
export async function resolveSongTargetPath(
  song: NavidromeSong,
  settings: DownloadSettings,
  options: ResolvePathOptions = {}
): Promise<string> {
  const downloadDir = settings.musicDir.trim();
  if (!downloadDir) {
    throw new Error("请先在设置中配置下载目录");
  }

  const targetDir = settings.organizeByAlbum
    ? await join(downloadDir, song.album || "未知专辑")
    : downloadDir;

  if (options.ensureDir) {
    await mkdir(targetDir, { recursive: true });
  }

  const used = options.occupied || new Set<string>();
  const baseName = sanitizeFileName(song.title || song.id);
  let index = 1;
  let candidate = await join(targetDir, `${baseName}.mp3`);

  while (used.has(candidate) || (await exists(candidate))) {
    index += 1;
    candidate = await join(targetDir, `${baseName} (${index}).mp3`);
  }

  used.add(candidate);
  return candidate;
}
