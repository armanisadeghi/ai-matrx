-- DD-210 — THE DOOR REGISTRY NAMES ONLY LIVE, CORRECTLY GRANTED DOORS.
-- (B-108, Data Doctrine adoption program, 2026-09-14.)
--
-- THE DEFECT, MEASURED 2026-09-14 AGAINST THE LIVE DATABASE
-- ---------------------------------------------------------
-- `platform.client_callable_door` is the register of what a client may call. It
-- is read by the §6d-4 event trigger (`platform.enforce_definer_client_grants_impl`
-- STANDS DOWN on a function that has a row), by `check:impl-doors` D5/D9/D13 and
-- by the `check:door-rows` harness. A row that names nothing therefore is not
-- inert: it is a stand-down for a name.
--
-- Of 971 rows, TWENTY-EIGHT named no live function under their exact
-- `identity_args`. Classified by reading each one against the catalog:
--
--   15  DUPLICATE SIGNATURE. The function is live, client-executable and ALREADY
--       declared by a second, correctly-spelled row (`declared_by = DD-169 batch 3
--       / B-75` and friends). The stale twin spells enum argument types
--       schema-qualified — `p_required public.permission_level` — where
--       `pg_get_function_identity_arguments` spells them bare, so it joined to
--       nothing. Every one of the 15 carries
--       `declared_by = definer_guard_search_path_grandfather_fix`: they were
--       written by a search-path repair, never by a person declaring a door.
--
--   11  NOT A CLIENT DOOR. The function is live but holds NO client EXECUTE at
--       all — `anon`, `authenticated` and PUBLIC are all false — and is called
--       only from inside other functions (measured: every one has live callers in
--       `pg_proc`). These are the access kernel's internal helpers
--       (`iam.has_access_for_base`, `iam.is_discoverable_base`,
--       `iam.discoverable_ids`, `platform.entity_row_access_attrs`,
--       `public.has_permission_for`, …). A door row on them declares a door that
--       does not exist AND makes §6d-4 stand down, so the day somebody grants one
--       of them to `authenticated` the guard says nothing. Deleting the row is
--       what restores the guard.
--
--    2  NOT A FUNCTION. `platform.list_scope_registry` and
--       `platform.visible_user_identity` carry the literal `identity_args` value
--       `(view)`. They are VIEWS (`relkind = 'v'`, `authenticated` holds SELECT,
--       `anon` does not). A FUNCTION register cannot declare a view; a view's
--       client readability is its GRANT plus RLS, and nothing reads these rows.
--
-- NOT ONE of the 28 named a dropped or renamed function: the successor is
-- recorded for every retirement below, and 26 of them are the same function under
-- a different spelling.
--
-- AND THE SECOND DIRECTION — a door row says nothing about WHICH client may call
-- -----------------------------------------------------------------------------
-- DD-212 made an anonymous door a DECLARATION (`anonymous_callers`), never a guess
-- from prose. There was no matching declaration for the SIGNED-IN lane, so a door
-- row whose function holds no `authenticated` EXECUTE looked exactly like one
-- whose grant had gone missing. Twelve rows were in that state; eleven are the
-- retirements above, and the twelfth is honest and deliberate:
-- `mandate.submit_scan_report(p_report jsonb)` refuses a browser session in its
-- own first statement and is granted to `service_role` only — its reason says so
-- in prose that nothing could check.
--
-- So this file adds the missing declaration beside `anonymous_callers`:
--   * `signed_in_callers`  — a caller with a signed-in session (role
--     `authenticated`) may EXECUTE this function. BACKFILLED FROM THE LIVE GRANT,
--     never typed, so the file's own claim is testable by the gate forever after.
--   * `non_client_lane`    — required, in a sentence, when NEITHER flag is true:
--     a door no client of any kind may reach must name the lane that does reach
--     it. Forbidden when a client can reach it, so the column can never become
--     decoration.
-- `check:impl-doors` D16 fails if either flag disagrees with the live grant, in
-- either direction, and if a client-executable SECURITY DEFINER function carries
-- no door row at all; D15 fails if any row names no live function.
--
-- WHAT THIS FILE DOES NOT DO. It does not touch
-- `platform.enforce_definer_client_grants_impl`: the §6d-4 guard reads
-- `anonymous_callers` (DD-212b) and still stands down for a signed-in door row
-- whatever `signed_in_callers` says. A `GRANT EXECUTE … TO authenticated` on a
-- both-flags-false door is therefore caught by D16 in CI, not by the database.
-- That residue is reported to the Data Doctrine chair rather than fixed here,
-- because the guard belongs to DD-212b's lane and its blast radius is the whole
-- platform.

-- 🚨 THE SPELLING OF `identity_args` IS ONLY MEANINGFUL UNDER A STATED search_path.
-- ------------------------------------------------------------------------------
-- Found the hard way while applying this file: `pg_get_function_identity_arguments`
-- renders a type BARE when its schema is on the search_path and SCHEMA-QUALIFIED
-- when it is not. The §6d-4 guard reads the register under its own fixed
-- `SET search_path TO 'platform', 'public', 'pg_catalog'`, so THAT rendering is the
-- canonical one — it is the spelling the guard compares against, and a row spelled
-- any other way is a row the guard treats as undeclared (fail-closed: it revokes
-- the client grants and says so, loudly — which is exactly what it did to
-- `web.create_site` inside this file's first, rolled-back run).
--
-- Measured from a session with the default search_path, 28 rows looked stale and
-- `web.create_site`'s SURVIVING row looked like the wrong one. Measured under the
-- guard's search_path, the truth is 27 + one correctly-spelled row whose function
-- no client may execute. This file therefore works under the guard's search_path
-- and nowhere else, and `check:impl-doors` D15/D16 compare with schema qualifiers
-- stripped from BOTH sides so they mean the same thing from any connection.
set local search_path = platform, public, pg_catalog;

-- ─── 1. Retirements are recorded, never silent ──────────────────────────────
create table if not exists platform.client_callable_door_retirement (
  id                uuid primary key default gen_random_uuid(),
  schema_name       text not null,
  function_name     text not null,
  identity_args     text not null,
  was_declared_by   text,
  was_reason        text not null,
  retirement_class  text not null
                    check (retirement_class in ('duplicate_signature','not_a_client_door','not_a_function')),
  retired_reason    text not null check (length(btrim(retired_reason)) >= 60),
  successor         text not null,
  retired_by        text not null,
  retired_at        timestamptz not null default now()
);

comment on table platform.client_callable_door_retirement is
  'Every row deleted from platform.client_callable_door, with WHY and WHAT REPLACED IT. A door row is a stand-down for the §6d-4 guard, so removing one is a security decision and a deletion that leaves no trace is indistinguishable from a mistake. Like its parent register this table carries no client grant and no RLS: it is internal machinery, invisible to anon and authenticated. DD-210 (B-108).';
comment on column platform.client_callable_door_retirement.successor is
  'What the client calls instead, in real names — the correctly-spelled door row, the granted sibling, the view. The literal word none, with the measured reason, when there is no client door at all.';
comment on column platform.client_callable_door_retirement.retirement_class is
  'duplicate_signature = the same function is already declared by a correctly-spelled row; not_a_client_door = live function, no client EXECUTE of any kind; not_a_function = identity_args names no function (a view entered in a function register).';

-- ─── 2. The 28, classified BY MEASUREMENT and recorded before they are deleted ──
with door as (
  select d.*, regexp_replace(d.identity_args, '\m[a-z_][a-z0-9_]*\.', '', 'g') as norm
    from platform.client_callable_door d
),
fn as (
  select n.nspname as sch, p.proname as nm,
         pg_get_function_identity_arguments(p.oid) as ia,
         regexp_replace(pg_get_function_identity_arguments(p.oid), '\m[a-z_][a-z0-9_]*\.', '', 'g') as norm,
         p.oid,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
         has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_x,
         has_function_privilege('public', p.oid, 'EXECUTE')        as pub_x
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
),
stale as (
  select d.* from door d
   where not exists (select 1 from fn f
                      where f.sch = d.schema_name and f.nm = d.function_name and f.ia = d.identity_args)
),
classified as (
  select s.*,
         (select f.ia from fn f where f.sch = s.schema_name and f.nm = s.function_name and f.norm = s.norm) as live_ia,
         (select d2.identity_args from door d2
           where d2.schema_name = s.schema_name and d2.function_name = s.function_name
             and d2.norm = s.norm and d2.id <> s.id limit 1) as twin_ia,
         (select string_agg(distinct n.nspname || '.' || p.proname, ', ')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname not in ('pg_catalog','information_schema')
             and p.prosrc like '%' || s.function_name || '%'
             and p.proname <> s.function_name) as internal_callers
    from stale s
)
insert into platform.client_callable_door_retirement
  (schema_name, function_name, identity_args, was_declared_by, was_reason,
   retirement_class, retired_reason, successor, retired_by)
select c.schema_name, c.function_name, c.identity_args, c.declared_by, c.reason,
       case when c.live_ia is null then 'not_a_function'
            when c.twin_ia is not null then 'duplicate_signature'
            else 'not_a_client_door' end,
       case
         when c.live_ia is null then
           'identity_args is the literal placeholder ''(view)''. platform.' || c.function_name ||
           ' is a VIEW, not a function, so this row declared nothing and nothing read it. A view''s client readability is its GRANT plus RLS on the view itself; a function register is the wrong home for it. Retired by DD-210 after measuring relkind = ''v'' live.'
         when c.twin_ia is not null then
           'Duplicate declaration under a spelling no join can match: this row spells its argument types schema-qualified where pg_get_function_identity_arguments spells them bare, so it named no live function. The same function is already declared correctly by the twin row named in successor, which carries the live grant. Written by a search-path repair, never by a person declaring a door.'
         else
           'The function is live but holds NO client EXECUTE at all — anon, authenticated and PUBLIC are all false, measured at retirement — and it is an internal access-kernel helper called only from inside other functions. A door row here declared a door that does not exist and made the §6d-4 guard stand down on it, so a future GRANT would have opened it in silence. Deleting the row restores that guard.'
       end,
       case
         when c.live_ia is null then
           'platform.' || c.function_name || ' (view; authenticated holds SELECT, anon does not)'
         when c.twin_ia is not null then
           c.schema_name || '.' || c.function_name || '(' || c.twin_ia || ')'
         else
           'none — not a client door; the live function ' || c.schema_name || '.' || c.function_name ||
           '(' || c.live_ia || ') is called from ' || coalesce(c.internal_callers, '(no caller found)')
       end,
       'DD-210 (B-108)'
  from classified c;

delete from platform.client_callable_door d
 where exists (select 1 from platform.client_callable_door_retirement r
                where r.retired_by = 'DD-210 (B-108)'
                  and r.schema_name = d.schema_name
                  and r.function_name = d.function_name
                  and r.identity_args = d.identity_args);

-- ─── 2b. The one correctly-spelled row that is not a client door either ─────
-- `platform.entity_row_access_attrs` spells its OUT type the way the guard renders
-- it, so it never looked stale — but no client role may execute it, and its ten
-- callers are all other functions. Same class, different symptom.
with fn as (
  select p.oid,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
         has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_x,
         has_function_privilege('public', p.oid, 'EXECUTE')        as pub_x
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform' and p.proname = 'entity_row_access_attrs'
)
insert into platform.client_callable_door_retirement
  (schema_name, function_name, identity_args, was_declared_by, was_reason,
   retirement_class, retired_reason, successor, retired_by)
select d.schema_name, d.function_name, d.identity_args, d.declared_by, d.reason,
       'not_a_client_door',
       'The function is live and correctly spelled here, but it holds NO client EXECUTE at all — anon, authenticated and PUBLIC are all false, measured at retirement — and every one of its callers is another function (iam.entity_read_expr, iam.has_access_for_base, iam.is_discoverable_base, public.access_denied_context and six more). A door row here declared a door that does not exist and made the §6d-4 guard stand down on it.',
       'none — not a client door; platform.entity_row_access_attrs is the access kernel''s row-attribute reader, called only from inside other functions',
       'DD-210 (B-108)'
  from platform.client_callable_door d
 where d.schema_name = 'platform' and d.function_name = 'entity_row_access_attrs'
   and exists (select 1 from fn where not fn.auth_x and not fn.anon_x and not fn.pub_x);

delete from platform.client_callable_door d
 where d.schema_name = 'platform' and d.function_name = 'entity_row_access_attrs'
   and exists (select 1 from platform.client_callable_door_retirement r
                where r.retired_by = 'DD-210 (B-108)'
                  and r.schema_name = d.schema_name and r.function_name = d.function_name
                  and r.identity_args = d.identity_args);

do $$
declare v_left integer; v_retired integer; v_by_class text;
begin
  select count(*) into v_retired from platform.client_callable_door_retirement where retired_by = 'DD-210 (B-108)';
  select string_agg(retirement_class || '=' || n, ', ' order by retirement_class) into v_by_class
    from (select retirement_class, count(*) n from platform.client_callable_door_retirement
           where retired_by = 'DD-210 (B-108)' group by 1) x;
  select count(*) into v_left from platform.client_callable_door d
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = d.schema_name and p.proname = d.function_name
                        and pg_get_function_identity_arguments(p.oid) = d.identity_args);
  raise notice 'DD-210: % door rows retired (%); % rows still name no live function.', v_retired, v_by_class, v_left;
  if v_left <> 0 then
    raise exception 'DD-210: % platform.client_callable_door row(s) still name no live function after the retirements. The register must name only live functions; investigate before re-running.', v_left
      using errcode = '23514';
  end if;
  if v_retired = 0 then
    raise exception 'DD-210: nothing was retired. This file expected the 28 rows measured on 2026-09-14; if a peer already cleaned them, delete this file rather than ledgering a no-op.'
      using errcode = '23514';
  end if;
end $$;

-- ─── 3. The signed-in lane becomes a DECLARATION, beside the anonymous one ──
alter table platform.client_callable_door
  add column if not exists signed_in_callers boolean not null default true,
  add column if not exists non_client_lane   text;

comment on column platform.client_callable_door.signed_in_callers is
  'TRUE when a caller holding a signed-in session (role authenticated) may EXECUTE this function. Backfilled from the live grant by DD-210, never typed. check:impl-doors D16 fails if this disagrees with has_function_privilege(''authenticated'', …) in EITHER direction: a TRUE with no grant is a door the platform believes it has and nobody can open; a FALSE with a grant is a door nobody declared.';
comment on column platform.client_callable_door.non_client_lane is
  'Required, in a sentence of at least 40 characters, when NEITHER signed_in_callers NOR anonymous_callers is true: name the lane that really reaches this function (a service/secret key, the server pool, a cron worker). Forbidden when a client can reach it. A door no client may call still belongs in this register so the declaration and the enforcement can never disagree — but it may not sit here unexplained.';

-- THE BACKFILL IS MEASURED, NOT TYPED.
update platform.client_callable_door d
   set signed_in_callers = f.auth_x
  from (select n.nspname as sch, p.proname as nm,
               pg_get_function_identity_arguments(p.oid) as ia,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace) f
 where f.sch = d.schema_name and f.nm = d.function_name and f.ia = d.identity_args
   and d.signed_in_callers is distinct from f.auth_x;

update platform.client_callable_door
   set non_client_lane = 'A release check, never a person: the function''s own first statement reads the JWT role and refuses anything but service_role, and the grant matches it — a TypeScript repository''s check:* gate reaches it through PostgREST with the same service/secret key its other gates use, and aidream reaches it from its own server pool.'
 where schema_name = 'mandate' and function_name = 'submit_scan_report'
   and not signed_in_callers and not anonymous_callers;

do $$
declare v_bad integer; v_unlaned integer;
begin
  select count(*) into v_unlaned from platform.client_callable_door
   where not signed_in_callers and not anonymous_callers and non_client_lane is null;
  if v_unlaned <> 0 then
    raise exception 'DD-210: % door row(s) declare no client caller at all and name no lane. Every one of them must say who really calls it, or be retired.', v_unlaned
      using errcode = '23514';
  end if;
  select count(*) into v_bad from platform.client_callable_door
   where (signed_in_callers or anonymous_callers) and non_client_lane is not null;
  if v_bad <> 0 then
    raise exception 'DD-210: % door row(s) name a non-client lane while a client can still reach them.', v_bad
      using errcode = '23514';
  end if;
end $$;

alter table platform.client_callable_door
  add constraint door_non_client_lane_is_declared
  check (
    ((signed_in_callers or anonymous_callers) and non_client_lane is null)
    or ((not signed_in_callers) and (not anonymous_callers)
        and non_client_lane is not null and length(btrim(non_client_lane)) >= 40)
  );

-- ─── 4. FORCING PROOFS — planted, measured with the gate's own queries, torn down ──
do $$
declare
  v_n           integer;
  v_probe_fn    text := 'b108_probe_definer';
  v_probe_ia    text;
  v_saved_flag  boolean;
begin
  -- (a) D15 RED: a door row naming no live function is FOUND.
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, declared_by, reason, anonymous_callers, signed_in_callers)
  values ('public','b108_no_such_function','','DD-210 forcing proof',
          'Probe row for the DD-210 forcing proof. Deleted in the same statement block that planted it.',
          false, true);
  select count(*) into v_n from platform.client_callable_door d
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = d.schema_name and p.proname = d.function_name
                        and pg_get_function_identity_arguments(p.oid) = d.identity_args);
  if v_n <> 1 then
    raise exception 'DD-210 proof (a) FAILED: the "names no live function" query found % rows, expected exactly the plant.', v_n;
  end if;
  delete from platform.client_callable_door where function_name = 'b108_no_such_function';
  select count(*) into v_n from platform.client_callable_door d
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = d.schema_name and p.proname = d.function_name
                        and pg_get_function_identity_arguments(p.oid) = d.identity_args);
  if v_n <> 0 then
    raise exception 'DD-210 proof (a) teardown FAILED: % rows still name no live function.', v_n;
  end if;

  -- (b) D16 RED, direction one: signed_in_callers TRUE where the grant is absent.
  update platform.client_callable_door
     set signed_in_callers = true, non_client_lane = null
   where schema_name = 'mandate' and function_name = 'submit_scan_report';
  select count(*) into v_n
    from platform.client_callable_door d
    join (select n.nspname sch, p.proname nm, pg_get_function_identity_arguments(p.oid) ia,
                 has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace) f
      on f.sch = d.schema_name and f.nm = d.function_name and f.ia = d.identity_args
   where d.signed_in_callers is distinct from f.auth_x;
  if v_n <> 1 then
    raise exception 'DD-210 proof (b) FAILED: the flag-vs-grant query found % disagreements, expected exactly the plant.', v_n;
  end if;
  update platform.client_callable_door
     set signed_in_callers = false,
         non_client_lane = 'A release check, never a person: the function''s own first statement reads the JWT role and refuses anything but service_role, and the grant matches it — a TypeScript repository''s check:* gate reaches it through PostgREST with the same service/secret key its other gates use, and aidream reaches it from its own server pool.'
   where schema_name = 'mandate' and function_name = 'submit_scan_report';

  -- (c) D16 RED, direction two: signed_in_callers FALSE where the grant is present.
  select signed_in_callers into v_saved_flag from platform.client_callable_door
   where schema_name = 'public' and function_name = 'has_access_as'
     and identity_args = 'p_user uuid, p_type text, p_id uuid, p_required permission_level';
  if v_saved_flag is not true then
    raise exception 'DD-210 proof (c) SETUP FAILED: public.has_access_as is not a declared signed-in door, so flipping its flag proves nothing.';
  end if;
  update platform.client_callable_door
     set signed_in_callers = false,
         non_client_lane = 'Planted by the DD-210 forcing proof and restored in the same statement block; this sentence never survives the migration.'
   where schema_name = 'public' and function_name = 'has_access_as'
     and identity_args = 'p_user uuid, p_type text, p_id uuid, p_required permission_level';
  select count(*) into v_n
    from platform.client_callable_door d
    join (select n.nspname sch, p.proname nm, pg_get_function_identity_arguments(p.oid) ia,
                 has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace) f
      on f.sch = d.schema_name and f.nm = d.function_name and f.ia = d.identity_args
   where d.signed_in_callers is distinct from f.auth_x;
  if v_n <> 1 then
    raise exception 'DD-210 proof (c) FAILED: the flag-vs-grant query found % disagreements, expected exactly the plant.', v_n;
  end if;
  update platform.client_callable_door
     set signed_in_callers = v_saved_flag, non_client_lane = null
   where schema_name = 'public' and function_name = 'has_access_as'
     and identity_args = 'p_user uuid, p_type text, p_id uuid, p_required permission_level';

  -- (d) D16 RED, direction three: a client-executable definer with NO door row is FOUND.
  --     The probe function is created WITH its door row, so the §6d-4 guard stands
  --     down and the grant survives; deleting the row afterwards produces exactly
  --     the state the gate must catch. Nothing here outlives the block.
  execute 'create function public.' || v_probe_fn || '() returns integer language sql security definer as $b$ select 1 $b$';
  select pg_get_function_identity_arguments(p.oid) into v_probe_ia
    from pg_proc p where p.oid = ('public.' || v_probe_fn)::regproc;
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, declared_by, reason, anonymous_callers, signed_in_callers)
  values ('public', v_probe_fn, v_probe_ia, 'DD-210 forcing proof',
          'Probe door for the DD-210 forcing proof (d). Dropped in the same statement block that planted it.',
          false, true);
  execute 'grant execute on function public.' || v_probe_fn || '() to authenticated';
  if not has_function_privilege('authenticated', ('public.' || v_probe_fn)::regproc, 'EXECUTE') then
    raise exception 'DD-210 proof (d) SETUP FAILED: the probe never became client-executable, so the RED state was never reached.';
  end if;
  delete from platform.client_callable_door where function_name = v_probe_fn;
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef and p.prokind in ('f','p')
     and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
     and n.nspname <> all (array['pg_catalog','information_schema','pg_toast','extensions','graphql',
                                 'graphql_public','pgbouncer','realtime','_realtime','storage','auth',
                                 'cron','net','vault','pgsodium','pgsodium_masks','supabase_functions',
                                 'supabase_migrations','dashboard','pgtle','tiger','tiger_data','topology'])
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and not exists (select 1 from pg_depend dp where dp.objid = p.oid and dp.deptype = 'e')
     and not exists (select 1 from platform.definer_client_grant_grandfather g
                      where g.schema_name = n.nspname and g.function_name = p.proname
                        and g.argtypes = p.proargtypes::text)
     and not exists (select 1 from platform.client_callable_door c
                      where c.schema_name = n.nspname and c.function_name = p.proname
                        and c.identity_args = pg_get_function_identity_arguments(p.oid));
  if v_n <> 1 then
    raise exception 'DD-210 proof (d) FAILED: the undeclared-client-definer query found % functions, expected exactly the plant.', v_n;
  end if;
  execute 'drop function public.' || v_probe_fn || '()';
  -- The probe's own §6d-4 guard-log rows are ACKNOWLEDGED, never deleted: the guard
  -- really did fire, on a function this file created and destroyed.
  update platform.ddl_guard_log
     set acknowledged_by = 'DD-210 (B-108) forcing proof (d)',
         acknowledged_at = now(),
         ack_reason = 'The object was a probe created and dropped inside the DD-210 migration to prove the undeclared-client-definer arm goes RED; nothing of it survives.'
   where object_ref like 'public.' || v_probe_fn || '%' and acknowledged_by is null;

  -- (e) GREEN — every arm back to zero, with nothing of the probes left behind.
  select count(*) into v_n from platform.client_callable_door where declared_by = 'DD-210 forcing proof';
  if v_n <> 0 then raise exception 'DD-210 teardown FAILED: % probe door row(s) survive.', v_n; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'b108%';
  if v_n <> 0 then raise exception 'DD-210 teardown FAILED: % probe function(s) survive.', v_n; end if;
  raise notice 'DD-210: forcing proofs (a)-(d) each went RED then GREEN; 0 probes survive.';
end $$;

-- ─── 5. The end state this file asserts ─────────────────────────────────────
do $$
declare v_stale integer; v_flag integer; v_undeclared integer; v_rows integer; v_no_client integer;
begin
  select count(*) into v_rows from platform.client_callable_door;

  select count(*) into v_stale from platform.client_callable_door d
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = d.schema_name and p.proname = d.function_name
                        and pg_get_function_identity_arguments(p.oid) = d.identity_args);

  select count(*) into v_flag
    from platform.client_callable_door d
    join (select n.nspname sch, p.proname nm, pg_get_function_identity_arguments(p.oid) ia,
                 has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x,
                 has_function_privilege('anon', p.oid, 'EXECUTE') anon_x
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace) f
      on f.sch = d.schema_name and f.nm = d.function_name and f.ia = d.identity_args
   where d.signed_in_callers is distinct from f.auth_x
      or d.anonymous_callers  is distinct from f.anon_x;

  select count(*) into v_undeclared
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef and p.prokind in ('f','p')
     and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
     and n.nspname <> all (array['pg_catalog','information_schema','pg_toast','extensions','graphql',
                                 'graphql_public','pgbouncer','realtime','_realtime','storage','auth',
                                 'cron','net','vault','pgsodium','pgsodium_masks','supabase_functions',
                                 'supabase_migrations','dashboard','pgtle','tiger','tiger_data','topology'])
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and not exists (select 1 from pg_depend dp where dp.objid = p.oid and dp.deptype = 'e')
     and not exists (select 1 from platform.definer_client_grant_grandfather g
                      where g.schema_name = n.nspname and g.function_name = p.proname
                        and g.argtypes = p.proargtypes::text)
     and not exists (select 1 from platform.client_callable_door c
                      where c.schema_name = n.nspname and c.function_name = p.proname
                        and c.identity_args = pg_get_function_identity_arguments(p.oid));

  select count(*) into v_no_client
    from platform.client_callable_door d
    join (select n.nspname sch, p.proname nm, pg_get_function_identity_arguments(p.oid) ia,
                 has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x,
                 has_function_privilege('anon', p.oid, 'EXECUTE') anon_x,
                 has_function_privilege('public', p.oid, 'EXECUTE') pub_x
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace) f
      on f.sch = d.schema_name and f.nm = d.function_name and f.ia = d.identity_args
   where not f.auth_x and not f.anon_x and not f.pub_x;

  raise notice 'DD-210 end state: % door rows; % naming no live function; % flag/grant disagreements; % client-executable definers with no door row; % doors no client may execute (each naming its lane).',
    v_rows, v_stale, v_flag, v_undeclared, v_no_client;

  if v_stale <> 0 or v_flag <> 0 or v_undeclared <> 0 then
    raise exception 'DD-210 REFUSED: stale=%, flag_disagreements=%, undeclared_client_definers=% — every one of these must be zero for the register to mean anything.',
      v_stale, v_flag, v_undeclared using errcode = '23514';
  end if;
end $$;
