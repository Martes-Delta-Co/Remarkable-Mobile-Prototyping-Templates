import "./style.css";
import { loadCatalog, type Catalog, type Design } from "./catalog";
import { renderTemplateSvg } from "./renderer";
import { api, isTauri, type DeviceInfo } from "./tauri";
import { cellKey, selectDesigns, selectedFiles } from "./selection";

// ---- icons (inline, stroke = currentColor) ----
const ICON: Record<string, string> = {
  templates: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  device: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="2.5" width="14" height="19" rx="2.5"/><line x1="9.5" y1="18.5" x2="14.5" y2="18.5"/></svg>`,
  backup: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v11"/><path d="M8 10l4 4 4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>`,
  selectAll: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/></svg>`,
  clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>`,
  install: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v9"/><path d="M8.5 8.5L12 12l3.5-3.5"/><rect x="5" y="13" width="14" height="8" rx="2"/></svg>`,
};

// ---- state ----
let catalog: Catalog;
const selectedCells = new Set<string>(); // "model|variant"
const enabledLayouts = new Set<string>();
let screen: "templates" | "device" | "backup" = "templates";

// device/backup state
let deviceIp = "10.11.99.1";
let devicePassword = "";
let remember = false;
let deviceInfo: DeviceInfo | null = null;
let installed: string[] | null = null;
let mirror = true;

function selectedDesigns(): Design[] {
  return selectDesigns(catalog.designs, selectedCells, enabledLayouts);
}
const thumbSvg = (d: Design) => renderTemplateSvg(d.template, { stroke: "#3a3a3a" });

const app = document.getElementById("app")!;

// ---- shell (built once) ----
function mountShell() {
  app.innerHTML = `
    <aside class="sidebar">
      <nav class="nav"><button class="nav-item" data-screen="templates">${ICON.templates}<span>Templates</span></button></nav>
      <div class="nav-label">Tablet</div>
      <nav class="nav">
        <button class="nav-item" data-screen="device">${ICON.device}<span>My reMarkable</span></button>
        <button class="nav-item" data-screen="backup">${ICON.backup}<span>Backup</span></button>
      </nav>
      <div class="sidebar-spacer"></div>
    </aside>
    <main class="content">
      <div class="toolbar">
        <div class="toolbar-actions">
          <button class="tool" data-act="all">${ICON.selectAll}<span>Select all</span></button>
          <button class="tool" data-act="clear">${ICON.clear}<span>Clear</span></button>
          <span class="tool-sep"></span>
          <button class="tool primary" data-act="install">${ICON.install}<span>Install…</span></button>
        </div>
      </div>
      <div class="content-body" id="body"></div>
    </main>
  `;

  app.querySelectorAll<HTMLButtonElement>(".nav-item").forEach((b) =>
    b.addEventListener("click", () => go(b.dataset.screen as typeof screen)),
  );
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
        // installing happens on the Templates screen; needs a connection first
        if (!deviceInfo?.reachable) {
          go("device");
          return;
        }
        const r = document.querySelector<HTMLElement>("#instresult");
        runInstall((t) => r && (r.textContent = t));
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
}

// ---- body dispatch ----
function renderBody() {
  const body = document.getElementById("body")!;
  if (screen === "device") renderDevice(body);
  else if (screen === "backup") renderBackup(body);
  else renderTemplates(body);
}

// ---- templates screen ----
function renderTemplates(body: HTMLElement) {
  const { models, variants, layouts } = catalog.axes;
  const sel = selectedDesigns();
  const files = selectedFiles(sel);
  const connected = !!deviceInfo?.reachable;
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

    <div class="panel install-panel">
      <h3>Install to your reMarkable</h3>
      <p class="muted">${
        connected
          ? `Connected${deviceInfo!.model ? ` to ${deviceInfo!.model}` : ""}. <strong>${sel.length}</strong> templates (${files.length} files) ready to install.`
          : `Not connected yet. <a class="link" id="goDevice">Set up your reMarkable →</a> to install.`
      }</p>
      <label class="checkrow"><input id="mirror" type="checkbox" ${mirror ? "checked" : ""}/>
        Mirror — remove templates on the tablet that aren't selected</label>
      <div class="row">
        <button class="btn primary" id="installNow" ${connected && sel.length ? "" : "disabled"}>Install ${sel.length} to tablet</button>
        <span id="instresult" class="status"></span>
      </div>
    </div>
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
  body.querySelector<HTMLInputElement>("#mirror")?.addEventListener(
    "change",
    (e) => (mirror = (e.target as HTMLInputElement).checked),
  );
  body.querySelector<HTMLElement>("#goDevice")?.addEventListener("click", () => go("device"));
  body.querySelector<HTMLButtonElement>("#installNow")?.addEventListener("click", () => {
    const r = body.querySelector<HTMLElement>("#instresult")!;
    runInstall((t) => (r.textContent = t));
  });
  renderGrid();
}

// shared install routine (used by the Templates screen + toolbar button)
async function runInstall(onResult: (text: string) => void) {
  const sel = selectedDesigns();
  if (!sel.length) return;
  onResult("Installing…");
  try {
    const rep = await api.applyInstall(sel.map((d) => d.id), deviceIp, devicePassword, mirror);
    installed = await api.listInstalled(deviceIp, devicePassword).catch(() => installed);
    onResult(`✓ Installed ${rep.installed} files${rep.removed ? `, removed ${rep.removed}` : ""}. Restarted the tablet UI.`);
  } catch (e) {
    onResult("✕ " + errText(e));
  }
}

function toggleGroup(keys: string[]) {
  const allOn = keys.every((k) => selectedCells.has(k));
  keys.forEach((k) => (allOn ? selectedCells.delete(k) : selectedCells.add(k)));
  renderBody();
}

function renderGrid() {
  const grid = document.getElementById("grid")!;
  const designs = selectedDesigns();
  if (!designs.length) {
    grid.innerHTML = `<div class="empty">Pick a device and a background above to see templates.</div>`;
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
  const connected = !!deviceInfo?.reachable;

  body.innerHTML = `
    <div class="page-head"><h1>My reMarkable</h1></div>
    ${isTauri() ? "" : `<div class="banner">Device actions run in the desktop app. In this browser preview the tablet can't be reached.</div>`}

    <div class="panel form">
      <div class="field"><label>Device address</label>
        <input id="ip" value="${deviceIp}" placeholder="10.11.99.1" />
        <span class="hint">USB cable → always <code>10.11.99.1</code>. Wi-Fi → use the IP shown under Settings → General → Help → About → Copyrights and licenses → “GPLv3 Compliance”.</span>
      </div>
      <div class="field"><label>Password</label>
        <input id="pw" type="password" value="${devicePassword}" placeholder="device password" />
        <span class="hint">Settings → General → Help → About → Copyrights and licenses → “GPLv3 Compliance”. It changes after every software update.</span>
      </div>
      <label class="checkrow"><input id="remember" type="checkbox" ${remember ? "checked" : ""}/> Remember password (keychain)</label>
      <div class="row">
        <button class="btn primary" id="test">Test connection</button>
        <span id="status" class="status">${connected ? statusLine(deviceInfo!) : ""}</span>
      </div>
    </div>

    <div class="panel">
      <h3>Installed templates</h3>
      ${
        connected
          ? `<p class="muted">${
              installed
                ? `<strong>${installed.length}</strong> template files currently on the tablet.`
                : "Checking what's installed…"
            } Choose and install templates from the <a class="link" id="gopick">Templates</a> tab.</p>
            <div class="row">
              <button class="btn ghost" id="refresh">Refresh</button>
              <button class="btn danger" id="wipe">Uninstall all</button>
              <span id="result" class="status"></span>
            </div>`
          : `<p class="muted">Connect above to see what's installed, then pick templates on the
              <a class="link" id="gopick">Templates</a> tab to install them.</p>`
      }
    </div>

    <details class="panel help">
      <summary>Connecting: USB vs Wi-Fi</summary>
      <p class="muted"><strong>USB (recommended).</strong> Plug in the cable and use <code>10.11.99.1</code>.
        Works on both the reMarkable 2 and Paper Pro and needs no network setup.</p>
      <p class="muted"><strong>Wi-Fi.</strong> Put the tablet and this computer on the same network, then use the
        Wi-Fi IP listed under Settings → General → Help → About → Copyrights and licenses → “GPLv3 Compliance”.
        SSH still has to be available — on the Paper Pro that means Developer Mode is on.</p>
    </details>

    <details class="panel help">
      <summary>Paper Pro: turn on Developer Mode first</summary>
      <p class="muted">The <strong>reMarkable Paper Pro</strong> only allows SSH access after you enable
        <strong>Developer Mode</strong>, and <strong>enabling it erases the tablet</strong> — back up or
        cloud-sync before you start. On the tablet: Settings → General → Software (Advanced) → Developer mode.
        Full walkthrough: <code>docs/install-paper-pro.md</code>.</p>
      <p class="muted">The <strong>reMarkable 2</strong> does <strong>not</strong> need Developer Mode — SSH
        works out of the box.</p>
    </details>
  `;

  const $ = <T extends HTMLElement>(id: string) => body.querySelector<T>("#" + id);
  $<HTMLInputElement>("ip")!.addEventListener("input", (e) => (deviceIp = (e.target as HTMLInputElement).value));
  $<HTMLInputElement>("pw")!.addEventListener("input", (e) => (devicePassword = (e.target as HTMLInputElement).value));
  $<HTMLInputElement>("remember")!.addEventListener("change", (e) => (remember = (e.target as HTMLInputElement).checked));
  $("gopick")?.addEventListener("click", () => go("templates"));

  $("test")!.addEventListener("click", async () => {
    const s = $("status")!;
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

  $("refresh")?.addEventListener("click", async () => {
    installed = await api.listInstalled(deviceIp, devicePassword).catch(() => installed);
    renderBody();
  });
  $("wipe")?.addEventListener("click", async () => {
    const r = $("result")!;
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
    if (s === "device" || s === "backup") screen = s;
    mountShell();
    renderBody();
  })
  .catch((err) => {
    app.innerHTML = `<p class="error">Could not load catalog: ${err.message}</p>`;
  });
