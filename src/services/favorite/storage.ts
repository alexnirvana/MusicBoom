import type { FavoriteRow } from "../../types/favorite";
import { getFavoriteDb } from "./db";

// 读取全部收藏，用于展示或初始化页面状态
export async function listFavorites(): Promise<FavoriteRow[]> {
  const db = await getFavoriteDb();
  return db.select<FavoriteRow[]>(
    `SELECT song_id as songId, title, artist, album, duration, created FROM favorites ORDER BY title`
  );
}

// 根据主键判断是否收藏
export async function isFavorite(songId: string): Promise<boolean> {
  const db = await getFavoriteDb();
  const rows = await db.select<{ count: number }[]>(
    "SELECT COUNT(1) as count FROM favorites WHERE song_id = $1",
    [songId]
  );
  return Boolean(rows[0]?.count);
}

// 新增或更新收藏记录
export async function addFavorite(row: FavoriteRow) {
  const db = await getFavoriteDb();
  await db.execute(
    `INSERT INTO favorites (song_id, title, artist, album, duration, created)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(song_id) DO UPDATE SET title = excluded.title, artist = excluded.artist, album = excluded.album, duration = excluded.duration, created = excluded.created`,
    [row.songId, row.title, row.artist, row.album, row.duration, row.created || null]
  );
}

// 取消收藏
export async function removeFavorite(songId: string) {
  const db = await getFavoriteDb();
  await db.execute("DELETE FROM favorites WHERE song_id = $1", [songId]);
}
