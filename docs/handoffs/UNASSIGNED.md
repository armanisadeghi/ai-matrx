# UNASSIGNED — handoffs with no owner

**Every row here is a handoff waiting for someone to pick it up. Nothing else belongs in this
file.** It is the ONE list Arman reads to decide what to staff next, so its only job is to be
short and true. Cross-repo: matrx-frontend AND aidream handoffs both go here.

## The two rules

1. **TAKING a handoff → delete its row. First action, before you read the doc or touch code.**
   Assigned work is not orphaned work. If you were pointed at a handoff — by Arman, a chip, or a
   task prompt — remove its row and commit that deletion immediately. Do not mark it, do not
   annotate it, do not wait until you finish.
2. **LEAVING work that a handoff still covers → add its row.** Any time you groom a handoff and
   remaining work survives, and nobody is continuing it in this session — you finished your
   scope, you were pulled off, you got blocked — add the row before your turn ends. Creating a
   new handoff means creating an orphan: it gets a row in the same commit.

**There are no statuses here.** No "in progress", no "blocked", no notes column, no history — a
row's existence IS the status. Status lives inside the handoff doc (`status:` frontmatter). A row
that needs explaining means the explanation belongs in the handoff, not in this table.

**Never delete a row for any other reason.** Not "this looks stale", not "I don't think we need
it". If a handoff is genuinely finished, the handoff doc itself gets deleted (per the `handoffs`
skill) — and then, and only then, its row goes with it.

## The table

| Handoff | Repo | Added | Needs |
|---|---|---|---|
| [cms-page-hub.md](./cms-page-hub.md) | matrx-frontend | 2026-08-14 | SEO-plan surface, tab governance, and the system-wide before/during/after sweep (W1–W3 shipped) |

*Empty table = every handoff has an owner. That is the goal state, not a bug.*

## Scope note

This list starts from 2026-08-14 and grows only as work is handed back — it is deliberately NOT a
backfill of every existing handoff (ownership of the older docs is unknown, and a list of
everything is the thing this replaces). `/handoff-cleanup` removes rows whose handoff file no
longer exists; it never adds rows.
