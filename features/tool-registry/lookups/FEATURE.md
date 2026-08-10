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
