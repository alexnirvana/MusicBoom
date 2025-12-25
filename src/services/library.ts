// 本地音乐与下载记录的数据库封装，统一由此文件管理
import Database from "@tauri-apps/plugin-sql";

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

const DB_URL = "sqlite:musicboom.db";

const INIT_SQLS = [
  `
    CREATE TABLE IF NOT EXISTS local_music (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT NOT NULL,
      size INTEGER NOT NULL,
      path TEXT NOT NULL,
      created TEXT
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
      await migrateDatabase(db);
      return db;
    });
  }
  return dbPromise;
}

// 检查并迁移数据库结构，为现有表添加 created 列
async function migrateDatabase(db: Awaited<ReturnType<typeof Database.load>>) {
  try {
    const tablesToMigrate = ['local_music', 'downloads'];
    for (const tableName of tablesToMigrate) {
      const tables = await db.select<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
      if (tables.length === 0) {
        continue;
      }

      const columns = await db.select<{ name: string }[]>(`PRAGMA table_info(${tableName})`);
      const hasCreatedColumn = columns.some(col => col.name === 'created');
      if (!hasCreatedColumn) {
        await db.execute(`ALTER TABLE ${tableName} ADD COLUMN created TEXT`);
      }
    }
  } catch (error) {
    console.error('数据库迁移失败:', error);
  }
}

export async function upsertLocalSong(record: LocalSongRecord) {
  const db = await getDb();
  await db.execute(
    `REPLACE INTO local_music (id, title, artist, album, size, path, created) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [record.id, record.title, record.artist, record.album, record.size, record.path, record.created || null]
  );
}

export async function listLocalSongs(): Promise<LocalSongRecord[]> {
  const db = await getDb();
  const rows = await db.select<LocalSongRecord[]>(
    `SELECT id, title, artist, album, size, path, created FROM local_music ORDER BY title COLLATE NOCASE`
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

export async function removeDownloadRecords(songIds: string[]) {
  if (!songIds.length) return;
  const db = await getDb();
  const placeholders = songIds.map(() => "?").join(", ");
  await db.execute(`DELETE FROM downloads WHERE song_id IN (${placeholders})`, songIds);
}

export async function removeLocalSongs(ids: string[]) {
  if (!ids.length) return;
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(", ");
  await db.execute(`DELETE FROM local_music WHERE id IN (${placeholders})`, ids);
}

