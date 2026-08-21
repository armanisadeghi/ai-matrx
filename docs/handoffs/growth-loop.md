---
status: active
updated: 2026-08-20
repos: [matrx-frontend, aidream]
scope: program
feature: Growth Loop
vision:
  - /Users/armanisadeghi/code/common-docs/systems/marketing/growth-loop/VISION.md
  - /Users/armanisadeghi/code/common-docs/projects/content-engine/STATE.md
---

# Growth Loop — unstall the loop, then reach write-back

**What this is:** the twelve-stage outer loop that takes a live site and measures it, analyzes it,
suggests improvements, and writes those improvements back into the CMS — research → plan → brief →
realize → fill → publish → serve → crawl → measure → analyze → suggest → **write-back**.
**Scope:** Program (spans Research, SEO, CMS, Content Planning)
**Feature:** Growth Loop
**Vision:** [`common-docs/systems/marketing/growth-loop/VISION.md`](/Users/armanisadeghi/code/common-docs/systems/marketing/growth-loop/VISION.md) — Arman's words, 2026-08-09. **"Click one thing and have the whole thing done" is the acceptance test.**

**Sister program: Website Factory** ([website-factory-vision.md](./website-factory-vision.md)).
Factory is idea → a website; this loop is that site, then measure → improve.

🚨 **READ THE CLUSTER DOC:
[`common-docs/projects/content-engine/STATE.md`](/Users/armanisadeghi/code/common-docs/projects/content-engine/STATE.md)** — the merged
cluster vision, verified state, and the single question ledger.

## The situation, verified live 2026-08-20

The machine is healthy; **the loop is frozen.** 6 loops — **4 blocked, 1 paused, 1 cancelled, 0
active** — and the newest `loop_event` and `loop_stage_run` update are both **2026-08-17 09:41**.
Nothing has moved in three days. 11 of 12 stages have real rows (441 stage runs, 1,337 events);
**`writeback` has 0 rows and has never been reached.**

## Remaining work

Full detail and evidence in **STATE.md §4.4**. In priority order:

0. 🚨 **ARMAN — ONE CLICK, NOT A CODE TASK. Enable the Google Analytics Data API on Google Cloud
   project `34576215171`**
   (https://console.developers.google.com/apis/api/analyticsdata.googleapis.com/overview?project=34576215171).
   Live error blocking the "Data Destruction, Inc." loop at *measure*:
   `GA4 Data API PERMISSION_DENIED`. Nothing in either repo can fix this; it also keeps
   `G-MEASURE-SCHEDULE` open.
1. **Unstall the loops — three causes.**
   - `measure` spins then blocks: `aidream/services/seo/pagespeed_health.py` ALREADY classifies
     `NO_FCP` and `FAILED_DOCUMENT_REQUEST` as terminal and quarantines them — **the measure stage
     simply does not consult it.**
   - A dispatch vanished: "Cosmetic Injectables" sat open on `research` for 2,094 minutes;
     the supervisor raised `StagePointerDeadline` — *"nothing was ever doing this stage's work."*
   - GA4 — item 0.
2. **Confirm the supervisor's real cadence.** It is running **18 runs / 3h** against a documented
   30s-per-loop tick (older docs claim 334/3h). Consistent with every loop being blocked, but
   verify rather than assume — and read this before answering STATE.md ledger Q4, whose load
   premise it changes.
3. **Reach write-back.** The one stage with no evidence at all.
4. **`G-SUGGEST-FORK`** — producer-level (whole-check) suppression is the last wide blocker. Twelve
   capabilities still uncovered, so **retire nothing** (absorb-then-collapse).
5. **`G-STALENESS`** — `in-progress` in `loop-map.ts` and missing from every campaign doc's pending
   list. Surface it.
6. **Autonomy settings** — extend `growth.loop_run.pipe_policy`, never a parallel settings table.
   Publish/write-back opt-in must be a visible UX bar, never a hardcoded refusal.
7. **Stale gap TITLES** — statuses are right; several titles read as false
   (`G-ORCHESTRATOR — "No end-to-end run object"` while five loops exist).
8. **1,270 unwired artifacts** (`pnpm check:unwired`). Triage worst-first; fix the scanner for a
   mis-detected CATEGORY rather than allowlisting rows. **Deletion recommendations are forbidden**
   (unfinished-work alarm).
9. **Missing primitive** — a general event bus for arbitrary row changes (today: fixed-channel
   `pg_notify` listeners only).

## Resources

- **Status truth:** `features/growth-loop/map/loop-map.ts` — the ONLY place gap statuses live.
  Hand-authored by Arman's ruling; the Codex auditor corrects drift. Rendered at
  `/administration/knowledge/growth-loop`.
- **Customer view:** `/how-it-works` ← `features/growth-loop/public/`.
- **Run surface:** `/marketing/brands/[brandId]/sites/[siteId]/growth-loop` ← `features/growth-loop/run/`.
- **Backend:** `aidream/services/growth_loop/` — `orchestrator.py`, `supervisor.py`, `stages.py`,
  `pipes.py`, `quality.py`. Router `api/routers/growth_loop.py`.
- **DB:** `growth.loop_run` / `loop_stage_run` / `loop_event` / `stage_ref_kind` / `v_loop_state`.
  **Read the table comments before writing** — a stage attempt stores a POINTER `(ref_kind, ref_id)`
  and no stage state; a new stage store is ONE row in `stage_ref_kind`, never a new column.
- **Method:** THE REACHABILITY LADDER — exists → reachable → deployed → exercised → produced
  (`common-docs/policies/unfinished-work-alarm.md`). **If you cannot name the caller, it is not done.**
- **Auditor:** `common-docs/systems/marketing/growth-loop/CODEX_OPERATOR.md`.
- Test login: `admin@admin.com` / `Password1234#`. Dev server: `pnpm preview:start` (port 3001).

## Done

- The run object, router and three pipes; the supervisor advancing stages unattended (8,921
  scheduler runs, 417 decisions) with its asyncpg concurrency fault fixed; `growth` safely exposed
  to PostgREST; the scheduler repeat guard; publish→crawl, templates, research triggers, CMS
  identity, findings→assists, finding→fix, human→AI escalation, sitemap/robots/collections,
  plan-drift UI; `pnpm check:unwired`. One line each with pointers in **STATE.md §3**.

## Decisions needed

Item 0 is Arman's and it is blocking. Every other open question in this cluster — including the
findings ceiling and the supervisor cadence — is in the one ledger: **STATE.md §5**.

**Settled by Arman, never re-ask** (full list in `growth-loop/FEATURE.md` and STATE.md §2.13):
autonomy is a SETTING not a capability limit · every stage is scored and a score NEVER blocks · an
assist is addressed to ONE person · `loop-map.ts` stays hand-authored.
