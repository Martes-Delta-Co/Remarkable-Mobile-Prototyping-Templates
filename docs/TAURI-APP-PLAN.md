# Plan: Turn this repo into a Tauri desktop app (catalog picker + installer)

A plan for evolving the **reMarkable Mobile Prototyping Templates** repo from a
"Python generators + shell installer + manual-SSH docs" project into a cross-platform
**Tauri** desktop app that lets a user:

1. **Browse** the template catalog with thumbnails and filters.
2. **Configure** which templates they want in their personal library (so they don't dump
   hundreds onto the tablet).
3. **Install / sync / remove** exactly that selection onto a USB- or Wi-Fi-connected
   reMarkable, with progress and a clear "what's on the device vs. what I selected" view.
4. Grow the catalog beyond today's two phone sets to **more phone models, tablets, desktop
   app, and desktop/web** form factors.

> Why Tauri (vs. Electron): native OS webview instead of a bundled Chromium, so binaries are
> ~3–10 MB instead of ~150 MB, with a Rust backend that's a natural fit for the SSH transport,
> OS keychain access, and code-signing/notarization you already do elsewhere
> (`oto-notarize.p8`).

---

## 1. What already exists (and maps cleanly onto the app)

| Today | Becomes in the app |
|---|---|
| `src/*.py` generators emit `templates/universal/uxtpl_*` triplets | **Build-time catalog pipeline** — runs in CI/dev, not on the user's machine |
| `MANIFEST.txt` (name → base) | **`catalog.json`** — structured manifest the app reads |
| `iconData` base64 thumbnail inside each `.template` | **Catalog thumbnails** in the picker UI |
| `supportedScreens` (`rmPP` / `rm2`) per file | **Model-aware install** (only push the coord set the connected device needs) |
| `install.sh`: `tar cf - uxtpl_* | ssh root@IP 'tar xf - -C <dir>; systemctl restart xochitl'` | **Install engine** in Rust (same tar-over-SSH mechanic, with progress + diffing) |
| `uxtpl_` filename namespace | **Safe sync/remove** — diff and prune touch only `uxtpl_*` |
| `docs/install-*.md` (Dev Mode, password, host-key, `-O`/sftp gotchas) | **In-app onboarding** wizard text |

The two hard primitives — *a catalog of files* and *a tar-over-SSH transport* — already work.
The app is mostly a GUI + a selection/diff layer on top.

---

## 2. Target architecture

### 2.1 Repo restructure (monorepo)

```
/
├─ generators/         # was src/  — Python authoring pipeline (dev/CI only)
│   ├─ gen_templates.py, gen_methods.py, make_icons.py
│   ├─ build.py        # ALSO emits catalog/catalog.json (see §3)
│   └─ devices/        # NEW: per-model + per-form-factor specs (see §6)
├─ catalog/            # generated output, committed + bundled as a Tauri resource
│   ├─ uxtpl_*.{content,metadata,template}
│   └─ catalog.json    # structured manifest
├─ app/                # the Tauri app
│   ├─ src/            # frontend (Svelte or React + Vite)
│   └─ src-tauri/      # Rust backend (commands, ssh, install, secrets)
├─ docs/               # install guides + this plan + format notes
└─ install.sh / .ps1   # keep as the no-app fallback path
```

Keep `install.sh`/`.ps1` working — they're the escape hatch and a good integration test of the
transport.

### 2.2 Backend (Rust, `src-tauri`)

Modules:

- **`catalog`** — load and validate `catalog.json` from bundled resources; expose to the
  frontend. No Python at runtime.
- **`device`** — detection + identification:
  - USB: reMarkable exposes a USB-ethernet gadget at **`10.11.99.1`**; detect by attempting a
    TCP connect to port 22. Wi-Fi: user-entered IP.
  - Identify model (Paper Pro / rM2 / rM Paper) over SSH (e.g. read `/etc/version`,
    device-tree/model node, or `xochitl --version`) so we know which `supportedScreens` /
    coordinate set is relevant.
- **`transport`** — SSH in-process. **Recommended crate: `russh` + `russh-keys`** (pure Rust,
  no system OpenSSH or libssh2 build dependency, easiest cross-platform packaging).
  - **Critical gotcha:** the reMarkable historically does **not** expose an SFTP subsystem
    (that's why the docs tell users to add `-O` to `scp`). So **do not use SFTP.** Instead
    replicate the existing, proven mechanic: open an `exec` channel running
    `tar xf - -C <xochitl_dir>` and **stream the tar bytes to its stdin** — exactly what
    `install.sh` does today, just from Rust. Use a second `exec` for `systemctl restart
    xochitl`, and `ls` / `rm -rf` for listing and pruning `uxtpl_*`.
  - Don't pin host keys (the device key changes after each software update — see the
    `ssh-keygen -R` note in the docs); accept-and-store, or accept-on-trust with a UI notice.
- **`install`** — the sync engine:
  - `list_installed()` → `ls uxtpl_*` on device → present set.
  - `plan(selection)` → diff selection vs. installed → **{to_add, to_remove, unchanged}**.
  - `apply(plan, mode)` with **mode = mirror** (prune device to match selection) or
    **additive** (only add), then `systemctl restart xochitl`.
  - Model-aware: by default push only the coordinate set the connected device needs (saves
    space — the user's whole point), with an "install both coord sets" override.
- **`secrets`** — store the device password in the OS keychain via the **`keyring`** crate
  (Keychain / Credential Manager / libsecret). Never write it to plaintext config.
- **`commands`** — Tauri IPC handlers (thin wrappers over the above).

Tauri commands (IPC surface):
`list_catalog`, `get_profile` / `save_profile`, `detect_device`, `identify_device`,
`test_connection`, `list_installed`, `plan_install`, `apply_install` (emits progress events),
`uninstall_all`.

### 2.3 Frontend (`app/src`)

- **Recommended stack:** Tauri v2 + Vite + **Svelte** (small, fast, great for a
  thumbnail-grid + filters UI) — React is a fine alternative if you prefer the ecosystem.
- Screens:
  1. **Catalog / Library** — thumbnail grid (from `iconData`), facet filters
     (form factor → model → layout → variant → target device), search, multi-select,
     "select all in group". Selection = the user's **profile** (persisted locally).
  2. **Device** — connection card: detected USB device or manual IP, password entry (stored in
     keychain), "Test connection", identified model badge.
  3. **Sync** — shows the diff (add / remove / unchanged), mirror-vs-additive toggle,
     coord-set option, **Install** button with a progress bar and a result log.
  4. **Onboarding wizard** — folds in the `docs/install-*.md` content: the **Paper Pro
     Developer-Mode warning (erases the tablet!)**, where to find the password, software-3.17+
     requirement, host-key-changed recovery.

### 2.4 Catalog picker & template renderer (the core screen)

The Library screen is a **device × background matrix** with a live count and a live thumbnail
grid. The thumbnails are real renders of the actual `.template` files, not pre-baked images.

**Template renderer (shared TypeScript module, `template → SVG`).**
A renderer for the Methods format already exists in `generators/render_previews.py`
(`item_to_svg`); the in-app version is a ~30-line port with one upgrade. It:

1. Loads the `.template` JSON.
2. Evaluates `constants` (`[{"sx":"templateWidth / 2160"},{"sy":"templateHeight / 2880"}]`) at
   the design resolution (templateWidth=2160, templateHeight=2880 → `sx=sy=1`) using a **tiny
   safe arithmetic evaluator** (numbers, idents, `+ - * /`, parens) — **not** `eval()`.
3. Walks `items` → SVG `<path>`: `fillColor` → `fill` + `fill-rule="evenodd"` (handles the
   bezel/screen cutout rings); `strokeWidth` → stroked line (render dark grey ≈ `#3a3a3a`,
   matching how on-device strokes appear).
4. Emits `<svg viewBox="0 0 2160 2880">` with a white page rect behind.

Used for **both** the thumbnail grid and a click-to-zoom large preview — one source of truth,
so the picker can't drift from what actually installs. (Proven: the repo's `preview/*.png`
images are this exact pipeline's output.)

Two rules:
- **Render the canonical `rmPP` coordinate file**, never the `_rm2` twin — the `_rm2` file's
  coordinates are pre-rotated 90° (cancelled by the rM2's canvas quirk), so rendering it raw
  shows the design sideways. `catalog.json` groups both files under one design; the picker draws
  the `rmPP` one.
- **Virtualize the grid and memoize SVG by template id.** The full-`grid`/`dots` variants are
  the heaviest (hundreds of paths); render only visible cells.

**The matrix.** Rows = **device** (catalog `model`); columns = **background** (catalog
`variant`):

```
                12-col    Grid    Both    Neither   Dot grid
iPhone           [ ]      [ ]     [ ]      [ ]       [ ]
Android phone    [ ]      [ ]     [ ]      [ ]       [ ]
( iPad / Desktop app / Web app: hidden until built — see PROJECT-MANAGEMENT.md )

  Layouts:  [✓ 1UP] [✓ 2UP] [✓ 4UP] [✓ 1UP LS] [✓ 1UP WIDE] [✓ 4UP LS]
  ▸ 36 templates selected                              [ Review & install ]
  ┌──────────────────────────────────────────────────────────┐
  │ [thumb] [thumb] [thumb] [thumb] …   (scrollable, virtualized) │
  └──────────────────────────────────────────────────────────┘
```

- Click a **cell** to toggle; click a **row/column header** to toggle a whole device/background.
- **Secondary layout filter** — a row of chips (1UP, 2UP, 4UP, 1UP LS, 1UP WIDE, 4UP LS),
  **all-on by default**. The device×background matrix stays the primary control; layouts trim
  the multiplier so counts and the thumbnail list stay manageable. (Each matrix cell otherwise
  fans out across all enabled layouts.)
- **Count = distinct designs that will appear in the tablet's picker**, not files. Each design
  ships two coordinate files (rmPP + rm2) but the device shows only one (`supportedScreens`
  hides the other) and model-aware install pushes only the relevant one — so the count reflects
  what the user actually sees on the tablet.
- The live thumbnail grid below shows every currently-selected design (matrix ∩ layout chips),
  labelled with its on-tablet name (e.g. `1UP COL iPhone`); click → zoom preview.

**Not-yet-built cells are hidden, not greyed.** Today only iPhone/Android × {12-col, Grid,
Both} are populated. The missing devices (iPad, Desktop app, Web app) and variants (Neither,
Dot grid) are **not shown** until the generators emit them; each lights up automatically the
moment it appears in `catalog.json`. The backlog lives in
[PROJECT-MANAGEMENT.md](../PROJECT-MANAGEMENT.md).

### 2.5 Backup & restore (softening the Paper Pro wipe)

Enabling Developer Mode on a Paper Pro **erases the tablet**, and SSH (our install transport)
isn't available until *after* that wipe — so we can't SSH-backup beforehand. The fix is a
**cloud-first** backup step in the Paper Pro onboarding wizard, shown *before* "enable Developer
Mode." (rM2 / Paper Move never wipe, so the wizard skips this entirely.)

**The screen leads with reMarkable's own sync; our backup is the fallback.**

1. **Ask / detect:** "Do you use reMarkable's cloud sync (a reMarkable account / Connect)?"
   - **Yes → recommended path (primary CTA).** Guide the user to confirm sync is on, connect to
     Wi-Fi, and wait for "all synced"; show/confirm a recent sync. Reassure them that after the
     wipe they sign back in and notebooks re-download **automatically**. We do **not** run our
     own backup (offer it only as an optional extra). This is the encouraged route because cloud
     restore also brings back account-tied **settings**, which our local backup can't (see
     caveats).
   - **No / not sure → our local backup (fallback).** A plainly-labelled "we'll pull a local
     copy of your notebooks over USB" path.

2. **Our local backup (fallback only):** over the **USB Web Interface** (no SSH, no Dev Mode —
   the wizard tells them to toggle *Settings → Storage → USB web interface* on first), enumerate
   the library and download every notebook as **rmdoc** (lossless native archive) into a
   user-chosen folder, with a progress bar and a written manifest.

3. **Gate before the wipe:** the wizard won't advance to "enable Developer Mode" until *either*
   cloud sync is confirmed current *or* a local backup has completed — or the user explicitly
   waives it with a typed confirmation.

**Restore (after Dev Mode is on, post-wipe):**
- **Cloud users:** automatic on re-login; the app just verifies the document count came back.
- **Local-backup users:** SSH is now available, so the app unpacks the rmdoc archives back into
  the xochitl directory and restarts xochitl (rmdoc is a zip of a document's xochitl files).

**Backend:** a Rust **`webui`** module — a plain HTTP client to `http://10.11.99.1`:
`GET /documents/` (+ recurse `/documents/{guid}`) to walk the tree, `GET /download/{guid}/rmdoc`
to fetch each, write to disk. Restore reuses the SSH `transport` (§2.2). New IPC commands:
`detect_webui`, `list_documents`, `backup_documents(destDir)`, `restore_documents(srcDir)`.

**Scope & caveats (state these on the screen):**
- Backs up **documents/notebooks only** — *not* custom templates, app settings, or system
  tweaks. Cloud login restores account-tied settings; the app reinstalls its own templates;
  other third-party customizations are not covered. (This is exactly *why* cloud sync is the
  better primary.)
- It's a per-document HTTP loop, so a large library takes a moment — hence the progress bar.
- Requires the USB Web Interface enabled (Settings → Storage); the wizard walks them through it.

---

## 3. The catalog manifest (`catalog.json`)

Have `build.py` emit a structured manifest alongside the files so the app never parses Python
or guesses from filenames. One entry per design:

```jsonc
{
  "schemaVersion": 1,
  "templates": [
    {
      "id": "android_four_col",          // stable id (base name minus coord suffix)
      "visibleName": "4UP COL Android",   // matches the on-tablet picker name
      "formFactor": "phone",              // phone | tablet | desktop | web
      "model": "android-generic",         // pixel | iphone-16 | ipad | macbook | web-1440 ...
      "layout": "four",                    // one | two | four | one_land | ...
      "variant": "col",                    // col | colgrid | grid
      "orientation": "portrait",
      "targets": [                          // coordinate sets + which tablet each serves
        { "screen": "rmPP", "files": ["uxtpl_android_four_col.{content,metadata,template}"] },
        { "screen": "rm2",  "files": ["uxtpl_android_four_col_rm2.{...}"] }
      ],
      "thumb": "data:image/svg+xml;base64,...",  // reuse iconData, or a richer preview
      "bytes": 41234
    }
  ]
}
```

This is a small, additive change to `build.py` (it already collects `rows` and validates JSON;
just also serialize this shape). The taxonomy fields (`formFactor`, `model`) come straight from
the generator's existing `DEVICES`/`LAYOUTS`/`VARIANTS` loops.

---

## 4. Decoupling generation from the app

**Recommendation: ship a pre-built catalog; do not run Python on the user's machine.**

- Generation stays a **build/CI step** (`python3 generators/build.py`), output committed to
  `catalog/` and bundled into the app as a Tauri resource.
- The app is then **dependency-free** for end users (no Python, no toolchain).
- Adding "desktop / web / tablet / more phones" becomes purely a **content task** in the
  generators (§6) plus a rebuild — the app gains them automatically by reading the new
  `catalog.json`.
- **Deferred / optional:** in-app *custom* template generation (user-defined device sizes).
  That would require either porting the generators to Rust or shipping a Python sidecar; not
  worth it for v1. Keep it as a stretch goal (§7).

---

## 5. Phasing

| Phase | Deliverable | Notes |
|---|---|---|
| **0. Restructure** | Monorepo layout (§2.1); `install.sh` still works | Pure move; no behavior change |
| **1. Manifest** | `build.py` emits `catalog/catalog.json` (§3) | Small, low-risk |
| **2. App shell + library** | Tauri app that browses the catalog, filters, and saves a selection **profile** — fully useful offline, no device yet | De-risks the UI before touching SSH |
| **3. Install engine** | Rust `transport` (tar-over-SSH) + `device` detect + `secrets`; **Install selection → device** with progress | The core value; reuses the proven tar-pipe |
| **4. Sync + manage** | `list_installed`, diff view, mirror/additive, model-aware coord set, uninstall | "Don't dump hundreds on the tablet" lands here |
| **5. Catalog expansion** | Tablet + desktop-app + desktop/web templates; more phone models (§6) | Generator/content work; ships as data |
| **6. Onboarding & packaging** | Paper Pro **backup/restore wizard** (cloud-first; local rmdoc fallback) + Dev-Mode guidance; Tauri updater; mac notarization (reuse your signing setup); Windows signing | Backup softens the wipe (§2.5) |
| **7. (Stretch)** | In-app custom-device generator | Port generators to Rust or Python sidecar |

Phases 2 → 3 → 4 are the spine. After Phase 4 you have the product you described.

---

## 6. Extending the catalog (more models + new form factors)

Today the generator's device model is `vb` + body/screen/inset/notch/buttons dicts
(`ANDROID`, `IPHONE` in `gen_templates.py`) iterated as `DEVICES × LAYOUTS × VARIANTS`.

To generalize:

- Refactor device specs into `generators/devices/` as data (one spec per model), each tagged
  with a **`formFactor`** (`phone | tablet | desktop | web`). Phones keep the current
  notch/island/button drawing; tablets/desktops get their own frame drawer (bezel, no notch;
  desktop = a browser-chrome or window-chrome frame; web = a plain viewport rectangle at a
  chosen breakpoint, e.g. 1440/1280/375).
- Layouts likely differ by form factor (a desktop "1UP" wants one big landscape frame; a phone
  "4UP" wants four portrait frames) — make `LAYOUTS` selectable per form factor instead of a
  single global list.
- Keep the **`uxtpl_` prefix** and extend the base-name scheme to
  `uxtpl_{formFactor}_{model}_{layout}_{variant}[_rm2]` so removal/diffing stays trivial.
- The dual-coordinate (`rmPP` / `rm2`) emission in `build.py` is orthogonal and keeps working
  for every new form factor for free.

This is exactly where the "configure which to install" feature pays off: once there are
hundreds of designs across many models, the app's profile + mirror-sync keeps the tablet's
picker to just the dozen the user actually wants.

---

## 7. Risks & gotchas (call these out early)

- **Paper Pro requires Developer Mode, which erases the tablet.** Unavoidable for SSH; mitigated
  by the **cloud-first backup/restore wizard (§2.5)** — encourage reMarkable sync, fall back to a
  local rmdoc backup over the USB Web Interface, and gate the wipe behind one of them. (rM2 /
  Paper Move need no Dev Mode and skip this.)
- **No SFTP subsystem on device** → use the **tar-over-`exec`** transport, not `russh-sftp`
  (§2.2). This is the single most important implementation detail.
- **Password changes after every software update** → store in keychain but handle auth failure
  gracefully and prompt for re-entry; link "where to find it".
- **Host key changes after updates** → don't pin; mirror the `ssh-keygen -R` recovery.
- **Thumbnail cache by filename on device** → if a design's art changes but its filename
  doesn't, the tablet shows the stale thumbnail; sync should `rm` then re-copy changed files (or
  bump filename on art changes), then restart.
- **Software 3.17+** required for the Methods format → detect version on connect and warn.
- **Cross-platform packaging/signing** → mac notarization (you have prior art), Windows signing,
  Linux AppImage/deb. Tauri's bundler + updater handle most of it.

---

## 8. Decisions

**Resolved:**

- **Picker layouts:** secondary layout-chip filter, **all-on by default**; device×background
  matrix stays primary (§2.4).
- **Count semantics:** count = **distinct designs visible on the tablet**, not files (§2.4).
- **Not-yet-built cells:** **hidden** until present in `catalog.json`; backlog tracked in
  `PROJECT-MANAGEMENT.md`.

**Still open (recommendations in bold):**

1. **Generation:** pre-built catalog bundled in the app **(recommended)** vs. live in-app
   generation (defer to Phase 7).
2. **Frontend framework:** **Svelte** (lean) vs. React (ecosystem). Either is fine.
3. **Sync default:** **mirror** (tablet matches your selection exactly) vs. additive-only.
   Recommend mirror as default with an additive toggle.
4. **Coord sets:** **push only the connected model's set by default** (saves space) vs. always
   push both and rely on `supportedScreens`.
