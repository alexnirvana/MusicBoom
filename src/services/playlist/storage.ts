import type { NavidromeSong } from "../../types/navidrome";
import { getPlaylistDb } from "./db";

export interface PlaylistSummary {
  id: string;
  name: string;
  count: number;
}

export async function listPlaylists(): Promise<PlaylistSummary[]> {
  const db = await getPlaylistDb();
  if (!db) return [];

  const result = await db.select(
    `SELECT p.id as id, p.name as name,
      (SELECT COUNT(1) FROM playlist_songs ps WHERE ps.playlist_id = p.id) as count
     FROM playlists p
     ORDER BY name COLLATE utf8mb4_unicode_ci`
  );
  return (result as any[]).map((row: any) => ({
    ...row,
    id: String(row.id),
  }));
}

export async function createPlaylist(name: string): Promise<{ id: string }> {
  const db = await getPlaylistDb();
  if (!db) throw new Error("MySQL连接未初始化");

  try {
    await db.execute(`INSERT INTO playlists (name) VALUES (?)`, [name.trim()]);
    const result = await db.select(`SELECT LAST_INSERT_ID() as id`);
    const id = (result as any[])[0]?.id ?? 0;
    return { id: String(id) };
  } catch (error) {
    throw new Error("歌单名字已存在，请修改");
  }
}

export async function renamePlaylist(id: string, name: string) {
  const db = await getPlaylistDb();
  if (!db) return;

  try {
    await db.execute(`UPDATE playlists SET name = ? WHERE id = ?`, [name.trim(), Number(id)]);
  } catch (_error) {
    throw new Error("歌单名字已存在，请修改");
  }
}

export async function removePlaylist(id: string) {
  const db = await getPlaylistDb();
  if (!db) return;

  try {
    await db.execute(`DELETE FROM playlists WHERE id = ?`, [Number(id)]);
  } catch (error) {
    console.error('删除歌单失败:', error);
    throw new Error('删除歌单失败，请重试');
  }
}

export async function listPlaylistSongs(playlistId: string): Promise<NavidromeSong[]> {
  const db = await getPlaylistDb();
  if (!db) return [];

  const result = await db.select(
    `SELECT song_id, title, artist, album, duration, size
     FROM playlist_songs
     WHERE playlist_id = ?
     ORDER BY title COLLATE utf8mb4_unicode_ci`,
    [Number(playlistId)]
  );
  return (result as any[]).map((r: any) => ({
    id: r.song_id,
    title: r.title,
    artist: r.artist,
    album: r.album,
    duration: r.duration,
    size: r.size,
  }));
}

export async function addSongsToPlaylist(playlistId: string, songs: NavidromeSong[]) {
  if (!songs.length) return;
  const db = await getPlaylistDb();
  if (!db) return;

  for (const s of songs) {
    await db.execute(
      `INSERT INTO playlist_songs
       (playlist_id, song_id, title, artist, album, duration, size)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title=VALUES(title), artist=VALUES(artist), album=VALUES(album), duration=VALUES(duration), size=VALUES(size)`,
      [Number(playlistId), s.id, s.title, s.artist, s.album, s.duration, s.size || null]
    );
  }
}
