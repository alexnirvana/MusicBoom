import Database from "@tauri-apps/plugin-sql";

const DB_URL = "sqlite:musicboom.db";

const INIT_SQLS = [
  `
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlist_id INTEGER NOT NULL,
      song_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT NOT NULL,
      duration INTEGER NOT NULL,
      size INTEGER,
      PRIMARY KEY (playlist_id, song_id)
    )
  `,
];

let dbPromise: Promise<Awaited<ReturnType<typeof Database.load>>> | null = null;

export async function getPlaylistDb() {
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
