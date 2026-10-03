select l.pid, l.mode, l.granted, a.state, a.usename, a.application_name, now()-a.xact_start xact_age, left(a.query,120) q
from pg_locks l join pg_stat_activity a on a.pid=l.pid
where l.relation in ('extend.wbx_demo'::regclass,'extend.wbx_guidance'::regclass,'extend.wbx_highlight'::regclass,'legal.wc_claim'::regclass,'education.study_structured_section'::regclass,'education.study_source_chunk'::regclass)
order by xact_age desc nulls last limit 20
