import { normalizeOpenlistBaseUrl } from "./utils";

// 判定是否在 Tauri 环境运行，用于决定是否走原生上传绕过 CORS
function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_IPC__" in window;
}

// 通过 Tauri 原生插件上传文件，可绕过跨域限制并获取上传进度
async function uploadViaTauri(
  targetUrl: string,
  authorization: string,
  file: File,
  onProgress?: (payload: { loaded: number; total: number; speed: number }) => void,
) {
  // 按需动态引入，避免在纯浏览器环境下加载插件包导致错误
  const [{ upload }, { writeFile, remove }, { tempDir, join }] = await Promise.all([
    import("@tauri-apps/plugin-upload"),
    import("@tauri-apps/plugin-fs"),
    import("@tauri-apps/api/path"),
  ]);

  const tempDirPath = await tempDir();
  const tempFilePath = await join(tempDirPath, `musicboom-openlist-${Date.now()}-${file.name}`);

  // 先写入临时文件，再交由原生上传，以便获取实时进度
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(tempFilePath, fileBytes);

  const headers = new Map<string, string>();
  headers.set("Authorization", authorization);
  headers.set("Content-Type", file.type || "application/octet-stream");

  try {
    await upload(
      targetUrl,
      tempFilePath,
      (progress) => {
        const total = progress.progressTotal || file.size;
        onProgress?.({ loaded: progress.progress, total, speed: progress.transferSpeed || 0 });
      },
      headers,
    );
  } finally {
    // 上传完成或失败后清理临时文件，忽略删除报错以免影响主流程
    await remove(tempFilePath).catch(() => {});
  }
}

// 上传单个文件到指定目录，使用 WebDAV PUT 到 /dav 路径
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

  // remotePath 需要保持 WebDAV 规范：必须以 / 开头，且指向已经挂载的存储路径
  const sanitizedDir = (targetDir || "/").trim() || "/";
  const ensuredLeadingSlash = sanitizedDir.startsWith("/") ? sanitizedDir : `/${sanitizedDir}`;
  const dirWithoutTrailingSlash = ensuredLeadingSlash === "/" ? "/" : ensuredLeadingSlash.replace(/\/+$/, "");
  const remoteFilePath = dirWithoutTrailingSlash === "/" ? `/${file.name}` : `${dirWithoutTrailingSlash}/${file.name}`;

  // 对路径段进行编码，保证包含中文或空格时能够正确上传
  const encodedPath = remoteFilePath
    .split("/")
    .map((segment, index) => (index === 0 ? "" : encodeURIComponent(segment)))
    .join("/");

  const targetUrl = `${normalizedBaseUrl}/dav${encodedPath}`;
  const authorization = trimmedToken.replace(/^Bearer\s+/i, "");

  if (isTauriEnvironment()) {
    try {
      await uploadViaTauri(targetUrl, authorization, file, onProgress);
      return null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`上传失败：${reason}`);
    }
  }

  // 浏览器环境回退使用 XMLHttpRequest，可提供进度显示，但若目标站点未开放 CORS 会被拦截
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
      reject(new Error("请求上传接口失败：网络异常或跨域被拦截"));
    };

    xhr.open("PUT", targetUrl);
    xhr.setRequestHeader("Authorization", authorization);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.send(file);
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
