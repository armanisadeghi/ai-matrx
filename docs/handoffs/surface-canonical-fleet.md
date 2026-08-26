---
status: active
updated: 2026-08-17
repos: [matrx-frontend, aidream]
vision: []
---

# Surface Values — drive every surface to `verified`

## Vision — Arman's words

- "Each surface and each surface value should have ONLY canonical naming… a single source of truth and overrides strictly prohibited."
- "You have to declare every single thing. Every piece of data state, everything that comes into this page has to be included." Fields and natural composite groups are mandatory; convenience packs are optional.
- "The overlays and window panels all need to get their own surface. Many of them are the ones which are the most likely to have significant interactions… make sure we make them easy to identify and update."
- "The biggest and most important thing is to make sure we have proper tracking of all of the surfaces to know which are now verified to be correct and complete, which are partially done and which are at a different place. I need to make a big push to get them all done."
- Agent feeds carry machine names only; curated groups first, generic baselines last; hierarchy explicit; Locate connects declared values to the UI.

## Resources

- Tracking board: `/administration/ui/surfaces`. Readiness is code-owned: edit `SurfaceManifest.readiness`, then sync; never hand-edit the DB readiness.
- Canonical checklist: `.claude/skills/surface-authoring/SKILL.md`.
- System doc: `features/surfaces/FEATURE.md`.
- Exemplars: `marketing-page.manifest.ts`; `admin-database.manifest.ts`; overlay `markdown-editor.manifest.ts`.
- Managed preview only: `pnpm preview:start` on port 3001. Login: `/login` with `admin@admin.com` / `<see AI_ADMIN_PASSWORD in .env>`.
- Sync: `scripts/emit-surface-sync-sql.ts --surface <name>…` → idempotent `migrations/*.sql` → `aidream/.venv/bin/python db/apply_migrations.py --source matrx-frontend`.
- Gates: `pnpm check:surface-drift`, `pnpm type-check`, and route tests when mappings change.

## Emitter laws

- **One live provider per surface.** Deepest nesting wins; equal-depth siblings race by registration recency and silently drop one. Register tab/pane providers only while active. `SurfaceScopeWhenActive` is the reference.
- **`TabsContent` unmounts inactive panels by default again** (2026-08-15). `forceMount` is opt-in; a force-mounted pane reintroduces the equal-depth sibling hazard.
- **Rows and stats must name their asymmetry.** If client filtering changes visible rows while tiles count the full fetch, declare and describe both honestly.
- **One declaration and one emitter.** "Undeclared (runtime only)" is a defect. Declared-but-always-empty values are fiction: emit them or delete them.
- **Verified is browser-earned.** Open Agents → Surface Context, compare declared and live values, exercise relevant state, confirm `contract honored`, check Locate, then promote. No browser sighting means no promotion.

## Route-resolution laws

- `SURFACE_ROUTE_MAPPINGS` is prefix-only and first-match; dynamic segments need a resolver plus tests. Children go above parents.
- The `/administration` catch-all is gone. An unmapped admin route resolves to `null`, which is honest.
- Do not manifest placeholders. Scheduling Templates remains undeclared because its `SEEDS` array has no backing table.

## Live board and current line

Live count after the `matrx-public/p` promotion on 2026-08-15: **75 verified / 90 partial / 1 stub / 7 unregistered-active = 173 active**. The seven unregistered-active rows are deliberate non-web contracts: `matrx-default/{default,basic-content-display,basic-editor}`, `chrome-extension/{assistant,pilot}`, and `matrx-local/desktop`. Twelve stubs were added on 2026-08-17 (below), so the board now reads 184 manifests.

🚨 **"Registration is complete" was WRONG, and this doc said it for two days.** Arman's 2026-08-17 ruling — the Masterwork Rulebook had never been declared, "but that also makes me think that other surfaces in the system have not been properly declared" — was correct. A resolver-driven inventory of all 549 `(core)` routes found **60 unmapped routes and one phantom**:

- `matrx-user/agent-shortcuts` was mapped by TEN live routes with **no manifest and no `ui_surface` row anywhere** — those routes resolved to a surface that could not bind, emit, or be audited.
- `/work/**` — the whole Tier-1 AI Work family — had no declaration, and `/work/new` **launches real agent runs** through `useAgentLauncher` with only an ad-hoc `surfaceKey`, never a registered `runtime.surfaceName`.
- A dozen `/images/**` tab routes resolved to nothing because a comment in the mapping called ~550-line tab components "static explainers/stubs".

Twelve surfaces were declared to close this: `agent-shortcuts`, `ai-work`, `ai-work-composer`, `ai-work-conversations`, `image-manager`, `vision-interview`, `artifacts`, `assists`, `reports`, `camera`, `vault`, `legal-ca-wc`. All are `readiness: "stub"` with honest notes — vocabulary + DB rows only, **no emitters wired**, and no `agentRoles` (a role needs a Mandate behind it, not a raw agent id).

**The blindness is now guarded: `pnpm check:surface-routes`** (`scripts/check-surface-routes.ts`) walks every `(core)` route through the real resolver. A mapping pointing at a surface with no manifest **fails** (the phantom class); a route resolving to nothing is **reported** unless it carries a written reason in that script's `DELIBERATELY_UNMAPPED` list. It currently reads 528 resolved / 21 deliberately unmapped / **0 undeclared**. Run it beside `check:surface-drift` — drift only validates manifests against themselves and is blind to both failure modes.

Registration is complete **as measured by that script**, which is the only claim this doc should ever make again. Promotion is the main remaining line, and the twelve new stubs are now the largest block of it: each needs a completeness audit against its page plus an emitter before it can leave `stub`. `/work/new` is the highest-value one — it is the only surface in that set that already launches agents.

1. **Continue the admin browser fleet.** Start with the unfinished `matrx-admin/scheduling` pass, then `official-components`, `agent-review`, `kind-registry`, `growth-loop`, `documentation`, `knowledge`, `skills`, `reporting`, and `utilities`. `server-logs`, `sandbox`, and `email` are done. Feedback stays partial for a real selected-record/detail-form emitter gap.
2. **Scheduling is honestly partial.** All seven emitters are wired, mirrors are synchronized, and Locate anchors now cover every declared page value. Observed in browser: Overview Surface Context opened with `contract honored`; Tasks loaded real rows and emitted `active_tab` + `task_row_count`; Runs loaded the real empty result. Still observe the Runs Context window and Orphan leases, Cron tester, Scanner health, and Templates before promotion. The Cron tester's two write targets were already live-agent verified.
3. **Then education, then Image Studio.** Image Studio's four surfaces remain partial on the fleet-wide Locate-anchor item. The non-matching-name binding primitive is now live-proven; see Done. Do not mount a provider in `EmbeddedImageStudio`; it is a widget inside host surfaces.
4. **The sole stub is deliberate:** `matrx-user/education-learn` is pure Server Components. Do not regress public SEO rendering merely to clear the count; see Decisions needed.

## Current browser-pass evidence

- `matrx-admin/server-logs`: live capped raw/visible logs, 16/24 supplied, `contract honored`.
- `matrx-admin/sandbox`: live fleet counts/table, 7/15 supplied, `contract honored`.
- `matrx-admin/email`: 3/14 supplied initially and 5/14 after applying the Welcome template, `contract honored`, 1/1 write target live; recipient/compose/template/send/result Locate anchors added and Subject → Locate checked against the real input.
- `matrx-admin/scheduling`: Overview 1/35 while its DB counters were still loading, `contract honored`; Tasks loaded real rows and showed 2/35 (`active_tab`, `task_row_count`); Runs loaded its real zero-row result but its Context window was not observed after the browser reconnect failed.
- `matrx-public/p`: public chat-shell fixture `surface-submit-scope-probe`, mapping `topic <- user_input`. Signed-in and signed-out submissions visibly rendered `Topic: <typed Matrx-vs-matrix phrase>`; `chat.conversation.variables.topic` matched in rows `71eb5d6e-b376-42f9-a07f-2030e237e4ae` and `07f5dedc-c7df-45c3-a41a-bf884b373bb0`.

## Done

- **2026-08-15 Matrx-vs-matrix + public shell submit refresh:** the shared execution seam now re-reads the conversation's exact live surface provider and reapplies bindings at submit without recreating the mount-owned instance. Durable fixture: app `0a59ecc7-9eb7-4460-978a-d26d28c20c15`, global binding `9ddd22e3-0577-41e6-9887-3f0b3b58eca6`, deliberately non-name-matched `topic <- user_input`. Signed-in and signed-out browser runs both persisted the typed phrase to `chat.conversation.variables.topic`. Former item 4 is closed; `matrx-public/p` is `verified`.
- **2026-08-15 browser batch 1:** promoted `matrx-admin/{server-logs,sandbox,email}` to verified, synced and ledgered `migrations/surface_sync_admin_browser_verified_batch1_20260815.sql`, added Email and Scheduling Locate anchors, corrected Scheduling's stale readiness note without promoting it, and refreshed the live board at 75 verified / 90 partial / 1 stub / 7 deliberate non-web rows after one concurrent promotion.

## Decisions needed

**Should `/education/learn` become agent-reachable at the cost of its server rendering?**

The study-guide reader is entirely React Server Components for fast, indexable public SEO pages. A surface emitter must run in the browser, so an agent standing on a guide receives no page context. Choose one: (a) accept this permanently and classify it as non-emitting by design; (b) wrap only a small interactive identity slice in a client shell while leaving the article server-rendered; or (c) convert the reader to a client component. Do not choose (c) merely to clear a metric.
