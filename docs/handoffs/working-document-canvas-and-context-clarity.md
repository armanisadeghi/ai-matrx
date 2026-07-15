# Handoff — Working Document / Canvas / Context Clarity

**Owner:** (unassigned — pick up here)
**Status:** active · multiple pieces shipped, one investigation open, vision partially built
**Last updated:** 2026-06-25

This is the working document → Canvas → surfaces → context-clarity arc. A concurrent
agent has been HEAVILY refactoring the same area (doc canonicalization: the
`cx_working_documents` table was moved to `workbench.working_documents`, its
`conversation_id` column dropped, junction `cx_conversation_documents` retired,
links now via `platform.associations`). Coordinate — this zone churns every hour.

Browser verification is set up: dev server at **http://localhost:3050**, one-shot
auto-login `…:3050/api/dev-login?token=matrx-dev-a2990c472f1cae47864bb936&next=/chat`.
A playwright harness lives at `/tmp/pw-matrx/` (isolated install) — reuse `nav.mjs`
(navigate+screenshot) for visual checks.

## Shipped this session (committed on main)

- **Surfaces + agents (earlier commits):** `matrx-user/working-document` +
  `matrx-user/scratchpad` are registered surfaces (19 values each, live in DB) with a
  highlight→agent menu. Two real agents on Groq gpt-oss-20b, DB-created + bound:
  **Scratchpad Organizer** `c64f0abd-3cb1-4e3e-911b-a22dc1d4f904` (var `content`),
  **Text Cleanup** `ae124e6f-0891-457c-b3f9-0e8862790d10` (var `active_text`).
  `admin_promote`'d `info@aimatrx.com` (6555aa73) to super_admin so the AI Dream MCP works.
- **Canvas integration:** working doc + scratchpad render inside the Canvas; all "Open"
  paths (Maximize, chat-header Canvas icon, agent-result bar) route there.
- **`4e913de8c` — scratchpad diff-toggle fix:** the agent-diff (GitCompare) toggle
  rendered on the scratchpad, where the agent never edits — a dead control that also
  disabled the mode dropdown. Now `WorkingDocumentViewControls` takes `showDiff`;
  `WorkingDocumentPanel` passes `showDiff={kind === "working"}`.
- **`751dd13bb` — "What the agent sees" panel** (the #1 UX ask: "I never know what
  goes to the model"). New `features/agents/components/context-slots-display/AgentSeesSheet.tsx`
  reads the real payload sources (`selectInstanceContextEntries` + `useActiveContextLayerItems`)
  and renders it plainly: always-sent baseline, active scopes, everything attached this
  turn (with value preview + char size). The composer rail's "CONTEXT" label is now an
  eye-button that opens it. **Browser-verified live** (shows baseline + active scope;
  clean empty state). An adversarial subagent reviewed it — apply any findings (see
  "Open — apply review findings").

## OPEN #1 — the working-document DIFF (user's top complaint: "diffs ARE NOT WORKING")

Traced end-to-end and the **pipeline is structurally correct** + the **backend is
verified live** (as the owner via a login script): `version_list`/`version_snapshot`
RPCs return history + content; working docs get versioned (max v35); the agent's
`ctx_patch` sends `key:"working_document"` + `command:"str_replace"`;
`applyWorkingDocPatch` handles it; `deriveWorkingDocDiffFrame` reconciles to server
content; `AnimatedDiffReveal` renders `after` immediately when `active:false`; the
`workingDocumentViewStore` toggle works. The scratchpad dead-toggle (fixed above) was
one real cause.

**Residual hypothesis (unconfirmed):** the diff fallback (`WorkingDocumentLatestVersionDiff`)
needs `documentId = binding.kind === "cx_working_document" ? binding.id : null`. If the
working-doc **binding doesn't hydrate** to `cx_working_document` in a given view,
documentId is null → the fallback shows "No recent agent edits" on a doc the agent DID
edit. Binding hydration runs via `useConversationDocumentsBridge` (mounted in the chat
Smart Input) and the association-based open path — which is exactly what the concurrent
canonicalization migration is rewiring. **DO NOT blind-fix the binding path mid-migration.**

**To close it (needs the browser + a doc with history):** dev-login → create a working
doc, get the agent to edit it (or manually edit twice to build ≥2 versions) → open the
Canvas → click the GitCompare toggle. If it shows "No recent agent edits" on an edited
doc → confirm `binding.kind` (it should be `cx_working_document`); if it's `none`, fix
the hydration in the association-open path. Building agent-edit history headlessly is
fiddly (the default chat agent won't always ctx_patch the working doc).

## OPEN #2 — apply adversarial-review findings on the context panel

A subagent adversarially reviewed `AgentSeesSheet.tsx` + the rail changes for ACCURACY
(does it truly reflect the model payload?) and edge cases. Read its findings from this
turn and apply any real bugs (e.g. missing context sources, misleading empty state,
huge-value handling). The panel's accuracy is load-bearing — a wrong "what the agent
sees" is worse than none.

## Vision — what's next (roadmap, in priority order)

1. **Finish the diff** (OPEN #1) once the migration settles / with a browser repro.
2. **Trim the confusing menus** (user: "confused by the long list"). The highlight→agent
   menu (`UnifiedAgentContextMenu`, being migrated to v3) + the docs/context menus dump
   everything. Curate to a short task-first set (Clean up / Organize / Rewrite) + "More".
   Touches the concurrent hot zone — coordinate.
3. **Scratchpad auto-organize** (user spec): a 3rd "clean scratchpad" doc kind + a
   background trigger gated by *content exists* AND *>15% change* AND *stable ≥1 min*
   (default OFF), launching the **Scratchpad Organizer** agent (`c64f0abd…`). **BLOCKED**
   on an aidream backend bug: `agent_run`/`agent_author` fail with
   `ManagedWriteViolation: cx_conversation managed_writes='strict'` (filed feedback
   `ce7e53a3`; fix = wrap the meta-agent/run cx_conversation write in `async with Session()`).
   The app's own agent-run path works — only the MCP path is broken.
4. **Make the "What the agent sees" panel actionable** — add per-item remove (X) so users
   can control, not just see, what's sent (reuse the rail's `removeContextEntry` /
   `setConversationDocumentEnabledThunk`).

## Blockers needing Arman

- **aidream `managed_writes` bug (`ce7e53a3`)** blocks MCP agent create/run → blocks the
  scratchpad auto-organize verification. One-line backend fix.
- **Concurrent migration coordination:** the doc-canonicalization migration
  (`cx_working_documents` → `workbench.working_documents`, conversation_id dropped,
  associations) is mid-flight in the exact files. Confirm it's settled before deep work on
  the binding/diff hydration path.
