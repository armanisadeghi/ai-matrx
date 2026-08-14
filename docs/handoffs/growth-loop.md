---
status: active
updated: 2026-08-14
repos: [matrx-frontend, aidream]
vision:
  [
    /Users/armanisadeghi/code/common-docs/systems/growth-loop/VISION.md,
    /Users/armanisadeghi/code/common-docs/systems/growth-loop/FEATURE.md,
  ]
---

# Growth Loop — finish the run, then make it healthy

The twelve-stage loop RUNS. 18 of 21 gaps are closed, five real brands have loops, and the
supervisor advances stages with no human. What remains is health, not capability.

## Vision — Arman's words

> "We have a really incredibly powerful system that starts with research… and then that can be
> turned into template pages that then actually become published pages within our CMS. And then
> the CMS can get crawled by our crawler… It then provides suggestions and improvements that can
> be documented and tracked — and then adding layers where you can trigger updates to the CMS
> from the findings."

> "In an ideal world, we should have something that could go end to end from beginning to end
> **just with a human, or just with an AI**."

> **"Click one thing and have the whole thing done" is the acceptance test for the loop.**

Settled by Arman, 2026-08-13 — **never re-ask these** (full list in the system FEATURE.md
§ "Decisions already made"):

- **Autonomy is a SETTING, never a capability limit.** *"We need the system to allow anything, but
  only when a user absolutely opts in for it… DO not hide the settings though."*
- **Every stage is scored; a score NEVER blocks.**
- **An assist is addressed to ONE person.** *"For suggestions, for now I'd rather just keep them
  for each individual because that's less complicated."* Org-addressed assists are not a gap.
- **`loop-map.ts` stays hand-authored**; the Codex auditor corrects drift.

## Resources

- **Status truth:** `features/growth-loop/map/loop-map.ts` — the ONLY place gap statuses live.
  Rendered at `/administration/knowledge/growth-loop`.
- **Customer view:** `/how-it-works` (live) ← `features/growth-loop/public/`.
- **Run surface:** `/marketing/brands/[brandId]/sites/[siteId]/growth-loop` ←
  `features/growth-loop/run/`.
- **Backend:** `aidream/services/growth_loop/` — `orchestrator.py` (run object), `supervisor.py`
  (advancement), `stages.py` (`track_loop_stage`), `pipes.py` (`default_policy`), `quality.py`
  (scoring), `agent_slots.py`. Router `api/routers/growth_loop.py` → `/api/growth-loop/*`.
- **DB:** `growth.loop_run` / `loop_stage_run` / `loop_event` / `stage_ref_kind` / `v_loop_state`
  (Supabase `txzxabzwovsujtloxrus`). **Read the table comments before writing** — they carry the
  law: a stage attempt stores a POINTER `(ref_kind, ref_id)` and no stage state; a new stage store
  is ONE row in `stage_ref_kind`, never a new column.
- **Method:** THE REACHABILITY LADDER — exists → reachable → deployed → exercised → produced.
  In `/Users/armanisadeghi/code/common-docs/policies/unfinished-work-alarm.md` and the auditor
  brief. **If you cannot name the caller, it is not done.**
- **Auditor:** `/Users/armanisadeghi/code/common-docs/systems/growth-loop/CODEX_OPERATOR.md`.
- Test login: `admin@admin.com` / `Password1234#`. Dev server: `pnpm preview:start` (port 3001).

## Remaining work

1. **Supervisor is sick — 1,916 of 2,150 runs failing.** 1,913 are ONE loop
   (`26560438-08ff-40dc-ae58-b37de3d8d7d7`) throwing `InterfaceError: cannot perform operation:
   another operation is in progress` every 30s since 02:51 — an asyncpg connection reused
   concurrently, not a logic fault. Fix the concurrency AND the fact that one row can fail 1,913
   times silently. `aidream/services/growth_loop/supervisor.py`.
2. **Scheduled tasks — mostly closed 2026-08-14; ONE external blocker left.** The cumulative
   `failed` totals that made these look broken never decrease, which is what made three repaired
   tasks read as still failing. Verified against `scheduler.sch_run`, not against totals:
   - **Human Baseline Schedule / Daily Standup Summary — FIXED.** The `agent_id` repair worked;
     all failures stopped 08-14 00:31 and every run since has succeeded. The duplicate was NOT
     created by a repair that inserted instead of updating — both rows were created by hand
     36 seconds apart on 08-09, five days before any repair, and the repair correctly updated
     both. The newer duplicate (`da07e6c6`) is now soft-deleted + disabled.
   - **Backlink enrichment — per-item surfacing already landed.** Errors now name the site,
     the backlink, the source URL, and the stage. It completes ~20 enrichments per run; the
     remaining failures are genuine per-item scraper 422s on unreachable directory URLs.
   - 🚨 **GA4 dispatcher — BLOCKED ON ARMAN, not on code.** The `ResourceBindingError` binding
     was fixed on 08-13; the sync now reaches Google and is refused there: *"Google Analytics
     Data API has not been used in project 34576215171 before or it is disabled."* **Enable the
     Analytics Data API on Google Cloud project 34576215171** — nothing in this repo can fix it.
   - **The silence itself is fixed.** THE SCHEDULER REPEAT GUARD (aidream 0.2.75,
     `packages/matrx-scheduler/matrx_scheduler/repeat_guard.py` +
     `aidream/services/scheduling/failure_escalation.py`) escalates at `finalize_run` on three
     ceilings — 3 same-signature failures, 3 failures with no success ANYWHERE, or 8 mixed
     failures for a task that used to work — and raises one deduped `platform.assists` chip on
     the schedule owner. It stops the silence, not the schedule: **whether a repeatedly-failing
     schedule should auto-disable is Arman's call and was deliberately not taken.**
3. **1,270 unwired artifacts** found by the new `pnpm check:unwired`. Triage worst-first; expect
   false positives (sample code, demos, debug panels) — fix the scanner for a mis-detected
   CATEGORY rather than allowlisting rows one at a time. **Deletion recommendations are forbidden**
   (unfinished-work alarm).
4. **Autonomy settings** — extend `growth.loop_run.pipe_policy`, never a parallel settings table.
   Invoke the `settings-system` skill. Publish/write-back opt-in must be unmistakable in the UI as
   a UX bar, not a hardcoded refusal.
5. **`G-SUGGEST-FORK`** — producer-level (whole-check) suppression is the last wide blocker;
   team-addressing is settled as out of scope. Twelve capabilities still uncovered, so **retire
   nothing** (absorb-then-collapse). `features/assists/FEATURE.md` § capability inventory.
6. **`G-MEASURE-SCHEDULE`** — closes when GA4 genuinely syncs (PageSpeed already does).
7. **Write-back is the one stage never reached** — 11 of 12 have real `loop_stage_run` rows.
8. **Stale gap TITLES.** Statuses are right; several titles were written when the gap opened and
   now read as false (`G-ORCHESTRATOR — "No end-to-end run object"` while five loops run).

## Done

- The run object, its router, and the human + code pipes — `aidream/services/growth_loop/`,
  `features/growth-loop/run/`.
- Supervisor advances stages unattended; 89 stage runs across 11 stages, 45 scored.
- Publish→crawl, templates, research triggers, plan-status, CMS identity, findings→assists
  (pg_cron sweep), finding→fix, pipe primitive's AI leg, human→AI escalation sweeper, sitemap /
  robots / collections, crawl schedule + dual-world collapse, plan-drift UI.
- `growth` exposed to PostgREST **safely** — `security_invoker` on `v_loop_state`, parent-follows
  RLS on stages; a cross-tenant read found on 2026-08-13 is closed (stranger sees 0, owner sees
  their own).
- `pnpm check:unwired` + `/administration/reporting/unwired` — the detector for the failure class
  that caused this whole campaign.
- Auditor brief rewritten around the reachability ladder (its old `G-ORCHESTRATOR` check would
  have certified the campaign's worst failure as closed).

## Decisions needed

**None blocking.** Two worth Arman's eye when convenient:

- **Situation:** The supervisor ticks every 30 seconds per loop. With five loops that is already
  2,150 runs in a day; at a hundred client sites it is a large continuous load.
  **Decide:** leave the 30s tick, or move to event-driven advancement (advance when a stage store
  changes) with a slow sweep as backstop?
- **Situation:** `web.finding` has 5,506 rows; the assists sweep deliberately surfaces at most
  three groups per site to avoid a wall of chips. Most findings therefore never reach anyone.
  **Decide:** is three-per-site the right ceiling, or should volume scale with site size?
