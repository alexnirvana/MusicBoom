mod app_state;
mod commands;

use app_state::AppState;
use commands::*;

/// Tauri 入口，后续可继续挂载插件与命令。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            add_server,
            list_servers,
            remove_server,
            navidrome_search,
            navidrome_playlist,
            navidrome_stream_url,
            openlist_browse,
            openlist_upload,
            openlist_download,
            queue_status,
            queue_pause,
            queue_resume,
            queue_cancel,
            cache_fetch,
            cache_refresh
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时出现异常");
}
