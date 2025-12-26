import { mysqlConnectionManager } from "../mysql-connection";

// 插入上传记录
export async function insertUploadRecord(
  filePath: string,
  appAnchorId: string | null,
  fileSize: number,
  fileName: string
) {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return { rowsAffected: 0, lastInsertId: 0 };

  await db.execute(
    `INSERT INTO upload_records (file_path, app_anchor_id, upload_time, file_size, file_name) VALUES (?, ?, ?, ?, ?)`,
    [filePath, appAnchorId, Date.now(), fileSize, fileName]
  );
  return { rowsAffected: 1, lastInsertId: 0 };
}

// 获取所有上传记录
export async function getUploadRecords() {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return [];

  const result = await db.select(
    `SELECT id, file_path, app_anchor_id, upload_time, file_size, file_name FROM upload_records ORDER BY upload_time DESC`
  );
  return result;
}

// 根据app_anchor_id查询记录
export async function getRecordByAnchorId(appAnchorId: string) {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return null;

  const result = await db.select(
    `SELECT id, file_path, app_anchor_id, upload_time, file_size, file_name FROM upload_records WHERE app_anchor_id = ?`,
    [appAnchorId]
  );
  return (result as any[]).length > 0 ? (result as any)[0] : null;
}

// 删除上传记录
export async function deleteUploadRecord(id: number) {
  const db = await mysqlConnectionManager.getDatabase();
  if (!db) return { rowsAffected: 0, lastInsertId: 0 };

  await db.execute(
    `DELETE FROM upload_records WHERE id = ?`,
    [id]
  );
  return { rowsAffected: 1, lastInsertId: 0 };
}