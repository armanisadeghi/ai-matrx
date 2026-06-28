-- Retire two confirmed-dead duplicate/legacy public tables (reversible; rows kept).
--   system_prompts_new (24 rows) — abandoned "_new" half of the system_prompts
--     pair. Zero FE consumers, zero aidream business consumers (only the auto-
--     generated db/managers artifact, which stops regenerating once the table
--     leaves public). Canonical prompt path is agent.definition.
--   schema_migrations (5 rows) — legacy migration ledger, superseded by
--     public._schema_migrations + supabase_migrations.schema_migrations. Only an
--     auto-generated config entry referenced it.
-- Verified zero current-system consumers (FE + aidream business code + DB) first.
-- Idempotent enough for the transition: only acts if the table is still in public.
do $$
begin
  if to_regclass('public.system_prompts_new') is not null then
    execute 'alter table public.system_prompts_new set schema graveyard';
  end if;
  if to_regclass('public.schema_migrations') is not null then
    execute 'alter table public.schema_migrations set schema graveyard';
  end if;
end $$;
