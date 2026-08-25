# Tool Registry · Lookups

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/agents/agent-tools/STATE.md — read it before touching this feature in ANY repo.

Admin route `/administration/agents/lookups` — one tabbed surface over the three lookup tables
every other piece of the registry references by FK: `ui.ui_client` (PK `name`),
`ui.ui_surface` (PK `name`, FK → `ui.ui_client`), `tool.executor` (PK `name`).

## Entry points

- Page: `app/(admin)/administration/agents/lookups/page.tsx`
- Client component: [components/LookupsAdminPage.tsx](./components/LookupsAdminPage.tsx)
- Service: [services/lookups.service.ts](./services/lookups.service.ts)
- Surface runtime: [components/LookupsSurfaceRuntime.tsx](./components/LookupsSurfaceRuntime.tsx)

## Rules

1. **Soft-delete only.** Every row has an `is_active` toggle; hard `DELETE` is intentionally
   absent because these tables are FK targets for tools, executors, agents, and surfaces.
   Deactivating a `ui_client` counts dependent surfaces and shows that count in the confirm.
2. **Surface names are the `<client>/<surface>` slash form.** The create form composes it from a
   client picker plus a local name validated against `^[a-z0-9-]+$`.
3. **`name` is accepted only while CREATING.** The save is `upsert(onConflict: "name")`, so a
   changed name on an edit inserts a second row rather than renaming.
4. **Name regexes live in `lookupsVocabulary.ts`** — shared by the dialogs, the write handler
   and the surface manifest so they cannot drift. Never inline one in a dialog again.
5. **Row dialogs `preventDefault` on `onInteractOutside`** — dismissing the stacked
   surface-write confirm was closing the form and discarding the staged draft. Escape, Cancel
   and the X still close normally.
6. No barrel files; no Redux (`useEffect` + `useState` + the Supabase browser client is enough
   for an admin-only, infrequent surface). `confirm()` from
   `@/components/dialogs/confirm/ConfirmDialogHost`, never `window.confirm`.

## Change Log

- 2026-08-25 — Cut to local mechanics by the `agent-tools` consolidation; the 2026-05-05 seed
  record and the agent-writability narrative removed (git history has both).
- 2026-08-12 — Agent-writable via `matrx-admin/lookups` with one draft target, `lookup_draft`;
  cherry-picked to `main` with authorship intact and re-verified there.
- 2026-08-09 — Replaced the retired Executor Kind / Gate vocabulary with the live
  `ui.ui_client` / `ui.ui_surface` / `tool.executor` model and current admin route.
- 2026-05-05 — Phase 1 shipped.
