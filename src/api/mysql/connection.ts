import  Database from "@tauri-apps/plugin-sql";
import type { MysqlConfig, MysqlTestResult } from "../../types/settings";

export async function testMysqlConnection(
  config: MysqlConfig
): Promise<MysqlTestResult> {
  try {
    const databaseUrl = `mysql://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}`;
    const db = await Database.load(databaseUrl);
    await db.close();
    return { success: true, message: "MySQL连接成功" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `连接失败: ${errorMessage}` };
  }
}
