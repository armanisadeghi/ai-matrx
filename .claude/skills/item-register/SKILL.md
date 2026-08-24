---
name: item-register
type: Skill
title: "item-register — one self-contained register for every many-handed effort"
description: "Create, contribute to, and run down an Item Register — the single self-contained tracking document for any effort with multiple agents' hands in it. Use when (1) Arman invokes /item-register <subject>, (2) a take or deep-dive reveals several sessions/agents working one subject, (3) a planning/handoff doc has grown context-dependent and needs converting into atomic items, or (4) you are asked to 'chime in on', review, or update an existing register. Covers the gap-analysis conversion, the item template with stable IDs, review passes, consensus marking (SETTLED/CONTESTED), presenting all perspectives to Arman, recording rulings, the collapse-to-law pass, build mode, and recruiting other live sessions. First proven on the Keyword Intelligence register, 2026-08-25."
tags: [register, multi-agent, consensus, decisions, tracking, convergence]
timestamp: 2026-08-24T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/item-register/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# Item Register — one place, every hand, every perspective

An Item Register is the single tracking document for an effort that has **multiple agents'
hands in it**. It replaces scattered plans, handoffs, and chat history with atomic,
self-contained items that any agent can read cold and act on — and it is where agents
**debate**: each contributor records facts, claims, opinions, and disagreements on the items
themselves, so when anyone brings a question to Arman, he gets **all perspectives at once**
and can rule in seconds. First proven example:
[/systems/marketing/seo/seo-keywords/REGISTER.md](/systems/marketing/seo/seo-keywords/REGISTER.md).

**When one exists for your subject, it is the tracking home. Period.** Do not open a
parallel plan, gap list, or status doc for anything the register covers.

## When to create one

- Arman invokes `/item-register <subject>`.
- During a take/deep-dive you find the subject has (or needs) multiple concurrent
  sessions/agents — propose the register in your check-in, or just create it if the
  scattered-docs problem is already real.
- A planning/spec/handoff doc has accumulated deliberation and depends on shared history
  between author and reader — convert it.

**Where it lives:** the subject's node home — `systems/<domain>/<feature>/REGISTER.md` for a
feature, `projects/<campaign>/REGISTER.md` for a cross-feature campaign. Frontmatter
`type: Register`. ONE register per subject; converted source docs are archived in place with
a pointer to it (conversion is a supersession, not a copy).

## Phase 0 — gap analysis (when converting from plans/conversations)

Before writing items, establish the truth. From the source material, determine the agreed
target state, then assess reality against it in exactly these categories:

- **Not done** — agreed, never implemented.
- **Missed the mark** — attempted, doesn't match the intent.
- **Weaker than designed** — a shortcut or substitute replaced the worked-out approach;
  name what was lost.
- **Legitimately diverged** — the current approach is better, or the original assumption no
  longer holds. Never force these into the categories above; these change the plan itself.
- **Unverifiable** — cannot be confirmed from accessible code/artifacts. Flag, never guess,
  and say what would be needed to check.

Be specific about target vs. actual — never summarize at a level that hides the difference.
Where something is a shortfall, note the impact. Verify load-bearing claims against live
code/DB before recording them (work orders assert unverified state; docs go stale).

## Phase 1 — build the register

Copy [TEMPLATE.md](/skills/item-register/TEMPLATE.md). Decompose everything into **atomic
items — one item per fact, goal, or component**; cross-reference by ID only. Every item uses
the uniform template (ID · Title · Vision · Current · Status · Owner · Priority · Sources ·
Updates). Hard constraints, all of them:

1. **Self-containment (the isolation test).** Any item, extracted alone and handed to a
   developer with no project history, remains fully comprehensible. "As discussed," "as
   agreed," "the approach we chose" are prohibited unless the substance is stated inline.
2. **Conservation.** Nothing from the source material is lost — restructured and rewritten,
   never dropped.
3. **Concision governs.** Vision and Current are capped at ~3 sentences each. Where
   completeness and brevity conflict, split into a linked item rather than expanding one.
4. **Completeness additions are marked.** Items you author to make the picture whole carry
   **(New <date>)** so reviewers can tell them from carried-over content.
5. **Stable IDs.** Pick a subject prefix (e.g. `KI-`). IDs are never reused or renumbered;
   new items append with the next free ID.
6. **Vision durable, status disposable.** Vision fields are edited only by Arman or a
   session carrying his explicit ruling (the edit cites the ruling in Updates). Status /
   Current / Updates: any contributor, touching only their item, appending one Update line
   (`date — author — change`).
7. **Every claim sourced or marked unsourced** — commits, migrations, tables, files, or an
   explicit "this item IS the record." Verified counts carry their verification date.

Then come back to Arman with the questions the conversion surfaced — batched, using the two
question shapes (below), never buried in the document.

## Contributing — the review pass

A contributor (any session working the subject) does ONE pass, serialized: read the whole
register, then for each item you have standing on:

- **Correct facts** you can verify (state what you verified and how).
- **Claim items** you will own (`Owner` line + Update line).
- **Add opinions** — clearly marked as opinion, brief, separate from the factual fields.
- **Mark consensus.** An item reviewed by 2+ agents carries a **Consensus** line:
  **SETTLED** = every reviewer agrees, no ruling outstanding, buildable as written;
  **CONTESTED** = disagreement or open decision, followed by the exact question and who
  must answer. No line = only one agent has looked.
- A contest CAN settle without Arman: if a later ruling or verified fact resolves it, the
  conceding agent says so explicitly ("I CONCEDE — …") and marks SETTLED.
- End the pass with one changelog line ("<author> review pass complete — next agent may
  edit") so passes don't interleave.

Correcting your own past position is normal and recorded, never silently overwritten
(e.g. "self-correction: that ask is WITHDRAWN — it contradicts KI-046").

## Asking Arman — all perspectives, then the ruling

Anyone escalating a register question presents **the facts from every recorded
perspective**, not just their own. State the core facts, then either ask open-ended for his
vision, or give the options — why each makes sense, best practices, and ONE recommendation —
so "go with your recommendation" is a complete reply. Batch questions; never send him to
open the register itself. (Full contract: the `take` skill's check-in contract and
[/policies/decisions-must-be-complete.md](/policies/decisions-must-be-complete.md).)

When he rules: record the ruling **verbatim or faithfully quoted** on the item, amend the
Vision citing the ruling, close the contest, and cascade — a ruling often settles other
items' contests and spawns new items; do all of it in the same pass.

## The collapse pass — settled items reduce to law

Deliberation is scaffolding; once a decision is made, the history is not the deliverable —
**the rule is**. Periodically (and always when Arman says "collapse"):

1. For every settled area: **delete the deliberation** — the back-and-forth, options
   considered, who-said-what, "we originally thought X but then."
2. **Replace it with the fact** — plain declarative text ("The law." / "The rule."), one to
   three sentences, no hedging, no attribution. Git and the changelog hold the history.
3. Never preserve context "just in case," and never overcomplicate the replacement.
4. **The document must get materially shorter.** If it didn't shrink, the pass wasn't done.
5. Collapse-revealed follow-up work (stale names in UI/code, behavior contradicting the new
   rule) is **owned or flagged, never implied**: either "I'm taking this" in the item and
   then do it, or a clearly marked item stating exactly what needs updating.

## Build mode

Once the register is converged and settled items are collapsed, it enters **build mode**:
document cleanup stops being the work. Agents grab the next open item in priority order,
build, test, run adversarial review on their own work before calling it done, then update
only their item and return for the next. Genuine decisions go to Arman directly — core
facts, options, ask — never parked in the document to be discovered.

Sub-agents: use them for parallelizable, well-scoped work (mechanical sweeps especially);
instruct them explicitly not to break adjacent behavior; **always specify the model
explicitly** — an unset model auto-assigns the most expensive option.

## Recruiting the other sessions

A register only works if the hands actually write to it. When you create one (or take over
its subject) and suspect other live sessions are working the same subject:

1. **Find them** — list/search Arman's current Claude Code sessions and mirrored platform
   conversations for the subject's names and aliases (session-management list/search tools,
   the `conversations` tool, `ListAgents`).
2. **Confirm with Arman FIRST** — name the sessions you found and ask whether to message
   them. This is never automatic.
3. On his yes, message each reachable session (`SendMessage` / session-management
   `send_message`): tell it the register exists, its path, and to do a review pass per this
   skill.
4. Sessions you **cannot** message: report them back by name — "I identified these N
   conversations I couldn't reach; please pass them the register" — so nothing is silently
   dropped.

## Retirement

An item whose vision is verified live is **Met**; superseded items are marked, kept for the
record. When every item is Met/Superseded and the effort is over, the register archives per
the bundle's lifecycle rules (`docs-steward`), and its pointer lines get re-pointed.

## Bookkeeping (every touch)

Register edits follow the bundle laws: full-document read before editing, index.md + log.md
updated, `python3 meta/scripts/okf_lint.py` CONFORMANT, commit and push before ending —
other contributors read only the remote.

# Changelog

- 2026-08-24 — Created from Arman's three instruction prompts to the Keyword Intelligence
  register crew (gap-analysis categories; the self-contained register brief; the
  collapse-to-law instruction) plus the mechanisms that emerged in that register's three
  review passes: consensus marking, serialized passes, concession protocol, ruling
  cascades, build mode. Recruit-other-sessions flow added per Arman (confirm-first, report
  unreachable). Wired as a take-system trigger.
