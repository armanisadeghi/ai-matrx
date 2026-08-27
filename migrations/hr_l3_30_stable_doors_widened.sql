-- HR domain L3 — migration 30 (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 THE F1 CLASS IN A NEW COSTUME: `hr.timesheet_period_grid` was declared STABLE and CREATES A
-- TEMP TABLE, so every real caller got "CREATE TABLE is not allowed in a non-volatile function"
-- and route 28's grid could return nothing. Confirmed live: provolatile='s'; the public wrapper is
-- VOLATILE but the inner hr. body is not, and the inner one is where the planner enforces it.
--
-- 1. THE FIX IS THE DECLARATION, NOT A REWRITE. `ALTER FUNCTION ... VOLATILE` leaves the 13KB body
--    byte-identical. The door's read semantics are unchanged either way, and rewriting another
--    lane's function to remove a temp table would risk a behaviour change for no gain. STABLE was
--    never load-bearing here.
--
-- 2. 🚨 THE CLASS GATE HAD TWO HOLES.
--    (a) It recognised only `insert into`, `delete from` and `arm_write`. CREATE TEMP TABLE,
--        UPDATE, TRUNCATE, ALTER/DROP TABLE, COPY FROM, REFRESH MATVIEW and sequence writes all
--        slipped through - each fails at runtime inside a non-volatile function, and each is
--        invisible to a privileged-session test that never calls the door as a real caller.
--    (b) 🚨 It rooted ONLY at non-volatile PUBLIC wrappers. `public.hr_timesheet_period_grid` is
--        VOLATILE, so the whole tree beneath it - including the STABLE body that actually breaks -
--        was skipped by construction. A VOLATILE wrapper over a STABLE writer was the one shape the
--        gate could never see, and it is the shape that shipped.
--
-- 3. 🚨 TWO ARMS, BECAUSE ONLY ONE OF THEM IS EXACTLY MEASURABLE. The first widened attempt rooted
--    the TRANSITIVE search at every non-volatile function and went red with eight findings, all
--    false: the call graph is built from `prosrc LIKE '%callee%'`, so a function that merely NAMES a
--    writer is treated as calling it. `hr.punch_write_path_conformance` was flagged because it
--    lists the sanctioned writers as string literals in its allowlists; `hr._kiosk_device_config`
--    because a COMMENT says "the same expression hr.punch_record enforces". Postgres exposes no
--    real function-to-function dependency for plpgsql bodies, so that edge cannot be made precise.
--    A gate with false positives is a gate everyone learns to skip, so:
--      * DIRECT arm (depth 0) - a non-volatile function whose OWN body contains a write form.
--        Exact, no heuristic, scanned across the whole surface. This is the arm that catches F1.
--      * TRANSITIVE arm (depth >= 1) - kept at its ORIGINAL scope, non-volatile public wrappers
--        only, where the substring heuristic has been quiet in practice. Not widened, deliberately.
--
-- 4. THE PATTERNS ARE CONCATENATED SO THE GATE CANNOT MATCH ITSELF. The first run flagged
--    `hr.stable_doors_that_write` for containing `arm_write` - because it SEARCHES for it. Same
--    self-match trap as the punch conformance gate; `'arm' || '_write'` never appears contiguously,
--    and the function is excluded by name as well.
--
-- Return signature unchanged (door, volatility, reaches, depth); `reaches` says `self: <forms>` for
-- a direct finding.
-- Applied live as `hr_l3_30_stable_doors_widened`. Idempotent.

alter function hr.timesheet_period_grid(uuid, jsonb, jsonb) volatile;

create or replace function hr.stable_doors_that_write()
returns table(door text, volatility text, reaches text, depth integer)
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  with recursive pat as (
    select array[
      '(^|[^a-z_])insert[[:space:]]+into[[:space:]]',
      '(^|[^a-z_])delete[[:space:]]+from[[:space:]]',
      '(^|[^a-z_])update[[:space:]]+[a-z_."]+[[:space:]]+set[[:space:]]',
      '(^|[^a-z_])create[[:space:]]+(temp|temporary|unlogged)?[[:space:]]*table[[:space:]]',
      '(^|[^a-z_])truncate[[:space:]]',
      '(^|[^a-z_])alter[[:space:]]+table[[:space:]]',
      '(^|[^a-z_])drop[[:space:]]+table[[:space:]]',
      '(^|[^a-z_])refresh[[:space:]]+materialized',
      '(^|[^a-z_])copy[[:space:]]+[a-z_."]+[[:space:]]+from[[:space:]]',
      '(^|[^a-z_])(setval|nextval)[[:space:]]*\(',
      'arm' || '_write'
    ] as pats,
    array['INSERT','DELETE','UPDATE','CREATE TABLE','TRUNCATE','ALTER TABLE','DROP TABLE',
          'REFRESH MATVIEW','COPY FROM','SEQUENCE WRITE','arm-write'] as labels
  ), all_fns as (
    select p.oid, n.nspname, p.proname, p.provolatile, p.prosrc,
           n.nspname || '.' || p.proname as qname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prokind = 'f'
       and n.nspname in ('hr','public','esign','platform','iam')
       and not (n.nspname = 'hr' and p.proname = 'stable_doors_that_write')   -- decision 4
  ), writers as (
    select f.qname,
           (select string_agg(pt.label, ', ' order by pt.i)
              from pat, lateral (
                select unnest(pat.pats) as p, unnest(pat.labels) as label,
                       generate_subscripts(pat.pats,1) as i) pt
             where f.prosrc ~* pt.p) as forms
      from all_fns f
     where exists (select 1 from pat, lateral unnest(pat.pats) u(p) where f.prosrc ~* u.p)
  ), edges as (
    select f.qname as caller, w.qname as callee
      from all_fns f join writers w on f.qname <> w.qname and f.prosrc like '%' || w.qname || '%'
  ), reach as (
    -- decision 3: transitive arm stays at its ORIGINAL scope; the substring edge is not precise
    -- enough to widen without crying wolf.
    select f.qname as root, e.callee as at, 1 as d
      from all_fns f join edges e on e.caller = f.qname
     where f.nspname = 'public'
       and (f.proname like 'hr\_%' or f.proname like 'esign\_%')
       and f.provolatile <> 'v'
    union all
    select r.root, e.callee, r.d + 1
      from reach r join edges e on e.caller = r.at
     where r.d < 3
  ), findings as (
    -- DIRECT arm: exact, whole surface. This is what catches the F1 class.
    select f.qname as root, 'self: ' || w.forms as reaches, 0 as d
      from all_fns f join writers w on w.qname = f.qname
     where f.provolatile <> 'v'
    union all
    select r.root, string_agg(distinct r.at, ', '), min(r.d)::int
      from reach r join writers w on w.qname = r.at
     group by r.root
  )
  select f.root,
         (select case p.provolatile when 'i' then 'IMMUTABLE' else 'STABLE' end
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = split_part(f.root,'.',1) and p.proname = split_part(f.root,'.',2)
           limit 1),
         string_agg(f.reaches, ' | '),
         min(f.d)
    from findings f
   group by f.root
   order by f.root;
$function$;

comment on function hr.stable_doors_that_write() is
  'The F1 class gate. DIRECT arm: any non-volatile function whose own body contains a write form (INSERT/DELETE/UPDATE/CREATE TABLE/TRUNCATE/ALTER/DROP/COPY/REFRESH/sequence) - exact, whole surface, catches the STABLE-body-under-a-VOLATILE-wrapper shape the old version could not see. TRANSITIVE arm stays at public non-volatile wrappers because the call graph is a prosrc substring heuristic and widening it produced only false positives.';

do $$
declare v_rows text; v_n int;
begin
  if (select provolatile from pg_proc where oid='hr.timesheet_period_grid(uuid,jsonb,jsonb)'::regprocedure) <> 'v' then
    raise exception 'hr_l3_30: timesheet_period_grid is still non-volatile';
  end if;
  -- prove the new detector actually matches a temp-table creation
  if not ('x create temp table y ' ~* '(^|[^a-z_])create[[:space:]]+(temp|temporary|unlogged)?[[:space:]]*table[[:space:]]') then
    raise exception 'hr_l3_30: the CREATE TABLE pattern does not match';
  end if;
  select count(*), string_agg(door || ' [' || reaches || ']', '; ')
    into v_n, v_rows from hr.stable_doors_that_write();
  if v_n > 0 then
    raise exception 'hr_l3_30: the class gate is RED: %', v_rows;
  end if;
end $$;
