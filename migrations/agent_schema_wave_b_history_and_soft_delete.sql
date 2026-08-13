-- Applied via Supabase MCP 2026-08-12 (agent_schema_wave_b_history_and_soft_delete).
-- Canonical _history capture on the four agent tables with NO custom store; deleted_at on the
-- three children that lacked it. agent itself uses its CERTIFIED custom store
-- (agent.definition_version) — attaching _history there is BANNED (duplicate versioning).
do $$
declare r record;
begin
  for r in select * from (values
      ('template','agent_template'),
      ('shortcut','agent_shortcut'),
      ('cmp_comparison_sets','comparison_set'),
      ('cmp_response_feedback','cmp_feedback')
    ) as t(tbl, token)
  loop
    if not exists (select 1 from pg_trigger tg where tg.tgrelid=('agent.'||r.tbl)::regclass and tg.tgname='_history') then
      execute format('create trigger _history after insert or delete or update on agent.%I for each row execute function platform._version_capture(%L)', r.tbl, r.token);
    end if;
  end loop;
end $$;
alter table agent.definition_version add column if not exists deleted_at timestamptz;
alter table agent.usage              add column if not exists deleted_at timestamptz;
alter table agent.drift_alert        add column if not exists deleted_at timestamptz;
update platform.entity_types set has_soft_delete = true
where token in ('agent_definition_version','agent_usage','agent_drift_alert') and not has_soft_delete;
