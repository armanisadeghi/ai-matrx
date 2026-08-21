# Growth Loop — the map of the pipeline, and the run object that drives it

**Status:** active · **Tier:** 2 · **Routes:** `/administration/knowledge/growth-loop` (admin
map) · `/how-it-works` (public, the long read) · `/loop` (public, above the fold) ·
`/marketing/brands/[brandId]/sites/[siteId]/growth-loop` (a site's live loop) ·
`/marketing/growth-loop/[loopRunId]` (canonical deep link, resolves to the site)

This feature is three halves. `map/` is the **map** — what the pipeline is and where it is
broken. `public/` is the **customer-facing face of that same map**. `run/` is the **run
object** — one durable loop for one site, moving through the same twelve stages. They share
ONE stage vocabulary (`map/loop-map.ts`); no other half ever names a stage of its own.

## What this is

The twelve-stage loop the platform runs on — **research → plan → brief → realize → fill →
publish → serve → crawl → measure → analyze → suggest → write-back** — rendered as an
interactive map, with every connection scored on **THE THREE PIPES** (code / human / AI) and
every open gap registered.

It exists because the pipeline spans three repos and two Supabase projects, so no single
`FEATURE.md` could show whether it actually connects end to end.

- **Vision (Arman's words, 2026-08-09):** `common-docs/systems/marketing/growth-loop/VISION.md`
- **System of record:** `common-docs/systems/marketing/growth-loop/FEATURE.md`
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
   evidence doesn't hold (`common-docs/systems/marketing/growth-loop/CODEX_OPERATOR.md`).

## Structure

| File                                                        | Role                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `map/loop-map.ts`                                           | Pure data + helpers. No React, no imports from the app.                       |
| `components/GrowthLoopCanvas.tsx`                           | The ONE `next/dynamic({ ssr: false })` front door.                            |
| `components/GrowthLoopCanvasImpl.tsx`                       | React Flow canvas + custom stage node + detail rail.                          |
| `features/canvas/edges/rounded-orthogonal-path.ts`          | Shared rounded waypoint path builder used for collision-free fixed-map lanes. |
| `app/(admin)/administration/knowledge/growth-loop/page.tsx` | Admin route.                                                                  |
| `public/GrowthLoopStory.tsx`                                | The public page body. Server component — every word is in the server HTML.    |
| `public/GrowthLoopRing.tsx`                                 | The loop drawn as a ring. The page's ONE client island; inline SVG, no deps.  |
| `public/stage-cards.ts`                                     | The resolved public stage model, shared by the ring and the cards.            |
| `public/stage-icons.ts`                                     | Lucide icon NAME -> component, so `loop-map.ts` stays React-free.             |
| `app/(public)/how-it-works/page.tsx`                        | Public route (+ metadata / OG).                                               |
| `public/GrowthLoopGlance.tsx`                                | The above-the-fold page body. Same data, a fraction of the words.             |
| `app/(public)/loop/page.tsx`                                | Above-the-fold public route (+ metadata / OG).                                |
| `run/api.ts`                                                | Direct Supabase reads; contract-bound aidream orchestration actions.          |
| `run/hooks.ts`                                              | React Query bindings + the delta-poll of the loop's event ledger.             |
| `run/stage-doors.ts`                                        | Ref-kind → URL, and stage → "where a human does this". THE DOOR LAW.          |
| `run/components/`                                           | Workspace, stage rail, blocker card, ledger.                                  |

## The run object — rules

- **Reads go direct to Supabase.** `run/api.ts` reads the invoker-safe
  `growth.v_loop_state`, `growth.loop_stage_run`, and `growth.loop_event` under the caller's
  JWT. Actions go to aidream because they orchestrate work. Never add a fallback ladder or
  route a plain read back through Python.
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
- **Quality is history, never a gate.** Completed attempts are re-read alongside the
  gap-free event delta because aidream scores only after it advances. The completion line
  updates in place from `Scoring…` to `<score>/100` (or a loud failure), shows the judge's
  reasoning, and links to the referenced artifact. Internal run kinds with no viewer fall
  back to that stage's working surface, so a weak score is never a dead end.
- **An unmeasurable page is an outcome, not a dead loop.** A completed measure attempt whose
  server outcome is `terminal_unmeasurable` renders the affected page through the canonical
  `web_page` `EntityRef`, explains the PageSpeed reason and quarantine expiry, and offers one
  click to the canonical `seo.release_page_measurement_quarantine` RPC. The client never
  classifies provider errors or invents a second release path.

## The public view — rules

**Two public pages, one map, deliberately different jobs.** `/how-it-works`
(`GrowthLoopStory`) is the long read — every step explained. `/loop`
(`GrowthLoopGlance`) is the above-the-fold pitch: the loop is the first thing on the
screen, it ends at the fold on a desktop, and nothing is said in a sentence that a
label can say. Neither replaces the other, and **neither may fork the data** — both
render `publicStages()` / `publicCapabilities()` / `publicStanding()` and share the
one ring (`GrowthLoopRing`, `variant="story" | "glance"`). New public face? Add a
variant, never a second copy of the stages.

Both are presentation only over the SAME `loop-map.ts`: they select, rename and derive.
Neither ever restates a stage.

- **THE HONESTY GATE.** Capability is derived from `state === "live"` ONLY (`publicCapabilities`
  / `publicStanding`). `partial` and `missing` render NOTHING — a stage with no live pipe simply
  shows no chips. The only way to make the marketing page claim a capability is to flip a pipe
  here, which rule 1 says requires a `ref` an auditor can open. **Never add a fallback.**
- **`publicInfo` is the show-publicly flag.** A stage without one never renders publicly. Its
  copy rules (no jargon, no internal stage names, one sentence, never intent) are on the type.
- **The chips say CAN, never DOES.** The code pipe means "runnable unattended", not "fires by
  itself" — writing it as "it happens automatically" contradicted Publish, whose selling point
  is that nothing goes live unapproved.
- **What never crosses over:** file paths, `ref`s, gap ids, lanes, repo names, maturity, and the
  words "partial" / "missing".
- **No React Flow.** A fixed twelve-node ring needs no graph engine, and a pan/zoom canvas is the
  wrong product on a phone. The ring is inline SVG + real `<button>`s, so it needs no
  `next/dynamic` boundary at all; it is hidden below `md`, where the numbered cards are the
  mobile presentation of the same sequence.

## Doctrine

- **Code-splitting:** React Flow is heavy and browser-only. It is imported **statically inside
  the Impl**, which sits behind exactly one dynamic front door — per the `code-splitting` skill,
  rule 3. The surface is registered in `eslint.config.mjs`'s `reactFlowStaticImportBan` comment
  block; the two import lines carry justified disables. Never add a second boundary here.
- **Reuse-first:** the map reuses the repo's React Flow conventions (`OrchestraBuilderCanvasImpl` as the
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

- 2026-08-15 — Codex: **`G-MEASURE-SCHEDULE` CLOSED and the Measure code pipe is live.**
  Live scheduler evidence confirms PageSpeed runs every ten minutes and GA4 runs daily. The
  Growth Loop no longer rewinds when scheduled PageSpeed pages finish, terminal PSI failures
  reuse the canonical quarantine classifier, and GA4's remaining Google API-disabled error is
  reported as provider configuration rather than mislabeled as missing scheduling. Loop history
  now links the affected page and exposes the existing release RPC as its one-click recovery.

- 2026-08-14 — claude: **second public face at `/loop`** — the above-the-fold version, at
  Arman's request, beside (not instead of) `/how-it-works`. The ring gained a `glance`
  variant rather than being forked. Also fixed the **site-wide public header**, which stood
  at 51px with 44px controls while the app's own shell header is 40px: sizing now lives in
  ONE place (`components/matrx/publicHeaderChrome.ts`) and is responsive — full 44px touch
  targets on a phone, the shell's own height on a pointer. Header is 51px -> 43px on every
  public page. Note for the record: the oversized-looking control at the far right is
  admin-only and invisible to a signed-out prospect.

- 2026-08-14 — claude: **the public view completed.** The loop is now drawn as a ring
  (`public/GrowthLoopRing.tsx`) instead of only listed as twelve cards — a prospect sees that it
  is a cycle, not a checklist. The ring and the cards now share ONE resolved model
  (`public/stage-cards.ts`). Two honesty defects fixed in `loop-map.ts`: the code-pipe chip said
  "It happens automatically", which flatly contradicted Publish's own sentence ("nothing becomes
  public on its own") — the chip now says "It can run on its own" and Publish's copy names both
  routes. The standing figure's label was narrowed from "already run on their own, with nobody
  watching" to what the code pipe actually records. This section and the Structure table were
  added; the public half had shipped on 2026-08-11 undocumented here.

- 2026-08-13 — Codex: completed-stage quality judgments are visible in the loop history.
  The direct Supabase read folds current `loop_stage_run.outcome.quality` into its matching
  completion event, merges by event id as the asynchronous score arrives, explains why the
  output earned its score, and opens the output or its canonical stage surface.

- 2026-08-13 — Codex: **post-brief server recording wired.** Realize, fill,
  publish, crawl, measure, and analyze now record themselves against their own
  durable pointers. `cms_page` and `seo_collection_run` are compile-time door
  obligations. Serve has no aidream event; suggest and actual write-back remain
  direct client-side producers and are named as such rather than recorded early.
- 2026-08-13 — Codex: **`G-ORCHESTRATOR-READ` CLOSED.** Canonical RLS now gives stage/event
  components their parent loop's access, `v_loop_state` is `security_invoker`, anonymous
  schema access is revoked, and `growth` is safely exposed to PostgREST. Real-user proof: the
  creator sees 1 run / 3 stages / 7 events; an unrelated non-admin with no target-org
  membership sees 0 / 0 / 0. Loop state and history now read direct from Supabase; actions
  remain on aidream.
- 2026-08-13 — claude: **`G-FINDING-FIX` CLOSED — the write-back half of the loop connects on
  all three pipes.** AI: `scripts/seed_finding_fixer.py` (aidream) creates the purpose-built
  system agent `seo_finding_fixer_v1`, seeds + activates its two Content-IR kinds, and pins the
  slot `seo.finding_fixer`, which is now reachable at `POST /seo/findings/draft-fix`. CODE:
  `planDeterministicFix` drafts the derivable class with zero model calls and the findings assist
  producer upgrades those chips to the new `apply_page_meta` action. HUMAN: `FindingFixCard`
  shows before/after plus risks behind one Apply-as-a-draft button. All three land through the
  seams that already existed (`updatePageIntent` + `executeCmsPush`), writing draft twins only —
  nothing publishes and no route moves.
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
