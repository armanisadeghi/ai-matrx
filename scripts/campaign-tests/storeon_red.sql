-- STORE-ON — THE RED TWIN of scripts/campaign-tests/storeon_green.sql.
--
-- A guard you cannot demonstrate failing is not a guard. This file plants, one at a time and
-- inside its own rolled-back transaction, the four states the green suite exists to catch, and
-- RAISES if the green suite's own predicate would still read clean. Nothing here survives: the
-- whole file ends in ROLLBACK and every plant is made after `begin;`.
--
-- ARM A — the platform default goes back to false. Every organization that has never touched
--         the switch reads OFF again. This is the pre-2026-09-23 world.
-- ARM B — one active organization is switched off with no reason given. The store is dark for
--         everyone inside it and nothing on the platform says why.
-- ARM C — the two halves of the one switch are pulled apart (FIX-11A's defect): the screen says
--         on, the server's kill switch says off.
-- ARM D — the FACTORY RESET alone goes back to false while the live value stays true. This is
--         the half-recorded ruling: green today, and undone by the next
--         `platform.feature_knob_set(…, null)`.
--
-- Arm C has to defeat FIX-11A's `store_switch_halves_follow_each_other_tg`, which exists
-- precisely to stop the halves drifting. It is disabled for the length of this transaction and
-- the ROLLBACK puts it back — the same technique `check:one-switch-two-halves:self-test` uses.
--
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$CLONE_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storeon_red.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'storeon_red.sql'
\set requires 'relation:platform.feature_knob|relation:platform.knob_override|relation:iam.organizations|function:platform.knob_resolve'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

set local lock_timeout = '2s';
set local statement_timeout = '10min';

-- The green suite's clause 3 reads both halves; arm C needs the mirror out of the way.
alter table platform.knob_override disable trigger store_switch_halves_follow_each_other_tg;

do $storeon_red$
declare
  v_org   uuid;
  v_name  text;
  v_n     int;
begin
  -- A borrowed organization for arms B and C: a real, active one, put back by the ROLLBACK.
  select o.id, o.name into v_org, v_name
    from iam.organizations o
   where o.archived_at is null
     -- Never a personal organization: the owner's own workspace is not a fixture, even
     -- inside a transaction that rolls back.
     and coalesce(o.is_personal, false) = false
     and coalesce(o.is_system, false) = false
     and platform.knob_resolve('custom','system_enabled',o.id,null,null) = 'true'::jsonb
     and platform.knob_resolve('custom','code_paths_enabled',o.id,null,null) = 'true'::jsonb
   order by o.created_at
   limit 1;
  if v_org is null then
    raise exception 'storeon_red.sql cannot run: no active organization reads the store ON, so there is nothing to break. Run storeon_green.sql — it will tell you the same thing in more detail.';
  end if;

  -- ── ARM A — the platform default goes back to false ───────────────────────────────────
  update platform.feature_knob set value = 'false'::jsonb
   where feature = 'custom' and key = 'system_enabled';
  if (select value from platform.feature_knob where feature='custom' and key='system_enabled') = 'true'::jsonb then
    raise exception 'ARM A DID NOT ARM: the platform value is still true after being set false.';
  end if;
  select count(*) into v_n
    from iam.organizations o
   where o.archived_at is null
     and platform.knob_resolve('custom','system_enabled',o.id,null,null) is distinct from 'true'::jsonb
     and not exists (select 1 from platform.knob_override k
                      where k.feature='custom' and k.key='system_enabled'
                        and k.scope_kind='organization' and k.organization_id=o.id
                        and k.value='false'::jsonb
                        and length(btrim(coalesce(k.set_note,''))) >= 20);
  raise notice 'ARM A: platform default false — clause 1 would fail on the value, and % active organizations would read OFF by omission.', v_n;
  update platform.feature_knob set value = 'true'::jsonb
   where feature = 'custom' and key = 'system_enabled';

  -- ── ARM B — one organization off, with no reason ──────────────────────────────────────
  insert into platform.knob_override
    (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'false'::jsonb, '')
  on conflict (feature, key, scope_kind, scope_id, organization_id)
  do update set value = 'false'::jsonb, set_note = '';
  if platform.knob_resolve('custom','system_enabled',v_org,null,null) = 'true'::jsonb then
    raise exception 'ARM B DID NOT ARM: % still resolves true after a false override was written at its own rung.', v_name;
  end if;
  select count(*) into v_n
    from iam.organizations o
    left join platform.knob_override ov
           on ov.feature='custom' and ov.key='system_enabled'
          and ov.scope_kind='organization' and ov.organization_id=o.id
   where o.archived_at is null
     and platform.knob_resolve('custom','system_enabled',o.id,null,null) is distinct from 'true'::jsonb
     and not (ov.value = 'false'::jsonb and length(btrim(coalesce(ov.set_note,''))) >= 20);
  if v_n < 1 then
    raise exception 'ARM B FAILED: % is switched off with no reason and the green suite''s clause 2 counts % offenders. A switched-off organization that nobody can explain is exactly what that clause is for.', v_name, v_n;
  end if;
  raise notice 'ARM B: % switched off with no reason — clause 2 would name % organization(s).', v_name, v_n;

  -- ── ARM C — the two halves pulled apart ───────────────────────────────────────────────
  update platform.knob_override set value = 'true'::jsonb, set_note = 'red twin: the screen half only'
   where feature='custom' and key='system_enabled'
     and scope_kind='organization' and organization_id = v_org;
  insert into platform.knob_override
    (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','code_paths_enabled','organization', v_org, v_org, 'false'::jsonb, 'red twin: the server half disagrees')
  on conflict (feature, key, scope_kind, scope_id, organization_id)
  do update set value = 'false'::jsonb;
  select count(*) into v_n
    from iam.organizations o
   where o.archived_at is null
     and platform.knob_resolve('custom','system_enabled',o.id,null,null)
         is distinct from platform.knob_resolve('custom','code_paths_enabled',o.id,null,null);
  if v_n < 1 then
    raise exception 'ARM C FAILED: the two halves of %''s switch were set to disagree and the green suite''s clause 3 counts % disagreements. Every screen would say on while the server refused — FIX-11A''s Greenline Landscaping Crew.', v_name, v_n;
  end if;
  raise notice 'ARM C: the halves disagree for % — clause 3 would name % organization(s).', v_name, v_n;

  -- ── ARM D — the factory reset alone goes back to false ────────────────────────────────
  update platform.feature_knob set default_value = 'false'::jsonb
   where feature = 'custom' and key = 'system_enabled';
  if (select default_value from platform.feature_knob where feature='custom' and key='system_enabled') = 'true'::jsonb then
    raise exception 'ARM D DID NOT ARM: default_value is still true after being set false.';
  end if;
  if (select value from platform.feature_knob where feature='custom' and key='system_enabled') <> 'true'::jsonb then
    raise exception 'ARM D DID NOT ARM: the live value moved too, so this arm is not testing what it claims.';
  end if;
  raise notice 'ARM D: the live value is true and the factory reset is false — clause 1 would fail on default_value, which is the half a ruling loses quietly.';

  raise notice 'storeon_red.sql: ALL 4 ARMS ARMED AND CAUGHT. Everything here goes with the ROLLBACK below.';
end
$storeon_red$;

rollback;
