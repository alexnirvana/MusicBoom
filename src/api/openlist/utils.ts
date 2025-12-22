// 统一整理 OpenList 基础地址，去除末尾多余的斜杠
export function normalizeOpenlistBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    throw new Error("请填写网盘基础地址");
  }

  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalized);
    // 统一去掉末尾的斜杠，确保拼接接口路径时不会出现双斜杠
    const pathname = parsed.pathname.replace(/\/$/, "");
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`无法识别的地址：${reason}`);
  }
}
