import type { NavidromeSong } from "../../types/navidrome";
import { getPlaylistDb } from "./db";

export interface PlaylistSummary {
  id: number;
  name: string;
  count: number;
}

export async function listPlaylists(): Promise<PlaylistSummary[]> {
  const db = await getPlaylistDb();
  const rows = await db.select<PlaylistSummary[]>(
    `SELECT p.id as id, p.name as name,
      (SELECT COUNT(1) FROM playlist_songs ps WHERE ps.playlist_id = p.id) as count
     FROM playlists p
     ORDER BY name COLLATE NOCASE`
  );
  return rows;
}

export async function createPlaylist(name: string): Promise<{ id: number }> {
  const db = await getPlaylistDb();
  try {
    await db.execute(`INSERT INTO playlists (name) VALUES (?)`, [name.trim()]);
    const rows = await db.select<{ id: number }[]>(`SELECT last_insert_rowid() as id`);
    const id = rows[0]?.id ?? 0;
    return { id };
  } catch (error) {
    throw new Error("歌单名字已存在，请修改");
  }
}

export async function renamePlaylist(id: number, name: string) {
  const db = await getPlaylistDb();
  try {
    await db.execute(`UPDATE playlists SET name = ? WHERE id = ?`, [name.trim(), id]);
  } catch (_error) {
    throw new Error("歌单名字已存在，请修改");
  }
}

export async function removePlaylist(id: number) {
  const db = await getPlaylistDb();
  await db.execute(`DELETE FROM playlist_songs WHERE playlist_id = ?`, [id]);
  await db.execute(`DELETE FROM playlists WHERE id = ?`, [id]);
}

export async function listPlaylistSongs(playlistId: number): Promise<NavidromeSong[]> {
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
    [playlistId]
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

export async function addSongsToPlaylist(playlistId: number, songs: NavidromeSong[]) {
  if (!songs.length) return;
  const db = await getPlaylistDb();
  for (const s of songs) {
    await db.execute(
      `INSERT OR REPLACE INTO playlist_songs
       (playlist_id, song_id, title, artist, album, duration, size)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [playlistId, s.id, s.title, s.artist, s.album, s.duration, s.size || null]
    );
  }
}
