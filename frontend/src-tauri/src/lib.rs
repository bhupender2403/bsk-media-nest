use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct ApiSidecar(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let child = if cfg!(debug_assertions) {
                None
            } else {
                let data_dir = app.path().app_data_dir()?;
                std::fs::create_dir_all(&data_dir)?;
                let (mut events, child) = app
                    .shell()
                    .sidecar("bsk-media-nest-api")?
                    .env("BSK_DATA_DIR", data_dir)
                    .spawn()?;
                tauri::async_runtime::spawn(async move {
                    while events.recv().await.is_some() {}
                });
                Some(child)
            };
            app.manage(ApiSidecar(Mutex::new(child)));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building BSK Media Nest");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(mut child) = app_handle
                .state::<ApiSidecar>()
                .0
                .lock()
                .expect("API sidecar lock poisoned")
                .take()
            {
                let _ = child.kill();
            }
        }
    });
}
