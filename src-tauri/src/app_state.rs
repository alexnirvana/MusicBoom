use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// 应用级的共享状态，后续可替换为 SQLite/Store 等持久化方案。
#[derive(Default)]
pub struct AppState {
    pub servers: Mutex<Vec<ServerConfig>>, // 服务器配置列表
    pub queues: Mutex<Vec<QueueTask>>,     // 上传/下载队列状态
}

/// Navidrome/OpenList 服务器配置模型。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub key_ref: String,
}

/// 队列任务的简单占位模型，后续可接入 SQLite 与真实任务调度。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueTask {
    pub id: String,
    pub kind: QueueKind,
    pub filename: String,
    pub progress: u8,
    pub status: String,
}

/// 队列任务类型。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum QueueKind {
    Upload,
    Download,
}
