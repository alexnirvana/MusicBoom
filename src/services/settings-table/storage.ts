import type { SettingRow } from "../../types/settings-table";
import { getSettingsDb } from "./db";

// 读取单个设置项，返回反序列化后的值，读不到时返回 null
export async function readSetting<T>(name: string): Promise<T | null> {
  const db = await getSettingsDb();
  const rows = await db.select<SettingRow[]>(
    "SELECT value FROM settings WHERE name = $1",
    [name]
  );
  if (!rows || rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].value) as T;
  } catch (error) {
    console.warn(`设置项 ${name} 解析失败，将返回 null`, error);
    return null;
  }
}

// 写入或更新单个设置项，直接用 JSON 序列化存储
export async function writeSetting(name: string, value: unknown) {
  const db = await getSettingsDb();
  await db.execute(
    `INSERT INTO settings (name, value)
     VALUES ($1, $2)
     ON CONFLICT(name) DO UPDATE SET value = excluded.value`,
    [name, JSON.stringify(value)]
  );
}
