---
type: Reference
title: "task-hygiene templates — the four task-system files"
description: "Copy-paste skeletons for FOUND_DEFECTS.md, CURRENT_ERRORS.md, .matrx/AGENT_TASKS.md and .matrx/ARMAN_TASKS.md, used when bootstrapping the task system in a repo that lacks it."
tags: [tasks, defects, templates, bootstrap]
timestamp: 2026-08-22T00:00:00Z
---

# Task-system file templates

Used by task-hygiene step 0 when a repo is missing one of the four files.
Replace `{REPO}` with the repo name and `{PREFIX}` with the ledger's REAL id prefix —
`D` for matrx-frontend, `AD` for aidream (see SKILL.md § Conventions); for a repo with no
ledger yet, a short uppercase
prefix derived from it (e.g. matrx-local → MXL, aidream → AID). Keep headers
verbatim otherwise — they carry the rules agents rely on.

---

## FOUND_DEFECTS.md (repo root)

```markdown
# FOUND_DEFECTS.md — {REPO}

> **Holding area — NOT an approved worklist.** Spot something while doing other
> work? File it here with evidence, then keep going.
>
> - **Working agents:** if you can fix an open entry cleanly in scope, do it —
>   then DELETE the entry and add a one-line completed item to
>   `.matrx/AGENT_TASKS.md`. Fixed entries never sit here.
> - **Re-encountering an open entry:** remind Arman — approve a fix NOW or
>   promote it to an agent task. Don't keep rediscovering in silence.
> - **Promotion** (defect → task) requires Arman. Cleanup agents propose ≤3 at
>   a time via the `task-hygiene` skill; they do NOT silently implement entries.
> - Check **## Rejected** before filing — don't re-file a won't-fix.
> - Defects belonging to another repo go in THAT repo's FOUND_DEFECTS.md.
>
> Entry format: `### {PREFIX}<n> — <title>` (e.g. `### D184 — …`, `### AD57 — …`);
> claim `<n>` as the ledger's MAXIMUM + 1, never off the end of the file.
> Body: area, symptom, evidence (file:line),
> status (`open` / `needs-hw-verification` / `blocked-external`), analysis
> stamp (`Unverified — from docs/logs only` or `Analyzed <date> — verified in
> code: …`), owner hint. Date everything YYYY-MM-DD.

---

## Open

_(none yet)_

---

## Pending Arman review

_(promotion proposals prepared by non-interactive cleanup runs land here)_

---

## Rejected

_One line each: `- {PREFIX}<n> — <short reason> — <date> — delete when: <condition>`_
```

---

## CURRENT_ERRORS.md (repo root)

```markdown
# Current App Errors — {REPO}

> **Error-dump inbox.** Arman pastes raw log exports into Inbox below; a
> triaging agent reconciles EVERY line into a home, then clears the Inbox.
> This file must shrink on every triage pass — it is never an archive.
>
> Triage contract:
> 1. Fingerprint each error (ignore timestamps/channels/frame noise; same
>    message or root exception = same error). Dedupe against Unique errors.
> 2. Every NEW signature gets exactly one home: quick fix now (if fixable
>    RIGHT NOW, STOP and tell Arman directly), FOUND_DEFECTS.md entry,
>    proposed agent task, or ask-Arman item.
> 3. Clear the Inbox. The table below is the durable record.
> 4. Resolved rows: prune once a shipped build confirms (or ~2 weeks). A
>    returning error gets a NEW row referencing the old ID.

---

## Inbox (raw paste)

<!-- Paste the next log export below this line. -->

```
(paste next export here)
```

---

## Unique errors

| ID | First seen | Level | Signature | Home |
|----|------------|-------|-----------|------|

---

## Resolved

_(pruned after a shipped build confirms, or ~2 weeks)_
```

---

## .matrx/AGENT_TASKS.md

```markdown
# Agent Tasks — {REPO}

> **The ONLY Arman-approved worklist.** If you are doing related work and see a
> matching open task here, TAKE IT and do it. Do not add tasks without Arman —
> unapproved discoveries go in `FOUND_DEFECTS.md`.
>
> - Every task carries: created date, priority (P0–P3), and an analysis stamp
>   (`Analyzed <date> — verified in code` or `code analysis pending`).
> - Finished a task? Condense it to ONE line under Completed (what + date +
>   defect ID/commit). Full detail lives in git history.
> - Blocked on something only Arman can do? File the blocker in
>   `.matrx/ARMAN_TASKS.md` and ask him in chat.
>
> Scan order: Needs Clarification → Blocked → Active → Completed.

---

## Needs Clarification

_(none)_

## Blocked

_(none)_

## Active

_(none)_

## Completed

_(one line each, newest first)_
```

---

## .matrx/ARMAN_TASKS.md

```markdown
# Arman Tasks — {REPO}

_Last updated: <date>_

> **Ask-Arman list for agents — NOT Arman's personal inbox.** These are things
> only Arman can do (secrets, accounts, dashboards, decisions). When one blocks
> your current work, ASK HIM IN CHAT right then — concise background, then
> EXACTLY what to do, with copy-paste commands/links.
>
> - Before asking, VERIFY the task is still real (check the key store, env,
>   code — don't spend Arman's time on things already done).
> - Active is ranked: (urgency × importance) ÷ effort-for-Arman. Seconds-long
>   items float to the top.
> - Each entry should carry the prepped ask (what/where/why + exact steps) so
>   any agent can ask instantly.
>
> Code work → `.matrx/AGENT_TASKS.md`. Discoveries → `FOUND_DEFECTS.md`.

---

## Active (ranked — quickest wins first within priority)

_(none)_

## Pending Arman review

_(asks prepared by non-interactive cleanup runs land here)_

## Future

_(none)_

## Done

_(one line each)_
```
