import "./style.css";
import { loadCatalog, type Catalog, type Design } from "./catalog";
import { renderTemplateSvg } from "./renderer";
import { api, isTauri, type DeviceInfo } from "./tauri";

// ---- icons (inline, stroke = currentColor) ----
const ICON: Record<string, string> = {
  templates: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  device: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="2.5" width="14" height="19" rx="2.5"/><line x1="9.5" y1="18.5" x2="14.5" y2="18.5"/></svg>`,
  backup: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v11"/><path d="M8 10l4 4 4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8 2 2 0 11-2.8 2.8 1.6 1.6 0 00-2.7.7 1.6 1.6 0 01-3.2 0 1.6 1.6 0 00-2.7-.7 2 2 0 11-2.8-2.8 1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.4-1 1.6 1.6 0 010-3.2 1.6 1.6 0 001.4-1 1.6 1.6 0 00-.3-1.8 2 2 0 112.8-2.8 1.6 1.6 0 001.8.3h.1a1.6 1.6 0 001-1.4 1.6 1.6 0 013.2 0 1.6 1.6 0 001 1.4 1.6 1.6 0 001.8-.3 2 2 0 112.8 2.8 1.6 1.6 0 00-.3 1.8v.1a1.6 1.6 0 001.4 1 1.6 1.6 0 010 3.2 1.6 1.6 0 00-1.4 1z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>`,
  selectAll: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/></svg>`,
  clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>`,
  install: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v9"/><path d="M8.5 8.5L12 12l3.5-3.5"/><rect x="5" y="13" width="14" height="8" rx="2"/></svg>`,
};

// ---- state ----
let catalog: Catalog;
const selectedCells = new Set<string>(); // "model|variant"
const enabledLayouts = new Set<string>();
let screen: "templates" | "device" | "backup" | "settings" = "templates";
let query = "";

// device/backup state
let deviceIp = "10.11.99.1";
let devicePassword = "";
let remember = false;
let deviceInfo: DeviceInfo | null = null;
let installed: string[] | null = null;
let mirror = true;

const cellKey = (model: string, variant: string) => `${model}|${variant}`;

function selectedDesigns(): Design[] {
  return catalog.designs.filter(
    (d) => selectedCells.has(cellKey(d.model, d.variant)) && enabledLayouts.has(d.layout),
  );
}
function visibleDesigns(): Design[] {
  const q = query.trim().toLowerCase();
  const sel = selectedDesigns();
  return q ? sel.filter((d) => d.visibleName.toLowerCase().includes(q)) : sel;
}
const thumbSvg = (d: Design) => renderTemplateSvg(d.template, { stroke: "#3a3a3a" });

const app = document.getElementById("app")!;

// ---- shell (built once) ----
function mountShell() {
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark"></span><span class="brand-name">UX Templates</span></div>
      <nav class="nav"><button class="nav-item" data-screen="templates">${ICON.templates}<span>Templates</span></button></nav>
      <div class="nav-label">Tablet</div>
      <nav class="nav">
        <button class="nav-item" data-screen="device">${ICON.device}<span>My reMarkable</span></button>
        <button class="nav-item" data-screen="backup">${ICON.backup}<span>Backup</span></button>
      </nav>
      <div class="sidebar-spacer"></div>
      <nav class="nav"><button class="nav-item" data-screen="settings">${ICON.settings}<span>Settings</span></button></nav>
    </aside>
    <main class="content">
      <div class="toolbar">
        <div class="toolbar-actions">
          <button class="tool" data-act="all">${ICON.selectAll}<span>Select all</span></button>
          <button class="tool" data-act="clear">${ICON.clear}<span>Clear</span></button>
          <span class="tool-sep"></span>
          <button class="tool primary" data-act="install">${ICON.install}<span>Install…</span></button>
        </div>
        <label class="search">${ICON.search}<input type="search" placeholder="Search templates" /></label>
      </div>
      <div class="content-body" id="body"></div>
    </main>
  `;

  app.querySelectorAll<HTMLButtonElement>(".nav-item").forEach((b) =>
    b.addEventListener("click", () => go(b.dataset.screen as typeof screen)),
  );
  app.querySelector<HTMLInputElement>(".search input")!.addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value;
    renderBody();
  });
  app.querySelectorAll<HTMLButtonElement>(".tool").forEach((b) =>
    b.addEventListener("click", () => {
      const act = b.dataset.act;
      if (act === "all") {
        for (const m of catalog.axes.models)
          for (const v of catalog.axes.variants) selectedCells.add(cellKey(m.key, v.key));
        go("templates");
      } else if (act === "clear") {
        selectedCells.clear();
        go("templates");
      } else if (act === "install") {
        go("device"); // installing happens on the device screen
      }
    }),
  );
  syncNav();
}

function go(s: typeof screen) {
  screen = s;
  syncNav();
  renderBody();
}

function syncNav() {
  app.querySelectorAll<HTMLButtonElement>(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.screen === screen),
  );
  const t = screen === "templates";
  app.querySelector<HTMLElement>(".toolbar-actions")!.style.visibility = t ? "visible" : "hidden";
  app.querySelector<HTMLElement>(".search")!.style.visibility = t ? "visible" : "hidden";
}

// ---- body dispatch ----
function renderBody() {
  const body = document.getElementById("body")!;
  if (screen === "templates") renderTemplates(body);
  else if (screen === "device") renderDevice(body);
  else if (screen === "backup") renderBackup(body);
  else body.innerHTML = settingsPlaceholder();
}

// ---- templates screen ----
function renderTemplates(body: HTMLElement) {
  const { models, variants, layouts } = catalog.axes;
  const sel = selectedDesigns();
  body.innerHTML = `
    <div class="page-head"><h1>Templates</h1><div class="count-pill"><strong>${sel.length}</strong> selected</div></div>
    <div class="panel">
      <table class="matrix">
        <thead><tr><th></th>${variants.map((v) => `<th class="col-head" data-variant="${v.key}">${v.name}</th>`).join("")}</tr></thead>
        <tbody>${models
          .map(
            (m) => `<tr><th class="row-head" data-model="${m.key}">${m.name}</th>${variants
              .map((v) => {
                const on = selectedCells.has(cellKey(m.key, v.key));
                return `<td><button class="cell ${on ? "on" : ""}" data-cell="${cellKey(m.key, v.key)}">${on ? "✓" : ""}</button></td>`;
              })
              .join("")}</tr>`,
          )
          .join("")}</tbody>
      </table>
      <div class="layouts"><span class="lbl">Layouts</span>${layouts
        .map((l) => `<button class="chip ${enabledLayouts.has(l.key) ? "on" : ""}" data-layout="${l.key}">${l.name}</button>`)
        .join("")}</div>
    </div>
    <div class="grid" id="grid"></div>
  `;
  body.querySelectorAll<HTMLButtonElement>("button.cell").forEach((btn) =>
    btn.addEventListener("click", () => {
      const k = btn.dataset.cell!;
      selectedCells.has(k) ? selectedCells.delete(k) : selectedCells.add(k);
      renderBody();
    }),
  );
  body.querySelectorAll<HTMLElement>("th.row-head").forEach((th) =>
    th.addEventListener("click", () => toggleGroup(catalog.axes.variants.map((v) => cellKey(th.dataset.model!, v.key)))),
  );
  body.querySelectorAll<HTMLElement>("th.col-head").forEach((th) =>
    th.addEventListener("click", () => toggleGroup(catalog.axes.models.map((m) => cellKey(m.key, th.dataset.variant!)))),
  );
  body.querySelectorAll<HTMLButtonElement>("button.chip").forEach((btn) =>
    btn.addEventListener("click", () => {
      const l = btn.dataset.layout!;
      enabledLayouts.has(l) ? enabledLayouts.delete(l) : enabledLayouts.add(l);
      renderBody();
    }),
  );
  renderGrid();
}

function toggleGroup(keys: string[]) {
  const allOn = keys.every((k) => selectedCells.has(k));
  keys.forEach((k) => (allOn ? selectedCells.delete(k) : selectedCells.add(k)));
  renderBody();
}

function renderGrid() {
  const grid = document.getElementById("grid")!;
  const designs = visibleDesigns();
  if (!selectedDesigns().length) {
    grid.innerHTML = `<div class="empty">Pick a device and a background above to see templates.</div>`;
    return;
  }
  if (!designs.length) {
    grid.innerHTML = `<div class="empty">No templates match “${query}”.</div>`;
    return;
  }
  grid.innerHTML = designs
    .map(
      (d) => `<figure class="card" data-id="${d.id}">
        <div class="card-thumb"><div class="svg-wrap">${thumbSvg(d)}</div></div>
        <figcaption><div class="card-title">${d.visibleName}</div>
          <div class="card-sub">${d.modelName} · ${d.layoutLabel} · ${d.variantName}</div></figcaption>
      </figure>`,
    )
    .join("");
  const byId = new Map(designs.map((d) => [d.id, d]));
  grid.querySelectorAll<HTMLElement>(".card").forEach((fig) =>
    fig.addEventListener("click", () => zoom(byId.get(fig.dataset.id!)!)),
  );
}

// ---- device screen ----
function renderDevice(body: HTMLElement) {
  const sel = selectedDesigns();
  const files = sel.flatMap((d) => d.targets.flatMap((t) => t.files));
  const connected = !!deviceInfo?.reachable;

  body.innerHTML = `
    <div class="page-head"><h1>My reMarkable</h1></div>
    ${isTauri() ? "" : `<div class="banner">Device actions run in the desktop app. In this browser preview the tablet can't be reached.</div>`}

    <div class="panel form">
      <div class="field"><label>Device address</label><input id="ip" value="${deviceIp}" placeholder="10.11.99.1" /></div>
      <div class="field"><label>Password <span class="hint">(Settings → Help → About → GPLv3 Compliance)</span></label>
        <input id="pw" type="password" value="${devicePassword}" placeholder="device password" /></div>
      <label class="checkrow"><input id="remember" type="checkbox" ${remember ? "checked" : ""}/> Remember password (keychain)</label>
      <div class="row">
        <button class="btn primary" id="test">Test connection</button>
        <span id="status" class="status">${connected ? statusLine(deviceInfo!) : ""}</span>
      </div>
    </div>

    <div class="panel">
      <h3>Install selection</h3>
      <p class="muted">${sel.length} templates selected (${files.length} files).
        <a class="link" id="gopick">Change selection</a></p>
      <label class="checkrow"><input id="mirror" type="checkbox" ${mirror ? "checked" : ""}/>
        Mirror — remove templates on the tablet that aren't selected</label>
      <div class="row">
        <button class="btn primary" id="install" ${connected && sel.length ? "" : "disabled"}>Install ${sel.length} to tablet</button>
        <button class="btn ghost" id="refresh" ${connected ? "" : "disabled"}>Refresh installed</button>
        <button class="btn danger" id="wipe" ${connected ? "" : "disabled"}>Uninstall all</button>
        <span id="result" class="status"></span>
      </div>
      ${installed ? `<p class="muted small">${installed.length} template files currently on the tablet.</p>` : ""}
    </div>
  `;

  const $ = <T extends HTMLElement>(id: string) => body.querySelector<T>("#" + id)!;
  $("ip").addEventListener("input", (e) => (deviceIp = (e.target as HTMLInputElement).value));
  $("pw").addEventListener("input", (e) => (devicePassword = (e.target as HTMLInputElement).value));
  $("remember").addEventListener("change", (e) => (remember = (e.target as HTMLInputElement).checked));
  $("mirror").addEventListener("change", (e) => (mirror = (e.target as HTMLInputElement).checked));
  $("gopick").addEventListener("click", () => go("templates"));

  $("test").addEventListener("click", async () => {
    const s = $("status");
    s.textContent = "Connecting…";
    try {
      deviceInfo = await api.testConnection(deviceIp, devicePassword);
      if (remember) await api.savePassword(deviceIp, devicePassword).catch(() => {});
      installed = await api.listInstalled(deviceIp, devicePassword).catch(() => null);
      renderBody();
    } catch (e) {
      s.textContent = "✕ " + errText(e);
      deviceInfo = null;
    }
  });

  $("install").addEventListener("click", async () => {
    const r = $("result");
    r.textContent = "Installing…";
    try {
      const rep = await api.applyInstall(sel.map((d) => d.id), deviceIp, devicePassword, mirror);
      installed = await api.listInstalled(deviceIp, devicePassword).catch(() => installed);
      r.textContent = `✓ Installed ${rep.installed} files${rep.removed ? `, removed ${rep.removed}` : ""}. Restarted the tablet UI.`;
      renderResultOnly(body, r.textContent);
    } catch (e) {
      r.textContent = "✕ " + errText(e);
    }
  });

  $("refresh").addEventListener("click", async () => {
    installed = await api.listInstalled(deviceIp, devicePassword).catch(() => installed);
    renderBody();
  });
  $("wipe").addEventListener("click", async () => {
    const r = $("result");
    r.textContent = "Removing…";
    try {
      await api.uninstallAll(deviceIp, devicePassword);
      installed = [];
      r.textContent = "✓ Removed all installed templates.";
    } catch (e) {
      r.textContent = "✕ " + errText(e);
    }
  });

  // prefill remembered password
  if (isTauri() && !devicePassword) {
    api.getPassword(deviceIp).then((p) => {
      if (p) {
        devicePassword = p;
        const el = body.querySelector<HTMLInputElement>("#pw");
        if (el) el.value = p;
      }
    }).catch(() => {});
  }
}

function renderResultOnly(body: HTMLElement, text: string) {
  const r = body.querySelector<HTMLElement>("#result");
  if (r) r.textContent = text;
}

const statusLine = (d: DeviceInfo) =>
  `✓ Connected${d.model ? ` · ${d.model}` : ""}${d.software ? ` · ${d.software}` : ""}`;

// ---- backup screen ----
function renderBackup(body: HTMLElement) {
  body.innerHTML = `
    <div class="page-head"><h1>Backup</h1></div>
    ${isTauri() ? "" : `<div class="banner">Backup runs in the desktop app over your tablet's USB Web Interface.</div>`}

    <div class="panel recommend">
      <h3>Use reMarkable's cloud sync <span class="tag">recommended</span></h3>
      <p>If you have a reMarkable account, the simplest, safest backup is the built-in cloud sync.
        Make sure sync is on and shows <em>“all synced”</em>. After enabling Developer Mode (which
        erases a Paper Pro), sign back in and your notebooks — and account settings — restore
        automatically. If that's you, you're done here.</p>
    </div>

    <div class="panel">
      <h3>No cloud sync? Back up locally</h3>
      <p class="muted">Pulls every notebook as a lossless <code>.rmdoc</code> over the USB Web
        Interface (enable it on the tablet: Settings → Storage → USB web interface). Documents
        only — not custom templates or settings.</p>
      <div class="row">
        <button class="btn primary" id="backup">Choose folder &amp; back up…</button>
        <span id="bresult" class="status"></span>
      </div>
    </div>
  `;

  body.querySelector<HTMLButtonElement>("#backup")!.addEventListener("click", async () => {
    const r = body.querySelector<HTMLElement>("#bresult")!;
    try {
      const dest = await api.pickFolder();
      if (!dest) return;
      r.textContent = "Backing up… (this can take a while for large libraries)";
      const rep = await api.backupDocuments(dest);
      r.textContent = `✓ Backed up ${rep.documents} notebooks to ${rep.dest}`;
    } catch (e) {
      r.textContent = "✕ " + errText(e);
    }
  });
}

function settingsPlaceholder(): string {
  return `<div class="placeholder"><div class="ph-icon">${ICON.settings}</div>
    <h2>Settings</h2><p>Connection defaults, sync mode, and update preferences will live here.</p></div>`;
}

function errText(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
}

function zoom(d: Design) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<div class="modal-card"><div class="modal-svg">${thumbSvg(d)}</div><div class="modal-name">${d.visibleName}</div></div>`;
  modal.addEventListener("click", () => modal.remove());
  document.body.appendChild(modal);
}

// ---- boot ----
loadCatalog()
  .then((c) => {
    catalog = c;
    c.axes.layouts.forEach((l) => enabledLayouts.add(l.key));
    if (new URLSearchParams(location.search).get("select") === "all") {
      c.axes.models.forEach((m) => c.axes.variants.forEach((v) => selectedCells.add(cellKey(m.key, v.key))));
    }
    const s = new URLSearchParams(location.search).get("screen");
    if (s === "device" || s === "backup" || s === "settings") screen = s;
    mountShell();
    renderBody();
  })
  .catch((err) => {
    app.innerHTML = `<p class="error">Could not load catalog: ${err.message}</p>`;
  });
