-- access_ladder_t13_23q_udt_dataset_template_fields_follow_their_template.sql
-- chair-step: one table. Regenerates this child from its parent template and drops its hand-written read and write policies through iam.supersede_bespoke_policies.
--
-- T-13 2.3d (common-docs/policies/access-ladder.md: children inherit their parent only; owner-session ruling 2026-09-28).
-- workbench.udt_dataset_template_fields: reads were template-organization members, writes organization admins;
-- now the template's viewers read and its editors write (ruled).

set local lock_timeout = '2s';

select iam.apply_rls('workbench', 'udt_dataset_template_fields', 'udt_dataset_template_fields', 'component');

select iam.supersede_bespoke_policies('workbench', 'udt_dataset_template_fields', array['udt_dataset_template_fields_select', 'udt_dataset_template_fields_insert', 'udt_dataset_template_fields_update', 'udt_dataset_template_fields_delete'],
  'T-13 2.3d: hand-written child policies replaced by the generated parent-derived set (owner ruling 2026-09-28: children inherit their parent); proved per person live before and after.');
