-- target: branch,production
-- additive: yes
-- guard: custom/associations_guard
--
-- W1-REL, FILE 1 — THE COLUMNS, AND THE MARKER EVERY LATER REFRESH DEPENDS ON.
--
-- This file lands BEFORE this lane writes its first relation row, and before
-- `platform.validate_edge_payload()` / `platform.trg_reachability_on_association()` are ever
-- looked at again (BUILD-BOOK §4.6: the columns land before the bodies are replaced, and the
-- order is asserted rather than assumed).
--
-- WHAT LANDS, AND WHY EACH ONE IS HERE
-- ------------------------------------
--   `platform.associations.origin`     THE MARKER. §13's REFRESH is a MERGE, not a replace,
--   `platform.reachability.origin`     and it excludes `origin = 'campaign'` rows from its
--                                      `delete` and from its `on conflict` target. A relation
--                                      row written without it has silently opted itself out of
--                                      surviving to the gate. Both tables get it, because
--                                      `trg_associations_reachability` writes the second one
--                                      from the first and a marker on one end only is a marker
--                                      that vanishes halfway.
--   `platform.associations.version`    REL-16, literally: the two columns `platform._touch_row`
--   `platform.associations.updated_at` and `platform._version_capture` READ are added BEFORE
--                                      those triggers exist, never after. `_touch_row` asks
--                                      `to_jsonb(NEW) ? 'version'` and `? 'updated_at'` and is
--                                      inert on a row type that carries neither — so attaching
--                                      it first would have been a silent no-op, which is
--                                      exactly the failure REL-16 is written to prevent.
--   `platform.associations.relation_field_id`
--                                      WHICH Field declares this edge. REL-11 says nothing
--                                      about a relation is stored in the VALUE; it says nothing
--                                      at all about the EDGE, and the edge is where an edge's
--                                      own identity belongs. This column is what lets the
--                                      trigger in file 3 find the declaration (flavor,
--                                      on_delete, binding, ordered, loops, carries, cardinality,
--                                      target) without reading it out of the relating record's
--                                      document. It is NULL on every one of the 34,216 rows
--                                      that exist today and on every non-relation edge ever
--                                      written, which is what makes file 3's trigger structurally
--                                      inert on the old path.
--
-- ANSWER IDENTITY, SAID EXACTLY (rule 30, and §1's `W1-REL` row).
-- `authenticated` holds SELECT on `platform.associations`, so PostgREST `select('*')` returns
-- these five columns the instant they land. The OFF proof is therefore NOT byte identity of a
-- row shape — it cannot be — it is ANSWER identity: every existing read returns the same VALUES
-- it returned against the go-signal capture, with the new keys NULL on every row. Nothing in
-- this file writes a value into any of them; nothing in this file has a body; and no live
-- function, policy or trigger is touched.
--
-- THE GUARD. `custom/associations_guard` holds the MEANING of these columns off, never their
-- visibility — files 2, 3 and 4 read `platform.knob_resolve('custom','associations_guard', …)`
-- and do nothing while it resolves false. A column cannot read a knob; the machinery over it
-- can, and does.
--
-- THE INVERSE: `migrations/inverse/w1_rel_the_relation_columns_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '300s';

alter table platform.associations add column if not exists origin text;
alter table platform.associations add column if not exists version integer;
alter table platform.associations add column if not exists updated_at timestamp with time zone;
alter table platform.associations add column if not exists relation_field_id uuid;

alter table platform.reachability add column if not exists origin text;

comment on column platform.associations.origin is
  'W1-REL / BUILD-BOOK §13: who wrote this edge. `campaign` marks a row the unified-data campaign wrote; THE REFRESH excludes those rows from its delete and from its on-conflict target, so they survive a re-copy of production''s graph. NULL means production wrote it.';
comment on column platform.reachability.origin is
  'W1-REL / BUILD-BOOK §13: the same marker on the derived end. `trg_associations_reachability` carries it down from the association that produced the row, so a campaign edge''s closure survives THE REFRESH with the edge.';
comment on column platform.associations.version is
  'W1-REL / REL-16: read and bumped by platform._touch_row, captured by platform._version_capture. Added BEFORE either trigger is attached, because _touch_row is inert on a row type that carries no such column and would have been a silent no-op.';
comment on column platform.associations.updated_at is
  'W1-REL / REL-16: set by platform._touch_row on every write. Added before the trigger, for the same reason as version.';
comment on column platform.associations.relation_field_id is
  'W1-REL / REL-1..REL-12: the custom.record id of the Field whose behaviour is `relation` and whose key is this edge''s `role`. NULL on every edge that is not one of this campaign''s relations - which is every edge that existed before this column, and every association the rest of the platform writes. The relation contract trigger reads the declaration through this column and returns untouched when it is NULL.';

-- The two reads file 2 and file 3 make constantly: "this record's relations" and "everything
-- pointing at this record" (REL-9's both ends), and THE REFRESH's own `where origin = 'campaign'`.
create index if not exists idx_assoc_relation_field_live
  on platform.associations (relation_field_id)
  where deleted_at is null and relation_field_id is not null;

create index if not exists idx_assoc_origin_campaign
  on platform.associations (origin)
  where origin is not null;
