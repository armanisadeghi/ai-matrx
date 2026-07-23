---
status: active
updated: 2026-07-19
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
- **Primitives — consume, never hand-roll:** `features/shell/components/header/templates/` → `EntityModeHeader` ([id] routes), `CrumbTrailHeader` (drill-downs), `MobilePanelShell` (any multi-pane route: pass the existing desktop layout verbatim + `main` + `panels`). `components/official/matrx-data-table/MatrxDataTable.tsx` handles mobile table scroll for every consumer.
- **CSS trap, do not rediscover:** `app/globals.css` has an UNLAYERED mobile block (`@media max-width:768px`) with `* { max-width:100% }` and `table { display:block; overflow-x:auto; max-width:100% }`. Unlayered CSS beats Tailwind's layered utilities (so `max-w-none` as a class cannot win) and the TABLE element is the scroller, not its container. Also a base `w-full` outranks `max-sm:w-max` — write width rules mobile-first.
- Audits (keep at zero): `pnpm check:page-headers`; `grep -rln "calc(100dvh\|calc(100vh\|h-screen\|h-page" "app/(core)" --include="*.tsx"`.
- Verify: dev server + `/api/dev-login?token=<DEV_LOGIN_TOKEN>&next=/<route>`, at 375 AND 1280.

## Remaining work

1. **Raw-table sweep — 68 files left.** Wave-3 did 4 surfaces under a deliberate cap. Apply the same frozen-first-column treatment (or migrate the table to `MatrxDataTable` and get it free). Full list: `grep -rl "<table" app/\(core\) features`.
2. **`MobilePanelShell` gap: drawers don't close on in-panel ACTIONS.** It auto-closes on route change, but a panel action that isn't navigation (transcripts studio: pick a session / Clean Up / create session) leaves the drawer covering the result. Add an opt-in close callback to the primitive and adopt it in `StudioSidebar` / `CleanupPad`.
3. **Mobile bodies still broken** (verified live, out of the capped scope): `/rag/data-stores` split-pane bleeds off a 375 viewport (`RichMemberTable`); `RagHitCard`'s action-icon strip scrolls horizontally inside its own card; `/agent-connections` Resources filter-tab row wraps mid-word; `/tasks/new` success toast overlaps the shell header.
4. **Width sweep second pass** — each agent was capped at ~8 files. Re-run the `max-w-2xl|3xl` grep over `app/(core)` and finish the tail.
5. **`/messages/[conversationId]` crashes on load** — realtime presence-callback error. Owned by the messaging refactor; invoke the `supabase-realtime` skill.
6. **Defects D72–D76** are filed in `FOUND_DEFECTS.md` — **D72 is P0 data exposure** (a plain row click on the /files desktop table can create a real share link). Needs a live repro of the hover/click race in `features/files/components/surfaces/desktop/FileTableRow.tsx`.
7. `app/(core)/education/**` — owned by the education session; leave alone.
8. **Audit blind spot:** `pnpm check:page-headers` and the grep below scan `app/(core)` only — a route's `features/` half is invisible. Known offender: `features/war-room/components/room/WarRoomShell.tsx` (banned `h-[calc(100vh-2.5rem)]` + in-body header). Tracked in `docs/handoffs/war-room-list-and-room-conformance.md`. "Zero in (core)" below means zero in the `app/` tree, not in feature components.

## Done

- Headers: skill + `EntityModeHeader`/`CrumbTrailHeader` + `TapTargetButtonDestructive`; every `(core)` family fixed and browser-verified. **Faux headers and banned heights in `(core)`: zero.**
- Mobile primitives: `MobilePanelShell`; `MatrxDataTable` mobile scroll + frozen first column (`610b752e5`).
- Multi-pane routes onto `MobilePanelShell`: /code, /agent-connections, /user-settings, /transcripts studio+cleanup, RAG DocumentViewer. (/notes and /tasks already had native mobile views — verified, left alone; /notes deep-link-to-editor bug fixed en route.)
- Width sweep applied across agents/agent-apps, podcast/transcripts/images, organizations/projects/scopes, schedules/cms/rag — `/schedules/[id]` is now full-width two-column.
- /data table toolbar → bottom drawer; /legal calculator header → back+title+More; /images + /images/studio marketing heroes stripped.
