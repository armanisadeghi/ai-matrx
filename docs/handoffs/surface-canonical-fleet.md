---
status: active
updated: 2026-07-27
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

## Remaining work — the board drives everything (live 2026-07-27 after batch 3: **51 verified / 38 partial / 19 stub / 47 unregistered**; 108 manifests, 2,749 value rows — always read fresh counts from the board)

1. **matrx-admin fleet — now the biggest block.** 4 of 33 done (system-agents, database, ai-models, tool-registry). The other ~29 map 1:1 to live `/administration/*` routes. **Blocking sub-task:** `route-to-surface.ts` still has a `/administration` catch-all attributing every un-prefixed admin route to system-agents (marked TODO in the file) — narrow it as the wave completes. Also drop the stale `"matrx-admin/system-agents": "/administration"` override in `utils/surface-url-pattern.ts` so the manifest wins.
2. **Remaining unregistered real pages**: `/rag/repositories` (code repos — a distinct concept from data-stores, do NOT merge), `/rag/flow`, `/rag/visualization`, `/legal/ca-wc`, `/artifacts`, `/reports`, `/surfaces` (the hub itself), `/education`'s ~85 uncovered routes (next best: quizzes+practice-tests as one assessment surface, flashcards `[setId]/study` session surface, fastfire, planner+progress), `/images` 19 remaining (best next: `/images/edit/[id]`), `/podcast/[slug]` + `/podcast/studio/show/[showId]`.
3. **Known-dead, decide and delete**: `/tools` has no `page.tsx` (404s) — its route mapping was removed; the `matrx-user/tools` DB row should be retired. `matrx-user/rag` stays `is_active=false` deliberately (its whole vocabulary is a subset of rag-library; `/rag` now routes there).
3. **Partial → verified (15)** — each carries a `readinessNote` naming the exact gap. Notable: `marketing` hub (its five owned views ARE complete; it stays partial only because unmapped hub routes still fall through to it), `extractor-chunker` (server-side emitter in aidream `services/page_extraction/chunking.py#_build_surface_vars` supplies only 4 of the 11 keys once claimed guaranteed — promoting it needs an aidream change), `files` / `documents` (need sync + live binding test; files also needs a mobile `MobileStack` provider), `quick-tasks` / `task-create` / `quick-note-save` / `file-preview` (thread inner form state up out of their `*Core` components), `agent-apps` (hub grid emitter), `content-plan` (Locate anchors done; agent roles still unbound), `transcript-scribe` (no surface-scope emitter — its context flows via `useStudioAssistant` instance-context).
4. **Stub → verified (19)** — mostly the manifest-only overlay windows (image-viewer, image-uploader, gallery, share, feedback, canvas-viewer, voice-pad, transcript-studio *(preserve its hand-coded 3-pipeline vocabulary)*, observational-memory, agent-gate, agent-run-history, agent-settings, smart-code-editor) plus the remaining toy manifests (messages, lists, canvas, ai-results, agent-advanced-editor, mermaid-editor). Each needs a live audit + nested emitter inside its window component.
5. **Matrx-vs-matrix live binding test** (surface-registration Layer 6) — still not run post-overhaul on any surface.
6. **Locate anchors** beyond marketing/content-plan/notes/tasks. Worth doing once at the primitive level: `MatrxDataTable` could grow anchor slots for filter/sort/pagination chrome so every list surface gets `active_filters` / `*_sort` / `*_pagination` anchors for free.
7. Inactive matrx-admin debug overlay rows (13, e.g. `stream-debug`, `json-truncator`) — register with `overlayId` or delete during the admin wave.

## Done

- Canonical platform (NAMING/COMPLETENESS laws, groups, provenance, breadcrumb, Locate, agent-feed contract) — `features/surfaces/FEATURE.md` 2026-07-24 entries; aidream deployed.
- **Readiness tracking system** — required manifest field + DB mirror + admin board; all 84 manifests stamped honestly.
- **Overlay surfaces** — 19 window panels registered with `overlayId`; 6 with live nested emitters (quick-tasks, task-create, quick-note-save, file-preview, markdown-editor, list-manager).
- **Verified-complete: 50 surfaces** (2026-07-27). The whole marketing tree (hub views, brand, site, page, 12 verticals, ranks, batches, keyword surfaces), the whole CMS tree (hub, site, page, component, html-page), notes, chat, assistant-message, tasks, projects, transcripts family, code-editor, scraper, research, rag-search, war-room(+thread), working-document/scratchpad, agent-builder, agent-run, pdf-extractor/analysis-studio/scanner, agents-hub, organizations, dashboard, settings, agent-connections, connections-skills, markdown-editor, list-manager.
- **New surfaces created this campaign**: content-plan, keyword-research, marketing-site-keywords, marketing-ranks, agents-hub, organizations, dashboard, settings, agent-apps, agent-connections, connections-skills + 19 overlays.
- **New emitters built from nothing**: agent-run, analysis-studio, scanner (shared across both skins), rag-search, documents (×2 routes), CMS hub/site/tabs, marketing hub ×5 views.
- **Shared primitives extracted** (instead of forking): `table-view-values.ts`, `marketing-hub-scope.ts`, `pdf-extractor-scope.ts`, `agent-system-instruction.ts`, `CONVERSATION_DOCUMENT_GROUPS`.
- **Bugs fixed en route**: three dynamic-route resolution families (CMS, agents, ranks) + 15 tests; `documents` manifest was pure fiction; 5 rag-search values leaking as undeclared runtime keys; `extractor-chunker` inheritance violation; war-room recording selector keyed on the wrong id; `BatchesTable` dropping scope when empty; `workspace_root` declared-but-never-emitted; files `durablePublicUrl` guard against signed-URL leakage.
- 11 zero-reference stale DB rows deleted; 8 orphaned manifests activated via route prefixes; fictional prefixes/url_patterns fixed; dead `SurfacesAdminPage`/`SurfaceDetailDrawer` deleted.

## Decisions needed

*(none — prior overlay + stale-row questions resolved by Arman 2026-07-24: overlays get surfaces; stale rows deleted.)*
