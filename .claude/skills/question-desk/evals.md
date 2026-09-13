---
type: Reference
title: "question-desk — proof record"
description: "What is proven about the desk skill: the sweep detector's failing-then-passing self-test, the hook's positive and negative cases, and the first live run (2026-09-12/13) — eight questions, two of which he had already ruled, with the five gate defects that let them through and the fixes. Rerun after any edit."
tags: [skills, evals, question-desk]
timestamp: 2026-09-13T00:00:00Z
---

# question-desk — proof record

**Proven 2026-09-12 (in a cloud sandbox, real Claude Code 2.1.269 transcript shape):**

- `sweep_sessions.py --self-test` was watched **failing** first (the numbered-question pattern
  required the line to END with `?`, so *"1. Should a guest…? Rec: yes."* scored 0) and
  **passing** after the fix. The test asserts: a chat ending on a numbered question is found; a
  chat ending on "everything is complete" is not; a subagent transcript with a question does not
  surface; the title is the first prompt.
- `question_capture_hook.py` appended one inbox line for *"Two options. Which do you prefer?"*
  and none for *"All done and pushed."* against a scratch config dir.
- 2026-09-12 (later): a review bot found that merging the hook inbox forced a session to read as
  still waiting even when the transcript showed the owner had replied. The transcript's verdict
  now wins whenever one was read; the self-test gained the answered-question-plus-stale-inbox-line
  case and was watched failing on the old merge, passing on the fix.
- A live sweep over this sandbox's own transcripts returned no candidates (the only session was
  mid-turn), which is the correct answer.

**Not yet proven — the first live run is the remaining test:**

- The whole desk loop on Arman's machine: sweep over real recent chats, ledger rows filed from
  unfiled questions, one interview round in the prescribed shape, a verbatim answer recorded in a
  `DECISIONS.md`, and one delivery through each path (`SendMessage` to a live chat; the
  non-interactive resume of a closed one; the hand-off sentence when neither works).
- The hook install from `setup.md` on a real `~/.claude/settings.json`.

The first agent to run `/question-desk` for real records the outcome here: counts, which
delivery paths worked, and any question the shape failed to make answerable.

## The first live run — 2026-09-12/13 — and the two gate failures it exposed

**Counts.** 8 questions reached Arman (6 researched + 2 rescued by the adversarial review). He
answered 5 in his own words, took the recommendation on 3. **Two of the eight he had already
ruled**, and he said so in anger (*"This is a decision I've already made, and it's stupid that I'm
being asked this question"*; *"I have already said that… Again, stupid fucking question!"*). Both
passed the homework gate (step 2), the research brief, and the adversarial review. That is a
25% false-open rate on the first run, and it is the metric this record now tracks every run.

### Case 1 — retention / auto-delete (`Q-2026-09-12-hr-record-disposition-auto-execute`)

**What existed before the desk asked.** Dated, mostly verbatim, all in common-docs:
- 2026-08-19/20 — `projects/data-lifecycle-platform/VISION.md`: archival is an ending, not only
  destruction; global default `never`; a warning stage before anything is destroyed.
- 2026-08-23 — `projects/data-lifecycle-platform/RULINGS.md` § 3 (verbatim): one click brings
  anything back at any age, including from cold storage.
- 2026-08-24 — `projects/data-lifecycle-platform/THE_PLAN.md` (verbatim): *"A thirty day grace
  period is reasonable"*.
- 2026-08-26 — `projects/data-lifecycle-platform/STATUS_BOARD.md`: expired user-facing artifacts
  tier to warm, **never purged** (encoded as refusal #9, migration `0490`).
- 2026-09-10 — Data Doctrine § 10 (`systems/platform/custom-data/VISION.md`, verbatim): a history
  retention *"floor of thirty days … an organization may raise and never lower"*.

**Honest residue:** no single document carried the composite he stated on 2026-09-13 (archive-first
for every delete; retention reducible by users and orgs but never to zero; the floor is thirty days
because of the children-in-education obligation). That composite is written down for the first
time in `RULINGS.md` § 4 (2026-09-13). But four of its five parts were on file, and "never ruled on
this exact point" was false.

**Why the gate missed it — three defects, all in the gate, none in him:**
1. **The node was never resolved.** The row's `Node:` field read `hr` — the first token of the
   slug, stamped mechanically. Every one of the eight desk-filed rows had this shape (`hr`, `local`,
   `hindsight`, `share`, `masterwork`, `auto`), while every asker-filed row reads `domain / feature`.
   With no real node, the gate's "owning `DECISIONS.md` / `VISION.md`" search had no target; the HR
   ledger holds nothing on retention, and the search stopped there.
2. **The machinery's owner is a PROGRAM, and programs were not in the search list.** The rulings
   lived under `projects/data-lifecycle-platform/` (`VISION.md`, `RULINGS.md`, `THE_PLAN.md`,
   `STATUS_BOARD.md`). The gate's list — owning `DECISIONS.md`, `VISION.md`, the lexicon, `log.md`,
   the conflicts register, the ledger — reaches a program only when the node resolves to it.
3. **The search followed the asker's FRAMING, not the SUBJECT.** The brief asked about "unattended
   execution", so the researcher found the 2026-08-25 AI-action-modes ruling and the 2026-08-29
   destructive-click ruling. The subject nouns — *delete, retention, archive, purge, thirty days* —
   were never grepped across the corpus. A subject grep hits `RULINGS.md` on the first page.

### Case 2 — an agent editing its own instructions (`Q-2026-09-12-hindsight-change-promotion-human-gate`)

**What existed before the desk asked.** Three records of ONE ruling:
- 2026-08-20 — `systems/workflows/DECISIONS.md` Q4 / F-14: *"An agent's own self-prompt and the
  workflow-step agent may continue to overwrite human-written instructions"* — answered, closed.
- 2026-09-08 — `systems/workflows/dynamic-agent-graph-design-v2.md` Part 0.13, verbatim:
  *"Human authored instructions can never be 'AUTOMATICALLY' overwritten by AI… however, a popup that
  asks for a confirmation… is perfectly fine"* + **Exception 1**: *"An agent's Self-Prompt tool is
  designed exactly for the purpose of an agent updating his own instructions, so this is obviously
  an exception."*
- 2026-09-08 — `operations/conflicts.md` `CFL-001`, **Resolved**: *"WITHDRAWN — never a conflict…
  The rule and its two exceptions are now documented together in Part 0.13."*

His 2026-09-13 answer is the same ruling a third time, word for word in substance.

**Why the gate missed it — and here the gate did NOT miss it; the review overturned it.**
The second gate KILLED this question, correctly, citing the design record. The adversarial
reviewer then rescued it on a procedural ground — the killer had cited an `authority: owner`
document as a tiebreaker (law 3e) — and read only the passage the killer pointed at: the oversight
table whose column says "Proposed default" under a heading that says "Not built." Part 0.13, ten
lines below that table, carries the dated verbatim ruling; the conflicts register's Resolved table
names it; the workflows ledger closes it. The reviewer checked the *citation*, not the *question*.
Two defects:
4. **A rescue never re-opens a question on procedure alone.** Overturning a kill because the
   killer's evidence was mis-cited is not a finding that the question is open. The reviewer must
   run the "already ruled" search itself — whole cited document, the node's `DECISIONS.md`, and
   the conflicts register's *Resolved* table — before a rescued question can reach him.
5. **Framing again.** "Hindsight promotion / timeout / human gate" is the asker's framing; the
   subject is *an AI changing an agent's instructions*. `Node:` read `hindsight`, which is not a
   registry node (Hindsight lives under `workflows`), so the ledger that closed F-14 was never
   opened.

### What changes in the gate (SKILL.md step 2, edited the same day)

- A row whose `Node:` is not a real `systems/<domain>/<feature>/` or `projects/<program>/` path
  fails the gate before anything else; the desk resolves it from the feature registry first.
- The "he already ruled" test searches the **subject nouns** across the WHOLE bundle (grep), plus
  the program that owns the machinery, plus `operations/conflicts.md` § Resolved — not only the
  asker's node.
- An adversarial rescue must include its own "already ruled" evidence; without it the kill stands.
- **Scored every run:** the number of answers that begin "I already decided this" is the gate's
  false-open count, recorded here. Run 1: **2 of 8**.

### Delivery paths (the other half of the first-run proof)

Not exercised by the recording pass — the owning session delivers (step 5) and records here which
of the three paths worked.
