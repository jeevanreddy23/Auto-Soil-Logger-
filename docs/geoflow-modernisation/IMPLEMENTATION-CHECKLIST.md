# STS GeoFlow Premium Implementation Checklist

Date: 2026-07-14
Branch: `improve/geoflow-field-to-pdf`

## Architecture Preserved

- Static, no-build JavaScript application in `geologger/`.
- Existing `S` project/log state and `PJ` multi-project registry remain authoritative.
- Existing project IDs and `#/projects/<pid>/<route>` deep links remain valid.
- Cloudflare Worker and KV remain the operational backend. No Vercel path was added.
- Existing field logger, soil, rock, corebox, SPT, samples, photos, export, and final jsPDF engine remain in place.
- AGS 4.1 export remains a separate machine-readable output. The borehole PDF remains a visual engineering report.

## Phase Checklist

| Phase | Status | Evidence |
| --- | --- | --- |
| 0. Repository reconnaissance | Complete | System, data, routes, workflows, PDF pipeline, migration, and test documents recorded in this folder. |
| 1. Architecture and design system | Complete | Central tokens and engineering components in `geoflow-premium.css`; pure domain/view-model helpers in `geoflow-ui-core.js`. |
| 2. Shell and navigation | Complete | Home action, contextual project/borehole tabs, collapsible rail, breadcrumbs, global search, help, sync and validation status. |
| 3. Dashboard | Complete | Operational KPIs, active project context, recent project register, borehole status, validation, sync, and real-record metrics. |
| 4. Project workspace | Complete | Overview, boreholes, explicit coordinate site map, fieldwork, samples, laboratory, documents, reports, team, and settings tabs. |
| 5. Borehole and logging | Complete | Borehole overview, actual versus planned depth, vertically scaled timeline, DCP, groundwater, route context, completion validation, and existing logging grids. |
| 6. Corebox | Complete | Existing image-dominant scale/log/review workflow preserved and visually integrated. |
| 7. Review, reports, and PDF | Complete | Dedicated report register, categories, metadata, revisions, statuses, actions, approval blockers, validation navigation, and real jsPDF preview. |
| 8. Responsive and tablet | Complete | Breakpoints at 1180, 900, 720, and 430 px; compact rail, stacked inspectors, mobile project cards, wrapped controls, and viewport-fitted PDF preview. |
| 9. Accessibility | Complete | Semantic landmarks, named controls, focus-visible styles, keyboard search, dialog focus trap/return, inert closed drawer, status text plus icons, reduced motion. |
| 10. Performance and reliability | Complete | Lazy PDF generation, idempotent icon rendering, local pinned runtime assets, abortable file metadata requests, immutable validation helpers, no route-time PDF build. |
| 11. Automated testing | Complete | Domain, AGS, PDF factuality, Cloudflare CORS, routing, dependency, responsive, accessibility, and report-laziness contracts. |
| 12. Visual QA | Complete locally | Desktop portfolio, project, borehole, DCP, groundwater, documents, settings, reports, PDF preview, blank report, and reference-log comparison inspected. |

## Report And Data Safeguards

- Blank soil, rock, SPT, and DCP placeholders do not become report data.
- Planned depth is not presented as logged depth.
- DCP depth is cumulative and refusal is explicit.
- SPT N values are derived from entered increments and mismatches are reported.
- Interval gaps, overlaps, invalid lengths, and records below final depth carry stable navigation metadata.
- Draft PDFs may be previewed; approval remains disabled while blocking validation errors exist.
- PDF pages use the existing STS A4 geometry, lithology patterns, depth scales, recovery columns, discontinuity columns, continuation sheets, and draft marking.
- Cloudflare report files and metadata are loaded only on the Reports route and generated only after an explicit action.

## Reliability And Security

- jsPDF, AutoTable, PDF.js, SheetJS, Mammoth, Lucide, and Carlito assets are local to the Worker deployment.
- Microsoft 365 settings display an honest unconfigured state. Connect and test controls stay disabled until a server-side connector exists.
- Microsoft credentials are not stored in the browser. Cloudflare remains the active project file service.
- The site map never silently converts coordinates. Missing or unsupported coordinates remain explicit.
- Browser console was clean during local workflow verification.

## Known Limits

- Microsoft Graph/SharePoint authentication and server-side folder mapping are not implemented.
- The site map is an engineering coordinate plot, not a satellite/base-map service.
- Existing logging grids are not virtualised; current project datasets do not justify the complexity yet.
- Approval records are application metadata, not cryptographic digital signatures.
- Production Cloudflare and KV evidence is recorded after release deployment.
