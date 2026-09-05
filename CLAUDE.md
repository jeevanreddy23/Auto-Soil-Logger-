# STS GeoFlow — Project Constitution (CLAUDE.md)

Read this before changing anything. It encodes the real, working system and the
hard-won rules from its construction. When advice conflicts with this file,
this file wins.

## September 2026 PDF design update

The product owner explicitly requested replacing the reference-log appearance.
`geologger/geoflow-log-pdf.js`, connected by the final `geoflow-timeline-pdf`
script, is now the ACTIVE PDF engine. `pdf-v3` is superseded. Follow
`docs/geoflow-timeline-layout.md` for layout and validation. Historical requirements
below to match OpenGround/STS geometry, wording and line sets no longer apply to
active PDF exports. Preserve domain values and source records independently of style.

## What STS GeoFlow is

Workflow update (September 2026): `geoflow-workflow.js` now owns delivery-stage
evaluation, dependencies, laboratory row enumeration and report-source change
detection. `v24-flow` remains its UI adapter. See `docs/workflow-architecture.md`
for the contract and migration notes. No stage with blockers is complete; field
and laboratory work are parallel branches. Handover readiness requires current
saved/reviewed reports, not merely a client share link.

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

- **Layered apps.** `geologger/index.html` (~450 KB) is the web app;
  `geologger/field.html` the offline-first field PWA. Later `<script>` blocks
  override earlier ones. Inline block ids in order: main shell, modules-script,
  dashboard, pdf-v2 (superseded), corebox-v3, v4…v7, pdf-v3 (ACTIVE PDF engine),
  v11-field-merge, dashboard-boot, pj-css/v12-projects, v13-scope, v14-sidebar,
  v16-shell, v20-cloudfiles, v17-master, v19-quickentry, v18-field-import,
  v15-daily, v17-field-to-pdf, v20-sts-professional-ui, then ELEVEN external
  `geoflow-*.js` files (control-core, control-db, premium, reports, tower,
  scope, motion, access-core, access, control-live, control — the professional
  shell/control suite), then v21-tenx (long section, AGS4 export, client share)
  and v22-beast (correlated sections + formations, material logic engine,
  per-BH completeness scores, sample register CSV, drilling production),
  v22b-section-pro (drawing-grade section), v24-flow (workflow engine).
- **v24-flow is the workflow engine.** Eight gates (master · scope · plan ·
  field · lab · qa · report · issue) computed from project data only; the
  critical path drives one next-action bar and the Pipeline page, and the
  header readiness pill mirrors it so a single number is shown anywhere.
  Gates are read-only over `S` (the sole write is `S.scope.step` when routing).
  When adding a gate: read the SAME fields the owning page reads
  (`validate()` returns `{errs,warns}`; planned depth is `plannedDepth` OR
  `planned`; lab rows are keyed `plan-{i}`/`smp-{sid}`), and treat an
  unavailable engine as UNKNOWN (blocker), never as clean.
  **Never reorder existing blocks; add new behaviour as a new trailing layer or
  a targeted in-place edit.**
- **Two agents ship to this repo.** Other tooling (Antigravity) also lands
  layers. The local folder can lag the deployed app: BEFORE editing
  index.html, fetch the live file and compare `script id=` lists; rebase local
  from live if it lags (2026-07-23: local missed v17-field-to-pdf +
  v20-sts-professional-ui + the external files until rebased).
- **Backend = Cloudflare Worker** (`worker.js` + `wrangler.jsonc`), KV namespace
  binding `GEOFLOW` (id f9c604a7cd24492fb826a45f7ed1c28a). Legacy Render API is
  proxy-only for unused vision endpoints. `backend/` (FastAPI/Python) is archived
  reference code, not deployed. The Worker reflects CORS on the two KV API routes
  so the packaged Android app (origin `https://localhost`) can sync.
- **Android app = Capacitor shell** (`android-app/`, repo-only — not in this local
  folder). `scripts/prepare-web.mjs` copies `geologger/field.html` → `www/index.html`
  at build, so field fixes flow into the APK on the next
  `npm run android:sync && npm run android:debug` (needs Android Studio/JDK21).
  field.html auto-detects the native origin and targets the Worker via `API_BASE`.
  Keyboard rules: `captureInput` must stay **false** (true suppresses the soft
  keyboard) and MainActivity keeps `android:windowSoftInputMode="adjustResize"`.
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
- field.html has a `pagehide` flush that re-writes in-memory `F`/`WIZ` to
  localStorage on navigation. When restoring test snapshots, restore the
  IN-MEMORY objects first (then save), or the flush resurrects test state.
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
Skills in `skills/` (each also packaged as an installable `.skill`):
**geoflow-feature** (the loop above) · **geoflow-verify-graph** (adversarial verifier panel —
run before every deploy) · **geoflow-geotech-review** (engineering completeness) ·
**geoflow-pdf-compare** (measured PDF parity loop) · **geoflow-deploy** (rebase → GitHub →
Cloudflare → verify → mirror) · **geoflow-field-test** (live measured browser harness) ·
**dcp-assessment** · **report-writer** · **anti-ai-writing-style** (client-facing prose).

## Open items / roadmap honesty

- No auth/user roles yet (locking is workflow+audit, not access control).
  Real multi-user production ⇒ backend rebuild decision (documented trade-off).
- KV fine at current file volumes; heavy corebox photography ⇒ migrate file
  store to R2 (same endpoint interface).
- Optional API lock: set Worker secret `AUTOSOIL_API_KEY` + same key in both
  apps' Settings.
- User-side chores: delete old Vercel projects; repo About link → workers.dev.
