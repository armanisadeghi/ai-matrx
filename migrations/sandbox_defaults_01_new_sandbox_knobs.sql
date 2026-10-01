-- Sandbox defaults — what an explicit "New sandbox" starts with — move out of
-- the userPreferences jsonb blob (`preferences.sandbox`) into scoped knobs:
-- an organization may set its default and a person may choose their own,
-- per organization (settings-ladder rule 7; unified-settings REGISTER).
--
-- Readers: matrx-frontend SandboxPanel (chat "New sandbox") and aidream
-- services/sandboxes/ensure_default_sandbox.py (explicit provisioning).
-- Rendered by Settings › Devices & storage › Sandbox defaults and, because
-- they are filed under the Sandboxes taxonomy node, by the universal
-- configuration section beside infrastructure.sandbox.prestart_on_first_contact.
--
-- NOT here, on purpose: environment variables. The server stopped honouring
-- `preferences.sandbox.env` in vault Phase 5 (sandbox env comes ONLY from the
-- person's Vault), and a user-rung knob row is readable by every member of the
-- organization — never a home for values that are routinely secrets.
--
-- Moving existing values into user-rung overrides is a SEPARATE data
-- migration (sandbox_defaults_02_move_existing_values.sql), owner-applied.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label,
   description, set_by, basis, review_due, overridable_by, override_direction,
   ui, taxonomy_node_id, propagation)
select v.feature, v.key, v.value, v.value, v.value_type, v.allowed_values,
       v.label, v.description, 'agent', v.basis, current_date + 45,
       '{organization,user}'::text[], 'any', v.ui,
       (select taxonomy_node_id from platform.feature_knob
         where feature = 'infrastructure.sandbox' and key = 'prestart_on_first_contact'),
       'next_load'
from (values
  ('infrastructure.sandbox.defaults', 'template', '"slim"'::jsonb, 'enum',
   '["slim", "aidream", "bare"]'::jsonb,
   'Template',
   'What comes pre-installed in a sandbox you create.',
   'slim is what every explicit sandbox-create flow used (userPreferences slice default and aidream DEFAULT_TEMPLATE). bare is kept because 22 stored preference blobs carry it and the orchestrator still serves it.',
   jsonb_build_object('group', 'New sandbox', 'order', 1, 'control', 'select',
     'help', 'You can run anything in any template; this only decides what is pre-installed.',
     'options', jsonb_build_array(
       jsonb_build_object('value', 'slim', 'label', 'Slim — coding essentials (recommended)'),
       jsonb_build_object('value', 'aidream', 'label', 'AI Dream — includes the AI Dream server'),
       jsonb_build_object('value', 'bare', 'label', 'Full — includes a browser')))),
  ('infrastructure.sandbox.defaults', 'tier', '"ec2"'::jsonb, 'enum',
   '["ec2", "hosted"]'::jsonb,
   'Tier',
   'Hosted keeps files across restarts; EC2 is ephemeral.',
   'ec2 is the userPreferences slice default and aidream DEFAULT_TIER.',
   jsonb_build_object('group', 'New sandbox', 'order', 2, 'control', 'segmented',
     'options', jsonb_build_array(
       jsonb_build_object('value', 'ec2', 'label', 'EC2'),
       jsonb_build_object('value', 'hosted', 'label', 'Hosted')))),
  ('infrastructure.sandbox.defaults', 'auto_stop', '"service_default"'::jsonb, 'enum',
   '["service_default", "3600", "7200", "14400", "28800", "86400"]'::jsonb,
   'Auto-stop after',
   'How long a new sandbox stays up without activity.',
   'service_default reproduces the stored null ttl_seconds every one of the 24 stored preference blobs carries: the creating service applies its own lifetime.',
   jsonb_build_object('group', 'New sandbox', 'order', 3, 'control', 'select',
     'help', 'Activity keeps extending it while an agent is working.',
     'options', jsonb_build_array(
       jsonb_build_object('value', 'service_default', 'label', 'Service default'),
       jsonb_build_object('value', '3600', 'label', '1 hour'),
       jsonb_build_object('value', '7200', 'label', '2 hours'),
       jsonb_build_object('value', '14400', 'label', '4 hours'),
       jsonb_build_object('value', '28800', 'label', '8 hours'),
       jsonb_build_object('value', '86400', 'label', '24 hours')))),
  ('infrastructure.sandbox.defaults', 'git_repo', '""'::jsonb, 'string', null::jsonb,
   'Repository to clone',
   'An https:// repository cloned into ~/work at start.',
   'Empty: no stored preference blob names a repository.',
   jsonb_build_object('group', 'Repository', 'order', 10, 'control', 'text',
     'placeholder', 'https://github.com/your-org/your-repo.git',
     'help', 'Only https:// URLs; SSH (git@) is not supported yet.')),
  ('infrastructure.sandbox.defaults', 'git_branch', '""'::jsonb, 'string', null::jsonb,
   'Branch, tag or commit',
   'Empty means the repository''s default branch.',
   'Empty: the repository default branch.',
   jsonb_build_object('group', 'Repository', 'order', 11, 'control', 'text',
     'placeholder', 'main')),
  ('infrastructure.sandbox.defaults', 'auto_clone', 'false'::jsonb, 'boolean', null::jsonb,
   'Clone when the sandbox starts',
   'Off means the repository is only remembered.',
   'Off: opt-in, as the preference always was.',
   jsonb_build_object('group', 'Repository', 'order', 12, 'control', 'switch'))
) as v(feature, key, value, value_type, allowed_values, label, description, basis, ui)
on conflict (feature, key) do update
  set value_type = excluded.value_type,
      allowed_values = excluded.allowed_values,
      label = excluded.label,
      description = excluded.description,
      basis = excluded.basis,
      ui = excluded.ui,
      taxonomy_node_id = excluded.taxonomy_node_id,
      propagation = excluded.propagation,
      updated_at = now();
