// 统一整理 OpenList 基础地址，去除末尾多余的斜杠
export function normalizeOpenlistBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    throw new Error("请填写网盘基础地址");
  }

  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalized);
    // 仅保留协议 + 域名（含端口），如果用户误粘贴了形如 /share/xxx 的路径，自动丢弃避免接口 404/500
    return `${parsed.protocol}//${parsed.host}`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`无法识别的地址：${reason}`);
  }
}
