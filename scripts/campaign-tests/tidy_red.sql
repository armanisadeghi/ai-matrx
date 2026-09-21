-- scripts/campaign-tests/tidy_red.sql — LANE TIDY's RED TWIN.
--
-- A suite that only ever goes green proves nothing. This file asserts that each of the
-- lane's four claims FAILS when the thing it rests on is taken away, and it does it inside
-- ONE transaction that ends in ROLLBACK, so the main database is untouched.
--
-- It also executes the three inverse migrations' bodies. An inverse nobody has ever run is
-- a promise, not a rollback: running them here is what proves they are valid SQL against
-- the database as it stands today.
--
-- ── THE SEAT, added by lane TAILS 2026-09-21 ───────────────────────────────────────────
-- This file was one of the two `pnpm check:suites-take-the-seat` offenders: it called
-- schema `custom` from the role that OWNS `custom.record`, where every wall opens on its
-- first line. Every clause below that goes through a door a signed-in person can reach now
-- runs as `authenticated` (RED 2's write, RED 3's two writes, RED 5 entire), and hands the
-- seat back with `set_config('role','none', true)` only for the parts no person may ever
-- perform: the retention resolver, the prune job and the inverse migrations' DDL.
--
-- AND THAT DIVISION IS MEASURED, NOT CLAIMED. Each owner-side block first asserts that the
-- function it is about to call holds NO EXECUTE for `authenticated`. The day somebody opens
-- one of them to clients, this suite goes red and says so, instead of quietly continuing to
-- prove nothing — which is the exact failure the seat guard exists to stop.
--
-- Run: <scratchpad>/tidy/p.sh -f scripts/campaign-tests/tidy_red.sql

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '120s';
set local statement_timeout = '600s';

do $red$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org   uuid := gen_random_uuid();
  v_red   integer := 0;
  v_n     integer;
  v_out   jsonb;
  v_msg   text;

  -- The three bodies this suite calls that are NOT client doors. Each is asked of the
  -- catalogue before it is called, so "it runs as the owner because no seat exists for it"
  -- is a measured fact rather than a sentence in a comment.
  c_owner_only constant text[] := array[
    'custom.provenance_retention_days(uuid)',
    'custom.provenance_prune(uuid,boolean,integer)',
    'custom.freshness_verdict(timestamptz,numeric)'
  ];
  v_fn    text;
begin
  perform set_config('app.actor_system', 'campaign-test/tidy_red.sql', true);
  perform set_config('request.jwt.claims',
    '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  foreach v_fn in array c_owner_only loop
    if has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE') then
      raise exception 'THE SEAT MOVED: % is now callable by a signed-in person, so the clause that calls it here must be run from the seat and no longer from the owner', v_fn;
    end if;
  end loop;
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'TIDY red twin', 'tidy-red-' || replace(v_org::text,'-',''), 'TRD', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  -- ── RED 1 — THE RETENTION KNOB CANNOT BE SET BELOW THE STORE'S HISTORY FLOOR ───────────
  -- The whole argument for the default is that an explanation must outlive nothing the
  -- value's own history outlives. If an organization could set five days, the argument is
  -- decoration. The knob is `raise_only` with min 30, and the resolver takes the GREATER of
  -- the knob and `history.retention_floor_days`, so BOTH have to fail for this to pass.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','provenance_retention_days','organization', v_org, v_org, '5');
  if custom.provenance_retention_days(v_org) < history.retention_floor_days(v_org) then
    raise exception 'RED 1 DID NOT GO RED: an organization set provenance retention to 5 days and it took, below the % day history floor',
      history.retention_floor_days(v_org);
  end if;
  v_red := v_red + 1;
  raise notice 'RED 1 — a 5-day override resolves to % days, floored by history. The floor is not decoration.',
    custom.provenance_retention_days(v_org);
  delete from platform.knob_override
   where organization_id = v_org and feature='custom' and key='provenance_retention_days';

  -- ── RED 2 — THE PRUNE REFUSES TO TAKE THE LAST ROW OF AN ITEM ──────────────────────────
  -- One merge field, one resolution, four hundred days old — far past any retention. If the
  -- prune takes it, DYN-24 can no longer answer "what did it resolve to last", which is the
  -- entire reason the log exists.
  -- THE WRITE IS A CLIENT DOOR, so it is made from the seat a signed-in person has.
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 2 did not take the seat — current_user is %', current_user;
  end if;
  perform custom.provenance_write(v_org, null, 'red-2',
    jsonb_build_array(jsonb_build_object(
      'merge_field_key','only_ever_resolved_once','declared_source','record','outcome','resolved',
      'freshness','live','tier','direct','rendered','the one answer','candidates','[]'::jsonb,
      'resolved_at',(now() - interval '400 days')::text)));
  perform set_config('role','none', true);   -- the prune is the retention JOB, not a door
  v_out := custom.provenance_prune(v_org, false, 1000);
  select count(*) into v_n from custom.merge_field_provenance where organization_id = v_org;
  if v_n <> 1 then
    raise exception 'RED 2 DID NOT GO RED: the only row an item ever had was pruned at 400 days (% left, prune said %)', v_n, v_out;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 2 — a 400-day-old row survives because it is the last one its item has';

  -- ── RED 3 — A STORE THAT IS CLOSED IS NOT PRUNED ───────────────────────────────────────
  -- Retention must never be a back door that empties a log for an organization that has not
  -- even switched the store on.
  -- The two rows are written FIRST, from the seat, while the store is still open — a
  -- signed-in person cannot write through `custom.provenance_write` into a closed store,
  -- and faking those rows from the owner would be the very shortcut this file stopped
  -- taking. Then the store is closed and the prune is asked to consider it.
  perform set_config('role','authenticated', true);
  perform custom.provenance_write(v_org, null, 'red-3',
    jsonb_build_array(
      jsonb_build_object('merge_field_key','only_ever_resolved_once','declared_source','record','outcome','resolved','freshness','live','tier','direct','rendered','older','candidates','[]'::jsonb,'resolved_at',(now() - interval '500 days')::text),
      jsonb_build_object('merge_field_key','only_ever_resolved_once','declared_source','record','outcome','resolved','freshness','live','tier','direct','rendered','newer','candidates','[]'::jsonb,'resolved_at',(now() - interval '300 days')::text)));
  perform set_config('role','none', true);
  update platform.knob_override set value = 'false'
   where organization_id = v_org and feature='custom' and key='system_enabled';
  v_out := custom.provenance_prune(v_org, false, 1000);
  if (v_out ->> 'rows_pruned')::int <> 0 or (v_out ->> 'organizations_considered')::int <> 0 then
    raise exception 'RED 3 DID NOT GO RED: an organization with its store switched OFF was pruned — %', v_out;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 3 — a closed store is not pruned (organizations considered: %)', v_out ->> 'organizations_considered';
  update platform.knob_override set value = 'true'
   where organization_id = v_org and feature='custom' and key='system_enabled';

  -- ── RED 4 — THE ONE FRESHNESS CEILING IS THE ONLY ONE ──────────────────────────────────
  -- `custom.enrich_due` used to derive its own age and write its own sentence. If the door's
  -- body stops asking `custom.freshness_verdict`, that copy is back, and this goes red.
  if pg_get_functiondef('custom.enrich_due(uuid,uuid,integer,boolean)'::regprocedure)
       not like '%freshness_verdict%' then
    raise exception 'RED 4 DID NOT GO RED: custom.enrich_due no longer asks custom.freshness_verdict — the third copy is back';
  end if;
  if pg_get_functiondef('custom.context_resolve(uuid,jsonb,text)'::regprocedure)
       not like '%freshness_verdict%' then
    raise exception 'RED 4 DID NOT GO RED: custom.context_resolve no longer asks custom.freshness_verdict';
  end if;
  -- And the rule itself still says what it must: delivered, not dropped, with its age.
  v_msg := custom.freshness_verdict(now() - interval '400 days', 90 * 86400) ->> 'stale_note';
  if v_msg not like '%delivered anyway and marked stale rather than dropped' then
    raise exception 'RED 4 DID NOT GO RED: a stale value no longer says it is still delivered — %', v_msg;
  end if;
  if (custom.freshness_verdict(null, 90 * 86400) ->> 'stale_note') is null then
    raise exception 'RED 4 DID NOT GO RED: a value with NO write time passes as current, which is the silent failure the rule exists to stop';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 4 — both doors ask the one function, and an unknown age is named rather than passed off as fresh';

  -- ── RED 5 — THE FLUSH'S DOOR REFUSES WHAT IT MUST ──────────────────────────────────────
  -- BOTH refusals are a signed-in person's refusals, so both are asked from the seat.
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED 5 did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform custom.provenance_write(null, null, 't', '[]'::jsonb);
    raise exception 'RED 5 DID NOT GO RED: custom.provenance_write accepted a NULL organization, so a provenance row could choose its own tenancy';
  exception when sqlstate '22004' then null;
  end;
  begin
    perform custom.provenance_write(v_org, null, 't', '{"not":"an array"}'::jsonb);
    raise exception 'RED 5 DID NOT GO RED: custom.provenance_write accepted a non-array payload';
  exception when sqlstate '22023' then null;
  end;
  v_red := v_red + 1;
  raise notice 'RED 5 — the write door refuses a NULL organization and a non-array payload, by name';
  -- Hand the seat back: the inverse migrations below are DDL, which no signed-in person
  -- may run, and a seat left held would make them fail for the wrong reason.
  perform set_config('role','none', true);

  if v_red <> 5 then
    raise exception 'only % of 5 blocks are RED', v_red;
  end if;
  raise notice '% of 5 blocks are RED', v_red;
end;
$red$;

-- ══ THE INVERSES, EXECUTED ════════════════════════════════════════════════════════════
-- Each forward file's inverse body runs here against the live catalog. They are executed
-- rather than read because an inverse nobody has run is a promise. The whole file rolls
-- back, so the database keeps the forward state.
\i migrations/inverse/tidy_the_provenance_flush_rides_the_turns_session_down.sql
\i migrations/inverse/tidy_the_enrich_panel_asks_the_one_ceiling_down.sql
\i migrations/inverse/tidy_one_freshness_ceiling_down.sql
\i migrations/inverse/tidy_the_provenance_log_is_kept_not_hoarded_down.sql

do $after$
begin
  -- WITH THE INVERSES APPLIED, THE LANE'S WORK IS GONE — which is what an inverse means.
  if to_regprocedure('custom.freshness_verdict(timestamptz,numeric)') is not null then
    raise exception 'ROLLBACK NOT VERIFIED: custom.freshness_verdict survived its own inverse';
  end if;
  if to_regprocedure('custom.provenance_prune(uuid,boolean,integer)') is not null then
    raise exception 'ROLLBACK NOT VERIFIED: custom.provenance_prune survived its own inverse';
  end if;
  if pg_get_functiondef('public.prune_high_volume_logs()'::regprocedure) like '%provenance%' then
    raise exception 'ROLLBACK NOT VERIFIED: the retention job still prunes the provenance log';
  end if;
  if pg_get_functiondef('custom.enrich_due(uuid,uuid,integer,boolean)'::regprocedure) like '%freshness_verdict%' then
    raise exception 'ROLLBACK NOT VERIFIED: custom.enrich_due still asks a function that no longer exists';
  end if;
  raise notice 'ROLLBACK VERIFIED — all four inverses are valid SQL and undo exactly what they claim';
end;
$after$;

rollback;
