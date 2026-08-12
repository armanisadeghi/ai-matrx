# Tool Registry · Lookups

**Status**: shipped
**Owner**: tool-registry
**Routes**: `/administration/agents/lookups`

## What this is

A single tabbed admin surface for the three live lookup tables that the tool
system is built on. These tables seed the vocabularies
that every other piece of the registry references via FK.

| Tab | Table | PK | Edit frequency |
|---|---|---|---|
| UI Clients | `ui.ui_client` | `name` text | rare |
| UI Surfaces | `ui.ui_surface` | `name` text (FK → `ui.ui_client`) | occasional |
| Tool Executors | `tool.executor` | `name` text | rare |

## Entry points

- Page: `app/(admin)/administration/agents/lookups/page.tsx`
- Client component: [features/tool-registry/lookups/components/LookupsAdminPage.tsx](./components/LookupsAdminPage.tsx)
- Service: [features/tool-registry/lookups/services/lookups.service.ts](./services/lookups.service.ts)

## Conventions baked in

- **Surface naming**: `<client>/<surface>` slash form (e.g. `matrx-user/code-editor`). The create-surface form composes this from a client picker + a local-name input; the local name is validated against `^[a-z0-9-]+$`.
- **Soft-delete only**: every row has an `is_active` toggle. Hard `DELETE` is intentionally absent — these tables are FK targets for tools, executors, agents, and surfaces. Deactivate, don't delete; reactivate later. The "Deactivate ui_client" path counts dependent surfaces and surfaces that count in the confirm.
- **No barrel files**: imports go directly to source.
- **No Redux**: the lookups are admin-only and infrequent. `useEffect` + `useState` + the Supabase browser client are enough.
- **Confirms via `confirm()`** from `@/components/dialogs/confirm/ConfirmDialogHost` — never `window.confirm`.

## Change Log

- 2026-08-12 — **The agent-writable work below shipped to `main` from a
  different branch, unchanged, after independently re-verifying it.** It had
  been finished and live-verified a day earlier but its branch never merged,
  so none of it was on `main` while `main` moved 40+ commits ahead. Landed by
  cherry-pick with authorship intact — no re-authoring, no second target set.
  Re-verified on today's `main` because nobody had run it there: a real
  Badass Agent run staged `matrx-tablet` + its description into the real New
  UI Client inputs, refused Sort order / Active with no tool call, returned
  the handler's own throw verbatim for an invalid name with nothing staged,
  and declined cleanly on "Keep as is". `ui.ui_client` still holds its
  original 6 rows (SQL-checked) — `draft` wrote nothing. `type-check` clean
  (0 errors), `check:surface-drift` clean at 142 surfaces.

- 2026-08-11 — **Agent-writable, and the page's first surface emitter.**
  `LookupsAdminPage` now mounts a `SurfaceRuntimeProvider` for
  `matrx-admin/lookups`, fed by the new `components/LookupsSurfaceRuntime.tsx`
  — a page-scoped store the three CRUD children and the open row dialog
  publish into, so each keeps owning its own state. It builds both the live
  scope and the single write target, `lookup_draft` (`{name?, description?}`,
  `mode: "draft"`, `applyPolicy: "ask"`), which stages into the row form the
  admin is looking at (opening the New form on the active tab when none is
  open) and never touches the database — Save stays a human click. `name` is
  accepted only while CREATING: the save is `upsert(onConflict: "name")`, so a
  changed name on an edit would insert a second row rather than rename.
  Supporting changes: the three dialogs' inline name regexes moved to the new
  dependency-free `lookupsVocabulary.ts` (shared by the dialogs, the write
  handler and the surface manifest, so they cannot drift), and the row dialogs
  now `preventDefault` on `onInteractOutside` — dismissing the stacked
  surface-write confirm was closing the form and discarding the staged draft.
  Escape, Cancel and the X still close normally.
- 2026-08-09 — Replaced the retired Executor Kind / Gate vocabulary with the
  live `ui.ui_client`, `ui.ui_surface`, and `tool.executor` model and current
  admin route.

## Seed (applied 2026-05-05 via migration `seed_matrx_frontend_clients_and_surfaces`)

Two clients and 18 surfaces were seeded directly so Phase 2 (tool admin) and Phase 8 (agent shortcuts) both have a populated `ui_surface` table to read from:

- `matrx-admin` — admin portal (4 surfaces: tool-registry, agent-debug, state-analyzer, cx-explorer)
- `matrx-user` — user-facing app (14 surfaces matching the legacy `ShortcutContext` enum minus `general`: chat, notes, tasks, projects, agent-builder, custom-apps, code-editor, documents, data-tables, canvas, dashboard, research, transcripts, scraper)

The `chrome-extension` client and its two surfaces (`/assistant`, `/pilot`) were already present from the backend's own seed.

## Change Log

- **2026-05-05** — Phase 1 shipped. Initial Lookups admin tabbed page + service. Backend seeded `matrx-admin` and `matrx-user` clients and 18 surfaces.
