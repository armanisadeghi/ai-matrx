-- LANE OLD-TABLES-2 — W4, THE ROLLOUT. THE RED TWIN. Ends in ROLLBACK.
--
-- A guard you cannot show FAILING is not a guard. This file plants the two ways the rollout is
-- most likely to be got wrong and asserts that each one is really, visibly wrong.
--
--   ARM 1 — THE READER ASKS THE PLATFORM DEFAULT INSTEAD OF THE RESOLVER. `platform.feature_knob`
--           is one row for the whole world. A screen that reads it directly — which is what
--           `lib/knobs/featureKnobs` does, and it is correct for a platform-wide value — would
--           tell an organization that just turned the feature ON that it is still off, and its
--           picker would never gain the option. The per-organization answer is
--           `platform.knob_resolve` / `platform.knob_index`, and nothing else.
--
--   ARM 2 — THE RESOLVER IS ASKED WITH THE WRONG ORGANIZATION. Hand it organization A's id while
--           standing in organization B and B is told it has a feature nobody there turned on.
--           This is the shape of every default-organization defect the platform has already been
--           bitten by, and it is why the reader carries the TABLE's organization and never a
--           remembered one.
--
-- 🚨 NEITHER ARM DELETES A `platform.feature_knob` ROW. `knob_resolve` raising on a missing key
-- is a property of the knob system, not of this wave, and mutilating a shared platform default
-- to demonstrate it would break every other reader in the database for the length of the
-- transaction. The plan says so explicitly and this file obeys it.
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/udtrelknob_red.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'udtrelknob_red.sql'
\set requires 'function:platform.knob_override_set|function:platform.knob_resolve|row:platform.feature_knob:feature = \'data_tables.relation\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_a constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin's Workspace
  v_b constant uuid := 'c19a81b7-f65f-4c01-b04c-00f97f8b7e4d';  -- Ashford Labs
  v_res      jsonb;
  v_default  boolean;
  v_resolved boolean;
  v_wrong    boolean;
  v_right    boolean;
  v_knobs    bigint;
begin
  perform set_config('app.actor_system', 'campaign-test/udtrelknob_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  v_knobs := (select count(*) from platform.feature_knob);

  delete from platform.knob_override
   where feature = 'data_tables.relation' and key = 'relation_columns_enabled';

  perform set_config('role', 'authenticated', true);
  v_res := platform.knob_override_set(
    'data_tables.relation', 'relation_columns_enabled',
    'organization', v_a, v_a, 'true'::jsonb,
    'OLD-TABLES-2 W4 red twin — rolled back');
  perform set_config('role', 'postgres', true);
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'SETUP FAILED: the door refused the override the twin needs: %', v_res;
  end if;

  -- ══ ARM 1 — THE PLATFORM DEFAULT IS NOT THE ANSWER ═══════════════════════════════════
  select coalesce((coalesce(f.value, f.default_value) #>> '{}')::boolean, false)
    into v_default
    from platform.feature_knob f
   where f.feature = 'data_tables.relation' and f.key = 'relation_columns_enabled';
  v_resolved := coalesce((platform.knob_resolve('data_tables.relation', 'relation_columns_enabled', v_a) #>> '{}')::boolean, false);

  if v_default = v_resolved then
    raise exception
      'ARM 1 DID NOT GO RED: the platform default and the resolver agree (both %), so this plant proves nothing. Either the override did not land or the resolver is not reading it.',
      v_default;
  end if;
  raise notice 'ARM 1 RED — the platform default says % while admin''s Workspace actually resolves %. A screen reading platform.feature_knob directly would never show this organization the option it turned on.',
    v_default, v_resolved;

  -- ══ ARM 2 — THE WRONG ORGANIZATION ═══════════════════════════════════════════════════
  v_right := coalesce((platform.knob_resolve('data_tables.relation', 'relation_columns_enabled', v_b) #>> '{}')::boolean, false);
  v_wrong := coalesce((platform.knob_resolve('data_tables.relation', 'relation_columns_enabled', v_a) #>> '{}')::boolean, false);

  if v_right then
    raise exception
      'ARM 2 IS A LEAK, NOT A TWIN: Ashford Labs resolved TRUE from an override written for admin''s Workspace. One organization''s decision became another''s.';
  end if;
  if not v_wrong then
    raise exception 'ARM 2 DID NOT GO RED: handing the reader the other organization''s id changed nothing, so the plant proves nothing.';
  end if;
  raise notice 'ARM 2 RED — standing in Ashford Labs the honest answer is %, and the same read handed admin''s Workspace''s id answers %. A reader that carries a remembered organization instead of the table''s own would show a feature nobody there turned on.',
    v_right, v_wrong;

  -- ══ AND THE SHARED DEFAULT IS UNHARMED ═══════════════════════════════════════════════
  if (select count(*) from platform.feature_knob) <> v_knobs then
    raise exception 'THIS TWIN DAMAGED THE KNOB REGISTER: % rows before, % after. It is forbidden to delete a feature_knob row to make a point.',
      v_knobs, (select count(*) from platform.feature_knob);
  end if;
  raise notice 'the knob register is untouched — % rows before and after; no platform default was mutilated', v_knobs;
end
$t$;

rollback;

\echo ''
\echo '── udtrelknob_red.sql: both arms went RED and nothing outside this transaction moved ──'
