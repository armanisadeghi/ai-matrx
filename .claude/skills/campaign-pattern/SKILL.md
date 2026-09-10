---
name: campaign-pattern
description: "The doctrine for turning a vision into a finished, verified, deployed system with near-zero owner involvement. Use when launching, coordinating, resuming, or working any large build, module, campaign, or multi-agent project, or when writing its launch prompt."
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/campaign-pattern/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# The Campaign Pattern

**What this reproduces:** the HR-domain build — one vision message became a verified, deployed
production module in five days with near-zero owner involvement, surviving compactions,
disconnects, and usage-limit kills without losing a step. Worked example:
[`projects/hr-domain/`](/projects/hr-domain/) (its `COORDINATOR.md`, `EXECUTION.md`, `REGISTER.md`
are the templates). This doc is the recipe: **the owner's five launch moves** (Part 1), **the
coordinator's operating system** (Part 2), **the lifecycle with gates** (Part 3), and **the launch
protocol** (Part 4). Method skills carry the mechanics — this doc never restates them.

**The one-sentence version:** the owner spends his effort BEFORE the build, the coordinator
externalizes every piece of state so no session matters, and nothing is ever called done on the
word of whoever built it.

---

## Part 1 — The owner's five launch moves (this is where the magic actually was)

### 1. Assign a mandate with a theory of failure, not a feature list
The HR assignment's first paragraph named exactly what went wrong on prior rollouts
(*"insufficient upfront planning and poor compartmentalization... prevented us from maximizing
the capacity AI gives us"*) and prescribed the SHAPE of success, not the content: solid core
first (database), fully-resolved specs before any implementation (*"every page's behavior, each
feature's behavior, and every AI integration point fully defined in advance"*), then parallel
fan-out where server and client proceed independently *"because the APIs, data shapes, and flows
are already fully decided."* **Prescribe the process; let the agent derive the product.**

### 2. Demand discovery before design
The assignment ordered familiarization first: know the live database, its conventions and RLS
before designing anything; research the best products in the world and pick one primary + one
secondary reference; scope capabilities explicitly (what's IN, what's deliberately deferred).
The coordinator ran these as parallel zero-assumption recon agents whose reports went to FILES.
Every later spec stood on verified ground instead of assumption.

### 3. Order the adversarial review BEFORE commitment
Verbatim: *"before we take the next step... I want you to have an opus 5 agent who tries to poke
holes in this list and tell us what things we are missing that we will regret later."* One
sentence — and it seeded the entire culture: from then on, every plan got attacked before it was
trusted, and every "done" got attacked before it was believed. Adversarialism was the OWNER'S
order, so no agent ever treated it as optional. (Mechanics: `plan-attack`.)

### 4. Rule the done-means-done law (the single most load-bearing message)
Verbatim, from launch: *"I don't want fake tests that take in fake data that the agents
manufacture to test their own work. All verification, testing, and validations must be done
independently of the agent who has done the work, and they must be done in a comparison of the
initial guidance documents and vision to the final production system, verified in the user
interface, with actual data... Features are only considered done when they are truly done."*
This became D15 — and it is why the campaign caught a live cross-tenant leak, a feature that had
never worked once, a dead engine, and a dozen lying screens that every builder had reported as
finished. **Without this law, the other four moves produce confident garbage.**

### 5. Answer through a defaults-carrying interview, then get out of the way
The final pre-build interview carried the team's recommendation on every item with the rule:
*"anything you skip ships with the stated recommendation as the platform default."* Only the
genuinely un-defaultable needed words (seven items). (Mechanics: `grilling`.) During the run,
the owner answered decision batches fast and decisively, taught PRINCIPLES instead of fixes
(org-scoping, knobs, platform primitives, package versioning), corrected focus bluntly when
needed (*"you are focused on the wrong things"*), and otherwise did not interfere.
**Trust, explicitly granted, is a mechanism: the coordinator never waited.**

## Part 2 — The coordinator's operating system (what the agent must do)

1. **Externalize everything; make yourself replaceable.** One register as the single tracking
   home (stable IDs; no parallel status docs; **an index, not a store** — a decision lives in
   its item and the register only points at it). Frozen specs. A rulings ledger. A log line for
   EVERY processed event, committed and pushed immediately — *unpushed work doesn't exist*. A
   `COORDINATOR.md` succession brief so any fresh session takes the chair with one sentence.
   This is why context wipes cost nothing: the head is a cache, the repo is the truth.
2. **Coordinate; don't build.** The chair dispatches fresh-context specialist agents with tight
   briefs (artifacts as file paths, never pasted history), adjudicates their findings, routes
   fixes, and flips register rows. Every brief passes down the laws (safety constraints, method
   laws, and the model ladder: every dispatch NAMES its lane and model — Opus/Terra the default
   worker, Sonnet/Luna when obviously easy, Fable/Astra only where the chair itself would struggle;
   effort medium unless the task needs sustained reasoning — `policies/subagent-model-ladder.md`).
   Freeze contracts before fan-out so lanes can't collide; after the freeze a change is an
   amendment (changelog + register note + type regeneration), never a silent edit. **The ratchet:**
   a lane that discovers its task is bigger than briefed escalates the SHAPE (a ruling, a split,
   a lane up) — it never quietly shrinks the scope. Briefs, report statuses, the two-verdict
   review, and the bounded fix loop: `subagent-dispatch`.
3. **Nothing flips on the builder's word.** A builder owes fresh evidence for every claim before
   handoff — that is the FLOOR. The BAR is independent, zero-authorship verification against the
   SPEC, on the deployed surface, with real identities driving real doors: verifiers try to BREAK
   things, pair every refusal-proof with a positive control that could fail, re-run every red
   before believing it, and state which build every verdict ran on. Expect verdicts to be
   overturned in both directions; that is the system working. Reviewer findings are leads too:
   reproduce each on the current build, check it against recorded rulings, then CONFIRM, REFUTE
   with evidence, or RULE — ledgered as `Ruling: <decision> — <why> — <cost if wrong>`. Never
   pre-judge a reviewer's brief, never discard a finding silently, never fix a settled ruling away.
4. **Fix the class, never the instance.** Every defect gets a root cause proven by a red-capable
   loop (`diagnose` — never a fix before the loop), a census of its siblings, and where possible
   a structural guard proven RED-THEN-GREEN at a seam that reproduces the bug — if no such seam
   exists, that missing seam is itself the finding (`forcing-function-tests`). Every stand-in
   screams (loud-patches law); every opinion-shaped decision becomes an org knob; every capability
   is built as a platform primitive, never a feature-local patch.
5. **Bank lessons as laws.** Method traps (liveness oracles, session traps, seam classes) go into
   durable memory/docs the moment they bite, so they bite once. At each gate, and whenever a
   verifier overturns a builder, run a short retro and put each lesson where it bites cheapest:
   an automated check (best), a verifier-brief rule (the reviewer has the least context pressure —
   standards belong there), a navigation pointer, or a skill line. Delete steering text that
   changed no behavior.
6. **Rulings, not stalls — and route honestly.** A running lane never waits on a human. **Only
   four things stop a lane:** an irreversible or destructive act on real data; a security-sensitive
   change (grants, secrets, tenant boundaries) outside its brief; a side effect the owner reserved
   (money, external accounts, messaging real people, new schedules, a release); or a plan so broken
   that every path is a guess. Everything else is a ruling: decide it, ledger it with its cost if
   wrong, keep going — a wrong ruling costs visible rework; a parked lane costs the day. Agent-doable
   work never reaches the owner; **and the reverse holds: an agent never answers on the owner's
   behalf a question that is genuinely his** (vision, money, brand, legal, deleting real data). What
   reaches him: finished work to see, genuine rulings packaged with context + one recommendation
   in plain language (no jargon, doc references, or codenames), batched — and **at every close, the
   exhaustive list of rulings made in his absence**, each with its cost if wrong. A ruling that
   dies with the session was a decision made in secret.
7. **Survive on purpose.** Self-scheduled wake-ups as disconnect insurance. Recovery-first
   resumes: after any compaction or restart, trust the register + `git log` + origin content,
   never recollection — **re-dispatching finished work is the single costliest failure**, and a
   `Done` row is never re-run. Work products — not transcripts — are the liveness oracle for
   sub-agents; never relaunch-on-suspicion an agent holding real-state authority. Waiting is work:
   bounded stretches, reconcile live children between them, chase any that finished without
   reporting. In a shared checkout, touch only what you created — never remove another lane's
   worktree, stash, or files, and never `--force` a refused removal.
8. **A delta is not a status.** Every status begins with the terminal current truth and carries
   every unresolved provider, agent, owner, blocker, and verification action forward until it is
   completed and verified. "No new event" describes only the latest delta; it never means "nothing
   remains," "no action required," or "waiting on them" while an earlier action is still open.

## Part 3 — The lifecycle: gates with exit criteria (the spine that makes it reproducible)

Each gate's exit is checkable; a campaign that skips a gate is the failure mode Part 1 §1 named.

| # | Phase | Exit criterion |
|---|---|---|
| 0 | **Mandate** (owner) | The mandate names the vision, the theory of past failure, the process shape, and the done-means-done law (Part 1 §1, §4). |
| 1 | **Discovery** | Parallel recon agents (lanes named) have written to files: own-system conventions verified against live code/DB, best-in-class references chosen, capability scope IN/DEFERRED — and every load-bearing claim in them is verified, not asserted. |
| 2 | **Scope + attack** | A feature tree / scope list exists; a zero-authorship `plan-attack` has run; every finding adjudicated (FIX / REJECT with reason / OWNER-ONLY). The register is opened as the single tracking home; questions that are sharp-but-blocked are items, questions not yet phrasable stay named **fog** (never pre-sliced into fake items), and work past the destination is **out of scope** — closed with one line, never "deferred" back onto the frontier. |
| 3 | **Interview + readiness** | Each lane's readiness doc front-loads its unknowns and resolves what it can itself; the coordinator merges the residue into ONE `grilling` interview; the frontier is empty (answered, decided-with-override, or deferred with a date). **After this, no lane ever stops to ask the owner** — a new unknown is a coordinator ruling. |
| 4 | **Freeze (G1)** | Specs, contracts, types/mocks, and fixtures are frozen and hashed; the core schema is certified. From here a contract change is an amendment (changelog + register note + regeneration), never a silent edit. |
| 5 | **Core** (serial) | The single critical-path core lands and certifies in order — never parallelized. |
| 6 | **Fan-out** (parallel) | Lanes dispatched with exclusive file/schema ownership and frozen interfaces; shared inputs verified to exist BEFORE parallel dispatch (a bad ref fails here, not inside six agents). |
| 7 | **First vertical (G2)** | One org runs one end-to-end path in production shape with real non-admin users — before the remaining lanes merge their surfaces. |
| 8 | **Verification + defect rounds** | Per lane: D15 — explicit targets (a real user action on a real surface, never "tests pass") proven by a zero-authorship verifier on the deployed surface with real data; conformance gates green; a review-queue row filed; reopen-on-fail is normal. **The battery that found everything:** a breadth sweep (actuate EVERY control, every persona), an adversarial depth pass (real non-member/anon identities through real doors), a hostile re-verify of every fix set, a closing verifier over the held targets + a production sweep, and the owner's own hands on the deployed surface. Defects are fixed by class (Part 2 §4), never by instance. |
| 9 | **Close (G3)** | Every target Met on independent evidence and confirmed LIVE (deploy trains carried it; verify the deployed SHA, never the pushed one); the rulings list delivered to the owner; the retro banked (Part 2 §5); handoffs deleted, register and docs groomed; residual follow-ups filed where they'll be seen. |

## Part 4 — Launching one (the owner's copy-paste protocol)

1. Write the mandate: the vision, the theory of past failure, and the process shape (core →
   frozen specs → parallel fan-out → independent verification). Name what "done" means using
   the Part 1 §4 language verbatim.
2. Tell the agent to run discovery first (own-system recon + market reference + scope), then
   bring the scope list — and order the hole-poking review on it (`plan-attack`).
3. Answer the defaults-carrying interview (only un-defaultable items need words).
4. Say the sentence that grants the chair: *"You own this end to end. Make yourself
   replaceable, keep everything in the register, and only bring me finished work and real
   decisions."* Approve the standing wake-up/schedule if offered.
5. During the run: answer batches fast, teach principles not fixes, test with your own hands
   when asked (the owner's phone caught defects no agent could) — and let it run.

## Deliberately not adopted (benchmarked 2026-09-10 against mattpocock/skills and obra/superpowers)

- **A worktree per lane / merger subagents** — rejected by `policies/shared-checkout.md` ("the
  worktree is a tool, not a home"): held-back code goes stale and the deploy train builds `main`.
- **Diff-only review as the definition of done**, self-run test suites as closure, the TDD
  delete-and-restart ceremony, one-ticket-per-session, and human approval gates on every path —
  each contradicts done-means-done or near-zero owner involvement. Their clarity mechanisms were
  taken; their model of who owns correctness was not.

**Changelog**
- 2026-09-10 (benchmark rewrite) — Part 3 lifecycle with gate exit criteria added (from the HR
  execution plan that worked); adopted from the two benchmark frameworks: the closed four-item stop
  list ("rulings, not stalls"), the exhaustive rulings-at-close report, the post-compaction resume
  rule, waiting discipline and provenance-only cleanup, register-as-index with fog and out-of-scope
  lanes, the builder-floor/verifier-bar split, the anti-self-answer clause, fail-fast before
  fan-out, the ratchet; the verification battery named; rejected mechanisms recorded with reasons.
  Proof: `evals.md`.
- 2026-09-10 (skill-benchmark adoptions) — method skills wired: `diagnose`, `forcing-function-tests`,
  `subagent-dispatch`, reviewer-finding adjudication, retro, `grilling`, `plan-attack`.
- 2026-09-10 — status-integrity carry-forward rule (§8); medium default effort; Opus/Terra default
  worker; law 7 (the model ladder) at Arman's ruling.
- 2026-08-30 — Six laws promoted to every repo `CLAUDE.md` at the owner's order; this doc remains
  the full body.
- 2026-08-30 — Created; distilled from the HR-domain campaign at the owner's request, with the
  five launch moves quoted from the founding transcript.
