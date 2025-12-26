use crate::app_state::{AppState, QueueKind, QueueTask, ServerConfig};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;
use uuid::Uuid;

/// 新增或更新服务器配置。
#[tauri::command]
pub fn add_server(
    app_state: State<'_, AppState>,
    name: String,
    base_url: String,
    key_ref: String,
) -> Vec<ServerConfig> {
    let mut servers = app_state.servers.lock().expect("服务器配置锁定失败");
    let id = Uuid::new_v4().to_string();
    servers.push(ServerConfig {
        id,
        name,
        base_url,
        key_ref,
    });
    servers.clone()
}

/// 列出当前已注册的服务器。
#[tauri::command]
pub fn list_servers(app_state: State<'_, AppState>) -> Vec<ServerConfig> {
    app_state
        .servers
        .lock()
        .expect("服务器配置锁定失败")
        .clone()
}

/// 移除服务器。
#[tauri::command]
pub fn remove_server(app_state: State<'_, AppState>, id: String) -> Vec<ServerConfig> {
    let mut servers = app_state.servers.lock().expect("服务器配置锁定失败");
    servers.retain(|server| server.id != id);
    servers.clone()
}

/// Navidrome 搜索占位实现，后续接入真实 HTTP 请求与缓存。
#[tauri::command]
pub fn navidrome_search(keyword: String) -> Vec<TrackSummary> {
    vec![TrackSummary {
        id: Uuid::new_v4().to_string(),
        title: format!("示例歌曲：{}", keyword),
        artist: "示例歌手".to_string(),
        album: "示例专辑".to_string(),
    }]
}

/// Navidrome 歌单占位实现。
#[tauri::command]
pub fn navidrome_playlist(name: String) -> PlaylistSummary {
    PlaylistSummary {
        id: Uuid::new_v4().to_string(),
        name: format!("{}（占位歌单）", name),
        tracks: vec![TrackSummary {
            id: Uuid::new_v4().to_string(),
            title: "占位曲目".to_string(),
            artist: "示例歌手".to_string(),
            album: "示例专辑".to_string(),
        }],
    }
}

/// 生成占位播放地址。
#[tauri::command]
pub fn navidrome_stream_url(base_url: String, track_id: String) -> String {
    format!(
        "{}/rest/stream.view?id={}&token=stub",
        base_url.trim_end_matches('/'),
        track_id
    )
}

/// OpenList 目录浏览占位实现。
#[tauri::command]
pub fn openlist_browse(path: Option<String>) -> Vec<FileEntry> {
    vec![
        FileEntry {
            name: path.unwrap_or_else(|| "/".to_string()),
            kind: "directory".to_string(),
            size: 0,
        },
        FileEntry {
            name: "示例音频.flac".to_string(),
            kind: "file".to_string(),
            size: 1234,
        },
    ]
}

/// OpenList 上传占位实现。
#[tauri::command]
pub fn openlist_upload(app_state: State<'_, AppState>, filename: String) -> QueueTask {
    let mut queues = app_state.queues.lock().expect("队列锁定失败");
    let task = QueueTask {
        id: Uuid::new_v4().to_string(),
        kind: QueueKind::Upload,
        filename,
        progress: 12,
        status: "等待上传".to_string(),
    };
    queues.push(task.clone());
    task
}

/// OpenList 下载占位实现。
#[tauri::command]
pub fn openlist_download(app_state: State<'_, AppState>, filename: String) -> QueueTask {
    let mut queues = app_state.queues.lock().expect("队列锁定失败");
    let task = QueueTask {
        id: Uuid::new_v4().to_string(),
        kind: QueueKind::Download,
        filename,
        progress: 0,
        status: "等待下载".to_string(),
    };
    queues.push(task.clone());
    task
}

/// 查询队列状态。
#[tauri::command]
pub fn queue_status(app_state: State<'_, AppState>) -> Vec<QueueTask> {
    app_state.queues.lock().expect("队列锁定失败").clone()
}

/// 将任务标记为暂停。
#[tauri::command]
pub fn queue_pause(app_state: State<'_, AppState>, id: String) -> Vec<QueueTask> {
    let mut queues = app_state.queues.lock().expect("队列锁定失败");
    for task in queues.iter_mut() {
        if task.id == id {
            task.status = "已暂停".to_string();
        }
    }
    queues.clone()
}

/// 将任务标记为继续。
#[tauri::command]
pub fn queue_resume(app_state: State<'_, AppState>, id: String) -> Vec<QueueTask> {
    let mut queues = app_state.queues.lock().expect("队列锁定失败");
    for task in queues.iter_mut() {
        if task.id == id {
            task.status = "运行中".to_string();
        }
    }
    queues.clone()
}

/// 删除队列任务。
#[tauri::command]
pub fn queue_cancel(app_state: State<'_, AppState>, id: String) -> Vec<QueueTask> {
    let mut queues = app_state.queues.lock().expect("队列锁定失败");
    queues.retain(|task| task.id != id);
    queues.clone()
}

/// 返回缓存占位结果。
#[tauri::command]
pub fn cache_fetch() -> CacheStatus {
    CacheStatus {
        cache_ready: false,
        last_refresh: "尚未同步".to_string(),
    }
}

/// 返回缓存刷新占位结果。
#[tauri::command]
pub fn cache_refresh() -> CacheStatus {
    CacheStatus {
        cache_ready: true,
        last_refresh: "已触发刷新".to_string(),
    }
}

/// 简单的曲目摘要。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackSummary {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
}

/// 歌单摘要。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistSummary {
    pub id: String,
    pub name: String,
    pub tracks: Vec<TrackSummary>,
}

/// OpenList 目录条目。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub kind: String,
    pub size: usize,
}

/// 缓存状态。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStatus {
    pub cache_ready: bool,
    pub last_refresh: String,
}

/// 音频标签处理结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagProcessResult {
    pub success: bool,
    pub error_message: Option<String>,
    pub app_anchor_id: Option<String>,
    pub modified_data: Option<Vec<u8>>,
}

/// 为音频文件添加APP_ANCHOR_ID标签
#[tauri::command]
pub async fn add_app_anchor_tag(
    file_name: String,
    file_data: Vec<u8>,
    app_anchor_id: Option<String>,
) -> Result<TagProcessResult, String> {
    // 如果没有提供app_anchor_id，则生成一个新的
    let anchor_id = app_anchor_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    // 从文件名检查扩展名
    let path = Path::new(&file_name);
    let extension = path.extension().and_then(|ext| ext.to_str());

    match extension {
        Some("flac") | Some("mp3") | Some("m4a") | Some("ogg") => {
            // 处理支持的音频格式
            match add_tag_to_file(&file_data, &anchor_id, extension.unwrap()) {
                Ok(modified_data) => Ok(TagProcessResult {
                    success: true,
                    error_message: None,
                    app_anchor_id: Some(anchor_id),
                    modified_data: Some(modified_data),
                }),
                Err(e) => Ok(TagProcessResult {
                    success: false,
                    error_message: Some(format!("{}文件标签写入失败: {}", extension.unwrap(), e)),
                    app_anchor_id: Some(anchor_id),
                    modified_data: None,
                }),
            }
        }
        Some("wav") | Some("aac") => Ok(TagProcessResult {
            success: false,
            error_message: Some(format!(
                "{}格式暂不支持标签写入，请转换为FLAC/MP3/M4A/OGG格式",
                extension.unwrap()
            )),
            app_anchor_id: Some(anchor_id),
            modified_data: None,
        }),
        _ => Ok(TagProcessResult {
            success: false,
            error_message: Some("不支持的音频格式，目前支持FLAC、MP3、M4A、OGG".to_string()),
            app_anchor_id: Some(anchor_id),
            modified_data: None,
        }),
    }
}

/// 为音频文件添加标签的通用函数
fn add_tag_to_file(file_data: &[u8], anchor_id: &str, format: &str) -> Result<Vec<u8>, String> {
    use audiotags::Tag;

    // 创建临时文件
    let temp_file = format!("temp_{}.{}", Uuid::new_v4(), format);
    let temp_path = std::env::temp_dir().join(&temp_file);
    let temp_path_str = temp_path.to_string_lossy();

    // 写入原始数据
    if let Err(e) = std::fs::write(&temp_path, file_data) {
        return Err(format!("写入临时文件失败: {}", e));
    }

    // 读取并修改标签
    let mut tag = match Tag::new().read_from_path(temp_path_str.as_ref()) {
        Ok(t) => t,
        Err(e) => {
            let _ = std::fs::remove_file(&temp_path);
            return Err(format!("读取音频标签失败: {}", e));
        }
    };

    // 设置评论字段为APP_ANCHOR_ID
    let comment_with_anchor = format!("APP_ANCHOR_ID:{}", anchor_id);
    tag.set_comment(comment_with_anchor);

    // 写回标签
    if let Err(e) = tag.write_to_path(&temp_path_str) {
        let _ = std::fs::remove_file(&temp_path);
        return Err(format!("写入音频标签失败: {}", e));
    }

    // 读取修改后的数据
    let modified_data = match std::fs::read(&temp_path) {
        Ok(data) => data,
        Err(e) => {
            let _ = std::fs::remove_file(&temp_path);
            return Err(format!("读取修改后的文件失败: {}", e));
        }
    };

    // 清理临时文件
    let _ = std::fs::remove_file(&temp_path);

    Ok(modified_data)
}

/// 清除指定目录下所有文件和文件夹
#[tauri::command]
pub async fn clear_directory(path: String) -> Result<String, String> {
    let dir_path = Path::new(&path);

    // 检查路径是否存在
    if !dir_path.exists() {
        return Ok("目录不存在，无需清理".to_string());
    }

    // 检查是否为目录
    if !dir_path.is_dir() {
        return Err("指定的路径不是目录".to_string());
    }

    // 递归删除目录下所有内容
    match std::fs::remove_dir_all(dir_path) {
        Ok(_) => {
            // 删除后重新创建空目录
            if let Err(e) = std::fs::create_dir_all(dir_path) {
                return Err(format!("目录删除后重新创建失败: {}", e));
            }
            Ok(format!("已成功清除目录: {}", path))
        }
        Err(e) => Err(format!("清除目录失败: {}", e)),
    }
}

/// 清除数据库中已下载歌曲的记录（local_music 和 downloads 表）
/// 已废弃：此功能现在由前端通过 tauri-plugin-sql 直接实现
#[tauri::command]
pub async fn clear_downloaded_songs() -> Result<String, String> {
    Ok("此功能已迁移到前端实现".to_string())
}
