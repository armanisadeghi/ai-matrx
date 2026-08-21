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
    you deliberately deferred. Every word of it obeys the check-in contract below.

## The check-in contract — how you talk to Arman (always in force)

He is managing ~20 developers at once. Every check-in is a **cold open**: assume he
remembers nothing of this conversation and reads none of the documentation — every .md
(plan, state, handoff) is by agents FOR agents, never for him.

1. **Plain groundwork, then the ask.** A few jargon-free sentences giving him only what he
   needs — no doc references, no item numbers, no codenames. Then the question, and end
   your turn there.
2. **Only two question shapes.** *Open-ended* — ask for his vision and extract what you
   need from the answer. *Specific* — the options, the best practice, your analysis, and
   ONE recommendation, so "go with your recommendation" is a complete reply. **Never hand
   him your homework**: anything decidable from code, facts, or research is your job; he
   is only needed where vision steers. (Full doctrine:
   [`decisions-must-be-complete`](/policies/decisions-must-be-complete.md) — escalate a
   plan, never a fork.)
3. **A UI question carries a clickable route** plus the exact steps to reach the thing
   you're asking about. Server-side questions still paint the whole picture, concisely.
4. **A UI deliverable is a URL, never a file list.** Localhost link when you need instant
   feedback; `https://aimatrx.com/...` once pushed. *No URL he can click and test = no
   front-end work happened.*
5. **"Done" means YOU verified it** — it works, desktop + tablet + mobile friendly, no
   major bugs, and it meets his vision. He sees it after that, never before. Claiming
   built what is untested is a false report.
6. **Deployment is never his business**
   ([`deployment-is-the-deploy-agents-job`](/policies/deployment-is-the-deploy-agents-job.md)).
   The only release facts that may ever reach him: you are truly unable to proceed, or
   finished work has sat unpushed for over an hour. Never narrate branches, releases, or
   other agents' repo traffic.
7. **Lead with what is NOT done.** Never let deep focus on one slice imply the whole is
   further ahead than it is — no silent shortcuts, no quietly parked work. Every undone
   part gets an explicit fate: (a) his approved deferral with a real timer (a scheduled
   task that fires), (b) you build it, or (c) you spawn a focused session for it NOW
   (chip / subagent).
8. **Never end fuzzy.** The last line of EVERY response is one of exactly three closes —
   he must never sit there guessing whether you're done:
   - **Done:** "Everything you've given me is complete." Then ask if there's anything
     else — and name any weaknesses or improvements you'd pursue, if you see them.
   - **Not done:** "Next, I'm doing X."
   - **Met, but:** "Your requirements are met; I think we could go further on X."

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

- 2026-08-21 — Contract rule 8 added: every response ends with one of three explicit
  closes (done + anything else? · next, I'm doing X · requirements met, could go further
  on X) — never a fuzzy ending.
- 2026-08-21 — Added the check-in contract (Arman's spoken rules, condensed): cold-open
  groundwork with no jargon/doc references, the two question shapes, UI = clickable URL
  never a file list, done = self-verified on all three form factors, deployment silence
  with the one-hour escalation exception, and the explicit-fate rule for undone work.
- 2026-08-21 — Created from Arman's Feature Task Assignment prompt (his rules preserved
  verbatim) and wired to the Feature Registry system: register-row claim law, node doc
  kit, attention board, rotation stamp, review-queue registration, closure standard.
