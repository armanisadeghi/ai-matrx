-- LANE CONTEXT-VALUES-NAMED-2 — A SYSTEM ITEM IS READ ONLY WHEN SOMETHING NAMES IT.
--
-- THE USE CASE. An agent that writes ITAD outreach emails names one System item (the company it
-- writes for) and is handed today's date by the platform's default list. The platform's System
-- context will grow to thousands of items, some of which call an API or fetch a page to produce
-- their value. Nothing about an item nobody named may be read or evaluated in the database while
-- that agent's turn is resolved — on either context path.
--
-- WHAT MAKES IT FAIL (RED on the bodies before cvn2_a_system_item_is_read_only_when_it_is_named.sql):
--   N1/N4  a turn that names current_date and company_name is handed every deliverable System item
--   N2/N5  a turn that names nothing is handed every deliverable System item
--   N3/N6  resolving the turn reads every deliverable System row (a sequential scan, or every row
--          fetched by index — measured on the clone: 14 rows for 2 named, 7 rows x 2 System loops)
--   K1     there is no platform knob context/system_item_defaults with the ruled default
--   K2     there is no deliverable System item current_timezone
-- Every check runs; the failures are counted and raised together at the end.
--
-- HOW "NEVER READ" IS PROVEN. pg_stat_xact_user_tables counts, for this transaction, every
-- sequential scan of context.system_context_item and every heap row fetched through an index.
-- Named: seq_scan does not move and the rows fetched are exactly the named rows (once per System
-- loop — the value loop and the dataset loop each ask the gate). Nothing named: nothing moves.
--
-- SEAT: public.resolve_full_context as the server calls it (postgres, the person's id as an
-- argument); custom.resolve_context as `authenticated` with admin@admin.com's claims, as the
-- record store's client calls it.

\set ON_ERROR_STOP on
\timing off
\set suite 'cvn2_a_system_item_is_read_only_when_named_red_green.sql'
\set requires 'function:public.resolve_full_context|function:custom.resolve_context|relation:context.system_context_item'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $t$
declare
  c_admin    constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j  constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_nothing  constant uuid := '00000000-0000-0000-0000-000000000000';
  v_named    text[];
  v_company  uuid;
  v_new_rfc  boolean := to_regprocedure('public.resolve_full_context(uuid, text, uuid, uuid[], text[])') is not null;
  v_new_rc   boolean := to_regprocedure('custom.resolve_context(text, uuid, uuid[], uuid[], text[])') is not null;
  v_out      jsonb;
  v_keys     text[];
  v_seq0     bigint; v_fetch0 bigint; v_seq1 bigint; v_fetch1 bigint;
  v_fail     int := 0;
  v_knob     jsonb;
  v_path     text;
  v_has_tz   boolean;
begin
  select id into v_company from context.system_context_item where key = 'company_name' and deleted_at is null;
  if v_company is null then
    raise exception 'fixture: the System item company_name is not on this database';
  end if;
  -- One key and one id: the list carries both shapes (SystemContextNames.refs()).
  v_named := array['current_date', v_company::text];

  foreach v_path in array array['old', 'new'] loop
    -- ── N1/N4: named → exactly the named, deliverable items ─────────────────────────────────
    if v_path = 'old' then
      perform set_config('role', 'postgres', true);
      select seq_scan, idx_tup_fetch into v_seq0, v_fetch0
        from pg_stat_xact_user_tables where relid = 'context.system_context_item'::regclass;
      if v_new_rfc then
        v_out := public.resolve_full_context(c_admin, 'conversation', c_nothing, null, v_named);
      else
        v_out := public.resolve_full_context(c_admin, 'conversation', c_nothing, null);
      end if;
      select seq_scan, idx_tup_fetch into v_seq1, v_fetch1
        from pg_stat_xact_user_tables where relid = 'context.system_context_item'::regclass;
    else
      perform set_config('request.jwt.claims', c_admin_j, true);
      perform set_config('role', 'authenticated', true);
      if v_new_rc then
        v_out := custom.resolve_context('conversation', c_nothing, null, null, v_named);
      else
        v_out := custom.resolve_context('conversation', c_nothing, null, null);
      end if;
      perform set_config('role', 'postgres', true);
      select seq_scan, idx_tup_fetch into v_seq1, v_fetch1
        from pg_stat_xact_user_tables where relid = 'context.system_context_item'::regclass;
      -- the "before" for the new path is the old path's "after"
      v_seq0 := coalesce(v_seq0, 0); v_fetch0 := coalesce(v_fetch0, 0);
    end if;

    select coalesce(array_agg(k order by k), '{}') into v_keys
      from jsonb_each(coalesce(v_out -> 'variables', '{}')) e(k, v) where v ->> 'source' = 'system';
    if v_keys is distinct from array['company_name', 'current_date'] then
      v_fail := v_fail + 1;
      raise notice '% FAIL — % path: named current_date + company_name, handed %', case v_path when 'old' then 'N1' else 'N4' end, v_path, v_keys;
    else
      raise notice '% PASS — % path: named current_date + company_name, handed exactly those', case v_path when 'old' then 'N1' else 'N4' end, v_path;
    end if;

    -- ── N3/N6: nothing unnamed was read ─────────────────────────────────────────────────────
    if coalesce(v_seq1, 0) - coalesce(v_seq0, 0) <> 0
       or coalesce(v_fetch1, 0) - coalesce(v_fetch0, 0) > 2 * cardinality(v_named) then
      v_fail := v_fail + 1;
      raise notice '% FAIL — % path: context.system_context_item seq_scan +%, rows fetched +% (named %)',
        case v_path when 'old' then 'N3' else 'N6' end, v_path,
        coalesce(v_seq1, 0) - coalesce(v_seq0, 0), coalesce(v_fetch1, 0) - coalesce(v_fetch0, 0), cardinality(v_named);
    else
      raise notice '% PASS — % path: no sequential scan; % rows fetched by index for % named (two System loops)',
        case v_path when 'old' then 'N3' else 'N6' end, v_path, coalesce(v_fetch1, 0) - coalesce(v_fetch0, 0), cardinality(v_named);
    end if;
    v_seq0 := v_seq1; v_fetch0 := v_fetch1;

    -- ── N2/N5: nothing named → nothing handed, nothing read ─────────────────────────────────
    if v_path = 'old' then
      if v_new_rfc then
        v_out := public.resolve_full_context(c_admin, 'conversation', c_nothing, null, '{}'::text[]);
      else
        v_out := public.resolve_full_context(c_admin, 'conversation', c_nothing, null);
      end if;
    else
      perform set_config('role', 'authenticated', true);
      if v_new_rc then
        v_out := custom.resolve_context('conversation', c_nothing, null, null, null);
      else
        v_out := custom.resolve_context('conversation', c_nothing, null, null);
      end if;
      perform set_config('role', 'postgres', true);
    end if;
    select seq_scan, idx_tup_fetch into v_seq1, v_fetch1
      from pg_stat_xact_user_tables where relid = 'context.system_context_item'::regclass;
    select coalesce(array_agg(k order by k), '{}') into v_keys
      from jsonb_each(coalesce(v_out -> 'variables', '{}')) e(k, v) where v ->> 'source' = 'system';
    if cardinality(v_keys) <> 0 or v_seq1 - v_seq0 <> 0 or v_fetch1 - v_fetch0 <> 0 then
      v_fail := v_fail + 1;
      raise notice '% FAIL — % path: named nothing, handed % (seq_scan +%, fetched +%)',
        case v_path when 'old' then 'N2' else 'N5' end, v_path, v_keys, v_seq1 - v_seq0, v_fetch1 - v_fetch0;
    else
      raise notice '% PASS — % path: named nothing, handed nothing, read nothing', case v_path when 'old' then 'N2' else 'N5' end, v_path;
    end if;
    v_seq0 := v_seq1; v_fetch0 := v_fetch1;
  end loop;

  -- ── K1: the default list is a platform knob with the ruled default ─────────────────────────
  select default_value into v_knob from platform.feature_knob
   where feature = 'context' and key = 'system_item_defaults' and archived_at is null;
  if v_knob is distinct from '["current_date", "current_datetime", "current_timezone"]'::jsonb then
    v_fail := v_fail + 1;
    raise notice 'K1 FAIL — platform knob context/system_item_defaults default is %', v_knob;
  else
    raise notice 'K1 PASS — context/system_item_defaults defaults to current_date, current_datetime, current_timezone';
  end if;

  -- ── K2: the person's timezone is a deliverable System item ─────────────────────────────────
  if to_regprocedure('context.named_system_context_items(text[])') is not null then
    execute 'select exists (select 1 from context.named_system_context_items(array[''current_timezone'']))' into v_has_tz;
  end if;
  if not coalesce(v_has_tz, false) then
    v_fail := v_fail + 1;
    raise notice 'K2 FAIL — current_timezone is not a deliverable System item';
  else
    raise notice 'K2 PASS — current_timezone is a deliverable System item';
  end if;

  if v_fail > 0 then
    raise exception 'cvn2_a_system_item_is_read_only_when_named_red_green.sql: % FAILURE(S)', v_fail;
  end if;
  raise notice 'cvn2_a_system_item_is_read_only_when_named_red_green.sql: ALL PASS (N1-N6, K1, K2)';
end
$t$;

rollback;
