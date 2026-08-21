---
name: dedupe-and-verify
type: Skill
title: "dedupe-and-verify — one truth per subject, facts confirmed, misalignment surfaced"
description: "The targeted deduplication-and-fact-confirmation pass: find duplicate docs on a subject, collapse them to one truth, verify every load-bearing claim against live code/DB, and route genuine vision misalignment to Arman for feedback. Lighter and any-scope, where doc-convergence is the full cluster ceremony. Use with /dedupe-and-verify <subject>, or when any task surfaces disagreeing documents."
tags: [meta, docs-system, dedupe, verification]
timestamp: 2026-08-20T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/dedupe-and-verify/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# dedupe-and-verify — one truth per subject, facts confirmed, misalignment surfaced

**Arman, 2026-08-20 (vision — [/systems/platform/docs-system/VISION.md](/systems/platform/docs-system/VISION.md)):**
*"They find that there are duplicate docs, and then they report that the documents don't
agree with each other in terms of what to do, and they don't agree in terms of the state of
the current project either… things got built that one of the documents claims are not
built, and then there are things that are claimed to be finalized, but they're not."*

🚨 **Reporting a duplicate without resolving it is the failure this skill ends.** Find-it-
own-it — with a twist Arman ruled 2026-08-20: the agent that spots disagreeing docs
mid-task should normally **SPIN THIS OFF as a self-contained background session/chip**
rather than burn its own context on it — *"they know to trigger that skill so that someone
else goes and does it, doesn't take up their context, but then the end result is they get
the work the way they should."* Run it inline only when the disagreement blocks your
current task. What is never acceptable: noting the disagreement and moving on.

**Cadence:** runs DAILY as a scheduled task (approved by Arman 2026-08-20; see
`common-docs/operations/scheduled-tasks.md` — the claim protocol there is the mandatory
first step of every scheduled run), plus these on-demand spin-offs.

## Scope

Any subject, any size: two files that disagree, one directory, one registry node. For a
whole feature CLUSTER with an Arman interview at the end, use `doc-convergence` instead —
this skill is the standing, lightweight version that keeps the corpus clean between
convergence runs.

## The pass

1. **Census the subject.** Grep the subject's terms across common-docs AND every repo it
   touches (docs, FEATURE.md files, handoffs); follow one ring of links. List every doc
   that makes claims about the subject.
2. **Elect the one home.** Per the Feature Registry: the owning node's doc (STATE.md /
   the specific kit file) is the survivor. If the registry has no node, propose one
   (`status: proposed`) — dedupe is how missing nodes get discovered.
3. **Classify every disagreement** before touching anything:
   - **Fact vs fact** → reality arbitrates: verify against live code, the live DB, git,
     the deployed state. The wrong doc is corrected, with a changelog line. "Claimed built"
     and "claimed finished" are ALWAYS probed, never trusted — both false-done and
     false-pending are common.
   - **Doc vs vision (Arman's words)** → vision wins by default. If the code itself has
     drifted from vision, that is a FINDING, not a doc fix — record it and escalate (below).
   - **Vision vs vision** (two verbatim Arman statements that conflict, or a doc that
     paraphrased him into something he may not have said) → NEVER resolved by an agent.
     One attention-board row (guided session: both statements, sources, dates, and the
     concrete consequence of each reading) so Arman rules.
4. **Collapse.** Merge unique truth into the survivor; every other copy becomes a pointer
   line or is deleted (git keeps history). Never leave two copies "for safety" — that is
   the disease. Repoint every inbound reference in every repo.
5. **Record.** Survivor gets a changelog line naming what was merged and what was corrected
   (with the evidence). Registry updated if the node changed. Escalations filed. One log.md
   line for the pass.

## Rules of evidence

- A doc's own "verified ✓" is not evidence; a code comment is not evidence. Artifacts and
  behavior only: the file is wired, the RPC is live, the route renders, the rows exist.
- Verification date stamps go on what YOU verified, dated today — never inherited.
- Anything genuinely unverifiable (needs a deploy, a paid run, a human login) is marked
  UNVERIFIABLE with what would prove it — never guessed.
- Arman's verbatim words are never merged away, trimmed, or paraphrased — they move intact
  to the survivor's vision section with source and date.

# Changelog

- 2026-08-20 — Created per Arman's ruling in the docs-system overhaul session.
