-- hr_l1_32_f1_red_over_a_comment.sql
--
-- F1 went 0 → 1 and the red was mine. The gate reported `public.hr_pending_changes`
-- (STABLE) reaching seven writers: the wf_request door, wf_submit, leave_wf_validate,
-- _wf_event, _wf_failure, _wf_notify, _wf_route. That is the class that killed
-- hr_employee_profile — PostgREST runs STABLE in a READ-ONLY transaction, so a write on
-- that path aborts 25006 for real users while passing every privileged-SQL probe.
--
-- 🚨 BUT THE REACH WAS NEVER REAL, AND I CAUSED IT WITH PROSE.
-- `hr.stable_doors_that_write()` builds its call graph with a bare substring test:
--     edges := f.prosrc LIKE '%' || <writer qualified name> || '%'
-- It cannot tell a call from a comment. `hr_l1_31` added an explanatory comment to
-- `hr_pending_changes` that NAMED the workflow request door in schema-qualified form, so
-- the matcher invented one edge to it — and then six more transitively, through that
-- door's own real callees. Verified before fixing: exactly one of the seven names appears
-- in the prosrc at all, and it appears only inside a comment; the function calls nothing.
--
-- So the fix is to cut the phantom edge, not to change the door's volatility: this is a
-- read door that reads. The comment keeps its meaning with the name unqualified, and
-- carries a standing note telling the next person not to "helpfully" re-qualify it.
--
-- Proven after the fix, through POST /rest/v1/rpc with a REAL end-user token
-- (role authenticated) rather than privileged SQL — the only test that exercises
-- PostgREST's read-only transaction:
--   POPULATED (subject with 2 open requests) → HTTP 200, granted true, in_flight 2
--                                              (address_change, profile_edit_request)
--   EMPTY     (subject with none)            → HTTP 200, granted true, in_flight 0
--   No 25006 in either direction.
--
-- Applied live 2026-08-27 and ledgered. Run after hr_l1_31. On a fresh replay hr_l1_31
-- already lands the safe wording, and this migration correctly no-ops.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_pending_changes(uuid)'::regprocedure);
  if position('NAMED UNQUALIFIED ON PURPOSE' in v_def) > 0 then
    raise notice 'hr_l1_32: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$       -- vocabulary is ('active','closed','failed','cancelled'), and `hr.wf_request`
       -- creates every request as 'active'. So `in_flight` was ALWAYS an empty array, for$a1$,
$r1$       -- vocabulary is ('active','closed','failed','cancelled'), and the wf_request door
       -- creates every request as 'active'. So `in_flight` was ALWAYS an empty array, for$r1$);
  if v_new = v_def then raise exception 'hr_l1_32: comment anchor not found'; end if;

  v_new := replace(v_new,
$a2$       -- empty one — and an empty list is the most convincing lie a door can tell.$a2$,
$r2$       -- empty one — and an empty list is the most convincing lie a door can tell.
       --
       -- 🚨 THAT DOOR IS NAMED UNQUALIFIED ON PURPOSE — DO NOT "FIX" IT TO hr.<name>.
       -- The F1 gate (hr.stable_doors_that_write) builds its call graph by testing whether
       -- one function's prosrc CONTAINS another's qualified name. It cannot tell a call from
       -- a comment, so writing the schema-qualified name here — as this comment originally
       -- did — invented an edge from this STABLE read door to a writer, and transitively to
       -- six more, turning F1 red over prose. The reach was never real: this function calls
       -- nothing. Keep workflow-door names unqualified inside comments in STABLE doors.$r2$);
  if position('NAMED UNQUALIFIED ON PURPOSE' in v_new) = 0 then
    raise exception 'hr_l1_32: note anchor not found';
  end if;

  execute v_new;
end $mig$;

-- The gate itself is the verification. Anything but zero fails the migration.
do $verify$
declare v_src text; v_rows int;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_pending_changes';
  if v_src !~ 'THE STATES THIS FILTER NAMED DO NOT EXIST' then
    raise exception 'hr_l1_32: hr_l1_31 explanation lost'; end if;
  if v_src !~ 'wi\.state = ''active''' then
    raise exception 'hr_l1_32: the active filter is gone'; end if;
  select count(*) into v_rows from hr.stable_doors_that_write();
  if v_rows <> 0 then
    raise exception 'hr_l1_32: F1 is still % — %', v_rows,
      (select string_agg(door || ' -> ' || reaches, '; ') from hr.stable_doors_that_write());
  end if;
end $verify$;

insert into public._schema_migrations (source, filename, checksum, applied_at, duration_ms)
values ('matrx-frontend', 'hr_l1_32_f1_red_over_a_comment.sql',
        md5('hr_l1_32_f1_red_over_a_comment'), now(), 0)
on conflict do nothing;
