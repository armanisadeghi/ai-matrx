# Current App Errors — matrx-frontend

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
| CE-001 | 2026-07-05 | error | Vercel 15 s runtime timeout on `POST /api/mcp/[transport]` (5 occurrences, 1 user; latest 2026-09-23) | `.matrx/AGENT_TASKS.md` TASK-018 |

---

## Resolved

_(pruned after a shipped build confirms, or ~2 weeks)_
