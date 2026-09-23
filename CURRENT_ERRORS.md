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
| CE-002 | 2026-09-23 23:12Z | error | Returning CE-001: `POST /api/mcp/[transport]` task timed out after 15 seconds (12 events, 1 user) on v0.4.2254 deployment `dpl_AcK56xmMswmJzGdWB6SJuSGaVeH8`; see exact evidence and next step in D346. | FOUND_DEFECTS.md D346 |

---

## Resolved

| ID | Resolution evidence |
|----|---------------------|
| CE-001 | Previously observed 15 s timeout on `POST /api/mcp/[transport]` (5 occurrences, 1 user; latest 2026-09-23 08:00Z on main v0.4.2234). Current main v0.4.2242 deployment `dpl_74eucYsTUU3fvefoH7zpt3MK6SW8` is READY and serves `ad1fd0c46c7aed8ea8067155354cafa24691edab`; its deployment-scoped error/fatal log query was empty through 10:10:30Z. Close as not reproduced on the current release. Reopen only if a new current-deployment occurrence appears. |
