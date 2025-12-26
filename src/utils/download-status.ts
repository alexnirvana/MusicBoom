import { exists } from "@tauri-apps/plugin-fs";
import { listDownloadRecords } from "../services/library";
import type { NavidromeSong } from "../types/navidrome";

export interface DownloadStatus {
  isDownloaded: boolean;
  record?: {
    songId: string;
    status: string;
    progress: number;
    filePath?: string | null;
    errorMessage?: string | null;
  };
}

// 检查单个歌曲的下载状态
export async function checkSongDownloadStatus(songId: string): Promise<DownloadStatus> {
  try {
    const records = await listDownloadRecords();
    const record = records.find((r) => r.songId === songId);
    
    if (record && record.status === "success" && record.filePath) {
      // 检查文件是否仍然存在
      try {
        const fileExists = await exists(record.filePath);
        return {
          isDownloaded: fileExists,
          record: fileExists ? record : undefined,
        };
      } catch (error) {
        // 文件检查失败，认为未下载
        console.warn("检查下载文件存在性失败:", error);
        return { isDownloaded: false };
      }
    }
    
    return { isDownloaded: false, record };
  } catch (error) {
    console.error("获取下载记录失败:", error);
    return { isDownloaded: false };
  }
}

// 批量检查歌曲的下载状态
export async function checkSongsDownloadStatus(
  songs: NavidromeSong[]
): Promise<Map<string, DownloadStatus>> {
  const statusMap = new Map<string, DownloadStatus>();
  
  try {
    const records = await listDownloadRecords();
    console.log("[下载状态] 获取到的下载记录数：", records.length);
    records.forEach(record => {
      console.log("[下载状态] 下载记录：", {
        songId: record.songId,
        status: record.status,
        filePath: record.filePath
      });
    });
    const recordMap = new Map(
      records.map((record) => [record.songId, record])
    );
    
    // 并行检查所有歌曲状态
    const statusPromises = songs.map(async (song) => {
      const record = recordMap.get(song.id);
      let isDownloaded = false;
      
      //console.log("[下载状态] 检查歌曲：", song.title, song.id, "记录：", record);
      
      if (record && record.status === "success" && record.filePath) {
        try {
          isDownloaded = await exists(record.filePath);
          //console.log("[下载状态] 文件存在性检查：", record.filePath, isDownloaded);
        } catch (error) {
          console.warn("检查下载文件存在性失败:", error);
          isDownloaded = false;
        }
      }
      
      return {
        songId: song.id,
        status: {
          isDownloaded,
          record: isDownloaded ? record : undefined,
        },
      };
    });
    
    const results = await Promise.all(statusPromises);
    results.forEach(({ songId, status }) => {
      statusMap.set(songId, status);
    });
    
    return statusMap;
  } catch (error) {
    console.error("批量检查下载状态失败:", error);
    // 返回所有歌曲都未下载的状态
    songs.forEach((song) => {
      statusMap.set(song.id, { isDownloaded: false });
    });
    return statusMap;
  }
}

// 过滤出未下载的歌曲
export async function filterUndownloadedSongs(
  songs: NavidromeSong[]
): Promise<NavidromeSong[]> {
  console.log("[下载状态] 开始检查歌曲下载状态，总数：", songs.length);
  const statusMap = await checkSongsDownloadStatus(songs);
  
  const undownloaded = songs.filter((song) => {
    const status = statusMap.get(song.id);
    const isDownloaded = status ? status.isDownloaded : false;
    if (isDownloaded) {
      console.log("[下载状态] 已下载歌曲将被过滤：", song.title, song.id);
    }
    return !isDownloaded;
  });
  
  console.log("[下载状态] 过滤完成，剩余未下载歌曲数：", undownloaded.length);
  return undownloaded;
}