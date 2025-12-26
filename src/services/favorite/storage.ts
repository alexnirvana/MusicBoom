import type { FavoriteRow } from "../../types/favorite";
import { mysqlConnectionManager } from "../mysql-connection";

// 读取全部收藏，用于展示或初始化页面状态
export async function listFavorites(): Promise<FavoriteRow[]> {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return [];

  const result = await db.select(
    `SELECT song_id as songId, title, artist, album, duration, created FROM favorites ORDER BY title COLLATE utf8mb4_unicode_ci`
  );
  return result as unknown as FavoriteRow[];
}

// 根据主键判断是否收藏
export async function isFavorite(songId: string): Promise<boolean> {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return false;

  const result = await db.select(
    `SELECT COUNT(1) as count FROM favorites WHERE song_id = ?`,
    [songId]
  );
  return Boolean((result as any)[0]?.count);
}

// 新增或更新收藏记录
export async function addFavorite(row: FavoriteRow) {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return;

  await db.execute(
    `INSERT INTO favorites (song_id, title, artist, album, duration, created)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title=VALUES(title), artist=VALUES(artist), album=VALUES(album), duration=VALUES(duration), created=VALUES(created)`,
    [row.songId, row.title, row.artist, row.album, row.duration, row.created || null]
  );
}

// 取消收藏
export async function removeFavorite(songId: string) {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return;

  await db.execute(
    `DELETE FROM favorites WHERE song_id = ?`,
    [songId]
  );
}
