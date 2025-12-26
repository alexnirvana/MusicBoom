import { mysqlConnectionManager } from "../mysql-connection";

export async function getPlaylistDb() {
  return await mysqlConnectionManager.getDatabase();
}
