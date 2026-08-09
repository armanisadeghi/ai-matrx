---
status: active
updated: 2026-08-09
repos: [matrx-frontend]
vision: [features/war-room/FEATURE.md, .claude/skills/core-route-headers/SKILL.md]
---

# War Room — list + room pages conformant (done) → deeper thread search (decision pending)

## Vision — Arman's words

On the `/war-room` route header + the list page (session 1):

> "Please look up the skill for fixing site headers and then make sure you fix the war room route's header. Additionally, on the main war room page, I want you to set it up to have the option of seeing Rooms or Threads. Threads should most likely use our Canonical Matrx Table component with proper sorting, filtering and all of that. Let's get this right."

On the room cards (session 2):

> "the cards we show for the War room items need to be more informative with very basic information. For example, the simplest missing number is the count of 'threads' which should clearly be shown, along with anything else that's important enough to be included without cluttering it with junk"

On the individual room page `/war-room/[id]` (session 3):

> "This page suffers slightly from what I would call an identity crisis in that although the top row and the left section are intended to be all about the war room itself, I feel like some of the options are a bit confused about what they do, including the little shortcuts at the top that I can only imagine will [sic] it only work for a specific thread. Things like search, stage, and grid appear to be for everything. You just have to confirm that they truly are. And for everything else, I need you to go through and just make sure that they make sense and that they are truly about everything in the room and not just one specific thread."

**Standing principle (inferred, from FEATURE.md):** the room is a **cockpit** — every top-row/rail control acts on the WHOLE room, never one thread. The one deliberate exception is the working-context chip (`ActiveContextLensChip`), which is global by design (same control as `/chat`, writes `appContextSlice`).

## Resources

- Feature doc (read first): `features/war-room/FEATURE.md`. Admin map: `/war-room/admin`.
- Header recipe: `.claude/skills/core-route-headers/SKILL.md` + `features/shell/components/header/variants/USAGE.md`. **Invoke the `core-route-headers` skill before touching any header.**
- Templates to consume, not hand-roll: `features/shell/components/header/templates/EntityModeHeader` (the `[id]`-route pattern: back + name dropdown + mode nav + declarative actions, mobile → one `…` bottom drawer). Reference consumer: `/schedules/[id]`.
- Canonical table: `components/official/matrx-data-table/MatrxDataTable.tsx` (mobile scroll + frozen first column come free).
- Room page entry: `app/(core)/war-room/[id]/page.tsx` → `features/war-room/components/room/WarRoomShell.tsx` (the header + body live here).
- List page (the finished reference for how the room page should end up): `features/war-room/components/all/WarRoomAllView.tsx`.
- Thread search internals: `features/war-room/components/room/ThreadSearchBox.tsx` + `features/war-room/hooks/useThreadSearch.ts` (title-only today).
- Verify: dev server + `/api/dev-login?token=<DEV_LOGIN_TOKEN>&next=/war-room/all`, at **375 AND 1280**. Test room "Acme acquisition" has 11 threads + parked threads — good for exercising rail/grid/projector.

## Remaining work

1. **Thread search is title-only; Arman implied he expects more.**
   Re-verified 2026-07-28 — still title-only. `useThreadSearch.ts` ranks by thread title (tile title → anchored task title) and skips parked threads. The room `ThreadSearchBox` and the `/war-room/all` cross-room search share this shallow depth. If deeper search is wanted, extend the searchable projection to description + note/task contents (the projection selector in `useThreadSearch.ts` is the one place to widen; `/war-room/all`'s `useWarRoomAllSearch.ts` mirrors it). **Decision below — confirm scope before building.**

## Done

- **`/war-room/[id]` header conformance (2026-08-09).** In-body `<header>` + `h-[calc(100vh-2.5rem)]` + `pr-14` hack deleted from `WarRoomShell`; chrome injected via new `features/war-room/components/room/RoomHeader.tsx` (`<PageHeader>`, its own `@container` so the label-hiding survives; body `h-full overflow-hidden pt-[var(--shell-header-h)]`). Primaries inline (Stage⇄Grid, search, context chip, Room Agent); projector/density/details/resources/project/delete collapsed into ONE `⋯` menu (details/resources/project open the SAME re-housed surfaces — `RoomIdentityEditor` / `RoomResourcesSheet` / `RoomProjectPickerBody`; their trigger-button wrappers deleted). Mobile = back + title + one `⋯` bottom sheet holding everything. Browser-verified at 1280 / 800 / 375, dark + light. (Campaign trap still stands for OTHER routes: `pnpm check:page-headers` greps `app/(core)` only — the `features/` half of a route is invisible to it.)
- `/war-room/all` header conformance — `PageHeader` + `HeaderToggle` (Rooms | Threads), body `h-full overflow-hidden pt-[var(--shell-header-h)]`; header actions (Master Agent, From project, New) collapse to a mobile bottom sheet. See `features/war-room/components/all/WarRoomAllView.tsx`.
- Rooms | Threads toggle + **Threads view on the canonical `MatrxDataTable`** (sort, per-column filter, search, row "Open" that routes into the parent room or mints one for an orphan) — `features/war-room/components/all/WarRoomThreadsTable.tsx` + `selectThreadTableRows`.
- Informative room cards — thread count (always) + pinned count + project marker (only when present), via `selectRoomCardStats`. See `features/war-room/components/all/SessionCard.tsx`.
- `NewRoomFromProjectButton` → controlled `NewRoomFromProjectDialog` (trigger moved into header actions).
- Room `[id]` identity/scope audit — **every top-row + rail control confirmed room-scoped** (Stage/Grid, Search, instrument projector, density, identity, resources, project, Room Agent all act on the whole room; Quick task defaults to a new sibling thread; context chip is global by design). Only defect found was a stale doc-comment lie about search depth — fixed in `roomViewContext.tsx`.

## Decisions needed

**Thread search depth.** Today search over a room's threads (and the `/war-room/all` cross-room search) matches thread TITLES only and ignores parked/stowed threads. Building deeper search means indexing each thread's description and its note/task text, which is more work and can surface parked threads in results.
**Decide:** (a) leave title-only as-is; (b) add description to the match; or (c) full-text over description + note/task contents, and whether parked threads should appear in matches.
