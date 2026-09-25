-- chair-step: the INVERSE of storetails3_every_worked_out_column_is_kept_from_agents_like_its_inputs.sql.
--   Every column that repair raised left one history.migration_log row (verb
--   `context_policy_rederive`, target_kind `field`) whose `inverse` holds the column's old
--   `context_policy`. This puts that word back on each column and stamps the log row `undone_at`.
--   Run the inverse of storetails3_what_an_agent_may_see_follows_what_a_column_reads.sql FIRST, or
--   its trigger raises the column again on this very write.
-- lock: custom
-- lane: STORE-TAILS-3

set local lock_timeout = '30s';
set local statement_timeout = '300s';

select set_config('app.actor_system', 'campaign/storetails3-context-repair-undo', true);

with undo as (
  select distinct on (m.target_id) m.id as log_id, m.organization_id, m.target_id, m.inverse -> 'patch' as patch
    from history.migration_log m
   where m.verb = 'context_policy_rederive'
     and m.target_kind = 'field'
     and m.undone_at is null
   order by m.target_id, m.applied_at desc),
put as (
  update custom.record f
     set data = case when u.patch -> 'context_policy' is null or u.patch -> 'context_policy' = 'null'::jsonb
                     then jsonb_set(f.data, '{context_policy}', '"include"')
                     else jsonb_set(f.data, '{context_policy}', u.patch -> 'context_policy') end
    from undo u
   where f.organization_id = u.organization_id
     and f.id = u.target_id
  returning f.id)
update history.migration_log m
   set undone_at = now()
  from undo u
 where m.id = u.log_id
   and u.target_id in (select id from put);
