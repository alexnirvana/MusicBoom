import { appDataDir, join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";
import type { NavidromeConfig } from "../types/settings";

const CONFIG_FILE = "navidrome-config.json";

/**
 * 默认 Navidrome 配置
 */
const DEFAULT_CONFIG: NavidromeConfig = {
  baseUrl: "http://",
  username: "",
  password: "",
  remember: false,
};

/**
 * Navidrome 配置管理器
 */
class NavidromeConfigManager {
  private config: NavidromeConfig | null = null;
  private initialized = false;

  /**
   * 获取配置文件路径
   */
  private async getConfigPath(): Promise<string> {
    const dataDir = await appDataDir();
    return await join(dataDir, CONFIG_FILE);
  }

  /**
   * 初始化：读取配置文件，不存在则创建默认配置
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const configPath = await this.getConfigPath();
    const fileExists = await exists(configPath);

    if (!fileExists) {
      // 配置文件不存在，使用默认配置
      this.config = { ...DEFAULT_CONFIG };
      console.log("Navidrome 配置文件不存在，使用默认配置");
    } else {
      // 读取现有配置
      try {
        const content = await readTextFile(configPath);
        const parsed = JSON.parse(content);
        this.config = {
          baseUrl: parsed.baseUrl || DEFAULT_CONFIG.baseUrl,
          username: parsed.username || DEFAULT_CONFIG.username,
          password: parsed.password || DEFAULT_CONFIG.password,
          remember: parsed.remember ?? DEFAULT_CONFIG.remember,
        };
        console.log("已加载 Navidrome 配置:", { ...this.config, password: "***" });
      } catch (error) {
        console.error("读取 Navidrome 配置文件失败:", error);
        // 读取失败时使用默认配置
        this.config = { ...DEFAULT_CONFIG };
      }
    }

    this.initialized = true;
  }

  /**
   * 获取当前 Navidrome 配置
   */
  getConfig(): NavidromeConfig | null {
    return this.config ? { ...this.config } : null;
  }

  /**
   * 保存 Navidrome 配置
   */
  async saveConfig(config: Partial<NavidromeConfig>): Promise<void> {
    if (!this.config) {
      this.config = { ...DEFAULT_CONFIG };
    }

    // 更新配置
    this.config = {
      ...this.config,
      ...config,
    };

    try {
      const configPath = await this.getConfigPath();
      await writeTextFile(configPath, JSON.stringify(this.config, null, 2));
      console.log("已保存 Navidrome 配置:", { ...this.config, password: "***" });
    } catch (error) {
      console.error("保存 Navidrome 配置文件失败:", error);
      throw new Error("保存配置文件失败:"+error);
    }
  }

  /**
   * 检查配置是否已初始化
   */
  isReady(): boolean {
    return this.initialized && this.config !== null;
  }

  /**
   * 检查配置是否完整（用于登录前验证）
   */
  isComplete(): boolean {
    return !!(
      this.config?.baseUrl &&
      this.config?.baseUrl.trim() !== "http://" &&
      this.config?.username &&
      this.config?.password
    );
  }
}

// 导出单例
export const navidromeConfigManager = new NavidromeConfigManager();
