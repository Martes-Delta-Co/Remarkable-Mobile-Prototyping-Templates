# Releasing the app

Free macOS app, `.dmg` hosted on GitHub Releases, linked from the MDC website, with
**auto-update** built in (Tauri updater). Three scripts in `scripts/` drive it.

```
scripts/release.sh [patch|minor|major|X.Y.Z]   # bump version, changelog, commit, tag (local)
scripts/build.sh                                # build the universal .dmg + updater artifacts
scripts/publish.sh                              # build, push tag, create the GitHub Release
```

Normal flow: `scripts/release.sh minor` → `scripts/publish.sh`. (`publish.sh` calls
`build.sh` for you; set `SKIP_BUILD=1` to reuse an existing build.)

---

## One-time setup

1. **Rust toolchain** (Tauri compiles native code):
   ```
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup target add aarch64-apple-darwin x86_64-apple-darwin
   ```
2. **App icons** — generate once from a 1024×1024 PNG:
   ```
   cd app && npx tauri icon /path/to/icon-1024.png
   ```
3. **Updater signing key** — this is what makes auto-update trustworthy. Generate a keypair:
   ```
   cd app && npx tauri signer generate -w ~/.tauri/rmux-updater.key
   ```
   - Paste the **public** key into `app/src-tauri/tauri.conf.json` →
     `plugins.updater.pubkey` (replacing `REPLACE_WITH_TAURI_SIGNER_PUBLIC_KEY`).
   - Export the **private** key for builds (keep it secret; never commit it):
     ```
     export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/rmux-updater.key)"
     export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<the password you set>"
     ```
4. **GitHub CLI**: `gh auth login` (already authenticated as `thomasqbrady`).
5. **(Recommended) macOS code signing + notarization** so users don't hit Gatekeeper warnings.
   Tauri reads these env vars at build time (notarization via the App Store Connect API key you
   already use elsewhere, `oto-notarize.p8`):
   ```
   export APPLE_SIGNING_IDENTITY="Developer ID Application: <Your Name> (TEAMID)"
   export APPLE_API_ISSUER="<issuer-uuid>"
   export APPLE_API_KEY="<key-id>"          # the .p8 key id
   export APPLE_API_KEY_PATH="/path/to/AuthKey_XXXX.p8"
   ```
   Without these the app still builds and auto-updates, but first-launch shows an
   "unidentified developer" prompt.

---

## What `publish.sh` produces on each release

Uploaded to the GitHub Release `vX.Y.Z`:

- `reMarkable-UX-Templates_X.Y.Z_universal.dmg` — archival, versioned installer.
- `reMarkable-UX-Templates_universal.dmg` — **stable name** for the website link.
- `reMarkable-UX-Templates_X.Y.Z_universal.app.tar.gz` — the bundle the updater installs.
- `latest.json` — the updater manifest (version + signature + download URL).

**Website (MDC) download button** — always points at the newest release:
```
https://github.com/Martes-Delta-Co/Remarkable-Mobile-Prototyping-Templates/releases/latest/download/reMarkable-UX-Templates_universal.dmg
```

**Auto-update** — the app checks this on launch (already configured in `tauri.conf.json`):
```
https://github.com/Martes-Delta-Co/Remarkable-Mobile-Prototyping-Templates/releases/latest/download/latest.json
```

---

## How auto-update works

On launch the Rust shell (`app/src-tauri/src/lib.rs`) asks the updater to fetch `latest.json`,
compares versions, and if newer, downloads the `.app.tar.gz`, **verifies its signature against
the embedded public key**, installs it, and relaunches. Because the endpoint is the
`releases/latest/...` alias, simply publishing a new release rolls it out — no server to run.

> Note: `latest.json` lists both `darwin-aarch64` and `darwin-x86_64` pointing at the one
> universal artifact, so a single build serves Apple-silicon and Intel Macs.
