-- lane: access-ladder T-21
-- Access ladder T-21 (2026-09-28): education.math_course_structure moves to Public. T-8 could not move it: as a
-- `system` table the policy generator demands created_by and organization_id, which a catalogue that belongs to
-- no organization and no person does not have. Its registry type is already `reference`, so it moves to the
-- reference variant (one read lane for every signed-in member, anon too when Public, read-only client grant,
-- server-written) in the same statement as its level; the class trigger regenerates the policies.
set local lock_timeout = '3s';
set local statement_timeout = '180s';

select iam.supersede_bespoke_policies('education', 'math_course_structure', array['Public can view course structure'], 'Bespoke world-read policy from before the access ladder; the reference variant''s member read lane and, as Public, its anon lane now do this job.');

update platform.entity_types
   set rls_variant = 'reference', default_list_scope = null, default_visibility = null,
       data_class = 'public'::platform.data_class,
       data_class_reason = 'Access ladder T-21 (2026-09-28): Public per the independent table review (common-docs/projects/access-ladder/table-review.md) — a platform catalogue everyone reads. Registered as a reference catalogue: it belongs to no organization and no person, every reader may open it, and only server doors write it.'
 where token = 'math_course_structure' and is_active;

do $$ begin
  if not exists (select 1 from platform.entity_types where token = 'math_course_structure' and rls_variant = 'reference' and data_class = 'public'::platform.data_class) then raise exception 'T-21: education.math_course_structure did not land'; end if;
  if not exists (select 1 from pg_policy where polrelid = 'education.math_course_structure'::regclass and polname = 'ref_all_members_read') then raise exception 'T-21: education.math_course_structure has no member read lane'; end if;
  if not exists (select 1 from pg_policy where polrelid = 'education.math_course_structure'::regclass and polname = 'platform_admin_read') then raise exception 'T-21: education.math_course_structure lost platform_admin_read'; end if;
end $$;
