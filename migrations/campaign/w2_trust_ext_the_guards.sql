-- target: branch,production
-- additive: yes
-- seeds-guards: yes
--
-- W2-TRUST and W2-EXT — the two guard rows their files are headed with.
-- A guard has to exist in platform.feature_knob before the runner will read it, so the register
-- row comes first, in its own file, and the lanes' files land behind it. Both resolve OFF.
--
-- What OFF means here, stated once: neither knob switches off a CHECK. Namespacing, publisher
-- verification and the world-lane admission that a publish binding stands on are checks, and a
-- check somebody can turn off is not a check. What these hold closed is the LANE — while they
-- are false, iam.publish_to_world and iam.publish_binding_create refuse everything by name,
-- which is exactly the answer the platform gave before this campaign, because nothing has ever
-- been published to the world and no public address has ever resolved.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description, set_by, basis)
values
  ('custom', 'world_publish_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'The world lane accepts publishes',
   'While false, iam.publish_to_world refuses every publish by name. It does not switch off '
   'namespacing or publisher verification; those are checks, not features, and are never '
   'optional (VIS-N-7).',
   'agent', 'Unified data campaign, W2-TRUST, 2026-09-18.'),
  ('custom', 'external_principal_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'External principals and publish bindings are live',
   'While false, iam.publish_binding_create refuses every binding by name. It does not switch '
   'off the world-lane admission a binding stands on, which is a check and never optional '
   '(VIS-32).',
   'agent', 'Unified data campaign, W2-EXT, 2026-09-18.')
on conflict (feature, key) do nothing;
