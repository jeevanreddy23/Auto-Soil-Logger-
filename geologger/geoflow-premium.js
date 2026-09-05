(function (root) {
  "use strict";

  if (!root || !root.document || !root.GeoFlowUICore) return;

  const Core = root.GeoFlowUICore;
  const document = root.document;
  const EXTRA_TABS = ["bh-overview", "dcp", "groundwater", "site-map", "documents", "team", "validation", "pipeline"];
  const EXTRA_SLUGS = {
    pipeline: "pipeline",
    "bh-overview": "borehole-overview",
    dcp: "dcp",
    groundwater: "groundwater",
    "site-map": "site-map",
    documents: "documents",
    team: "team",
    validation: "validation"
  };
  const PROJECT_TABS = [
    ["pipeline", "git-branch", "Workflow"],
    ["dashboard", "layout-dashboard", "Overview"],
    ["boreholes", "map-pin", "Boreholes"],
    ["site-map", "map", "Site Map"],
    ["fieldwork", "hard-hat", "Fieldwork"],
    ["samples", "package", "Samples"],
    ["laboratory", "flask-conical", "Laboratory"],
    ["documents", "folder-open", "Documents"],
    ["preview", "file-text", "Reports"],
    ["team", "users", "Team"],
    ["settings", "settings", "Settings"]
  ];
  const BOREHOLE_TABS = [
    ["bh-overview", "activity", "Overview"],
    ["soil", "layers", "Soil"],
    ["rock", "mountain", "Rock"],
    ["corebox", "image", "Corebox"],
    ["spt", "gauge", "SPT"],
    ["dcp", "chart-no-axes-combined", "DCP"],
    ["samples", "package", "Samples"],
    ["groundwater", "waves", "Groundwater"],
    ["photos", "camera", "Photos"],
    ["validation", "shield-check", "Review"],
    ["preview", "file-text", "PDF"]
  ];
  const BOREHOLE_CONTEXT = new Set(["bh-overview", "soil", "rock", "corebox", "spt", "dcp", "groundwater", "validation"]);
  const SECTION_LABELS = {
    pipeline: "Delivery Workflow",
    "bh-overview": "Borehole Overview",
    dcp: "DCP",
    groundwater: "Groundwater",
    "site-map": "Site Map",
    documents: "Documents",
    team: "Team",
    validation: "Validation"
  };

  let shellQueued = false;
  let activeValidationFilter = "all";
  let validationReturnFocus = null;
  let activeDialog = null;
  let dashboardRenderer = null;
  let documentRequestToken = 0;
  let navigationLayer = "project";

  function state() {
    return typeof S !== "undefined" ? S : { project: {}, boreholes: [], logs: {} };
  }

  function projectsState() {
    return typeof PJ !== "undefined" && PJ && Array.isArray(PJ.projects) ? PJ : { activePid: "", projects: [] };
  }

  function currentProject() {
    try { return typeof pjActive === "function" ? pjActive() : null; }
    catch (error) { return null; }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function icon(name, className) {
    return `<i data-lucide="${escapeHtml(name)}"${className ? ` class="${escapeHtml(className)}"` : ""} aria-hidden="true"></i>`;
  }

  function paintIcons() {
    if (!root.lucide) return;
    const pending = document.querySelectorAll("i[data-lucide]");
    if (!pending.length) return;
    pending.forEach((node) => {
      node.setAttribute("data-lucide-pending", node.getAttribute("data-lucide"));
      node.removeAttribute("data-lucide");
    });
    root.lucide.createIcons({ nameAttr: "data-lucide-pending", attrs: { "stroke-width": 1.8, "aria-hidden": "true" } });
  }

  function saveState() {
    try {
      if (typeof save === "function") save();
      else root.localStorage.setItem("autosoil-logger", JSON.stringify(state()));
    } catch (error) {
      root.localStorage.setItem("autosoil-logger", JSON.stringify(state()));
    }
  }

  function activeLog() {
    const source = state();
    if (!source.logs) source.logs = {};
    if (!source.logs[source.activeBh]) source.logs[source.activeBh] = typeof blankLogs === "function" ? blankLogs() : {};
    const log = source.logs[source.activeBh];
    for (const key of ["soil", "rock", "spt", "dcp", "samples", "photos", "groundwater"]) {
      if (!Array.isArray(log[key])) log[key] = [];
    }
    if (!log.gw || typeof log.gw !== "object") log.gw = {};
    if (!log.corebox || typeof log.corebox !== "object") log.corebox = {};
    return log;
  }

  function activeBorehole() {
    return (state().boreholes || []).find((item) => item.id === state().activeBh) || null;
  }

  function projectStorageKey() {
    try { return typeof pjSyncKey === "function" ? pjSyncKey() : "__autosoil_project__"; }
    catch (error) { return "__autosoil_project__"; }
  }

  function toast(message, type) {
    let region = document.getElementById("stsToastRegion");
    if (!region) {
      region = document.createElement("div");
      region.id = "stsToastRegion";
      region.className = "sts-toast-region";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      document.body.appendChild(region);
    }
    const item = document.createElement("div");
    item.className = `sts-toast ${type || "info"}`;
    item.innerHTML = `${icon(type === "error" ? "circle-alert" : "circle-check")}<span>${escapeHtml(message)}</span><button class="sts-icon-button" type="button" aria-label="Dismiss notification" title="Dismiss">${icon("x")}</button>`;
    region.appendChild(item);
    paintIcons(item);
    item.querySelector("button").addEventListener("click", () => item.remove());
    root.setTimeout(() => item.remove(), type === "error" ? 9000 : 4500);
  }

  function ensurePage(tab) {
    let page = document.getElementById(`page-${tab}`);
    if (!page) {
      page = document.createElement("section");
      page.id = `page-${tab}`;
      page.className = "tabpage";
      page.setAttribute("aria-labelledby", `sts-tab-${tab}`);
      document.querySelector(".content").appendChild(page);
    }
    return page;
  }

  function ensureExtraPages() {
    EXTRA_TABS.forEach((tab) => {
      ensurePage(tab);
      if (typeof TABS !== "undefined" && !TABS.includes(tab)) TABS.push(tab);
    });
  }

  function enhanceLandmarks() {
    const topbar = document.querySelector(".topbar");
    const side = document.getElementById("sideNav");
    const main = document.querySelector(".main");
    const content = document.querySelector(".content");
    const right = document.querySelector(".rightpanel");
    const bottom = document.getElementById("botNav");
    if (topbar) topbar.setAttribute("role", "banner");
    if (side) { side.setAttribute("aria-label", "Primary navigation"); side.setAttribute("role", "navigation"); }
    if (main) { main.setAttribute("role", "main"); main.id = main.id || "mainContent"; }
    if (content) content.setAttribute("aria-live", "off");
    if (right) { right.setAttribute("role", "complementary"); right.setAttribute("aria-label", "Borehole context and validation"); }
    if (bottom) bottom.setAttribute("aria-label", "Phone navigation");
    const status = document.querySelector(".statusbar");
    if (status) status.setAttribute("role", "status");
  }

  function enhanceNavigation() {
    const side = document.getElementById("sideNav");
    if (!side) return;
    side.querySelectorAll("[data-sntab]").forEach((item) => {
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      const selected = item.classList.contains("on");
      if (selected) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
      if (!item.dataset.stsKeyboard) {
        item.dataset.stsKeyboard = "1";
        item.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          item.click();
        });
      }
      if (!item.title) item.title = item.textContent.replace(/\s+/g, " ").trim();
    });

    const brand = side.querySelector(".brand");
    if (brand && !document.getElementById("stsRailToggle")) {
      const toggle = document.createElement("button");
      toggle.id = "stsRailToggle";
      toggle.type = "button";
      toggle.title = "Collapse navigation";
      toggle.setAttribute("aria-label", "Collapse navigation");
      toggle.setAttribute("aria-expanded", "true");
      toggle.innerHTML = icon("panel-left-close");
      brand.appendChild(toggle);
      paintIcons(toggle);
      toggle.addEventListener("click", () => {
        const body = document.body;
        const compactByViewport = root.innerWidth <= 1180 && !body.classList.contains("sts-rail-expanded");
        const isCompact = body.classList.contains("sts-rail-compact") || compactByViewport;
        body.classList.toggle("sts-rail-compact", !isCompact);
        body.classList.toggle("sts-rail-expanded", isCompact);
        root.localStorage.setItem("geoflow-rail", isCompact ? "expanded" : "compact");
        toggle.setAttribute("aria-expanded", String(isCompact));
        toggle.setAttribute("aria-label", isCompact ? "Collapse navigation" : "Expand navigation");
        toggle.title = isCompact ? "Collapse navigation" : "Expand navigation";
        toggle.replaceChildren();
        toggle.innerHTML = icon(isCompact ? "panel-left-close" : "panel-left-open");
        paintIcons(toggle);
      });
    }
  }

  function applyRailPreference() {
    const preference = root.localStorage.getItem("geoflow-rail");
    document.body.classList.toggle("sts-rail-compact", preference === "compact");
    document.body.classList.toggle("sts-rail-expanded", preference === "expanded");
  }

  function validationData() {
    return Core.collectValidation(state());
  }

  function ensureShellTools() {
    const header = document.getElementById("gh");
    if (!header) return;
    let tools = document.getElementById("stsShellTools");
    if (!tools || tools.parentElement !== header) {
      if (tools) tools.remove();
      tools = document.createElement("div");
      tools.id = "stsShellTools";
      tools.innerHTML = `
        <button id="stsGlobalSearch" type="button" aria-label="Search GeoFlow" title="Search projects, boreholes, samples, tests or reports">
          ${icon("search")}<span class="sts-search-label">Search projects, boreholes, samples, tests or reports...</span><kbd>Ctrl K</kbd>
        </button>
        <button class="sts-icon-button" id="stsValidationButton" type="button" aria-label="Open validation" title="Validation and review">${icon("shield-check")}<span class="sts-count" hidden></span></button>
        <button class="sts-icon-button" id="stsHelp" type="button" aria-label="Open help" title="Help and keyboard shortcuts">${icon("circle-help")}</button>`;
      const spacer = header.querySelector(".sp");
      header.insertBefore(tools, spacer || null);
      tools.querySelector("#stsGlobalSearch").addEventListener("click", () => openCommandPalette(""));
      tools.querySelector("#stsValidationButton").addEventListener("click", () => openValidationDrawer());
      tools.querySelector("#stsHelp").addEventListener("click", openHelpDialog);
      paintIcons(tools);
    }
    refreshShellStatus();
  }

  function refreshShellStatus() {
    const issues = validationData();
    const summary = Core.validationSummary(issues);
    const button = document.getElementById("stsValidationButton");
    if (button) {
      const count = button.querySelector(".sts-count");
      const reviewCount = summary.error + summary.warning;
      count.hidden = reviewCount === 0;
      const nextCount = reviewCount > 99 ? "99+" : String(reviewCount);
      if (count.textContent !== nextCount) count.textContent = nextCount;
      button.setAttribute("aria-label", reviewCount ? `Open validation, ${reviewCount} issues require review` : "Open validation, no errors or warnings");
    }
    const sync = document.getElementById("syncStatus");
    if (sync) {
      const parsed = Core.syncStateFromLabel(sync.textContent, root.navigator.onLine);
      sync.dataset.syncState = parsed.id;
      sync.title = `${parsed.label}. ${parsed.detail}`;
      sync.setAttribute("aria-label", `${parsed.label}. ${parsed.detail}`);
    }
  }

  function ensureWorkspaceTabs(tab) {
    let bar = document.getElementById("stsWorkspaceTabs");
    if (!bar) {
      bar = document.createElement("nav");
      bar.id = "stsWorkspaceTabs";
      bar.setAttribute("aria-label", "Workspace navigation");
      const controlBar = document.getElementById("ctlBar");
      if (controlBar) controlBar.after(bar);
    }
    if (tab === "projects") {
      bar.hidden = true;
      document.body.classList.remove("sts-has-workspace-tabs");
      return;
    }
    const boreholeLayer = BOREHOLE_CONTEXT.has(tab) || (navigationLayer === "borehole" && ["samples", "photos", "preview"].includes(tab));
    const tabs = boreholeLayer ? BOREHOLE_TABS : PROJECT_TABS;
    bar.hidden = false;
    document.body.classList.add("sts-has-workspace-tabs");
    bar.innerHTML = tabs.map(([target, iconName, label]) => `
      <button id="sts-tab-${target}" type="button" data-workspace-tab="${target}" class="${target === tab ? "on" : ""}" ${target === tab ? 'aria-current="page"' : ""}>
        ${icon(iconName)}<span>${escapeHtml(label)}</span>
      </button>`).join("");
    bar.querySelectorAll("[data-workspace-tab]").forEach((button) => button.addEventListener("click", () => root.showTab(button.dataset.workspaceTab)));
    paintIcons(bar);
  }

  function patchControlBar(tab) {
    const label = SECTION_LABELS[tab];
    if (!label) return;
    const breadcrumb = document.querySelector("#ctlBar .bc");
    if (!breadcrumb) return;
    const project = currentProject();
    const number = project && project.number || state().project && state().project.projectNumber || "-";
    breadcrumb.innerHTML = `${escapeHtml(label)} / <b>${escapeHtml(number)}</b>${BOREHOLE_CONTEXT.has(tab) ? ` / <b>${escapeHtml(state().activeBh || "-")}</b>` : ""}`;
  }

  function commandDefinitions() {
    const active = state().activeBh || "borehole";
    return [
      { id: "command:new-project", type: "Command", icon: "folder-plus", label: "New Project", detail: "Create a structured project workspace", keywords: "create project", run: () => { root.showTab("projects"); root.setTimeout(() => { if (typeof renderWizard === "function") renderWizard(); }, 0); } },
      { id: "command:add-borehole", type: "Command", icon: "map-pin-plus", label: "Add Borehole", detail: "Add a borehole to the current project", keywords: "new location bh", run: () => { root.showTab("boreholes"); const add = document.getElementById("bhAdd") || document.getElementById("lpAddBh"); if (add) add.click(); } },
      { id: "command:open-borehole", type: "Command", icon: "activity", label: `Open ${active}`, detail: "Open the active borehole overview", keywords: "current borehole overview", run: () => root.showTab("bh-overview") },
      { id: "command:add-soil", type: "Command", icon: "layers", label: "Add Soil Interval", detail: `Add an interval to ${active}`, keywords: "soil layer record", run: () => { root.showTab("soil"); const add = document.getElementById("soilAdd"); if (add) add.click(); } },
      { id: "command:add-spt", type: "Command", icon: "gauge", label: "Add SPT", detail: `Add a field test to ${active}`, keywords: "penetration test", run: () => { root.showTab("spt"); const add = document.getElementById("sptAdd"); if (add) add.click(); } },
      { id: "command:upload-corebox", type: "Command", icon: "image-up", label: "Upload Corebox", detail: `Open image capture for ${active}`, keywords: "photo core tray", run: () => { root.showTab("corebox"); const input = document.getElementById("cbFile"); if (input) input.click(); } },
      { id: "command:validate", type: "Command", icon: "shield-check", label: "Validate Borehole", detail: "Review errors, warnings and suggestions", keywords: "qa qc review", run: () => openValidationDrawer() },
      { id: "command:generate-pdf", type: "Command", icon: "file-text", label: "Generate PDF", detail: `Generate the ${active} borehole log`, keywords: "report pdf", run: () => { root.showTab("preview"); root.setTimeout(() => { if (root.GeoFlowReports && root.GeoFlowReports.generateActive) root.GeoFlowReports.generateActive(); }, 0); } },
      { id: "command:reports", type: "Command", icon: "files", label: "Open Reports", detail: "Open the project report register", keywords: "pdf export", run: () => root.showTab("preview") },
      { id: "command:sync", type: "Command", icon: "cloud-upload", label: "Sync Data", detail: "Synchronise saved records with Cloudflare", keywords: "save upload", run: async () => { try { if (typeof pushSync === "function") await pushSync(); refreshShellStatus(); } catch (error) { toast("Sync failed. Records remain saved locally.", "error"); } } }
    ];
  }

  function closeDialog() {
    if (!activeDialog) return;
    const restore = activeDialog.restoreFocus;
    activeDialog.remove();
    activeDialog = null;
    if (restore && document.contains(restore)) restore.focus();
  }

  function trapDialogFocus(event, dialog) {
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'))
      .filter((element) => !element.hidden && element.offsetParent !== null);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function openCommandPalette(initialQuery) {
    closeDialog();
    const restoreFocus = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "sts-dialog-backdrop";
    overlay.innerHTML = `<section class="sts-command-dialog" role="dialog" aria-modal="true" aria-labelledby="stsCommandTitle">
      <h2 id="stsCommandTitle" class="sts-visually-hidden">GeoFlow command palette</h2>
      <div class="sts-command-search">${icon("search")}<input id="stsCommandInput" type="search" autocomplete="off" placeholder="Search projects, boreholes, samples, tests or reports..." aria-controls="stsCommandResults"><kbd>Esc</kbd></div>
      <div class="sts-command-results" id="stsCommandResults" role="listbox"></div>
      <div class="sts-command-foot">Use Up and Down to select, Enter to open, and Escape to close.</div>
    </section>`;
    overlay.restoreFocus = restoreFocus;
    document.body.appendChild(overlay);
    activeDialog = overlay;
    paintIcons(overlay);
    const dialog = overlay.querySelector(".sts-command-dialog");
    const input = overlay.querySelector("#stsCommandInput");
    const resultsHost = overlay.querySelector("#stsCommandResults");
    const searchSource = Core.buildSearchItems({ state: state(), projects: projectsState().projects, commands: commandDefinitions() });
    let results = [];
    let selected = 0;

    function runItem(item) {
      closeDialog();
      if (typeof item.run === "function") { item.run(); return; }
      if (item.projectId) { if (typeof pjOpen === "function") pjOpen(item.projectId); return; }
      if (item.boreholeId) {
        state().activeBh = item.boreholeId;
        saveState();
        root.showTab("bh-overview");
      }
    }

    function renderResults() {
      results = Core.searchItems(searchSource, input.value, 14);
      selected = Core.clamp(selected, 0, Math.max(0, results.length - 1));
      if (!results.length) {
        resultsHost.innerHTML = `<div class="sts-empty" style="min-height:130px"><div>${icon("search-x")}<strong>No matching project, borehole or command</strong><span>Try a project number, BH ID, test, report or action.</span></div></div>`;
        paintIcons(resultsHost);
        return;
      }
      resultsHost.innerHTML = results.map((item, index) => `
        <button class="sts-command-result ${index === selected ? "on" : ""}" id="sts-command-${index}" type="button" role="option" aria-selected="${index === selected}" data-command-index="${index}">
          ${icon(item.icon || (item.type === "Project" ? "folder" : item.type === "Borehole" ? "map-pin" : "command"))}
          <span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail || "")}</small></span><span class="type">${escapeHtml(item.type || "Command")}</span>
        </button>`).join("");
      resultsHost.querySelectorAll("[data-command-index]").forEach((button) => button.addEventListener("click", () => runItem(results[Number(button.dataset.commandIndex)])));
      input.setAttribute("aria-activedescendant", `sts-command-${selected}`);
      paintIcons(resultsHost);
    }

    input.value = initialQuery || "";
    input.addEventListener("input", () => { selected = 0; renderResults(); });
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeDialog(); });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeDialog(); return; }
      if (event.key === "ArrowDown") { event.preventDefault(); selected = Core.clamp(selected + 1, 0, Math.max(0, results.length - 1)); renderResults(); return; }
      if (event.key === "ArrowUp") { event.preventDefault(); selected = Core.clamp(selected - 1, 0, Math.max(0, results.length - 1)); renderResults(); return; }
      if (event.key === "Enter" && document.activeElement === input && results[selected]) { event.preventDefault(); runItem(results[selected]); return; }
      trapDialogFocus(event, dialog);
    });
    renderResults();
    input.focus();
  }

  function openHelpDialog() {
    closeDialog();
    const restoreFocus = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "sts-dialog-backdrop";
    overlay.innerHTML = `<section class="sts-help-dialog" role="dialog" aria-modal="true" aria-labelledby="stsHelpTitle">
      <header><div><h2 id="stsHelpTitle">GeoFlow keyboard guide</h2><p>Shortcuts stay within the current project and active borehole.</p></div><button class="sts-icon-button" type="button" data-close-dialog aria-label="Close help" title="Close">${icon("x")}</button></header>
      <div class="sts-shortcuts">
        <div><span>Open command palette</span><kbd>Ctrl / Cmd + K</kbd></div>
        <div><span>Move across a logging grid</span><kbd>Tab</kbd></div>
        <div><span>Move to the next grid row</span><kbd>Enter</kbd></div>
        <div><span>Close a dialog or drawer</span><kbd>Esc</kbd></div>
        <div><span>Corebox save annotation</span><kbd>Enter</kbd></div>
        <div><span>Corebox cancel annotation</span><kbd>Esc</kbd></div>
      </div>
    </section>`;
    overlay.restoreFocus = restoreFocus;
    document.body.appendChild(overlay);
    activeDialog = overlay;
    paintIcons(overlay);
    const dialog = overlay.querySelector(".sts-help-dialog");
    const close = overlay.querySelector("[data-close-dialog]");
    close.addEventListener("click", closeDialog);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeDialog(); });
    overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDialog(); else trapDialogFocus(event, dialog); });
    close.focus();
  }

  function ensureValidationDrawer() {
    let backdrop = document.getElementById("stsDrawerBackdrop");
    let drawer = document.getElementById("stsValidationDrawer");
    if (backdrop && drawer) return { backdrop, drawer };
    backdrop = document.createElement("div");
    backdrop.id = "stsDrawerBackdrop";
    drawer = document.createElement("aside");
    drawer.id = "stsValidationDrawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-labelledby", "stsValidationTitle");
    drawer.setAttribute("aria-hidden", "true");
    drawer.inert = true;
    document.body.append(backdrop, drawer);
    backdrop.addEventListener("click", closeValidationDrawer);
    drawer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeValidationDrawer(); }
      else trapDialogFocus(event, drawer);
    });
    return { backdrop, drawer };
  }

  function issueIcon(severity) {
    return severity === "error" ? "circle-x" : severity === "warning" ? "triangle-alert" : "lightbulb";
  }

  function renderIssueGroups(host, issues, fullPage) {
    const grouped = new Map();
    issues.forEach((issue) => {
      if (!grouped.has(issue.area)) grouped.set(issue.area, []);
      grouped.get(issue.area).push(issue);
    });
    if (!issues.length) {
      host.innerHTML = `<div class="sts-empty"><div>${icon("shield-check")}<strong>No issues in this view</strong><span>The selected validation level is clear.</span></div></div>`;
      paintIcons(host);
      return;
    }
    host.innerHTML = Array.from(grouped.entries()).map(([area, rows]) => `
      <section class="sts-issue-group"><h3>${escapeHtml(area)}</h3>${rows.map((issue) => `
        <button class="sts-issue ${issue.severity}" type="button" data-issue-id="${escapeHtml(issue.id)}">
          ${icon(issueIcon(issue.severity))}<span><strong>${escapeHtml(issue.message)}</strong><span>${escapeHtml([issue.boreholeId, issue.depth == null ? "" : Core.formatDepth(issue.depth)].filter(Boolean).join(" | "))}</span></span>${fullPage ? `<span class="area">${escapeHtml(issue.severity)}</span>` : ""}${icon("chevron-right")}
        </button>`).join("")}</section>`).join("");
    host.querySelectorAll("[data-issue-id]").forEach((button) => button.addEventListener("click", () => {
      const issue = issues.find((item) => item.id === button.dataset.issueId);
      if (issue) navigateToIssue(issue);
    }));
    paintIcons(host);
  }

  function renderValidationDrawer() {
    const { drawer } = ensureValidationDrawer();
    const allIssues = validationData();
    const summary = Core.validationSummary(allIssues);
    const filtered = activeValidationFilter === "all" ? allIssues : allIssues.filter((issue) => issue.severity === activeValidationFilter);
    drawer.innerHTML = `
      <div class="sts-drawer-head"><div><h2 id="stsValidationTitle">Validation and review</h2><p>${summary.error} errors, ${summary.warning} warnings, ${summary.suggestion} suggestions</p></div><button class="sts-icon-button" type="button" data-close-validation aria-label="Close validation" title="Close">${icon("x")}</button></div>
      <div class="sts-validation-summary">
        <button type="button" data-validation-filter="error" class="${activeValidationFilter === "error" ? "on" : ""}"><b>${summary.error}</b>Errors</button>
        <button type="button" data-validation-filter="warning" class="${activeValidationFilter === "warning" ? "on" : ""}"><b>${summary.warning}</b>Warnings</button>
        <button type="button" data-validation-filter="suggestion" class="${activeValidationFilter === "suggestion" ? "on" : ""}"><b>${summary.suggestion}</b>Suggestions</button>
      </div>
      <div class="sts-issue-list"></div>
      <div style="padding:10px 16px;border-top:1px solid var(--gf-border);display:flex;gap:8px"><button class="sts-button" type="button" data-show-all-validation>${activeValidationFilter === "all" ? "Showing all" : "Show all"}</button><button class="sts-button primary" type="button" data-open-validation-page>Open review workspace</button></div>`;
    renderIssueGroups(drawer.querySelector(".sts-issue-list"), filtered, false);
    drawer.querySelector("[data-close-validation]").addEventListener("click", closeValidationDrawer);
    drawer.querySelectorAll("[data-validation-filter]").forEach((button) => button.addEventListener("click", () => {
      activeValidationFilter = activeValidationFilter === button.dataset.validationFilter ? "all" : button.dataset.validationFilter;
      renderValidationDrawer();
    }));
    drawer.querySelector("[data-show-all-validation]").addEventListener("click", () => { activeValidationFilter = "all"; renderValidationDrawer(); });
    drawer.querySelector("[data-open-validation-page]").addEventListener("click", () => { closeValidationDrawer(); root.showTab("validation"); });
    paintIcons(drawer);
  }

  function openValidationDrawer(filter) {
    if (filter) activeValidationFilter = filter;
    validationReturnFocus = document.activeElement;
    const { backdrop, drawer } = ensureValidationDrawer();
    renderValidationDrawer();
    drawer.inert = false;
    drawer.setAttribute("aria-hidden", "false");
    backdrop.classList.add("open");
    drawer.classList.add("open");
    document.body.style.overflow = "hidden";
    const close = drawer.querySelector("[data-close-validation]");
    if (close) close.focus();
  }

  function closeValidationDrawer() {
    const backdrop = document.getElementById("stsDrawerBackdrop");
    const drawer = document.getElementById("stsValidationDrawer");
    if (backdrop) backdrop.classList.remove("open");
    if (drawer) {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      drawer.inert = true;
    }
    document.body.style.overflow = "";
    if (validationReturnFocus && document.contains(validationReturnFocus)) validationReturnFocus.focus();
    validationReturnFocus = null;
  }

  function navigateToIssue(issue) {
    closeValidationDrawer();
    if (issue.boreholeId) {
      state().activeBh = issue.boreholeId;
      saveState();
    }
    root.showTab(issue.nav || "validation");
    root.setTimeout(() => {
      const gridIds = { soil: "soilGrid", rock: "rockGrid", spt: "sptGrid", samples: "smpGrid" };
      const grid = gridIds[issue.nav];
      let target = null;
      if (grid && issue.rowIndex != null) target = document.querySelector(`#${grid} tr[data-i="${issue.rowIndex}"] input, #${grid} tr[data-i="${issue.rowIndex}"] select`);
      if (issue.nav === "dcp" && issue.rowIndex != null) target = document.querySelector(`#stsDcpTable tr[data-i="${issue.rowIndex}"] input`);
      if (issue.nav === "boreholes" && issue.rowIndex != null) target = document.querySelector(`#bhGrid tr[data-i="${issue.rowIndex}"] input`);
      if (target) {
        target.scrollIntoView({ block: "center", behavior: root.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        target.focus();
        if (root.GeoFlowMotion) root.GeoFlowMotion.revealRecord(target);
      }
    }, 80);
  }

  function projectStateFor(project) {
    if (!project) return null;
    if (project.pid === projectsState().activePid) return state();
    try { return JSON.parse(root.localStorage.getItem(`autosoil-prj-${project.pid}`) || "null"); }
    catch (error) { return null; }
  }

  function formatUpdated(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function renderPortfolio() {
    const page = document.getElementById("page-projects");
    if (!page) return;
    const registry = projectsState();
    const filter = typeof pjFilter !== "undefined" ? pjFilter : { q: "", status: "ACTIVE", sort: "updated" };
    let rows = registry.projects.slice();
    if (filter.status === "ACTIVE") rows = rows.filter((project) => !project.archived);
    else if (filter.status === "ARCHIVED") rows = rows.filter((project) => project.archived);
    else if (filter.status !== "ALL") rows = rows.filter((project) => !project.archived && project.status === filter.status);
    rows.sort((a, b) => filter.sort === "number" ? String(a.number).localeCompare(String(b.number)) : filter.sort === "client" ? String(a.client).localeCompare(String(b.client)) : String(b.updated).localeCompare(String(a.updated)));
    const enriched = rows.map((project) => ({ project, metrics: Core.projectMetrics(projectStateFor(project) || {}) }));
    const active = registry.projects.filter((project) => !project.archived).length;
    const fieldwork = registry.projects.filter((project) => !project.archived && ["FIELDWORK", "LOGGING"].includes(project.status)).length;
    const review = registry.projects.filter((project) => !project.archived && ["REPORT PREPARATION", "TECHNICAL REVIEW", "CLIENT REVIEW"].includes(project.status)).length;
    const warnings = enriched.reduce((sum, item) => sum + item.metrics.warnings, 0);
    page.innerHTML = `<div class="sts-page">
      <header class="sts-page-header"><div class="sts-title-group"><div class="sts-eyebrow">Portfolio</div><h2>Projects</h2><p>Current investigations, field progress, review status and report readiness.</p></div><div class="sts-page-actions"><button class="sts-button primary" type="button" id="stsNewProject">${icon("plus")}<span>New Project</span></button></div></header>
      <div class="sts-kpis">
        <div class="sts-kpi"><div class="label">Active projects</div><div class="value">${active}</div><div class="context">Open project workspaces</div></div>
        <div class="sts-kpi"><div class="label">Fieldwork active</div><div class="value">${fieldwork}</div><div class="context">Drilling or logging underway</div></div>
        <div class="sts-kpi"><div class="label">In review</div><div class="value">${review}</div><div class="context">Report preparation or review</div></div>
        <div class="sts-kpi"><div class="label">Validation attention</div><div class="value">${warnings}</div><div class="context">Errors and warnings in this view</div></div>
      </div>
      <div class="sts-portfolio-toolbar">
        <input class="sts-input search" id="stsProjectSearch" type="search" placeholder="Search project number, client or location" value="${escapeHtml(filter.q || "")}" aria-label="Search projects">
        <select class="sts-select" id="stsProjectStatus" aria-label="Project status filter">${["ACTIVE", "ALL", "ARCHIVED", ...(typeof PJ_STATUSES !== "undefined" ? PJ_STATUSES.filter((status) => status !== "ARCHIVED") : [])].map((status) => `<option ${filter.status === status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}</select>
        <select class="sts-select" id="stsProjectSort" aria-label="Sort projects"><option value="updated" ${filter.sort === "updated" ? "selected" : ""}>Recently updated</option><option value="number" ${filter.sort === "number" ? "selected" : ""}>Project number</option><option value="client" ${filter.sort === "client" ? "selected" : ""}>Client</option></select>
        <button class="sts-icon-button" type="button" id="stsDensity" aria-label="Toggle compact table density" title="Toggle table density">${icon("rows-3")}</button>
      </div>
      <section class="sts-panel sts-portfolio-desktop" aria-label="Project register"><div class="sts-data-table-wrap"><table class="sts-data-table"><thead><tr><th style="width:28%">Project</th><th style="width:24%">Client / location</th><th style="width:9%">Boreholes</th><th style="width:15%">Progress</th><th style="width:13%">Status</th><th style="width:13%">Updated</th><th style="width:106px">Actions</th></tr></thead><tbody>
        ${enriched.map(({ project, metrics }) => `<tr data-project-search="${escapeHtml([project.number, project.name, project.client, project.address, project.status].join(" ").toLowerCase())}"><td class="primary-cell"><strong>${escapeHtml(project.number || "-")}</strong><span>${escapeHtml(project.name || "Unnamed project")}</span></td><td class="primary-cell"><strong>${escapeHtml(project.client || "-")}</strong><span>${escapeHtml(project.address || "Location not set")}</span></td><td>${metrics.boreholes}</td><td><span class="sts-progress" aria-label="${metrics.progress}% logged"><i style="width:${metrics.progress}%"></i></span> <span style="font-size:10px;color:var(--gf-text-muted)">${metrics.progress}%</span></td><td><select class="sts-select" style="min-height:30px" data-project-status="${escapeHtml(project.pid)}" aria-label="Status for ${escapeHtml(project.number)}">${(typeof PJ_STATUSES !== "undefined" ? PJ_STATUSES : [project.status]).map((status) => `<option ${project.status === status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}</select></td><td>${escapeHtml(formatUpdated(project.updated))}</td><td><div class="sts-row-actions"><button class="sts-icon-button" type="button" data-project-open="${escapeHtml(project.pid)}" aria-label="Open ${escapeHtml(project.number)}" title="Open project">${icon("arrow-right")}</button><button class="sts-icon-button" type="button" data-project-duplicate="${escapeHtml(project.pid)}" aria-label="Duplicate ${escapeHtml(project.number)}" title="Duplicate structure">${icon("copy")}</button><button class="sts-icon-button" type="button" data-project-archive="${escapeHtml(project.pid)}" aria-label="${project.archived ? "Restore" : "Archive"} ${escapeHtml(project.number)}" title="${project.archived ? "Restore" : "Archive"}">${icon(project.archived ? "archive-restore" : "archive")}</button></div></td></tr>`).join("")}
      </tbody></table></div><div class="sts-empty" id="stsPortfolioEmpty" hidden><div>${icon("folder-search")}<strong>No projects match this view</strong><span>Clear the search or change the status filter.</span></div></div></section>
      <div class="sts-portfolio-mobile">${enriched.map(({ project, metrics }) => `<article class="sts-project-card-mobile" data-project-search="${escapeHtml([project.number, project.name, project.client, project.address, project.status].join(" ").toLowerCase())}"><h3>${escapeHtml(project.number)} - ${escapeHtml(project.name)}</h3><p>${escapeHtml(project.client || "-")} | ${escapeHtml(project.address || "Location not set")}</p><div class="foot"><span class="sts-status ${String(project.status).toLowerCase().includes("review") ? "warning" : "ready"}">${escapeHtml(project.status)}</span><span style="font-size:10px;color:var(--gf-text-muted)">${metrics.boreholes} BH | ${metrics.progress}%</span><button class="sts-button primary" type="button" data-project-open="${escapeHtml(project.pid)}">Open</button></div></article>`).join("")}</div>
    </div>`;

    function applySearch() {
      const query = page.querySelector("#stsProjectSearch").value.trim().toLowerCase();
      let visible = 0;
      page.querySelectorAll("[data-project-search]").forEach((element) => {
        const show = !query || element.dataset.projectSearch.includes(query);
        element.hidden = !show;
        if (show && element.tagName === "TR") visible += 1;
      });
      const empty = page.querySelector("#stsPortfolioEmpty");
      if (empty) empty.hidden = visible !== 0;
      filter.q = query;
    }
    page.querySelector("#stsNewProject").addEventListener("click", () => { if (typeof renderWizard === "function") renderWizard(); });
    page.querySelector("#stsProjectSearch").addEventListener("input", applySearch);
    page.querySelector("#stsProjectStatus").addEventListener("change", (event) => { filter.status = event.target.value; renderPortfolio(); });
    page.querySelector("#stsProjectSort").addEventListener("change", (event) => { filter.sort = event.target.value; renderPortfolio(); });
    page.querySelector("#stsDensity").addEventListener("click", () => document.body.classList.toggle("sts-density-compact"));
    page.querySelectorAll("[data-project-open]").forEach((button) => button.addEventListener("click", () => { if (typeof pjOpen === "function") pjOpen(button.dataset.projectOpen); }));
    page.querySelectorAll("[data-project-status]").forEach((select) => select.addEventListener("change", () => {
      const project = registry.projects.find((item) => item.pid === select.dataset.projectStatus);
      if (!project) return;
      project.status = select.value;
      project.updated = new Date().toISOString();
      (project.activity = project.activity || []).unshift({ t: project.updated, m: `Status changed to ${project.status}` });
      if (typeof pjSave === "function") pjSave();
      renderPortfolio();
    }));
    page.querySelectorAll("[data-project-duplicate]").forEach((button) => button.addEventListener("click", () => duplicateProject(button.dataset.projectDuplicate)));
    page.querySelectorAll("[data-project-archive]").forEach((button) => button.addEventListener("click", () => {
      const project = registry.projects.find((item) => item.pid === button.dataset.projectArchive);
      if (!project) return;
      project.archived = !project.archived;
      project.updated = new Date().toISOString();
      (project.activity = project.activity || []).unshift({ t: project.updated, m: project.archived ? "Project archived" : "Project restored" });
      if (typeof pjSave === "function") pjSave();
      renderPortfolio();
    }));
    applySearch();
    paintIcons(page);
  }

  function duplicateProject(projectId) {
    const registry = projectsState();
    const source = registry.projects.find((project) => project.pid === projectId);
    if (!source) return;
    const number = root.prompt("New project number:", `${source.number}-B`);
    if (!number) return;
    const pid = `p_${Math.random().toString(36).slice(2, 8)}`;
    const copy = Object.assign(JSON.parse(JSON.stringify(source)), {
      pid,
      number,
      status: "DRAFT",
      archived: false,
      syncKey: `__project_${pid}__`,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      activity: [{ t: new Date().toISOString(), m: `Duplicated from ${source.number}; field data was not copied` }]
    });
    registry.projects.unshift(copy);
    const fresh = typeof pjFreshState === "function" ? pjFreshState(copy) : { project: {}, boreholes: [], logs: {} };
    root.localStorage.setItem(`autosoil-prj-${pid}`, JSON.stringify(fresh));
    if (typeof pjSave === "function") pjSave();
    renderPortfolio();
    toast(`${number} created from the project structure.`, "info");
  }

  function enhanceDashboard() {
    const page = document.getElementById("page-dashboard");
    const main = page && page.querySelector(".dz-main");
    if (!main || main.querySelector(".sts-page-header")) return;
    main.classList.add("sts-page");
    const project = currentProject();
    const source = state();
    const name = source.project && (source.project.loggedBy || source.project.projectManager) || "team";
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const header = document.createElement("header");
    header.className = "sts-page-header";
    header.innerHTML = `<div class="sts-title-group"><div class="sts-eyebrow">${escapeHtml(new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</div><h2>${escapeHtml(greeting)}, ${escapeHtml(String(name).split(/[\s,/]+/)[0] || "team")}</h2><p><strong>${escapeHtml(project && project.number || source.project.projectNumber || "Project")}</strong> | ${escapeHtml(project && project.name || source.project.projectName || "Geotechnical investigation")} | ${escapeHtml(project && project.status || "Status not set")}</p></div><div class="sts-page-actions"><button class="sts-button" type="button" data-dashboard-action="borehole">${icon("plus")}<span>New Borehole</span></button><button class="sts-button" type="button" data-dashboard-action="resume">${icon("activity")}<span>Resume ${escapeHtml(source.activeBh || "Borehole")}</span></button><button class="sts-button primary" type="button" data-dashboard-action="report">${icon("file-text")}<span>Generate Report</span></button></div>`;
    main.prepend(header);
    header.querySelector('[data-dashboard-action="borehole"]').addEventListener("click", () => { root.showTab("boreholes"); const add = document.getElementById("bhAdd"); if (add) add.click(); });
    header.querySelector('[data-dashboard-action="resume"]').addEventListener("click", () => root.showTab("bh-overview"));
    header.querySelector('[data-dashboard-action="report"]').addEventListener("click", () => root.showTab("preview"));
    paintIcons(header);
  }

  function depthLayers(log, maxDepth) {
    const rows = [];
    log.soil.forEach((row) => {
      const from = Core.num(row.from); const to = Core.num(row.to);
      if (from == null || to == null || to <= from) return;
      rows.push({ from, to, kind: "soil", label: row.description || row.material || "Soil" });
    });
    log.rock.forEach((row) => {
      const from = Core.num(row.from); const to = Core.num(row.to);
      if (from == null || to == null || to <= from || (!row.rockType && !row.description)) return;
      rows.push({ from, to, kind: "rock", label: row.description || row.rockType || "Rock" });
    });
    return rows.sort((a, b) => a.from - b.from).map((row) => `<div class="sts-depth-layer ${row.kind}" style="top:${Core.clamp(row.from / maxDepth * 100, 0, 100)}%;height:${Math.max(2.5, (row.to - row.from) / maxDepth * 100)}%" title="${escapeHtml(`${Core.formatDepth(row.from)} to ${Core.formatDepth(row.to)}: ${row.label}`)}"><strong>${escapeHtml(row.kind === "soil" ? "SOIL" : "ROCK")}</strong><span>${escapeHtml(row.label)}</span></div>`).join("");
  }

  function boreholeEvents(log) {
    const events = [];
    log.spt.forEach((row) => { if (Core.deriveSpt(row).hasData) events.push({ depth: Core.num(row.depth) || 0, label: `SPT ${Core.deriveSpt(row).status}${Core.deriveSpt(row).calculatedN != null ? `, N=${Core.deriveSpt(row).calculatedN}` : ""}` }); });
    log.samples.forEach((row) => { if (row.sid || row.sampleId) events.push({ depth: Core.num(row.from) || 0, label: `Sample ${row.sid || row.sampleId}${row.stype || row.type ? `, ${row.stype || row.type}` : ""}` }); });
    log.dcp.forEach((row, index) => { const point = Core.dcpProfile(log.dcp)[index]; if (point && (point.blows != null || point.refusal)) events.push({ depth: point.to, label: `DCP ${point.refusal ? "refusal" : `${point.blows} blows`}` }); });
    (log.corebox.defects || []).forEach((row) => { if (Core.num(row.from) != null) events.push({ depth: Core.num(row.from), label: `${row.code || "Defect"}${row.confirmed ? ", reviewed" : ", draft"}` }); });
    const observations = log.groundwater.length ? log.groundwater : log.gw && (log.gw.depth || log.gw.state) ? [log.gw] : [];
    observations.forEach((row) => events.push({ depth: Core.num(row.depth) || 0, label: `Groundwater ${row.state || "observation"}${row.depth ? ` at ${Core.formatDepth(row.depth)}` : ""}` }));
    return events.sort((a, b) => a.depth - b.depth);
  }

  function renderBoreholeOverview() {
    const page = ensurePage("bh-overview");
    const borehole = activeBorehole();
    if (!borehole) {
      page.innerHTML = `<div class="sts-page"><div class="sts-empty"><div>${icon("map-pin-off")}<strong>No borehole selected</strong><span>Select or create a borehole before opening this workspace.</span><button class="sts-button primary" type="button" data-open-boreholes>Open Boreholes</button></div></div></div>`;
      page.querySelector("[data-open-boreholes]").addEventListener("click", () => root.showTab("boreholes"));
      paintIcons(page);
      return;
    }
    const log = activeLog();
    const loggedDepth = Core.loggedBoreholeDepth(state(), borehole.id);
    const profileDepth = Math.max(1, Core.maxBoreholeDepth(state(), borehole.id));
    const status = Core.boreholeStatus(state(), borehole.id);
    const metrics = { soil: log.soil.filter((row) => row.material || row.description).length, rock: log.rock.filter((row) => row.rockType || row.description).length, spt: log.spt.filter((row) => Core.deriveSpt(row).hasData).length, samples: log.samples.filter((row) => row.sid || row.sampleId).length };
    const events = boreholeEvents(log);
    const tickCount = Math.min(12, Math.max(4, Math.ceil(profileDepth)));
    page.innerHTML = `<div class="sts-page">
      <header class="sts-page-header"><div class="sts-title-group"><div class="sts-eyebrow">${escapeHtml(state().project.projectNumber || currentProject() && currentProject().number || "Project")} / Borehole</div><h2>${escapeHtml(borehole.id)}</h2><p>${escapeHtml(status)} | Current depth ${Core.formatDepth(loggedDepth)} | Planned ${Core.formatDepth(borehole.plannedDepth || borehole.planned)}</p></div><div class="sts-page-actions"><button class="sts-button" type="button" data-bh-action="add">${icon("plus")}<span>Add Record</span></button><button class="sts-button" type="button" data-bh-action="validate">${icon("shield-check")}<span>Validate</span></button><button class="sts-button" type="button" data-bh-action="pdf">${icon("file-text")}<span>Preview PDF</span></button><button class="sts-button primary" type="button" data-bh-action="complete">${icon("check-circle")}<span>${status === "Complete" ? "Edit Completion" : "Mark Complete"}</span></button></div></header>
      <div class="sts-kpis"><div class="sts-kpi"><div class="label">Current depth</div><div class="value">${loggedDepth.toFixed(2)}</div><div class="context">metres below ground level</div></div><div class="sts-kpi"><div class="label">Geology intervals</div><div class="value">${metrics.soil + metrics.rock}</div><div class="context">${metrics.soil} soil, ${metrics.rock} rock</div></div><div class="sts-kpi"><div class="label">Field tests</div><div class="value">${metrics.spt + log.dcp.length}</div><div class="context">${metrics.spt} SPT, ${log.dcp.length} DCP rows</div></div><div class="sts-kpi"><div class="label">Samples</div><div class="value">${metrics.samples}</div><div class="context">linked to ${escapeHtml(borehole.id)}</div></div></div>
      <div class="sts-overview-grid"><section class="sts-panel"><div class="sts-panel-header"><h3>Depth timeline</h3><p>Depth increases downward</p></div><div class="sts-panel-body" style="padding:0"><div class="sts-borehole-context"><div class="sts-depth-profile"><div class="sts-depth-axis">${Array.from({ length: tickCount + 1 }, (_, index) => `<span class="sts-depth-tick" style="top:${index / tickCount * 100}%">${(index / tickCount * profileDepth).toFixed(1)}</span>`).join("")}</div><div class="sts-depth-track">${depthLayers(log, profileDepth)}</div></div><div class="sts-depth-events">${events.length ? events.map((event) => `<div class="sts-depth-event"><span class="depth">${Core.formatDepth(event.depth)}</span><span>${escapeHtml(event.label)}</span></div>`).join("") : `<div class="sts-empty"><div>${icon("activity")}<strong>No depth events yet</strong><span>SPT, DCP, samples, groundwater and corebox observations appear here.</span></div></div>`}</div></div></div></section>
      <aside><dl class="sts-borehole-summary"><div><dt>Status</dt><dd>${escapeHtml(status)}</dd></div><div><dt>Ground RL</dt><dd>${Core.formatDepth(borehole.rl || state().project.groundRL)}</dd></div><div><dt>Easting</dt><dd>${escapeHtml(borehole.easting || state().project.easting || "-")}</dd></div><div><dt>Northing</dt><dd>${escapeHtml(borehole.northing || state().project.northing || "-")}</dd></div><div><dt>Drilling method</dt><dd>${escapeHtml(borehole.drillMethod || state().project.drillMethod || "-")}</dd></div><div><dt>Termination</dt><dd>${escapeHtml(borehole.termination || borehole.termReason || "-")}</dd></div></dl></aside></div>
    </div>`;
    page.querySelector('[data-bh-action="add"]').addEventListener("click", () => root.showTab("soil"));
    page.querySelector('[data-bh-action="validate"]').addEventListener("click", () => openValidationDrawer());
    page.querySelector('[data-bh-action="pdf"]').addEventListener("click", () => root.showTab("preview"));
    page.querySelector('[data-bh-action="complete"]').addEventListener("click", () => openCompletionDialog(borehole));
    paintIcons(page);
  }

  function openCompletionDialog(borehole) {
    closeDialog();
    const overlay = document.createElement("div");
    overlay.className = "sts-dialog-backdrop";
    overlay.innerHTML = `<form class="sts-help-dialog" role="dialog" aria-modal="true" aria-labelledby="stsCompleteTitle"><header><div><h2 id="stsCompleteTitle">Complete ${escapeHtml(borehole.id)}</h2><p>Record the factual final depth and termination reason.</p></div><button class="sts-icon-button" type="button" data-close-dialog aria-label="Close" title="Close">${icon("x")}</button></header><div class="sts-form-grid"><div class="sts-field"><label for="stsFinalDepth">Final depth (m)</label><input class="sts-input" id="stsFinalDepth" type="number" step="0.01" min="0" required value="${escapeHtml(borehole.termDepth || borehole.finalDepth || "")}"></div><div class="sts-field"><label for="stsCompletionDate">Completion date</label><input class="sts-input" id="stsCompletionDate" type="date" value="${escapeHtml(borehole.endDate || "")}"></div><div class="sts-field wide"><label for="stsTermination">Termination reason</label><textarea class="sts-textarea" id="stsTermination" required>${escapeHtml(borehole.termination || borehole.termReason || "")}</textarea></div></div><div class="sts-form-actions" style="justify-content:flex-end"><button class="sts-button" type="button" data-close-dialog>Cancel</button><button class="sts-button primary" type="submit">${icon("check")}Save completion</button></div></form>`;
    overlay.restoreFocus = document.activeElement;
    document.body.appendChild(overlay);
    activeDialog = overlay;
    paintIcons(overlay);
    const form = overlay.querySelector("form");
    overlay.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", closeDialog));
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeDialog(); });
    overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDialog(); else trapDialogFocus(event, form); });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      borehole.termDepth = Number(form.querySelector("#stsFinalDepth").value);
      borehole.finalDepth = borehole.termDepth;
      borehole.endDate = form.querySelector("#stsCompletionDate").value;
      borehole.termination = form.querySelector("#stsTermination").value.trim();
      borehole.termReason = borehole.termination;
      saveState();
      closeDialog();
      renderBoreholeOverview();
      toast(`${borehole.id} completion details saved.`, "info");
    });
    form.querySelector("#stsFinalDepth").focus();
  }

  function dcpChartMarkup(rows) {
    const points = Core.dcpProfile(rows).filter((point) => point.blows != null || point.refusal);
    if (!points.length) return `<div class="sts-empty"><div>${icon("chart-no-axes-combined")}<strong>No DCP profile yet</strong><span>Add increments and blow counts to build the depth profile.</span></div></div>`;
    const width = 520; const height = 300; const pad = { l: 54, r: 18, t: 18, b: 38 };
    const maxDepth = Math.max(.1, ...points.map((point) => point.to));
    const maxBlows = Math.max(10, ...points.map((point) => point.blows || 0));
    const x = (value) => pad.l + (value / maxBlows) * (width - pad.l - pad.r);
    const y = (value) => pad.t + (value / maxDepth) * (height - pad.t - pad.b);
    const path = points.filter((point) => point.blows != null).map((point, index) => `${index ? "L" : "M"}${x(point.blows).toFixed(1)},${y(point.to).toFixed(1)}`).join(" ");
    const depthDigits = maxDepth < 1 ? 2 : 1;
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="stsDcpChartTitle stsDcpChartDesc"><title id="stsDcpChartTitle">DCP blow count by depth</title><desc id="stsDcpChartDesc">Depth increases downward. No engineering capacity correlation is applied.</desc><line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${height - pad.b}" stroke="#879189"/><line x1="${pad.l}" y1="${height - pad.b}" x2="${width - pad.r}" y2="${height - pad.b}" stroke="#879189"/>${Array.from({ length: 6 }, (_, index) => { const depth = maxDepth * index / 5; return `<line x1="${pad.l}" y1="${y(depth)}" x2="${width - pad.r}" y2="${y(depth)}" stroke="#e9edea"/><text x="${pad.l - 8}" y="${y(depth) + 3}" text-anchor="end" font-size="9" fill="#5f6c65">${depth.toFixed(depthDigits)}</text>`; }).join("")}<path d="${path}" fill="none" stroke="#126b46" stroke-width="2"/>${points.map((point) => `<circle cx="${x(point.blows == null ? maxBlows : point.blows)}" cy="${y(point.to)}" r="4" fill="${point.refusal ? "#9a681e" : "#126b46"}"><title>${Core.formatDepth(point.to)}: ${point.refusal ? "refusal" : `${point.blows} blows`}</title></circle>`).join("")}<text x="${(pad.l + width - pad.r) / 2}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#5f6c65">Blows per recorded increment</text><text x="13" y="${height / 2}" transform="rotate(-90 13 ${height / 2})" text-anchor="middle" font-size="10" fill="#5f6c65">Depth (m)</text></svg><p class="sts-chart-summary">Profile shows recorded blows per increment only. No CBR, bearing-capacity or pavement correlation is calculated.</p>`;
  }

  function renderDcp() {
    const page = ensurePage("dcp");
    const log = activeLog();
    const points = Core.dcpProfile(log.dcp);
    page.innerHTML = `<div class="sts-page"><header class="sts-page-header"><div class="sts-title-group"><div class="sts-eyebrow">${escapeHtml(state().activeBh)} / Field test</div><h2>Dynamic Cone Penetrometer</h2><p>Record factual increments, blow counts and refusal. Engineering correlations are intentionally excluded.</p></div><div class="sts-page-actions"><button class="sts-button" type="button" id="stsDcpImport">${icon("upload")}<span>Import CSV</span></button><input id="stsDcpFile" type="file" accept=".csv,text/csv" hidden><button class="sts-button" type="button" id="stsDcpExport" ${log.dcp.length ? "" : "disabled"}>${icon("download")}<span>Export CSV</span></button><button class="sts-button primary" type="button" id="stsDcpAdd">${icon("plus")}<span>Add Increment</span></button></div></header><div class="sts-split-workspace"><section class="sts-panel"><div class="sts-panel-header"><h3>DCP entries</h3><p>${log.dcp.length} recorded increments</p></div>${log.dcp.length ? `<div class="sts-data-table-wrap"><table class="sts-data-table" id="stsDcpTable"><thead><tr><th style="width:54px">Row</th><th style="width:86px">From (m)</th><th style="width:86px">To (m)</th><th style="width:112px">Increment (mm)</th><th style="width:90px">Blows</th><th style="width:76px">Refusal</th><th>Remarks</th><th style="width:52px">Action</th></tr></thead><tbody>${points.map((point) => { const row = log.dcp[point.index]; return `<tr data-i="${point.index}"><td>${point.index + 1}</td><td>${point.from.toFixed(2)}</td><td>${point.to.toFixed(2)}</td><td><input class="sts-input" type="number" min="1" step="1" value="${escapeHtml(row.incrementMm == null ? row.increment || "" : row.incrementMm)}" data-dcp-key="incrementMm" aria-label="Row ${point.index + 1} depth increment in millimetres"></td><td><input class="sts-input" type="number" min="0" step="1" value="${escapeHtml(row.blows == null ? row.blowCount || "" : row.blows)}" data-dcp-key="blows" aria-label="Row ${point.index + 1} blow count"></td><td style="text-align:center"><input type="checkbox" data-dcp-key="refusal" ${row.refusal ? "checked" : ""} aria-label="Row ${point.index + 1} refusal"></td><td><input class="sts-input" value="${escapeHtml(row.remarks || "")}" data-dcp-key="remarks" aria-label="Row ${point.index + 1} remarks"></td><td><button class="sts-icon-button" type="button" data-dcp-delete="${point.index}" aria-label="Delete DCP row ${point.index + 1}" title="Delete row">${icon("trash-2")}</button></td></tr>`; }).join("")}</tbody></table></div>` : `<div class="sts-empty"><div>${icon("chart-no-axes-combined")}<strong>No DCP increments for ${escapeHtml(state().activeBh)}</strong><span>Add the first factual increment or import a field CSV.</span><button class="sts-button primary" type="button" data-empty-dcp-add>Add first increment</button></div></div>`}</section><aside class="sts-chart" id="stsDcpChart">${dcpChartMarkup(log.dcp)}</aside></div></div>`;
    function refreshChart() { const host = page.querySelector("#stsDcpChart"); if (host) { host.innerHTML = dcpChartMarkup(log.dcp); paintIcons(host); } }
    page.querySelectorAll("[data-dcp-key]").forEach((input) => input.addEventListener("change", () => {
      const index = Number(input.closest("tr").dataset.i); const key = input.dataset.dcpKey;
      log.dcp[index][key] = input.type === "checkbox" ? input.checked : ["incrementMm", "blows"].includes(key) ? (input.value === "" ? "" : Number(input.value)) : input.value;
      saveState();
      renderDcp();
    }));
    page.querySelectorAll("[data-dcp-delete]").forEach((button) => button.addEventListener("click", () => { log.dcp.splice(Number(button.dataset.dcpDelete), 1); saveState(); renderDcp(); }));
    const add = () => { log.dcp.push({ incrementMm: 100, blows: "", refusal: false, remarks: "" }); saveState(); renderDcp(); root.setTimeout(() => page.querySelector(`#stsDcpTable tr[data-i="${log.dcp.length - 1}"] input[data-dcp-key="blows"]`)?.focus(), 0); };
    page.querySelector("#stsDcpAdd").addEventListener("click", add);
    const emptyAdd = page.querySelector("[data-empty-dcp-add]"); if (emptyAdd) emptyAdd.addEventListener("click", add);
    page.querySelector("#stsDcpImport").addEventListener("click", () => page.querySelector("#stsDcpFile").click());
    page.querySelector("#stsDcpFile").addEventListener("change", (event) => importDcpCsv(event.target.files[0], log));
    page.querySelector("#stsDcpExport").addEventListener("click", () => exportDcpCsv(log.dcp));
    paintIcons(page);
  }

  function importDcpCsv(file, log) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lines = String(reader.result || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const data = lines.filter((line, index) => !(index === 0 && /increment|blow|refusal/i.test(line))).map((line) => {
          const cells = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
          return { incrementMm: Number(cells[0]), blows: cells[1] === "" ? "" : Number(cells[1]), refusal: /^(true|yes|y|1|refusal)$/i.test(cells[2] || ""), remarks: cells.slice(3).join(", ") };
        }).filter((row) => Number.isFinite(row.incrementMm) && row.incrementMm > 0);
        if (!data.length) throw new Error("No valid DCP rows were found");
        log.dcp.push(...data);
        saveState();
        renderDcp();
        toast(`${data.length} DCP increments imported.`, "info");
      } catch (error) { toast(error.message || "DCP CSV import failed.", "error"); }
    };
    reader.onerror = () => toast("DCP CSV could not be read.", "error");
    reader.readAsText(file);
  }

  function exportDcpCsv(rows) {
    const csv = ["Increment_mm,Blows,Refusal,Remarks", ...(rows || []).map((row) => [row.incrementMm || row.increment || "", row.blows == null ? row.blowCount || "" : row.blows, row.refusal ? "Yes" : "No", `"${String(row.remarks || "").replace(/"/g, '""')}"`].join(","))].join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${state().activeBh || "borehole"}_DCP.csv`;
    link.click();
    root.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function renderGroundwater() {
    const page = ensurePage("groundwater");
    const log = activeLog();
    const gw = log.gw;
    const observations = log.groundwater;
    page.innerHTML = `<div class="sts-page"><header class="sts-page-header"><div class="sts-title-group"><div class="sts-eyebrow">${escapeHtml(state().activeBh)} / Borehole observation</div><h2>Groundwater</h2><p>Record observed, dry, not-measured and stabilised states without inferring an unobserved level.</p></div><div class="sts-page-actions"><button class="sts-button primary" type="button" id="stsGwAdd">${icon("plus")}<span>Add Observation</span></button></div></header><div class="sts-split-workspace"><section class="sts-panel"><div class="sts-panel-header"><h3>Current groundwater status</h3></div><div class="sts-panel-body"><div class="sts-form-grid"><div class="sts-field"><label for="stsGwState">Observation state</label><select class="sts-select" id="stsGwState">${["", "Not measured", "Not encountered", "Dry", "Encountered", "Standing water", "Seepage"].map((value) => `<option ${gw.state === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></div><div class="sts-field"><label for="stsGwDepth">Observed depth (m)</label><input class="sts-input" id="stsGwDepth" type="number" step="0.01" min="0" value="${escapeHtml(gw.depth || "")}"></div><div class="sts-field"><label for="stsGwStable">Stabilised depth (m)</label><input class="sts-input" id="stsGwStable" type="number" step="0.01" min="0" value="${escapeHtml(gw.stabilisedDepth || gw.stableDepth || "")}"></div><div class="sts-field"><label for="stsGwDate">Observation date</label><input class="sts-input" id="stsGwDate" type="date" value="${escapeHtml(gw.date || "")}"></div><div class="sts-field"><label for="stsGwTime">Observation time</label><input class="sts-input" id="stsGwTime" type="time" value="${escapeHtml(gw.time || "")}"></div><div class="sts-field wide"><label for="stsGwRemarks">Remarks</label><textarea class="sts-textarea" id="stsGwRemarks">${escapeHtml(gw.remarks || "")}</textarea></div></div><div class="sts-form-actions"><button class="sts-button primary" type="button" id="stsGwSave">${icon("save")}Save status</button></div></div></section><section class="sts-panel"><div class="sts-panel-header"><h3>Observation history</h3><p>${observations.length} entries</p></div>${observations.length ? `<div class="sts-data-table-wrap"><table class="sts-data-table"><thead><tr><th>Date / time</th><th>State</th><th>Observed</th><th>Stabilised</th><th>Remarks</th><th style="width:52px">Action</th></tr></thead><tbody>${observations.map((row, index) => `<tr><td>${escapeHtml([row.date, row.time].filter(Boolean).join(" ") || "-")}</td><td>${escapeHtml(row.state || "-")}</td><td>${Core.formatDepth(row.depth)}</td><td>${Core.formatDepth(row.stabilisedDepth || row.stableDepth)}</td><td>${escapeHtml(row.remarks || "")}</td><td><button class="sts-icon-button" type="button" data-gw-delete="${index}" aria-label="Delete groundwater observation ${index + 1}" title="Delete observation">${icon("trash-2")}</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="sts-empty"><div>${icon("waves")}<strong>No groundwater history for ${escapeHtml(state().activeBh)}</strong><span>Save a factual status or add a dated observation.</span></div></div>`}</section></div></div>`;
    function values() { return { state: page.querySelector("#stsGwState").value, depth: page.querySelector("#stsGwDepth").value === "" ? "" : Number(page.querySelector("#stsGwDepth").value), stabilisedDepth: page.querySelector("#stsGwStable").value === "" ? "" : Number(page.querySelector("#stsGwStable").value), date: page.querySelector("#stsGwDate").value, time: page.querySelector("#stsGwTime").value, remarks: page.querySelector("#stsGwRemarks").value.trim() }; }
    page.querySelector("#stsGwSave").addEventListener("click", () => { Object.assign(gw, values()); saveState(); refreshShellStatus(); toast("Groundwater status saved.", "info"); });
    page.querySelector("#stsGwAdd").addEventListener("click", () => { const row = values(); if (!row.state && row.depth === "" && !row.remarks) { toast("Enter an observation state, depth or remark first.", "error"); return; } observations.push(Object.assign({ id: `gw_${Date.now().toString(36)}` }, row)); Object.assign(gw, row); saveState(); renderGroundwater(); });
    page.querySelectorAll("[data-gw-delete]").forEach((button) => button.addEventListener("click", () => { observations.splice(Number(button.dataset.gwDelete), 1); saveState(); renderGroundwater(); }));
    paintIcons(page);
  }

  function coordinateRows() {
    return (state().boreholes || []).map((borehole) => ({ borehole, easting: Core.num(borehole.easting), northing: Core.num(borehole.northing) })).filter((item) => item.easting != null && item.northing != null);
  }

  function siteMapSvg(rows) {
    if (!rows.length) return "";
    const width = 820; const height = 430; const pad = 48;
    const eastings = rows.map((row) => row.easting); const northings = rows.map((row) => row.northing);
    let minE = Math.min(...eastings); let maxE = Math.max(...eastings); let minN = Math.min(...northings); let maxN = Math.max(...northings);
    if (minE === maxE) { minE -= 5; maxE += 5; }
    if (minN === maxN) { minN -= 5; maxN += 5; }
    const x = (value) => pad + (value - minE) / (maxE - minE) * (width - pad * 2);
    const y = (value) => height - pad - (value - minN) / (maxN - minN) * (height - pad * 2);
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="stsMapTitle stsMapDesc"><title id="stsMapTitle">Borehole engineering coordinate plot</title><desc id="stsMapDesc">Relative plot of entered easting and northing values. No coordinate transformation or basemap is applied.</desc><rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" fill="#f8f9f8" stroke="#c9d1cc"/>${Array.from({ length: 6 }, (_, index) => `<line x1="${pad + index / 5 * (width - pad * 2)}" y1="${pad}" x2="${pad + index / 5 * (width - pad * 2)}" y2="${height - pad}" stroke="#e9edea"/><line x1="${pad}" y1="${pad + index / 5 * (height - pad * 2)}" x2="${width - pad}" y2="${pad + index / 5 * (height - pad * 2)}" stroke="#e9edea"/>`).join("")}${rows.map((row) => `<g data-map-bh="${escapeHtml(row.borehole.id)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(row.borehole.id)} at easting ${row.easting}, northing ${row.northing}" style="cursor:pointer"><circle cx="${x(row.easting)}" cy="${y(row.northing)}" r="9" fill="#126b46" stroke="#fff" stroke-width="3"/><text x="${x(row.easting) + 12}" y="${y(row.northing) + 4}" font-size="11" font-weight="700" fill="#17211c">${escapeHtml(row.borehole.id)}</text><title>${escapeHtml(row.borehole.id)} | E ${row.easting} | N ${row.northing}</title></g>`).join("")}<text x="${width / 2}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#5f6c65">Easting (${escapeHtml(state().project.coordinateSystem || "entered grid")})</text><text x="12" y="${height / 2}" transform="rotate(-90 12 ${height / 2})" text-anchor="middle" font-size="10" fill="#5f6c65">Northing</text></svg>`;
  }

  function renderSiteMap() {
    const page = ensurePage("site-map");
    const rows = coordinateRows();
    page.innerHTML = `<div class="sts-page"><header class="sts-page-header"><div class="sts-title-group"><div class="sts-eyebrow">Project / Spatial context</div><h2>Site Map</h2><p>Engineering coordinate plot using entered borehole values. GeoFlow does not silently transform coordinate systems.</p></div><div class="sts-page-actions"><button class="sts-button" type="button" id="stsMapImport">${icon("upload")}<span>Import CSV</span></button><input id="stsMapFile" type="file" accept=".csv,text/csv" hidden><button class="sts-button" type="button" id="stsMapExport" ${rows.length ? "" : "disabled"}>${icon("download")}<span>Export CSV</span></button><button class="sts-button primary" type="button" id="stsMapEdit">${icon("pencil")}<span>Edit Coordinates</span></button></div></header><section class="sts-panel"><div class="sts-panel-header"><h3>Borehole coordinate plot</h3><p>${escapeHtml(state().project.coordinateSystem || "Coordinate system not specified")}</p></div>${rows.length ? `<div class="sts-panel-body"><div class="sts-chart" style="min-height:430px">${siteMapSvg(rows)}</div></div>` : `<div class="sts-empty"><div>${icon("map-pin-off")}<strong>No borehole coordinates entered</strong><span>Enter easting and northing in Boreholes, or import an ID/Easting/Northing CSV.</span><button class="sts-button primary" type="button" data-edit-coordinates>Open Boreholes</button></div></div>`}</section>${rows.length ? `<section class="sts-panel"><div class="sts-panel-header"><h3>Coordinate register</h3></div><div class="sts-data-table-wrap"><table class="sts-data-table"><thead><tr><th>Borehole</th><th>Easting</th><th>Northing</th><th>Ground RL</th><th>Accuracy / source</th></tr></thead><tbody>${rows.map((row) => `<tr><td><button class="sts-button" type="button" data-map-open="${escapeHtml(row.borehole.id)}">${escapeHtml(row.borehole.id)}</button></td><td>${row.easting}</td><td>${row.northing}</td><td>${escapeHtml(row.borehole.rl || "-")}</td><td>${escapeHtml(row.borehole.gpsAccuracy || row.borehole.coordinateSource || "Not recorded")}</td></tr>`).join("")}</tbody></table></div></section>` : ""}</div>`;
    const edit = () => root.showTab("boreholes");
    page.querySelector("#stsMapEdit").addEventListener("click", edit);
    const emptyEdit = page.querySelector("[data-edit-coordinates]"); if (emptyEdit) emptyEdit.addEventListener("click", edit);
    page.querySelectorAll("[data-map-open], [data-map-bh]").forEach((element) => {
      const open = () => { state().activeBh = element.dataset.mapOpen || element.dataset.mapBh; saveState(); root.showTab("bh-overview"); };
      element.addEventListener("click", open);
      element.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    });
    page.querySelector("#stsMapExport").addEventListener("click", exportCoordinateCsv);
    page.querySelector("#stsMapImport").addEventListener("click", () => page.querySelector("#stsMapFile").click());
    page.querySelector("#stsMapFile").addEventListener("change", (event) => importCoordinateCsv(event.target.files[0]));
    paintIcons(page);
  }

  function exportCoordinateCsv() {
    const csv = ["Borehole,Easting,Northing,Ground_RL,Coordinate_System", ...(state().boreholes || []).map((borehole) => [borehole.id, borehole.easting || "", borehole.northing || "", borehole.rl || "", state().project.coordinateSystem || ""].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${state().project.projectNumber || "GeoFlow"}_coordinates.csv`;
    link.click();
    root.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function importCoordinateCsv(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lines = String(reader.result || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const data = lines.filter((line, index) => !(index === 0 && /borehole|easting|northing/i.test(line))).map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
        let updated = 0;
        data.forEach(([id, easting, northing, rl]) => {
          const borehole = (state().boreholes || []).find((item) => item.id === id);
          if (!borehole || Core.num(easting) == null || Core.num(northing) == null) return;
          borehole.easting = Number(easting); borehole.northing = Number(northing); if (Core.num(rl) != null) borehole.rl = Number(rl); borehole.coordinateSource = "CSV import"; updated += 1;
        });
        if (!updated) throw new Error("No matching borehole coordinates were found");
        saveState(); renderSiteMap(); toast(`${updated} borehole coordinates imported.`, "info");
      } catch (error) { toast(error.message || "Coordinate import failed.", "error"); }
    };
    reader.onerror = () => toast("Coordinate CSV could not be read.", "error");
    reader.readAsText(file);
  }

  async function loadDocuments(page, token) {
    const host = page.querySelector("#stsDocumentList");
    try {
      const response = await fetch(`/api/v1/files?project=${encodeURIComponent(projectStorageKey())}`, { headers: typeof syncHeaders === "function" ? syncHeaders() : {} });
      if (!response.ok) throw new Error(`Document list failed (${response.status})`);
      const data = await response.json();
      if (token !== documentRequestToken || !document.contains(page)) return;
      const files = Array.isArray(data.files) ? data.files : [];
      host.innerHTML = files.length ? `<div class="sts-data-table-wrap"><table class="sts-data-table"><thead><tr><th>Name</th><th>Type</th><th>Updated</th><th>Size</th><th style="width:96px">Actions</th></tr></thead><tbody>${files.map((file) => `<tr><td class="primary-cell"><strong>${escapeHtml(file.name || file.id)}</strong><span>${escapeHtml(file.id)}</span></td><td>${escapeHtml(file.kind || "document")}</td><td>${escapeHtml(formatUpdated(file.ts))}</td><td>${file.size ? `${Math.round(file.size / 1024)} KB` : "-"}</td><td><div class="sts-row-actions"><button class="sts-icon-button" type="button" data-document-open="${escapeHtml(file.id)}" aria-label="Open ${escapeHtml(file.name || file.id)}" title="Open">${icon("external-link")}</button><button class="sts-icon-button" type="button" data-document-download="${escapeHtml(file.id)}" aria-label="Download ${escapeHtml(file.name || file.id)}" title="Download">${icon("download")}</button></div></td></tr>`).join("")}</tbody></table></div>` : `<div class="sts-empty"><div>${icon("folder-open")}<strong>No project documents stored</strong><span>Upload a document, generate a report or sync a corebox image.</span></div></div>`;
      host.querySelectorAll("[data-document-open]").forEach((button) => button.addEventListener("click", () => openStoredFile(button.dataset.documentOpen, false)));
      host.querySelectorAll("[data-document-download]").forEach((button) => button.addEventListener("click", () => openStoredFile(button.dataset.documentDownload, true)));
      paintIcons(host);
    } catch (error) {
      if (token !== documentRequestToken) return;
      host.innerHTML = `<div class="sts-error-state"><div>${icon("cloud-off")}<strong>Documents could not be loaded</strong><span>${escapeHtml(error.message)}</span><button class="sts-button" type="button" data-document-retry>Retry</button></div></div>`;
      host.querySelector("[data-document-retry]").addEventListener("click", () => { renderDocuments(); });
      paintIcons(host);
    }
  }

  function renderDocuments() {
    const page = ensurePage("documents");
    const token = ++documentRequestToken;
    page.innerHTML = `<div class="sts-page"><header class="sts-page-header"><div class="sts-title-group"><div class="sts-eyebrow">Project / Controlled files</div><h2>Documents</h2><p>Project files stored through the Cloudflare file service. Microsoft 365 mapping is not configured in this deployment.</p></div><div class="sts-page-actions"><button class="sts-button" type="button" id="stsDocumentRefresh">${icon("refresh-cw")}<span>Refresh</span></button><button class="sts-button primary" type="button" id="stsDocumentUpload">${icon("upload")}<span>Upload</span></button><input id="stsDocumentFile" type="file" hidden></div></header><section class="sts-panel"><div class="sts-panel-header"><h3>Project document register</h3><p>Cloudflare storage key ${escapeHtml(projectStorageKey())}</p></div><div id="stsDocumentList" class="sts-loading">Loading project documents...</div></section></div>`;
    page.querySelector("#stsDocumentRefresh").addEventListener("click", renderDocuments);
    page.querySelector("#stsDocumentUpload").addEventListener("click", () => page.querySelector("#stsDocumentFile").click());
    page.querySelector("#stsDocumentFile").addEventListener("change", (event) => uploadDocument(event.target.files[0]));
    paintIcons(page);
    loadDocuments(page, token);
  }

  function uploadDocument(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast("Document is larger than the 10 MB browser upload limit.", "error"); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const response = await fetch("/api/v1/files", { method: "POST", headers: typeof syncHeaders === "function" ? syncHeaders() : { "Content-Type": "application/json" }, body: JSON.stringify({ project: projectStorageKey(), id: `doc-${Date.now().toString(36)}`, name: file.name, kind: "project-document", data: reader.result }) });
        if (!response.ok) throw new Error(`Upload failed (${response.status})`);
        toast(`${file.name} stored in the project document register.`, "info");
        renderDocuments();
      } catch (error) { toast(error.message || "Document upload failed.", "error"); }
    };
    reader.onerror = () => toast("Document could not be read.", "error");
    reader.readAsDataURL(file);
  }

  async function openStoredFile(fileId, download) {
    try {
      const response = await fetch(`/api/v1/files?project=${encodeURIComponent(projectStorageKey())}&id=${encodeURIComponent(fileId)}`, { headers: typeof syncHeaders === "function" ? syncHeaders() : {} });
      if (!response.ok) throw new Error(`File could not be opened (${response.status})`);
      const file = await response.json();
      if (!file.data) throw new Error("Stored file has no downloadable data");
      const link = document.createElement("a");
      link.href = file.data;
      if (download) link.download = file.name || file.id;
      else { link.target = "_blank"; link.rel = "noopener"; }
      link.click();
    } catch (error) { toast(error.message || "File could not be opened.", "error"); }
  }

  function renderTeam() {
    const page = ensurePage("team");
    const project = currentProject();
    const team = project && (project.team = project.team || {}) || {};
    const roles = [["pm", "Project manager"], ["reviewer", "Senior reviewer"], ["engineer", "Geotechnical engineer"], ["tech", "Field technician"], ["driller", "Driller"]];
    page.innerHTML = `<div class="sts-page"><header class="sts-page-header"><div class="sts-title-group"><div class="sts-eyebrow">Project / Responsibility</div><h2>Team</h2><p>Named project roles feed report metadata, field responsibility and review context.</p></div></header><section class="sts-panel"><div class="sts-panel-header"><h3>Project roles</h3></div><div class="sts-panel-body"><div class="sts-form-grid">${roles.map(([key, label]) => `<div class="sts-field"><label for="stsTeam-${key}">${label}</label><input class="sts-input" id="stsTeam-${key}" data-team-key="${key}" value="${escapeHtml(team[key] || "")}"></div>`).join("")}</div><div class="sts-form-actions"><button class="sts-button primary" type="button" id="stsTeamSave">${icon("save")}Save team</button></div></div></section></div>`;
    page.querySelector("#stsTeamSave").addEventListener("click", () => {
      page.querySelectorAll("[data-team-key]").forEach((input) => { team[input.dataset.teamKey] = input.value.trim(); });
      if (project) { project.updated = new Date().toISOString(); (project.activity = project.activity || []).unshift({ t: project.updated, m: "Project team updated" }); if (typeof pjSave === "function") pjSave(); }
      state().project.loggedBy = team.tech || team.engineer || team.pm || state().project.loggedBy;
      state().project.checkedBy = team.reviewer || state().project.checkedBy;
      state().project.reviewBy = team.reviewer || state().project.reviewBy;
      saveState(); toast("Project team saved.", "info");
    });
    paintIcons(page);
  }

  function enhanceSettings() {
    const page = document.getElementById("page-settings");
    if (!page || page.querySelector("#stsMicrosoftIntegration")) return;
    page.insertAdjacentHTML("beforeend", `<section class="sts-panel sts-integration-panel" id="stsMicrosoftIntegration" aria-labelledby="stsMicrosoftTitle">
      <div class="sts-panel-header"><div><h3 id="stsMicrosoftTitle">Microsoft 365</h3><p>Document integration</p></div><span class="sts-status failed">Not configured</span></div>
      <div class="sts-panel-body sts-integration-body">
        <dl class="sts-integration-facts">
          <div><dt>Connection status</dt><dd>Not configured</dd></div>
          <div><dt>Tenant</dt><dd>-</dd></div>
          <div><dt>SharePoint site</dt><dd>-</dd></div>
          <div><dt>Document library</dt><dd>-</dd></div>
          <div><dt>Last sync</dt><dd>Never</dd></div>
        </dl>
        <div class="sts-integration-actions">
          <button class="sts-button primary" type="button" disabled title="Requires a server-side Microsoft 365 connector">${icon("plug")}<span>Connect</span></button>
          <button class="sts-button" type="button" disabled title="No Microsoft 365 connection is configured">${icon("activity")}<span>Test connection</span></button>
        </div>
        <div class="sts-integration-notice" role="status">${icon("shield-check")}<span>Cloudflare remains the active project file service. Microsoft credentials are not stored in this client.</span></div>
        <div class="sts-storage-mapping" aria-label="Microsoft 365 storage mapping">
          <h4>Storage mapping</h4>
          ${[["Projects", "folder-kanban"], ["Field Photos", "camera"], ["Coreboxes", "image"], ["Samples", "package"], ["Reports", "file-text"]].map(([label, iconName]) => `<div>${icon(iconName)}<strong>${label}</strong><span>Not configured</span></div>`).join("")}
        </div>
        <div class="sts-attachment-states" aria-label="Attachment status states">
          <span class="sts-status local">Stored locally</span><span class="sts-status syncing">Uploading</span><span class="sts-status ready">Stored in SharePoint</span><span class="sts-status failed">Upload failed</span>
        </div>
      </div>
    </section>`);
    paintIcons(page);
  }

  function renderValidationPage() {
    const page = ensurePage("validation");
    const issues = validationData();
    const summary = Core.validationSummary(issues);
    page.innerHTML = `<div class="sts-page sts-validation-page"><header class="sts-page-header"><div class="sts-title-group"><div class="sts-eyebrow">${escapeHtml(state().activeBh || "Project")} / QA and QC</div><h2>Validation Review</h2><p>Errors block controlled export, warnings require review, and suggestions are optional improvements.</p></div><div class="sts-page-actions"><button class="sts-button" type="button" data-validation-export>${icon("download")}<span>Open Export</span></button><button class="sts-button primary" type="button" data-validation-refresh>${icon("refresh-cw")}<span>Run Validation</span></button></div></header><div class="sts-kpis"><div class="sts-kpi"><div class="label">Export-blocking errors</div><div class="value">${summary.error}</div><div class="context">Must be resolved before final issue</div></div><div class="sts-kpi"><div class="label">Warnings</div><div class="value">${summary.warning}</div><div class="context">Require engineering review</div></div><div class="sts-kpi"><div class="label">Suggestions</div><div class="value">${summary.suggestion}</div><div class="context">Optional data improvements</div></div><div class="sts-kpi"><div class="label">Active borehole</div><div class="value" style="font-size:18px">${escapeHtml(state().activeBh || "-")}</div><div class="context">Click an issue to open its record</div></div></div><section class="sts-panel"><div class="sts-panel-header"><h3>Validation register</h3><p>${issues.length} findings</p></div><div class="sts-panel-body" id="stsValidationPageIssues"></div></section></div>`;
    renderIssueGroups(page.querySelector("#stsValidationPageIssues"), issues, true);
    page.querySelector("[data-validation-refresh]").addEventListener("click", renderValidationPage);
    page.querySelector("[data-validation-export]").addEventListener("click", () => root.showTab("export"));
    paintIcons(page);
  }

  function renderExtraTab(tab) {
    if (tab === "bh-overview") renderBoreholeOverview();
    else if (tab === "dcp") renderDcp();
    else if (tab === "groundwater") renderGroundwater();
    else if (tab === "site-map") renderSiteMap();
    else if (tab === "documents") renderDocuments();
    else if (tab === "team") renderTeam();
    else if (tab === "validation") renderValidationPage();
  }

  function setExtraHash(tab) {
    const slug = EXTRA_SLUGS[tab];
    if (!slug) return;
    const registry = projectsState();
    const pid = registry.activePid || "";
    if (pid) root.history.replaceState(null, "", `#/projects/${pid}/${slug}`);
  }

  function applyExtraHashRoute() {
    const match = /^#\/projects\/([^/]+)\/([\w-]+)/.exec(root.location.hash);
    if (!match) return false;
    const tab = Object.keys(EXTRA_SLUGS).find((key) => EXTRA_SLUGS[key] === match[2]);
    if (!tab) return false;
    const open = () => root.showTab(tab);
    if (projectsState().activePid !== match[1] && typeof pjOpen === "function") {
      const exists = projectsState().projects.some((project) => project.pid === match[1]);
      if (exists) pjOpen(match[1]);
    }
    root.setTimeout(open, 0);
    return true;
  }

  function afterTab(tab) {
    if (BOREHOLE_CONTEXT.has(tab)) navigationLayer = "borehole";
    else if (["projects", "dashboard", "scope", "project", "boreholes", "site-map", "fieldwork", "laboratory", "documents", "team", "settings", "daily", "pipeline"].includes(tab)) navigationLayer = "project";
    document.body.classList.toggle("sts-reports-mode", tab === "preview");
    document.body.classList.toggle("sts-premium-page-mode", EXTRA_TABS.includes(tab));
    ensureShellTools();
    enhanceLandmarks();
    enhanceNavigation();
    ensureWorkspaceTabs(tab);
    patchControlBar(tab);
    if (EXTRA_TABS.includes(tab)) setExtraHash(tab);
    refreshShellStatus();
  }

  function scheduleShell() {
    if (shellQueued) return;
    shellQueued = true;
    root.setTimeout(() => { shellQueued = false; ensureShellTools(); enhanceNavigation(); refreshShellStatus(); }, 0);
  }

  function installObservers() {
    const topbar = document.querySelector(".topbar");
    const side = document.getElementById("sideNav");
    if (topbar) new MutationObserver(scheduleShell).observe(topbar, { childList: true, subtree: true });
    if (side) new MutationObserver(scheduleShell).observe(side, { childList: true, subtree: true });
  }

  function mount() {
    ensureExtraPages();
    applyRailPreference();
    enhanceLandmarks();
    enhanceNavigation();
    ensureShellTools();
    installObservers();

    if (typeof renderDashboard === "function") {
      dashboardRenderer = renderDashboard;
      renderDashboard = function () { dashboardRenderer(); enhanceDashboard(); };
    }
    if (typeof renderProjects === "undefined" || typeof renderProjects === "function") renderProjects = renderPortfolio;

    const previousShowTab = root.showTab;
    if (typeof previousShowTab !== "function") return;
    root.showTab = function (tab) {
      previousShowTab(tab);
      if (EXTRA_TABS.includes(tab)) renderExtraTab(tab);
      if (tab === "settings") enhanceSettings();
      afterTab(tab);
    };
    showTab = root.showTab;

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openCommandPalette(""); }
    });
    root.addEventListener("online", refreshShellStatus);
    root.addEventListener("offline", refreshShellStatus);
    root.addEventListener("hashchange", applyExtraHashRoute);

    const active = state().activeTab || "projects";
    if (!applyExtraHashRoute()) {
      if (active === "projects") renderPortfolio();
      else if (active === "dashboard") { if (typeof renderDashboard === "function") renderDashboard(); }
      else if (EXTRA_TABS.includes(active)) renderExtraTab(active);
      else if (active === "settings") enhanceSettings();
      afterTab(active);
    }
  }

  root.GeoFlowPremium = Object.freeze({
    escapeHtml,
    icon,
    paintIcons,
    saveState,
    activeLog,
    activeBorehole,
    projectStorageKey,
    toast,
    openCommandPalette,
    openValidationDrawer,
    closeValidationDrawer,
    navigateToIssue,
    renderValidationPage,
    renderBoreholeOverview,
    refreshShellStatus
  });

  mount();
})(typeof window !== "undefined" ? window : null);
