# Current System

## Runtime

- Production is a Cloudflare Worker defined by `worker.js` and `wrangler.jsonc`.
- Static assets are served from `geologger/` through the `ASSETS` binding.
- `GEOFLOW` is Workers KV namespace `f9c604a7cd24492fb826a45f7ed1c28a`.
- The desktop application is a layered single-page HTML application in `geologger/index.html`.
- `geologger/field.html` is the offline-first phone/tablet PWA; `sw.js` caches the app shell.
- Legacy `/api/*` calls other than logs/files proxy to the Render backend.

## Routing And State

- Hash routes use `#/projects/<pid>/<slug>`.
- `p_rwulad` aliases to the canonical KV record `__autosoil_project__`.
- Desktop state is stored in `localStorage` under `autosoil-logger`, project snapshots under `autosoil-prj-<pid>`, and the project index under `geoflow-projects`.
- Field state is stored under `geoflow` and per-project `geoflow-slot-<syncKey>` keys.
- Desktop saves locally immediately and debounces KV sync by two seconds.
- Field capture tracks pending changes, offline state, and final-depth conflicts.

## Storage And Security

- Borehole/project records use `log:<location>` KV keys.
- Documents and generated files use `file:<project>:<id>` KV keys.
- Corebox binary data is stripped from the log record and can be stored through `/api/v1/files`.
- An optional `AUTOSOIL_API_KEY` Worker secret protects logs and files; the current public deployment accepts unauthenticated requests.
- There is no user authentication or per-project authorization boundary.

## PDF And Images

- Browser PDFs use jsPDF 2.5.1 and a measured `pdf-v3` renderer embedded in `index.html`.
- XLSX and jsPDF libraries are loaded from CDNs.
- PDF fonts are fetched and cached as base64 when available; Helvetica is the fallback.
- Corebox images are stored locally as data URLs and separately in KV when uploaded to the file endpoint.

## Tooling

- There is no frontend package manifest or build step.
- Wrangler validates and deploys the Worker.
- Backend Python modules have no committed test suite.
- Existing project checks rely on script parsing, browser verification, PDF rendering, and scenario documents.

## Commands

- Worker validation: `npx wrangler deploy --dry-run`
- Local Worker: `npx wrangler dev`
- Production deploy: `npx wrangler deploy`
- Python syntax check: `python -m compileall -q backend`

## Baseline Warnings

- Required project metadata is blank in the linked record, so final report validation is blocked.
- The desktop app is offline-tolerant but does not expose the field app's conflict model.
- CDN dependencies are not available offline unless already cached by the browser.
