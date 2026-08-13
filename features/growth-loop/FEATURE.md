# Growth Loop — the map of the pipeline, and the run object that drives it

**Status:** active · **Tier:** 2 · **Routes:** `/administration/knowledge/growth-loop` (admin
map) · `/marketing/brands/[brandId]/sites/[siteId]/growth-loop` (a site's live loop) ·
`/marketing/growth-loop/[loopRunId]` (canonical deep link, resolves to the site)

This feature is two halves. `map/` is the **map** — what the pipeline is and where it is
broken. `run/` is the **run object** — one durable loop for one site, moving through the same
twelve stages. They share ONE stage vocabulary (`map/loop-map.ts`); the run half never names
a stage of its own.

## What this is

The twelve-stage loop the platform runs on — **research → plan → brief → realize → fill →
publish → serve → crawl → measure → analyze → suggest → write-back** — rendered as an
interactive map, with every connection scored on **THE THREE PIPES** (code / human / AI) and
every open gap registered.

It exists because the pipeline spans three repos and two Supabase projects, so no single
`FEATURE.md` could show whether it actually connects end to end.

- **Vision (Arman's words, 2026-08-09):** `common-docs/systems/growth-loop/VISION.md`
- **System of record:** `common-docs/systems/growth-loop/FEATURE.md`
- **Gap campaign + lanes:** `common-docs/projects/growth-loop-gaps/PLAN.md`

## 🚨 `map/loop-map.ts` is the single source of truth

`features/growth-loop/map/loop-map.ts` holds the stages, connections, per-pipe status and the
`G-*` gap register. **It is the ONLY place any of those statuses live** — the cross-repo docs
point here and never restate them.

Rules (also stated at the top of the file):

1. A `state` other than `"missing"` carries a `ref` an auditor can open and verify. Status
   reflects **live code**, never intent.
2. **Filling a gap = flipping its pipe state in `loop-map.ts` in the same change as the code.**
3. Never delete a gap id — close it with `status: "closed"` and an `evidence` path.
4. A scheduled Codex auditor re-derives this from live code and will re-open a gap whose
   evidence doesn't hold (`common-docs/systems/growth-loop/CODEX_OPERATOR.md`).

## Structure

| File                                                        | Role                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `map/loop-map.ts`                                           | Pure data + helpers. No React, no imports from the app.                       |
| `components/GrowthLoopCanvas.tsx`                           | The ONE `next/dynamic({ ssr: false })` front door.                            |
| `components/GrowthLoopCanvasImpl.tsx`                       | React Flow canvas + custom stage node + detail rail.                          |
| `features/canvas/edges/rounded-orthogonal-path.ts`          | Shared rounded waypoint path builder used for collision-free fixed-map lanes. |
| `app/(admin)/administration/knowledge/growth-loop/page.tsx` | Admin route.                                                                  |
| `run/api.ts`                                                | Contract-bound wrappers over aidream's `/growth-loop/*`. The ONLY read path.   |
| `run/hooks.ts`                                              | React Query bindings + the delta-poll of the loop's event ledger.              |
| `run/stage-doors.ts`                                        | Ref-kind → URL, and stage → "where a human does this". THE DOOR LAW.          |
| `run/components/`                                           | Workspace, stage rail, blocker card, ledger.                                   |

## The run object — rules

- **Reads go through aidream, on purpose.** The `growth` schema is not in this project's
  PostgREST exposure list, so `supabase.schema("growth")` returns `PGRST106` and there is
  exactly ONE reachable path. Do not add a second candidate. The conditions for moving reads
  direct — and the two security holes that must be fixed in the same change — are written in
  `G-ORCHESTRATOR-READ` in `map/loop-map.ts`.
- **Starting is explicit and idempotent.** One live loop per site is a DB partial unique
  index, so the button needs no guard: a second click returns the same loop.
- **The pipe defaults are aidream's, never the client's.** `pipe_policy` is omitted on start
  so `growth_loop/pipes.py default_policy()` decides — human first, AI after an hour, with
  realize/serve/crawl/measure pinned to code. Never restate that policy here or in the UI.
- **A running loop is never a spinner.** An active loop re-reads its state and delta-polls its
  ledger on the gap-free `after_seq` cursor; a settled loop stops polling entirely.
- **Every ref kind is a compile-time obligation.** `Record<StageRefKind, …>` in
  `run/stage-doors.ts` means a kind added on the server fails the build here rather than
  rendering an id nobody can open. A kind with no viewer shows its label and no id.

## Doctrine

- **Code-splitting:** React Flow is heavy and browser-only. It is imported **statically inside
  the Impl**, which sits behind exactly one dynamic front door — per the `code-splitting` skill,
  rule 3. The surface is registered in `eslint.config.mjs`'s `reactFlowStaticImportBan` comment
  block; the two import lines carry justified disables. Never add a second boundary here.
- **Reuse-first:** the map reuses the repo's React Flow conventions (`SetBuilderCanvasImpl` as the
  exemplar), semantic color tokens, and the admin route/nav registration pattern. It introduces no
  new graph library, no new state store, and no new suggestion or status system.
- **No dead ends:** every pipe entry renders its `ref` path so a reader can go straight to the
  code. When a gap gains an owner, its lane is shown on the gap card.
- **Collision-free routing:** every connection owns a unique source and target handle. The two
  cross-loop feedback connections use explicit outer lanes through the shared rounded orthogonal
  path builder; adding an unconfigured edge fails loudly instead of falling back to overlapping
  automatic geometry. Clicking a stage traces its immediate incoming and outgoing connections,
  emphasizes the connected stages, and suppresses unrelated paths.

## Change log

- 2026-08-13 — claude: **the HUMAN pipe of the run object shipped** (`run/`). A site owner can
  start their site's loop, see which of the twelve stages it is on, see the blocker in plain
  English, and continue / skip / pause / re-check it. `G-ORCHESTRATOR` narrowed from
  `["code","human","ai"]` to `["code","ai"]` — what remains is that no stage service advances
  the loop on its own and no agent runs a stage. New gap `G-ORCHESTRATOR-READ` records why
  reads are not direct-to-Supabase and the two security defects that must be fixed before
  `growth` is exposed to PostgREST.
- 2026-08-12 — Codex: replaced implicit smooth-step routing with per-connection handles and
  dedicated rounded outer lanes for both cross-loop feedback paths. Stage selection now traces
  every direct incoming/outgoing connection and dims unrelated stages and arrows; arrow selection
  highlights both endpoints. Canvas clicks clear the trace.

- 2026-08-13 — claude: re-audit after an agent proposed dropping `growth.*` as unused. **Root
  cause found and fixed:** `growth_loop` was the only one of aidream `app.py`'s 138 routers never
  mounted, so 3,209 rescued lines were unreachable — mounted now (13 routes, `/api/growth-loop/*`).
  Four gaps closed against live scheduler evidence (`G-PUBLISH-CRAWL` 198 runs/0 failed,
  `G-RESEARCH-TRIGGER` 394/2, `G-TEMPLATE`, `G-PLAN-STATUS`); the "`pipes.py` is a competing fork"
  claim retracted as **false** — it is a pure resolver that refuses to execute by design. Doc set
  collapsed five → four: `HANDOFF.md` deleted (its narrative status is what fed the drop
  proposal), its durable content folded into the campaign PLAN. Settled decisions (pipe default,
  1h escalation, explicit loop start) recorded in the system doc so no agent re-asks them.
- 2026-08-12 — claude: full verification audit (five parallel auditors + live DB + deployment
  checks) after the first chip wave. Corrected all 20 gap entries against SHIPPED code rather than
  docs or commit messages, and added **rule 1b** to `loop-map.ts`: _"live" means SHIPPED_ — code in
  a working tree is `in-progress`, never `live`. That rule exists because its absence let ~10 gaps
  sit fully built on one laptop (several with their migrations already applied to the live
  database) while the map showed no movement. Closed and evidenced: sitemap/robots (live-verified
  200), server-rendered collections, the findings→assists ledger producer. Still true at audit
  time: the growth-loop router is unmounted, the pipe primitive's AI leg is unwired and forked, the
  human-escalation sweeper has no caller, and aidream's deployed server is 13 commits behind so
  publish→crawl, templates, research triggers and GA4 are committed but not running.

- 2026-08-11 — Codex: corrected the Measure pipe and `G-MEASURE-SCHEDULE` after PageSpeed gained a live resumable ten-minute coverage scheduler; the remaining scheduling gap is GA4 only.
- 2026-08-09 — claude: feature created. Loop mapped from live code by six parallel explorers
  (research, content-plan, CMS, crawler/SEO, suggestions/write-back, workflow substrate);
  `loop-map.ts` seeded with 12 stages, 14 connections, 20 gaps, 6 lanes; React Flow map shipped
  and browser-verified at `/administration/knowledge/growth-loop`.
