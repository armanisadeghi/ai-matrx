-- LANE OLD-TABLES-2 — W4, THE ROLLOUT IS AN ORGANIZATION'S DECISION. GREEN. Ends in ROLLBACK.
--
-- Whether people can CREATE a column that points at another table is a behavioural choice, so
-- it is a knob with a default and organizations decide. The default is OFF, the per-organization
-- value is a `platform.knob_override` row written through `platform.knob_override_set` — the
-- door that checks the writer is an owner or admin of THAT organization and files the audit —
-- and `platform.feature_knob` is the PLATFORM default, which is not any organization's to
-- change (the attacker's H6/M5: rev 1 of the plan proposed flipping that row per organization,
-- which would have made one organization's choice everybody's).
--
-- THE USE CASE. admin's Workspace runs Rincon Plumbing & Drain's dispatch board and wants the
-- customer column; Ashford Labs, an organization that has never heard of it, must be unaffected.
--
-- WHAT IT PROVES
--   0  the register row exists, defaults FALSE, and is overridable at the organization rung
--   1  WITH NO OVERRIDE both organizations resolve FALSE — nobody's picker gained an option
--   2  AN OVERRIDE THROUGH THE DOOR turns it on for that organization, and the seat that wrote
--      it is an owner of that organization (the door, not a direct write)
--   3  THE SECOND ORGANIZATION IS UNTOUCHED — still FALSE, asserted on a real second org
--   4  REMOVING IT through the same door returns that organization to FALSE
--   5  `platform.feature_knob` NEVER MOVED — the platform default is still FALSE and still says
--      it is overridable at the organization rung, which is the whole point of the distinction
--
-- Its twin is scripts/campaign-tests/udtrelknob_red.sql.
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/udtrelknob_green.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'udtrelknob_green.sql'
\set requires 'function:platform.knob_override_set|function:platform.knob_resolve|row:platform.feature_knob:feature = \'data_tables.relation\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\echo ''
\echo '── 0 · the register row, as it shipped ────────────────────────────────────────────────'

do $$
declare
  k record;
begin
  select * into k from platform.feature_knob
   where feature = 'data_tables.relation' and key = 'relation_columns_enabled';
  if not found then
    raise exception 'CLAUSE 0 FAILED: data_tables.relation.relation_columns_enabled has no register row';
  end if;
  if k.default_value <> 'false'::jsonb or k.value <> 'false'::jsonb then
    raise exception 'CLAUSE 0 FAILED: the knob does not default to false (value %, default %)', k.value, k.default_value;
  end if;
  if not ('organization' = any (k.overridable_by)) then
    raise exception 'CLAUSE 0 FAILED: the knob is not overridable at the organization rung (%)', k.overridable_by;
  end if;
  if k.archived_at is not null then
    raise exception 'CLAUSE 0 FAILED: the knob is archived, so no reader can resolve it';
  end if;
  raise notice 'CLAUSE 0 PASS — the knob exists, defaults false, and organizations may override it';
end $$;

\echo ''
\echo '── 1-5 · admin''s Workspace turns it on; Ashford Labs never hears about it ─────────────'

begin;

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_a constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin's Workspace (owner)
  v_b constant uuid := 'c19a81b7-f65f-4c01-b04c-00f97f8b7e4d';  -- Ashford Labs      (owner)
  v_res jsonb;
  v_a_on boolean;
  v_b_on boolean;
  v_knob jsonb;
begin
  perform set_config('app.actor_system', 'campaign-test/udtrelknob_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ 1 — NO OVERRIDE: BOTH OFF ════════════════════════════════════════════════════════
  delete from platform.knob_override
   where feature = 'data_tables.relation' and key = 'relation_columns_enabled';

  -- The address is `data_tables.relation` / `relation_columns_enabled`, and a knob asked for at
  -- any other address RAISES rather than answering false — which is the knob system refusing to
  -- guess, and is why a reader that mistypes an address fails loudly instead of silently
  -- behaving as if the feature were off.
  begin
    perform platform.knob_resolve('data_tables', 'relation.relation_columns_enabled', v_a);
    raise exception '1 FAILED: the wrong address answered instead of raising';
  exception when sqlstate 'P0001' then null;
  end;

  v_a_on := coalesce((platform.knob_resolve('data_tables.relation', 'relation_columns_enabled', v_a) #>> '{}')::boolean, false);
  v_b_on := coalesce((platform.knob_resolve('data_tables.relation', 'relation_columns_enabled', v_b) #>> '{}')::boolean, false);
  if v_a_on or v_b_on then
    raise exception '1 FAILED: with no override at all, A=% B=% — the default is supposed to be off for everybody', v_a_on, v_b_on;
  end if;
  raise notice '1 PASS — with no override, both organizations resolve false';

  -- ══ 2 — THE OVERRIDE, THROUGH THE DOOR ═══════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  v_res := platform.knob_override_set(
    'data_tables.relation', 'relation_columns_enabled',
    'organization', v_a, v_a, 'true'::jsonb,
    'OLD-TABLES-2 W4 green suite — rolled back');
  perform set_config('role', 'postgres', true);
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception '2 FAILED: the door refused the override: %', v_res;
  end if;

  v_a_on := coalesce((platform.knob_resolve('data_tables.relation', 'relation_columns_enabled', v_a) #>> '{}')::boolean, false);
  if not v_a_on then
    raise exception '2 FAILED: the override was written and A still resolves false';
  end if;
  raise notice '2 PASS — the door accepted an owner''s override and admin''s Workspace now resolves true';

  -- ══ 3 — THE SECOND ORGANIZATION IS UNTOUCHED ═════════════════════════════════════════
  v_b_on := coalesce((platform.knob_resolve('data_tables.relation', 'relation_columns_enabled', v_b) #>> '{}')::boolean, false);
  if v_b_on then
    raise exception '3 FAILED: turning it on for admin''s Workspace turned it on for Ashford Labs too';
  end if;
  if (select count(*) from platform.knob_override
       where feature = 'data_tables.relation' and key = 'relation_columns_enabled') <> 1 then
    raise exception '3 FAILED: one organization''s decision wrote more than one override row';
  end if;
  raise notice '3 PASS — Ashford Labs still resolves false, and exactly ONE override row exists';

  -- ══ 4 — REMOVING IT ══════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  v_res := platform.knob_override_set(
    'data_tables.relation', 'relation_columns_enabled',
    'organization', v_a, v_a, null,
    'OLD-TABLES-2 W4 green suite — removal, rolled back');
  perform set_config('role', 'postgres', true);
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception '4 FAILED: the door refused the removal: %', v_res;
  end if;
  v_a_on := coalesce((platform.knob_resolve('data_tables.relation', 'relation_columns_enabled', v_a) #>> '{}')::boolean, false);
  if v_a_on then
    raise exception '4 FAILED: the override was removed and A still resolves true';
  end if;
  raise notice '4 PASS — removing the override returns that organization to the platform default';

  -- ══ 5 — THE PLATFORM DEFAULT NEVER MOVED ═════════════════════════════════════════════
  select to_jsonb(f) into v_knob from platform.feature_knob f
   where f.feature = 'data_tables.relation' and f.key = 'relation_columns_enabled';
  if (v_knob -> 'value') <> 'false'::jsonb or (v_knob -> 'default_value') <> 'false'::jsonb then
    raise exception '5 FAILED: the platform default moved to % — an organization''s decision is not the platform''s',
      v_knob -> 'value';
  end if;
  raise notice '5 PASS — platform.feature_knob still reads false: one organization''s choice was never everybody''s';
end
$t$;

rollback;

\echo ''
\echo '── udtrelknob_green.sql: every clause PASSED and the transaction rolled back ──────────'
