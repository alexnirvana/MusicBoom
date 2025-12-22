import Database from "@tauri-apps/plugin-sql";

// 为所有设置项统一提供 name-value 存储，便于前端与播放器共享
const DB_URL = "sqlite:musicboom.db";
const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS settings (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`;

let dbPromise: Promise<Awaited<ReturnType<typeof Database.load>>> | null = null;

export async function getSettingsDb() {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL).then(async (db) => {
      await db.execute(INIT_SQL);
      return db;
    });
  }
  return dbPromise;
}
