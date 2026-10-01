-- LANE READINESS-PARITY — THE FINAL SWITCH SEES A STORE-WRITER ORGANIZATION'S SCOPES ON BOTH SIDES,
-- measured RED then GREEN on the dev clone (production's data; clone-20261001 carries the live case).
--
-- THE USE CASE. Alex Hart's Workspace keeps its Classes as scopes and writes them in the store first.
-- A junk sweep DELETEd "Biology 101 — Live Test" from context.scopes outside the doors at 05:03Z (the
-- write-through archived its Record), and a later restore put the context row back without the Record.
-- The final switch said Ready, 0 blocked. Castellano & Reyes, LLP (also a store writer) keeps its
-- Matters fully on both sides.
--
-- WHAT MAKES IT FAIL (RED before readinessparity_a_readiness_sees_a_store_writer_organizations_scopes_on_both_sides.sql):
--   T1  _final_switch_readiness() blocks Alex Hart's Workspace by name: a blocking line names
--       "Classes: 1 scope is live in the current scope tables with no live record in the store
--       (Biology 101 — Live Test)", the organization is not ready, blocked >= 1, ready = false
--   T2  the repair (the write-through door for that one scope, repair.sql's statement) clears it:
--       Alex Hart's Workspace is no longer blocked by store_image_parity
--   T3  Castellano: one store Record archived behind its live scope (planted) blocks Castellano,
--       naming that scope and nothing else of Castellano's
--   T4  the other direction: one scope archived in the current scope tables while its Record stays
--       live (planted, the write-through skipped as a door that wrote the store would) is named as
--       "live in the store with no live scope"
--   T5  the measure is the owner's: no client role may call platform.cutover_store_writer_scope_parity
--
-- Run (rolled back, nothing kept): the clone only.
set statement_timeout = '5min';   -- the block reads the whole final-switch readiness five times
set lock_timeout = '60s';         -- peers rehearse on the same clone
do $t$
declare
  v_alex uuid := '8cb71c8b-5b49-4563-a5fe-d77ff600f8ee';
  v_bio  uuid := 'ad54136e-e8e0-4e2d-b215-fd788756d028';
  v_cast uuid := '7cd12da2-2213-4378-8fba-a9e2dc4ea657';
  v_fs jsonb; v_o jsonb; v_rec uuid; v_name text; v_rec2 uuid; v_name2 text; v_line text;
begin
  -- T1
  v_fs := platform._final_switch_readiness();
  select x into v_o from jsonb_array_elements(v_fs -> 'organizations') x where (x ->> 'id')::uuid = v_alex;
  if v_o is null or not exists (select 1 from jsonb_array_elements(v_o -> 'cannot_clear') c where c ->> 'key' = 'store_image_parity') then
    raise exception 'T1 RED: Alex Hart''s Workspace is not blocked by store/image parity (ready=%, blocked=%, its cannot_clear=%)',
      v_fs ->> 'ready', v_fs -> 'totals' ->> 'blocked', coalesce(v_o -> 'cannot_clear', 'null');
  end if;
  select x into v_line from jsonb_array_elements_text(v_fs -> 'blocking') x
   where x like 'Alex Hart''s Workspace — Scope and context screens: not yet: every live scope is live in both the store and the current scope tables: Classes: 1 scope is live in the current scope tables with no live record in the store (Biology 101 — Live Test)%';
  if v_line is null then
    raise exception 'T1 RED: no blocking line names Biology 101: %', v_fs -> 'blocking';
  end if;
  if (v_fs ->> 'ready')::boolean or (v_o ->> 'ready')::boolean or (v_fs -> 'totals' ->> 'blocked')::int < 1 then
    raise exception 'T1 RED: readiness still reads ready (ready=%, org ready=%, blocked=%)', v_fs ->> 'ready', v_o ->> 'ready', v_fs -> 'totals' ->> 'blocked';
  end if;
  raise notice 'T1 GREEN: %', v_line;

  -- T2 (the repair, exactly repair.sql's statement)
  perform set_config('app.actor_system', 'readiness-parity repair: Biology 101 record re-made from its scope', true);
  perform custom._ctx_bridge('scopes', 'UPDATE', to_jsonb(s), s.organization_id, s.scope_type_id)
     from context.scopes s
    where s.id = v_bio and s.organization_id = v_alex and s.deleted_at is null
      and custom.context_writer(s.organization_id) = 'store';
  v_fs := platform._final_switch_readiness();
  select x into v_o from jsonb_array_elements(v_fs -> 'organizations') x where (x ->> 'id')::uuid = v_alex;
  if exists (select 1 from jsonb_array_elements(v_o -> 'cannot_clear') c where c ->> 'key' = 'store_image_parity') then
    raise exception 'T2 RED: still blocked after the repair: %', v_o -> 'cannot_clear';
  end if;
  raise notice 'T2 GREEN: Alex Hart''s Workspace no longer blocked by parity (blocked total now %)', v_fs -> 'totals' ->> 'blocked';

  -- T3
  select s.id, s.name into v_rec, v_name from context.scopes s
    join context.scope_types t on t.id = s.scope_type_id and t.deleted_at is null
   where s.organization_id = v_cast and s.deleted_at is null
     and exists (select 1 from custom.record r where r.organization_id = v_cast and r.id = s.id and r.deleted_at is null)
   order by s.name, s.id limit 1;
  perform set_config('app.actor_system', 'readiness-parity-test', true);
  update custom.record set deleted_at = now() where organization_id = v_cast and id = v_rec;
  v_fs := platform._final_switch_readiness();
  select x into v_line from jsonb_array_elements_text(v_fs -> 'blocking') x where x like 'Castellano & Reyes, LLP — %';
  if v_line is null or position(format('1 scope is live in the current scope tables with no live record in the store (%s)', v_name) in v_line) = 0 then
    raise exception 'T3 RED: the planted archived Record (%) is not named for Castellano: %', v_name, v_fs -> 'blocking';
  end if;
  if (select count(*) from jsonb_array_elements_text(v_fs -> 'blocking') x where x like 'Castellano & Reyes, LLP — %') <> 1 then
    raise exception 'T3 RED: Castellano has more than the planted line: %', v_fs -> 'blocking';
  end if;
  raise notice 'T3 GREEN: %', v_line;

  -- T4
  select s.id, s.name into v_rec2, v_name2 from context.scopes s
    join context.scope_types t on t.id = s.scope_type_id and t.deleted_at is null
   where s.organization_id = v_cast and s.deleted_at is null and s.id <> v_rec
     and not exists (select 1 from context.scopes c where c.parent_scope_id = s.id and c.deleted_at is null)
     and exists (select 1 from custom.record r where r.organization_id = v_cast and r.id = s.id and r.deleted_at is null)
   order by s.name, s.id limit 1;
  perform custom._ctx_mark('door');   -- as a door that wrote the store itself: the write-through is skipped
  update context.scopes set deleted_at = now() where id = v_rec2;
  perform custom._ctx_mark('');
  v_fs := platform._final_switch_readiness();
  select x into v_line from jsonb_array_elements_text(v_fs -> 'blocking') x where x like 'Castellano & Reyes, LLP — %';
  if v_line is null or position(format('1 record is live in the store with no live scope in the current scope tables (%s)', v_name2) in v_line) = 0 then
    raise exception 'T4 RED: the planted archived scope (%) is not named the other way: %', v_name2, v_line;
  end if;
  raise notice 'T4 GREEN: %', v_line;

  -- T5
  if has_function_privilege('authenticated', 'platform.cutover_store_writer_scope_parity()', 'execute')
     or has_function_privilege('anon', 'platform.cutover_store_writer_scope_parity()', 'execute') then
    raise exception 'T5 RED: a client role may call the parity measure';
  end if;
  raise notice 'T5 GREEN: closed to anon and authenticated';

  raise exception 'ALL GREEN (rolled back on purpose)';
end
$t$;
