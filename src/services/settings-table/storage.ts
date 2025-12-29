import { getSettingsDb } from "./db";

// 读取单个设置项，返回反序列化后的值，读不到时返回 null
export async function readSetting<T>(name: string): Promise<T | null> {
  try {
    const db = await getSettingsDb();
    if (!db) return null;

    const result = await db.select(
      `SELECT value FROM settings WHERE name = '${name}'`
    );
    if (!result || (result as any[]).length === 0) return null;
    try {
      return JSON.parse((result as any)[0].value) as T;
    } catch (error) {
      console.warn(`设置项 ${name} 解析失败，将返回 null`, error);
      return null;
    }
  } catch (error) {
    console.error("读取设置失败:", error);
    return null;
  }
}

// 写入或更新单个设置项，直接用 JSON 序列化存储
export async function writeSetting(name: string, value: unknown) {
  try {
    const db = await getSettingsDb();
    if (!db) return;

    await db.execute(
      `INSERT INTO settings (name, value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [name, JSON.stringify(value)]
    );
  } catch (error) {
    console.error("写入设置失败:", error);
  }
}
