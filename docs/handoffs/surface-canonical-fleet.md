---
status: active
updated: 2026-07-24
repos: [matrx-frontend, aidream]
vision: []
---

# Surface Values — canonical fleet rollout (remaining surfaces)

## Vision — Arman's words

- "Each surface and each surface value should have ONLY canonical naming… a single source of truth and overrides strictly prohibited." — one identity (or one machine name + one governed friendly label); every page, component, binding UI, and admin surface reads the same source; DB auto-synced from code so there is no drift.
- "When the data is fed to the agents… never anything other than the official name used. So common names and labels… should never be included" — agent feeds carry machine names/keys only.
- "You have to declare every single thing. Every piece of data state, everything that comes into this page has to be included." Individual fields AND their natural groups are mandatory ("Those 4 declarations are not optional"); optional convenience packs are the only discretionary part.
- "At the top we really need to start with a curated set of what we think an agent on this page is gonna need" — curated groups first; the generic always-there values (selection, text before/after) go to the very bottom.
- Hierarchy must be explicit: parent/child shown as a real hierarchy, names exact and identical everywhere; plus highlight-on-page so users "see exactly where all of these things are."
- (inferred) The 2026-07-24 overhaul + fleet push implemented all of the above for the platform + 17 surfaces; this handoff is the rollout to the REST of the fleet.

## Resources

- Laws + full-contract template + inheritance worked example: `.claude/skills/surface-authoring/SKILL.md`; end-to-end layered recipe: `.claude/skills/surface-registration/SKILL.md`. Invoke BOTH before touching any surface.
- Exemplar manifest: `features/surfaces/manifests/marketing-page.manifest.ts` (+ scope builder `features/marketing/lib/marketing-page-scope.ts`, emitter `features/marketing/components/pages/PageWorkspace.tsx` with `data-surface-value` anchors).
- Display seam: `features/surfaces/utils/surface-display.ts`. Highlight: `features/surfaces/utils/locate-on-page.ts`. Hierarchy: registry `getSurfaceAncestry`/`getSurfaceChildren` via `features/surfaces/runtime/fetchRelatedSurfaces.ts`.
- Sync: `POST /api/admin/surfaces/sync-manifests` (admin UI `/administration/ui/surfaces`) or `scripts/emit-surface-sync-sql.ts` → Supabase MCP. Gates: `pnpm check:surface-drift`, drift report API (`surfaceLabelDrifts`/`valueGroupsDrifts`).
- System doc: `features/surfaces/FEATURE.md` § "THE NAMING LAW + canonical groups (2026-07-24)".
- Test login: `/login` admin@admin.com / Password1234#. Verify UI via the header Agents popover + Surface Context window on any covered route.
- The uncovered-routes/manifest-less inventory (2026-07-24 scout, verify before trusting): 96 DB rows lack manifests; List 3 of big uncovered routes is reproduced in "Remaining work".

## Remaining work

1. **Manifests + emitters for the biggest uncovered routes** (each = full recipe: audit page data → full-contract manifest with groups → scope builder → `SurfaceRuntimeProvider` emitter → register in `registry.ts` → route prefix in `route-to-surface.ts` → sync + live verify). Ranked: `/education` (~90 routes — likely several child surfaces under one parent), `/images` (21), `/podcast` (26), `/rag` (11 — NOTE `ui.ui_surface` row `matrx-user/rag` exists but `is_active=false`; reactivate when registering), `/schedules`, `/scopes` + `/context-items`, `/workbooks`, `/knowledge`, `/shapes`, `/legal/ca-wc`, `/artifacts`, `/reports`, `/markdown-studio`, `/seo/keyword-research`, `/voice`, `/surfaces` (the hub itself).
2. **Emitters for list-page catalog values that are declared but unemitted:** agent-apps hub grid (`app/(core)/agent-apps/page.tsx` is a server page — catalog values `listed_app_count`/`listed_apps_summary` need a client provider), organizations resource tabs (`/[orgId]/files` etc. fall back to shell scope).
3. **Completeness passes on remaining registered surfaces** that still have no groups / stale values: documents, research, files, messages, lists, canvas, ai-results, agent-run, agent-builder, agent-advanced-editor, mermaid-editor, rag-search, working-document/scratchpad, war-room(+thread), cms family, pdf-extractor family (has evidence sources; needs groups), marketing verticals (crawls/audit/analysis/findings/links/backlinks/coverage/sitemaps/discovery/integrations/batches — have values, no groups).
4. **Overlay/widget surfaces** (file-preview, quick-tasks, share, image-viewer, gallery, markdown-editor, transcript-studio, voice-pad, agent-settings, …): decide per-surface whether they warrant manifests (they're overlay IDs, not routes); the DB rows carry fictional `url_pattern`s — null them or write manifests. Trap: don't invent routes.
5. **Stale-surface cleanup:** deactivate/delete DB rows with zero code references (`ai-voice`, `browser-workbench`, `code-workspace`, `multi-file-smart-editor`, `news`, `notes-beta`, `prompt-apps`, `applets`, `voice-pad-advanced`, `voice-pad-ai`); `matrx-user/custom-apps` is active with no live route — deactivate or repoint. Admin (`matrx-admin/*`) manifest coverage is a separate later wave.
6. **Scribe surface emitter:** `matrx-user/transcript-scribe` context flows via `useStudioAssistant`/`assistantContextBuilder.ts` (smartExecute), not a surface-scope emitter; when a real emitter lands, declare its values + groups in the same change (documented in the manifest header).
7. **Matrx-vs-matrix live binding test** on `matrx-user/marketing-page` (bind an agent with deliberately non-matching names, launch, verify mapped variables arrive; the standard is in surface-registration Layer 6). Not yet run post-overhaul.
8. **Locate anchors** on the newly upgraded surfaces (notes/tasks partially anchored; chat, code, scraper, transcripts, orgs, dashboard have none) — cheap `data-surface-value` adds via each feature's card/section primitives.

## Done

- Platform: NAMING/COMPLETENESS laws, groups+provenance registry, DB columns + sync mirrors, drift checks, ESLint ban, display seam, breadcrumb chrome, grouped Surface Context window + Locate — see `features/surfaces/FEATURE.md` Change Log 2026-07-24.
- aidream manifest endpoint carries `{name, group_key, sort_order, auto_context, always_available}` + groups — deployed; FE api-types regenerated.
- Exemplar: marketing-page (≈40 own values, 7 groups, anchors); marketing-site/brand grouped; `gsc_synced_at` added.
- Upgraded to standard: notes (30), chat (25) + assistant-message, tasks (23) + projects (22), transcripts family, code-editor, scraper.
- New surfaces registered + emitting: agents-hub, organizations, dashboard, settings, agent-apps, agent-connections, connections-skills (60 manifests / 1,270 values total, DB synced live).
- Route fixes: `/cms` `/war-room` `/data` prefixes activated 8 orphaned manifests; fictional prefixes corrected (`/agent-apps`, `/agent-connections`, `/sandbox`, `/user-settings`) in code + DB url_patterns.

## Decisions needed

- **Situation:** ~19 window-panel overlays (file preview, quick tasks, share, image viewer, …) have `ui.ui_surface` rows with fictional url_patterns and no manifests; they are launchable UI surfaces but not routes. **Decide:** should overlays get manifests (so agents can be bound to e.g. the file-preview window), or should their rows be pruned to routes-only and overlay context handled by their host page's surface?
- **Situation:** 11 inactive DB surface rows have zero code references (listed in Remaining work item 5); deleting loses nothing known but is irreversible without git-style history. **Decide:** hard-delete vs leave inactive.
