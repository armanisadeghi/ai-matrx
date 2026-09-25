-- chair-step: lane SOURCE-KEY, step 3 of 3 (closes the lane). PROGRESS-SOURCE-KEY.md RESUME HERE:
-- "the store refuses a custom_record:<table id> schedule or webhook with 23514... Readers still
-- accept both keys. Removing that read path ... is due after this release, per no-legacy." Step 1
-- made the store WRITE only record:<table id> and REPAIRED every stored row; step 2 made the store
-- REFUSE a write of the old key by name. This step retires the last acceptance of the retired key:
-- the two readers, custom.record_source_keys(table) and custom.record_source_table(key), stop
-- matching `custom_record:` at all. No client can write it (step 2) and no live row carries it
-- (census below), so nothing that reads through these two functions changes behavior.
-- lane: SOURCE-KEY
-- window-class: two function bodies (STABLE/IMMUTABLE SQL functions; no lock beyond the catalog
-- update CREATE OR REPLACE takes on pg_proc). Applied directly per the owner's ruling of
-- 2026-09-24 ~17:30 PT, under lock_timeout.
-- based-on: custom.record_source_keys(uuid) c16044b3a757331225db100371eb3d80460deeaf556a7d97a1606dea8954ad68
-- based-on: custom.record_source_table(text) c7d63831361d77d08fee45ccad4516f32977936fe58d77ef383720707923c52d
--
-- Measured before this file on production: 0 scheduler.sch_trigger rows, 0 files.webhooks rows,
-- and 0 platform.activity_log rows carry a custom_record:<table id> value (history is never
-- rewritten; there is simply none to rewrite). Both readers currently have EXECUTE revoked from
-- PUBLIC/anon/authenticated (server-side callers only), unchanged by this file.
-- Suite: scripts/campaign-tests/sourcekey_the_old_key_is_no_longer_read_red_green.sql.
-- Inverse: migrations/inverse/sourcekey_the_readers_stop_accepting_the_old_key_down.sql.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

-- The one key a record-store table's changes are matched under. record_source_keys used to
-- return BOTH the new and the old key so a webhook or schedule saved under either one still
-- matched; now that the store refuses the old key on write (step 2), there is only ever one to
-- match.
CREATE OR REPLACE FUNCTION custom.record_source_keys(p_table_id uuid)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$ select array[custom.record_source_key(p_table_id)] $function$;
REVOKE ALL ON FUNCTION custom.record_source_keys(uuid) FROM PUBLIC, anon, authenticated;

-- The table a record-store key names — now `record:<table id>` only. custom_record: is the
-- retired tier-2 table's word and nothing new names it; a value carrying that prefix is simply
-- not a record-store source key any more (returns null, same as any other unrecognized string).
CREATE OR REPLACE FUNCTION custom.record_source_table(p_key text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
    when p_key ~ '^record:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then substr(p_key, strpos(p_key, ':') + 1)::uuid
  end
$function$;
REVOKE ALL ON FUNCTION custom.record_source_table(text) FROM PUBLIC, anon, authenticated;
