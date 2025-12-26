// 本地音乐与下载记录的数据库封装，统一由此文件管理
import { mysqlConnectionManager } from "./mysql-connection";

export interface LocalSongRecord {
  id: string;
  title: string;
  artist: string;
  album: string;
  size: number;
  path: string;
  created?: string;
}

export type DownloadStatus = "pending" | "downloading" | "success" | "failed" | "cancelled";

export interface DownloadRecord {
  songId: string;
  title: string;
  album: string;
  size: number;
  status: DownloadStatus;
  progress: number;
  filePath?: string | null;
  errorMessage?: string | null;
}

export async function upsertLocalSong(record: LocalSongRecord) {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return;
  await db.execute(
    `INSERT INTO local_music (id, title, artist, album, size, path, created) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title=VALUES(title), artist=VALUES(artist), album=VALUES(album), size=VALUES(size), path=VALUES(path), created=VALUES(created)`,
    [record.id, record.title, record.artist, record.album, record.size, record.path, record.created || null]
  );
}

export async function listLocalSongs(): Promise<LocalSongRecord[]> {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return [];
  const rows = await db.select(
    `SELECT id, title, artist, album, size, path, created FROM local_music ORDER BY title COLLATE utf8mb4_unicode_ci`
  );
  return rows as unknown as LocalSongRecord[];
}

export async function upsertDownloadRecord(record: DownloadRecord) {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return;
  await db.execute(
    `INSERT INTO downloads (song_id, title, album, size, status, progress, file_path, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title=VALUES(title), album=VALUES(album), size=VALUES(size), status=VALUES(status), progress=VALUES(progress), file_path=VALUES(file_path), error_message=VALUES(error_message)`,
    [
      record.songId,
      record.title,
      record.album,
      record.size,
      record.status,
      Math.round(record.progress),
      record.filePath || null,
      record.errorMessage || null,
    ]
  );
}

export async function listDownloadRecords(status?: DownloadStatus): Promise<DownloadRecord[]> {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return [];

  if (status) {
    const rows = await db.select(
      `SELECT song_id as songId, title, album, size, status, progress, file_path as filePath, error_message as errorMessage FROM downloads WHERE status = ? ORDER BY title COLLATE utf8mb4_unicode_ci`,
      [status]
    );
    return rows as unknown as DownloadRecord[];
  }

  const rows = await db.select(
    `SELECT song_id as songId, title, album, size, status, progress, file_path as filePath, error_message as errorMessage FROM downloads ORDER BY title COLLATE utf8mb4_unicode_ci`
  );
  return rows as unknown as DownloadRecord[];
}

export async function removeDownloadRecord(songId: string) {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return;
  await db.execute(`DELETE FROM downloads WHERE song_id = ?`, [songId]);
}

export async function removeDownloadRecords(songIds: string[]) {
  if (!songIds.length) return;
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return;
  const placeholders = songIds.map(() => "?").join(", ");
  await db.execute(`DELETE FROM downloads WHERE song_id IN (${placeholders})`, songIds);
}

export async function removeLocalSongs(ids: string[]) {
  if (!ids.length) return;
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return;
  const placeholders = ids.map(() => "?").join(", ");
  await db.execute(`DELETE FROM local_music WHERE id IN (${placeholders})`, ids);
}
