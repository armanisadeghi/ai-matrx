# `migrations/inverse/` — the down-migrations, and the one way to run them

BUILD-BOOK §4.13 makes every migration carry its own down-migration in the same commit,
and §8.9's abort checklist runs them. Until 2026-09-16 they were all marked
`-- migrate: skip:` — which meant **no path could execute them**: `pnpm db:apply` refuses
a skip-marked file "by any path" by name, and hand-applying through the Supabase MCP is
forbidden in this repo. The abort checklist depended on files nothing could run. That is
ATTACK-5 finding 1's "the abort checklist cannot undo it", literally.

## How this directory replaces the marker

- **No release sweeps it.** Every migration glob in both repos is non-recursive —
  aidream's `_glob_for`, `detect_applied.py`'s copy, this repo's `check-migrations.ts`
  `listSql` — so a file here is invisible to `release.sh` and to
  `pnpm check:migrations`. The marker's job is done structurally, by location.
- **A production apply must be a declared chair step.** An inverse is non-additive by
  construction — that is what reversing means — so the header is **`-- chair-step: <why>`
  and NO `-- target:` line at all**. 🚨 Re-headed 2026-09-16 (ATTACK-7 finding 2): these
  four files used to carry `-- target: branch,production` above the chair-step line, and
  that header is judged by the ALLOW-LIST, which `-- chair-step:` does not waive. It
  waived everything in `pnpm db:apply` and nothing in `uv run python
  db/apply_migrations.py`, so §8.9 step 3a was accepted by one command and refused by the
  other. A file carrying both is now refused by name, in both runners.
  `-- chair-step:` stands in for `-- additive: yes` and `-- guard:` on a header-less file
  and excuses its deny-list scan, and in exchange the runner prints the reason **and the
  file's entire body** before a single byte executes — and at `--target production`, in
  BOTH runners, runs ONLY when the command names the file (`--confirm-chair-step <file.sql>`),
  and writes the reason into `public._schema_migrations.chair_step`. No terminal, no human: the
  senior session that owns the work runs it; a smaller lane hands it up; never Arman.
- **The SAME bytes rehearse on the branch.** A header-less `-- chair-step:` file is
  accepted at `--target branch` precisely so rule 27's "the inverse was RUN on the branch"
  has a route that does not change a byte between the rehearsal and production.
  The one normative description of all of this is [`../JUDGMENT.md`](../JUDGMENT.md).
- **It is never swept, so it is always named.** Run one deliberately:

```
pnpm db:apply migrations/inverse/<file>.sql --target branch
pnpm db:apply migrations/inverse/<file>.sql --target production --confirm-chair-step <file>.sql
```

Files here are ledgered by **basename**.

## What each inverse still owes you

A down-migration refuses rather than corrupts. `custom_entity_types_detail_variant_down.sql`
counts the rows using `detail` first and raises if any exist — narrowing the CHECK under
live rows would make the table reject its own contents.
`custom_campaign_build_lock_down.sql` raises while any lock row is held, because dropping
the table does not release the lock, it erases the record of who holds it.

## 🚨 AN INVERSE PUTS A DEFECT BACK. IT MAY NOT TAKE THE GROUND OUT FROM UNDER THE PLATFORM.

An inverse file is a SNAPSHOT of the world on the day it was written, and this directory is
invisible to every sweep in both repos — so the platform keeps moving underneath it. Seven
instances of that, measured in one session (RED-SUITES-3, 2026-09-21): an inverse that dropped
`custom.record_relation_edges` while the STATEMENT-level triggers that had replaced its
row-level pair were still attached and still calling it, so the next insert into `custom.record`
exploded before the red twin beside it asked a single question; one that left NINETEEN triggers
over a dropped `custom.assert_store_door` — the whole record store; one that left forty-two;
one that dropped a body no trigger has run since the statement-level pair took over, so it was
INERT and its twin proved nothing; and three that demolished the `platform.memo_*` store, two
`history.row_versions` columns and two `iam` access-kernel functions that LATER migrations had
adopted.

**`pnpm check:inverses-leave-the-ground-standing` now refuses all four**, statically in the
release gate and — with `:live` — against `pg_trigger` and `pg_proc` on the real database. Before
you write or change a file here, read the header of
[`../../scripts/check-inverses-leave-the-ground-standing.ts`](../../scripts/check-inverses-leave-the-ground-standing.ts):

1. **The triggers come off BEFORE their functions.** A dropped function under an attached
   trigger is not a defect put back — it is a broken table. Where the set can move again,
   derive it from the live catalogue instead of listing it, and raise when nothing is left to
   take away. `storerel_a_relation_edge_names_its_field_down.sql` is the worked example.
2. **Do not call what a sibling inverse in your family drops** — or say in the file which of the
   two is meant to run, and in what order.
3. **A body you restore must be one something actually runs.** A restored body no trigger calls
   is a no-op that lies, and the red twin beside it passes with the defect never put back.
4. **An object a LATER migration adopted is not yours to remove.** Restore the defect and leave
   the infrastructure standing — neuter the behaviour instead of demolishing the ground.

A file that has looked at a clause and genuinely handled it says so in its own bytes,
`-- ground-standing-ok: <clauses>`, with the sentence that explains why beside it. That is not an
excuse list and there is no excuse list: the guard's counts are a ratchet that may only go down.

## Rule 27 over this directory — what passes, what cannot, and why (lane INVERSE-GUARD, 2026-09-22)

Rule 27 is `up → inverse → up`. On the rehearsal branch, which already carries every up-file,
the meaningful half is **inverse → up**: take the lane off, then put it back on top of what the
inverse left. One transaction per pair, always ending in `ROLLBACK`.

**The class defect it exposed, and the primitive that closed it.** An inverse may not drop a body
a live trigger reaches or a later lane adopted — the guard above refuses that. But an up-file
that creates those bodies with a bare `CREATE FUNCTION` can then never be re-applied on top of
what the inverse left, so rule 27 fails. 28 of 84 inverses failed exactly this way, and the same
pairs passed with the pre-fix inverse bytes, so it was the remedy that broke them and not the
inverses. The fix is not to edit ledgered files quietly (checksum drift forever) and not
`--reapply` (which re-EXECUTES a whole campaign file against the live database). It is
`pnpm db:apply --amend-idempotent <file> --target production`, which executes NOTHING: it finds
the ledgered bytes in git by checksum, proves the only difference is `CREATE FUNCTION` →
`CREATE OR REPLACE FUNCTION`, moves the ledger checksum and writes the old one plus
`amend-idempotent` into `chair_step` so the amendment is visible forever. **151 campaign
up-files were amended this way; none was executed.**

**Four things rule 27 cannot prove here, each for a stated reason — none of them a silenced
failure:**

1. **A lane-wide inverse has no single up-file.** `w3_hist_down.sql`, `w4_agg_down.sql`,
   `w4_query_down.sql`, `w3_mig_down.sql`, `w4_io_down.sql` and
   `w1_rule_apply_the_other_two_uses_down.sql` invert a whole LANE that shipped as many
   up-files (`w3_hist_grant_capture.sql`, `w3_hist_retention_and_the_floor.sql`, …). Rule 27 for
   them means applying every up-file of the lane, running the one inverse, and re-applying them
   all, in order — not a pair. Until that is scripted they are rehearsed by hand.
2. **`DROP INDEX CONCURRENTLY` cannot run inside a transaction block, at all.**
   `readperf_the_class_finds_its_row_without_a_scan_down.sql` drops sixteen creator indexes that
   way, so it can never be rehearsed in a rolled-back transaction and can never be proven
   without leaving something behind. It is rehearsed MANUALLY, on the branch, in an autocommit
   session, and the indexes are recreated by re-applying its up-file. Say so in the run notes.
3. **A refusal is the inverse working.** `w1_reg_registry_attributes_down.sql` stops because
   1,078 rows carry the column it would drop, and `w1_tier_external_tier_down.sql` stops on the
   provisioner's CLOSED-schema door. Those are the files declining to corrupt live rows — a
   PASS, recorded as a refusal, never "fixed".
4. **The rehearsal branch does not carry every lane.** Five inverses fail on the branch naming a
   function that exists on the MAIN database and not on the branch — `platform.memo_reach_tables`,
   `custom.choice_field_map`, `custom.choice_key_of`, `custom.choice_slug`,
   `custom.work_state_id` (branch 0, main 1, measured). Those are branch drift, not inverse
   bugs, and they cannot be rehearsed until the branch is levelled on those lanes or they are
   run on main inside the 1–4 AM PT window — dropping triggers off `custom.record` takes ACCESS
   EXCLUSIVE on the parent and sixteen partitions, which is a write freeze on the instance
   people sign in to.
