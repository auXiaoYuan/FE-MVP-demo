//! muyu —— 敲木鱼桌面应用（Tauri 2）。
//!
//! 架构说明：应用启动时在后台内嵌运行 muyu-backend（本地 HTTP 服务 + SQLite），
//! 前端通过 `get_backend_port` 命令获取实际端口后，以 HTTP 方式调用后端 API，
//! 实现前后端分离。数据库存放在系统应用数据目录，首次设置的用户信息不可修改。

use tauri::{Manager, State};

/// 内嵌后端实际监听端口。
pub struct BackendState {
    pub port: u16,
}

/// 前端通过 Tauri invoke 获取后端端口。
#[tauri::command]
fn get_backend_port(state: State<BackendState>) -> u16 {
    state.port
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 应用数据目录（Windows: %APPDATA%\com.muyu.demo\）
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("muyu.db");

            // 内嵌启动后端服务（端口 0 = 自动选择空闲端口）
            let config = muyu_backend::BackendConfig { db_path, port: 0 };
            let port = tauri::async_runtime::block_on(muyu_backend::serve(config))?;
            println!("[muyu] embedded backend ready on port {port}");
            app.manage(BackendState { port });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_backend_port])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
