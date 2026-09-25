---
name: handoff-cleanup
type: Skill
title: handoff-cleanup — the rot sweep
description: "The rot sweep for handoff docs in matrx-frontend and aidream docs/handoffs/. Use on '/handoff-cleanup', 'clean up the handoffs', 'audit the handoffs', or when asked whether handoff docs are stale or done. NOT for grooming the handoff your own task covers (use handoffs)."
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/handoff-cleanup/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# handoff-cleanup — kill the rot

Handoffs rot: agents finish work and leave the novel behind; the codebase moves and the doc lies. This is the backstop sweep. Read `.claude/skills/handoffs/SKILL.md` first — it defines the format you groom toward: Vision (Arman's confirmed words), Where it stands (≤5 one-line bullets), Future (everything open, in detail), Resources. **Your main job is cutting the past**: history, changelogs, dated update blocks and done-work descriptions go; open work and known weaknesses stay.

## Scope

- Sweep every repo's `docs/handoffs/` under `/Users/armanisadeghi/code/` and every `HANDOFF.md` under `common-docs/systems/`.
- Default: every doc, oldest `updated:`/mtime first. Args may name files or cap the batch.

## Per-doc verification — small parallel subagents

One Explore agent per doc (batch 3–4 docs per agent when they're small). Each verifies against reality:

- Named files / RPCs / routes / tables still exist and behave as claimed (Supabase MCP for DB claims; grep + read for code).
- Each "remaining work" item is actually still undone — search for evidence it shipped: code, `FEATURE.md` change logs, `git log`, migrations.
- **A code comment — or the doc's own "verified ✓" — is NOT evidence.** Agents write false comments and false verifications; that assumption is the disease this skill exists to cure. Verify artifacts and behavior, not prose.

## Classify and act

| Verdict | Action |
|---|---|
| **DONE** — only known weaknesses remain | The feature's `FEATURE.md`/`STATE.md` status line becomes "X is built and in production"; move every weakness into its **Known weaknesses** list; delete the handoff and its register row. No change-log line. |
| **ACTIVE, rotted** — real work remains; doc is bloated or stale | Rewrite to the four sections. Cut every past-tense paragraph, date narrative, changelog and done-work description down to ≤5 one-line "Where it stands" bullets. Correct stale claims. Keep vision quotes **verbatim**, but only ones Arman said directly or his own documents hold: a quote copied from another agent's doc is dropped. |
| **VISION MISSING** — no confirmed Arman words, only paraphrase or a checklist | Do not invent a vision. Write `VISION MISSING` in the Vision section and in the register row. Add writing the vision to Future as a decision for Arman. |
| **DRIFT, intentional** — code contradicts the doc because Arman changed direction (evidence: newer vision doc, his explicit decision, an answered question) | Delete every claim describing the old way. The doc states current intent only. |
| **DRIFT, unclear** — code and vision disagree and you cannot tell whether it was a decision or an agent screwup | Touch nothing contested; add it to the decision list. |

**Never resolve unclear drift by assuming the codebase is right.** Code drifting off Arman's vision because agents screwed up is common, and agents treating what's-in-the-code as fact is how the drift compounds. The vision doc wins by default; the decision list exists for the rest.

## Output — one report

1. **Actions taken**: `deleted: x.md (done — verified <how>)`, `groomed: y.md (410→62 lines)`, per file.
2. **Decisions for Arman** — numbered, each self-contained: **Situation** (2–3 plain sentences) → **Decide** (the concrete choice). No doc-internal references, no jargon. Say "none" if none.
3. **Unverifiable** — anything you couldn't confirm (e.g. needs a deploy or a live run), flagged, never guessed.

## Orphan-list reconciliation

`/Users/armanisadeghi/code/common-docs/operations/unassigned-handoffs.md` lists every handoff with no owner (every repo).
The sweep is its ONLY automated maintainer. It may:

- **Remove a row whose handoff file no longer exists** (including ones you deleted this sweep).
- **Fix a broken link/path** in an existing row.
- **Merge the register's older five tables (Domains, Features, Sub-features, Programs, Tails) into
  its one list** — `| [Name](link) | repos · date · one sentence |` — keeping every row. Merging is
  not deleting.

**Never add a row, and never remove one because the work looks stale or someone might be on it** —
ownership is not knowable from the files, and a wrongly-removed row silently loses the work.
Report any handoff you suspect is orphaned-but-unlisted as a decision line instead. The note is one
sentence (and `VISION MISSING` when that is true). Extra status columns stay banned.

## Mirror check

Finish by running `python3 /Users/armanisadeghi/code/common-docs/meta/scripts/sync_skills.py --check` — it verifies the synced copies (`handoffs`, `handoff-cleanup`) in every consuming repo are byte-identical to the canonical bodies here; re-run without `--check` and commit each repo if drifted.

