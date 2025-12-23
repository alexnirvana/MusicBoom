import type { NavidromeSong } from "../../types/navidrome";
import { getPlaylistDb } from "./db";

export interface PlaylistSummary {
  id: string;
  name: string;
  count: number;
}

export async function listPlaylists(): Promise<PlaylistSummary[]> {
  const db = await getPlaylistDb();
  const rows = await db.select<{ id: number; name: string; count: number }[]>(
    `SELECT p.id as id, p.name as name,
      (SELECT COUNT(1) FROM playlist_songs ps WHERE ps.playlist_id = p.id) as count
     FROM playlists p
     ORDER BY name COLLATE NOCASE`
  );
  return rows.map((row) => ({
    ...row,
    id: String(row.id),
  }));
}

export async function createPlaylist(name: string): Promise<{ id: string }> {
  const db = await getPlaylistDb();
  try {
    await db.execute(`INSERT INTO playlists (name) VALUES (?)`, [name.trim()]);
    const rows = await db.select<{ id: number }[]>(`SELECT last_insert_rowid() as id`);
    const id = rows[0]?.id ?? 0;
    return { id: String(id) };
  } catch (error) {
    throw new Error("歌单名字已存在，请修改");
  }
}

export async function renamePlaylist(id: string, name: string) {
  const db = await getPlaylistDb();
  try {
    await db.execute(`UPDATE playlists SET name = ? WHERE id = ?`, [name.trim(), Number(id)]);
  } catch (_error) {
    throw new Error("歌单名字已存在，请修改");
  }
}

export async function removePlaylist(id: string) {
  const db = await getPlaylistDb();
  try {
    // 启用外键约束和级联删除
    await db.execute(`PRAGMA foreign_keys = ON;`);
    
    // 删除歌单，由于设置了 ON DELETE CASCADE，关联的歌曲会自动删除
    await db.execute(`DELETE FROM playlists WHERE id = ?`, [Number(id)]);
  } catch (error) {
    console.error('删除歌单失败:', error);
    throw new Error('删除歌单失败，请重试');
  }
}

export async function listPlaylistSongs(playlistId: string): Promise<NavidromeSong[]> {
  const db = await getPlaylistDb();
  const rows = await db.select<{
    song_id: string;
    title: string;
    artist: string;
    album: string;
    duration: number;
    size?: number;
  }[]>(
    `SELECT song_id, title, artist, album, duration, size
     FROM playlist_songs
     WHERE playlist_id = ?
     ORDER BY title COLLATE NOCASE`,
    [Number(playlistId)]
  );
  return rows.map((r) => ({
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
  for (const s of songs) {
    await db.execute(
      `INSERT OR REPLACE INTO playlist_songs
       (playlist_id, song_id, title, artist, album, duration, size)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [Number(playlistId), s.id, s.title, s.artist, s.album, s.duration, s.size || null]
    );
  }
}
