-- public_schema_triage_batch2_relocations.sql
-- APPLIED LIVE 2026-08-13 via Supabase MCP. Triage: common-docs/operations/public-schema-triage.md.
-- Four Arman-approved relocations out of public:
--   public.flexible_data    -> platform   (PROMOTED — permanent flexible-JSON primitive, doctrine §6a)
--   public.message_template -> agent      (live agent-builder message-template library)
--   public.heatmap_saves    -> workbench  (user data artifact, like the udt_* family)
--   public.schema_templates -> workbench  (udt dataset-template family lives there)
-- Plus two fix-on-sight canonicalizations the moves exposed:
--   message_template.project_id dropped — forbidden feature->project FK (0 of 10 rows had a value)
--   heatmap_saves.visibility text -> platform.visibility enum + legacy is_public boolean dropped
--   (the ddl_guard refused the move until the reserved column name carried the enum type).
-- public went 41 -> 37 base tables. Idempotent: every step guarded by to_regclass / IF EXISTS.

do $$
declare
  mv record;
begin
  -- 0. heatmap_saves canonicalization (0 rows). The remaining bespoke owner policies are LEFT
  --    AS-IS deliberately: this is an anon-writable public tool (an anonymous save carries
  --    user_id NULL), so full canonical RLS is a guest-access decision, not a side effect of a
  --    schema move. Recorded as follow-up in the triage doc.
  if to_regclass('public.heatmap_saves') is not null then
    drop policy if exists "Users can view own heatmaps" on public.heatmap_saves;
    alter table public.heatmap_saves alter column visibility drop default;
    alter table public.heatmap_saves
      alter column visibility type platform.visibility using visibility::platform.visibility;
    alter table public.heatmap_saves
      alter column visibility set default 'public'::platform.visibility;
    alter table public.heatmap_saves drop column if exists is_public;
    create policy "Users can view own heatmaps" on public.heatmap_saves for select
      using (
        user_id = ((current_setting('request.jwt.claims', true))::json ->> 'sub')
        or visibility = 'public'::platform.visibility
      );
  end if;

  -- 1. Forbidden feature->project FK
  if to_regclass('public.message_template') is not null then
    alter table public.message_template drop column if exists project_id;
  end if;

  -- 2. Relocate
  for mv in
    select * from (values
      ('flexible_data',   'platform'),
      ('message_template','agent'),
      ('heatmap_saves',   'workbench'),
      ('schema_templates','workbench')
    ) as v(tbl, dest)
  loop
    if to_regclass('public.'||mv.tbl) is not null then
      execute format('alter table public.%I set schema %I', mv.tbl, mv.dest);
    end if;
  end loop;

  -- 3. Registry follows the table (entity_types.schema_name is the resolver's source of truth)
  update platform.entity_types set schema_name='platform' where table_name='flexible_data' and schema_name='public';
  update platform.entity_types set schema_name='agent'     where table_name='message_template' and schema_name='public';
  update platform.entity_types set schema_name='workbench' where table_name in ('heatmap_saves','schema_templates') and schema_name='public';
  update platform.shareable_resource_registry set schema_name='agent'
    where table_name='message_template' and schema_name='public';

  -- 4. Ledger
  insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
  select 'public.'||x.t, x.n, null, x.why from (values
    ('flexible_data',   'platform.flexible_data',   'PROMOTED to platform - permanent flexible-JSON primitive (doctrine 6a); never a retirement candidate'),
    ('message_template','agent.message_template',   'live message-template library consumed by the agent builder message-builders'),
    ('heatmap_saves',   'workbench.heatmap_saves',  'user data artifact from the public zip-code heatmap tool; visibility enum canonicalized, is_public dropped'),
    ('schema_templates','workbench.schema_templates','user-generated-table templates; the udt_ family lives in workbench')
  ) as x(t, n, why)
  on conflict do nothing;
end $$;
