-- chair-step: converts extend.wbx_guidance.id from text to uuid (ALTER COLUMN TYPE) so the policy generator can emit its read lanes; the table holds 0 rows, so nothing is rewritten
-- lane: access-ladder T-21
-- Access ladder T-21 (2026-09-28): extend.wbx_guidance moves to Organization, the level the independent table
-- review gave it (common-docs/projects/access-ladder/table-review.md; toward Organization needs no approval).
-- T-8 could not move it: its id was text (the extension minted `gd_<time>_<rand>`), and every entity read lane
-- compares id with uuid sets, so the generator died with 42883 (now refused by name, migration t21_37).
-- The id becomes a uuid with a generated default; the extension now mints crypto.randomUUID() (matrx-extend
-- src/lib/guidance/storage.ts). The owner-only bespoke policies give way to the generated set (owner = created_by,
-- plus every member of the organization, plus platform_admin_read).
set local lock_timeout = '3s';
set local statement_timeout = '120s';

do $$ begin
  if exists (select 1 from extend.wbx_guidance) then raise exception 'T-21: extend.wbx_guidance has rows; convert their ids deliberately first'; end if;
end $$;

alter table extend.wbx_guidance alter column id type uuid using id::uuid;
alter table extend.wbx_guidance alter column id set default gen_random_uuid();

select iam.supersede_bespoke_policies('extend', 'wbx_guidance',
  array['wbx_guidance_owner_select', 'wbx_guidance_owner_insert', 'wbx_guidance_owner_update', 'wbx_guidance_owner_delete'],
  'Bespoke owner-only policies from before the access ladder. The generated std_* set now carries the owner lane on created_by plus the Organization member lane and the canonical platform_admin_read.');

update platform.entity_types
   set data_class = 'organization',
       default_visibility = coalesce(default_visibility, 'internal'),
       data_class_reason = 'Access ladder T-21 (2026-09-28): Organization per the independent table review (common-docs/projects/access-ladder/table-review.md) under the access ladder law; no law or universal company rule keeps coworkers out.'
 where token = 'wbx_guidance';

do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'wbx_guidance' and data_class = 'organization') then raise exception 'T-21: extend.wbx_guidance did not land'; end if;
  if not exists (select 1 from pg_policy where polrelid = 'extend.wbx_guidance'::regclass and polname = 'std_select') then raise exception 'T-21: extend.wbx_guidance has no generated read'; end if;
end $$;
