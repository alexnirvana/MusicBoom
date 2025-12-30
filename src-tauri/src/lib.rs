mod app_state;
mod commands;

use app_state::AppState;
use commands::*;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// 创建托盘图标，便于精简模式下从任务栏快速唤起。
fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let app_handle = app.handle();

    let show_main = MenuItemBuilder::with_id("show-main", "显示主界面").build(&app_handle)?;
    let quit_app = MenuItemBuilder::with_id("quit-app", "退出程序").build(&app_handle)?;

    let tray_menu = MenuBuilder::new(&app_handle)
        .items(&[&show_main, &quit_app])
        .build()?;

    let mut tray_builder = TrayIconBuilder::new()
        .menu(&tray_menu)
        .tooltip("MusicBoom 已在后台运行")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show-main" => {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                } else if let Some(auth) = app.get_webview_window("auth") {
                    let _ = auth.show();
                    let _ = auth.set_focus();
                }
            }
            "quit-app" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button, .. } = event {
                if button == MouseButton::Left {
                    if let Some(main) = tray
                        .app_handle()
                        .get_webview_window("main")
                        .or_else(|| tray.app_handle().get_webview_window("mini-player"))
                    {
                        let _ = main.show();
                        let _ = main.set_focus();
                    }
                }
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app)?;

    Ok(())
}

/// Tauri 入口，后续可继续挂载插件与命令。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .manage(AppState::default())
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
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
            cache_refresh,
            add_app_anchor_tag,
            add_app_anchor_tag_to_file,
            clear_directory,
            clear_downloaded_songs,
            resolve_hostname
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时出现异常");
}
