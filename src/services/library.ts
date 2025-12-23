// 本地音乐与下载记录的数据库封装，统一由此文件管理
import Database from "@tauri-apps/plugin-sql";

export interface LocalSongRecord {
  id: string;
  title: string;
  artist: string;
  album: string;
  size: number;
  path: string;
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

const DB_URL = "sqlite:musicboom.db";

const INIT_SQLS = [
  `
    CREATE TABLE IF NOT EXISTS local_music (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT NOT NULL,
      size INTEGER NOT NULL,
      path TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS downloads (
      song_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      album TEXT NOT NULL,
      size INTEGER NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL,
      file_path TEXT,
      error_message TEXT
    )
  `,
];

let dbPromise: Promise<Awaited<ReturnType<typeof Database.load>>> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL).then(async (db) => {
      for (const sql of INIT_SQLS) {
        await db.execute(sql);
      }
      return db;
    });
  }
  return dbPromise;
}

export async function upsertLocalSong(record: LocalSongRecord) {
  const db = await getDb();
  await db.execute(
    `REPLACE INTO local_music (id, title, artist, album, size, path) VALUES (?, ?, ?, ?, ?, ?)`,
    [record.id, record.title, record.artist, record.album, record.size, record.path]
  );
}

export async function listLocalSongs(): Promise<LocalSongRecord[]> {
  const db = await getDb();
  const rows = await db.select<LocalSongRecord[]>(
    `SELECT id, title, artist, album, size, path FROM local_music ORDER BY title COLLATE NOCASE`
  );
  return rows;
}

export async function upsertDownloadRecord(record: DownloadRecord) {
  const db = await getDb();
  await db.execute(
    `REPLACE INTO downloads (song_id, title, album, size, status, progress, file_path, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
  const db = await getDb();
  if (status) {
    const rows = await db.select<DownloadRecord[]>(
      `SELECT song_id as songId, title, album, size, status, progress, file_path as filePath, error_message as errorMessage FROM downloads WHERE status = ? ORDER BY title COLLATE NOCASE`,
      [status]
    );
    return rows;
  }

  const rows = await db.select<DownloadRecord[]>(
    `SELECT song_id as songId, title, album, size, status, progress, file_path as filePath, error_message as errorMessage FROM downloads ORDER BY title COLLATE NOCASE`
  );
  return rows;
}

export async function removeDownloadRecord(songId: string) {
  const db = await getDb();
  await db.execute(`DELETE FROM downloads WHERE song_id = ?`, [songId]);
}

