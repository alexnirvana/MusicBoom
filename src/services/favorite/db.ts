import Database from "@tauri-apps/plugin-sql";

// 收藏表仅在 Tauri 环境下使用 SQLite 存储，方便跨页面读取
const DB_URL = "sqlite:musicboom.db";
const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS favorites (
    song_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT NOT NULL,
    duration INTEGER NOT NULL,
    created TEXT
  )
`;

// 检查并迁移数据库结构，为现有表添加 created 列
async function migrateDatabase(db: Awaited<ReturnType<typeof Database.load>>) {
  try {
    const tables = await db.select<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type='table' AND name='favorites'`);
    if (tables.length === 0) {
      return;
    }

    const columns = await db.select<{ name: string }[]>(`PRAGMA table_info(favorites)`);
    const hasCreatedColumn = columns.some(col => col.name === 'created');
    if (!hasCreatedColumn) {
      await db.execute(`ALTER TABLE favorites ADD COLUMN created TEXT`);
    }
  } catch (error) {
    console.error('数据库迁移失败:', error);
  }
}

let dbPromise: Promise<Awaited<ReturnType<typeof Database.load>>> | null = null;

export async function getFavoriteDb() {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL).then(async (db) => {
      await db.execute(INIT_SQL);
      await migrateDatabase(db);
      return db;
    });
  }
  return dbPromise;
}
