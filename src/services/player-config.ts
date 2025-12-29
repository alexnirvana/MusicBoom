import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { PlayerPersistedState } from "../types/player";

const CONFIG_FILE = "player-state.json";

const DEFAULT_STATE: PlayerPersistedState = {
  mode: "list",
  volume: 1,
  snapshot: null,
};

/**
 * 播放器配置文件管理器，负责读取与写入播放器的本地状态
 */
class PlayerConfigManager {
  private state: PlayerPersistedState = { ...DEFAULT_STATE };
  private initialized = false;

  /**
   * 获取配置文件的完整路径
   */
  private async getConfigPath(): Promise<string> {
    const dataDir = await appDataDir();
    return await join(dataDir, CONFIG_FILE);
  }

  /**
   * 初始化配置，优先读取本地文件，缺失或解析失败则回退为默认值
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const configPath = await this.getConfigPath();
    const fileExists = await exists(configPath);

    if (!fileExists) {
      this.state = { ...DEFAULT_STATE };
      this.initialized = true;
      return;
    }

    try {
      const content = await readTextFile(configPath);
      const parsed = JSON.parse(content) as Partial<PlayerPersistedState>;
      this.state = {
        ...DEFAULT_STATE,
        ...parsed,
        snapshot: parsed?.snapshot ?? null,
      };
    } catch (error) {
      console.warn("读取播放器配置文件失败，已回退为默认值", error);
      this.state = { ...DEFAULT_STATE };
    }

    this.initialized = true;
  }

  /**
   * 获取当前持久化的播放器状态
   */
  getState(): PlayerPersistedState | null {
    if (!this.initialized) return null;
    return {
      ...this.state,
      snapshot: this.state.snapshot ? { ...this.state.snapshot } : null,
    };
  }

  /**
   * 写入播放器状态片段，自动初始化与合并
   */
  async saveState(patch: Partial<PlayerPersistedState>): Promise<void> {
    await this.initialize();
    this.state = {
      ...this.state,
      ...patch,
      snapshot: patch.snapshot === undefined ? this.state.snapshot : patch.snapshot,
    };

    try {
      const configPath = await this.getConfigPath();
      await writeTextFile(configPath, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error("写入播放器配置文件失败:", error);
    }
  }

  /**
   * 判断是否完成初始化
   */
  isReady(): boolean {
    return this.initialized;
  }
}

export const playerConfigManager = new PlayerConfigManager();
