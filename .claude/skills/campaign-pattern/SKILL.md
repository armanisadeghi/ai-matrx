---
name: campaign-pattern
description: "The Campaign Pattern — how a vision becomes a finished, verified, deployed system with near-zero owner involvement. READ BEFORE launching or coordinating any large build, module, campaign, or multi-agent project: the owner's five launch moves, the coordinator's operating system (externalize everything, independent verification, fix-the-class, nothing-silent), and the copy-paste launch protocol. Distilled from the HR-domain build (2026-08-25 → 08-30)."
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/campaign-pattern/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# The Campaign Pattern

**What this reproduces:** the HR-domain build — a module that went from one vision message to a
verified, deployed production system in five days with near-zero owner involvement, surviving
multiple context compactions, disconnects, and usage-limit kills without losing a step. The full
worked example lives in [`projects/hr-domain/`](/projects/hr-domain/); this doc is the recipe.

**The one-sentence version:** the owner spends his effort BEFORE the build (five launch moves,
~2 hours total), the coordinator externalizes every piece of state so no session matters, and
nothing is ever called done on the word of whoever built it.

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
order, so no agent ever treated it as optional.

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
genuinely un-defaultable needed words (seven items). During the run, the owner answered
decision batches fast and decisively, taught PRINCIPLES instead of fixes (org-scoping, knobs,
platform primitives, package versioning), corrected focus bluntly when needed (*"you are focused
on the wrong things"*), fired chips for parallel work — and otherwise did not interfere.
**Trust, explicitly granted, is a mechanism: the coordinator never waited.**

## Part 2 — The coordinator's operating system (what the agent must do)

1. **Externalize everything; make yourself replaceable.** One register as the single tracking
   home (stable IDs, no parallel status docs). Frozen specs. A rulings ledger. A log line for
   EVERY processed event, committed and pushed immediately — *unpushed work doesn't exist*. A
   `COORDINATOR.md` succession brief so any fresh session takes the chair with one sentence.
   This is why context wipes cost nothing: the head is a cache, the repo is the truth.
2. **Coordinate; don't build.** The chair dispatches fresh-context specialist agents with tight
   briefs, adjudicates their findings, routes fixes, and flips register rows. Every brief passes
   down the laws (safety constraints, method laws, the model law: every dispatch names its
   model). Freeze contracts first so lanes can't collide; changes after the freeze are
   amendments, never silent edits.
3. **Nothing flips on the builder's word.** Independent, zero-authorship verification against
   the SPEC, on the deployed surface, with real identities driving real doors — verifiers try to
   BREAK things, pair every refusal-proof with a positive control that could fail, re-run every
   red before believing it, and state which build every verdict ran on. Expect verdicts to be
   overturned in both directions; that is the system working.
4. **Fix the class, never the instance.** Every defect gets a root cause, a census of its
   siblings, and where possible a structural guard proven RED-THEN-GREEN (a guard you cannot
   demonstrate failing is not a guard). Every stand-in screams (loud-patches law); every
   opinion-shaped decision becomes an org knob; every capability gets built as a platform
   primitive, not a feature-local patch.
5. **Bank lessons as laws.** Method traps (liveness oracles, session traps, seam classes) go
   into durable memory/docs the moment they bite, so they bite once. Briefs quote the laws;
   the culture compounds daily.
6. **Route honestly.** Agent-doable work is never sent to the owner. What reaches him: finished
   work to see, genuine rulings packaged with context + a recommendation in plain language
   (no jargon, no doc references, no codenames), and chips he can fire with one click. Batched,
   never one-at-a-time.
7. **Survive on purpose.** Self-scheduled wake-ups as disconnect insurance; recovery-first
   resumes (verify what actually landed via origin content, never memory); work products — not
   transcripts — as the liveness oracle for sub-agents; never relaunch-on-suspicion an agent
   holding real-state authority.

## Part 3 — Launching one (the owner's copy-paste protocol)

1. Write the mandate: the vision, the theory of past failure, and the process shape (core → 
   frozen specs → parallel fan-out → independent verification). Name what "done" means using
   the Part 1 §4 language verbatim.
2. Tell the agent to run discovery first (own-system recon + market reference + scope), then
   bring the scope list — and order the hole-poking review on it.
3. Answer the defaults-carrying interview (only un-defaultable items need words).
4. Say the sentence that grants the chair: *"You own this end to end. Make yourself
   replaceable, keep everything in the register, and only bring me finished work and real
   decisions."* Approve the standing wake-up/schedule if offered.
5. During the run: answer batches fast, teach principles not fixes, fire chips, test with your
   own hands when asked (the owner's phone caught defects no agent could) — and let it run.

**Changelog**
- 2026-08-30 — Six laws promoted to the workspace root `CLAUDE.md` Headline rules at the owner's
  order (done-means-done · attack-before-trust · fix-the-class · nothing-fails-silently ·
  platform-primitives · opinions-become-knobs) — every agent now reads them before touching code;
  this doc remains the full body.
- 2026-08-30 — Created; distilled from the HR-domain campaign at the owner's request, with the
  five launch moves quoted from the founding transcript.
