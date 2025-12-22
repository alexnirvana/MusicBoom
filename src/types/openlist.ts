// OpenList 网盘相关类型定义，便于登录与存储复用
export interface OpenlistLoginPayload {
  baseUrl: string;
  username: string;
  password: string;
}

export interface OpenlistLoginSuccess {
  token: string;
  username: string;
}

export interface OpenlistSessionState {
  baseUrl: string | null;
  token: string | null;
  username: string | null;
}
