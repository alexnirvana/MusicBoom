// 设置相关的结构体定义，便于各处复用
export interface NavidromeConfig {
  baseUrl: string;
  username: string;
  password: string;
  remember?: boolean;
}

export interface OpenlistConfig {
  baseUrl: string;
  username: string;
  password: string;
  remember?: boolean;
}

export interface DownloadTagOption {
  enableApev2: boolean;
  enableId3v1: boolean;
  enableId3v2: boolean;
  id3v2Version: "2.4" | "2.3";
  charset: "utf8" | "auto" | "iso-8859-1";
}

export interface DownloadSettings {
  musicDir: string;
  organizeByAlbum: boolean;
  downloadLyrics: boolean;
  overwriteExisting: boolean;
  sourcePreference: "latest" | "hifi";
  cacheDir: string;
  speedLimitMode: "auto" | "manual";
  speedLimit: number;
  tags: DownloadTagOption;
}

export interface GeneralSettings {
  closeAction: "minimize" | "exit";
  enableNotifications: boolean;
  setDefaultPlayer: boolean;
}

export interface PlaybackSettings {
  enableCrossfade: boolean;
  crossfadeDuration: number;
}

export interface MysqlConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface MysqlTestResult {
  success: boolean;
  message: string;
}

export interface SettingsState {
  navidrome: NavidromeConfig;
  openlist: OpenlistConfig;
  download: DownloadSettings;
  general: GeneralSettings;
  playback: PlaybackSettings;
}
