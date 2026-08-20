---
status: active
updated: 2026-08-19
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/code/common-docs/projects/masterwork/STATE.md]
---

# Masterwork — THE HANDOFF (forward work order)

**The whole feature.** An **Expert** → **Distillation** (many **Approaches**) → a **Rulebook**
→ **Build** → a **Masterwork** (draft → released), proved by an **Audition**, run by an
**Operator** as an **Encore**, improved forever (Checkup · Coherence · Hindsight · the
improvement brain).

**Three documents, three jobs, no overlap:**

| Doc | Job |
|---|---|
| **STATE** — [`common-docs/projects/masterwork/STATE.md`](/Users/armanisadeghi/code/common-docs/projects/masterwork/STATE.md) | What exists (evidence-verified), Arman's vision merged verbatim, the full pending list, the question ledger, the boundary map, the census. |
| **CONTRACT** — [`common-docs/systems/masterwork/FEATURE.md`](/Users/armanisadeghi/code/common-docs/systems/masterwork/FEATURE.md) | Invariants, LEARNED PATTERNS, the Approach registry. |
| **THIS FILE** | What to build next, in order. |

**Read STATE.md first.** It is the only place the numbers, the verified state and Arman's own
words live; this file deliberately does not repeat them.

## Arman's vision — the five sentences you must not lose

1. **UI-first is the reality test** — nothing is real without a UI a normal user can use.
2. **The system is for HUMANS first** — the product is the PROCESS that distills, never
   hand-authored rules. The dream: *"just talk for an hour, upload the audio, we do the rest."*
3. **chunk → extract → table → reference-back** is the ingestion play; every rule links to its
   source (pages, timestamps, conversations).
4. **The honest-evaluation caveat:** Hopkins and Strunk flatter us — the models know them. The
   REAL test is Arman's own SEO method, judged by whether HE agrees with the output. **Still
   the gate. Still not run end to end.**
5. **The global view is the owner's job (Arman, 2026-08-19):** whoever owns this feature owns
   ALL of it — every part, every integration, and the layer on top. Parts that don't talk to
   each other are the failure mode that has been "disastrous on a couple of features."

**Definition of done:** an Expert who cannot code opens the Studio, talks for twenty minutes,
approves the rules they agree with, rejects one with a spoken reason and watches it come back
rewritten, presses one button, runs the result, disagrees with it once, and watches the system
get better — agreeing with the output where they never agree with vanilla AI.

## Build order

The complete, code-confirmed list is [STATE.md § 4](/Users/armanisadeghi/code/common-docs/projects/masterwork/STATE.md).
Ranked, the first six are:

1. **The live graph in AI Matrx** (§4.1) — the Expert never sees the system take shape. The
   Conductor's `e07fbf06` already IS a graph with 24 real plan nodes; draw it as it is
   authored. A NEW, deliberately simpler renderer — **never a port of the studio canvas**.
2. **Plan emission** (§4.1) — `emitted_node` / `emitted_resource` / `expanded` have zero
   writers, so nothing can make a graph *develop as you go*. Item 1 has nothing to animate
   without this.
3. **Run the Conductor's workflow** (§4.2) — `e07fbf06` has never executed. Until it runs,
   "it works" is a claim about authoring, not results.
4. **Make the Conductor the only path** (§4.2) — retire `build.py`'s template shapes once it
   covers them. Bring a plan first; never delete first.
5. **`relates_to` on real rules** (§4.3) — 0 of 429 rules carry one. Run the
   `masterwork.relationship_auditor` per Rulebook to build the proposal queue. Findings stay
   proposals.
6. **ONE expert corpus** (§4.4) — the TypeScript `getExpertCorpus` reads 3 lanes against the
   server's 9, and `corpus.py`'s own docstring wrongly claims the swap already happened.

## Working notes that save hours

- **Live ids:** Rulebooks `seo-keyword-optimization` **`8d1d4f08-…`** (Arman's — THE test bed),
  `strunk-elements-of-style` `e492a07f-…` (admin-owned — agents verify here),
  `hopkins-scientific-advertising` `f6267bca-…`, `arman-seo-method` `5d353449-…` (empty).
  Scout `4a0b2f8e-…`. Approach registry: `platform.approach`, family `distillation`, 9 rows.
- **Rules are JSONB on `platform.rulebook.rules`** — there is no `platform.rule` table. A rule
  is a draft when it carries `draft: true`.
- **Encore runs live in `workflow.run`, not `platform.masterwork_run`.** Reading the wrong
  ledger is how "no Operator ever received output" keeps getting rewritten as fact.
- **Deployed-vs-live schema guard:** `aidream db/schema_analysis/check_deployed_schema.py` —
  run it before ANY live schema change (built from the 2026-08-18 outage).
- **Verify locally:** `pnpm preview:start` (3001, shared), admin@admin.com. Arman-owned rows
  are RLS-invisible to admin — verify his data via SQL/RPC, UI on Strunk.
- **Never:** hand-render a stream · re-roll the CAS write path (`rulebook_writes.py`) ·
  auto-activate an AI-written rule · put a prompt or agent id in code (Mandates only) · let an
  agent touch a clean approved rule · rename a live DB identifier without the §8a-2 shim ·
  launch a structured-output mandate from a page with write targets without
  `auto_tools_disabled`.
- **THE CLASS to watch for:** *a law lands in the AUTHORING half and never reaches the
  EXECUTING/CONSUMING half.* Six separate 2026-08-19 findings were this one failure repeated.
  Codified as LEARNED PATTERN 1b in the CONTRACT.

## The Approach build catalog — Arman's ruling 2026-08-17

**"No idea is turned away until we test it and it sucks."** Every Approach gets BUILT. The
goal: so many ways of distilling that it is impossible to get it wrong.

**Built and live (7 enabled of 9 registered):** Understudy · Body of Work · Resource dump ·
Approach selector + improvement-brain assists · Chat import · Exception Hunter ·
Hardest-Case Debrief · Vacation Trigger · Oracle tap (in-app half).

**Still to build:** #6 Meeting Scavenger (must tap the platform's own meeting/transcript
machinery) · #7 Shadow-the-inbox (the diff primitive already exists in
`useOutputFeedback.captureCorrection`; missing is the Understudy inbound path) · #8 Red-Pen
lane · #9 Bad Example probe (= an Audition run in reverse-emphasis, same judge) · #13 Triad
game (a proper content-ir kind through the quiz machinery, never a bespoke game engine) ·
#14 Prediction Ledger (scoring via the ONE Judge mandate, never a second grader) ·
Oracle tap email-in + SMS halves. Plus the **Masterwork M&M** — a standing 15-minute weekly
worst-run review ritual, a delivery vehicle, not a lane.

**ONE landing point for every lane: `rulebook_writes.py` — never a second write path.**

## Attached work (tasks — not separate staffing rows)

| Task | Document | Still pending |
|---|---|---|
| Vision Interview | [`aidream/docs/handoffs/vision-interview-v2.md`](/Users/armanisadeghi/code/aidream/docs/handoffs/vision-interview-v2.md) | Live E2E proof, threshold/cadence tuning, mission-block A/B, Cartographer grounding. Vision Interview is an Approach inside Masterwork, not its own feature — and it still has no `platform.approach` row (STATE.md Q18). |

## Blocked on Arman

The question ledger is [STATE.md § 5](/Users/armanisadeghi/code/common-docs/projects/masterwork/STATE.md).
Nothing in the build order above is blocked on it. The three items only he can do: **the honest
test** on his own SEO method, **voice relay with a real microphone**, and **16 provider
screenshots** from his signed-in accounts.
