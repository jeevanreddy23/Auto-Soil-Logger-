(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GeoFlowSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function cloneJson(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function defaultBlankLogs() {
    return { soil: [], rock: [], spt: [], samples: [], corebox: { img: null } };
  }

  function hydrateProjectState(localState, serverState, blankLogsFactory) {
    const local = localState && typeof localState === "object" ? localState : {};
    const next = cloneJson(serverState && typeof serverState === "object" ? serverState : {});
    const makeBlankLogs = typeof blankLogsFactory === "function" ? blankLogsFactory : defaultBlankLogs;

    next.boreholes = Array.isArray(next.boreholes) ? next.boreholes : [];
    next.logs = next.logs && typeof next.logs === "object" ? next.logs : {};
    for (const borehole of next.boreholes) {
      if (!borehole || borehole.id == null) continue;
      if (!next.logs[borehole.id]) next.logs[borehole.id] = cloneJson(makeBlankLogs());
    }

    const ids = new Set(next.boreholes.map(borehole => borehole && borehole.id));
    if (ids.has(local.activeBh)) next.activeBh = local.activeBh;
    else if (!ids.has(next.activeBh)) next.activeBh = next.boreholes[0]?.id || "";

    if (typeof local.activeTab === "string" && local.activeTab) next.activeTab = local.activeTab;
    else if (!next.activeTab) next.activeTab = "project";

    return next;
  }

  return { hydrateProjectState };
});
