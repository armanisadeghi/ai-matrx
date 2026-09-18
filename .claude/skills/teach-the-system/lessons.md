---
type: Reference
title: "teach-the-system — lessons from past trials"
description: "Every dated lesson appended by past expertise trials (Conductor behaviour, headless and cloud driving, draft review, CI, access, concurrent trials); the skill sends you here once before choosing a subject, again before judging a run, calling it a success, or trusting a verdict, and whenever a run hits a stop, drives headless, faces a draft pile, or appends a lesson at §7. Companion to the teach-the-system skill."
tags: [teach-the-system, skills, lessons]
timestamp: 2026-09-14T00:00:00Z
---

# teach-the-system — lessons (append, dated)

Section numbers (§0–§7) below refer to this skill's SKILL.md. Append each new lesson at the end, one line
with the date (SKILL.md §7); if a lesson changes a rule, edit the rule in SKILL.md too.

## Contents

- 2026-09-13 — commits that contain nothing, guards that test the wrong thing, primitives' homes, auditing the instrument
- 2026-09-10 → 2026-09-13 — the main log: subject choice, Arman's rulings, the Conductor, trials 3, 7, 9 and 12
- 2026-09-12 — interview-lane trials, the Sonnet driver, trial 9 runs 3–6 and the newsroom exam
- 2026-09-12 — trial 8 (the unfolding case): stale credentials, the honest headless path, parallel builders
- 2026-09-12 → 2026-09-13 — Arman's architecture brief and the gap census; concurrent trials, CI, access refusals, trials 7–9
- 2026-09-14 — the fair re-run: trial 2 re-graded, the subject rule replaced by the Moat Gate

## Lessons

- 2026-09-13 — **A commit that claims changes is not a commit that contains them.** `git add`
  fails the WHOLE add on one unmatched pathspec and stages nothing; with `2>/dev/null` on the
  command, that failure is invisible. A `git mv` had already moved one of the listed paths, so a
  "fix" commit landed as `1 file changed, 0 insertions, 0 deletions` — the rename without its
  importer, leaving the branch un-compilable while the real work sat uncommitted. Never silence
  stderr on `git add`; read `git show --stat` before believing a commit's own message.
- 2026-09-13 — **A guard can test the wrong thing and feel like proof.** A test written for "a
  successful heal clears an older failure" drove the ledger directly and PASSED on the broken
  code, because the ledger was never the broken part — the caller reaching past it was. Putting
  the original defect back and watching the test stay green is the only thing that catches this.
  Prove every guard RED, on the real defect, not on a nearby one.
- 2026-09-13 — **When a rule recurs a third time, the fix is where the primitive LIVES.** Two
  dialogs had already been fixed for per-Rulebook state; a third reproduced it because the shared
  hook sat under `triage/` and read as that feature's property. Moving it to a neutral home and
  writing the call-site half into its docstring is the fix; a fourth comment saying "remember to
  do this" is not.
- 2026-09-13 — **Watch for the reviewer moving from the feature to the INSTRUMENT.** Two findings
  landed in the surfaces that decide whether a desk passed: the Audition's safety column showed
  the SAFEST verdict in the same red as the worst one, and the stand-in card showed a failure over
  a rebuild that had just succeeded. A broken feature wastes a run; a broken exam sends the Expert
  to fix something that was never broken. Audit the instrument before trusting any trial verdict.

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
- 2026-09-12 — (trial 12) A Rulebook's free-text DESCRIPTION is a smuggling channel. The desk built from
  88 approved dispositions still opened with one question and refused to advise — because the run quoted
  the description back to itself as "the doctrine" and derived its deliverables from it. Before you credit
  a Rulebook for a behaviour, read the run's own report and see which text it is actually obeying.
- 2026-09-12 — (trial 12) The Understudy could not rebuild, for any Rulebook, because an automated write
  declared `actor_tier=code` without naming a system and the provenance CHECK refused it — and the browser
  caught the 500 and wrote it to the console. Two lessons: a fire-and-forget "poke" is a silent-failure
  machine unless the surface shows the staleness it causes; and when a stand-in's behaviour disagrees with
  the page's counters, read the built definition's own metadata before believing either.
- 2026-09-12 — (trial 12) Approve/reject every draft one at a time through the wizard and the loop is
  cheap to script, but check the counts in the database afterwards — the wizard's last card can be left
  undecided and "reached last" is not "all decided".
- 2026-09-12 — (trial 12) A run's report that opens with its own PRE-EXECUTION PROTOCOL, a rule
  cross-reference table and a self-audit is not a deliverable, it is homework. Judge what the person is
  shown, not what the agent produced.
- 2026-09-13 — (trial 12) The coherence questions come with a RECOMMENDATION, and it is stated with the same
  confidence whether it was read off the source or inferred. Six of seven were faithful; the seventh urged
  writing clinical red flags into a rule the source never attached them to, justified as what the Expert
  "clearly already has in mind". Accepting it would have stored the system's guess under the Expert's name
  with the Expert's provenance. Check every recommendation against the source before clicking, and log the
  ones you decline — that is a platform finding, not a preference.
- 2026-09-12 — Arman, launching trials 7 and 8: victory = the count of "could not → can now"; aim at
  opinionated methods a frontier model would not produce unprompted (his keyword-research order, an
  agent equipped with Tony Robbins' systems); Sonnet for recon, Opus for coding, Fable rarely. Folded
  into §1 (test 4), the scoreboard paragraph, §4 and §6; the examples live in PROGRAM.md rulings 6–7.
- 2026-09-12 — A "write two prompts for two agents" ask is not done when the files exist: either launch
  the sessions or hand Arman the paste-ready wrapper in chat. Files in a folder read as documentation.

- 2026-09-12 — Arman: this can't become "a couple of little books". Most expertise lives in a
  person's head or in their past work, not in a book — the interview lane and the body-of-work
  lane are first-class subject classes, not fallbacks (see §1). He's also flagged for a while that
  the product's own interview does a shitty job and nobody has fixed it; a trial that hits that
  wall must fix the interview lane itself, not route around it. He has started two more trials
  (7 and 8) remotely himself, contents unknown to us — check for overlap before starting a new one.
- 2026-09-12 — Arman: a Sonnet 5 subagent dispatched by an owning session IS "the developer" for a
  trial — driving the product, judging outputs, logging walls, writing the register is not complex
  code. That driver dispatches its own Opus fixes for the bounded code walls; it must never punt
  the trial back up as too big. If you are that dispatched driver, the skill's SKILL.md already authorizes
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
- 2026-09-12 — (trial 9, runs 3–6) A fix to a kind's MODEL is not live until its registry row is
  republished; a CI amnesty list that "warns" on a fatally-enforced kind is a hole (W57). The
  Conductor wires template paths blind to the upstream shape; nothing checks `$item.x` before money
  is spent (W58). Four parallel agents deadlock on the secrets battery's per-generation UPDATE;
  a transient SQLSTATE was never retried anywhere (W59). Each was the NEXT step after the previous
  fix — run the desk again after every fix; the walls are sequential, not parallel.
- 2026-09-12 — An empty-but-schema-valid answer passes kind validation and the run says "completed"
  (W60: the audit, $2.24, three calls, every field blank). Read the deliverable's fields, not the
  run status, before calling a run a success.
- 2026-09-12 — Another agent's live migration can take the whole platform down under you (W61: a
  `current_user = 'service_role'` test inside a SECURITY DEFINER body is never true — current_user
  is the OWNER there). When the Conductor panel refuses with a mandate message, read the function
  and `_schema_migrations` since the last time it worked before blaming the product.
- 2026-09-12 — The exam judgment is the capability finding: the desk held 416 craft rules and the
  writer obeyed few of the ones that matter, because NO step judges a Masterwork's output against
  its own Rulebook and the Audition cannot do a gap analysis against a sealed reference. Feed the
  editor's instructions back to the Conductor as rules and self-checks, not as a rewrite.
- 2026-09-12 — Exam fairness: the published piece carried reporting the bundle lacked (interviews,
  later cases). Tell the judge to score only what the record allows, or bundle what the newsroom
  actually had; otherwise the verdict measures access, not craft.


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


- **2026-09-12 — Arman's architecture brief (`OVERVIEW.md`) and the gap census.** The mandate is tacit,
  multi-modal, provenance-tagged, dissent-preserving expertise. The census found the platform had
  built the opposite the same week and three trials had walked into it: trial 9 turned 416
  observations into 4 rules and shipped "evidence standing" as the fix; trial 3 collapsed its planned
  two-school pair into one Rulebook and settled every tension to a side; the interview lane rewrote a
  contradicted rule in place and the register called it the best moment. Trial 2 met the mandate only
  by duplicating the whole machine (two Rulebooks, 11 runs, 13 fixes). New rule in §1 (test 5), §2
  (never collapse consensus), §4 (the wall row), §6 (the tacit ledger). Fixes dispatched the same
  night: retained dissent on the rule atom, the invisible policy rules, the voice-first and YouTube
  doors, the blind pairwise Audition arm; the `school` dimension is under design and attack
  (`DESIGN-schools-on-the-rule-atom.md`).
- 2026-09-13 — (trial 12, found at a PR check-in) 🚨 **Trials run concurrently against ONE platform, and two
  of them built the same primitive on the same night, on the same field names, in the same files.** Trial 8
  landed a flat `precondition`/`next_action` policy shape on `main` while trial 7 was building a structured
  one on the same keys; the collision surfaced only as 22 conflicted files at merge time, after both nights
  of work were done. **Before you build a shared-layer primitive, read the other live trials' registers for
  what they are building right now — not just their walls tables** — and name your new fields in your own
  namespace when the concept is one another trial could plausibly reach for. When the collision has already
  happened, the LIVE DATA decides who keeps the key names (here: 592 rules already carried the string form,
  zero carried the object), which makes it a correction you resolve, not a question for Arman. Abort a blind
  merge rather than resolve 22 semantic conflicts at speed.
- 2026-09-13 — (trial 12) A local `pnpm type-check` on a SHARED checkout is not the verdict. After the merge
  it reported 183 errors; 182 were `Cannot find module '@ai-matrx/*/content-transfer'` because the checkout's
  installed packages lag what main's code imports, and 1 was main's own unpublished mandate key. CI installs
  fresh and its type-check job passed on the same commit. Check the CI job before reporting a local type
  failure as the branch's, and say which one you are quoting.
- 2026-09-13 — **A refusal is not a permission wall until you have checked the credential.** A lane spent hours
  blocked on "no MCP access" and filed it as a wall for Arman; the configured grant was already on both
  accounts and the token in hand was simply stale. Before recording any access refusal as a human step,
  re-issue the credential and re-try — routine access refusal is repair work, not a page.
- 2026-09-13 — **Review found the same defect twice, one level apart, in the session's own convergence code.**
  A converter rebuilt a record from the subset of fields one form owns, then the fix rebuilt a nested half the
  same way. Fix these as the CLASS — carry every key the surface does not own — never by naming the key that
  was reported; and expect a merge that reconciles two data shapes to be exactly where a field falls out,
  because every test the merging lane runs will pass.
- 2026-09-13 — (trial 7) **Read the CI LOG, never the check's NAME.** Three guards named "(UNMEASURED without the secret)" were red WITH the secret present and returning real verdicts — one of them a live security finding. Triaging by title, I told the pull request they carried no information. A guard named for its failure mode is a trap for whoever triages it. Also: when a failure COUNT moves, find out which item changed — assuming the set is still the known one is how a real regression walks through behind familiar noise.
- 2026-09-13 — (trial 8) **A merged PR is not a working feature: check the ROWS, not the code.** THE PROVIDER-OUTAGE ALARM shipped whole — detector, endpoint, tests, all green — and could not fire, because the migration seeding its three knob rows wrote a `propagation` word the table's CHECK constraint has never allowed. The INSERT was refused with a bare 23514 naming the constraint but not the word, and the file sat unapplied for a day. Any feature configured by knob rows is OFF until you have read those rows back from the live table; "the PR merged" proves nothing about them.
- 2026-09-13 — (trial 8) **A cloud session with no Postgres pooler still has the Supabase MCP.** I had been reporting three items as "only Arman can do this" on the belief that this container could not write to the database. The pooler port genuinely does not open and the service key in the environment is rejected, but the Supabase MCP works for reads AND data writes — which is aidream's declared migration mechanism anyway (`.sql` files are records, not mechanisms). Before handing anything to Arman as a database step, try that door: a whole class of "blocked" turned out to be one tool call.
- 2026-09-13 — (trial 9) **Run every ARM of a comparison before you conclude anything from it.** The newsroom
  exam judged the desk against the published piece twice and drew capability conclusions from it, while the
  raw frontier model had never been handed the same bundle. A workflow's score against ground truth alone
  cannot tell you whether the workflow is doing the work — Arman's benchmark brief names four arms (frontier,
  small, workflow+small, workflow+frontier) plus ground truth for exactly this reason. Missing arms are
  missing measurement, not a detail.
- 2026-09-13 — (trial 9) **When an agent says "I am blocked by system policy", read the tool trace.** The same
  Conductor claimed "all changes made now and live" twice having made no tool call at all, and then on the
  third turn genuinely was refused by the database: its agent write declared an automated actor with no system
  name, and a 120-second tool ceiling had already killed the slower attempt. Two lies and one true refusal
  wearing the same words. The trace is the evidence; the agent's paraphrase turned a missing header into an
  imaginary rule, and a non-technical Expert would have believed it.
- 2026-09-13 — (trial 9) **A failure classified from text will read the user's own documents as its cause.**
  A checkpoint write timed out; the cause ladder ran a regex for "guardian|age undeclared" over a technical
  string that embedded the legal complaint, and the run box told the admin "this account needs an age check
  before AI can run". Classify by exception CLASS first, and never let a classifier see argument payloads.
   Its sibling: a resumable chat pause (the tool loop guard) reaching an unattended workflow step is a blind
   failure — "no error detail recorded" while the guard knew the tool, the count and the error.
- 2026-09-14 — **The fair re-run: trial 2 re-graded under the doctrine, and the subject rule replaced.**
  Re-running trial 2 (Watson vs. Montessori) with the raw frontier model handed the same book in context
  (the A1 arm) showed it matching or beating the Masterwork built from it — the earlier "passed" verdict was
  a two-arm comparison with no raw-model arm at all, exactly the class of error CORE.md §4 and the five-arm
  bench exist to catch. Lesson, ruled by Arman into `common-docs/systems/masterwork/doctrine/CORE.md`: a
  public book is an input, never a subject that proves the product on its own; the old book-first / three
  subject-class rule in this skill's §1 is superseded by the Moat Gate (peers disagree; scarce, locked,
  idiosyncratic, non-stationary, private; gate by measurement with the A0 probe, never by assumption) plus
  the recency amendment (content under ninety days old is the best proving ground) and the bright line (raw
  arms get every pre-existing input, never our engagement artifacts). Grading itself moves from any two-arm
  audition to the five-arm bench (A0/A1/A2/B/C/GT) on the seven-metric spine, run via the
  `aidream/services/masterworks/bench` CLI until the bench UI ships. Also ruled the same day: Arman is not a
  trial subject until the CORE.md §8 readiness gate is met.
