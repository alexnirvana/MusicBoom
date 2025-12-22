// 登录请求体
export interface LoginPayload {
  baseUrl: string;
  username: string;
  password: string;
}

// 登录成功后的响应体
export interface LoginSuccess {
  token: string;
  salt: string;
  displayName: string;
  username: string;
}

// 登录状态在应用内的持久化结构
export interface AuthState {
  baseUrl: string | null;
  token: string | null;
  salt: string | null;
  username: string | null;
  displayName: string | null;
}
