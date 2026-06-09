mod commands;
#[cfg(feature = "device")]
mod device;

use tauri_plugin_updater::UpdaterExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::plan_install,
            commands::detect_device,
            commands::test_connection,
            commands::apply_install,
            commands::list_installed,
            commands::uninstall_all,
            commands::backup_documents,
            commands::save_device_password,
            commands::get_device_password,
        ])
        .setup(|app| {
            // Check for updates in the background on launch. The updater verifies the
            // release signature against `plugins.updater.pubkey` before installing.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = check_for_updates(handle).await {
                    eprintln!("update check failed: {e}");
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn check_for_updates(app: tauri::AppHandle) -> tauri_plugin_updater::Result<()> {
    if let Some(update) = app.updater()?.check().await? {
        println!("installing update {} ...", update.version);
        update
            .download_and_install(|_downloaded, _total| {}, || {})
            .await?;
        app.restart();
    }
    Ok(())
}
