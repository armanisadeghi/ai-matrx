-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- based-on: custom.history_prune(uuid, text, uuid, boolean) c2827e870669123feff89c675873905cfac339ca49df4a3868bfb6ac0f0120fa
-- based-on: custom.history_retention_set(uuid, uuid, integer) c71e459f707d6a2ad30ba1edf614fc2c8cd942159e2d011a0d9df6a3292db76d
-- based-on: custom.history_retention_floor_raise(uuid, integer) dad3ad24340d898a3719b32494bacc1838dac89a8268c86b5e804a08e499fd46
--
-- STORE-REL 6b — THE THREE RETENTION DOORS SAY THE LADDER IN THEIR OWN BODIES.
--
-- `pnpm check:store-doors-decide` went red on the three doors STORE-REL 6 declared:
-- *"declared client-callable, is SECURITY DEFINER, takes an id - and its body never reaches
-- the one ladder."* They DID reach it — through `custom.assert_organization_admin`, whose own
-- first line is `custom.assert_client_may_reach` — but the guard reads THE DOOR'S OWN BODY,
-- and it is right to: a reader of the door has to see the question without following a call.
-- The organization wall is now asked in each of the three, by name, before anything else.
--
-- Nothing else moves: the same rung, the same refusal, the same delegation into schema
-- `history`. `custom.assert_client_may_reach` is idempotent and side-effect-free, so asking it
-- twice on the way through costs one catalogue lookup and buys a body that says what it does.
--
-- INVERSE: migrations/inverse/storerel_the_three_retention_doors_say_the_ladder_themselves_down.sql

set lock_timeout = '3s';
set statement_timeout = '2min';

create or replace function custom.history_retention_set(p_organization_id uuid, p_table_id uuid, p_days integer)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.history_retention_set');
  perform custom.assert_organization_admin(p_organization_id, 'custom.history_retention_set',
                                           'change how long a table keeps its history');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.history_retention_set');
  perform custom.assert_store_door(p_organization_id, 'custom.history_retention_set');
  -- The refusal T14 names - "History here is kept for at least 30 days, so this table cannot
  -- keep only 10" - is `history.retention_set`'s own sentence, unchanged. This door only
  -- decides who may ask.
  return history.retention_set(p_organization_id, p_table_id, p_days);
end;
$function$;

create or replace function custom.history_retention_floor_raise(p_organization_id uuid, p_days integer)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.history_retention_floor_raise');
  perform custom.assert_organization_admin(p_organization_id, 'custom.history_retention_floor_raise',
                                           'raise how long this organization keeps its history');
  perform custom.assert_store_door(p_organization_id, 'custom.history_retention_floor_raise');
  -- HIS-3: thirty is the platform minimum and an organization may only ever RAISE it. That
  -- rule lives in history.retention_floor_raise and is untouched here.
  return history.retention_floor_raise(p_organization_id, p_days);
end;
$function$;

create or replace function custom.history_prune(
  p_organization_id uuid,
  p_scope           text    default 'values',
  p_table_id        uuid    default null,
  p_dry_run         boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.history_prune');
  perform custom.assert_organization_admin(p_organization_id, 'custom.history_prune',
                                           'prune this organization''s history');
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.history_prune');
  end if;
  perform custom.assert_store_door(p_organization_id, 'custom.history_prune');
  -- EVERY RULE STAYS WHERE IT IS. HIS-4's refusal to prune the Migration log, the
  -- two-most-recent-versions policy, the retention cutoff and the guard over any row the
  -- Migration log names are all `history.prune`'s, and it answers with what it would take
  -- when p_dry_run is true - which is the shape T14's sixty-days-later clause needs.
  return history.prune(p_organization_id, p_scope, p_table_id, p_dry_run);
end;
$function$;
