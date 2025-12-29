import Database from "@tauri-apps/plugin-sql";
import type { MysqlConfig } from "../types/settings";
import { mysqlConfigManager } from "./mysql-config";

/**
 * MySQL连接管理器
 */
class MySqlConnectionManager {
  private initialized = false;
  private initializing = false;
  private db: Awaited<ReturnType<typeof Database.load>> | null = null;

  /**
   * 初始化MySQL连接
   */
  async initialize(config: MysqlConfig): Promise<void> {
    if (this.initialized || this.initializing) {
      return;
    }

    this.initializing = true;

    const databaseUrl = `mysql://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}`;

    try {
      // 加载数据库连接
      this.db = await Database.load(databaseUrl);

      // 初始化数据库表
      await this.initTables();

      this.initialized = true;
    } catch (error) {
      console.error("MySQL连接失败:", error);
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * 确保MySQL连接已初始化（自动从配置文件读取）
   */
  async ensureInitialized(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    // 先初始化配置管理器
    await mysqlConfigManager.initialize();

    // 尝试从配置文件读取并初始化
    const config = mysqlConfigManager.getConfig();
    if (!config || !config.host || !config.database || !config.username) {
      console.warn("MySQL 配置不完整，无法初始化连接");
      return false;
    }

    try {
      await this.initialize(config);
      console.log("MySQL 连接已根据配置文件自动初始化");
      return true;
    } catch (error) {
      console.error("MySQL 自动初始化失败:", error);
      return false;
    }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取数据库实例（会自动尝试初始化）
   */
  async getDatabase(): Promise<Awaited<ReturnType<typeof Database.load>> | null> {
    await this.ensureInitialized();
    return this.db;
  }

  /**
   * 初始化MySQL数据库表
   */
  private async initTables(): Promise<void> {
    if (!this.db) return;

    // 创建设置表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        name VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建上传记录表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS upload_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_path TEXT NOT NULL,
        app_anchor_id TEXT,
        upload_time BIGINT NOT NULL,
        file_size BIGINT NOT NULL,
        file_name TEXT NOT NULL,
        INDEX idx_upload_time (upload_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建播放列表表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS playlists (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建播放列表歌曲表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS playlist_songs (
        playlist_id INT NOT NULL,
        song_id VARCHAR(255) NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        duration INT NOT NULL,
        size BIGINT,
        PRIMARY KEY (playlist_id, song_id),
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        INDEX idx_song_id (song_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建收藏表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS favorites (
        song_id VARCHAR(255) PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        duration INT NOT NULL,
        created TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建本地音乐表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS local_music (
        id VARCHAR(255) PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        size BIGINT NOT NULL,
        path TEXT NOT NULL,
        created TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建下载记录表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS downloads (
        song_id VARCHAR(255) PRIMARY KEY,
        title TEXT NOT NULL,
        album TEXT NOT NULL,
        size BIGINT NOT NULL,
        status VARCHAR(50) NOT NULL,
        progress INT NOT NULL,
        file_path TEXT,
        error_message TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建最近播放表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS recent_plays (
        song_id VARCHAR(255) PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        duration INT NOT NULL,
        created TEXT,
        cover_url TEXT,
        last_played BIGINT NOT NULL,
        INDEX idx_last_played (last_played)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  /**
   * 执行查询
   */
  async query(sql: string, params: any[] = []) {
    if (!this.db) {
      throw new Error("MySQL连接未初始化");
    }
    return this.db.select(sql, params);
  }

  /**
   * 执行命令
   */
  async execute(sql: string, params: any[] = []) {
    if (!this.db) {
      throw new Error("MySQL连接未初始化");
    }
    return this.db.execute(sql, params);
  }
}

// 导出单例
export const mysqlConnectionManager = new MySqlConnectionManager();
