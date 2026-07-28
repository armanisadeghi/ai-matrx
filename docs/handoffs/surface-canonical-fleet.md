---
status: active
updated: 2026-07-28
repos: [matrx-frontend, aidream]
vision: []
---

# Surface Values — drive every surface to `verified`

## Vision — Arman's words

- "Each surface and each surface value should have ONLY canonical naming… a single source of truth and overrides strictly prohibited."
- "You have to declare every single thing. Every piece of data state, everything that comes into this page has to be included." Fields AND natural composite groups are mandatory; convenience packs optional.
- "The overlays and window panels all need to get their own surface. Many of them are the ones which are the most likely to have significant interactions… make sure we make them easy to identify and update."
- "The biggest and most important thing is to make sure we have proper tracking of all of the surfaces to know which are now verified to be correct and complete, which are partially done and which are at a different place. I need to make a big push to get them all done."
- Agent feeds carry machine names only; curated groups first, generic baselines last; hierarchy explicit; highlight-on-page connects values to the UI.

## Resources

- **The tracking board** (drive-to-zero dashboard): `/administration/ui/surfaces` — rollup tiles Verified / Partial / Stub / Unregistered, readiness filter, per-row badges + notes. Readiness is CODE-OWNED: edit `SurfaceManifest.readiness` and re-sync, never the DB.
- Laws, template, inheritance example, readiness + overlay doctrine: `.claude/skills/surface-authoring/SKILL.md` (also holds the layered registration recipe; `surface-registration` is a pointer stub). Invoke first.
- Exemplars: route surface `features/surfaces/manifests/marketing-page.manifest.ts`; admin-fleet reference `admin-database.manifest.ts`; overlay surface with nested emitter `markdown-editor.manifest.ts`.
- Sync: `POST /api/admin/surfaces/sync-manifests`, or `scripts/emit-surface-sync-sql.ts --surface <name>…` → write the output as an idempotent `migrations/*.sql` and apply via aidream `.venv/bin/python db/apply_migrations.py --source matrx-frontend` (handles ledger + regenerates aidream models). New surfaces need their `ui.ui_surface` row inserted first (`name`, `client_name`, `description`, `sort_order`) — the emit script only updates existing rows.
- Gates: `pnpm check:surface-drift`, `pnpm type-check`, `npx vitest run --globals features/surfaces/utils/route-to-surface.test.ts`.
- System doc: `features/surfaces/FEATURE.md`. Test login: `/login` admin@admin.com / Password1234#.

## Route-resolution laws (learned the hard way)

- `SURFACE_ROUTE_MAPPINGS` is **prefix-only, first-match** — it cannot see through a dynamic segment. Routes nesting an id need a `resolveXSurface()` function (see `resolveMarketingSurface` / `resolveCmsSurface` / `resolveAgentsSurface` in `features/surfaces/utils/route-to-surface.ts`) + tests. A prefix entry for a `[param]` route will look right and do nothing.
- **The `/administration` catch-all is GONE (2026-07-28).** Unmapped admin routes resolve to `null` (caller omits `client.surface`) instead of lying "system-agents". Registering a new admin family = manifest + its own specific prefix entry. Children go ABOVE their hub prefix (first-match): see the users-family block.

## Do NOT surface a placeholder

`/marketing/{ranks,analytics,campaigns,competitors,content-studio,reports,social,email}` render `MarketingComingSoon` and load nothing — no manifests until the features ship ("never declare what nothing emits"). Same for `/administration/automation/scheduling`'s Templates tab (hardcoded SEEDS array awaiting a `sch_template` table). **Audit the live page before trusting an inherited manifest** — two manifests once described pages that never existed.

## Remaining work — the board drives everything (live 2026-07-28: **54 verified / 42 partial / 29 stub / 13 unregistered-active**; 125 manifests, 3,031 declared values — always read fresh counts from the board)

1. **Admin fleet: partial → verified.** The 2026-07-28 wave registered 14 admin surfaces (all honest partial/stub). Each `readinessNote` names the exact emitter gap. Best next: `cx-dashboard` (nested per-tab providers for conversations/requests/usage/errors), `applications` (bridge per-tab client components), `agent-apps` (edit/[id], categories, executions, analytics, rate-limits mounts), `agent-review` (browser-verify → verified). The stub group (`server-logs`, `sandbox`, `users`, `email`, `feedback`, `bundles`, `mcp-servers`, `lookups`, `official-components`, `scheduling`) needs emitters from scratch — `server-logs` is the hairiest (15 useState hooks in a 1,487-line component).
2. **Admin families still unregistered** (resolve to null now, which is honest): `/administration` dashboard itself, agents hub + skills + executor-surfaces + relationships/actions + reports/agent-drift, `ai` hub + ai-tasks, `automation` hub, `chat` hub, `compute` hub + resilience-lab + sandbox-infra, `documentation`, `knowledge` (cms-agents, kg-*, podcasts, research-system), `reporting`, `scopes-context`, `shared-knowledge`, `ui` hub + experimental-routes + surfaces board itself, `utilities` (capture-inspector, content-blocks, kind-registry, …), users subroutes beyond the hub (admins, announcements, entitlements, invitations, organizations, preferences, usage — currently attributed to the users hub surface, which is correct).
3. **Remaining unregistered real user pages**: `/rag/repositories` (code repos — distinct from data-stores, do NOT merge), `/rag/flow`, `/rag/visualization`, `/legal/ca-wc`, `/artifacts`, `/reports`, `/surfaces` (the hub itself), `/education`'s ~85 uncovered routes (next best: quizzes+practice-tests as one assessment surface, flashcards `[setId]/study`, fastfire, planner+progress), `/images` 19 remaining (best next: `/images/edit/[id]`), `/podcast/[slug]` + `/podcast/studio/show/[showId]`. Plus the non-web rows: `chrome-extension/{assistant,pilot}`, `matrx-local/desktop`, `matrx-default/*`, `matrx-public/*` (5), `matrx-user/{quick-data,workflow}` — decide register-or-retire per row.
4. **Pre-wave partial → verified (15)** — each `readinessNote` names the gap. Notable: `marketing` hub (complete; stays partial only while unmapped hub routes fall through to it), `extractor-chunker` (**aidream**: `services/page_extraction/chunking.py#_build_surface_vars` supplies 4 of 11 claimed keys — chip handed to Arman 2026-07-28), `files` / `documents` (sync + live binding test; files also needs a mobile `MobileStack` provider), `quick-tasks` / `task-create` / `quick-note-save` / `file-preview` (thread inner form state up out of `*Core` components), `agent-apps` (user hub grid emitter), `content-plan` (agent roles unbound), `transcript-scribe` (no surface-scope emitter — context flows via `useStudioAssistant`).
5. **Stub → verified (29)** — the manifest-only overlay windows (image-viewer, image-uploader, gallery, share, feedback, canvas-viewer, voice-pad, transcript-studio *(preserve its hand-coded 3-pipeline vocabulary)*, observational-memory, agent-gate, agent-run-history, agent-settings, smart-code-editor), the toy manifests (messages, lists, canvas, ai-results, agent-advanced-editor, mermaid-editor), and the new admin stubs (item 1). Each needs a live audit + nested emitter.
6. **Matrx-vs-matrix live binding test** (surface-authoring Layer 6) — still not run post-overhaul on any surface.
7. **Locate anchors** beyond marketing/content-plan/notes/tasks. Worth doing once at the primitive level: `MatrxDataTable` could grow anchor slots for filter/sort/pagination chrome so every list surface gets `active_filters` / `*_sort` / `*_pagination` anchors for free.
8. Inactive matrx-admin debug overlay rows (13, e.g. `stream-debug`, `json-truncator`) — register with `overlayId` or delete during the admin wave.

## Done

- Canonical platform (NAMING/COMPLETENESS laws, groups, provenance, breadcrumb, Locate, agent-feed contract) — `features/surfaces/FEATURE.md` 2026-07-24 entries; aidream deployed.
- Readiness tracking system — required manifest field + DB mirror + admin board.
- Overlay surfaces — 19 window panels registered with `overlayId`; 6 with live nested emitters.
- **Verified-complete: 54 surfaces** — whole marketing tree, whole CMS tree, notes, chat, assistant-message, tasks, projects, transcripts family, code-editor, scraper, research, rag-search, war-room(+thread), working-document/scratchpad, agent-builder, agent-run, pdf family, agents-hub, organizations, dashboard, settings, agent-connections, connections-skills, markdown-editor, list-manager, keyword surfaces, ranks.
- **Admin fleet wave 1 (2026-07-28): 14 surfaces registered** (users, feedback, email, agent-review, cx-dashboard, server-logs, sandbox, official-components, applications, scheduling, agent-apps, bundles, mcp-servers, lookups) with 5 live emitters (agent-review, cx-dashboard ×2-level, applications, agent-apps ×2); `/administration` catch-all + dead `/admin` entry DELETED with test coverage; stale system-agents url-pattern override removed; all synced to DB.
- **DB hygiene (2026-07-28)**: 5 zero-reference surface rows deleted (incl. `matrx-user/tools`, duplicate `matrx-admin/mcp-tools`); 10 stale flat admin url_patterns corrected to real nested routes; **~180 graveyard→live FKs dropped platform-wide** (`migrations/drop_graveyard_to_live_fks.sql`) — graveyard tables were blocking live-table deletes.
- Marketing-page post-pane-pass completeness sweep — `target_performance` + live `gsc_queries`, Locate anchors fixed, re-verified (2026-07-28).
- Route-resolution fixes: three dynamic-route families (CMS, agents, ranks) + 33 tests total.
- Shared primitives extracted: `table-view-values.ts`, `marketing-hub-scope.ts`, `pdf-extractor-scope.ts`, `agent-system-instruction.ts`, `CONVERSATION_DOCUMENT_GROUPS`.

## Decisions needed

*(none)*
