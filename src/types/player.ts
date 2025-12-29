import type { FetchSongsOptions, NavidromeSong } from "../api/navidrome";

// 播放模式类型，便于在播放器组件内展示文案
export type PlayMode = "shuffle" | "order" | "single" | "list";

// 播放源类型，用于显示当前播放的是哪种来源的文件
export type PlaySource = "local" | "downloaded" | "cached" | "online";

// 记录用于生成音频流的鉴权信息
export interface PlayAuthContext extends FetchSongsOptions {}

// 播放器的全局状态
export interface PlayerState {
  playlist: NavidromeSong[];
  currentIndex: number;
  mode: PlayMode;
  isPlaying: boolean;
  loading: boolean;
  progress: number;
  duration: number;
  volume: number;
  error: string | null;
  authContext: PlayAuthContext | null;
  playSource: PlaySource;
}

// 便于序列化存储的播放快照结构（不再记录播放进度与时长）
export interface PlaybackSnapshot {
  trackId: string;
  mode: PlayMode;
  volume: number;
  updatedAt: number;
}

// 写入到本地配置文件的播放器持久化信息
export interface PlayerPersistedState {
  mode: PlayMode;
  volume: number;
  snapshot: PlaybackSnapshot | null;
}
