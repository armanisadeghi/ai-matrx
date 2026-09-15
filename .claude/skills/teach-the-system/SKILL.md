---
name: teach-the-system
type: Skill
title: "teach-the-system — teach the platform one body of expertise until it breaks, fix it, continue"
description: "Trial protocol for teaching AI Matrx a real expert's knowledge as a non-technical user, running it until the platform breaks, fixing the platform, and reporting what improved. Use when asked to distil a book, guide, or expert into a Masterwork, test whether the system can capture a human skill, or run an expertise trial. NOT for building a feature you already know is missing (use build-sub-feature)."
tags: [masterwork, distillation, expertise, trial, platform-testing, doctrine]
timestamp: 2026-09-12T17:40:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/teach-the-system/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# teach-the-system — teach the platform one body of expertise until it breaks, fix it, continue

**Companion file — read only the branch your run reaches:**

- **[lessons.md](lessons.md)** — every dated lesson from past trials (§8). **Read it once end to end
  before you choose a subject** (like the REGISTER walls table), **and again before you judge a run, call
  it a success, or trust a verdict.** Also read it when your run hits a stop (a wall, a silent or failed
  run, an access refusal, a red CI check, a Conductor or agent claim you are about to believe), when you
  drive the product headless or from a cloud container, when you face a pile of draft rules to review,
  and at §7 to append your own.

**What this is.** Arman wants an army of Fable-class developers who each pick one real body of
expertise, teach it to AI Matrx exactly the way a non-technical Expert would, run it on real cases
until the platform stops or breaks, fix the platform (never the trial), and continue — and who
report **what improved in the system**, not what happened to the run. The why, in his words, is
`common-docs/projects/expert-book-challenge/PROGRAM.md` — read it once before your first trial.
**The architecture mandate every trial serves is his brief
`common-docs/projects/expert-book-challenge/OVERVIEW.md` (authority: owner, 2026-09-12):** capture the
tacit and the controversial across modalities, atomize with provenance, keep schools of thought and
dissent navigable, treat "weirdness" as the asset. The measured gap between that brief and the live
platform is `OVERVIEW-GAP-CENSUS.md` beside it — read its ranked table so you know which walls are
already owned.
Night 1's full evidence trail is the sibling `REGISTER.md`; read its walls table before choosing
a subject so you inherit the fixes instead of re-hitting them.

**How victory is scored (Arman, 2026-09-12): the number of things the system could not do before the
trial and can do after.** Keep a capability ledger in the register — one row per "could not / can now" —
and lead the morning report with its count. The best rows are bridges: a way to move a person's or a
source's unique knowledge into an agent's instructions, a workflow step, a tool or a function. The
built desk is a by-product; a run that succeeded without a new row is worth nothing here (PROGRAM.md
ruling 6).

**"The developer" running a trial can be a dispatched Sonnet 5 subagent (Arman, 2026-09-12).**
Driving the product as a non-technical Expert, judging outputs, logging walls, and writing the
register is not complex code — it is exactly the discovery/big-task work the Sonnet lane is for.
An owning session dispatches a Sonnet driver for the trial itself, and that driver in turn
dispatches Opus subagents for the bounded platform code fixes each wall needs; Fable/default stays
reserved for planning and heavy reasoning, never for driving a trial end to end. If you are a
dispatched Sonnet driver reading this: you are authorized to run the whole trial loop (§4) and
dispatch your own Opus fixes — do not hand the trial back up as "too big" or "campaign-scale". The
stop condition in your dispatch brief (a deliverable reached, or a pushed build to wait on — §5) is
your bound; treat it as the actual scope of the job, not a reason to escalate.

**This skill improves itself.** Everything Arman teaches you during a trial, and every mistake that
cost you an hour, goes into this skill in the same session (§7). A trial that ends without a skill
edit either learned nothing or lost it.

## 0. The mandate every trial is measured against

🚨 Read `common-docs/projects/expert-book-challenge/MANDATE.md` (Arman, 2026-09-12, `authority: owner`)
before choosing a subject, and answer its seven checks in your register before you build: which acquisition
**modality** you add; whether the knowledge is genuinely **tacit** (if the expert could have written it down,
you are working on the cheap half); whether the output is **executable** (rubrics, checklists, if-then rules,
decision trees, annotated exemplars — never prose a desk must re-interpret); whether every atom carries
**provenance** and opens to it; **how you resist consensus collapse**; whether the expert can **validate in
their own modality**; and whether the platform can now execute something **previously inexpressible**.

🚨 The trap with a name: **pooling**. Fitting several experts — or several sittings of one expert — into one
merged model, one averaged verdict, or one consensus rulebook destroys exactly what the mandate calls the
principal source of value. Keep per-expert or per-school profiles as the unit, be able to show a minority
position that survived, and never resolve a disagreement by averaging.

## 1. Choose the subject — the opposite of what computers are good at

REQUIRED before anything else: write the subject choice into your trial register (§3) with the
three answers below. A subject that fails any of them is rejected.

1. **Does it need judgment, questions, and a diagnosis** rather than yes/no rules? Ad-copy
   checklists, style rules, pass/fail grading are rejected ("almost digital"). Relationship advice
   for teenagers, parenting, what a therapist should tell a person, tax or HR judgment calls,
   "how to not sound like AI" are the model.
2. **Can two experts disagree?** The strongest trial is two sources with differing views on the
   same topic → two masterworks → the same inputs → two different, defensible answers. Plan for
   the pair even if night 1 only builds one.
3. **Can the result be judged without you?** Prefer subjects with a judge built in: a Fable-written
   blog fed to a "sound human" masterwork; a real viral post fed to a verification desk; a
   described family situation fed to two parenting masterworks. Name the judge (AI or Arman) now.
4. **Would a frontier model give this answer unprompted?** If yes, reject: it is common knowledge,
   not expertise. The subject must be a highly opinionated method the best people believe in — an
   order of operations they refuse to violate, "never X without first Y" gates, their own vocabulary,
   a result they would recognise as theirs (Arman's examples: his own keyword-research order; an
   agent equipped with Tony Robbins' systems — PROGRAM.md ruling 7).

5. **Does the subject hold more than one school, and will you keep both?** Two sources that
   disagree are two schools of one body of knowledge, not one Rulebook to reconcile. Name the
   schools in the register before distilling; a rule that one source holds and the other rejects
   is the trial's most valuable output, never a "coherence tension" to settle. Trial 3 planned the
   pair and attached both to one Rulebook — 139 drafts, one desk, every disagreement resolved to a
   side: that is the consensus trap, and it is now a wall (§4).

Prefer subjects that need **no external service**. Fancy APIs make the distillation neither harder
nor easier — the barrier is never technology, it is whether the system captures the skill. When the
method genuinely needs a primitive (reverse image search, a records lookup), build it in the shared
layer and log it as platform capability, not as the trial's achievement.

The source must be freely and legally available (public domain, CC, the author's own site, a blog).
Record the licence and the link in the register.

**Books are only one of three subject classes (Arman, 2026-09-12) — don't let this become "a
couple of little books".** Most expertise in a company never made it into a book:

- **(a) Expertise that only lives in a person's head.** The trial extracts it through the
  product's own **interview lane** (Masterwork guided start interviewing you as the Expert) — not
  a book, not a transcript you pre-wrote. If the interview does a shitty job, that IS the wall:
  fix the interview lane itself, in the shared layer, before blaming the subject. This has been
  reported for a while with nobody fixing it — a trial that hits it and doesn't fix it has failed
  the trial.
- **(b) Expertise that lives in someone's past work.** The only input is a body of real examples
  (a writer's published pieces, a critic's reviews, a designer's portfolio) — never the person's
  narration of their own method. Distil the standards the examples imply, then reproduce a
  held-out example blind and compare.
- **(c) Ground-truth subjects, where the world already holds the right answer.** Feed the system
  everything it needs except the actual answer, have it produce its own version, and diff it
  against the real one that already exists — a week-old New York Times or Washington Post article
  reproduced blind from the same sources, a fashion critic's review reproduced blind against the
  real one. **No AI judge is needed for the main verdict** here: the ground truth already exists.
  AI cannot yet write at that level, and closing that gap — YouTube talks and guides from real
  news editors and media writing coaches feeding a Rulebook for a highly unique, opinionated,
  non-AI-sounding voice — is exactly the kind of trial this program exists to run.

## 2. The rules of the trial

- **You are the non-technical Expert.** Product UI only: Masterwork guided start, distillation
  lanes, the Conductor by conversation, the run box, the pause forms. No API calls to author, no
  SQL to fix data, no hand-written workflow JSON. Reading the database to diagnose a wall is fine;
  writing to it to pass is cheating.
- **The source is the ONLY knowledge input.** Never hard-code its rules; never vibe-code an app
  that "does what the book does"; never pre-digest the text into rules yourself. The platform
  distils, the Conductor authors, you answer questions the way the author would.
- **Real cases from the world this week.** Never self-authored easy examples. Find them the way the
  job would (a viral post, a real family scenario from a forum, a real blog post).
- **Never collapse consensus (Arman's brief, 2026-09-12).** The platform's principal value is the
  tacit, the idiosyncratic and the disputed. A rule seen once is a rule; recurrence is a signal on
  it, not a gate to existence. You never Approve-all a corpus, never answer a contradiction by
  picking a side when both could be true (say so — "both are right" with the condition that
  separates them), never let the Conductor fold two schools into one desk, and never let an
  interviewer rewrite the earlier position out of existence. Record every place the product pushed
  you toward one of these as a wall.
- **Cheat honestly.** A browser instead of an email tool, a pasted chapter instead of the whole
  PDF — allowed, logged as a cheat in the register with what the honest version would need.
- **Sign in without typing a password, ON YOUR OWN HOSTNAME.** Production browser pane signed out?
  Use the local preview (`pnpm preview:start`, port 3001) and then `pnpm dev-login /<route>`, which
  mints your session's single-use nonce and prints the URL to open. Never type a credential into a
  field.
- **🚨 Never open `localhost:3001` — open the hostname the harness prints.** Several trials run on
  one machine at once, and cookies are scoped to a HOST and ignore the PORT: on 2026-09-12 five
  sessions shared one cookie jar on `localhost`, so one agent's dev-login signed every other agent
  in as somebody else mid-form and the page correctly paused itself with "Account Changed…". Each
  session now gets its own `<label>.localhost` (printed by `pnpm preview:start` and
  `pnpm preview:status`; set `MATRX_PREVIEW_SESSION=<name>` to claim a readable one), which gives it
  its own cookie jar, storage and dev-login nonce on the SAME one server. Two more consequences for
  a trial: the slot being "taken" by a server serving THIS checkout is no longer a refusal — take
  the hostname it offers you — and your failed navigation can no longer burn another trial's nonce.
  Mechanics and forcing proof: `matrx-frontend/docs/official/browser-testing.md`,
  `pnpm check:preview-session`.
- **Cost is a measured result.** Track model spend from `chat.request`; the comparison bar is a
  fresh vibe-code of the same source on cost, sturdiness, reliability, and reuse on source #2–#5.
- **Subagent model/effort (Arman, 2026-09-12):** Sonnet 5 subagents for discovery and any big task
  that doesn't need complex code — this explicitly includes driving a whole trial (reading,
  comparing, distilling, running real cases, judging outputs, logging walls); Opus 5 for complex
  code and important fixes, dispatched BY the Sonnet driver when a wall needs one; Fable/default
  reserved for heavy reasoning and planning, never for driving a trial. See the restatement above
  and `common-docs/policies/subagent-model-ladder.md`.
- **Committed + confirmed on localhost is done (Arman, 2026-09-12).** Do not wait for a release or
  a deploy train to call a fix or a step complete — commit it, verify it works on localhost, and
  move on; the deploy agent's cadence is a separate concern from whether the trial can continue.

## 3. The register — one file, the single source of state

Create `common-docs/projects/<trial-slug>/REGISTER.md` on the first action, modelled on
`expert-book-challenge/REGISTER.md`: rules, source + licence, walls table
(`| W# | Where | What happened | Class | Status/fix |`), real test cases, a UTC timeline, "where
it stands", spend. Update it **as you go**, never at the end — a compaction or restart loses
anything not written. Also write a memory note (`project_<slug>.md`) with the state.

## 4. Hit a wall → fix the class → continue (the loop)

Every stop is one of these; do the matching thing and keep the trial moving:

| Wall | Do |
|---|---|
| Platform defect (silent drop, dead default, wrong error, stale cache, engine gap) | Root cause → census of siblings → shared-layer fix → guard proven failing-then-passing → push → wait for the deploy train (never run a release; >60 min = bug against the deploy agent) → rerun on the live build. Never patch the instance. |
| Missing primitive the method needs | Build it as a platform node/tool in the shared layer (lane named, subagent if it is bounded), wire it through the Conductor by conversation, never by hand. |
| Third-party switch (enable an API, approve an app, a console toggle) | Fix it yourself if you can (you have Arman's machine and logins), else write a ten-minute prompt for a Codex agent, hand it to Arman, start a watcher that wakes you when it is done, and **continue on the parts that do not need it**. It never stops the trial. |
| **Consensus collapse** — the product merged, deduped, synthesized-by-recurrence, excluded a once-seen rule from a build, framed two positions as a problem to settle, or offered Approve-all as the only way through a large review | A wall of the shared layer, not a review step. Keep BOTH positions verbatim in the register, log the wall with the mechanism (`OVERVIEW-GAP-CENSUS.md` names the live ones: the evidence standing and its 3-piece knob, statement-key dedupe, cross-piece-only synthesis, the tension card's recommendation, in-place `update_rule`), fix the class on the rule atom (retained dissent, school, history), continue with both schools alive. |
| The agent (Conductor) is wrong or stuck | Talk to it the way the Expert would; when it repeats a defect class, that is a platform wall (its instructions or tools), not a prompt to fix. |
| A stream detaches / a turn hangs | Read the server-side truth (request rows, `system_errors`) before re-sending; a hung turn with no message to the person is itself a wall. |

Dispatch subagents for bounded fixes (lane named: Sonnet for recon and basic work, Opus for most
coding, Fable only for the rare reasoning you yourself would struggle with — that is what YOU are
here for) and keep driving the trial yourself. Two threads at once is the norm: a fix in flight, the trial advancing.

## 5. What "done for the night" means

Before you call a run a success, read [lessons.md](lessons.md) again.

A run reached the deliverable on a real case, OR the platform is blocked on a build you pushed. In
both cases the register says exactly where it stands, every wall has a status and an owner, and the
morning report exists (§6). "I got tired" is not a stopping point; a blocked deploy is.

## 6. The morning report — what improved, in plain English

Written for Arman: plain sentences, no paths, no codes, no doc pointers (law:
`common-docs/policies/talk-to-arman-like-a-person.md`). Lead with the capability ledger — the count
of "could not → can now" and each row as a capability the next user inherits — and the **tacit
ledger**: how many rules the trial kept that a frontier model would not have produced unprompted,
how many disagreements it kept alive as two positions, and how many the product tried to collapse — then the trial's honest state, then the cost,
then the pending list — items only he can do, each with the prompt already written. Never ask
him to decide something you can find out or do yourself; never send him a question without your
recommendation.

## 7. Improve this skill before you stop

REQUIRED: append to [lessons.md](lessons.md) (§8) what Arman said and what you learned, in one line each with the date, then
run `python3 common-docs/meta/scripts/sync_skills.py`, commit common-docs and every synced repo.
If a lesson changes a rule above, edit the rule — do not only append. Keep the body under 500
lines by relocating trial-specific detail into the trial's register.

## 8. Lessons (append, dated)

Every dated lesson from past trials — the Conductor, headless and cloud driving, draft review, CI and
access refusals, concurrent trials. **Before you choose a subject and again before you judge a run, call it
a success, or trust a verdict — read [lessons.md](lessons.md) end to end.** Also on a stop in your run,
headless or cloud driving, a draft pile, or §7; append new lessons there.
