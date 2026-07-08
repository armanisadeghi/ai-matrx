-- The new engage tables need table-level privileges for the authenticated role.
-- Canonical RLS (iam.apply_rls) gates ROWS but does NOT grant table privileges,
-- so authenticated saw "permission denied for table". Mirrors education.fc_set.
-- Applied + verified live 2026-07-07.
GRANT SELECT, INSERT, UPDATE, DELETE ON education.game_room TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON education.game_result TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON education.game_badge TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON education.league_membership TO authenticated;
