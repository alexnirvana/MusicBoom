import { normalizeOpenlistBaseUrl } from "./utils";

// 上传单个文件到指定目录，使用 OpenList 官方接口
export async function uploadOpenlistFile(
  baseUrl: string,
  token: string,
  targetDir: string,
  file: File,
  onProgress?: (payload: { loaded: number; total: number; speed: number }) => void,
) {
  const normalizedBaseUrl = normalizeOpenlistBaseUrl(baseUrl);
  const trimmedToken = token?.trim();
  if (!trimmedToken) {
    throw new Error("未提供 Token，请重新登录后重试");
  }

  const authorization = trimmedToken.replace(/^Bearer\s+/i, "");
  const formData = new FormData();
  formData.append("file", file);
  formData.append("path", targetDir || "/");
  formData.append("name", file.name);

  // 使用 XMLHttpRequest 便于获取实时上传进度和速度
  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startTime = Date.now();
    const totalBytes = file.size;

    xhr.upload.onprogress = (event) => {
      const loaded = event.loaded;
      const total = event.total || totalBytes;
      const elapsedSeconds = Math.max((Date.now() - startTime) / 1000, 0.001);
      const speed = loaded / elapsedSeconds;
      onProgress?.({ loaded, total, speed });
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;

      const contentType = xhr.getResponseHeader("content-type") || "";
      const isJson = contentType.includes("application/json");
      const payload = isJson && xhr.responseText ? JSON.parse(xhr.responseText) : null;

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
      } else {
        const reason = payload?.message || payload?.error || xhr.statusText;
        reject(new Error(`上传失败：${reason}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("请求上传接口失败：网络异常"));
    };

    xhr.open("PUT", `${normalizedBaseUrl}/api/fs/put`);
    xhr.setRequestHeader("Authorization", authorization);
    xhr.send(formData);
  });
}

// 删除当前目录下的多个文件/文件夹
export async function removeOpenlistEntries(
  baseUrl: string,
  token: string,
  dir: string,
  names: string[],
) {
  const normalizedBaseUrl = normalizeOpenlistBaseUrl(baseUrl);
  const trimmedToken = token?.trim();

  if (!trimmedToken) {
    throw new Error("未提供 Token，请重新登录后重试");
  }

  const authorization = trimmedToken.replace(/^Bearer\s+/i, "");

  try {
    const response = await fetch(`${normalizedBaseUrl}/api/fs/remove`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({ dir: dir || "/", names }),
    });

    const rawText = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? (rawText ? JSON.parse(rawText) : null) : null;

    if (!response.ok) {
      const reason = payload?.message || payload?.error || rawText || response.statusText;
      throw new Error(`删除失败：${reason}`);
    }

    return payload;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`请求删除接口失败：${reason}`);
  }
}
