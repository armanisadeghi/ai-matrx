-- Applied via Supabase MCP 2026-08-12 (entity_types_version_store_registry). Arman-ratified.
-- CUSTOM VERSION STORE registry: an entity's versioning lives in exactly ONE place — the canonical
-- history system (default) or a certified custom store (version_store_ref), e.g.
-- agent.definition_version: a publication store whose rows product tables FK-pin.
-- Duplicate versioning is banned; iam.verify_canonical enforces the store requirements.
alter table platform.entity_types add column if not exists version_store text not null default 'history';
alter table platform.entity_types add column if not exists version_store_ref regclass;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='entity_types_version_store_check') then
    alter table platform.entity_types add constraint entity_types_version_store_check
      check (version_store in ('history','custom'));
  end if;
  if not exists (select 1 from pg_constraint where conname='entity_types_version_store_ref_check') then
    alter table platform.entity_types add constraint entity_types_version_store_ref_check
      check (version_store <> 'custom' or version_store_ref is not null);
  end if;
end $$;
update platform.entity_types
set version_store='custom', version_store_ref='agent.definition_version'::regclass
where token='agent';
