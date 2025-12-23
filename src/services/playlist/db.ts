import Database from "@tauri-apps/plugin-sql";

const DB_URL = "sqlite:musicboom.db";

let dbPromise: Promise<Awaited<ReturnType<typeof Database.load>>> | null = null;

async function migrateDatabase(db: Database) {
  // 检查 playlist_songs 表是否有外键约束
  const tables = await db.select<{ sql: string }[]>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'playlist_songs'`
  );
  
  if (tables.length > 0 && tables[0].sql && !tables[0].sql.includes('REFERENCES')) {
    // 需要迁移数据
    await db.execute(`BEGIN TRANSACTION`);
    try {
      // 重命名旧表
      await db.execute(`ALTER TABLE playlist_songs RENAME TO playlist_songs_old`);
      await db.execute(`ALTER TABLE playlists RENAME TO playlists_old`);
      
      // 创建新表
      await db.execute(`
        CREATE TABLE playlists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL
        )
      `);
      await db.execute(`
        CREATE TABLE playlist_songs (
          playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          song_id TEXT NOT NULL,
          title TEXT NOT NULL,
          artist TEXT NOT NULL,
          album TEXT NOT NULL,
          duration INTEGER NOT NULL,
          size INTEGER,
          PRIMARY KEY (playlist_id, song_id)
        )
      `);
      
      // 迁移数据
      await db.execute(`INSERT INTO playlists SELECT * FROM playlists_old`);
      await db.execute(`INSERT INTO playlist_songs SELECT * FROM playlist_songs_old`);
      
      // 删除旧表
      await db.execute(`DROP TABLE playlist_songs_old`);
      await db.execute(`DROP TABLE playlists_old`);
      
      await db.execute(`COMMIT`);
    } catch (error) {
      await db.execute(`ROLLBACK`).catch(() => {});
      throw error;
    }
  }
}

export async function getPlaylistDb() {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL).then(async (db) => {
      // 设置忙碌超时为5秒
      await db.execute(`PRAGMA busy_timeout = 5000;`);
      
      // 创建基本表结构（如果不存在）
      await db.execute(`
        CREATE TABLE IF NOT EXISTS playlists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL
        )
      `);
      await db.execute(`
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
      `);
      
      // 迁移数据（添加外键约束）
      await migrateDatabase(db);
      
      return db;
    });
  }
  return dbPromise;
}
