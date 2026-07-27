---
status: active
updated: 2026-07-24
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
- Laws, template, inheritance example, readiness + overlay doctrine: `.claude/skills/surface-authoring/SKILL.md`; layered recipe: `.claude/skills/surface-registration/SKILL.md`. Invoke both first.
- Exemplars: route surface `features/surfaces/manifests/marketing-page.manifest.ts`; overlay surface with nested emitter `markdown-editor.manifest.ts` (+ provider inside `components/mardown-display/markdown-classification/MarkdownClassificationTester.tsx`).
- Sync: `POST /api/admin/surfaces/sync-manifests` or `scripts/emit-surface-sync-sql.ts` → Supabase MCP. Gates: `pnpm check:surface-drift` (validates readiness/labels/groups), `pnpm type-check`.
- System doc: `features/surfaces/FEATURE.md` (NAMING LAW + groups + readiness sections). Test login: `/login` admin@admin.com / Password1234#.

## Route-resolution law (learned the hard way, 2026-07-27)

`SURFACE_ROUTE_MAPPINGS` is **prefix-only** — it cannot see through a dynamic segment. Three whole families were silently resolving to their parent hub because their real routes nest an id: `/cms/[siteId]/…`, `/agents/[id]/build|run`, `/marketing/…/[siteId]/ranks`. Each is fixed by a `resolveXSurface()` function (see `resolveMarketingSurface` / `resolveCmsSurface` / `resolveAgentsSurface` in `features/surfaces/utils/route-to-surface.ts`), covered by `route-to-surface.test.ts` (15 tests). **When registering any surface whose route contains `[param]`, add a resolver + tests — a prefix entry will look right and do nothing.**

## Do NOT surface a placeholder

`/marketing/{ranks,analytics,campaigns,competitors,content-studio,reports,social,email}` render `MarketingComingSoon` and load nothing. Authoring manifests for them would be fiction (violates "never declare what nothing emits"). They get surfaces when the features ship. Two manifests were found describing pages that never existed (`documents` described a RAG viewer; `agent-builder` declared a nonexistent test-prompt input) — **audit the live page before trusting an inherited manifest.**

## Remaining work — the board drives everything (live: ~18 verified / ~28 partial / ~33 stub / ~54 unregistered after overlay registration; read fresh counts from the board)

1. **Unregistered real pages → manifests** (full recipe incl. route prefix + registry + sync). Ranked by user dwell: `/education` (~90 routes; plan a parent + children tree), `/images` (21), `/podcast` (26), `/rag` (11 — DB row `matrx-user/rag` is `is_active=false`; reactivate when registering), `/schedules`, `/scopes` + `/context-items`, `/workbooks`, `/knowledge`, `/shapes`, `/legal/ca-wc`, `/artifacts`, `/reports`, `/markdown-studio`, `/seo/keyword-research`, `/voice`, `/surfaces`, `/tools` (hub), `/chat/voice` (`matrx-user/chat-voice` — already load-bearing at runtime), `/transcripts/scribe/[sessionId]` (`transcript-scribe-live` — name hardcoded in `ScribeLiveScreen`), `/sandbox` (`matrx-user/sandboxes`).
2. **matrx-admin fleet** — all 33 admin surfaces are unregistered; they map 1:1 to live `/administration/*` routes. Biggest single block on the board.
3. **Partial → verified** (each carries a `readinessNote` saying exactly what's missing): 12 marketing verticals (groups), pdf-extractor family (groups + audit), agent-builder, rag-search, working-document/scratchpad, war-room(+thread), mermaid-editor, agent-run, marketing hub/site-pages, agent-apps (hub grid emitter), transcript-scribe (emitter), quick-tasks / task-create / quick-note-save / file-preview (thread inner form state up — see notes in each manifest).
4. **Stub → verified**: the 14 old toy manifests (documents, research, files, messages, lists, canvas, ai-results, agent-advanced-editor, cms family, html-page) + the 13 manifest-only overlay stubs (image-viewer, image-uploader, gallery, share, feedback, canvas-viewer, voice-pad, transcript-studio — preserve its hand-coded 3-pipeline vocabulary, observational-memory, agent-gate, agent-run-history, agent-settings, smart-code-editor).
5. **Matrx-vs-matrix live binding test** on marketing-page (surface-registration Layer 6) — still not run post-overhaul.
6. **Locate anchors** on upgraded surfaces beyond marketing/notes/tasks (cheap `data-surface-value` adds).
7. Inactive matrx-admin debug overlay rows (13, e.g. `stream-debug`, `json-truncator`) — register with `overlayId` or delete during the admin wave.

## Done

- Canonical platform (NAMING/COMPLETENESS laws, groups, provenance, breadcrumb, Locate, agent-feed contract) — `features/surfaces/FEATURE.md` 2026-07-24 entries; aidream deployed.
- **Readiness tracking system** — required manifest field + DB mirror + admin board; all 79 manifests stamped honestly.
- **Overlay surfaces** — 19 window panels registered with `overlayId`; 6 with live nested emitters (quick-tasks, task-create, quick-note-save, file-preview, markdown-editor, list-manager).
- Verified-complete (18): marketing page/site/brand, notes, chat, assistant-message, tasks, projects, transcripts(+cleanup), code-editor, scraper, agents-hub, organizations, dashboard, settings, agent-connections, connections-skills (+ markdown-editor, list-manager overlays).
- 11 zero-reference stale DB rows deleted; 8 orphaned manifests activated via route prefixes; fictional prefixes/url_patterns fixed; dead `SurfacesAdminPage`/`SurfaceDetailDrawer` deleted.

## Decisions needed

*(none — prior overlay + stale-row questions resolved by Arman 2026-07-24: overlays get surfaces; stale rows deleted.)*
