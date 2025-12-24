import Database from "@tauri-apps/plugin-sql";

// 上传记录表，用于跟踪上传到OpenList的文件
const DB_URL = "sqlite:musicboom.db";
const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS upload_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    app_anchor_id TEXT,
    upload_time INTEGER NOT NULL,
    file_size INTEGER NOT NULL,
    file_name TEXT NOT NULL
  )
`;

let dbPromise: Promise<Awaited<ReturnType<typeof Database.load>>> | null = null;

export async function getUploadDb() {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL).then(async (db) => {
      await db.execute(INIT_SQL);
      return db;
    });
  }
  return dbPromise;
}

// 插入上传记录
export async function insertUploadRecord(
  filePath: string,
  appAnchorId: string | null,
  fileSize: number,
  fileName: string
) {
  const db = await getUploadDb();
  const uploadTime = Date.now();
  
  const result = await db.execute(
    `INSERT INTO upload_records (file_path, app_anchor_id, upload_time, file_size, file_name) 
     VALUES ($1, $2, $3, $4, $5)`,
    [filePath, appAnchorId, uploadTime, fileSize, fileName]
  ) as { rowsAffected: number; lastInsertId: number };
  
  return result;
}

// 获取所有上传记录
export async function getUploadRecords() {
  const db = await getUploadDb();
  
  const result = await db.select(
    `SELECT id, file_path, app_anchor_id, upload_time, file_size, file_name 
     FROM upload_records 
     ORDER BY upload_time DESC`
  ) as Array<{
    id: number;
    file_path: string;
    app_anchor_id: string | null;
    upload_time: number;
    file_size: number;
    file_name: string;
  }>;
  
  return result;
}

// 根据app_anchor_id查询记录
export async function getRecordByAnchorId(appAnchorId: string) {
  const db = await getUploadDb();
  
  const result = await db.select(
    `SELECT id, file_path, app_anchor_id, upload_time, file_size, file_name 
     FROM upload_records 
     WHERE app_anchor_id = $1`,
    [appAnchorId]
  ) as Array<{
    id: number;
    file_path: string;
    app_anchor_id: string | null;
    upload_time: number;
    file_size: number;
    file_name: string;
  }>;
  
  return result.length > 0 ? result[0] : null;
}

// 删除上传记录
export async function deleteUploadRecord(id: number) {
  const db = await getUploadDb();
  
  const result = await db.execute(
    `DELETE FROM upload_records WHERE id = $1`,
    [id]
  ) as { rowsAffected: number; lastInsertId: number };
  
  return result;
}