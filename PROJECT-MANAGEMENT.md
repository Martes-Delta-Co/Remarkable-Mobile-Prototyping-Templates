# Project management — backlog & roadmap

Living list of what we want to add. The Tauri app and the catalog picker (§2.4 of
[docs/TAURI-APP-PLAN.md](docs/TAURI-APP-PLAN.md)) **hide** anything not yet in `catalog.json`,
so each item below lights up its matrix cell automatically once the generators emit it.

## Desktop app — verification & build tiers

The app ships in **two tiers of functionality**:

- **Core app** (catalog picker + renderer + the device/backup *screens*) builds and runs with
  nothing special — `npm run tauri dev` / `npm run tauri build`.
- **Tablet integration** (SSH install, USB backup, keychain) is gated behind a Cargo feature
  and is **off by default**:

  ```
  npm run tauri build -- --features device
  ```

- [ ] **Verify the `device` path end-to-end on a physical reMarkable over USB.** Per the
      [app README](app/README.md) status table it's *implemented but not yet verified* — the
      default build shows the device/backup UI but can't actually talk to a tablet. Needs a
      real device connected to confirm SSH install, USB-web backup, and keychain storage work.

  Verification checklist (run on a connected device):

  - [ ] **Build:** `npm run tauri build -- --features device` (macOS) compiles cleanly.
  - [ ] **Connect:** Test connection over USB (`10.11.99.1`) returns the device model + software
        version — not the "Device support is not compiled" error.
  - [ ] **Keychain:** "Remember password" stores it; relaunching the app prefills it (macOS Keychain).
  - [ ] **Install:** install a selection → files land in `xochitl/`, the tablet UI restarts, and the
        templates show up under New page → Template.
  - [ ] **Mirror on:** install with Mirror checked → `uxtpl_*` templates not in the selection are removed.
  - [ ] **Mirror off:** install with Mirror unchecked → previously installed templates are left intact.
  - [ ] **Installed list:** "Refresh" on My reMarkable reflects what's actually on the device.
  - [ ] **Uninstall all:** removes only `uxtpl_*` files, leaving other templates untouched.
  - [ ] **Backup:** pulls notebooks as `.rmdoc` over the USB web interface into the chosen folder.
  - [ ] **Both devices:** repeat on the reMarkable 2 and the Paper Pro (Developer Mode on for the Pro).

## Want soon — new catalog content

These are the rows/columns the picker matrix is designed around but doesn't ship yet.

### New devices (matrix rows)

- [ ] **iPad** — tablet form factor: rounded bezel, no notch, home-indicator pill; portrait +
      landscape. New frame drawer (reuse phone overlay logic for col/grid/dots).
- [ ] **Desktop app** — window-chrome frame (title bar / traffic-light controls), landscape.
      New layout set likely (one big frame rather than 4UP phones).
- [ ] **Web app** — browser-chrome frame (address bar) or plain viewport at chosen breakpoints
      (e.g. 1440 / 1280 / 375). Decide whether breakpoints are separate "models" or a variant.

### New backgrounds (matrix columns / `variant`s)

- [ ] **Neither** — device frame + safe-area tint only, no column/grid overlay. Small generator
      change (skip the overlay step).
- [ ] **Dot grid** — dots at grid intersections instead of stroked lines. Render as small filled
      polygons (like the existing approximated circles); note it adds many items per page.

## Generator work these imply

- [ ] Refactor device specs into `generators/devices/` as per-model data tagged with a
      `formFactor` (`phone | tablet | desktop | web`).
- [ ] Make `LAYOUTS` selectable per form factor (desktop/web want different layouts than phones).
- [ ] Add `none` and `dots` to `VARIANTS`; add a dot-overlay drawer.
- [ ] Extend the base-name scheme to `uxtpl_{formFactor}_{model}_{layout}_{variant}[_rm2]`
      (keep the `uxtpl_` prefix so sync/remove stays trivial).
- [ ] `build.py` emits these into `catalog/catalog.json` with `formFactor` + `model` fields.

## Notes

- Keep both coordinate sets (`rmPP` + `_rm2`) for every new design — the dual-emission in
  `build.py` is orthogonal and works for any new form factor for free.
- The picker renders the canonical `rmPP` file for thumbnails (the `_rm2` twin would appear
  sideways).
