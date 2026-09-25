-- chair-step: the INVERSE of storeleakformula_every_worked_out_column_reads_its_inputs_again.sql.
--   Every column that repair wrote left one history.migration_log row (verb `sensitivity_rederive`,
--   target_kind `field`) whose `inverse` holds the column's `depends_on` and `sensitivity` exactly as
--   they were. This puts those two keys back on each column and stamps the log row `undone_at`.
--   Run the inverse of storeleakformula_a_worked_out_column_is_as_sensitive_as_what_it_reads.sql
--   FIRST, or its trigger re-derives the column again on this very write.
-- lock: custom
-- lane: STORE-LEAK-FORMULA

set local lock_timeout = '2s';
set local statement_timeout = '300s';

select set_config('app.actor_system', 'campaign/storeleakformula-repair-undo', true);

with undo as (
  select distinct on (m.target_id) m.id as log_id, m.organization_id, m.target_id, m.inverse -> 'patch' as patch
    from history.migration_log m
   where m.verb = 'sensitivity_rederive'
     and m.target_kind = 'field'
     and m.undone_at is null
   order by m.target_id, m.applied_at desc),
put as (
  update custom.record f
     set data = jsonb_set(jsonb_set(f.data, '{sensitivity}', u.patch -> 'sensitivity'),
                          '{depends_on}', coalesce(u.patch -> 'depends_on', '[]'::jsonb))
    from undo u
   where f.organization_id = u.organization_id
     and f.id = u.target_id
  returning f.id)
update history.migration_log m
   set undone_at = now()
  from undo u
 where m.id = u.log_id
   and u.target_id in (select id from put);
