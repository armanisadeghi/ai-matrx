---
name: low-hanging-fruit
type: Skill
title: "low-hanging-fruit — find the almost-done and CLOSE it"
description: "The recurring hunt for features, projects, and concepts so close to completion that finishing them beats everything else — verify closeness against code, close them out fully (shipped, verified, docs deleted, rows removed), and end the never-ending development state. Use with /low-hanging-fruit; schedule per Arman's approval."
tags: [meta, closure, maintenance, docs-system]
timestamp: 2026-08-20T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/low-hanging-fruit/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# low-hanging-fruit — find the almost-done and CLOSE it

**Arman, 2026-08-20 (vision — [/systems/docs-system/VISION.md](/systems/docs-system/VISION.md)):**
*"Features, concepts, projects, things that are so close to completion that it's just so
much easier to stop other stuff, focus on it, get it done, close it out… so that we can
delete all the documentation and all the plans and all that stuff and clean it up. Right
now, what happens is things are sort of in a never ending development state, and that's
what we've gotta put an end to. That's what's killing us everywhere."*

A run of this skill produces CLOSURES, not lists. A "closed" item means: the remaining work
is SHIPPED and verified (behavior + release, per the workspace release-gap rules), the
handoff is DELETED, the register row is gone, the project is archived, the node's STATE.md
records the finished state in one line, and nothing anywhere still calls it pending.

## The hunt — where fruit hides

Sweep these, in order, and score every candidate by *sessions-to-done* (honest estimate
after verification, not doc claims):

1. **The register's Tails** (`operations/unassigned-handoffs.md`) — by definition one
   focused session each. They go first, always.
2. **Feature/Program handoffs with tiny remaining lists** — a handoff whose Remaining Work
   is ≤3 small items is a mislabeled Tail; verify, then collapse per the tail law and close.
3. **STATE.md pending lists** — items marked pending that a probe shows already shipped
   (false-pendings are free fruit: closing them costs one verification).
4. **The migration board** (`operations/doc-migration.md`) — Wave 1 rows are mostly
   mechanical single-session closures.
5. **The attention board's Table B** (`operations/attention.md`) — aging work is often aging
   precisely because it is 90% done and boring.
6. **`projects/` dirs with no Status or a stale one** — many are finished-but-unarchived;
   archiving IS closure.

## The law of the run

1. **Verify before you believe.** A doc's "almost done" is a claim; probe the code, the DB,
   the deployed state. Score only what you confirmed.
2. **Rank by sessions-to-done, ascending.** Then EXECUTE from the top: close everything ≤1
   session yourself, this run. Items of 2–3 sessions get dispatched as self-contained
   background sessions/chips. Anything larger is NOT fruit — leave it, note why it looked
   ripe.
3. **Closure is total.** Ship + verify + release-gap closed + handoff deleted + row removed
   + project archived + STATE updated + docs/plans for it deleted (git keeps history).
   Partially closing something ADDS a state; that is the disease, not the cure.
4. **A blocker only Arman can clear** becomes ONE attention-board row (guided session,
   urgency set honestly) — the #1 reason fruit rots is that nobody told him it was one
   answer away.
5. **Scorecard.** End with: candidates found, verified scores, closures completed (with
   proof), sessions dispatched, blockers escalated — one dated log.md entry under
   `**Update**: low-hanging-fruit run`.

## Boundaries

- Never "close" by deleting the work itself — the unfinished-work alarm and we-don't-do-legacy
  rules both apply: finishing and killing are different verbs, and killing needs Arman's
  written word.
- Never mark done what you did not verify shipped. A false closure is worse than an open item.
- Scheduling: runs on the cadence Arman approves by name and interval — never self-scheduled.

# Changelog

- 2026-08-20 — Created per Arman's ruling in the docs-system overhaul session.
