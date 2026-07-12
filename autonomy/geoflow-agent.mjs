// STS GeoFlow — autonomous maintenance agent (Claude Agent SDK)
// ---------------------------------------------------------------
// One high-level instruction; the agent plans, edits, tests and iterates
// on its own until the goal is met. No prompt-per-step.
//
// Setup (once):
//   npm install @anthropic-ai/claude-agent-sdk
//   set ANTHROPIC_API_KEY=sk-ant-...        (or be logged into Claude Code)
// Run:
//   node autonomy/geoflow-agent.mjs "Fix all validation warnings in geologger/index.html and verify the PDF still builds"
//
// Safety: permissionMode "acceptEdits" lets it edit files hands-free but
// still blocks anything destructive. Run against a git-clean tree so every
// change is reviewable with `git diff`.

import { query } from "@anthropic-ai/claude-agent-sdk";

const GOAL = process.argv.slice(2).join(" ") ||
  "Audit geologger/index.html for JS errors, fix them, and confirm every <script> block parses with `node --check`.";

const SYSTEM = `
You are the STS GeoFlow maintenance agent working in this repository.
Operate autonomously: PLAN the sub-tasks, EXECUTE with your tools,
VERIFY each change (run node --check on extracted script blocks, re-read
edited regions, run any relevant tests), then ITERATE until the goal is
fully met or genuinely blocked. Never claim success without verification.
Project facts:
- geologger/index.html is a layered single-file app; later <script> blocks
  override earlier ones. Never reorder existing blocks.
- geologger/field.html is the offline-first field PWA (same API).
- worker.js + wrangler.jsonc = Cloudflare Worker backend (KV binding GEOFLOW).
- PDF engine constants are measured from real STS logs — do not change
  geometry numbers unless the task is explicitly about PDF geometry.
Finish with a concise report: what changed, how it was verified, what remains.
`;

for await (const message of query({
  prompt: GOAL,
  options: {
    systemPrompt: SYSTEM,
    permissionMode: "acceptEdits",          // hands-free file edits
    allowedTools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash"],
    maxTurns: 60,                            // room for long self-directed loops
    // resume: "<session-id>",              // uncomment to continue a prior session
  },
})) {
  if (message.type === "assistant") {
    for (const block of message.message.content)
      if (block.type === "text") process.stdout.write(block.text);
  }
  if (message.type === "result") {
    console.log(`\n\n=== DONE (${message.subtype}) — ${message.num_turns} turns, $${message.total_cost_usd?.toFixed(4)} ===`);
    if (message.session_id) console.log("session:", message.session_id, "(pass to `resume` to continue)");
  }
}
