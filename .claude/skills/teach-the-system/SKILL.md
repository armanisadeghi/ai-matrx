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
- 2026-09-12 (night 2) — When a Conductor goes silent mid-build, read the ledger before pressing
  anything: `chat.request` (last finish_reason), `chat.tool_trace` (the failing tool and its
  `err_msg`), `ops.app_log` around the timestamp. Then reopen the conduct page, press Continue, and
  tell the Conductor in plain words what the server did; it resumes exactly where it died.
- 2026-09-12 — The Conductor writes rules back to the Rulebook through a tool the BROWSER applies.
  Keep the conduct page open in the tab you are driving; the `/chat/<id>` view cannot apply it and
  the turn dies silently (W49). Its "Apply" opens the Add Rule dialog; you still press Add rule.
- 2026-09-12 — "Every joint checked — no breaks" from the Conductor is a claim, not a proof: run
  the built thing once on the real case before believing it (W48, W51 both passed the check).
- 2026-09-12 — If the browser pane is hidden, clicks and typing fail; the form tool and a scripted
  button press still work. Sharing the checkout with other agents breaks the dev build several
  times an hour; when a page goes blank, check the file they are editing, wait a minute, reload.
- 2026-09-12 — Two conductors given the same brief chose different architectures: Watson baked the
  rules into three minted agents; Montessori loaded the 115 rules BY ID into the run and added a
  real pause for the parent's answers. Record the architecture each one chooses; it is evidence
  about the platform, not only about the book.
- 2026-09-12 — (trial 3) A cloud container has no product checkout: drive the LIVE build headless (Chromium
  needs `--ssl-version-max=tls1.2` through the agent proxy; the proxy also refuses websockets, so live
  streams and run boxes go quiet — read `workflow.run` / `chat.request` for truth, and never charge a
  lost live view as a platform wall without ruling the proxy out). Log it as a cheat.
- 2026-09-12 — (trial 3) Attach guides by LINK; when a site refuses the reader (Substack did), paste into
  a New document — the document editor is a canvas, so type into it and reload to prove it persisted.
- 2026-09-12 — (trial 3) Review every draft rule yourself and REJECT with a reason; "Approve all" hands
  the Conductor housekeeping rules that pull the desk toward the source's own world (Wikipedia patrol
  steps in a blog editor). The coherence questions the Rulebook raises are real Expert calls — answer
  every one before building; the Conductor reads the answers.
- 2026-09-12 — (trial 3) Give the Conductor the rule, not the fix: told "the editor asks the writer instead
  of inventing", it noticed the rule was missing from the Rulebook and staged it itself; told "three or
  more tells", it asked whether that bar governs craft rules too (it must not) — answer the second
  question, it is the one that decides how aggressive the desk is.
- 2026-09-12 — (trial 3) When the agent builder dies on a retired model, tell the Conductor to run the
  step as a plain model call with the same instructions and keep going; the platform fix rides the
  branch in parallel. Never wait on a deploy while a product-side route-around exists.
- 2026-09-12 — (trial 3) A blind pairwise judge (fresh Opus, randomised A/B, key sealed) is cheap
  (~$0.10) and honest; it found the exact eight word-level differences on its own. Seal the key BEFORE
  reading the verdict.
- 2026-09-12 — (trial 3) The Conductor infers approvals from version bumps ("your Rulebook moved to 158,
  so you've approved it") — check the draft flag in the database before believing any state it reports
  about your rules.
- 2026-09-12 — (trial 9, the newsroom exam) The body-of-work lane distilled the SITE (sponsor lines, staff
  bios, tag order) as craft because the page reader handed it the whole page; fixed at the one scraper
  door (THE MAIN-CONTENT LAW). Before distilling any corpus of links, spot-check what text the platform
  actually read.
- 2026-09-12 — (trial 9) 20 pieces → 416 drafts is not a review, it is a defect: per-piece rules are
  EVIDENCE for the synthesis (now `standing: evidence`, promoted at a knob's threshold). Never Approve-all
  a corpus run; if you must, log the cheat and give the Conductor the classes to set aside.
- 2026-09-12 — (trial 9) A multi-document case breaks a one-call step twice: first the reply is cut at the
  output ceiling (the engine used to call it a parse failure — now `output_truncated` with the remedy),
  then a For-Each gather hands the next step whole transcripts (a million tokens). Tell the Conductor
  "one document per call, merge after, map from the gather's structured outputs" — and read
  `chat.request.finish_reason` before believing any "could not be parsed".
- 2026-09-12 — (trial 9) When every Rulebook page 500s, read the PostgREST log before touching the trial:
  `42P17 infinite recursion in policy` means another lane's migration regenerated RLS through a generator
  that reads its own table — a class fixed twice in August with no guard. The repair is a generator
  patch + regeneration + a release-gate guard, and a policy ARM that calls a SECURITY DEFINER door
  needs EXECUTE for the calling role plus a `client_callable_door` row (the second 403 half).
- 2026-09-12 — (trial 9) The platform's Audition already takes a real reference and a vanilla arm; the
  newsroom exam is its strongest use (the published article IS the reference). Seal the reference before
  the run; never let the desk or the vanilla arm see anything dated after the sources.
- 2026-09-12 — (trial 7, the unfolding case) Write the cross-repo CONTRACT before dispatching the build:
  one document with the kind shapes, the rule fields, the node's handles and the Audition's request,
  then five lanes (three aidream, two frontend) landed in about ninety minutes with no merge conflict.
  The price is contract drift between halves — give every frontend lane a "consumer contract check"
  against the pydantic models and expect a small alignment lane after.
- 2026-09-12 — (trial 7) Prove the capability gate on the real thing FIRST and write down exactly what
  the old lane lost (W57: 19 static rules, one flat section, alphabetical, no known/unknown, half
  literature). That paragraph became the contract's §0 and the guard's pinned failure.
- 2026-09-12 — (trial 7) Headless on the live build: ONE browser context at a time — two contexts from
  one saved state rotate the refresh token and sign each other out ("Sign in to open this rulebook");
  make the driver re-login when it sees that page. The guided start's approach cards are buttons whose
  names begin "Start now…", so match Start exactly.
- 2026-09-12 — (trial 7) A training workbook or a guideline PDF distils its PACKAGING as craft — course
  attendance, exam pass marks, licence boilerplate, publisher disclaimers (W59). Reject by class with
  one reason each; the platform fix is a source-frame on every rule (method vs packaging).
- 2026-09-12 — (trial 7) Budget the paste lane: about one rule per fifty words from a checklist-style
  source and about $6 per ten thousand words on the Opus distiller (189 rules from 9,900 words).
- 2026-09-12 — (trial 7) The coherence pass asks about REJECTED drafts as if they were live (W62);
  answer "set aside, not part of the desk" and log it — do not re-litigate a rejection.
- 2026-09-12 — (trial 7) Check the MCP door in the first minute (`agent_catalog list_models`): it is a
  per-account flag (W61), and when it is off the product's own New-agent builder is the path; the flag
  is a ten-second item for Arman, never a reason to stop.
- 2026-09-12 — (trial 7) From a cloud container there is no door to the two publish scripts (mandate
  Holders, kind registry rows) — they need direct Postgres (W60). Plan every new mandate or kind as
  "declared in code, synced at boot, Holder authored in the product, rows published by one command on a
  machine with DB access" and put that command on the pending list from the start.
- 2026-09-12 — (trial 7) Bugbot findings on your PR are bug reports: one fix lane with red-first
  guards closed seven; the reload loop it named was a class across four ingest dialogs.
- 2026-09-12 — (trial 7) Main was red twice on gates the PR never touched; compare the generated files
  byte for byte with main before treating a CI red as yours, then one standing-down comment.
- 2026-09-12 — (trial 7) Take every timestamp from the database clock; my first timeline entries were
  guesses twenty minutes ahead of reality and had to be rewritten.
- 2026-09-12 — (trial 7) The review wizard has no class-level action: 400 drafts meant 400 clicks, done
  by a script walking the product's own wizard with a decisions file written after reading every
  statement (logged as a cheat). Class-level review ("reject every course-logistics draft") is a gap.
