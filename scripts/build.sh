#!/usr/bin/env bash
# Build the macOS app: universal .dmg (for the website) + updater artifacts
# (.app.tar.gz + .sig, for auto-update). See docs/RELEASING.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/app"
cd "$APP"

# ---- prerequisites ----
command -v node  >/dev/null || { echo "ERROR: Node.js required — https://nodejs.org"; exit 1; }
command -v cargo >/dev/null || { echo "ERROR: Rust toolchain required — install via https://rustup.rs"; exit 1; }

# Universal macOS binary needs both arch targets installed.
rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null 2>&1 || true

# ---- icons (required by the bundler) ----
if [ ! -f "$APP/src-tauri/icons/icon.icns" ]; then
  echo "ERROR: app icons missing. Generate them once from a 1024x1024 PNG:"
  echo "         (cd app && npx tauri icon /path/to/icon-1024.png)"
  exit 1
fi

# ---- updater signing key (required for verifiable auto-update) ----
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  echo "WARNING: TAURI_SIGNING_PRIVATE_KEY is not set."
  echo "         The build will produce UNSIGNED updater artifacts and auto-update"
  echo "         will reject them. See docs/RELEASING.md to create/load a key."
fi

echo "==> Installing JS dependencies"
npm install

echo "==> Building universal macOS bundle (this compiles Rust; first run is slow)"
npm run tauri build -- --target universal-apple-darwin

BUNDLE="$APP/src-tauri/target/universal-apple-darwin/release/bundle"
echo
echo "==> Artifacts:"
ls -1 "$BUNDLE/dmg/"*.dmg            2>/dev/null || echo "  (no .dmg found)"
ls -1 "$BUNDLE/macos/"*.app.tar.gz*  2>/dev/null || echo "  (no updater artifacts — set TAURI_SIGNING_PRIVATE_KEY)"
