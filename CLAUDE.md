# STS GeoFlow — Project Constitution (CLAUDE.md)

Read this before changing anything. It encodes the real, working system and the
hard-won rules from its construction. When advice conflicts with this file,
this file wins.

## What STS GeoFlow is

Geotechnical project-delivery platform for STS Geotechnics (NSW, AS 1726:2017):
proposal → scope extraction → field plan → field logging (phone/tablet PWA) →
soil/rock/corebox logging → samples/lab tracking → daily progress email →
Control Tower → issued borehole-log PDFs that exactly match the firm's
OpenGround/STS reference logs.

## Live URLs

- Web app: https://autosoillogger.poreddyjeevanreddy.workers.dev
- Field PWA: /field.html · JSON log generator: /loggen.html
- Data API: /api/v1/geologger/logs · File store: /api/v1/files

## Architecture (actual, not aspirational)

- **Single-file layered apps.** `geologger/index.html` (~370 KB) is the web app;
  `geologger/field.html` the offline-first field PWA. Later `<script>` blocks
  override earlier ones. Block ids in order: main shell, modules-script,
  dashboard, pdf-v2 (superseded), corebox-v3, v4…v7, pdf-v3 (ACTIVE PDF engine),
  v11-field-merge, dashboard-boot, pj-css/v12-projects, v13-scope, v14-sidebar,
  v16-shell, v17-master, v19-quickentry, v20-cloudfiles, v18-field-import,
  v15-daily. **Never reorder existing blocks; add new behaviour as a new
  trailing layer or a targeted in-place edit.**
- **Backend = Cloudflare Worker** (`worker.js` + `wrangler.jsonc`), KV namespace
  binding `GEOFLOW` (id f9c604a7cd24492fb826a45f7ed1c28a). Legacy Render API is
  proxy-only for unused vision endpoints. `backend/` (FastAPI/Python) is archived
  reference code, not deployed.
- **State objects.** Web: `S` in localStorage `autosoil-logger`; project registry
  `PJ` in `geoflow-projects`; per-project snapshots `autosoil-prj-{pid}`.
  Field: `F` in `geoflow`, slots `geoflow-slot-{key}`.
- **KV keys.** Data: `log:{location}` where location is `__autosoil_project__`
  or `__project_{pid}__` (rows:[fullState]). Files: `file:{project}:{id}`
  (corebox-{bhId}, prop-{docId}). Never change these formats — both apps and
  migration logic depend on them.
- **Sync contract.** Field↔web schema bridge lives in field.html `doSync`
  (maps field rows → web rows, `(field)` remark suffix, `_field`/`_touched`
  flags). Web `pushSync` pull-merges field changes before pushing. Conflicts on
  final depth are surfaced, never silently resolved.

## Deployment (the only pipeline)

local files → GitHub `jeevanreddy23/Auto-Soil-Logger-` (web-upload via
`/upload/main/<dir>`, commit via `form.requestSubmit`) → Cloudflare Workers
Builds (~60–90 s) → live. **Vercel is retired — never reintroduce it.**
Codeberg `jreddy/Autosoillogger` is a manual mirror (no builds).
Verify every deploy on the live site with a cache-busted URL (`?v=N`).

## Verification protocol (non-negotiable)

- No claim without a live check. UI/logic: drive the deployed page via browser
  JS with counters; stub `window.fetch`/`alert`/`confirm`; snapshot state
  (`JSON.stringify(S or F)`) before and restore after; never leave test
  boreholes/projects in state or KV.
- PDF fidelity: measure, don't eyeball. References live in
  `C:\Users\pored\Downloads\Logs` (13 issued logs — the visual ground truth).
  Reference metrics via pdfplumber; generated output via pdf.js operator-list
  extraction (canvas rendering of generated docs can freeze tabs; with Carlito
  embedded, pdf.js is very slow — test with `_carlito=false`).
- Workflow changes need recorded click/typing counts before vs after
  (see `autonomy/tests/scenario1-field-logging.md` baselines: 32→19 clicks).

## Environment gotchas (cost hours — respect them)

- The sandbox mount serves **stale content** for files edited by host Write/Edit
  in-session: wrong sizes, truncated reads. Never syntax-check or copy the big
  HTML files via the mount after editing; verify on the live deploy instead.
  Files created fresh are readable once.
- GitHub web UI freezes tabs occasionally → open a new tab and retry. Plain
  clicks on Commit often no-op → use `requestSubmit`. github.com can be
  unreachable from this machine for ~an hour while up globally — Codeberg
  web-upload (`/_upload/main/<dir>`) is the fallback mirror.
- jsPDF: WinAnsi core fonts lack ≈ (Carlito embed restores it; `~` fallback).
  Embedded fonts are written un-subset.

## PDF engine rules

`brain/style_guide.md` is the measured specification (geometry to 0.1 mm,
stroke weights 0.132/0.26 mm, fonts, exact wording, defect grammar). The
pdf-v3 constants implement it and were verified to zero missing lines vs
log-BH8-Cored. **Never alter measured geometry/weights/wording except through
the measure → diff → fix → re-measure loop against the reference folder.**
Validation gate runs in `buildPdf` (auto-repairs reported on
`doc.__validation`; blocking errors via `validate()`). DRAFT watermark until
Review By set. Report Ready is deterministic arithmetic — never model judgement.

## Geotechnical domain rules

- AS 1726:2017 descriptions: `MATERIAL: plasticity, colour, …, trace/with X`
  (e.g. `TOPSOIL: Silty CLAY: low plasticity, dark brown, trace rootlets`).
- Defect codes: BP, JT, CS/QS/FS/IS, SZ/FZ/CZ/BZ/DZ, XWZ/HWZ/MWZ/SWZ,
  NB/MB/HB/DB, CL, V. Internal grouping codes (expand on explanation sheet,
  not official AS 1726): **MJ** multiple joints, **JS** joint set (consistent
  family only — never inferred from spacing alone), **BP-M** multiple bedding
  partings. HB/MB/DB are mechanical: shown, excluded from RQD/fracture stats.
- SPT: N = 2nd+3rd increments; refusal `N=R`; partial `35/150 mm`; `HB` noted.
- RQD sound core >100 mm; RQD ≤ TCR ≤ ~100 (TCR>100 allowed historically, warned).
- Weathering RS/XW/HW/DW/MW/SW/FR; strength EL/VL/L/M/H/VH/EH; Is(50) axis
  0.1/0.3/1/3/10 (▼ axial ▽ diametral).
- Sample IDs: `{BH}-{TYPE}-{NN}` (D/U50/SPT/BULK/JAR).

## Never change without explicit permission

1. KV key formats and the sync schema bridge fields.
2. Measured PDF geometry, line weights, and issued-log wording.
3. Script block order in the single-file apps.
4. Master-record locked fields behaviour (project no./client/site + audit).
5. The deploy pipeline (no Vercel, no new third-party services).
6. Scope-satisfied prompt logic (project-wide requirement checks).
7. Anything in `brain/qa_rules.json` severity=critical.

## Workflow for every feature (Superpowers-style)

DISCOVER (read this file + affected layers) → PLAN (smallest coherent change;
one concern) → IMPLEMENT (new trailing layer or targeted edit; reuse
components) → TEST (live, measured, state-restored) → VISUAL VERIFY
(screenshot; phone viewport for field) → REVIEW (Current-System Advocate: what
could this break?) → DOCUMENT (update this file / style guide change log).
Skills in `skills/`: geoflow-feature, geoflow-geotech-review, geoflow-pdf-compare.

## Open items / roadmap honesty

- No auth/user roles yet (locking is workflow+audit, not access control).
  Real multi-user production ⇒ backend rebuild decision (documented trade-off).
- KV fine at current file volumes; heavy corebox photography ⇒ migrate file
  store to R2 (same endpoint interface).
- Optional API lock: set Worker secret `AUTOSOIL_API_KEY` + same key in both
  apps' Settings.
- User-side chores: delete old Vercel projects; repo About link → workers.dev.
