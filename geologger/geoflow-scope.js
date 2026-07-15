(function (root) {
  "use strict";

  if (!root || !root.document || !root.MutationObserver) return;

  const document = root.document;
  const STEP_LABELS = [
    "Upload Proposal",
    "Extract Scope",
    "Review & Confirm",
    "Generate Field Plan",
    "Send to Control Tower"
  ];
  const CATEGORY_LABELS = {
    drilling: "Drilling",
    insitu: "In-situ testing",
    sampling: "Sampling",
    gw: "Groundwater",
    lab: "Laboratory",
    reporting: "Reporting",
    env: "Environmental",
    qa: "QA / Review",
    missing: "Missing / uncertain"
  };

  let enhancing = false;
  let scheduled = false;
  let selectedItemId = "";
  let activePlanPane = "boreholes";

  function appState() {
    return typeof S !== "undefined" ? S : { project: {}, scope: null };
  }

  function scopeState() {
    return appState().scope || { step: 1, docs: [], items: [], plan: null };
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function icon(name) {
    return `<i data-lucide="${escapeHtml(name)}" aria-hidden="true"></i>`;
  }

  function paintIcons() {
    if (root.GeoFlowPremium && typeof root.GeoFlowPremium.paintIcons === "function") {
      root.GeoFlowPremium.paintIcons();
    }
  }

  function decorateButton(button, iconName, label) {
    if (!button) return;
    button.innerHTML = `${icon(iconName)}<span>${escapeHtml(label)}</span>`;
    button.setAttribute("aria-label", label);
  }

  function decorateIconButton(button, iconName, label) {
    if (!button) return;
    button.classList.add("sts-scope-icon-button");
    button.innerHTML = icon(iconName);
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  function workflowStatus(scope) {
    const docs = Array.isArray(scope.docs) ? scope.docs.length : 0;
    const items = Array.isArray(scope.items) ? scope.items : [];
    const unresolved = items.filter((item) => item.status === "rev").length;
    if (scope.sentToTower) return { label: "Published", tone: "complete", icon: "radio-tower" };
    if (scope.plan) return { label: "Field plan ready", tone: "ready", icon: "clipboard-check" };
    if (items.length && unresolved) return { label: `${unresolved} to review`, tone: "attention", icon: "circle-alert" };
    if (items.length) return { label: "Scope reviewed", tone: "ready", icon: "circle-check" };
    if (docs) return { label: `${docs} proposal ${docs === 1 ? "file" : "files"}`, tone: "ready", icon: "file-check" };
    return { label: "Not started", tone: "neutral", icon: "circle-dashed" };
  }

  function buildHeader(scope) {
    const status = workflowStatus(scope);
    const header = document.createElement("header");
    header.className = "sts-scope-header";
    header.innerHTML = `
      <div class="sts-scope-heading">
        <span class="sts-scope-kicker">Project delivery</span>
        <h1>Scope &amp; Plan</h1>
      </div>
      <div class="sts-scope-state ${status.tone}">
        ${icon(status.icon)}
        <span>${escapeHtml(status.label)}</span>
        <small>Step ${Math.max(1, Math.min(5, Number(scope.step) || 1))} of 5</small>
      </div>`;
    return header;
  }

  function enhanceStepper(stepper, currentStep) {
    stepper.setAttribute("aria-label", "Scope and plan progress");
    stepper.setAttribute("role", "tablist");
    let activeStep = null;
    Array.from(stepper.querySelectorAll(".st")).forEach((step, index) => {
      const stepNumber = index + 1;
      const complete = stepNumber < currentStep;
      const active = stepNumber === currentStep;
      if (active) activeStep = step;
      step.setAttribute("role", "tab");
      step.setAttribute("tabindex", active ? "0" : "-1");
      step.setAttribute("aria-selected", String(active));
      step.setAttribute("aria-label", `Step ${stepNumber}: ${STEP_LABELS[index]}`);
      step.innerHTML = `
        <span class="sts-step-marker">${complete ? icon("check") : stepNumber}</span>
        <span class="sts-step-label">${escapeHtml(STEP_LABELS[index])}</span>`;
      step.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        step.click();
      });
    });
    if (activeStep) {
      root.requestAnimationFrame(() => {
        const target = activeStep.offsetLeft - Math.max(0, (stepper.clientWidth - activeStep.offsetWidth) / 2);
        stepper.scrollLeft = Math.max(0, target);
      });
    }
  }

  function coreDetailsCount(scope) {
    const meta = scope.meta || {};
    return [meta.projectNumber, meta.client, meta.site, meta.pm].filter((value) => String(value || "").trim()).length;
  }

  function enhanceUpload(body, scope) {
    body.classList.add("sts-scope-upload");
    const cards = Array.from(body.children).filter((child) => child.classList && child.classList.contains("sc-card"));
    const sourceCard = cards[0];
    const projectCard = cards[1];
    if (!sourceCard || !projectCard) return;

    sourceCard.classList.add("sts-proposal-source");
    const sourceHeading = sourceCard.querySelector("h3");
    if (sourceHeading) sourceHeading.textContent = "Proposal source";
    const drop = sourceCard.querySelector(".sc-drop");
    if (drop) {
      const input = drop.querySelector("input");
      const hasDocuments = Array.isArray(scope.docs) && scope.docs.length > 0;
      drop.classList.toggle("has-documents", hasDocuments);
      drop.innerHTML = `
        <span class="sts-drop-icon">${icon(hasDocuments ? "file-plus-2" : "upload-cloud")}</span>
        <strong>${hasDocuments ? "Add another proposal file" : "Drop proposal files"}</strong>
        <span>PDF, Word, image, text or email</span>
        <span class="sts-drop-action">Browse files</span>`;
      if (input) drop.appendChild(input);
    }

    const paste = sourceCard.querySelector("details");
    if (paste) {
      paste.classList.add("sts-inline-disclosure");
      const summary = paste.querySelector("summary");
      if (summary) summary.textContent = "Paste proposal text";
    }

    const projectDetails = document.createElement("details");
    projectDetails.className = "sts-project-details";
    const count = coreDetailsCount(scope);
    projectDetails.innerHTML = `
      <summary>
        <span>${icon("briefcase-business")}<b>Project details</b></span>
        <small>${count}/4 core details</small>
      </summary>`;
    Array.from(projectCard.children).forEach((child) => {
      if (child.tagName !== "H3") projectDetails.appendChild(child);
    });
    projectCard.replaceWith(projectDetails);

    const grid = document.createElement("div");
    grid.className = "sts-upload-grid";
    sourceCard.parentNode.insertBefore(grid, sourceCard);
    grid.append(sourceCard, projectDetails);

    const actions = Array.from(body.children).find((child) => child !== grid && child.querySelector && (child.querySelector("#scToExtract") || child.querySelector("#scNewProp")));
    if (actions) {
      actions.className = "sts-scope-command";
      const reset = actions.querySelector("#scNewProp");
      const hasScopeData = Boolean((scope.docs || []).length || (scope.items || []).length || scope.plan);
      if (reset) reset.hidden = !hasScopeData;
      decorateButton(actions.querySelector("#scToExtract"), "scan-text", "Extract scope");
      decorateButton(reset, "rotate-ccw", "Start again");
    }
  }

  function enhanceExtract(body) {
    body.classList.add("sts-scope-extract");
    const card = body.querySelector(".sc-card");
    if (!card) return;
    card.classList.add("sts-extract-panel");
    const heading = card.querySelector("h3");
    if (heading) heading.innerHTML = `${icon("scan-text")}<span>Extract scope</span>`;
    decorateButton(card.querySelector("#scRunEx"), "scan-text", card.querySelector("#scRunEx")?.textContent.includes("Re-") ? "Re-extract scope" : "Extract scope");
    decorateButton(card.querySelector("#scKeep"), "arrow-right", "Keep current items");
  }

  function confidenceLabel(value) {
    const percent = Math.round((Number(value) || 0) * 100);
    if (percent >= 80) return `${percent}% high`;
    if (percent >= 55) return `${percent}% review`;
    return `${percent}% low`;
  }

  function renderInspector(container, item) {
    if (!item) {
      container.innerHTML = `
        <div class="sts-inspector-title">${icon("file-search")}<h3>Evidence</h3></div>
        <div class="sts-inspector-empty"><strong>No scope item selected</strong><span>Evidence is empty until scope items exist.</span></div>`;
      return;
    }
    const source = item.doc && item.doc !== "manual" ? item.doc : "Manual entry";
    const page = item.page ? `Page ${item.page}` : "No source page";
    container.innerHTML = `
      <div class="sts-inspector-title">${icon("file-search")}<h3>Evidence</h3></div>
      <span class="sts-inspector-category">${escapeHtml(CATEGORY_LABELS[item.cat] || "Scope item")}</span>
      <h4>${escapeHtml(item.name || "Scope item")}</h4>
      <dl class="sts-inspector-meta">
        <div><dt>Source</dt><dd>${escapeHtml(source)}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml(page)}</dd></div>
        <div><dt>Confidence</dt><dd>${escapeHtml(confidenceLabel(item.conf))}</dd></div>
      </dl>
      ${item.snippet ? `<blockquote>${escapeHtml(item.snippet)}</blockquote>` : '<div class="sts-inspector-empty compact">No source excerpt recorded.</div>'}
      ${item.comment ? `<div class="sts-inspector-note"><b>Review note</b><span>${escapeHtml(item.comment)}</span></div>` : ""}
      ${item.page ? `<button class="sc-btn" type="button" data-sts-open-source="${escapeHtml(item.id)}">${icon("panel-left-open")}<span>Open source</span></button>` : ""}`;
  }

  function reviewCounts(scope) {
    const items = Array.isArray(scope.items) ? scope.items : [];
    return {
      accepted: items.filter((item) => item.status === "acc").length,
      review: items.filter((item) => item.status === "rev").length,
      rejected: items.filter((item) => item.status === "rej").length
    };
  }

  function enhanceReview(body, scope) {
    body.classList.add("sts-scope-review");
    const tabs = body.querySelector(".sc-pane-tabs");
    if (tabs) {
      const labels = ["Proposal", "Scope register", "Evidence & QA"];
      Array.from(tabs.querySelectorAll("button")).forEach((button, index) => { button.textContent = labels[index] || button.textContent; });
    }

    const split = body.querySelector(".sc-split.three");
    if (!split) return;
    const panes = Array.from(split.children);
    const documentPane = panes[0];
    const registerPane = panes[1];
    const inspectorPane = panes[2];
    if (documentPane) documentPane.classList.add("sts-source-pane");
    if (!registerPane || !inspectorPane) return;
    registerPane.classList.add("sts-register-pane");
    inspectorPane.classList.add("sts-review-pane");

    if (documentPane) {
      decorateIconButton(documentPane.querySelector("#pvPrev"), "chevron-left", "Previous page");
      decorateIconButton(documentPane.querySelector("#pvNext"), "chevron-right", "Next page");
      decorateIconButton(documentPane.querySelector("#pvZi"), "zoom-in", "Zoom in");
      decorateIconButton(documentPane.querySelector("#pvZo"), "zoom-out", "Zoom out");
    }

    const registerCard = registerPane.querySelector(".sc-card");
    if (registerCard) {
      registerCard.classList.add("sts-scope-register");
      const filters = registerCard.querySelector(".sc-filters");
      if (filters && !registerCard.querySelector(".sts-scope-search")) {
        const search = document.createElement("label");
        search.className = "sts-scope-search";
        search.innerHTML = `${icon("search")}<span class="sts-visually-hidden">Search scope items</span><input type="search" placeholder="Search scope" autocomplete="off">`;
        registerCard.insertBefore(search, filters);
        search.querySelector("input").addEventListener("input", (event) => {
          const query = event.target.value.trim().toLowerCase();
          registerCard.querySelectorAll("tbody tr").forEach((row) => {
            row.hidden = Boolean(query) && !row.textContent.toLowerCase().includes(query);
          });
        });
      }

      const table = registerCard.querySelector("table.sc-tbl");
      if (table) {
        const headers = Array.from(table.querySelectorAll("thead th")).map((cell) => cell.textContent.trim());
        Array.from(table.querySelectorAll("tbody tr")).forEach((row) => {
          const itemButton = row.querySelector("[data-scedit]");
          const itemId = itemButton ? itemButton.dataset.scedit : "";
          if (itemId) row.dataset.scopeItem = itemId;
          Array.from(row.children).forEach((cell, index) => { cell.dataset.label = headers[index] || ""; });
          decorateIconButton(row.querySelector("[data-scedit]"), "pencil", "Edit scope item");
          decorateIconButton(row.querySelector("[data-scsplit]"), "split", "Split scope item");
          decorateIconButton(row.querySelector("[data-scdel]"), "trash-2", "Delete scope item");
        });
      }

      decorateButton(registerCard.querySelector("#scAdd"), "plus", "Add item");
      decorateButton(registerCard.querySelector("#scReEx"), "refresh-cw", "Re-extract");
      decorateButton(registerCard.querySelector("#scAccAll"), "badge-check", "Approve high confidence");
    }

    const counts = reviewCounts(scope);
    const oldSummary = Array.from(inspectorPane.querySelectorAll(":scope > .sc-card")).find((card) => /Scope summary/i.test(card.querySelector("h3")?.textContent || ""));
    if (oldSummary) oldSummary.remove();
    const qaCard = Array.from(inspectorPane.querySelectorAll(":scope > .sc-card")).find((card) => /QA checks/i.test(card.querySelector("h3")?.textContent || ""));
    if (qaCard) {
      qaCard.classList.add("sts-scope-qa");
      const heading = qaCard.querySelector("h3");
      if (heading) heading.textContent = "Validation";
    }

    const summary = document.createElement("div");
    summary.className = "sts-review-counts";
    summary.innerHTML = `
      <span><b>${counts.accepted}</b>Accepted</span>
      <span class="attention"><b>${counts.review}</b>Review</span>
      <span><b>${counts.rejected}</b>Rejected</span>`;
    inspectorPane.prepend(summary);

    const inspector = document.createElement("section");
    inspector.className = "sts-scope-inspector";
    inspector.setAttribute("aria-live", "polite");
    const availableItems = Array.isArray(scope.items) ? scope.items : [];
    if (!availableItems.some((item) => item.id === selectedItemId)) {
      selectedItemId = availableItems.find((item) => item.status === "rev")?.id || availableItems[0]?.id || "";
    }
    renderInspector(inspector, availableItems.find((item) => item.id === selectedItemId));
    summary.after(inspector);

    function selectItem(itemId) {
      if (!itemId) return;
      selectedItemId = itemId;
      registerPane.querySelectorAll("tr[data-scope-item]").forEach((row) => row.classList.toggle("is-selected", row.dataset.scopeItem === itemId));
      renderInspector(inspector, availableItems.find((item) => item.id === itemId));
      paintIcons();
      const openSource = inspector.querySelector("[data-sts-open-source]");
      if (openSource) openSource.addEventListener("click", () => {
        const sourceLink = registerPane.querySelector(`tr[data-scope-item="${CSS.escape(itemId)}"] [data-scpg]`);
        if (sourceLink) sourceLink.click();
      });
    }

    registerPane.querySelectorAll("tr[data-scope-item]").forEach((row) => {
      row.classList.toggle("is-selected", row.dataset.scopeItem === selectedItemId);
      row.addEventListener("click", (event) => {
        if (event.target.closest("button, a, input, select, textarea")) return;
        selectItem(row.dataset.scopeItem);
      });
    });
    selectItem(selectedItemId);

    const actions = Array.from(inspectorPane.children).find((child) => child.querySelector && (child.querySelector("#scApprove") || child.querySelector("#scExport")));
    if (actions) {
      actions.className = "sts-review-actions";
      decorateButton(actions.querySelector("#scApprove"), "arrow-right", "Approve scope");
      decorateButton(actions.querySelector("#scExport"), "download", "Export CSV");
    }
  }

  function enhancePlan(body) {
    body.classList.add("sts-scope-plan");
    const summary = body.querySelector(":scope > .sc-card");
    if (summary) {
      summary.classList.add("sts-plan-summary");
      const heading = summary.querySelector("h3");
      if (heading) heading.textContent = "Field plan";
      const settingsGrid = summary.querySelector(":scope > .sc-grid2");
      if (settingsGrid) {
        const disclosure = document.createElement("details");
        disclosure.className = "sts-plan-settings";
        disclosure.innerHTML = `<summary>${icon("sliders-horizontal")}<span>Plan settings</span></summary>`;
        settingsGrid.parentNode.insertBefore(disclosure, settingsGrid);
        disclosure.appendChild(settingsGrid);
      }
    }

    const split = body.querySelector(":scope > .sc-split");
    if (split) {
      const cards = Array.from(split.querySelectorAll(":scope > .sc-pane > .sc-card"));
      const workspace = document.createElement("section");
      workspace.className = "sts-plan-workspace";
      const nav = document.createElement("div");
      nav.className = "sts-plan-tabs";
      nav.setAttribute("role", "tablist");
      const panes = {};
      [
        ["boreholes", "map-pin", "Boreholes"],
        ["samples", "flask-conical", "Samples & lab"],
        ["readiness", "shield-check", "Readiness"]
      ].forEach(([key, iconName, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.planPane = key;
        button.setAttribute("role", "tab");
        button.innerHTML = `${icon(iconName)}<span>${label}</span>`;
        nav.appendChild(button);
        const pane = document.createElement("div");
        pane.className = "sts-plan-pane";
        pane.dataset.planPanel = key;
        panes[key] = pane;
      });
      workspace.appendChild(nav);
      Object.values(panes).forEach((pane) => workspace.appendChild(pane));

      cards.forEach((card) => {
        const title = card.querySelector("h3")?.textContent.trim() || "";
        let pane = panes.readiness;
        if (/Borehole schedule/i.test(title)) pane = panes.boreholes;
        else if (/Lab test register|Sample schedule/i.test(title)) pane = panes.samples;
        card.classList.add("sts-plan-section");
        pane.appendChild(card);
      });
      split.parentNode.insertBefore(workspace, split);
      split.remove();

      function activatePlanPane(key) {
        activePlanPane = panes[key] ? key : "boreholes";
        nav.querySelectorAll("button").forEach((button) => {
          const active = button.dataset.planPane === activePlanPane;
          button.classList.toggle("on", active);
          button.setAttribute("aria-selected", String(active));
        });
        Object.entries(panes).forEach(([paneKey, pane]) => { pane.hidden = paneKey !== activePlanPane; });
      }
      nav.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => activatePlanPane(button.dataset.planPane)));
      activatePlanPane(activePlanPane);
    }

    const actions = Array.from(body.children).find((child) => child.querySelector && (child.querySelector("#scTower") || child.querySelector("#scTasks")));
    if (actions) {
      actions.className = "sts-scope-command sts-plan-command";
      const send = actions.querySelector("#scTower");
      const tasks = actions.querySelector("#scTasks");
      if (send) actions.prepend(send);
      if (tasks) tasks.classList.remove("pri");
      decorateButton(send, "radio-tower", "Send to Control Tower");
      decorateButton(tasks, "list-plus", "Create borehole tasks");
      decorateButton(actions.querySelector("#scRegen"), "refresh-cw", "Regenerate");
      decorateButton(actions.querySelector("#scExport2"), "download", "Export CSV");
    }
  }

  function enhanceTower(body) {
    body.classList.add("sts-scope-tower");
    const card = body.querySelector(".sc-card");
    if (!card) return;
    card.classList.add("sts-tower-complete");
    const heading = card.querySelector("h3");
    if (heading) heading.innerHTML = `${icon("circle-check-big")}<span>Sent to Control Tower</span>`;
    const repeatedTowerSummary = card.querySelector(".tower-strip");
    if (repeatedTowerSummary) repeatedTowerSummary.remove();
    Array.from(card.children).forEach((child) => {
      if (/Planned-vs-completed tracking/i.test(child.textContent || "")) child.remove();
    });
    decorateButton(card.querySelector("#scGoDash"), "layout-dashboard", "Open Control Tower");
    decorateButton(card.querySelector("#scGoLab"), "flask-conical", "Laboratory register");
    decorateButton(card.querySelector("#scBackPlan"), "arrow-left", "Field plan");
    decorateButton(card.querySelector("#scExport3"), "download", "Export CSV");
  }

  function enhanceScope() {
    const host = document.getElementById("page-scope");
    if (!host || enhancing || host.querySelector(":scope > .sts-scope-page")) return;
    const body = host.querySelector(":scope > #scBody");
    const stepper = host.querySelector(":scope > .sc-step");
    if (!body || !stepper) return;

    enhancing = true;
    const scope = scopeState();
    const currentStep = Math.max(1, Math.min(5, Number(scope.step) || 1));
    host.dataset.stsScopeEnhanced = "1";
    host.dataset.scopeStep = String(currentStep);

    const page = document.createElement("div");
    page.className = "sts-scope-page sts-page";
    const legacyTitle = host.querySelector(":scope > h2");
    host.insertBefore(page, legacyTitle || stepper);
    page.appendChild(buildHeader(scope));
    page.appendChild(stepper);
    page.appendChild(body);
    if (legacyTitle) legacyTitle.remove();

    enhanceStepper(stepper, currentStep);
    body.classList.add("sts-scope-body");
    if (currentStep === 1) enhanceUpload(body, scope);
    else if (currentStep === 2) enhanceExtract(body, scope);
    else if (currentStep === 3) enhanceReview(body, scope);
    else if (currentStep === 4) enhancePlan(body, scope);
    else enhanceTower(body, scope);

    paintIcons();
    enhancing = false;
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    root.requestAnimationFrame(() => {
      scheduled = false;
      enhanceScope();
    });
  }

  function mount() {
    const host = document.getElementById("page-scope");
    if (!host) return;
    new MutationObserver(() => {
      if (!enhancing && !host.querySelector(":scope > .sts-scope-page")) scheduleEnhance();
    }).observe(host, { childList: true });

    const legacyRenderScope = root.renderScope;
    if (typeof legacyRenderScope === "function") {
      root.renderScope = function () {
        legacyRenderScope();
        scheduleEnhance();
      };
    }

    const previousShowTab = root.showTab;
    if (typeof previousShowTab === "function") {
      root.showTab = function (tab) {
        previousShowTab(tab);
        if (tab === "scope") scheduleEnhance();
      };
      try { showTab = root.showTab; } catch (error) { /* global binding may be lexical */ }
    }

    scheduleEnhance();
  }

  root.GeoFlowScopeUI = Object.freeze({ enhance: scheduleEnhance });
  mount();
})(typeof window !== "undefined" ? window : null);
