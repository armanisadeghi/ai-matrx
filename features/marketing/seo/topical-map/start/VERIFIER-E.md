# VERIFIER-E — zero-authorship verification brief for Lane E (dispatch: model `claude-sonnet-5`, lane `standard`)

You did not build this. Your job is to return what the builder does not already believe. You may not inherit the builder's file list as your frame: start from the owner's words and the plan, then go to the code and the live surface.

## What you verify against (read in this order, fully)

1. The owner's vision, §2.6 and §6 (acceptance): `/Users/armanisadeghi/code/common-docs/inbox/topical-map-app-requirements.md`.
2. The plan's Lane E brief and rulings R2, R3, R7, R8, R14: `/Users/armanisadeghi/code/common-docs/projects/table-provisioning/TOPICAL-MAP-UI-PLAN.md` (§3, §6 "E — Home, start-a-map, sharing, entry points").
3. The placement's seven link-in points, §7: `/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-16/topical-map-placement.md`.
4. The frozen contracts: `/home/user/ai-matrx/features/marketing/seo/topical-map/CONTRACTS.md` (§0, §1, §2, §6, §9).
5. The wire the screen must obey, every comment: `features/marketing/seo/topical-map/map-author.ts`, `useAuthorTopicalMap.ts`.
6. Only THEN the builder's walk: `features/marketing/seo/topical-map/start/VERIFY-E.md` — treat its "owed" list as claims to attack, not as excuses.

Environment: repo `/home/user/ai-matrx`, branch `claude/tender-gates-5qcxnd` (pull first; the builder's commits are titled "Topical map Lane E: …"). If a machine with the app is available to you, run the VERIFY-E walk with dev-login and record the build SHA; if not, say so in the first line and do the static half only. The Supabase MCP (project `brsgrqvjdzwihsvnfqkf`) is allowed for READS that prove a claim (e.g. `select sites_using_map from seo.map_diagnostics(...)`); never write through it.

## What "done" means for this lane (the acceptance you hold it to)

- From a brand with a profile, a map is generated and visible; each of the seven entry points opens the map; a record-only grantee sees it read-only, brand-free (vision U4 done-check; acceptance §6 steps 1 and 7).
- Every count on the home is a door and is never printed before its read lands (absent ≠ zero).
- `applied:false` with zero topics renders `coverage_notes`, never an error; `new_research` says the research started and authors nothing; `ask` is answered ON the screen before any paid call; every launch states its consequence and that it is paid.
- Emphasis rides `emphasis` (→ `user_input` on the server); nothing structured rides it.
- No hand-built map URL anywhere the lane touched (CONTRACTS §2 — `marketingRoutes` / `useMapLinks` / `startMapHref` only); no hand-typed mandate key (`MANDATE_KEYS.seo__map_author`).
- The read-only door renders the REAL views through `MapLinkProvider brand={null}` + `readOnly`, not a text dump.

## Attacks to run (each yields pass / fail with evidence, or "cannot run here — why")

1. Grep the lane's files for `/marketing/` string literals that build a map address by hand, for `Sparkles`, for `window.confirm`, for `sonner` imports, for a mandate-key literal. Report any hit with file:line.
2. `pnpm type-check` (0 errors in files under `features/marketing/seo/topical-map/{start,linkins,door,components/TopicalMapHome*}`, `app/(core)/marketing/topical-maps/**`, and the seven link-in files; repo total ≤ the 148 baseline) — run when memory allows (the box OOM-kills a second `tsc`; check `ps` for other lanes' runs first). `pnpm check:parse`, `pnpm check:dead-ends`, `pnpm check:agent-disclosure`, `pnpm check:mandate-keys`, `pnpm check:page-headers` (no topical-map finding), `npx jest features/marketing/seo/topical-map --no-coverage`. Paste each verbatim tail.
3. Read `start/StartMapScreen.tsx` against `authorTopicalMapBody`: can any tile send a sibling tile's field? Can `ask` reach the server? Is there any path where the launch fires without the dialog? Is `siteId` sent for a non-`data` source?
4. Read `components/TopicalMapHome.tsx`: does the single-map bounce trap the header's back link in a fresh tab? (It will — by knob design. Judge whether the honest remedy is acceptable or should be escalated: a `?home` escape on the header's back link is coordinator-owned.)
5. Read `components/TopicalMapHomeCard.tsx`: find a number rendered while `diagnostics.isPending`. Find a door that leads to a screen that does not answer the count (e.g. "Empty topics" → table: does the table show emptiness?). Check `pages_on_no_topic` is never shown map-wide.
6. Read the seven link-in edits for a dead control: a button or menu item that would 42501, a "no map" that prints as 0, a cell that hides a real link. In `linkins/useKeywordMapHomes.ts`, confirm the read is bounded to the page's keyword ids and the site (THE VIEW LAW) and that a keyword whose home topic is not in the map's rows reads as "not homed", not as a crash.
7. Read `door/TopicalMapDoorBody.tsx` + the door page: confirm no write control can render under `readOnly` in the views that exist today (Phase 0 views + whatever lanes A–G have landed). If a view ignores `readOnly`, name the view — it is that lane's defect, but the door exposes it.
8. If you can run the app: execute VERIFY-E §1–§6 on the named brands; one deliberately failed RPC screenshot with the function's own sentence; mobile 375×812; light and dark; a record-only grantee through the share door; a non-member refused with the same denial as a nonexistent id.

## Report shape

First line: `VERIFIED` / `VERIFIED_WITH_CONCERNS` / `FAILED` + the build SHA you tested. Then: every attack with its result and evidence (command + tail, file:line, or screenshot reference); what you could NOT verify and why; the list of things the builder did not already believe (this is the deliverable — an empty list is suspicious and should say what you tried). Never fix what you find; name it.
