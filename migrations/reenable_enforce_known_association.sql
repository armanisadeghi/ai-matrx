-- Re-enable the association registry gate.
-- APPLIED LIVE 2026-07-24 via Supabase MCP (migration: reenable_enforce_known_association).
--
-- trg_associations_enforce_known was found DISABLED. The association registry is
-- only real if unknown pairs are rejected. Two legacy pairs existed in data but
-- not in the registry; register them retroactively (inert), then re-enable the gate.
INSERT INTO platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes) VALUES
('fc_set', 'conversation', NULL, 'none', 'viewer', true, 'Registered retroactively 2026-07-24 when re-enabling trg_associations_enforce_known: 1 pre-existing data row.'),
('task',   'thread',       NULL, 'none', 'viewer', true, 'Registered retroactively 2026-07-24 when re-enabling trg_associations_enforce_known: 1 pre-existing data row.')
ON CONFLICT (source_type, target_type) DO NOTHING;

ALTER TABLE platform.associations ENABLE TRIGGER trg_associations_enforce_known;
