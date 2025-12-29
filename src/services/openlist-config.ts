import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { OpenlistConfig } from "../types/settings";

// OpenList 配置文件名称
const CONFIG_FILE = "openlist-config.json";

// 默认 OpenList 配置，便于在文件不存在时回退
const DEFAULT_CONFIG: OpenlistConfig = {
  baseUrl: "http://",
  username: "",
  password: "",
  remember: false,
};

/**
 * OpenList 配置管理器
 */
class OpenlistConfigManager {
  private config: OpenlistConfig | null = null;
  private initialized = false;

  /**
   * 获取配置文件的绝对路径
   */
  private async getConfigPath(): Promise<string> {
    const dataDir = await appDataDir();
    return await join(dataDir, CONFIG_FILE);
  }

  /**
   * 初始化配置：尝试读取配置文件，读取失败时使用默认值
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const configPath = await this.getConfigPath();
    const fileExists = await exists(configPath);

    if (!fileExists) {
      this.config = { ...DEFAULT_CONFIG };
      console.log("OpenList 配置文件不存在，使用默认配置");
    } else {
      try {
        const content = await readTextFile(configPath);
        const parsed = JSON.parse(content);
        this.config = {
          baseUrl: parsed.baseUrl || DEFAULT_CONFIG.baseUrl,
          username: parsed.username || DEFAULT_CONFIG.username,
          password: parsed.password || DEFAULT_CONFIG.password,
          remember: parsed.remember ?? DEFAULT_CONFIG.remember,
        };
        console.log("已加载 OpenList 配置:", { ...this.config, password: "***" });
      } catch (error) {
        console.error("读取 OpenList 配置文件失败:", error);
        this.config = { ...DEFAULT_CONFIG };
      }
    }

    this.initialized = true;
  }

  /**
   * 获取当前配置，返回副本避免外部直接修改
   */
  getConfig(): OpenlistConfig | null {
    return this.config ? { ...this.config } : null;
  }

  /**
   * 保存配置到本地文件
   */
  async saveConfig(config: Partial<OpenlistConfig>): Promise<void> {
    if (!this.config) {
      this.config = { ...DEFAULT_CONFIG };
    }

    this.config = {
      ...this.config,
      ...config,
    };

    try {
      const configPath = await this.getConfigPath();
      await writeTextFile(configPath, JSON.stringify(this.config, null, 2));
      console.log("已保存 OpenList 配置:", { ...this.config, password: "***" });
    } catch (error) {
      console.error("保存 OpenList 配置文件失败:", error);
      throw new Error("保存配置文件失败");
    }
  }

  /**
   * 检查配置是否已初始化
   */
  isReady(): boolean {
    return this.initialized && this.config !== null;
  }
}

export const openlistConfigManager = new OpenlistConfigManager();
