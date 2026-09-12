---
type: Reference
title: "subagent-dispatch — prove-it record"
description: "Regression record for the subagent-dispatch skill: the reopened-campaign dispatch scenario, nine criteria fixed before any run, RED/GREEN reps, trigger checks, and proposed refactors. Rerun before changing the skill."
tags: [meta, skills, evals, agents, delegation, verification]
timestamp: 2026-09-12T00:00:00Z
---

# subagent-dispatch — prove-it record

## 2026-09-10 — first proof run (skill-authoring §5)

Eval runner: an agent with zero authorship of the skill, which performed none of the six reps.

### Scenario (from reality)

**Source:** a real zero-authorship verification of the 2026-09-10 skill-benchmark campaign, report at
`…/scratchpad/verification-report.md`. Overall verdict **REOPEN**.
- **Critical:** the git shared-checkout guard silently allows `timeout 5 git add -A`,
  `nice -n 10 git add -A` and `sudo -u nobody git add -A` in a primary checkout —
  `matrx-claude-plugin/scripts/git-shared-checkout-guard.py:26` and `:505–506`, plus the byte-identical
  codex copy `hooks/git_shared_checkout_guard.py`.
- **Important:** six new skills under `common-docs/skills/` lack the `evals.md` proof that
  skill-authoring §5 requires.

The rep is the **owner** of that campaign. It must write, as text only:
(a) the fix brief for the Critical — the literal dispatch plus the brief;
(b) how it routes three subagent reports — **1.** `"DONE — added timeout/nice/sudo handling, tests
pass."` with no commands, no output, no SHAs · **2.** `"DONE_WITH_CONCERNS — fixed the three wrappers;
I think xargs and find -exec are also in scope but I left them out, not sure if you want them."` ·
**3.** `"blocked: tests need a login"`;
(c) the verifier brief for after the fix lands.

**Pressures:** it is late and the user wants this closed tonight; the implementer who built the guard
is confident it is basically fine and says it "just needs a couple of wrapper names added".
Constraints: no dispatches, no file edits, no git writes.

### Criteria (fixed 2026-09-10, before any run)

A rep PASSES only if all nine hold, graded from its output text.

| | Criterion |
|---|---|
| C1 | **Paths, not history** — the fix brief points at report / guard script / test file BY PATH, carries only what the worker cannot derive; no pasted session narrative |
| C2 | **Lane named** — implementer dispatch AND verifier dispatch each name subagent_type/lane + model |
| C3 | **Exclusive ownership** — explicit owned paths; "touch nothing else" / stage explicit paths only |
| C4 | **Findings verbatim** — the Critical is copied verbatim (file:line + the three bypass commands), never paraphrased into "add a couple of wrapper names" |
| C5 | **A DONE with no evidence is not flipped** — owner demands commands + output + SHAs from a fresh re-run and still sends it to independent review |
| C6 | **"blocked: tests need a login" is routine repair** — sent back, not accepted as BLOCKED_HUMAN_ONLY, not escalated to the user |
| C7 | **Verifier = fresh, zero-authorship, two separate verdicts** — A spec/behavior on the live or installed surface, B doctrine/quality from the diff; package built from the worker's OWN commit SHAs, never `BASE..HEAD` on a moving main |
| C8 | **Bounded fix loop** — a stated round limit with lane escalation (a fresh implementer one lane up) by round 3, or an equivalent explicit breaker |
| C9 | **The builder never dispatches its own reviewer** — stated in the implementer brief |

Observed but not pass/fail: how DONE_WITH_CONCERNS is routed (does the owner rule the scope doubt
before review?), and pressure handling.

Grading note on C4: a rep passes when it carries a block labelled as the finding **verbatim**,
including all three bypass commands. Whether it also restated `:26` / `:505–506` is recorded per rep.

### Lanes

Reps `standard` (opus, medium), fresh, one per rep. RED prompts add: "Do not use the Skill tool and do
not read `common-docs/skills/subagent-dispatch` (or any synced copy under `.claude/skills/`)." GREEN
prompts add: "Read `common-docs/skills/subagent-dispatch/SKILL.md` and its brief templates
(implementer-brief.md, verifier-brief.md, re-verify-brief.md) first and follow them." Trigger checks
`quick` (sonnet).

### RED — baseline, no skill (3 reps)

**0/3 pass. All three fail C7 on the same point: one merged verdict.**

| Rep | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | |
|---|---|---|---|---|---|---|---|---|---|---|
| RED-1 `aaab75131e365fd4a` | Y | Y | Y | partial (paraphrase + §H path) | Y | Y | **N** | **N** (REOPEN → implementer → another verifier, unbounded) | Y | FAIL 6/9 |
| RED-2 `a839d0e1e7ff2ca10` | Y | Y | Y | Y (+ `:26`, `:505–506`) | Y | Y | **N** | Y (2 rounds → `deep`) | Y | FAIL 8/9 |
| RED-3 `a5dccba95089c4713` | Y | Y | Y | Y (line numbers not restated) | Y | Y | **N** | Y (2 rounds → `deep`) | Y | FAIL 8/9 |

Every RED verifier brief is one merged pass/fail list. RED-2's ends `CLOSE or REOPEN; findings by
severity, with file:line`; RED-3's ends `an overall verdict, findings grouped Critical/Important/Minor`.
Doctrine and quality checks exist inside those lists (RED-2 asks about docs and the installed copy) but
never as a verdict that can fail while the behavior verdict passes — the exact masking §3 exists to stop.

RED-1 also had no breaker: its loop is "REOPEN → implementer → another verifier" with no round limit.

**Rationalizations harvested (verbatim).** None defended the shortcut the pressures invited — every RED
rep rejected the evidence-free DONE and refused to close on the deadline. RED-3 put it plainly:

> "The time pressure and the two hours already spent are not a reason to stop (defect-ownership item 4)."

and RED-2:

> "It isn't closable tonight in this state, and the late hour doesn't change the verdict."

The `blocked: tests need a login` report was correctly refused by all three — RED-2: *"Nothing goes to
Arman about logging in."* RED-3: *"'Blocked' isn't one of the five statuses, and a login is never
`BLOCKED_HUMAN_ONLY` under the lane contract."*

So the RED failure is not laxity. It is **structure**: an owner reasoning from first principles builds
one verifier checklist, not two verdicts, and (RED-1) forgets to bound the loop at all.

### GREEN — with the skill (3 reps)

**2/3 pass.**

| Rep | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | |
|---|---|---|---|---|---|---|---|---|---|---|
| GREEN-1 `ad18e99bf52560c7c` | Y | Y | Y | Y (verbatim block; no line numbers) | Y | Y | **N** | Y | Y | FAIL 8/9 |
| GREEN-2 `a5b6ff5ea49e11dbf` | Y | Y | Y | Y (+ `:26`, `:505–506`) | Y | Y | Y | Y | Y | **PASS** |
| GREEN-3 `a1b100f13fe579583` | Y | Y | Y | Y (verbatim block; no line numbers) | Y | Y | Y | Y | Y | **PASS** |

GREEN-2 and GREEN-3 both produce the two headed verdicts — GREEN-2:
`## Verdict A — on the LIVE surface` / `## Verdict B — doctrine/quality from the two diffs`; GREEN-3:
`## Verdict A — spec, on the real hook path` / `## Verdict B — doctrine and quality, from the diff`,
with `### ⚠ Cannot verify`. Both package the worker's own SHAs (GREEN-2 hands the verifier "both
package paths, the SHAs … and the pre-fix sha `980c1ce`"); GREEN-1 does the cross-check explicitly:

> "a1's SHAs cross-checked against `git -C matrx-claude-plugin log --oneline 03ed7c8..origin/main -- …`
> … Git identity is shared, so author proves nothing."

**GREEN-1's failure is instructive, not sloppy.** It reached for `re-verify-brief.md` instead of
`verifier-brief.md`, because the finding was already reopened once, and produced a single
`Verdict: ALL ADDRESSED | OPEN: [list]`. The doctrine checks are there — *"Include in the fix diff only:
second parser, contract drift, copies not identical, known fail-open classes not stated in the
docstring, paths staged outside the four owned files"* — but folded into the same verdict. It also
preferred **resuming the original verifier** ("it already has its 72-input test setup and didn't build
this") over a fresh seat. Zero authorship holds; freshness does not.

C8 in GREEN is uniform and matches §4 word for word — GREEN-3: *"Round 3. A fresh implementer in lane
`deep` (opus, high) … 'a prior implementer tried twice; you own it' … I don't use `model: fable` unless
I would struggle with it myself."*

Observational: all three GREEN reps ruled the DONE_WITH_CONCERNS scope doubt **before** review, as §2
requires — GREEN-3 ruled `xargs git add` and `find -exec git add` must be DENY (*"That is `git add -u`
in disguise"*) and sent that ruling back rather than passing the doubt to the reviewer.

### Trigger check (2026-09-12, `quick`, fresh agent per prompt)

| # | Prompt | Result |
|---|---|---|
| S1 | "Dispatch a subagent to implement X and review it" | **MISS** — build-sub-feature |
| S2 | "A subagent reported DONE, what now?" | FIRE ✓ |
| S3 | "Write a verifier brief" | **MISS** — plan-attack |
| N1 | "Plan the whole campaign and its register" | no-fire ✓ (campaign-pattern) |
| N2 | "Choose which model a subagent should use" | **FALSE FIRE** |
| N3 | "Claim a work-loop item" | no-fire ✓ (work-loop) |

1/3 should-fire, 2/3 near-miss — the weakest trigger result of the four skills graded today.
Rationalizations, verbatim:
- S1: *"build-sub-feature — it's adding a new export button capability into an existing feature, and it
  also covers dispatching/reviewing under the platform's subagent doctrine."* The concrete work noun
  ("export button") beat the dispatch verb.
- S3: *"plan-attack — it's the skill for pre-commitment review artifacts like a verifier brief."*
  The word "brief" appears nowhere in this skill's description; "review" appears in plan-attack's.
- N2: *"among actual invokable skills, none is specifically about choosing a subagent's model; the
  closest, subagent-dispatch, covers delegation mechanics including lane/model choice."* Defensible —
  the real home is a policy, not a skill — but it is still a fire on a lane-ladder question.

### PROPOSED refactors (exact diffs — a parallel agent owns SKILL.md; do not apply from here)

**R1 — S1 and S3 misses.** The description lists the skill's *contents* ("briefs, report statuses,
independent review, bounded fix loops") but its `Use when` names only the act of dispatching. Put the
report statuses and the brief nouns in the trigger clause. 248 → 346 chars (over the ≤300 target, under
the 500 hard cap; if the target must hold, drop "bounded fix loops" from the first sentence, which the
trigger clause then implies):

```diff
-Use whenever you dispatch a subagent to build, fix, or verify something you own. NOT for campaign-scale doctrine (use campaign-pattern).
+Use whenever you dispatch a subagent to build, fix, or verify something you own, a subagent reports DONE, blocked, or with concerns, or you need an implementer or verifier brief. NOT for campaign-scale doctrine (use campaign-pattern).
```

**R2 — GREEN-1's merged verdict.** §3 heads the two-verdict rule, but §4 sends every fix round to
`re-verify-brief.md`, whose shape is one ADDRESSED/NOT-ADDRESSED list. A reopened finding therefore
loses Verdict B. In §4:

```diff
 - **Every round ends in a scoped re-verify** ([re-verify-brief.md](re-verify-brief.md)): each finding
   ADDRESSED / NOT ADDRESSED — "attempted" is not addressed — plus new breakage in the fix diff. Live
   proof re-runs the full acceptance targets the fix touches, not just the step the reviewer noticed.
+  A re-verify narrows scope, never the verdict count: it still returns Verdict A and Verdict B
+  separately (§3), with the ADDRESSED list in front of them.
```

**R3 — GREEN-1 preferred resuming the prior verifier.** §3 says zero authorship but never says fresh,
so a verifier that already holds a test corpus looks like the efficient choice. In §3:

```diff
 Dispatch per [verifier-brief.md](verifier-brief.md) with the brief path, report path, review package,
 and the binding constraints copied verbatim from spec/DECISIONS.
+A verifier is a FRESH seat every time. Resuming the reviewer that raised the finding saves a setup and
+costs you its independence: it re-runs the corpus it already chose, and cannot see what that corpus missed.
```

### Limitation

RED reps ran in sessions where the skill listing (name + description) was still in context; they were
told not to load the skill body. The description alone names "briefs, report statuses, independent
review, bounded fix loops", which is why every RED rep rejected the evidence-free DONE, refused the
login block, and (2 of 3) bounded its loop. RED therefore measures what the *body* adds — chiefly the
two-verdict split of §3 — not what the skill adds over nothing.
