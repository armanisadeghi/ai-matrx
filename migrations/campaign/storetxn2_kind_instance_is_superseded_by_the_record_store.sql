-- additive: yes — ONE insert into an existing platform register. No DDL, no DROP, no REVOKE, no
--   data movement, and deliberately NOT `platform.deprecate_relation()`.
-- lock: platform
-- lane: STORE-TXN-2
--
-- THE DECLARATION EVERY KIND-RECORD GUARD ALREADY RESTED ON, WHICH WAS NEVER WRITTEN DOWN.
--
-- WHAT WAS WRONG. `aidream/services/kind_records/routed.py` — the ONE door every server path
-- that stores a kind record goes through (CUT-N-13-TAIL) — names `content_ir.kind_instance` as
-- the relation it speaks for, and its first guard clause,
-- `packages/matrx-records/tests/test_kind_records_go_through_the_door.py::
-- test_the_door_speaks_for_a_relation_the_platform_really_superseded`, reads that name back out
-- of `platform.deprecated_relations` and asserts a row is there. There is no row. The main
-- database carries 398 rows, 13 of them with a `custom.*` successor, and not one of them is this
-- relation: W1-REG gave `content_ir.kind_instance` the write guard and the Deprecated type but
-- left the supersession UNDECLARED, because REC-37 puts the move itself at switch-checklist
-- step 8. So the guard's premise was false — it was red on the main database and it was red
-- about the register, not about the door.
--
-- WHY THE ROW IS THE FIX AND NOT THE TEST. The declaration is TRUE and it is the thing the
-- platform's own enumeration reads: `matrx_records.server.enumeration` decides which registered
-- models are record-bearing by intersecting matrx-orm's registry with THIS register, so a
-- relation whose successor is undeclared is a relation no enumeration can see — which is exactly
-- how ten server paths came to be writing into a table nobody reads without any query being able
-- to name them. Deleting the clause instead would have put the door back to speaking for a
-- relation nothing says moved.
--
-- 🚨 A ROW HERE IS A DECLARATION. IT IS NOT THE TRIPWIRE. `platform.deprecate_relation(schema,
-- name, new_ref)` is the function that RENAMES the relation, puts a raising view in its place
-- and hangs an INSTEAD OF trigger on it. This file does not call it and must not:
-- `content_ir.kind_instance` is LIVE, every organization that has not adopted the store still
-- reads and writes it, and the OFF arm of `RecordsGateway` is exactly those reads and writes
-- continuing to work. `archived_as` is left null, which is how the two are told apart — a
-- declared supersession has no archive; a tripped one names its archive. Tripping this one is
-- REC-37 step 8's, after its census, behind the lock, and it is the last thing this campaign
-- does. This is the same shape, the same words and the same null that
-- `aidream/db/migrations/campaign/srv_the_supersession_register.sql` used for its thirteen.
--
-- IDEMPOTENT: `on conflict (old_ref) do nothing`, so re-running changes nothing and so that when
-- REC-37 step 8 later calls `deprecate_relation` (whose own upsert DOES overwrite) its archive
-- reference wins over this declaration rather than colliding with it.

insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
values
  ('content_ir.kind_instance', 'custom.record', null,
   'unified data campaign (REC-37: kinds hold no data — a kind is a SHAPE and the data it shapes is a record): superseded by the record store. W1-REG gave this relation the write guard and the Deprecated type; lane STORE-TXN-2 wrote the supersession itself, 2026-09-22, so the enumeration and aidream/services/kind_records/routed.py have a register row to stand on. DECLARATION ONLY — the relation is live and still served on the OFF arm of the switch; the tripwire is REC-37 step 8''s.')
on conflict (old_ref) do nothing;
