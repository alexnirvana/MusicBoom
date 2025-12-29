import type { NavidromeSong } from "../types/navidrome";
import { mysqlConnectionManager } from "./mysql-connection";

// 基础评分记录结构，便于在表格展示中直接映射歌曲字段
export interface RatingRankRow {
  songId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  created?: string | null;
  coverUrl?: string | null;
  rating: number;
  updatedAt: number;
}

export interface RatingValue {
  songId: string;
  rating: number;
}

// 写入或更新评分，允许传入 0 清空评分
export async function setSongRating(song: NavidromeSong, rating: number): Promise<void> {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) {
    throw new Error("MySQL 连接不可用，无法保存评分");
  }

  const now = Date.now();
  const normalized = Math.max(0, Math.min(5, Math.round(rating)));

  if (normalized <= 0) {
    await db.execute("DELETE FROM ratings WHERE song_id = ?", [song.id]);
    return;
  }

  await db.execute(
    `INSERT INTO ratings (
       song_id, title, artist, album, duration, created, cover_url, rating, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title=VALUES(title),
       artist=VALUES(artist),
       album=VALUES(album),
       duration=VALUES(duration),
       created=VALUES(created),
       cover_url=VALUES(cover_url),
       rating=VALUES(rating),
       updated_at=VALUES(updated_at)`,
    [
      song.id,
      song.title,
      song.artist,
      song.album,
      song.duration,
      song.created || null,
      song.coverUrl || null,
      normalized,
      now,
    ]
  );
}

// 读取全部评分值，供组件快速构建歌曲 ID 到评分的映射
export async function listRatingValues(): Promise<RatingValue[]> {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return [];

  const rows = await db.select(`
    SELECT
      song_id AS songId,
      rating
    FROM ratings
  `);
  return rows as unknown as RatingValue[];
}

// 读取评分排行，按评分倒序，评分相同按更新时间倒序
export async function listTopRated(limit = 200): Promise<RatingRankRow[]> {
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
       rating,
       updated_at AS updatedAt
     FROM ratings
     ORDER BY rating DESC, updated_at DESC
     LIMIT ${finalLimit}`
  );
  return rows as unknown as RatingRankRow[];
}
