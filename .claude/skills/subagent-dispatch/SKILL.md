---
name: subagent-dispatch
type: Skill
title: "subagent-dispatch — delegate down, check hard, close the loop"
description: "Delegating work down to subagents: briefs, report statuses, independent review. Use when writing an implementer or verifier brief, dispatching a subagent to build, fix, or verify work you own, or a subagent reports DONE, blocked, or concerns. NOT for campaign-scale doctrine (use campaign-pattern)."
tags: [agents, delegation, verification, doctrine]
timestamp: 2026-09-12T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/subagent-dispatch/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# subagent-dispatch — delegate down, check hard, close the loop

The laws say WHAT: you own the task, every dispatch names its lane
([subagent-model-ladder](/policies/subagent-model-ladder.md)), verification has zero authorship.
This is the HOW. Campaign register, frozen contracts, succession: `campaign-pattern`. Durable
cross-session claims: `work-loop`.
Templates: [implementer-brief.md](implementer-brief.md) · [verifier-brief.md](verifier-brief.md) ·
[re-verify-brief.md](re-verify-brief.md).

## 1. Compose the dispatch (context is the product)

- **One task, not your history.** The brief carries: one line on where it fits; the governing
  spec/vision sections BY PATH (never "read the whole plan"); interfaces and decisions from earlier
  tasks it cannot know; your resolution of any ambiguity you noticed; exclusive file ownership; the
  report-file path. Pasted session history is a defect.
- **Artifacts as files.** Briefs, reports, and review packages go in a scratch dir (`mktemp -d` or the
  session scratchpad); agents exchange paths. Whatever an agent prints back stays in your context —
  hold returns to the ≤15-line contract (§2).
- **Batch same-shape work.** N tiny identical edits = ONE dispatch listing every file; the reviewer
  checks the list file by file (an untouched listed file is a Missing finding). A review's findings
  list = ONE fix dispatch, never one fixer per finding.
- **Name the lane; record the agent id** — fix rounds resume it via SendMessage.
- **Parallel is the default when ownership is disjoint** (frozen contract + exclusive paths).
  Overlapping files or an unfrozen interface → serialize, or freeze the interface first.
- 🚨 **NEVER END YOUR TURN WHILE A BACKGROUND SUBAGENT IS RUNNING.** A completion notice has no idle
  parent to wake: the agent finishes, its report lands nowhere, and the work is silently orphaned —
  you find out only when someone asks days later. So either **dispatch foreground, one at a time**, or
  keep the turn alive (a Monitor/until-loop timer) until every child has reported. (2026-09-10: three
  background runners were stalled this way and a day of eval work was lost.) Backgrounding is for a
  session that is going to keep working anyway, never a way to hand off and stop.
- 🚨 **Every dispatch commits and pushes each unit of work as it finishes, never all at the end.** An
  agent can die mid-run — a spend limit, a kill, a crash — and everything it never pushed is gone with
  no trail back to the task, which is already checked off. Say it in the brief
  ([shared-checkout](/policies/shared-checkout.md) rule 1); two agents were killed by a spend limit on
  2026-09-10 and took their unpushed work with them.
- **More than 3 dispatches in one session → keep a ledger file** (task, agent id, status, commits,
  rulings). In a campaign the register IS the ledger. After compaction trust the ledger + `git log`,
  never recollection — re-dispatching finished work is the costliest failure.

## 2. The report contract, and routing by status

Every brief demands ONE status line, then ≤15 lines (full detail in the report file), then the
worker's own commits (short SHA + subject), evidence, and what it could NOT verify.

| Status | Means | Owner does |
|---|---|---|
| `DONE` | Outcome exists; fresh evidence run for each claim | Build the review package (§3), dispatch review. Never flip on the report. |
| `DONE_WITH_CONCERNS` | Done, with a named doubt | Correctness/scope doubt → resolve before review. Observation → hand it to the reviewer as a named risk. |
| `NEEDS_CONTEXT` | A specific fact the owner holds is missing | Answer exactly; resume the same agent. |
| `ESCALATE` | Needs a stronger lane, more effort, or a ruling | Change something: more context, split the task, a ruling, or one lane up. Never re-run the same lane unchanged. |
| `BLOCKED_HUMAN_ONLY` | One human-only gate, after recovery was exhausted | Verify the gate is real ([defect-ownership](/policies/defect-ownership.md) § The decision before ending an execution task, item 3). Login, tooling, tests, preview, deploy lag → send back as repair work. |

A worker never dispatches a reviewer of its own work — it counts for nothing and duplicates your seat.

## 3. Independent review — two verdicts, never merged

Dispatch per [verifier-brief.md](verifier-brief.md) with the brief path, report path, review package,
and the binding constraints copied verbatim from spec/DECISIONS.
- **A verifier is always a FRESH seat with zero authorship** — never the builder, never a resumed
  worker, never the reviewer that raised the finding. Resuming a seat saves a setup and costs you the
  independence: it re-runs the corpus it already chose, and cannot see what that corpus missed.
- **Review package in a shared checkout:** main moves under you, so never `BASE..HEAD`. Package the
  worker's OWN commits: `git show --stat -U10 <sha1> <sha2> … > pkg.diff`, SHAs from its report
  cross-checked against `git log -- <its paths>` (the git identity is shared, so `--author` proves
  nothing). Record them before dispatching review.
- **Verdict A — vision/spec, on the live surface:** per-target PASS/PARTIAL/FAIL with evidence;
  Missing · Extra · Misunderstood; ⚠ cannot-verify items that YOU resolve before flipping.
- **Verdict B — doctrine/quality, from the diff:** reuse-first (a second implementation?), no-legacy
  (shim, fallback, dead twin?), platform primitive vs feature-local, nothing-silent, opinions → knobs,
  fix-the-class guard shown RED→GREEN, tests that clear `forcing-function-tests`.
- 🚨 **Two verdicts, always, in every review and every re-verify — never one merged checklist.** A
  passing while B fails, or the reverse, is common; separate verdicts are the only thing that stops
  one masking the other. A single list headed "findings by severity" is a merged verdict even when it
  contains doctrine checks, because a doctrine failure can no longer fail on its own.
  Large lanes: run A and B as two parallel seats (B needs no browser).
- **Never pre-judge for the reviewer.** A brief containing "don't flag", "at most Minor", or "the plan
  chose X" is you sparing yourself a loop. Let it be raised; adjudicate it.

## 4. The fix loop (bounded)

Triggers: Verdict A FAIL/PARTIAL, any Critical/Important in B, or a confirmed ⚠ item. Minor → ledger
as deferred and point the final review at the list (a roll-up nobody reads is a silent discard).
- **Rounds 1–2:** resume the original implementer with the findings verbatim. It fixes, re-runs
  covering evidence, appends to its report file.
- **Round 3:** a fresh implementer one lane up (`standard` → `deep`, or `model: fable` only if you
  would struggle yourself), framed "a prior implementer tried twice; you own it; read the report file."
- **Every round ends in a scoped re-verify** ([re-verify-brief.md](re-verify-brief.md)): each finding
  ADDRESSED / NOT ADDRESSED — "attempted" is not addressed — plus new breakage in the fix diff. Live
  proof re-runs the full acceptance targets the fix touches, not just the step the reviewer noticed.
  🚨 A re-verify narrows the SCOPE, never the verdict count: it still returns **Verdict A and Verdict B
  separately** (§3), with the ADDRESSED / NOT ADDRESSED list in front of them. A reopened finding that
  comes back as one merged list has lost Verdict B.
- **Breaker after round 3:** stop dispatching; adjudicate each open finding (§5). A structural failure
  that later work builds on is never parked silently.
- Never fix findings yourself in the owner session — owner fixes skip review.

## 5. Adjudicating findings — attack before you trust, in both directions

A reviewer's finding is a lead, exactly like a builder's report. For each, in order:
1. **Reproduce** it on the current target/build.
2. **Check the record:** contradicts a recorded ruling (DECISIONS/register)? Then it is a conflict —
   rule or escalate it; never "fix" a settled decision away.
3. **Verdict:** CONFIRMED → fix loop · REFUTED → evidence (file:line, command output) · CONTESTABLE →
   your ruling. "Implement it properly" demands get a usage grep first — but table stakes, no-legacy,
   and platform-primitive laws are never YAGNI'd away.
4. **Ledger it:** `Ruling: <decision> — <why> — <cost if wrong>`. Silent discards are forbidden;
   performative agreement ("great catch!") is noise — state the fix or the refutation.
5. Unclear items: clarify ALL before fixing ANY — half-understood related findings produce wrong fixes.

Technical rulings are yours and live in the ledger/register; only genuine vision rulings reach Arman,
batched per the check-in contract (the `take` skill: aidream, matrx-frontend, common-docs).

## 6. Before YOU claim done

The owner's claim needs the same fresh evidence as a worker's: the claim → evidence table in
[verify-live-state](/policies/verify-live-state.md) §4. An agent's "success" is verified by its
commits and a re-run, never by its words.
