with targets as (
  select distinct t.tgfoid fn, t.tgrelid rel from pg_trigger t
   where not t.tgisinternal and t.tgrelid in ('extend.wbx_demo'::regclass,'extend.wbx_guidance'::regclass,'extend.wbx_highlight'::regclass,'legal.wc_claim'::regclass,'education.study_structured_section'::regclass,'education.study_source_chunk'::regclass)
     and (select lanname from pg_language l join pg_proc p on p.prolang=l.oid where p.oid=t.tgfoid)='plpgsql'
  union
  select p.oid, 0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where p.prolang=(select oid from pg_language where lanname='plpgsql') and n.nspname not in ('deprecated','pg_catalog')
     and p.prorettype <> 'trigger'::regtype
     and p.prosrc ~* '\m(wbx_demo|wbx_guidance|wbx_highlight|wc_claim|study_structured_section|study_source_chunk)\M')
select fn::regprocedure::text f, rel::regclass::text r, count(*) filter (where c.level='error') errors, string_agg(distinct left(c.message,90),' | ') filter (where c.level='error') msgs
from targets, lateral plpgsql_check_function_tb(fn, rel) c
group by 1,2 having count(*) filter (where c.level='error')>0
union all select 'TOTAL_TARGETS', (select count(*) from targets)::text, null, null
