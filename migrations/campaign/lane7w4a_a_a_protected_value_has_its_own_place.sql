-- chair-step: NEEDS ARMAN WATCHING (CHAIR-GUIDANCE § What needs Arman watching): this file CREATES TWO
-- TABLES (custom.entity_protected_value, custom.entity_protected_value_version: every
-- client role revoked; row security off on purpose, see § 2) and adds one locked platform knob row (custom/protected_field_rules, INSERT).
-- No ALTER of an existing table, no strong lock on a live table, no grant to any client role.
-- Its inverse drops both tables (refused while either holds a row) and the knob row.
-- ORDER (production): lane7sec_r2_an_archived_field_never_blocks_a_row.sql, then
-- lane7w2_a_a_choice_on_a_standard_row_holds_its_key.sql (re-based on r2), then
-- lane7w4a_a_a_protected_value_has_its_own_place.sql, then lane7w4a_b_a_protected_field_is_read_by_the_people_it_names.sql, then
-- lane7w4a_c_the_people_a_field_names_reach_its_values.sql. Based on production's bodies (custom._entity_custom_fields_guard e29bf768…) plus SEC r2
-- plus W2's Choice-key lines; onehome_d2 (pending, fragment-based) applies before or after this
-- unchanged. Body edits in file b are FRAGMENT edits on the live body (each anchor asserted present
-- exactly once, refused by name otherwise), so they land on r2+W2 with or without onehome_d2 and
-- with or without W3a/W5 — the clone proof ran on prod+r2+W2+onehome_d2+W3a+W5.
--
-- LANE 7 · STANDARD-TABLES · W4a (a) — A PROTECTED VALUE HAS ITS OWN PLACE, BESIDE THE ROW.
set local lock_timeout = '3s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. WHICH STANDARD TABLES MAY KEEP A PROTECTED FIELD, AND WHO DECIDES ON EACH ROW.
-- A platform fact, never an organization's (an organization naming a function here would be
-- running code by name), so the knob is locked: overridable by nobody. A token not named here
-- cannot hold a protected field and the declare door says so. Each entry names:
--   rule     the one function that answers read / edit / query for a row (the field's own rule:
--            no share, platform, creator, owner or organization lane is asked anywhere else);
--   arm      the function that opens the table's own write lane for the protect door (HR's
--            tables refuse every write that is not armed — SPEC-ACCESS law 2);
--   readers  the readers a new protected field gets when it names none (the chair's words:
--            [{field, level}], plus the `capability` reader kind — CHAIR RULING R1).
-- The four HR tokens whose rows point at a person (design W45 4b "the subject"): an employee
-- row is its own subject; a position or training assignment reaches it through its employment;
-- a candidate only once hired. hr_requisition has no person, so it is not here.
-- ─────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, label, description, set_by, basis, review_due,
   overridable_by, override_direction, propagation, public_read, delegable, not_delegable_reason)
SELECT 'custom', 'protected_field_rules', v, v, 'json',
       'Standard tables that can keep a field only named people read',
       'Registry tokens whose custom fields may be protected: each names the rule that decides who reads or edits a protected value on a row, the function that opens the table''s write lane, and the readers a new protected field gets by default.',
       'agent',
       'Lane 7 STANDARD-TABLES W4a, 2026-10-02 (design DESIGN-STANDARD-TABLES-W45 rev 3, wave 4a): HR''s custom fields are read today only by the employee and HR admins (hr._l1_viewer self / hr_admin) and edited only through identity.write; a protected field keeps exactly that audience.',
       date '2026-12-31', '{}'::text[], 'any', 'instant', false, false,
       'A rule here is a function the database runs by name for every read of a protected value; only the platform may name one.'
  FROM (SELECT jsonb_build_object(
          'hr_employee', e, 'hr_position_assignment', e, 'hr_training_assignment', e, 'hr_candidate', e) AS v
          FROM (SELECT jsonb_build_object(
                  'rule', 'hr.custom_field_access',
                  'arm', 'hr.arm_write',
                  'readers', jsonb_build_array(
                    jsonb_build_object('field', 'subject'),
                    jsonb_build_object('capability', 'hr.identity.read'),
                    jsonb_build_object('capability', 'hr.working_record.write'),
                    jsonb_build_object('capability', 'hr.identity.write', 'level', 'editor'))) AS e) x) k
ON CONFLICT (feature, key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. WHERE A PROTECTED VALUE LIVES: beside the row, never in it. No client role holds ANY privilege
-- on it (revoked below): only the SECURITY DEFINER doors read or write it, and each asks the field's
-- rule. Row security is deliberately NOT enabled: enabling it makes platform._admin_read_follows_rls
-- add a platform-admin read policy (an admin lane the field rule forbids), and that policy statement
-- takes Supabase's sign-in freeze (ACCESS EXCLUSIVE on auth.users and 22 more) on production.
-- Its own history: every write, clear and move is a version, read only through the same rule.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom.entity_protected_value (
  organization_id uuid        NOT NULL,
  table_token     text        NOT NULL,
  row_id          uuid        NOT NULL,
  field_id        uuid        NOT NULL,
  value           jsonb       NOT NULL,
  envelope        jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  PRIMARY KEY (table_token, row_id, field_id)
);
CREATE INDEX IF NOT EXISTS entity_protected_value_field_idx ON custom.entity_protected_value (field_id);
CREATE INDEX IF NOT EXISTS entity_protected_value_org_idx ON custom.entity_protected_value (organization_id, table_token);
REVOKE ALL ON custom.entity_protected_value FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE custom.entity_protected_value IS
  'LANE7-W4A: the values of protected custom fields of standard rows (custom.field_is_protected). Never in the row''s custom_fields; read and written only through custom.field_access''s rule.';

CREATE TABLE IF NOT EXISTS custom.entity_protected_value_version (
  id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id    uuid        NOT NULL,
  table_token        text        NOT NULL,
  row_id             uuid        NOT NULL,
  field_id           uuid        NOT NULL,
  value              jsonb,
  envelope           jsonb,
  operation          text        NOT NULL CHECK (operation IN ('write', 'clear', 'protect_field', 'protect_field_history')),
  history_version_id bigint,
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  actor_id           uuid
);
CREATE INDEX IF NOT EXISTS entity_protected_value_version_row_idx
  ON custom.entity_protected_value_version (table_token, row_id, field_id, id);
REVOKE ALL ON custom.entity_protected_value_version FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE custom.entity_protected_value_version IS
  'LANE7-W4A: every version of a protected value (writes, clears, and the copies the protect door moved out of rows and out of history.row_versions). Read only through custom.field_access''s rule.';

