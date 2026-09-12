---
name: plan-attack
type: Skill
title: "plan-attack — a zero-authorship agent hole-pokes a plan before anyone commits to it"
description: "Pre-commitment attack on a plan by an agent that did not write it. Use when presenting a feature-deep-dive plan, assigning vision-to-fleet briefs, moving a register to build mode, ratifying a scope list, or coding a new contract or table. NOT for built work or DONE reports (use subagent-dispatch)."
tags: [doctrine, planning, verification, adversarial]
timestamp: 2026-09-12T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/plan-attack/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# plan-attack

Arman's order (`campaign-pattern`, move 3): *"before we take the next step... I want you to have an
opus 5 agent who tries to poke holes in this list and tell us what things we are missing that we will
regret later."* A self-review is not an attack: the author is blind to what they left out.

## When — scale to the stakes

| Plan | Attack |
|---|---|
| Single-surface sub-feature, no new contract/table | None — inline check: coverage + the placeholder list below |
| Sub-feature with a new contract, table, or cross-surface change | 1 reviewer, `standard` |
| `feature-deep-dive` plan (every repo but matrx-ship) · scope list · register → build mode | 2 in parallel: REGRET + BUILDABILITY, `standard` |
| matrx-frontend `vision-to-fleet` brief set | 1 BUILDABILITY reviewer per brief + 1 cross-brief CONTRACTS reviewer, `standard`; `deep` only for conflicting evidence or consequential design, reason stated |

## Dispatch rules

- Fresh agent, zero authorship, lane named ([subagent-model-ladder](/policies/subagent-model-ladder.md)).
  Read-only; it may read code and the live DB.
- **Pin the plan.** Give the reviewer the commit SHA (or snapshot path) it must judge, and say the
  repo may have moved since: drift between the plan and newer live state is not a finding against
  the plan.
- Pass **pointers, never your summary**: plan path, EVERY vision doc from the vision sweep (the `take` skill: aidream, matrx-frontend, common-docs),
  not just the node's VISION.md, the settled-rulings path, repos. The reviewer judges the document,
  not your intent.

## The brief (fill the brackets; send the lens(es) the table calls for)

```
LANE: standard (opus, medium). READ-ONLY. You did not write this plan. Find what we will regret.
Plan: [path] @ [commit SHA or snapshot] — judge THAT version. The repo has moved since; drift
between the plan and newer live state is not a finding against the plan.
Vision: [paths]  Settled rulings: [path]  Repos: [list]

REGRET — what is missing
- Map every vision requirement to the plan item that delivers it; list the unmapped ones.
- Implied-but-unwritten work: integration in both directions; every surface (web, desktop,
  extension, mobile, admin); agent touchpoints.
- Doctrine gaps: table stakes absent (stream/persist/resume/never lose input); a feature-local
  build of what should be a platform primitive; a hardcoded opinion that should be an org knob;
  a fallback or stand-in that does not announce itself; the replaced thing not deleted; a decision
  with no companion machinery (notify / request path / undo).
- Verification: is "done" proven by someone other than the builder, on the live surface, with
  real data? Self-authored tests on manufactured data are a finding. Name every build flag, env
  var, fixture or mock mode, seed script, seeded demo dataset and env toggle the plan can run
  under, and say what proves a verification ran with none of them on — an unnoticed one turns
  every "proven in the browser" claim into a claim about fake data.

BUILDABILITY — could a strong agent with only this item + the repo ship the right thing
- Placeholders: TBD/TODO, "handle edge cases", "add error handling", "similar to X", names or
  types defined nowhere.
- Contradictions between items; producer and consumer disagreeing on a name, type, or signature.
- Load-bearing claims about current code/DB: spot-check them; a stale claim is a finding.
- Sizing: merge items no reviewer could reject independently; split items hiding two
  rejectable deliverables.

CONTRACTS (brief sets only) — every interface one brief publishes matches, by exact name and
type, what every consuming brief expects; each shared file/table/interface has one owner.

CALIBRATION: report only what would make us build the wrong thing, ship a lie, get stuck, or
redo work. No wording, style, or "more detail". Do not approve by default; do not invent
findings. Zero findings is a legal verdict if the coverage map is shown.

RETURN (≤40 lines):
VERDICT: COMMIT | FIX-FIRST
COVERAGE: <n>/<N> requirements mapped; unmapped: [...]
BLOCKING: - [item] finding — why it bites — proposed fix
ADVISORY: - [item] ...
OWNER-ONLY: questions only Arman can rule on (vision/money/brand/legal/data deletion), each with a rec
```

## Adjudicate — the author's job, never skipped

- Every finding gets one of: **FIX** (edit the plan), **REJECT** (a one-line reason, recorded), or
  **OWNER-ONLY** (into the `grilling` tree). Verify a finding's claim before accepting it — reviewers
  are wrong too.
- If a blocking fix changed scope or a contract, re-attack only the changed items with a fresh agent.
- Record one line in the plan/register: `Attacked <date> (<lanes>): N blocking fixed, M rejected (<why>).`
- Arman sees the plan only after adjudication, told in one line that it was attacked and what changed.
  Never forward raw reviewer output.

## Banned

The author attacking their own plan · handing the reviewer a summary · "approve unless serious"
calibration · raw findings sent to Arman · a `deep`/Fable lane by reflex.
