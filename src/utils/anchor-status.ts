/**
 * 从 comment 字段中提取 APP_ANCHOR_ID
 * @param comment comment 字符串
 * @returns 提取到的 APP_ANCHOR_ID，如果没有则返回 null
 */
export function extractAppAnchorId(comment?: string): string | null {
  if (!comment) return null;

  const regex = /APP_ANCHOR_ID:([a-f0-9-]+)/i;
  const match = comment.match(regex);
  return match ? match[1] : null;
}

/**
 * 获取锚定状态类型
 */
export type AnchorStatus = "no-id" | "no-upload" | "uploaded";

/**
 * 获取锚定状态的文本标签
 */
export function getAnchorStatusLabel(status: AnchorStatus): string {
  switch (status) {
    case "no-id":
      return "无ID锚定";
    case "no-upload":
      return "无上传锚定";
    case "uploaded":
      return "已锚定";
    default:
      return "未知";
  }
}
