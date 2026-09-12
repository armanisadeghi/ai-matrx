---
name: teach-the-system
type: Skill
title: "teach-the-system — teach the platform one body of expertise until it breaks, fix it, continue"
description: "Trial protocol for teaching AI Matrx a real expert's knowledge as a non-technical user, running it until the platform breaks, fixing the platform, and reporting what improved. Use when asked to distil a book, guide, or expert into a Masterwork, test whether the system can capture a human skill, or run an expertise trial. NOT for building a feature you already know is missing (use build-sub-feature)."
tags: [masterwork, distillation, expertise, trial, platform-testing, doctrine]
timestamp: 2026-09-11T16:30:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/teach-the-system/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# teach-the-system — teach the platform one body of expertise until it breaks, fix it, continue

**What this is.** Arman wants an army of Fable-class developers who each pick one real body of
expertise, teach it to AI Matrx exactly the way a non-technical Expert would, run it on real cases
until the platform stops or breaks, fix the platform (never the trial), and continue — and who
report **what improved in the system**, not what happened to the run. The why, in his words, is
`common-docs/projects/expert-book-challenge/PROGRAM.md` — read it once before your first trial.
Night 1's full evidence trail is the sibling `REGISTER.md`; read its walls table before choosing
a subject so you inherit the fixes instead of re-hitting them.

**This skill improves itself.** Everything Arman teaches you during a trial, and every mistake that
cost you an hour, goes into this file in the same session (§7). A trial that ends without a skill
edit either learned nothing or lost it.

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

Prefer subjects that need **no external service**. Fancy APIs make the distillation neither harder
nor easier — the barrier is never technology, it is whether the system captures the skill. When the
method genuinely needs a primitive (reverse image search, a records lookup), build it in the shared
layer and log it as platform capability, not as the trial's achievement.

The source must be freely and legally available (public domain, CC, the author's own site, a blog).
Record the licence and the link in the register.

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
- **Cheat honestly.** A browser instead of an email tool, a pasted chapter instead of the whole
  PDF — allowed, logged as a cheat in the register with what the honest version would need.
- **Sign in without typing a password.** Production browser pane signed out? Use the local preview
  (`pnpm preview:start`, port 3001) with the single-use `.dev-login-nonce` handshake
  (`matrx-frontend/app/api/dev-login/route.ts` explains it). Never type a credential into a field.
- **Cost is a measured result.** Track model spend from `chat.request`; the comparison bar is a
  fresh vibe-code of the same source on cost, sturdiness, reliability, and reuse on source #2–#5.

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
| The agent (Conductor) is wrong or stuck | Talk to it the way the Expert would; when it repeats a defect class, that is a platform wall (its instructions or tools), not a prompt to fix. |
| A stream detaches / a turn hangs | Read the server-side truth (request rows, `system_errors`) before re-sending; a hung turn with no message to the person is itself a wall. |

Dispatch subagents for bounded fixes (lane named: standard/opus by default) and keep driving the
trial yourself. Two threads at once is the norm: a fix in flight, the trial advancing.

## 5. What "done for the night" means

A run reached the deliverable on a real case, OR the platform is blocked on a build you pushed. In
both cases the register says exactly where it stands, every wall has a status and an owner, and the
morning report exists (§6). "I got tired" is not a stopping point; a blocked deploy is.

## 6. The morning report — what improved, in plain English

Written for Arman: plain sentences, no paths, no codes, no doc pointers (law:
`common-docs/policies/talk-to-arman-like-a-person.md`). Lead with what improved in the platform
(each fix as a capability the next user inherits), then the trial's honest state, then the cost,
then the pending list — items only he can do, each with the prompt already written. Never ask
him to decide something you can find out or do yourself; never send him a question without your
recommendation.

## 7. Improve this skill before you stop

REQUIRED: append to §8 what Arman said and what you learned, in one line each with the date, then
run `python3 common-docs/meta/scripts/sync_skills.py`, commit common-docs and every synced repo.
If a lesson changes a rule above, edit the rule — do not only append. Keep the body under 500
lines by relocating trial-specific detail into the trial's register.

## 8. Lessons (append, dated)

- 2026-09-10 — Rules-only sources (style guides, ad checklists) are rejected: "idiotic", almost
  digital. Pick judgment.
- 2026-09-11 — The book's method needed four external primitives (reverse image, metadata, weather,
  fact-check); building them ate the night. Prefer subjects with none; when unavoidable, build them
  in the shared layer and say so.
- 2026-09-11 — Asking Arman to flip a Google console switch was wrong twice: do it yourself or hand
  him a ready Codex prompt and a watcher, then keep going.
- 2026-09-11 — "Model retired?" questions are never for Arman. A bare model default with no mandate
  holder is a **mandate bypass** (ROLLOUT.md A10), not a housekeeping question: fix the class.
- 2026-09-11 — Report what improved, not what the run did. He reads the improvements list first.
- 2026-09-11 — A restart signs the browser pane out; never type the password — local preview +
  nonce.
- 2026-09-11 — Read the register's walls before starting: eight of night 1's runs died on
  platform defects that are now fixed; the next trial starts on that floor.
- 2026-09-12 — A Studio tab left open on the workflow autosaves layout; with a stale build it can
  rewrite every card's type and break the desk mid-run. Before a run, know who has the workflow
  open; a save with no author is itself a defect (fixed: every save now carries its author).
- 2026-09-12 — A server redeploy kills an in-flight run and the watchdog FAILS it instead of
  resuming from its checkpoint. Check the live build time when a run goes silent mid-step.
- 2026-09-12 — "Presented" is not "stored": a to-frontend step emits its shaped result as an
  event and passes its input through unchanged. Any surface judging a run's result (the Audition)
  must read the emitted payload; a Conductor cannot work around it from the workflow side.
- 2026-09-12 — The Conductor turns a one-line Expert correction into a real step ("whose footprint
  to examine") — give it the book's rule, not the fix; it finds the dependency (source waits on
  provenance) on its own.
- 2026-09-12 — Cost of one desk run on a real case: about $1.50 (15 model calls). Quote it.
