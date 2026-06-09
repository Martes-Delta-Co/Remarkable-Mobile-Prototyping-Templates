// Tauri command layer. These signatures are the frontend contract and are ALWAYS
// compiled. The device-touching bodies are gated behind the `device` feature; in a
// default build they return a clear "not compiled" error (except the read-only
// catalog/plan commands, which never need the device).

use serde::Serialize;
use std::collections::HashSet;
use tauri::Manager;

#[allow(dead_code)]
const NOT_BUILT: &str = "Device support is not compiled in this build (rebuild with --features device).";

#[derive(Serialize)]
pub struct DeviceInfo {
    pub reachable: bool,
    pub ip: String,
    pub model: Option<String>,
    pub software: Option<String>,
}

#[derive(Serialize)]
pub struct PlanReport {
    pub designs: usize,
    pub files: usize,
}

#[derive(Serialize)]
pub struct InstallReport {
    pub installed: usize,
    pub removed: usize,
}

#[derive(Serialize)]
pub struct BackupReport {
    pub documents: usize,
    pub dest: String,
}

// ---- catalog helpers (no device needed) ----

fn read_catalog(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    let p = app
        .path()
        .resolve("catalog.json", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let s = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

/// Map selected design ids -> (filename, bytes) read from the bundled templates.
#[allow(dead_code)]
fn resolve_files(app: &tauri::AppHandle, ids: &[String]) -> Result<Vec<(String, Vec<u8>)>, String> {
    let cat = read_catalog(app)?;
    let tdir = app
        .path()
        .resolve("templates", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let want: HashSet<&str> = ids.iter().map(|s| s.as_str()).collect();
    let designs = cat
        .get("designs")
        .and_then(|d| d.as_array())
        .ok_or("catalog has no designs")?;
    let mut out = Vec::new();
    for d in designs {
        if !want.contains(d.get("id").and_then(|v| v.as_str()).unwrap_or("")) {
            continue;
        }
        for t in d.get("targets").and_then(|v| v.as_array()).into_iter().flatten() {
            for f in t.get("files").and_then(|v| v.as_array()).into_iter().flatten() {
                if let Some(name) = f.as_str() {
                    let bytes = std::fs::read(tdir.join(name))
                        .map_err(|e| format!("{name}: {e}"))?;
                    out.push((name.to_string(), bytes));
                }
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn plan_install(app: tauri::AppHandle, ids: Vec<String>) -> Result<PlanReport, String> {
    let cat = read_catalog(&app)?;
    let want: HashSet<&str> = ids.iter().map(|s| s.as_str()).collect();
    let designs = cat
        .get("designs")
        .and_then(|d| d.as_array())
        .ok_or("catalog has no designs")?;
    let mut files = 0usize;
    let mut n = 0usize;
    for d in designs {
        if want.contains(d.get("id").and_then(|v| v.as_str()).unwrap_or("")) {
            n += 1;
            for t in d.get("targets").and_then(|v| v.as_array()).into_iter().flatten() {
                files += t
                    .get("files")
                    .and_then(|v| v.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);
            }
        }
    }
    Ok(PlanReport { designs: n, files })
}

// ---- device commands ----

#[tauri::command]
pub async fn detect_device() -> Result<DeviceInfo, String> {
    #[cfg(feature = "device")]
    {
        crate::device::detect().await.map_err(|e| e.to_string())
    }
    #[cfg(not(feature = "device"))]
    {
        Ok(DeviceInfo {
            reachable: false,
            ip: "10.11.99.1".into(),
            model: None,
            software: None,
        })
    }
}

#[tauri::command]
pub async fn test_connection(ip: String, password: String) -> Result<DeviceInfo, String> {
    #[cfg(feature = "device")]
    {
        crate::device::identify(&ip, &password)
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(feature = "device"))]
    {
        let _ = (ip, password);
        Err(NOT_BUILT.into())
    }
}

#[tauri::command]
pub async fn apply_install(
    app: tauri::AppHandle,
    ids: Vec<String>,
    ip: String,
    password: String,
    mirror: bool,
) -> Result<InstallReport, String> {
    #[cfg(feature = "device")]
    {
        let files = resolve_files(&app, &ids)?;
        let (installed, removed) = crate::device::install(&ip, &password, files, mirror)
            .await
            .map_err(|e| e.to_string())?;
        Ok(InstallReport { installed, removed })
    }
    #[cfg(not(feature = "device"))]
    {
        let _ = (app, ids, ip, password, mirror);
        Err(NOT_BUILT.into())
    }
}

#[tauri::command]
pub async fn list_installed(ip: String, password: String) -> Result<Vec<String>, String> {
    #[cfg(feature = "device")]
    {
        crate::device::list_installed(&ip, &password)
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(feature = "device"))]
    {
        let _ = (ip, password);
        Err(NOT_BUILT.into())
    }
}

#[tauri::command]
pub async fn uninstall_all(ip: String, password: String) -> Result<(), String> {
    #[cfg(feature = "device")]
    {
        crate::device::uninstall_all(&ip, &password)
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(feature = "device"))]
    {
        let _ = (ip, password);
        Err(NOT_BUILT.into())
    }
}

#[tauri::command]
pub fn save_device_password(device_id: String, password: String) -> Result<(), String> {
    #[cfg(feature = "device")]
    {
        crate::device::save_password(&device_id, &password).map_err(|e| e.to_string())
    }
    #[cfg(not(feature = "device"))]
    {
        let _ = (device_id, password);
        Err(NOT_BUILT.into())
    }
}

#[tauri::command]
pub fn get_device_password(device_id: String) -> Result<Option<String>, String> {
    #[cfg(feature = "device")]
    {
        crate::device::get_password(&device_id).map_err(|e| e.to_string())
    }
    #[cfg(not(feature = "device"))]
    {
        let _ = device_id;
        Ok(None)
    }
}

#[tauri::command]
pub async fn backup_documents(dest: String) -> Result<BackupReport, String> {
    #[cfg(feature = "device")]
    {
        let d = dest.clone();
        let documents = tauri::async_runtime::spawn_blocking(move || crate::device::backup_documents(&d))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
        Ok(BackupReport { documents, dest })
    }
    #[cfg(not(feature = "device"))]
    {
        let _ = dest;
        Err(NOT_BUILT.into())
    }
}
