---
name: take
type: Skill
title: "take — staff yourself on a name and drive it to done"
description: "Arman passes ONE name (/take <name>) — a Feature, Program, or Tail from the unassigned-handoffs register, or any registry node — and the agent does the rest: claims the row, gathers the node's whole truth, then builds under his standing doctrine (bias to action, vision is the definition of done, build on what exists, integrate both directions, catch up then expand, never lose work, groom don't grow). Converted 2026-08-21 from his Feature Task Assignment prompt; his rules are quoted, not paraphrased."
tags: [staffing, execution, handoffs, registry, doctrine]
timestamp: 2026-08-21T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/take/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# take — staff yourself on a name and drive it to done

**Invocation: `/take <name>`.** That name is all Arman gives you. Resolve it yourself:

1. **The register first** — [`operations/unassigned-handoffs.md`](/operations/unassigned-handoffs.md)
   (Features, Programs, Tails; match the row name loosely, the Node slug exactly).
2. No row? **The Feature Registry** — `platform.taxonomy_node` (DB, project
   `brsgrqvjdzwihsvnfqkf`) / [`meta/registry.yaml`](/meta/registry.yaml): the node's
   `docs_path` is its doc kit.
3. Neither resolves cleanly, or two rows both match → ask ONE closed question with your
   recommendation, then go. Never guess between two features.

**FIRST ACTION — before reading the doc, before touching code:** delete the register row,
commit, push (common-docs). Assigned work is not orphaned work — this is the register's own
law. A Program/Tail row names its scope: you own THAT scope, not the whole feature.

## Gather the whole truth, briefly

From the node's home (`systems/<domain>/<feature>/`): `VISION.md` (Arman's words),
`STATE.md` (verified truth + pending list), `DECISIONS.md` (settled — never re-ask),
`HANDOFF.md` (the work order), satellites. Then the repos: each repo FEATURE.md, the code
itself, TODOs. *"Docs go stale, code doesn't"* — verify the load-bearing claims against
live code and the live DB before building on them. Note in a few lines each: done /
pending / documented-but-not-built / built-but-not-documented. Then move.

## The doctrine — Arman's rules, in force verbatim

1. **"Bias to action. Read enough to be correct, then build. Reviewing, planning, and
   reporting are checkpoints — not the work. I would much rather see real, testable code
   progress than a thorough analysis of what could be done."**
2. **His vision is the definition of done.** The node's VISION.md and his instructions to
   you. Instructions outrank docs — conflict gets flagged, his words win. Vision unclear on
   a point → *"make the call that best serves the stated direction, note the assumption,
   and keep going."* `VISION MISSING` → do NOT invent one; work the listed items and put
   the missing vision on the check-in (a `/domain-vision-interview` candidate).
3. **Build on what already exists.** *"We have canonical rules, concepts, components, and
   patterns — use them."* Expand existing components/tables/patterns, never parallel ones;
   consolidation over expansion; a new pattern only when nothing fits, and say why.
   *"The most capability from the fewest total lines."* (THE INVENTORY LAW applies: no
   surface before you've inventoried what the platform already gives you.)
4. **Integrate in both directions.** Where does this plug into the system, and where does
   the system plug into this? Wire every place both apply. *"Partial integration is a bug,
   not a phase."*
5. **Catch up, then expand.** Known work done → benchmark the best-in-class products for
   UI, data model, architecture — and name what you benchmarked against.
6. **Stay on the main line.** *"We are not in production."* No security hardening,
   compliance, rate limiting, or perf micro-optimization — spotted items go on the
   HANDOFF's follow-ups, and you keep moving. (Genuine severity → one `feedback` item.)
7. **Never lose work.** *"Unpushed work is lost forever."* Dedicated branch, commit at
   every good stopping point, **push after every commit**, draft PR early, push before
   running long. Close the release gap before ending (workspace law).
8. **Groom the docs — don't grow them. Do NOT create new doc files.** The node kit IS the
   doc set: update STATE.md, groom HANDOFF.md (rewrite, never append; it shrinks as work
   completes; ≤150 lines; done work collapses to one line pointing at code — *"we don't
   care how we got here, only that we're here and it's done"*). Spend the words on what's
   ahead. Full rules: the `handoffs` skill.
9. **Check your work.** At milestones — not continuously — run adversarial agents against
   what you built: try to break it, challenge it against the vision and the best-in-class
   bar. Fix main-line findings; log the rest.
10. **Check in** at the first solid stopping point and at the end — short and scannable,
    decidable in under a minute: what's done and pushed (branch/PR) · **decisions you need
    from him, up top, one line each** (each one guided-session shaped; anything that will
    wait goes on the [attention board](/operations/attention.md)) · what's next and what
    you deliberately deferred.

## Closing the take — the system's bookkeeping

- **Built UI he should see** → register it in the agent-review queue (`agent-review-queue`
  skill) so it reaches him as `ready_for_human`.
- **Work remains and nobody continues it** → groom HANDOFF.md and RE-ADD the register row
  (same commit) — a live handoff with no owner is an orphan by law. **Scope finished** →
  delete the handoff (delete-when-done), update STATE.md, and if the whole feature is done,
  its row and docs go too (`low-hanging-fruit` closure standard: closure is total).
- **You deep-verified the node's docs on the way through** → stamp the rotation:
  `update platform.taxonomy_node set last_reviewed_at = now(), review_notes = '<line>'
   where slug = '<slug>';`
- Disagreeing docs found mid-take → spin off `/dedupe-and-verify <subject>`, don't burn
  your context. New taxonomy discoveries → `proposed` registry rows, never improvised
  homes. Every common-docs edit: index/log/lint per the bundle rules.

# Changelog

- 2026-08-21 — Created from Arman's Feature Task Assignment prompt (his rules preserved
  verbatim) and wired to the Feature Registry system: register-row claim law, node doc
  kit, attention board, rotation stamp, review-queue registration, closure standard.
