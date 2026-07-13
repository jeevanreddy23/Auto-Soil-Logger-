# Network Baseline

No failed application requests were visible during live route hydration, KV project loading, soil workspace rendering, or report preview rendering.

Known availability dependencies:

- jsPDF, AutoTable, XLSX and pdf.js are CDN-hosted.
- Unhandled legacy `/api/*` routes proxy to the Render backend.
- A missing/invalid API key returns 401 when `AUTOSOIL_API_KEY` is configured.
