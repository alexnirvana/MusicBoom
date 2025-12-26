import { appDataDir, join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";

export interface PathConfig {
  musicDir: string;
  cacheDir: string;
}

const CONFIG_FILE = "path-config.json";

const DEFAULT_CONFIG: PathConfig = {
  musicDir: "",
  cacheDir: "",
};

class PathConfigManager {
  private config: PathConfig | null = null;
  private initialized = false;
  private listeners: Set<() => void> = new Set();

  private async getConfigPath(): Promise<string> {
    const dataDir = await appDataDir();
    return await join(dataDir, CONFIG_FILE);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const configPath = await this.getConfigPath();
    const fileExists = await exists(configPath);

    if (!fileExists) {
      this.config = { ...DEFAULT_CONFIG };
      console.log("路径配置文件不存在，使用默认配置");
    } else {
      try {
        const content = await readTextFile(configPath);
        const parsed = JSON.parse(content);
        this.config = {
          musicDir: parsed.musicDir || DEFAULT_CONFIG.musicDir,
          cacheDir: parsed.cacheDir || DEFAULT_CONFIG.cacheDir,
        };
        console.log("已加载路径配置:", this.config);
      } catch (error) {
        console.error("读取路径配置文件失败:", error);
        this.config = { ...DEFAULT_CONFIG };
      }
    }

    this.initialized = true;
  }

  getConfig(): PathConfig | null {
    return this.config ? { ...this.config } : null;
  }

  async saveConfig(config: Partial<PathConfig>): Promise<void> {
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
      console.log("已保存路径配置:", this.config);
      // 通知所有监听器配置已更新
      this.notifyListeners();
    } catch (error) {
      console.error("保存路径配置文件失败:", error);
      throw new Error("保存配置文件失败");
    }
  }

  /**
   * 注册配置更新监听器
   */
  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    // 返回取消监听的函数
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    this.listeners.forEach(callback => callback());
  }

  isReady(): boolean {
    return this.initialized && this.config !== null;
  }
}

export const pathConfigManager = new PathConfigManager();
