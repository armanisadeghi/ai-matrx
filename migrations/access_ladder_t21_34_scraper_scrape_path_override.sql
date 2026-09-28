-- lane: access-ladder T-21
-- Access ladder T-21 (2026-09-28): scraper.scrape_path_override moves to Organization, platform-owned. T-8 could not move it: as a
-- `system` table the policy generator demands created_by and organization_id, which a catalogue that belongs to
-- no organization and no person does not have. Its registry type is already `reference`, so it moves to the
-- reference variant (one read lane for every signed-in member, anon too when Public, read-only client grant,
-- server-written) in the same statement as its level; the class trigger regenerates the policies.
set local lock_timeout = '3s';
set local statement_timeout = '180s';

select iam.supersede_bespoke_policies('scraper', 'scrape_path_override', array['platform_admin_only'], 'Restrictive platform-admin-only lock on every command, from before the access ladder. The reference variant now gives the read lane its level allows, platform admins keep platform_admin_read, and the read-only client grant closes client writes.');

update platform.entity_types
   set rls_variant = 'reference', default_list_scope = null, default_visibility = null,
       data_class = 'organization'::platform.data_class,
       data_class_reason = 'Access ladder T-21 (2026-09-28): Organization, platform-owned per the independent table review (common-docs/projects/access-ladder/table-review.md) — the scraper''s per-path overrides for public web sites. Registered as a reference catalogue (its registry type already said so): no organization or person owns a row, signed-in members may read it, and only server doors write it.'
 where token = 'scrape_path_override' and is_active;

do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'scrape_path_override' and rls_variant = 'reference' and data_class = 'organization'::platform.data_class) then raise exception 'T-21: scraper.scrape_path_override did not land'; end if;
  if not exists (select 1 from pg_policy where polrelid = 'scraper.scrape_path_override'::regclass and polname = 'ref_all_members_read') then raise exception 'T-21: scraper.scrape_path_override has no member read lane'; end if;
  if not exists (select 1 from pg_policy where polrelid = 'scraper.scrape_path_override'::regclass and polname = 'platform_admin_read') then raise exception 'T-21: scraper.scrape_path_override lost platform_admin_read'; end if;
end $$;
