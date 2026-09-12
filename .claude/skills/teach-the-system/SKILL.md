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
- **Cheat honestly.** A browser instead of an email tool, a pasted chapter instead of the whole
  PDF — allowed, logged as a cheat in the register with what the honest version would need.
- **Sign in without typing a password.** Production browser pane signed out? Use the local preview
  (`pnpm preview:start`, port 3001) with the single-use `.dev-login-nonce` handshake
  (`matrx-frontend/app/api/dev-login/route.ts` explains it). Never type a credential into a field.
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
- 2026-09-12 — Arman: this can't become "a couple of little books". Most expertise lives in a
  person's head or in their past work, not in a book — the interview lane and the body-of-work
  lane are first-class subject classes, not fallbacks (see §1). He's also flagged for a while that
  the product's own interview does a shitty job and nobody has fixed it; a trial that hits that
  wall must fix the interview lane itself, not route around it. He has started two more trials
  (7 and 8) remotely himself, contents unknown to us — check for overlap before starting a new one.
- 2026-09-12 — Arman: a Sonnet 5 subagent dispatched by an owning session IS "the developer" for a
  trial — driving the product, judging outputs, logging walls, writing the register is not complex
  code. That driver dispatches its own Opus fixes for the bounded code walls; it must never punt
  the trial back up as too big. If you are that dispatched driver, this file already authorizes
  you to run the whole loop yourself.
- 2026-09-12 — (interview-lane trial) The guided vision-interview / "Talk it through" flow, run
  straight through a full 9-turn, 26-rule session with two deliberately planted contradictions, hit
  zero walls: it caught both contradictions unprompted, refused to fabricate a rule for genuinely
  new territory, cross-referenced two unrelated stories as one underlying question on its own, and
  refused to answer a meta-question in the Expert's own voice. This directly contradicts the
  standing complaint that the interview "does a shitty job" — before assuming that report is still
  true, run a real session and quote it; a stale complaint is not evidence against today's build.
- 2026-09-12 — (interview-lane trial 2, hard persona) Arman: a cooperative, articulate persona only
  tests an easy human — his complaint is about a real one (terse, impatient, contradicts itself,
  refuses, half-answers). Re-running the same interview lane with a terse GM persona (flat refusal,
  a false "already told you" claim, a cross-turn contradiction, a within-message self-correcting
  exception) still hit zero blocking walls: it deferred a spotted contradiction to finish a live
  story, then returned unprompted quoting both original statements verbatim; it told apart a real
  unresolved exception (refused to fold it in without the axis) from a self-correcting one (its own
  stated trigger, correctly folded in without manufacturing a false contradiction); it remembered a
  stated time limit nine turns later unprompted and accepted a flat refusal without nagging. One
  real miss: it accepted a false "I already told you" claim without checking the record, leaving a
  genuine gap uncaptured — worth watching across future trials before calling it a pattern. Test the
  hard persona, not just the easy one, before judging an interviewer's real quality.
- 2026-09-12 — (trial 8, the unfolding case) A cloud session's environment can carry a STALE credential: the
  Supabase publishable key in the container was not the project's live key (401 on every auth call). Read the
  live publishable key through the Supabase MCP (it is public by design) and log the drift as a wall; never
  spend an hour on "auth is broken".
- 2026-09-12 — (trial 8) The honest headless path is THE SAME CALLS THE UI MAKES: a password grant for the
  session, aidream `/api/...` with the bearer AND `X-Organization-Id` (the server never picks an org), PostgREST
  for what the UI writes directly, a browser user agent (Cloudflare 1010 refuses the default Python one), and
  the Rulebook rendered as the `rulebook_document` variable exactly as the client renders it. Log it as a cheat.
- 2026-09-12 — (trial 8) Take every timestamp from the database clock (`select now()`), never from your own
  sense of elapsed time: three register lines were 10–25 minutes ahead of the truth before the correction.
- 2026-09-12 — (trial 8) The capability gate is the cheapest, sharpest evidence of the night: one real case
  through the old lane, 74 seconds, $0.22, and the loss is visible in the rules themselves (every rule citing
  `chunk: 1`, hindsight written as method). Do it first, quote the rules.
- 2026-09-12 — (trial 8) Guidance texts distil into piles (336 drafts from 18k words; 83 from a back-pain
  guideline) because the chunk distiller never sees the Rulebook's PURPOSE. Do not review a pile by hand and do
  not "Approve all": the Expert says what the Rulebook is for, and the platform sorts the pile (the triage
  primitive). Asking the Scout to "retire these classes" dies at its output ceiling with zero tool calls.
- 2026-09-12 — (trial 8) When the AI Dream MCP refuses the account ("does not have full MCP access"), the
  product's own agent service is the lawful route (`POST /api/agent-service/agents` is the same trained builder
  the form calls; `PUT /api/mandates/{key}/binding` with `principal_type: global` binds the Holder). Declare the
  mandate seedless in code; never insert an `agent.definition` row by hand. The builder picks its own model
  (it chose Gemini Flash three times) — move judgment-heavy agents to the tier you meant; a model move is safe
  by default.
- 2026-09-12 — (trial 8) A cloud container reaches nothing but HTTPS: raw Postgres times out, so the "offline"
  type emitter (which imports the app, which loads domain config from the database) cannot run, and any unit
  test that touches the live pooler hangs forever. Expect both; log them as the generator's and the test's
  defects, never hand-edit a generated file.
- 2026-09-12 — (trial 8) Five parallel builders on one branch worked when each owned named files and the
  cross-cutting names (the policy rule fields) were fixed in the briefs up front; the one collision was a
  router hunk swept into a sibling's commit (shared-checkout normal) and one duplicated vocabulary, both caught
  by guards the builders wrote. Add a census guard for every "each lane must declare X" rule the night creates.
- 2026-09-12 — (trial 8) Review bots are free verifiers: Cursor Bugbot found five real defects in tonight's
  frontend (state dropped on reopen, an effect loop, a hidden rejoined run) that no builder's tests caught.
  Treat every bot finding as a bug report and fix the class before the morning report.
