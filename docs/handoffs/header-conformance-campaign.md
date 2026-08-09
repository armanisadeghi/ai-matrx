---
status: active
updated: 2026-08-09
repos: [matrx-frontend]
vision: [.claude/skills/core-route-headers/SKILL.md, .claude/skills/ios-mobile-first/SKILL.md, features/shell/components/header/variants/USAGE.md]
---

# Shell conformance — headers (DONE) → mobile bodies + widths (in progress)

## Vision — Arman's words

> "ABSOLUTELY NO BORDERS or color differences on the header. Must be transparent with glass buttons."
> "NOTICE THERE IS NO STUPID TITLE and DESCRIPTION! …you don't put that inside of a dashboard."
> "The best mobile experience is when you don't try to cram things… on mobile we should always prefer as few things in the header as possible and just putting everything into a bottom drawer."
> "Notice how absolutely random the page widths are… on desktop we need to use the space to do things."
> Chosen rules (2026-07-18): tables on a phone = **horizontal scroll with a frozen first column**; multi-pane routes on a phone = **stack + side panels become bottom drawers**; desktop width = **full width with padding, multi-column where content allows**.
> "Quick and dirty way that works and then focused sessions one by one later." Fleets run **≤5 agents at a time** (more browsers crash the machine); each agent commits its own work.

## Resources

- Recipes: `.claude/skills/core-route-headers/SKILL.md`, `.claude/skills/ios-mobile-first/SKILL.md`. Spec: `features/shell/components/header/variants/USAGE.md`.
- **Primitives — consume, never hand-roll:** `features/shell/components/header/templates/` → `EntityModeHeader` ([id] routes), `CrumbTrailHeader` (drill-downs), `MobilePanelShell` (any multi-pane route: pass the existing desktop layout verbatim + `main` + `panels`). `components/official/matrx-data-table/MatrxDataTable.tsx` handles mobile table scroll for every consumer; a table that must stay bespoke consumes `components/official/mobile-table/mobileTable.ts` (`MOBILE_TABLE_FROZEN`) — never a hand-copied class string.
- **CSS trap, do not rediscover:** `app/globals.css` has an UNLAYERED mobile block (`@media max-width:768px`) with `* { max-width:100% }` and `table { display:block; overflow-x:auto; max-width:100% }`. Unlayered CSS beats Tailwind's layered utilities (so `max-w-none` as a class cannot win) and the TABLE element is the scroller, not its container. Also a base `w-full` outranks `max-sm:w-max` — write width rules mobile-first.
- Audits (keep at zero): `pnpm check:page-headers`; `grep -rln "calc(100dvh\|calc(100vh\|h-screen\|h-page" "app/(core)" --include="*.tsx"`.
- Verify: dev server + `/api/dev-login?token=<DEV_LOGIN_TOKEN>&next=/<route>`, at 375 AND 1280.

## Remaining work

1. **Raw-table sweep — 5 files left, all `(transitional)`** (was 92; swept 2026-08-09). The treatment is now a primitive: **`components/official/mobile-table/mobileTable.ts`** — `MOBILE_TABLE_FROZEN` is ONE class on the `<table>` and does the whole job, `MOBILE_TABLE_FROZEN_SECOND` for the common shape where a narrow control column (chevron, index, icon) sits in front of the identity column; granular constants for anything else. Read its header before touching any table: it encodes the three CSS traps AND the two design rules the sweep learned the hard way — **the frozen cell paints its own opaque background** (never `bg-inherit` + an opaque row: variant tints out-specify that and bleed, plain tints lose and silently kill the selected-row affordance), and **freeze the IDENTITY column, not column 1** when column 1 is an index/rank/kind.

   Left, deliberately, with reasons:
   - `features/applet/runner/fields/**` — 5 editable drag-grids (`DragEditModifyTableField` ×2, `DragTableRowAndColumnField`, `DraggableEditableTableField`, `DraggableTableField`). `(transitional)` group, and each leads with a drag handle, so they need the multi-cell freeze variant that does not exist yet.
   - `features/education/classes/components/ClassProgressPanel.tsx` — owned by the education session (item 7).

   Classified as NOT offenders, so the grep count will never reach zero — don't re-treat them: `files/.../desktop/FileTable.tsx` and `research/.../SourceList.tsx` render only behind `!isMobile`; `cms|content-manager|html-pages/**/PageListView.tsx` already collapse columns with `hidden *:table-cell`; `file-analysis/content/MetadataContent.tsx` is a key/value pane whose values must WRAP; `administration/canonicalization/AdminAuditTable.tsx` is a CSS grid; `tool-call-visualization/renderers/sql/DbSchemaInline.tsx` matches only on a comment; six `.ts` files generate table markup as strings for print/markdown/HTML export.

   Checkbox-led tables got horizontal scroll WITHOUT a freeze (a frozen checkbox is a useless anchor): `KeywordResearchWorkbench`, `SuggestionsTable`, `ExtractionDatasetClient`, `McpToolsManager`, `CurationTable`. **The missing primitive is a multi-cell freeze** (stick columns 0..n with computed left offsets) — build that and those tables get a real anchor. `MOBILE_TABLE_FROZEN_SECOND` already covers the one-narrow-column-in-front case.

   **Not browser-verified at 375px.** The sweep ran in a session with no Supabase credentials, so no dev server and no authenticated route. Type-check green per batch; the changes are additive Tailwind on unchanged markup. A verification pass at 375px is the honest next step.
2. **`MobilePanelShell` gap: drawers don't close on in-panel ACTIONS.** It auto-closes on route change, but a panel action that isn't navigation (transcripts studio: pick a session / Clean Up / create session) leaves the drawer covering the result. Add an opt-in close callback to the primitive and adopt it in `StudioSidebar` / `CleanupPad`.
3. **Mobile bodies still broken** (last observed live 2026-07-19; re-repro at 375 before fixing — not re-verified since): `/rag/data-stores` split-pane bleeds off a 375 viewport (`RichMemberTable`); `RagHitCard`'s action-icon strip scrolls horizontally inside its own card; `/agent-connections` Resources filter-tab row wraps mid-word; `/tasks/new` success toast overlaps the shell header.
4. **Width sweep second pass** — each agent was capped at ~8 files. Re-run the `max-w-2xl|3xl` grep over `app/(core)` and finish the tail.
5. **`/messages/[conversationId]` crashes on load** — realtime presence-callback error (`useOnlinePresence` in `app/(core)/messages/[conversationId]/page.tsx`). **Unconfirmed since 2026-07-19** — a realtime pass landed after this was filed; repro before working it. Invoke the `supabase-realtime` skill.
6. **Open defects from this campaign, tracked in `FOUND_DEFECTS.md`:** D73 (folder-picking canonical story), D74 (`web.link_edge.http_status` never populated), D76 (mount-time state-update warning on `/scraper` and `/`). D72 (/files share-link race) and D75 (transcripts nested button) were fixed 2026-07-28.
7. `app/(core)/education/**` — owned by the education session; leave alone.
8. **Audit blind spot:** `pnpm check:page-headers` and the grep below scan `app/(core)` only — a route's `features/` half is invisible. Known offender: `features/war-room/components/room/WarRoomShell.tsx` (banned `h-[calc(100vh-2.5rem)]` + in-body header). Tracked in `docs/handoffs/war-room-list-and-room-conformance.md`. "Zero in (core)" below means zero in the `app/` tree, not in feature components.

## Done

- Headers: skill + `EntityModeHeader`/`CrumbTrailHeader` + `TapTargetButtonDestructive`; every `(core)` family fixed and browser-verified. **Faux headers and banned heights in `(core)`: zero** — re-verified 2026-07-28 (`pnpm check:page-headers` reports no `app/(core)` offender; the only banned-height hits are the excluded `education/**` pages). The audit does flag five `app/(public)/seo/*` pages — outside this campaign's `(core)` scope, unclaimed.
- Mobile primitives: `MobilePanelShell`; `MatrxDataTable` mobile scroll + frozen first column (`610b752e5`); **`components/official/mobile-table/mobileTable.ts`** for bespoke tables (2026-08-09) — every hand-copied width/freeze string in the repo now consumes it.
- Raw-table sweep: ~60 bespoke tables treated across six batches (rag, notes, agents, files, research, scopes, organizations, code, tool-viz, marketing, podcasts, surfaces, content-ir, reports, kg-suggestions, page-extraction, legal, ai-models, admin). Two hover-only row-action strips (note + agent version history), unreachable on touch, fixed en route.
- Multi-pane routes onto `MobilePanelShell`: /code, /agent-connections, /user-settings, /transcripts studio+cleanup, RAG DocumentViewer. (/notes and /tasks already had native mobile views — verified, left alone; /notes deep-link-to-editor bug fixed en route.)
- Width sweep applied across agents/agent-apps, podcast/transcripts/images, organizations/projects/scopes, schedules/cms/rag — `/schedules/[id]` is now full-width two-column.
- /data table toolbar → bottom drawer; /legal calculator header → back+title+More; /images + /images/studio marketing heroes stripped.
