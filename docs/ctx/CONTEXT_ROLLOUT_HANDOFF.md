# Context Rollout — Handoff

> State of the ContextAssignment build as of **2026-06-12**, for any agent
> taking over. Read `.claude/skills/context-assignment/SKILL.md` first (the
> mental model + component table), then this for status and next moves.
> Architecture bible: `ctx-association-architecture.md`. Migration analysis
> brief: `ctx-association-migration-analysis-brief.md`.

## What exists (all official, all canonical)

**Module `features/scopes/components/context-assignment/`**
- `ContextAssignmentField` — THE core. Modes: `assignment` (org-of-record
  dropdown + flat type sections), `active` + `filter` (hierarchical
  org→type→scope tree; org checkbox = explicit opt-in). Live scope writes via
  `setEntityScopes`; existing tags hydrate; inline quick-add creates real
  scopes/tasks; `onSubmitSelection` override for batch writes.
- Wrappers: `ContextAssignmentPopover` / `Dialog` / `Window`.
- `ContextSummaryChips` (readable display; org never implied),
  `ContextStatusButton` (amber/green nudge), `UploadContextPrompt` (upload
  race: Save awaits file ids), `data.ts` (TTL+dedup caches, bulk row-scope
  store `primeEntityScopes`/`setRowScopes`).

**Surface A (`features/scopes/components/active-context/`)**
- `ActiveContextButton` — compact popover control; the drop-in
  appContextSlice writer (`xs`/`sm`, `iconOnly`).
- `ActiveScopePicker` — sidebar picker; multi-select; no org gate on
  projects/tasks; collapsed shell rail swaps to the icon popover via
  `DirectContextSelection` twin render + `styles/shell.css`.

**Plumbing**
- `appContextSlice.scope_selections` is **keyed by scope id** since
  2026-06-12 (multi-scope; map type unchanged). One-per-type cardinality is
  GONE — do not reintroduce.
- `scopeTreeInvalidationMiddleware` (store-registered): structural mutation
  fulfilled → one debounced tree refresh. New structural mutations add their
  action type there.
- `scopesService.getEntityScopesBulk` — one query per page of rows.

## Surfaces wired (test routes)

| Surface | Route | What's there |
|---|---|---|
| Files | `/files/all` | Upload prompt (race-safe), Context table column (on by default, bulk-fed), Info-tab status+chips |
| PDF extractor | `/tools/pdf-extractor/<id>` | Toolbar chip on the underlying cld_file |
| RAG | `/rag/data-stores` | ActiveContextButton in sidebar header |
| Sidebar | everywhere | Multi-select picker; org-less projects/tasks; popover when rail collapsed |
| Chat | `/chat` | `xs` ActiveContextButton beside agent dropdown (runs already read appContextSlice) |
| Transcripts | `/transcripts/cleanup`, `/transcripts/scribe/<id>` | Working Context section / assistant-bar control (dual role) |
| Notes | `/notes` | NoteContextSection (footer/info/mobile; old glassy picker DELETED), tab shield icon, homeless-notes hint |
| Knowledge graph | `/knowledge/graph` | Header control (filter posture) |
| Demo lab | `/demos/scopes/context-lab` | Every variant, live + preview |

## Known gaps / parked work (in priority order)

1. **`ctx_associations` migration** — project/task durable links currently
   log-and-toast (search `ctx_associations migration` for every site).
   Scribe artifact save-stamping and the file prompt's project/task writes
   unlock with it.
2. **Knowledge graph deep integration** — direct scope↔node assignment
   (generating scope nodes in the graph). Arman calls this the biggest win;
   design not started.
3. **Notes local multi-scope FILTER UI** — the field's `filter` mode is
   built and waiting; NoteSidebar still filters via active context only
   (plus the homeless-notes hint). Scope-orphan hint needs the bulk read.
4. **Overlay-catalogue registration** for `ContextAssignmentWindow` (global
   dispatch-open) — do with the `overlay-system` skill.
5. **Live project quick-add** in the field (slug/membership semantics) —
   warns in live mode today.
6. **Backend `active_scopes` shape** — `build-ambient-context.ts` sends a
   map whose keys were type ids, now scope ids (values unchanged & correct).
   If aidream ever read those KEYS as type ids, align it (values are the
   real contract).
7. **Header-level context indicator** — Arman has ideas; waiting on his
   direction.

## Verification status

Typecheck clean on all touched files; every route above SSR-200s. Browser
verification of the new hierarchy tree + multi-select sidebar is pending
Arman's pass (the lab at `/demos/scopes/context-lab` exercises the field
directly — Block 2 hosts active mode).

## Commit trail (this build)

`e4bdebc86` rollout kit → `46844967b` files → `fc717cf33` sidebar →
`bd0723775` chat/transcripts/KG → `7893fff3c` notes → `0aa2c749b` hierarchy
tree + multi-scope + rail popover. Full narrative: `features/scopes/FEATURE.md`
change log (2026-06-10 → 2026-06-12 entries).
