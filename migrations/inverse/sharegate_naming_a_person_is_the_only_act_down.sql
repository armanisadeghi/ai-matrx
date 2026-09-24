-- chair-step: SHARE-GATE-OFF's inverse — it puts `custom/external_principal_enabled` back to false at the platform rung (value and default), restores its W2-EXT label and description and its PORTAL basis, and turns back to false exactly the organization overrides the up superseded (the rows whose note starts with the up's marker), restoring each one's earlier note. Every organization that never set the knob goes back to "sharing outside is turned off"; overrides that were already true before the up are not touched. Each reverted override is audited by `platform._knob_override_audit_tg`; nothing is deleted.
-- lane: SHARE-GATE-OFF
-- lock: platform

update platform.knob_override
   set value = 'false'::jsonb,
       set_note = nullif(substr(set_note, strpos(set_note, ' | before: ') + length(' | before: ')), ''),
       updated_at = now()
 where feature = 'custom' and key = 'external_principal_enabled'
   and value = 'true'::jsonb
   and set_note like 'SHARE-GATE-OFF 2026-09-24:%| before: %';

update platform.feature_knob
   set value = 'false'::jsonb,
       default_value = 'false'::jsonb,
       label = 'External principals and publish bindings are live',
       description = 'While false, iam.publish_binding_create refuses every binding by name. It does not switch off the world-lane admission a binding stands on, which is a check and never optional (VIS-32).',
       basis = 'PORTAL (PRODUCTS row 2, 2026-09-20): a portal is the consumer of the external-principal lane, and whether outsiders may sign in is one organization''s answer about its own data. custom.portal_declare writes the override with the portal''s title in the note. The platform default stays false.',
       updated_at = now()
 where feature = 'custom' and key = 'external_principal_enabled';
