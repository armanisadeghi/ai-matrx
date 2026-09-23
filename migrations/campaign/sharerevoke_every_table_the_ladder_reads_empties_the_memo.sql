-- chair-step: it REPLACES `platform.memo_reach_tables()` (the declared list of every table the
--   store's three door predicates read) with the same fourteen names plus five it was missing,
--   and CREATES the same statement-level memo-clearing triggers WRITE-PERF-3 put on the other
--   fourteen on those five. Nothing is dropped, nothing is revoked, no row of anybody's data is
--   touched. (A first cut, `sharerevoke_a_revoked_share_forgets_the_yes.sql`, built the triggers
--   at runtime, which hides them from the window-class judgement; it was rehearsed on the clone
--   only, never committed, and is replaced by this file — its clone ledger row is `rehearsal_on`.) A new trigger can only ever make a remembered yes be forgotten SOONER. The inverse
--   is `migrations/inverse/sharerevoke_every_table_the_ladder_reads_empties_the_memo_down.sql`.
-- lock: platform,iam,custom
-- lane: SHARE-REVOKE
-- based-on: platform.memo_reach_tables() 3b3bf8d2ef10ba1249cc099471e07c197708fcb3119ac3c143416676d06ed3f1
--
-- SHARE-REVOKE — A REVOKED SHARE FORGETS THE YES IT GAVE, INSIDE THE SAME STATEMENT TOO.
--
-- THE FINDING. `scripts/campaign-tests/sharedonly_green.sql` PART 6 failed on the nightly dev
-- clone: "the share was revoked and the table still opened for her". Adjudicated 2026-09-23 by
-- this lane:
--
--   * NOT CLONE DRIFT. Every door body the suite exercises (`custom.read_records`,
--     `custom.read_record`, `custom.assert_may_know_table`, `custom.has_visibility`,
--     `custom.my_levels`, `custom.share_grant`, `custom.share_revoke`, `custom.share_access`,
--     `custom.record_delete`, the `iam.*visib*` family, `platform.memo_k_get/put`,
--     `platform.memo_clear`) hashes IDENTICALLY on production and on the clone, and so do the
--     memo-clearing triggers. Production would fail PART 6 the same way.
--   * NOT A LEAK THROUGH ANY CLIENT DOOR. Walked on production from test@test.com's seat over
--     PostgREST, one request per call, in admin's Workspace (shared_only): refused before the
--     share, one row after it, and on the very next call after `share_revoke` a 42501 and the
--     table gone from her list.
--   * REAL, AND NARROW. `custom.assert_may_know_table` remembers its YES for the rest of the
--     STATEMENT (`platform.memo_k_put`, stamped with the seat, `statement_timestamp()`, the
--     backend, the transaction and the memo generation `mx_memo.g`). The generation moves only
--     when a table in `platform.memo_reach_tables()` is written. `iam.permissions` — the table
--     every record and table share lives in, read by `custom.visible_set`,
--     `custom.read_door_granted_ids` and `custom.addressed_cap` — was never on that list. So a
--     read, a revoke and a second read by the same seat INSIDE ONE STATEMENT get the first
--     read's yes back: the table still "opens" (with zero rows, because the rows are asked
--     separately and are not remembered). The suite does exactly that inside one DO block; no
--     client can, because every client call is its own statement. Measured on the clone: the
--     same three calls as separate statements refuse; inside one DO block they do not; the same
--     DO block with `platform.memo_clear()` after the revoke refuses.
--
-- THE CLASS. The list was "read out of the function bodies on 2026-09-20" by hand, and the
-- census that guards it (`platform.memo_reach_unguarded()`) only proves that every DECLARED
-- table carries the triggers — never that every table the ladder READS is declared. Derived
-- this time from the bodies themselves (every relation named in the callee closure of
-- `custom.has_visibility`, `custom.visible_predicate_sql` and `custom.assert_client_may_reach`,
-- string literals included because the predicate is dynamic SQL), five base tables the ladder
-- reads were missing:
--
--   iam.permissions                    every direct record / table share           (THIS DEFECT)
--   custom.carrying_rule               which containment edges carry their contents
--   custom.portal_table                which tables a portal carries
--   platform.association_types         the edge types, and whether each carries
--   platform.shareable_resource_registry  which resource types may be shared at all
--
-- and one is left out ON PURPOSE: `custom.visibility_cache` is derived, never the authority
-- (its own comment: "a CACHE, never the authority"). It is written only by
-- `custom.trg_associations_bump_visibility`, `custom.visibility_warm` and
-- `custom.visibility_cache_rebuild` from `platform.associations` — whose writes already empty
-- the memo — and it is served only when its epoch stamp is current.
-- The derived census lives in `scripts/campaign-tests/sharerevoke_green.sql` CLAUSE 4, with that
-- exclusion named, so a sixth table the ladder starts reading is named the day it lands.
--
-- COST. One `platform.memo_clear()` (four `set_config` calls) per STATEMENT that writes one of
-- these five tables. None of them is on the record write path; `iam.permissions` is written by
-- share and grant doors only.

CREATE OR REPLACE FUNCTION platform.memo_reach_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- EVERY BASE TABLE THE STORE'S THREE DOOR PREDICATES AND THE LADDER UNDER THEM READ. Read out
  -- of the function bodies on 2026-09-20, not remembered:
  --   custom.assert_store_door -> custom.store_is_open -> platform.knob_resolve  (knob tables
  --     already carry `platform.memo_bump`, which is why they are not repeated here)
  --   custom.assert_client_may_reach -> iam.has_org_access -> iam.memberships, iam.system_orgs
  --                                  -> custom.portal_admits -> custom.portal,
  --                                     custom.portal_principal
  --   custom.assert_may_know_table -> custom.has_visibility -> custom.reaches_directly
  --                                  -> platform.associations, platform.reachability,
  --                                     platform.entity_relationships, platform.entity_types,
  --                                     platform.rulebook, platform.entity_grants,
  --                                     iam.membership_grant, iam.org_industries,
  --                                     iam.organizations, custom.record
  -- SHARE-REVOKE 2026-09-23, DERIVED from the bodies rather than read by eye, added the five the
  -- 2026-09-20 reading missed:
  --   custom.visible_set, custom.read_door_granted_ids, custom.addressed_cap -> iam.permissions
  --   custom.carrying_edges_in -> custom.carrying_rule, custom.portal_table,
  --                               platform.association_types
  --   iam.owner_of             -> platform.shareable_resource_registry
  -- The derived census is `scripts/campaign-tests/sharerevoke_green.sql` CLAUSE 4.
  select array[
    'platform.associations', 'platform.entity_grants', 'platform.entity_relationships',
    'platform.entity_types', 'platform.reachability', 'platform.rulebook',
    'iam.memberships', 'iam.membership_grant', 'iam.org_industries', 'iam.organizations',
    'iam.system_orgs', 'custom.portal', 'custom.portal_principal', 'custom.record',
    'iam.permissions', 'custom.carrying_rule', 'custom.portal_table',
    'platform.association_types', 'platform.shareable_resource_registry'
  ]::text[];
$function$;

-- WRITTEN OUT, NEVER BUILT AT RUNTIME, so both runners' window-class judgement reads every
-- statement. `CREATE OR REPLACE TRIGGER`, never drop-and-create: `DROP TRIGGER` is one of the two
-- statements the supautils hook fires on. Measured on the clone 2026-09-23 (`pnpm db:rehearse`):
-- SHARE ROW EXCLUSIVE on these five tables and on nothing else, no ACCESS EXCLUSIVE anywhere.

create or replace trigger zz_memo_clear_i after insert on iam.permissions
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_u after update on iam.permissions
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_d after delete on iam.permissions
  for each statement execute function platform.memo_clear_stmt();

create or replace trigger zz_memo_clear_i after insert on custom.carrying_rule
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_u after update on custom.carrying_rule
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_d after delete on custom.carrying_rule
  for each statement execute function platform.memo_clear_stmt();

create or replace trigger zz_memo_clear_i after insert on custom.portal_table
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_u after update on custom.portal_table
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_d after delete on custom.portal_table
  for each statement execute function platform.memo_clear_stmt();

create or replace trigger zz_memo_clear_i after insert on platform.association_types
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_u after update on platform.association_types
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_d after delete on platform.association_types
  for each statement execute function platform.memo_clear_stmt();

create or replace trigger zz_memo_clear_i after insert on platform.shareable_resource_registry
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_u after update on platform.shareable_resource_registry
  for each statement execute function platform.memo_clear_stmt();
create or replace trigger zz_memo_clear_d after delete on platform.shareable_resource_registry
  for each statement execute function platform.memo_clear_stmt();

-- THE CENSUS, AT APPLY TIME. Every declared table — the five new ones included — carries its
-- three triggers, or the apply refuses.
do $do$
declare v_n integer;
begin
  select count(*) into v_n from platform.memo_reach_unguarded();
  if v_n <> 0 then
    raise exception 'SHARE-REVOKE: % declared memo reach event(s) still carry no memo-clearing trigger', v_n;
  end if;
end $do$;
