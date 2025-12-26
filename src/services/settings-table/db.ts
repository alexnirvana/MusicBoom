import { mysqlConnectionManager } from "../mysql-connection";

export async function getSettingsDb() {
  return await mysqlConnectionManager.getDatabase();
}
