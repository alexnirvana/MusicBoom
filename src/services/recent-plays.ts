import type { NavidromeSong } from "../types/navidrome";
import { mysqlConnectionManager } from "./mysql-connection";

// 最近播放记录的结构，包含播放时间戳，便于排序与展示
export interface RecentPlayRow {
  songId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  created?: string | null;
  coverUrl?: string | null;
  lastPlayed: number;
}

// 记录单首歌曲的播放，重复播放会更新 lastPlayed 并移动到最前
// 返回 true 代表写入成功，false 代表数据库不可用
export async function recordRecentPlay(song: NavidromeSong): Promise<boolean> {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return false;

  const now = Date.now();
  await db.execute(
    `INSERT INTO recent_plays (song_id, title, artist, album, duration, created, cover_url, last_played)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title=VALUES(title),
       artist=VALUES(artist),
       album=VALUES(album),
       duration=VALUES(duration),
       created=VALUES(created),
       cover_url=VALUES(cover_url),
       last_played=VALUES(last_played)`,
    [
      song.id,
      song.title,
      song.artist,
      song.album,
      song.duration,
      song.created || null,
      song.coverUrl || null,
      now,
    ]
  );

  // 仅保留最近 500 首，超出部分按 last_played 倒序删除
  await db.execute(`
    DELETE FROM recent_plays
    WHERE song_id NOT IN (
      SELECT song_id FROM (
        SELECT song_id FROM recent_plays ORDER BY last_played DESC LIMIT 500
      ) AS latest
    )
  `);
  return true;
}

// 读取最近播放列表，默认最多返回 500 条，按播放时间倒序排列
export async function listRecentPlays(limit = 500): Promise<RecentPlayRow[]> {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return [];

  const finalLimit = Math.max(1, Math.min(limit, 500));
  const rows = await db.select(
    `SELECT
       song_id AS songId,
       title,
       artist,
       album,
       duration,
       created,
       cover_url AS coverUrl,
       last_played AS lastPlayed
     FROM recent_plays
     ORDER BY last_played DESC
     LIMIT ${finalLimit}`
  );
  return rows as unknown as RecentPlayRow[];
}
