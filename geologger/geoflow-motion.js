(function (root) {
  "use strict";

  if (!root || !root.document || !root.MutationObserver) return;

  const document = root.document;
  const reducedMotionQuery = root.matchMedia("(prefers-reduced-motion: reduce)");
  const technicalPages = new Set(["page-soil", "page-rock", "page-corebox", "page-spt", "page-dcp"]);
  const revealTimers = new WeakMap();

  function reducedMotion() {
    return reducedMotionQuery.matches;
  }

  function clearEntryAttribute(element, name, animatedElement) {
    const clear = () => element.removeAttribute(name);
    if (!animatedElement) { clear(); return; }
    animatedElement.addEventListener("animationend", clear, { once: true });
    root.setTimeout(clear, 340);
  }

  function animatePage(page) {
    if (!page || reducedMotion() || technicalPages.has(page.id) || !page.classList.contains("show")) return;
    if (page.hasAttribute("data-gf-motion-page")) return;
    const surface = page.querySelector(":scope > .sts-page, :scope > .dz");
    if (!surface) return;
    page.setAttribute("data-gf-motion-page", "enter");
    clearEntryAttribute(page, "data-gf-motion-page", surface);
  }

  function markEntry(element, type) {
    if (!element || element.dataset.gfMotionSeen === "1") return;
    element.dataset.gfMotionSeen = "1";
    if (reducedMotion()) return;
    element.setAttribute("data-gf-motion-entry", type);
    const animatedElement = type === "dialog" ? element.firstElementChild : element;
    clearEntryAttribute(element, "data-gf-motion-entry", animatedElement);
  }

  function trackPdfPreview(preview) {
    if (!preview || preview.dataset.gfPdfTracked === "1") return;
    preview.dataset.gfPdfTracked = "1";
    markEntry(preview, "preview");
    const stage = preview.querySelector(".sts-pdf-stage");
    const frame = preview.querySelector("iframe");
    if (!stage || !frame) return;
    stage.classList.add("gf-pdf-loading");
    stage.setAttribute("aria-busy", "true");
    let completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      stage.classList.remove("gf-pdf-loading");
      stage.setAttribute("aria-busy", "false");
    };
    frame.addEventListener("load", complete, { once: true });
    root.setTimeout(complete, 8000);
  }

  function markSyncChange(status) {
    if (!status) return;
    const value = status.textContent.replace(/\s+/g, " ").trim();
    const previous = status.dataset.gfMotionValue;
    status.dataset.gfMotionValue = value;
    if (!previous || previous === value || reducedMotion()) return;
    status.classList.remove("gf-state-change");
    root.requestAnimationFrame(() => status.classList.add("gf-state-change"));
    root.setTimeout(() => status.classList.remove("gf-state-change"), 280);
  }

  function inspectElement(element) {
    if (!element || element.nodeType !== 1) return;
    if (element.matches(".sts-dialog-backdrop")) markEntry(element, "dialog");
    if (element.matches(".sts-toast")) markEntry(element, "toast");
    if (element.matches(".sts-report-details")) markEntry(element, "details");
    if (element.matches(".sts-report-preview")) trackPdfPreview(element);
    if (element.id === "syncStatus") markSyncChange(element);

    element.querySelectorAll(".sts-dialog-backdrop").forEach((item) => markEntry(item, "dialog"));
    element.querySelectorAll(".sts-toast").forEach((item) => markEntry(item, "toast"));
    element.querySelectorAll(".sts-report-details").forEach((item) => markEntry(item, "details"));
    element.querySelectorAll(".sts-report-preview").forEach(trackPdfPreview);
    const status = element.querySelector("#syncStatus");
    if (status) markSyncChange(status);
  }

  function revealRecord(target) {
    if (!target || reducedMotion()) return;
    const record = target.closest("tr") || target;
    const previousTimer = revealTimers.get(record);
    if (previousTimer) root.clearTimeout(previousTimer);
    record.classList.add("gf-record-focus");
    revealTimers.set(record, root.setTimeout(() => {
      record.classList.remove("gf-record-focus");
      revealTimers.delete(record);
    }, 1200));
  }

  function clearMotionState() {
    document.querySelectorAll("[data-gf-motion-page], [data-gf-motion-entry]").forEach((element) => {
      element.removeAttribute("data-gf-motion-page");
      element.removeAttribute("data-gf-motion-entry");
    });
    document.querySelectorAll(".gf-state-change, .gf-record-focus").forEach((element) => {
      element.classList.remove("gf-state-change", "gf-record-focus");
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.target.classList.contains("tabpage")) {
        animatePage(mutation.target);
      }
      if (mutation.type === "characterData") {
        const status = mutation.target.parentElement && mutation.target.parentElement.closest("#syncStatus");
        if (status) markSyncChange(status);
      }
      if (mutation.type === "childList") {
        if (mutation.target.id === "syncStatus") markSyncChange(mutation.target);
        mutation.addedNodes.forEach((node) => inspectElement(node));
      }
    }
  });

  function mount() {
    document.body.classList.add("gf-motion-ready");
    inspectElement(document.body);
    document.querySelectorAll(".tabpage.show").forEach(animatePage);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    reducedMotionQuery.addEventListener("change", (event) => {
      if (event.matches) clearMotionState();
    });
  }

  root.GeoFlowMotion = Object.freeze({
    reducedMotion,
    revealRecord,
    animatePage
  });

  mount();
})(typeof window !== "undefined" ? window : null);
