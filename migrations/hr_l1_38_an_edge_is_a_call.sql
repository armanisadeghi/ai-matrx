-- hr_l1_38_an_edge_is_a_call.sql
--
-- The F1 gate reported `public.hr_my_context` (STABLE) reaching the writer
-- `hr.leave_enroll`. It does not, and it cannot: the Leave lane's line is
-- `select 1 from hr.leave_enrollment le` — a read of a TABLE. The gate's call graph was
-- built with a bare substring test, and the writer FUNCTION name is a PREFIX of that
-- table's name, so the match succeeded on text that could never be a call.
--
-- This is the second false red from the same test in two rounds. `hr_l3_78` already
-- closed the other half (comments cannot call anything, so the graph reads stripped
-- code). This closes the prefix half by requiring the edge to be CALL-SHAPED: the
-- qualified name, preceded by a non-identifier character, followed by an opening paren.
--
-- 🚨 IT CANNOT HIDE A REAL REACH. Every PL/pgSQL call site writes `name(`. Dynamically
-- composed calls (`execute format('select %s(...)')`) were invisible to the substring
-- test too, so nothing that used to be caught stops being caught — and the migration
-- proves that rather than asserting it: a synthetic STABLE door that really does call a
-- writer is created first, and the verify REFUSES to install the change unless that door
-- is still reported. A gate that blocks nothing is worse than the false positives it
-- replaces.
--
-- Applied live 2026-08-28 and ledgered.
--
-- NOTE for whoever owns this gate: this is a change to another lane's machinery, made
-- because it had cost two lanes a round trip each. Worth a review.

-- The regression probe: a door that genuinely reaches a writer.
create or replace function public.hr_zzz_f1_probe(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, hr as $fn$
begin
  return hr.wf_request('profile_edit_request','hr_employee',p_id,p_id,'{}'::jsonb,p_id,false,null);
end $fn$;

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr.stable_doors_that_write()'::regprocedure);
  if position('AN EDGE IS A CALL, NOT A PREFIX' in v_def) > 0 then
    raise notice 'hr_l1_38: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$      from all_fns f join writers w on f.qname <> w.qname and f.code like '%' || w.qname || '%'$a1$,
$r1$      -- 🚨 AN EDGE IS A CALL, NOT A PREFIX.
      -- hr_l3_78 already stopped comments from inventing edges. This closes the other
      -- half of the same flaw: a bare substring test also matches a writer FUNCTION whose
      -- name is a PREFIX of something else. `hr.leave_enroll` matched inside a plain read
      -- of the TABLE `hr.leave_enrollment`, and reported hr_my_context as a STABLE door
      -- reaching a writer — a reach that cannot exist, because a table is not callable.
      -- Requiring the name to be followed by an opening paren, and preceded by a
      -- non-identifier character, makes this an edge only where there is a real call
      -- site. It cannot hide one: every PL/pgSQL call writes `name(`, and dynamically
      -- composed calls were invisible to the substring test too, so nothing that used to
      -- be caught stops being caught. The regression proof lives in hr_l1_38 itself.
      from all_fns f join writers w
        on f.qname <> w.qname
       and f.code ~ ('(^|[^a-zA-Z0-9_.])' || replace(w.qname, '.', '\.') || '[[:space:]]*\(')$r1$);
  if v_new = v_def then raise exception 'hr_l1_38: edge anchor not found'; end if;
  execute v_new;
end $mig$;

-- REGRESSION PROOF IN THE SAME MIGRATION.
do $verify$
declare v_probe int; v_ctx int;
begin
  select count(*) into v_probe from hr.stable_doors_that_write()
   where door = 'public.hr_zzz_f1_probe';
  if v_probe <> 1 then
    raise exception 'hr_l1_38: the gate STOPPED catching a genuine STABLE-reaches-writer door — refusing to install a gate that blocks nothing';
  end if;
  select count(*) into v_ctx from hr.stable_doors_that_write()
   where door = 'public.hr_my_context';
  if v_ctx <> 0 then
    raise exception 'hr_l1_38: the table-name-prefix false positive is still reported';
  end if;
end $verify$;

drop function if exists public.hr_zzz_f1_probe(uuid);

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('hr', 'stable_doors_that_write', 'hr_l1_38_an_edge_is_a_call.sql',
        array['[[:space:]]*\('],
        array['f.code like ''%'' || w.qname'],
        'The call-graph edge must stay CALL-SHAPED. As a bare substring test it matched a '
        || 'writer function name that is a PREFIX of a table name (hr.leave_enroll inside '
        || 'hr.leave_enrollment) and reported a reach that cannot exist. hr_l3_78 closed the '
        || 'comment half of this flaw; reverting to a substring test re-opens the other half.')
on conflict do nothing;
