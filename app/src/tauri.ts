// Typed bridge to the Rust backend. Calls only work inside the packaged app
// (and, for device actions, a build with --features device + a tablet attached).
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

export const isTauri = () => typeof (window as any).__TAURI_INTERNALS__ !== "undefined";

export interface DeviceInfo {
  reachable: boolean;
  ip: string;
  model: string | null;
  software: string | null;
}
export interface InstallReport {
  installed: number;
  removed: number;
}
export interface BackupReport {
  documents: number;
  dest: string;
}

export const api = {
  detectDevice: () => invoke<DeviceInfo>("detect_device"),
  testConnection: (ip: string, password: string) =>
    invoke<DeviceInfo>("test_connection", { ip, password }),
  listInstalled: (ip: string, password: string) =>
    invoke<string[]>("list_installed", { ip, password }),
  applyInstall: (ids: string[], ip: string, password: string, mirror: boolean) =>
    invoke<InstallReport>("apply_install", { ids, ip, password, mirror }),
  uninstallAll: (ip: string, password: string) =>
    invoke<void>("uninstall_all", { ip, password }),
  backupDocuments: (dest: string) => invoke<BackupReport>("backup_documents", { dest }),
  savePassword: (deviceId: string, password: string) =>
    invoke<void>("save_device_password", { deviceId, password }),
  getPassword: (deviceId: string) => invoke<string | null>("get_device_password", { deviceId }),
  pickFolder: () => openDialog({ directory: true, multiple: false }) as Promise<string | null>,
};
