/* STS GeoFlow dedicated reports workspace. Uses the existing jsPDF borehole-log engine. */
(function (root) {
  "use strict";

  const Core = root.GeoFlowUICore;
  if (!Core) return;

  const CATEGORIES = [
    ["Borehole Logs", "file-text"],
    ["Corebox Reports", "image"],
    ["Field Test Reports", "gauge"],
    ["Laboratory Summaries", "flask-conical"],
    ["Project Reports", "folder-kanban"],
    ["Exports", "download"]
  ];

  const generated = new Map();
  const activity = Object.create(null);
  let files = [];
  let filesLoading = false;
  let filesError = "";
  let selectedCategory = "Borehole Logs";
  let selectedId = "";
  let fileRequest = 0;
  let fileController = null;
  let previewState = null;

  function app() { return root.GeoFlowPremium || {}; }
  function state() { return typeof S !== "undefined" ? S : { project: {}, boreholes: [], logs: {} }; }
  function escapeHtml(value) { return app().escapeHtml ? app().escapeHtml(value) : String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function icon(name) { return app().icon ? app().icon(name) : `<i data-lucide="${escapeHtml(name)}" aria-hidden="true"></i>`; }
  function paint() { if (app().paintIcons) app().paintIcons(); }
  function notify(message, type) { if (app().toast) app().toast(message, type); else if (typeof setStatus === "function") setStatus(message); }
  function saveState() { if (app().saveState) app().saveState(); else if (typeof save === "function") save(); }
  function projectKey() {
    if (app().projectStorageKey) return app().projectStorageKey();
    try { return typeof pjSyncKey === "function" ? pjSyncKey() : "__autosoil_project__"; }
    catch (error) { return "__autosoil_project__"; }
  }
  function headers() {
    try { return typeof syncHeaders === "function" ? syncHeaders() : { "Content-Type": "application/json" }; }
    catch (error) { return { "Content-Type": "application/json" }; }
  }
  function activePage() { return document.getElementById("page-preview"); }
  function isVisible() { const page = activePage(); return Boolean(page && page.classList.contains("show")); }
  function scrollWorkspaceTop() {
    const page = activePage();
    const scroller = page && page.closest(".content");
    if (!scroller) return;
    scroller.scrollTop = 0;
    requestAnimationFrame(() => {
      if (scroller.isConnected) scroller.scrollTop = 0;
    });
  }
  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  function statusClass(status) { return String(status || "draft").toLowerCase().replace(/\s+/g, "-"); }
  function selectedRow(rows) { return rows.find((row) => row.id === selectedId) || rows[0] || null; }
  function setSelected(row) {
    if (!row) return;
    selectedId = row.id;
    const source = state();
    if (row.boreholeId && source.boreholes.some((borehole) => borehole.id === row.boreholeId)) source.activeBh = row.boreholeId;
    renderReports();
  }

  function rowsForCategory() {
    if (selectedCategory !== "Borehole Logs") return [];
    return Core.reportRows(state(), files).map((row) => {
      const meta = state().reportMeta && state().reportMeta[row.boreholeId] || {};
      const transient = activity[row.id];
      let status = row.file ? "Ready" : "Draft";
      if (meta.archived) status = "Superseded";
      if (transient && transient.status) status = transient.status;
      return Object.assign({}, row, {
        revision: meta.revision || row.revision,
        status,
        generatedBy: row.file && (row.file.generatedBy || meta.generatedBy) || meta.generatedBy || "-",
        generatedDate: row.file && (row.file.ts || row.file.generatedDate) || meta.generatedDate || null,
        meta
      });
    });
  }

  function categoryCount(category) {
    if (category === "Borehole Logs") return (state().boreholes || []).length;
    const kinds = {
      "Corebox Reports": ["corebox-report"],
      "Field Test Reports": ["field-test-report"],
      "Laboratory Summaries": ["laboratory-summary"],
      "Project Reports": ["project-report"],
      "Exports": ["ags", "xlsx", "export"]
    };
    return files.filter((file) => (kinds[category] || []).some((kind) => String(file.kind || "").includes(kind))).length;
  }

  async function loadFiles(force) {
    if (filesLoading && !force) return;
    const token = ++fileRequest;
    if (fileController) fileController.abort();
    fileController = new AbortController();
    filesLoading = true;
    filesError = "";
    if (isVisible() && !previewState) renderReports({ preserveLoad: true });
    try {
      const response = await fetch(`/api/v1/files?project=${encodeURIComponent(projectKey())}`, {
        headers: headers(), signal: fileController.signal
      });
      if (!response.ok) throw new Error(response.status === 401 ? "Cloudflare file access requires the project API key." : `Cloudflare file list failed (${response.status}).`);
      const payload = await response.json();
      if (token !== fileRequest) return;
      files = Array.isArray(payload.files) ? payload.files : [];
    } catch (error) {
      if (error.name === "AbortError" || token !== fileRequest) return;
      filesError = error.message || "Unable to load report metadata.";
    } finally {
      if (token === fileRequest) {
        filesLoading = false;
        if (isVisible() && !previewState) renderReports({ preserveLoad: true });
      }
    }
  }

  function categoryMarkup() {
    return `<aside class="sts-report-categories" aria-label="Report categories">
      <h3>Categories & templates</h3>
      ${CATEGORIES.map(([label, iconName]) => `<button type="button" data-report-category="${escapeHtml(label)}" class="${selectedCategory === label ? "on" : ""}">
        ${icon(iconName)}<span>${escapeHtml(label)}</span><span style="margin-left:auto">${categoryCount(label)}</span>
      </button>`).join("")}
    </aside>`;
  }

  function rowMarkup(row, selected) {
    const failed = activity[row.id] && activity[row.id].message;
    return `<tr class="sts-report-row ${selected ? "selected" : ""}" data-report-id="${escapeHtml(row.id)}" tabindex="0" aria-selected="${selected}">
      <td class="primary-cell"><strong>${escapeHtml(row.name)}</strong><span>${failed ? escapeHtml(failed) : `${row.blockers.length} blocking issue${row.blockers.length === 1 ? "" : "s"}`}</span></td>
      <td>${escapeHtml(row.boreholeId)}</td>
      <td>${escapeHtml(row.template)}</td>
      <td>${escapeHtml(row.revision)}</td>
      <td><span class="sts-status ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
      <td>${escapeHtml(row.generatedBy)}</td>
      <td>${escapeHtml(formatDate(row.generatedDate))}</td>
      <td><div class="sts-row-actions"><button class="sts-icon-button" type="button" data-report-preview="${escapeHtml(row.id)}" title="Preview" aria-label="Preview ${escapeHtml(row.name)}">${icon("eye")}</button></div></td>
    </tr>`;
  }

  function listMarkup(rows, selected) {
    let body;
    if (filesLoading && !rows.length) {
      body = `<div class="sts-loading" role="status">Loading Cloudflare report metadata...</div>`;
    } else if (filesError && !rows.length) {
      body = `<div class="sts-error-state">${icon("cloud-off")}<div><strong>Reports could not be loaded</strong><span>${escapeHtml(filesError)}</span></div><button class="sts-button" id="stsReportRetry" type="button">${icon("refresh-cw")} Retry</button></div>`;
    } else if (!rows.length) {
      body = `<div class="sts-empty">${icon("files")}<div><strong>No ${escapeHtml(selectedCategory.toLowerCase())}</strong><span>This project has no records for this report category.</span></div></div>`;
    } else {
      body = `<div class="sts-data-table-wrap"><table class="sts-data-table" aria-label="${escapeHtml(selectedCategory)}">
        <colgroup><col style="width:220px"><col style="width:80px"><col style="width:180px"><col style="width:64px"><col style="width:94px"><col style="width:105px"><col style="width:130px"><col style="width:56px"></colgroup>
        <thead><tr><th>Report Name</th><th>Borehole</th><th>Template</th><th>Revision</th><th>Status</th><th>Generated By</th><th>Generated Date</th><th>Actions</th></tr></thead>
        <tbody>${rows.map((row) => rowMarkup(row, selected && row.id === selected.id)).join("")}</tbody>
      </table></div>`;
    }
    return `<section class="sts-report-list" aria-label="Report list">
      <header class="sts-report-list-head"><h3>${escapeHtml(selectedCategory)}</h3>
        ${filesError ? `<span class="sts-status failed" title="${escapeHtml(filesError)}">Cloud unavailable</span>` : filesLoading ? `<span class="sts-status syncing">Refreshing</span>` : `<span class="sts-status ready">${rows.length} records</span>`}
        <button class="sts-icon-button" id="stsRefreshReports" type="button" title="Refresh report metadata" aria-label="Refresh report metadata">${icon("refresh-cw")}</button>
      </header>${body}</section>`;
  }

  function detailsMarkup(row) {
    if (!row) return `<aside class="sts-report-details"><div class="sts-empty">${icon("panel-right")}<div><strong>Select a report</strong><span>Details and actions will appear here.</span></div></div></aside>`;
    const approved = row.approval;
    const canApprove = row.status === "Ready" && !row.blockers.length;
    return `<aside class="sts-report-details" aria-label="Selected report details">
      <h3>${escapeHtml(row.name)}</h3>
      <div class="meta">${escapeHtml(row.template)}</div>
      <dl class="sts-detail-list">
        <div><dt>Status</dt><dd><span class="sts-status ${statusClass(row.status)}">${escapeHtml(row.status)}</span></dd></div>
        <div><dt>Borehole</dt><dd>${escapeHtml(row.boreholeId)}</dd></div>
        <div><dt>Revision</dt><dd>${escapeHtml(row.revision)}</dd></div>
        <div><dt>Validation</dt><dd>${row.blockers.length ? `${row.blockers.length} blocker${row.blockers.length === 1 ? "" : "s"}` : "No blockers"}</dd></div>
        <div><dt>Generated</dt><dd>${escapeHtml(formatDate(row.generatedDate))}</dd></div>
        <div><dt>Approved</dt><dd>${approved ? `${escapeHtml(approved.by)} | ${escapeHtml(formatDate(approved.at))}` : "Not approved"}</dd></div>
      </dl>
      <div class="sts-report-actions">
        <button class="sts-button primary" type="button" data-report-action="preview">${icon("eye")} Preview</button>
        <button class="sts-button" type="button" data-report-action="generate">${icon(row.file ? "refresh-cw" : "file-plus-2")} ${row.file ? "Regenerate" : "Generate"}</button>
        <button class="sts-button" type="button" data-report-action="download">${icon("download")} Download</button>
        <button class="sts-button" type="button" data-report-action="open" ${row.file ? "" : "disabled"}>${icon("external-link")} Open saved PDF</button>
        <button class="sts-button" type="button" data-report-action="share" ${row.file ? "" : "disabled"}>${icon("share-2")} Share route</button>
        <button class="sts-button" type="button" data-report-action="approve" ${canApprove ? "" : "disabled"}>${icon("badge-check")} Approve</button>
        <button class="sts-button ${row.meta.archived ? "" : "danger"}" type="button" data-report-action="archive">${icon(row.meta.archived ? "archive-restore" : "archive")} ${row.meta.archived ? "Restore" : "Archive"}</button>
      </div>
      ${row.blockers.length ? `<button class="sts-button" id="stsReviewReportIssues" type="button" style="width:100%;margin-top:8px">${icon("triangle-alert")} Review validation blockers</button>` : ""}
    </aside>`;
  }

  function wireWorkspace(rows, selected) {
    const page = activePage();
    page.querySelectorAll("[data-report-category]").forEach((button) => button.addEventListener("click", () => {
      selectedCategory = button.dataset.reportCategory;
      selectedId = "";
      renderReports({ preserveLoad: true });
    }));
    page.querySelectorAll("[data-report-id]").forEach((rowElement) => {
      const activate = () => setSelected(rows.find((row) => row.id === rowElement.dataset.reportId));
      rowElement.addEventListener("click", (event) => { if (!event.target.closest("button")) activate(); });
      rowElement.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
    });
    page.querySelectorAll("[data-report-preview]").forEach((button) => button.addEventListener("click", () => {
      const row = rows.find((item) => item.id === button.dataset.reportPreview);
      if (row) { selectedId = row.id; openPreview(row); }
    }));
    page.querySelector("#stsRefreshReports")?.addEventListener("click", () => loadFiles(true));
    page.querySelector("#stsReportRetry")?.addEventListener("click", () => loadFiles(true));
    page.querySelector("#stsReviewReportIssues")?.addEventListener("click", () => app().openValidationDrawer && app().openValidationDrawer());
    page.querySelectorAll("[data-report-action]").forEach((button) => button.addEventListener("click", () => handleAction(button.dataset.reportAction, selected)));
  }

  function renderReports(options) {
    const page = activePage();
    if (!page) return;
    previewState = null;
    const rows = rowsForCategory();
    const selected = selectedRow(rows);
    if (selected && selectedId !== selected.id) selectedId = selected.id;
    const ready = rows.filter((row) => row.status === "Ready").length;
    const blocked = rows.filter((row) => row.blockers.length).length;
    page.innerHTML = `<div class="sts-page sts-reports-page">
      <header class="sts-page-header"><div class="sts-title-group"><div class="sts-eyebrow">Project output</div><h2>Reports</h2>
        <p>${ready} report${ready === 1 ? " is" : "s are"} ready. ${blocked ? `${blocked} require validation review before approval.` : "No report approval blockers are present."}</p></div>
        <div class="sts-page-actions"><button class="sts-button" id="stsValidateReports" type="button">${icon("shield-check")} Validate project</button>
        <button class="sts-button primary" id="stsGenerateSelected" type="button" ${selected ? "" : "disabled"}>${icon("file-plus-2")} Generate selected</button></div></header>
      <div class="sts-reports">${categoryMarkup()}${listMarkup(rows, selected)}${detailsMarkup(selected)}</div>
    </div>`;
    page.querySelector("#stsValidateReports")?.addEventListener("click", () => app().openValidationDrawer && app().openValidationDrawer());
    page.querySelector("#stsGenerateSelected")?.addEventListener("click", () => selected && generateAndSave(selected));
    wireWorkspace(rows, selected);
    paint();
    scrollWorkspaceTop();
    if ((!options || !options.preserveLoad) && !filesLoading && !files.length && !filesError) loadFiles(false);
  }

  function ensureGenerated(row, regenerate) {
    if (!regenerate && generated.has(row.id)) return generated.get(row.id);
    if (typeof buildPdf !== "function") throw new Error("The PDF engine is unavailable.");
    const doc = buildPdf(row.boreholeId);
    const previous = generated.get(row.id);
    if (previous && previous.url) URL.revokeObjectURL(previous.url);
    const blob = doc.output("blob");
    const item = { doc, blob, url: URL.createObjectURL(blob), pages: doc.getNumberOfPages(), at: new Date().toISOString() };
    generated.set(row.id, item);
    return item;
  }

  async function generateAndSave(row) {
    const stayInPreview = Boolean(previewState && previewState.row.id === row.id);
    activity[row.id] = { status: "Generating", message: "" };
    if (!stayInPreview) renderReports({ preserveLoad: true });
    try {
      const item = ensureGenerated(row, true);
      const data = item.doc.output("datauristring");
      const source = state();
      source.reportMeta = source.reportMeta || {};
      source.reportMeta[row.boreholeId] = Object.assign({}, source.reportMeta[row.boreholeId], {
        generatedBy: source.project.loggedBy || "Current user",
        generatedDate: item.at,
        archived: false
      });
      const response = await fetch("/api/v1/files", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ project: projectKey(), id: row.id, name: `log-${row.boreholeId}.pdf`, kind: "report-pdf", data })
      });
      if (!response.ok) throw new Error(response.status === 401 ? "Cloudflare save requires the project API key." : `Cloudflare save failed (${response.status}).`);
      delete activity[row.id];
      saveState();
      notify(`${row.name} generated and saved to Cloudflare.`, "success");
      await loadFiles(true);
      if (stayInPreview && previewState) {
        previewState.item = item;
        previewState.page = 1;
        previewState.row = rowsForCategory().find((candidate) => candidate.id === row.id) || row;
        renderPreviewScreen();
      }
      return item;
    } catch (error) {
      activity[row.id] = { status: "Failed", message: error.message || "Generation failed." };
      if (!stayInPreview) renderReports({ preserveLoad: true });
      notify(activity[row.id].message, "error");
      throw error;
    }
  }

  async function fetchStoredFile(row) {
    const response = await fetch(`/api/v1/files?project=${encodeURIComponent(projectKey())}&id=${encodeURIComponent(row.id)}`, { headers: headers() });
    if (!response.ok) throw new Error(response.status === 404 ? "The saved PDF no longer exists." : `Cloudflare file open failed (${response.status}).`);
    const file = await response.json();
    if (!file.data) throw new Error("The saved PDF has no file data.");
    return file;
  }

  function triggerDownload(href, name) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = name;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function downloadReport(row) {
    try {
      if (row.file) {
        const file = await fetchStoredFile(row);
        triggerDownload(file.data, file.name || `log-${row.boreholeId}.pdf`);
      } else {
        const item = ensureGenerated(row, false);
        triggerDownload(item.url, `log-${row.boreholeId}.pdf`);
      }
    } catch (error) { notify(error.message, "error"); }
  }

  async function openStoredReport(row) {
    const tab = root.open("", "_blank");
    try {
      const file = await fetchStoredFile(row);
      if (tab) tab.location.href = file.data;
      else notify("Allow pop-ups to open the saved PDF.", "warning");
    } catch (error) {
      if (tab) tab.close();
      notify(error.message, "error");
    }
  }

  async function shareRoute(row) {
    const projectId = typeof PJ !== "undefined" && PJ.activePid || "";
    const url = `${location.origin}${location.pathname}${location.search}#/projects/${encodeURIComponent(projectId)}/reports?report=${encodeURIComponent(row.id)}`;
    try { await navigator.clipboard.writeText(url); notify("Report route copied.", "success"); }
    catch (error) { root.prompt("Report route", url); }
  }

  function approve(row) {
    if (row.blockers.length || row.status !== "Ready") return;
    const source = state();
    source.reportApprovals = source.reportApprovals || {};
    source.reportMeta = source.reportMeta || {};
    const by = source.project.approvedBy || source.project.checkedBy || source.project.loggedBy || "Current user";
    source.reportApprovals[row.boreholeId] = { by, at: new Date().toISOString(), revision: row.revision };
    source.reportMeta[row.boreholeId] = Object.assign({}, source.reportMeta[row.boreholeId], { revision: row.revision });
    saveState();
    notify(`${row.name} approved as ${row.revision}.`, "success");
    if (previewState) openPreview(Object.assign({}, row, { approval: source.reportApprovals[row.boreholeId] }), true);
    else renderReports({ preserveLoad: true });
  }

  function toggleArchive(row) {
    const source = state();
    source.reportMeta = source.reportMeta || {};
    source.reportMeta[row.boreholeId] = Object.assign({}, source.reportMeta[row.boreholeId], { archived: !row.meta.archived });
    saveState();
    notify(`${row.name} ${row.meta.archived ? "restored" : "archived"}.`, "success");
    renderReports({ preserveLoad: true });
  }

  async function handleAction(action, row) {
    if (!row) return;
    if (action === "preview") return openPreview(row);
    if (action === "generate") { try { await generateAndSave(row); } catch (error) {} return; }
    if (action === "download") return downloadReport(row);
    if (action === "open") return openStoredReport(row);
    if (action === "share") return shareRoute(row);
    if (action === "approve") return approve(row);
    if (action === "archive") return toggleArchive(row);
  }

  function previewIssueMarkup(row) {
    const issues = Core.collectValidation(state()).filter((issue) => !issue.boreholeId || issue.boreholeId === row.boreholeId);
    const summary = Core.validationSummary(issues);
    return `<h4>Validation summary</h4>
      <div class="sts-validation-summary" style="padding:0;border:0;background:none;grid-template-columns:repeat(3,1fr)">
        <button type="button" disabled><b>${summary.error}</b>Errors</button><button type="button" disabled><b>${summary.warning}</b>Warnings</button><button type="button" disabled><b>${summary.suggestion}</b>Notes</button>
      </div>
      ${issues.length ? `<div style="margin-top:10px">${issues.slice(0, 12).map((issue) => `<button type="button" class="sts-issue ${escapeHtml(issue.severity)}" data-preview-issue="${escapeHtml(issue.id)}">${icon(issue.severity === "error" ? "circle-x" : issue.severity === "warning" ? "triangle-alert" : "info")}<span><strong>${escapeHtml(issue.message)}</strong><span>${escapeHtml(issue.area)}${issue.depth != null ? ` | ${Core.formatDepth(issue.depth)}` : ""}</span></span>${icon("chevron-right")}</button>`).join("")}</div>` : `<p style="color:var(--gf-green-deep);font-size:11px">No validation issues for this report.</p>`}`;
  }

  function openPreview(row, reuse) {
    const page = activePage();
    if (!page) return;
    let item;
    try { item = ensureGenerated(row, !reuse); }
    catch (error) { notify(error.message, "error"); return; }
    previewState = { row, item, page: 1, fit: "width", zoom: 100 };
    renderPreviewScreen();
  }

  function previewUrl() {
    const current = previewState;
    if (!current) return "";
    const zoom = current.fit === "page" ? "page-fit" : current.fit === "width" ? "page-width" : current.zoom;
    return `${current.item.url}#page=${current.page}&zoom=${zoom}&navpanes=0`;
  }

  function renderPreviewScreen() {
    if (!previewState) return;
    const page = activePage();
    const current = previewState;
    const row = current.row;
    const canApprove = !row.blockers.length && row.status === "Ready";
    page.innerHTML = `<div class="sts-page"><div class="sts-report-preview">
      <div class="sts-pdf-toolbar">
        <button class="sts-icon-button" id="stsPreviewBack" type="button" title="Back to reports" aria-label="Back to reports">${icon("arrow-left")}</button>
        <span class="sts-pdf-title" title="${escapeHtml(row.name)} | ${escapeHtml(row.revision)}">${escapeHtml(row.name)} | ${escapeHtml(row.revision)}</span><span class="spacer"></span>
        <button class="sts-icon-button" id="stsPrevPage" type="button" title="Previous page" aria-label="Previous page" ${current.page <= 1 ? "disabled" : ""}>${icon("chevron-left")}</button>
        <label style="font-size:10.5px">Page <input id="stsPdfPage" type="number" min="1" max="${current.item.pages}" value="${current.page}" style="width:48px;height:30px;border:1px solid var(--gf-border-strong);border-radius:5px;text-align:center"> of ${current.item.pages}</label>
        <button class="sts-icon-button" id="stsNextPage" type="button" title="Next page" aria-label="Next page" ${current.page >= current.item.pages ? "disabled" : ""}>${icon("chevron-right")}</button>
        <button class="sts-button" id="stsFitPage" type="button">${icon("maximize")} Fit page</button>
        <button class="sts-button" id="stsFitWidth" type="button">${icon("move-horizontal")} Fit width</button>
        <button class="sts-icon-button" id="stsZoomOut" type="button" title="Zoom out" aria-label="Zoom out">${icon("zoom-out")}</button>
        <span style="font-size:10.5px;min-width:38px;text-align:center">${current.zoom}%</span>
        <button class="sts-icon-button" id="stsZoomIn" type="button" title="Zoom in" aria-label="Zoom in">${icon("zoom-in")}</button>
        <button class="sts-button" id="stsPreviewDownload" type="button">${icon("download")} Download</button>
        <button class="sts-button" id="stsPreviewRegenerate" type="button">${icon("refresh-cw")} Regenerate</button>
        <button class="sts-button primary" id="stsPreviewApprove" type="button" ${canApprove ? "" : "disabled"}>${icon("badge-check")} Approve</button>
      </div>
      <div class="sts-pdf-stage"><aside class="sts-pdf-review">${previewIssueMarkup(row)}</aside>
        <iframe id="stsPdfFrame" title="PDF preview for ${escapeHtml(row.name)}" src="${escapeHtml(previewUrl())}"></iframe></div>
    </div></div>`;
    page.querySelector("#stsPreviewBack").addEventListener("click", () => renderReports({ preserveLoad: true }));
    page.querySelector("#stsPrevPage").addEventListener("click", () => updatePreviewPage(current.page - 1));
    page.querySelector("#stsNextPage").addEventListener("click", () => updatePreviewPage(current.page + 1));
    page.querySelector("#stsPdfPage").addEventListener("change", (event) => updatePreviewPage(Number(event.target.value)));
    page.querySelector("#stsFitPage").addEventListener("click", () => updatePreviewFit("page"));
    page.querySelector("#stsFitWidth").addEventListener("click", () => updatePreviewFit("width"));
    page.querySelector("#stsZoomOut").addEventListener("click", () => updatePreviewZoom(current.zoom - 10));
    page.querySelector("#stsZoomIn").addEventListener("click", () => updatePreviewZoom(current.zoom + 10));
    page.querySelector("#stsPreviewDownload").addEventListener("click", () => triggerDownload(current.item.url, `log-${row.boreholeId}.pdf`));
    page.querySelector("#stsPreviewRegenerate").addEventListener("click", async () => {
      try { await generateAndSave(row); } catch (error) {}
    });
    page.querySelector("#stsPreviewApprove").addEventListener("click", () => approve(row));
    page.querySelectorAll("[data-preview-issue]").forEach((button) => button.addEventListener("click", () => {
      const issue = Core.collectValidation(state()).find((entry) => entry.id === button.dataset.previewIssue);
      if (issue && app().navigateToIssue) app().navigateToIssue(issue);
      else if (app().openValidationDrawer) app().openValidationDrawer();
    }));
    paint();
    scrollWorkspaceTop();
  }

  function updatePreviewPage(value) {
    if (!previewState) return;
    previewState.page = Math.max(1, Math.min(previewState.item.pages, Number(value) || 1));
    renderPreviewScreen();
  }
  function updatePreviewFit(mode) { if (!previewState) return; previewState.fit = mode; renderPreviewScreen(); }
  function updatePreviewZoom(value) { if (!previewState) return; previewState.fit = "zoom"; previewState.zoom = Math.max(40, Math.min(200, value)); renderPreviewScreen(); }

  function selectFromHash() {
    const match = location.hash.match(/[?&]report=([^&]+)/);
    if (match) selectedId = decodeURIComponent(match[1]);
  }

  function mount() {
    if (typeof renderPreview === "undefined") return;
    selectFromHash();
    renderPreview = renderReports;
    root.addEventListener("hashchange", selectFromHash);
    if (state().activeTab === "preview" && isVisible()) renderReports();
  }

  root.GeoFlowReports = Object.freeze({ render: renderReports, loadFiles, generateAndSave, openPreview, rows: rowsForCategory });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})(window);
