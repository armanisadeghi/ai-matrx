-- lane: access-ladder T-21
-- Access ladder T-21 (2026-09-28): platform.feature_knob moves to Public. T-8 could not move it: as a
-- `system` table the policy generator demands created_by and organization_id, which a catalogue that belongs to
-- no organization and no person does not have. Its registry type is already `reference`, so it moves to the
-- reference variant (one read lane for every signed-in member, anon too when Public, read-only client grant,
-- server-written) in the same statement as its level; the class trigger regenerates the policies.
set local lock_timeout = '3s';
set local statement_timeout = '180s';

select iam.supersede_bespoke_policies('platform', 'feature_knob', array['feature_knob_read_authenticated', 'feature_knob_no_write_select', 'feature_knob_client_insert_refused', 'feature_knob_client_update_refused', 'feature_knob_client_delete_refused', 'platform_admin_insert_only', 'platform_admin_update_only', 'platform_admin_delete_only'], 'Bespoke member reads, client-write refusals and admin-only writes from before the access ladder. The reference variant''s read lanes now do the reads, and its read-only client grant closes client writes; knobs change only through the knob write doors.');

update platform.entity_types
   set rls_variant = 'reference', default_list_scope = null, default_visibility = null,
       data_class = 'public'::platform.data_class,
       data_class_reason = 'Access ladder T-21 (2026-09-28): Public per the independent table review (common-docs/projects/access-ladder/table-review.md) — a platform catalogue everyone reads (the system defaults behind every knob). Registered as a reference catalogue: it belongs to no organization and no person, every reader may open it, and only server doors write it.'
 where token = 'feature_knob' and is_active;

do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'feature_knob' and rls_variant = 'reference' and data_class = 'public'::platform.data_class) then raise exception 'T-21: platform.feature_knob did not land'; end if;
  if not exists (select 1 from pg_policy where polrelid = 'platform.feature_knob'::regclass and polname = 'ref_all_members_read') then raise exception 'T-21: platform.feature_knob has no member read lane'; end if;
  if not exists (select 1 from pg_policy where polrelid = 'platform.feature_knob'::regclass and polname = 'platform_admin_read') then raise exception 'T-21: platform.feature_knob lost platform_admin_read'; end if;
end $$;
