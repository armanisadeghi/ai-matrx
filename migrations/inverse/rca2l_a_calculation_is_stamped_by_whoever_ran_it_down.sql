-- chair-step: rehearsal inverse of rca2l — removes the actor guard from public.hr_write_calculation_snapshot.
-- Inverse of migrations/rca2l_a_calculation_is_stamped_by_whoever_ran_it.sql (rehearsal only).

set local lock_timeout = '2s';

do $patch$
declare
  v_def text := pg_get_functiondef('public.hr_write_calculation_snapshot(uuid,text,uuid,text,text,date,text,text,jsonb,jsonb,jsonb,jsonb,text,uuid,uuid,jsonb,boolean,uuid,uuid)'::regprocedure);
  v_start int;
  v_end int;
begin
  v_start := position('  -- RC-A2l: A CALCULATION IS STAMPED BY WHOEVER RAN IT.' in v_def);
  v_end := position('  return hr.write_calculation_snapshot(' in v_def);
  if v_start = 0 or v_end <= v_start then
    raise exception 'rca2l inverse: the RC-A2l block is not in public.hr_write_calculation_snapshot';
  end if;
  execute substr(v_def, 1, v_start - 1) || substr(v_def, v_end);
end
$patch$;
