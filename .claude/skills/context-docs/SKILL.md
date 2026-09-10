---
name: context-docs
type: Skill
title: "context-docs — agent-facing docs that stay true and land every rule"
description: "House rules for editing agent-facing docs: CLAUDE.md, AGENTS.md, FEATURE.md, PRINCIPLES.md, FOUND_DEFECTS.md, SKILL.md. Use when adding, moving, trimming, or compressing a rule, pointer, invariant, or defect entry in one, in any repo or the workspace root."
tags: [meta, docs-system, skills, agents]
timestamp: 2026-09-10T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/context-docs/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# context-docs — agent-facing docs that stay true and land every rule

Agents read these docs **before** they touch code, and `CLAUDE.md` loads on **every turn** — every
word is a tax paid for the life of the repo. Docs rot when they sit far from the code and nobody
updates them. The goal: every rule landed, every claim true, far fewer words.

## Step 1 — load the owning repo's mechanics

- **Read `.claude/context-docs.md` in the repo that owns the doc** before the first edit — its doc
  homes, its checks, its defect-ledger prefix. Docs in several repos → each follows its own repo's file.
- **No such file** (common-docs, any other repo, the workspace root) → the nearest `CLAUDE.md` holds
  the mechanics. common-docs: `index.md` + `log.md` + `python3 meta/scripts/okf_lint.py` after every `.md` change.
- **Editing a `SKILL.md`** → also read the `skill-authoring` skill.

## Rule 0 — every edit is a full-document review

You are **never just appending.** Before you save:

1. **Read the whole doc**, top to bottom — not only the section you came to edit.
2. **Put the change where it belongs**, not where you happened to be. A new DB rule → the DB section
   or that area's `FEATURE.md`; never a paragraph bolted onto the end.
3. **Reconcile.** Your addition duplicates, contradicts, or weakens something already there → merge,
   don't stack. Two rules saying one thing → collapse to one.
4. **Leave it more aligned than you found it** — one voice, no drift, no orphaned "addendum" blocks.

An edit that ignores the rest of the document is a regression *even if its own content is correct.*

## Trust nothing unverified

**A doc is a promise it is currently true.**

- **Verify before you adopt or write.** Open the file; confirm the function, endpoint, table, or
  setting still exists and behaves as claimed. Writing from memory of "how it used to work" is how the rot starts.
- **Found a stale claim while in a doc?** Fix it, or flag it (MCP `feedback` tool / `FOUND_DEFECTS.md`) — never leave it.

## Router, not encyclopedia

- **Root `CLAUDE.md` is a router:** the load-bearing invariant + a one-line pointer; the detail lives
  in the area's `FEATURE.md` or skill. Budget: repo `CLAUDE.md` ≤200 lines, workspace root ≤100 —
  over budget is fixed by relocating, not by tightening prose (`common-docs/policies/claude-md-charter.md`).
- **"Before you do X, read Y" is the highest-value line.** For any area with real depth, point instead of inlining:
  > **Invoke the `protected-resources` skill** before touching `admin.admins`…
  > Read `features/scopes/FEATURE.md` before any scope/context code.
- **A reference section past ~8 lines** (file maps, endpoint lists, catalogues, operator notes) →
  **extract it and leave the pointer** (procedure below).
- **`FEATURE.md` lives beside the code it describes** — one name, one per area. Touch the code →
  update its `FEATURE.md` and its Change Log (dated one-liner) in the same change.
- **Footgun-prone procedure** ("how to do X across many steps") → a **skill**: skills auto-trigger,
  plain docs are read only if someone follows the pointer. A single hard rule → a `CLAUDE.md`
  invariant + a `FEATURE.md`, not a skill.
- **Every pointer resolves.** Moved or renamed a doc → `grep` `CLAUDE.md` and sibling docs for the
  old path, fix every hit, then run the repo's pointer check (Step 1).

## Demoting a fat section

Copy a live exemplar (the repo file names them):

1. **Find the code it describes** — the `FEATURE.md` goes in *that* directory (packages too). No single
   obvious directory (genuinely repo-level wiring)? **Compress in place instead** — not everything becomes a `FEATURE.md`.
2. **Verify against live code** — every function / endpoint / table / claim. State exactly what you
   verified + the date. Stale claims get fixed or flagged, never copied.
3. **Write `<dir>/FEATURE.md`** — the full detail + a "Verified against code <date>" line + a Change Log entry.
4. **Demote the section** to the *invariant* (the one rule an agent must hold every turn) + the *one
   killer detail* + a one-line pointer. **Relocate every rule — lose none.**
5. **Run the repo's pointer check** — the new pointer resolves and nothing else broke.
6. **Rule 0 again** — the demoted section flows with its neighbours; no dupes.
7. **Re-confirm after concurrent saves.** A stale editor buffer can revert `CLAUDE.md` to the
   pre-demotion copy, leaving the detail in BOTH files — pointer checks will NOT catch it (the pointers
   still resolve). If `CLAUDE.md` changed underneath you, grep for a sentinel phrase from your terse
   version; re-apply if it reverted.

## Voice — punch, not prose

- **State the rule, then stop.** "X is banned. Use Y." — not "we've found over time it's generally better to avoid X because…"
- **Bold the word that carries the rule.** Agents skim; the bold is the signal.
- **One idea per bullet.** A bullet with an "and also" → split it.
- **Present tense, absolute.** Cut "currently", "in the future", "we should probably", "it's recommended." Rules are not opinions.
- **Concrete anchors beat description.** Name the file, function, table, or skill:
  `selectIsSuperAdmin` > "the admin-check helper"; `get_user_secret(...)` > "the secrets helper."
- **One line of failure earns the rule.** "A signed URL expires days later" justifies a rule better
  than a paragraph of theory. No stories, no history, no journey.
- **Every sentence must change behavior.** A line the agent already obeys by default is a no-op —
  delete the whole sentence. Never restate what one command or one file read reveals (`package.json`,
  `pyproject.toml`, `--help`, config); write only what looking cannot find: the convention, the reason, the gotcha.

## Never lose a rule

Compression ≠ deletion.

- When you tighten a section, **every invariant, file path, function name, and pointer survives** —
  cut connective tissue, never the rule; relocate detail to the `FEATURE.md`, don't drop it.
- Unsure whether a clause is load-bearing? **It stays.**
- Removing a rule is a **deliberate act you call out to the user** — never a silent side effect of "cleaning up."

## `FOUND_DEFECTS.md` entries

- **ID = the ledger MAXIMUM + 1**, never the number after the last entry in the file. The ID prefix is per repo (Step 1).
- The entry sits under `## OPEN`; no existing ID is ever renumbered. An entry with no ID, or appended
  below the closed sections, is invisible to the every-turn open scan.
- Body: `common-docs/policies/defect-ownership.md` § Entry IDs.

## Before you save — checklist

- [ ] Repo mechanics file read (Step 1); every check it names for this change run and clean.
- [ ] Whole doc read; the change sits in its right home (`CLAUDE.md` invariant vs `FEATURE.md` detail vs skill).
- [ ] Claims verified against live code — no stale-doc copy-paste.
- [ ] No new duplication or contradiction; merged where it overlapped.
- [ ] Every prior rule still present — paths, names, pointers intact; every pointer resolves.
- [ ] Rule-not-prose: bolded signal, present tense, no hedging.
- [ ] Depth pushed to a pointer if the section was bloating; word count rose only as much as the new rule needs.
- [ ] Touched code in this change? Its `FEATURE.md` + dated Change Log line updated too.
- [ ] `SKILL.md`: the `skill-authoring` skill's description rules, size ceiling, and prove-it run are satisfied.
- [ ] `FOUND_DEFECTS.md`: ID = ledger max + 1 with this repo's prefix, under `## OPEN`, nothing renumbered.

## Anti-patterns

- An "Update 2026-XX" / "Note:" block tacked on instead of integrating the change.
- A second section restating a rule already stated elsewhere.
- Narrating the journey ("originally A, then B, now C") instead of stating the current rule.
- Inlining a 15-row reference table into `CLAUDE.md` when it belongs in a `FEATURE.md`.
- Durable rules buried in plan/design docs instead of a code-adjacent `FEATURE.md`.
- A pointer left dangling after a doc moved.
- Writing a `FEATURE.md` from memory instead of reading the code it documents.
- "Cleaning up" by dropping a rule you didn't understand.
