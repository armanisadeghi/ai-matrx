-- lane: access-ladder T-21
-- Access ladder T-21 (2026-09-28): legal.opinion_clusters moves to Public. T-8 could not move it: as a
-- `system` table the policy generator demands created_by and organization_id, which a catalogue that belongs to
-- no organization and no person does not have. Its registry type is already `reference`, so it moves to the
-- reference variant (one read lane for every signed-in member, anon too when Public, read-only client grant,
-- server-written) in the same statement as its level; the class trigger regenerates the policies.
set local lock_timeout = '3s';
set local statement_timeout = '180s';

select iam.supersede_bespoke_policies('legal', 'opinion_clusters', array['platform_admin_only'], 'Restrictive platform-admin-only lock on every command, from before the access ladder. The reference variant now gives the read lane its level allows, platform admins keep platform_admin_read, and the read-only client grant closes client writes.');

update platform.entity_types
   set rls_variant = 'reference', default_list_scope = null, default_visibility = null,
       data_class = 'public'::platform.data_class,
       data_class_reason = 'Access ladder T-21 (2026-09-28): Public per the independent table review (common-docs/projects/access-ladder/table-review.md) — public court records. Registered as a reference catalogue: it belongs to no organization and no person, every reader may open it, and only server doors write it.'
 where token = 'opinion_clusters' and is_active;

do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'opinion_clusters' and rls_variant = 'reference' and data_class = 'public'::platform.data_class) then raise exception 'T-21: legal.opinion_clusters did not land'; end if;
  if not exists (select 1 from pg_policy where polrelid = 'legal.opinion_clusters'::regclass and polname = 'ref_all_members_read') then raise exception 'T-21: legal.opinion_clusters has no member read lane'; end if;
  if not exists (select 1 from pg_policy where polrelid = 'legal.opinion_clusters'::regclass and polname = 'platform_admin_read') then raise exception 'T-21: legal.opinion_clusters lost platform_admin_read'; end if;
end $$;
