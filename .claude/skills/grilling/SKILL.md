---
name: grilling
type: Skill
title: "grilling — interview by design tree, defaults ship"
description: "The interview primitive for putting open decisions to Arman or any owner. Use on 'grill me' or 'stress-test this', and whenever a plan, scope, spec, vision, or question ledger needs owner rulings. NOT for steps only a human can perform (use a guided session)."
tags: [interview, decisions, doctrine]
timestamp: 2026-09-10T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/grilling/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# grilling — interview by design tree

Mechanic adapted from Matt Pocock's `grilling`, tuned to Arman's contract: he runs ~20 sessions,
answers cold, and must be able to reply "yes to your rec" in seconds. Talking to him follows the
check-in contract (the `take` skill: aidream, matrx-frontend, common-docs); guided human steps follow
[human-steps-are-guided-sessions](/policies/human-steps-are-guided-sessions.md).

## 1. Build the tree, then prune it (before any question)

Draft privately: every open decision, and the decisions that hang off it. Then DELETE every node that is:
- **Settled** — a node's DECISIONS.md or "settled — never re-ask" table, or
  [table-stakes](/policies/table-stakes-are-never-a-question.md) (stream, persist, resume, never lose
  input = always yes).
- **A fact** — dispatch a subagent (lane named). Never ask him anything you can look up.
- **Decidable** from code, doctrine, or established best practice — decide it, with its companion
  machinery ([decisions-must-be-complete](/policies/decisions-must-be-complete.md)). List it under
  "Decided" so he can override.
- **A number that is really a mechanism** — bring the mechanism.

What survives is only: vision, product semantics, money, brand, legal, deleting real data, an account
only he holds, his eyes on a real screen. The one exception: Arman invoking "grill me" on HIS OWN
plan — then challenge his assumptions too, still never ask facts.

## 2. Rounds

- **Frontier** = surviving nodes whose prerequisites are settled. A question whose answer depends on
  another question open this round waits for a later round.
- **≤4 questions per round**, ordered by how much of the tree each answer unblocks.
- **Never block on exploration.** Send the fact-independent frontier now; only questions downstream of
  a running subagent wait. If he can step away while you explore, say so.
- **Number continuously across rounds** (round 2 starts at Q5), so "5 yes" is never ambiguous.

> 🚨 **UNRESOLVED CONFLICT — `CFL-003`. Do not build against this section until Arman rules.**
> **This document says:** deliver questions as plain numbered chat text.
> **[`doc-convergence`](/skills/doc-convergence/SKILL.md) and matrx-frontend's `vision-to-fleet` skill say:** the structured question picker (AskUserQuestion) is an acceptable way to ask closed questions. [`build-sub-feature`](/skills/build-sub-feature/SKILL.md), matrx-frontend's `ui-bakeoff`, and `aidream/CLAUDE.md` side with this document.
> **Why it matters:** with a picker, Arman chooses from fixed options; in plain chat he can answer "3 yes, 4 no because…" and add context nobody asked for.
> **Your move:** bring Arman these two readings and the consequence, get his ruling, then build.
> Register: [`/operations/conflicts.md`](/operations/conflicts.md) · `CFL-003`

## 3. Question shape — exactly this

**Q<n> — <title>.** 2–3 plain sentences of background: no doc references, codenames, item IDs, or
emojis. Then the question, in one sentence.
- **Closed:** options only where they differ in approach, never just in magnitude; the best practice in
  one sentence; **Rec:** one recommendation + the companion work that makes it true + why.
- **Open (vision):** ask open, no rec; capture his words verbatim.
- **About a flow, surface, or behavior:** attach the clickable URL + where to look, OR a mermaid
  diagram of what actually happens, OR a throwaway prototype (Artifact or demo route) labeled
  PROTOTYPE. A question he cannot answer from what you gave him is a defect in the question — and often
  a sign the PATH is broken, which is the real finding.
- **Delivery:** plain numbered chat text (conflicted: `CFL-003`, stamp above).

Every round ends with:
`Decided (override by number): D1 … · D2 …` / `Anything you skip ships with my recommendation.` /
`What else should I know that I didn't ask?`

## 4. After every answer

1. **Record it where it belongs, then commit:** vision → verbatim in VISION/STATE; ruling → the settled
   table, dated; creates work → the pending list or owning handoff; kills work → remove it.
2. **Recompute the frontier:** prune branches the answer killed (say which queued questions died);
   unblock children; a partial answer gets a follow-up next round — never smoothed over.
3. **Skipped** = the recommendation ships, recorded as "default, not ruled". **"Defer"** = a dated
   explicit deferral. **"I need to see it first"** = deferral + the URL he needs. **"I don't know" /
   "we have options"** = the question failed him: research, then bring it back next round with
   better facts, best practice, and a rec — never picked silently, never re-asked as-is
   ([decisions-must-be-complete](/policies/decisions-must-be-complete.md)).

## 5. Done

The frontier is empty: every node is answered, decided-with-override-offered, or deferred with a date.
Then act — no separate "confirm shared understanding" gate. State the final decisions in ≤10 lines in
the same message in which you start the work.

## Banned

One question per message · approval after each design section · "see the doc" · menus of numbers ·
asking whether it should stream/persist/resume · asking a fact · a fork with no recommendation · making
him wait for a full audit before round 1.
