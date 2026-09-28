-- lane: access-ladder T-21
-- Access ladder T-21 (2026-09-28): context.templates moves to Public. T-8 could not move it: as a
-- `system` table the policy generator demands created_by and organization_id, which a catalogue that belongs to
-- no organization and no person does not have. Its registry type is already `reference`, so it moves to the
-- reference variant (one read lane for every signed-in member, anon too when Public, read-only client grant,
-- server-written) in the same statement as its level; the class trigger regenerates the policies.
set local lock_timeout = '3s';
set local statement_timeout = '180s';

select iam.supersede_bespoke_policies('context', 'templates', array['templates_select'], 'Bespoke read policy from before the access ladder; the reference variant''s member read lane and, as Public, its anon lane now do this job.');

update platform.entity_types
   set rls_variant = 'reference', default_list_scope = null, default_visibility = null,
       data_class = 'public'::platform.data_class,
       data_class_reason = 'Access ladder T-21 (2026-09-28): Public per the independent table review (common-docs/projects/access-ladder/table-review.md) — a platform catalogue everyone reads. Registered as a reference catalogue: it belongs to no organization and no person, every reader may open it, and only server doors write it.'
 where token = 'templates' and is_active;

do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'templates' and rls_variant = 'reference' and data_class = 'public'::platform.data_class) then raise exception 'T-21: context.templates did not land'; end if;
  if not exists (select 1 from pg_policy where polrelid = 'context.templates'::regclass and polname = 'ref_all_members_read') then raise exception 'T-21: context.templates has no member read lane'; end if;
  if not exists (select 1 from pg_policy where polrelid = 'context.templates'::regclass and polname = 'platform_admin_read') then raise exception 'T-21: context.templates lost platform_admin_read'; end if;
end $$;
