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
- **Primitives — consume, never hand-roll:** `features/shell/components/header/templates/` → `EntityModeHeader` ([id] routes), `CrumbTrailHeader` (drill-downs), `MobilePanelShell` (any multi-pane route: pass the existing desktop layout verbatim + `main` + `panels`; a non-navigation in-panel action closes the drawer with `useMobilePanelClose()`). `components/official/matrx-data-table/MatrxDataTable.tsx` handles mobile table scroll for every consumer.
- **CSS trap, do not rediscover:** `app/globals.css` has an UNLAYERED mobile block (`@media max-width:768px`) with `* { max-width:100% }` and `table { display:block; overflow-x:auto; max-width:100% }`. Unlayered CSS beats Tailwind's layered utilities (so `max-w-none` as a class cannot win) and the TABLE element is the scroller, not its container. Also a base `w-full` outranks `max-sm:w-max` — write width rules mobile-first.
- Audits (keep at zero): `pnpm check:page-headers`; `grep -rln "calc(100dvh\|calc(100vh\|h-screen\|h-page" "app/(core)" --include="*.tsx"`.
- Verify: dev server + `/api/dev-login?token=<DEV_LOGIN_TOKEN>&next=/<route>`, at 375 AND 1280.

## Remaining work

1. **Raw-table sweep — 92 files left** (recounted 2026-07-28; it has GROWN since the campaign started, so new tables are still landing raw). Wave-3 did 4 surfaces under a deliberate cap. Apply the same frozen-first-column treatment (or migrate the table to `MatrxDataTable` and get it free). Full list: `grep -rl "<table" app/\(core\) features`.
2. **Width sweep second pass** — each agent was capped at ~8 files. Re-run the `max-w-2xl|3xl` grep over `app/(core)` and finish the tail.
3. **`/messages/[conversationId]` crashes on load** — realtime presence-callback error (`useOnlinePresence` in `app/(core)/messages/[conversationId]/page.tsx`). **Unconfirmed since 2026-07-19** — a realtime pass landed after this was filed; repro before working it. Invoke the `supabase-realtime` skill.
4. **Open defects from this campaign, tracked in `FOUND_DEFECTS.md`:** D73 (folder-picking canonical story), D74 (`web.link_edge.http_status` never populated), D76 (mount-time state-update warning on `/scraper` and `/`). D72 (/files share-link race) and D75 (transcripts nested button) were fixed 2026-07-28.
5. `app/(core)/education/**` — owned by the education session; leave alone.
6. **Audit blind spot:** `pnpm check:page-headers` and the grep below scan `app/(core)` only — a route's `features/` half is invisible. Known offender: `features/war-room/components/room/WarRoomShell.tsx` (banned `h-[calc(100vh-2.5rem)]` + in-body header). Tracked in `docs/handoffs/war-room-list-and-room-conformance.md`. "Zero in (core)" below means zero in the `app/` tree, not in feature components.

## Done

- Headers: skill + `EntityModeHeader`/`CrumbTrailHeader` + `TapTargetButtonDestructive`; every `(core)` family fixed and browser-verified. **Faux headers and banned heights in `(core)`: zero** — re-verified 2026-07-28 (`pnpm check:page-headers` reports no `app/(core)` offender; the only banned-height hits are the excluded `education/**` pages). The audit does flag five `app/(public)/seo/*` pages — outside this campaign's `(core)` scope, unclaimed.
- Mobile primitives: `MobilePanelShell`; `MatrxDataTable` mobile scroll + frozen first column (`610b752e5`).
- Multi-pane routes onto `MobilePanelShell`: /code, /agent-connections, /user-settings, /transcripts studio+cleanup, /rag/data-stores, RAG DocumentViewer. (/notes and /tasks already had native mobile views — verified, left alone; /notes deep-link-to-editor bug fixed en route.)
- Width sweep applied across agents/agent-apps, podcast/transcripts/images, organizations/projects/scopes, schedules/cms/rag — `/schedules/[id]` is now full-width two-column.
- /data table toolbar → bottom drawer; /legal calculator header → back+title+More; /images + /images/studio marketing heroes stripped.
- **Mobile bodies + the drawer-close gap — all five fixed and browser-verified at 375px (2026-08-09).** `MobilePanelShell` grew **`useMobilePanelClose()`** (a context hook; no-op outside a drawer, so the same component is safe in the desktop pane) because the primitive only auto-dismissed on *route* change — every consumer whose action is a `?search_param` write left the drawer covering the result. Adopted in `StudioSidebar` (pick/create session), `CleanupPad` (Clean Up — `handleProcess` now returns whether a run actually started, so a "choose an agent" nudge does NOT close the drawer), and `/rag/data-stores`. Bodies: **`/rag/data-stores`** was a raw `w-80` + `flex-1` split that left a ~55px detail sliver on a phone — now on `MobilePanelShell` (list → "Stores" drawer, detail owns the screen); **`RagHitCard`** expanded header now wraps below `sm` with the score/icon-strip/actions cluster on its own right-aligned row (unfixed, the fixed-width cluster squeezed the text column to ONE CHARACTER per line); **`/agent-connections` Resources** filter chips got `shrink-0 whitespace-nowrap` + an `overflow-x-auto` rail (the global mobile `word-break: break-word` was wrapping "Reference" mid-word); **`/tasks/new`** body gained `pt-[var(--shell-header-h)]` so the post-save success banner stops rendering behind the glass header. New fixture page **`/demos/rag-hit-card`** renders the canonical card from fixtures — use it for hit-card layout work instead of needing live indexed content plus a reachable retrieval backend.
