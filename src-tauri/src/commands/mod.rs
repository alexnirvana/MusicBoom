use crate::app_state::{AppState, QueueKind, QueueTask, ServerConfig};
use serde::{Deserialize, Serialize};
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
