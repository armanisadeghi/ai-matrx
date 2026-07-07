---
name: handoff-cleanup
description: Dispatchable cleanup agent for handoff docs. Use when Arman says "/handoff-cleanup", "clean up the handoffs", "audit the handoffs", or asks whether handoff docs are stale or done. Sweeps docs/handoffs/ in BOTH repos (matrx-frontend + aidream), verifies every doc's claims against live code/DB with small subagents, deletes done docs, grooms rotted ones, and returns one concise decision list for genuinely ambiguous drift. Optional args: file names or a count to limit the batch.
---

# handoff-cleanup — kill the rot

Handoffs rot: agents finish work and leave the novel behind; the codebase moves and the doc lies. This is the backstop sweep. Read `.claude/skills/handoffs/SKILL.md` first — it defines the format you groom toward.

## Scope

- Sweep BOTH `/Users/armanisadeghi/code/matrx-frontend/docs/handoffs/` and `/Users/armanisadeghi/code/aidream/docs/handoffs/`.
- Default: every doc, oldest `updated:`/mtime first. Args may name files or cap the batch.

## Per-doc verification — small parallel subagents

One Explore agent per doc (batch 3–4 docs per agent when they're small). Each verifies against reality:

- Named files / RPCs / routes / tables still exist and behave as claimed (Supabase MCP for DB claims; grep + read for code).
- Each "remaining work" item is actually still undone — search for evidence it shipped: code, `FEATURE.md` change logs, `git log`, migrations.
- **A code comment — or the doc's own "verified ✓" — is NOT evidence.** Agents write false comments and false verifications; that assumption is the disease this skill exists to cure. Verify artifacts and behavior, not prose.

## Classify and act

| Verdict | Action |
|---|---|
| **DONE** — all remaining work shipped | Delete the file; add a dated one-liner to the feature's `FEATURE.md` Change Log if missing. |
| **ACTIVE, rotted** — real work remains; doc is bloated or stale | Rewrite to the handoffs format: done work → one bullet each, stale claims corrected, vision quotes preserved **verbatim**. |
| **DRIFT, intentional** — code contradicts the doc because Arman changed direction (evidence: newer vision doc, his explicit decision, an answered question) | Delete every claim describing the old way. The doc states current intent only. |
| **DRIFT, unclear** — code and vision disagree and you cannot tell whether it was a decision or an agent screwup | Touch nothing contested; add it to the decision list. |

**Never resolve unclear drift by assuming the codebase is right.** Code drifting off Arman's vision because agents screwed up is common, and agents treating what's-in-the-code as fact is how the drift compounds. The vision doc wins by default; the decision list exists for the rest.

## Output — one report

1. **Actions taken**: `deleted: x.md (done — verified <how>)`, `groomed: y.md (410→62 lines)`, per file.
2. **Decisions for Arman** — numbered, each self-contained: **Situation** (2–3 plain sentences) → **Decide** (the concrete choice). No doc-internal references, no jargon. Say "none" if none.
3. **Unverifiable** — anything you couldn't confirm (e.g. needs a deploy or a live run), flagged, never guessed.

## Mirror check

Finish by diffing the aidream pointer stubs (`/Users/armanisadeghi/code/aidream/.claude/skills/handoffs/SKILL.md`, `.../handoff-cleanup/SKILL.md`) against the canonical skills here; re-sync stubs if drifted.
