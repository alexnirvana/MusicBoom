import Database from "@tauri-apps/plugin-sql";

// 收藏表仅在 Tauri 环境下使用 SQLite 存储，方便跨页面读取
const DB_URL = "sqlite:musicboom.db";
const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS favorites (
    song_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT NOT NULL,
    duration INTEGER NOT NULL
  )
`;

let dbPromise: Promise<Awaited<ReturnType<typeof Database.load>>> | null = null;

export async function getFavoriteDb() {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL).then(async (db) => {
      await db.execute(INIT_SQL);
      return db;
    });
  }
  return dbPromise;
}
