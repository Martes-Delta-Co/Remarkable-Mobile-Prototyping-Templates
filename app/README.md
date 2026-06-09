# reMarkable UX Templates — desktop app

Tauri v2 app: browse the template catalog, pick which device/background combinations you
want, and install just those onto your tablet. See [`../docs/TAURI-APP-PLAN.md`](../docs/TAURI-APP-PLAN.md)
for the full design and [`../docs/RELEASING.md`](../docs/RELEASING.md) for distribution.

## Layout

```
app/
├─ index.html              Vite entry
├─ src/                    frontend (TypeScript, no framework yet)
│   ├─ renderer.ts         Methods template -> SVG (the catalog renderer)
│   ├─ catalog.ts          catalog.json types + loader
│   ├─ main.ts             the device × background picker UI
│   └─ style.css
├─ public/catalog.json     generated catalog (see generators/build_catalog.py)
└─ src-tauri/              Rust backend
    ├─ src/lib.rs          app setup + auto-updater + command registration
    ├─ src/commands.rs     IPC contract (always compiled)
    └─ src/device.rs       SSH install / USB-web backup / keychain  (feature = "device")
```

## Run / build

```
cd app
npm install
npm run dev          # frontend dev server + Tauri window (needs Rust: https://rustup.rs)
npm run tauri build  # packaged .dmg (or use ../scripts/build.sh)
```

The catalog is generated from the template files:

```
python3 ../generators/build_catalog.py   # -> app/public/catalog.json + catalog/catalog.json
```

## Status

| Part | State |
|------|-------|
| Catalog picker + template renderer (frontend) | **built & verified** (Vite/tsc build passes; renders the real 36 designs) |
| Device + Backup screens (connect, install/sync, rmdoc backup) | **built & verified** (both render; wired to the Rust commands) |
| Auto-update + release scripts | **built** (config + scripts; see docs/RELEASING.md) |
| Rust shell (window + updater + dialog + IPC) | **built** |
| Device subsystem (SSH install, USB-web backup, keychain) | **implemented behind `--features device`** — needs a physical reMarkable to verify end-to-end |

### The `device` feature

The tablet integration lives in `src-tauri/src/device.rs` and is gated so the core app always
builds. To compile and try it (with a tablet connected over USB):

```
npm run tauri build -- --features device      # or: cargo build --features device
```

It uses `russh` with a tar-over-exec channel (the device exposes no SFTP), `ureq` for the USB
Web Interface backup, and the OS keychain for the device password — exactly as in the plan.
