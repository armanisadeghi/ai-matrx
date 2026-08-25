-- MSR-26: register the content_ir_kind_instance -> web_site association pair
-- so aidream's Associations engine (aidream/services/associations.py) and the
-- client assoc_add RPC both recognize it. container_side='none' (access does
-- not convey through this edge — a human can revisit conveyance later at
-- /administration/relationships); label NULL is the default/only pairing.
INSERT INTO platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
VALUES (
  'content_ir_kind_instance', 'web_site', NULL, 'none', 'viewer'::permission_level, true,
  'MSR-26: bind a saved keyword-research artifact (content_ir.kind_instance) to the site it belongs to. Access does not convey through this edge (site membership already governs visibility of the site; the artifact keeps its own permissions).'
)
ON CONFLICT (source_type, target_type, COALESCE(label, ''))
DO UPDATE SET container_side = EXCLUDED.container_side,
              conveys_max    = EXCLUDED.conveys_max,
              is_active      = EXCLUDED.is_active,
              notes          = EXCLUDED.notes;
