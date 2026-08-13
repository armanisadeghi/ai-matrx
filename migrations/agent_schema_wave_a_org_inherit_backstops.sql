-- Applied via Supabase MCP 2026-08-12 (agent_schema_wave_a_org_inherit_backstops).
-- Backstop for the new NOT NULL organization_id columns: inherit from the composition parent.
-- Verified end-to-end same day: agent create -> v1 snapshot (org inherited), edit -> v2, cascade delete clean.
do $$ begin
  if not exists (select 1 from pg_trigger where tgrelid='agent.definition_version'::regclass and tgname='_inherit_org') then
    create trigger _inherit_org before insert on agent.definition_version
      for each row execute function platform.inherit_org_from_parent('agent','definition','agent_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='agent.usage'::regclass and tgname='_inherit_org') then
    create trigger _inherit_org before insert on agent.usage
      for each row execute function platform.inherit_org_from_parent('agent','definition','agent_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='agent.drift_alert'::regclass and tgname='_inherit_org') then
    create trigger _inherit_org before insert on agent.drift_alert
      for each row execute function platform.inherit_org_from_parent('agent','definition','agent_id');
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='agent.cmp_comparison_entries'::regclass and tgname='_inherit_org') then
    create trigger _inherit_org before insert on agent.cmp_comparison_entries
      for each row execute function platform.inherit_org_from_parent('agent','cmp_comparison_sets','comparison_set_id');
  end if;
end $$;
