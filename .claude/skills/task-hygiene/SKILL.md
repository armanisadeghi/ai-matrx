---
name: task-hygiene
type: Skill
title: "task-hygiene — cleanup and triage of the repo task system"
description: "Cleanup and triage of the repo task system — FOUND_DEFECTS.md, CURRENT_ERRORS.md, .matrx/AGENT_TASKS.md, .matrx/ARMAN_TASKS.md. Run the full sequence or one named step (e.g. \"/task-hygiene 3\" or \"/task-hygiene errors\"). Use when asked to clean up tasks/defects/errors, triage an error dump, promote found defects to tasks, prep/rank/ask Arman tasks, or bootstrap this task system in a repo that lacks it."
tags: [tasks, defects, errors, triage, hygiene, ledgers]
timestamp: 2026-08-22T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/task-hygiene/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# Task Hygiene

Maintenance of the four-file task system used across all of Arman's repos. Any
agent can run the full sequence (steps 1→9) or be told to run exactly one step.
Steps are independent — never assume earlier steps ran.

## Invocation

- `/task-hygiene` or `/task-hygiene all` → steps 0–10 in order (skip 7 unless asked)
- `/task-hygiene <n>` or `/task-hygiene <name>` → that step only (still run step 0 checks first)

| # | Name | One-liner |
|---|------|-----------|
| 0 | `bootstrap` | Verify/create the four files; always runs first |
| 1 | `cleanup` | Move clearly-done items to condensed completed entries |
| 2 | `dedupe` | Merge duplicates, same-root-cause pairs, defect↔task overlaps |
| 3 | `promote` | Propose ≤3 defect→task promotions to Arman at a time |
| 4 | `analyze` | Full code analysis of named items; stamp the entries |
| 5 | `enrich` | Add concise pointers that make tasks easier to execute later |
| 6 | `arman-prep` | Fact-check + rank ARMAN_TASKS (run after 1–5) |
| 7 | `ask` | Bring ONE fully-prepared ask to Arman, with the condensed menu |
| 8 | `clarify` | Do step 7's prep for ALL Arman tasks, written into the file |
| 9 | `docs` | Find and fix stale documentation revealed by the above |
| 10 | `excavate` | Small agent hunts buried/forgotten work items in docs; file the orphans |

## The four files

Canonical layout — adapt to where a repo actually keeps them; never force moves:

| File | Role |
|------|------|
| `FOUND_DEFECTS.md` (root) | **Holding area.** Unapproved discoveries filed with evidence. NOT a worklist. |
| `CURRENT_ERRORS.md` (root) | **Error-dump inbox.** Arman pastes raw logs from live testing; agents reconcile every line into a home. **Repo exception — aidream:** no CURRENT_ERRORS.md; it has durable in-app error systems (tool traces, system_error, write-failure replay, ops-triage, app_log, user_feedback). Run the Error-systems triage pass in [aidream-error-systems.md](aidream-error-systems.md) instead. |
| `.matrx/AGENT_TASKS.md` | **The only approved worklist.** Arman-reviewed work; agents doing related work take matching open tasks. |
| `.matrx/ARMAN_TASKS.md` | **Ask-Arman list.** Things only Arman can do. Agents ask him in chat when one blocks them — it is NOT his personal inbox to poll. |

Hard boundaries (apply in every repo):
- **Never read, write, or list any `.arman/` directory.** Arman-private.
- **Never edit docs under any `official/` directory** (`docs/official/*`, `*/official/*`). Flag stale content in FOUND_DEFECTS or ask Arman instead.
- Respect each repo's own CLAUDE.md; it wins on any conflict with this skill.

## Conventions (use everywhere)

- **Dates:** absolute `YYYY-MM-DD` on every entry (created / fixed / analyzed). Never "yesterday".
- **Defect IDs — use the ledger's REAL scheme, never invent one:** `matrx-frontend` = `D<n>` (`### D184 — …`); `aidream` = `AD<n>` (`### AD57 — …`, adopted 2026-08-22). Bootstrapping a repo that has none → `<PREFIX><n>` from the repo name (matrx-local → `MXL1`). Sequential, **never reused, never renumbered once anything cites it**.
  - 🚨 **Claim from the MAXIMUM, not the end of the file:** `grep -oE '^### \**A?D[0-9]+' FOUND_DEFECTS.md`, sort numerically, take max + 1. Reading the last heading instead is what gave matrx-frontend four collisions (D193/D194/D195/D219 each named two entries, cleared 2026-08-21 into D242–D246).
  - **Only OPEN entries carry an ID**; resolved prose keeps none. **Every open entry lives under `## OPEN`** — appended below the closed sections it is invisible to the every-turn scan.
  - **Bare `D<n>` always means matrx-frontend.** Write `matrx-frontend D184` / `aidream AD57` across repos. A defect spanning both keeps ONE number — the frontend's — with aidream's half as `AD<n> — D<n> remainder: …`.
  - Full body: `common-docs/policies/defect-ownership.md` § Entry IDs.
- **Priority scale:** `P0` breaks users/data now · `P1` important, this week · `P2` real but can wait · `P3` polish/wishlist.
- **Statuses (defects):** `open` / `needs-hw-verification` / `blocked-external` / `rejected`. (`fixed` is transient — see lifecycle below.)
- **Analysis stamp** — every defect/task carries exactly one:
  - `Unverified — from docs/logs only` (default when filing; almost always the honest one)
  - `Analyzed <date> — verified in code: <one-line finding>`
  A task written from an unanalyzed defect MUST say "code analysis pending" in its body.

## Lifecycle rules

**Fixed-while-in-holding.** Fixing an open FOUND_DEFECTS entry (allowed
opportunistically, in scope) is a shortcut for: delete from defects → add task
→ complete it → condense. So: **delete the defect entry immediately** and add
a one-line completed entry to AGENT_TASKS (`- [x] <what> — fixes {ID} (<date>, commit)`).
Fixed entries never accumulate in FOUND_DEFECTS.

**Completed compression.** Done items do not keep their full body. Condense to
one line (what + date + defect ID/commit if applicable) at the bottom of their
file's completed/done section. Detail lives in git history. Compress anything
completed more than ~2 weeks ago; recent items may keep 2–3 lines of context.

**Rejected registry.** A `## Rejected` section at the bottom of FOUND_DEFECTS.md.
When Arman rejects a promotion or marks won't-fix, record ONE line:
`- {ID} — <5–10 word reason> — <date> — delete when: <condition>`
(Typical reason: "wanted architectural fix, not this patch".) Agents check this
before re-filing anything. During step 1, **delete** rejected lines whose
`delete when:` condition has happened — stale rejections poison future agents.

**Cross-repo routing.** When working in Arman's local environment
(`/Users/armanisadeghi/code/<repo>`), a defect/task belonging to another repo
gets filed **directly in that repo's own files** (same system), with a note of
which repo discovered it. Primary repos: `aidream` (Python server + all matrx-*
packages + scraper), `matrx-frontend` (web client), `matrx-extend` (Chrome
extension), `matrx-local` (desktop), `matrx-sandbox`, `matrx-ship`. If the
target repo isn't present locally or lacks the system, file locally with status
`blocked-external` and route the handoff to Arman.

**Non-interactive mode.** Steps 3, 6, 7 need Arman live. If he isn't (scheduled
/ headless run), do all the research but write the prepared output into a
`## Pending Arman review` section of the relevant file (promotions → FOUND_DEFECTS,
asks → ARMAN_TASKS) so the next interactive session starts pre-baked. Never stall,
never self-approve.

---

## Step 0 — Bootstrap (always runs)

Check the four files exist where the repo's CLAUDE.md says (or canonical
layout). For any missing file, create it from the matching template in
[templates.md](templates.md) — additive, no approval needed. Exception: never
create `CURRENT_ERRORS.md` in aidream (see [aidream-error-systems.md](aidream-error-systems.md)). If the repo's
CLAUDE.md has no Task Tracking section, add a brief one naming the four files
and this skill. If a repo has equivalent files under different names/paths,
use those — update headers to match the templates' rules, don't relocate.

## Step 1 — Initial cleanup

Mechanical only; no judgment calls about open work.
- AGENT_TASKS: items clearly marked complete → condense to one line, move to Completed. Compress old completed entries per the compression rule.
- ARMAN_TASKS: checked-off / clearly-obsolete items → one line in Done.
- FOUND_DEFECTS: any entry with status `fixed` → apply fixed-while-in-holding (delete; one-liner to AGENT_TASKS Completed, unless already recorded there — never record twice).
- Rejected registry: delete lines whose `delete when:` has occurred.
- Update any "last updated" stamps.

## Step 2 — Combine similar

Find and merge, keeping the better-evidenced copy:
- Two entries describing the same problem in different words.
- Multiple symptoms with one root cause → one entry listing all symptoms.
- **A FOUND_DEFECTS entry that already exists as an open AGENT_TASKS task** — the defect is implicitly approved; delete the defect entry and fold any unique evidence (file:line, repro) into the task.
- CURRENT_ERRORS signatures duplicating a defect/task → link by ID, don't restate.
Never merge away evidence — union it.

## Step 3 — Promote defects to tasks

Pick the most important/urgent open defects. Present to Arman **at most 3 at a
time**, each as: proposed task title · severity/priority · one-paragraph why ·
which defect ID it replaces · honest analysis stamp (if unverified, the task
will say "code analysis pending"). Wait for approval; on approval move
defect → AGENT_TASKS (delete the defect entry); on rejection add a Rejected
line. Then offer the next ≤3. Non-interactive: write batches into
`## Pending Arman review` instead.

## Step 4 — Code analysis

For the given item(s) (any of the four files): read the actual code, confirm or
refute the claim, find root cause, estimate blast radius and fix shape. Update
the entry in place: analysis stamp (`Analyzed <date> — verified in code: …`),
corrected evidence (file:line), and a short "fix sketch". If the claim is wrong,
say so plainly and either delete (with Arman if it's a task) or correct it.

## Step 5 — Enrich tasks

For open tasks: add the few things that make execution cheap later — exact
file paths, the test that pins the behavior, related FEATURE.md, gotchas from
completed sibling tasks. CONCISE — pointers, not essays. Never pad; an entry
that's already sufficient gets nothing.

## Step 6 — Clean up Arman tasks (after 1–5)

Goal: never spend Arman's time on something already done or no longer needed.
For each ARMAN_TASKS entry: **verify it's still real** — check the key store,
env, dashboard, code, whatever proves it — before keeping it. Done already →
Done section, one line. Then rank Active by: (urgency × importance) ÷ effort-for-Arman.
**Things he can do in seconds float to the top.** Reorder the file accordingly.

## Step 7 — Ask Arman to complete a task

One task, fully prepped. The message:
1. **Core background** — 2–4 sentences: what, where, why it's needed.
2. **EXACTLY what to do** — direct imperative steps with everything that makes
   it fast: copy-paste commands, exact URLs, dashboard paths, file links,
   localhost addresses, the specific button.
3. Before sending, write those same hints into the task entry itself (so if he
   doesn't follow through, the next agent starts prepped).
4. End with: *"By the way, if this isn't easy to do right now, we can have you
   do any of these as well:"* + a VERY condensed list (one short phrase each)
   of the other ranked Active items.
If he picks one from the menu, research it and re-present in the same format.

## Step 8 — Clarify all Arman tasks

Step 7's prep applied to EVERY Active entry, written into the file: each entry
gets the core-background + exact-steps treatment (concise), so future asks are
instant and Arman can self-serve. Verify facts first (step 6 discipline).

## Step 9 — Documentation cleanup

The above usually reveals shipped changes that made docs stale. Identify
candidate-stale docs (grep for claims touched by recently completed work),
**verify the correct facts in code**, then fix: update, merge, or delete
non-official docs. `official/` paths: never edit — file the needed correction
in FOUND_DEFECTS (status `blocked-external`, owner Arman) or ask him directly.
Update each repo's doc map / FEATURE.md links if files moved or died.

## Step 10 — Excavate buried work

Docs rot into graves: a polished TASK/plan/roadmap doc, a "not yet wired" note, or a
half-built feature that *looks* tracked but is referenced by nothing. Because it looks
official, every agent assumes someone owns it — so nobody does. This step hunts them
cheaply. (Real case: a complete system-wide-error-tracking work order sat at aidream's
root for weeks, referenced by no list, found only by accident.)

**Keep it small — the expensive part is judgment, so do the finding and cross-checking
mechanically:**

1. **Candidates (main agent, pure grep — no model needed):**
   - Filenames: `TASK-*`, `*PLAN*`, `*ROADMAP*`, `*HANDOFF*`, `NEXT_*`, `KNOWN_*`,
     `*_INITIATIVE*` in the repo root and `docs/` (skip `official/`, `.arman/`, archives).
   - Content: `grep -rl "not yet built\|not yet wired\|planned\|follow-up\|TODO\|deferred"
     docs/ --include="*.md"` (tune per repo).
2. **Orphan filter (main agent, pure grep):** for each candidate, grep its basename across
   the tracked surfaces — FOUND_DEFECTS, AGENT_TASKS, ARMAN_TASKS, root CLAUDE.md,
   `docs/handoffs/`, and any nearby FEATURE.md. Referenced anywhere tracked → drop it.
   Only true orphans go to step 3. Cap the batch at ~10 (oldest git-mtime first);
   leftover candidates wait for the next pass.
3. **Judgment (ONE small agent — Explore or haiku-class, read-only):** give it the orphan
   list; for each it reads only the header/first ~60 lines and answers three things:
   *Is there still undone work in here? One-line summary of it. Obviously superseded/done
   (with what evidence)?* No fixing, no deep reads, no code verification.
4. **File (main agent):** every orphan with live work becomes ONE entry — FOUND_DEFECTS
   (status `open`, stamp `Unverified — from docs only`, marked "BURIED WORK RESCUED",
   with the doc path) or ARMAN_TASKS if it's purely a decision. Obviously-dead docs →
   propose deletion via step 9 rules. Never silently drop a candidate: filed, dead, or
   explicitly deferred to next pass.

A repeat run must converge: anything already filed (grep hit in step 2) is skipped, so
each pass only pays for NEW graves.

---

## CURRENT_ERRORS lifecycle (reference for any step touching it)

> **aidream exception:** this whole section does not apply in
> `/Users/armanisadeghi/code/aidream`. That repo captures errors durably in-app
> (cx_tool_trace, system_error, system_write_failure, ops-triage, app_log,
> user_feedback, watchdog, domain queues). Do not create CURRENT_ERRORS.md there;
> instead run the **Error-systems triage pass** in
> [aidream-error-systems.md](aidream-error-systems.md) — same spirit (every error
> gets a home, queues shrink every pass), different plumbing. Pay special attention
> to TOOL-CALL failures: most are harness defects (faulty tools, poor instructions,
> pattern mismatches), i.e. codebase-improvement opportunities, not agent mistakes.

Context: this is a shipped desktop/server app — Arman often can't re-test for
hours (a package must build + install). Error dumps are batch snapshots, not
live signals.

1. Arman pastes raw exports at the bottom of **Inbox** — possibly hundreds of lines, possibly several dumps.
2. Triaging agent fingerprints each error (ignore timestamps, channels, frame noise; same message/root exception = same error), dedupes against the **Unique errors** table, and gives every NEW signature a home: (a) **fix now** if quick — and if a fix is doable RIGHT NOW, STOP and tell Arman directly what can be resolved immediately; (b) file in FOUND_DEFECTS; (c) propose as an agent task (step 3 rules); or (d) it's an ask-Arman item → ARMAN_TASKS.
3. **Clear the Inbox** after triage — the table + IDs are the durable record.
4. Resolved entries: keep until a shipped build confirms (or ~2 weeks), then prune to nothing. An error that returns after resolution gets a NEW row referencing the old ID.
The file must never grow monotonically; every triage pass shrinks it.
