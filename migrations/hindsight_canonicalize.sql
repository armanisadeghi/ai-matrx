-- Hindsight — bring the four tables onto the canonical entity system.
--
-- WHY: the hindsight tables were created 2026-08-11 via the Supabase MCP without
-- going through `platform.create_entity_table`. They were registered in
-- `platform.shareable_resource_registry` but NOT in `platform.entity_types` —
-- the sharing registry answers "how do I share type T", the entity registry
-- answers "what is T". Registering the first without the second leaves the
-- tables invisible to `iam.has_access`, to the access gate, and to the generated
-- types. This is the exact mistake `/policies/database-changeover-doctrine.md`
-- §9 exists to prevent.
--
-- SHAPE: `enrollment` is the entity (it owns org + owner + visibility).
-- `review`, `finding`, `replay` are COMPONENTS — each is a child of exactly one
-- enrollment, so their access defers to the parent and they carry the full base
-- contract MINUS `visibility` (verified against the certified components
-- education.fc_detail / assessment_item / content_ir.kind_surface / crm.address).
--
-- NOT DONE HERE, deliberately: the shareable-registry row is REMOVED rather than
-- completed. `/hindsight/*` is admin-only (`_require_admin` on every route) and
-- nobody shares an enrollment — the row was the original error, not a missing half.
--
-- Idempotent. Row counts at apply time: enrollment 9, review 17, finding 42, replay 30.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. enrollment — visibility becomes the canonical enum (the "free-text kill")
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='hindsight' AND table_name='enrollment'
               AND column_name='visibility' AND udt_schema <> 'platform') THEN
    ALTER TABLE hindsight.enrollment ALTER COLUMN visibility DROP DEFAULT;
    ALTER TABLE hindsight.enrollment
      ALTER COLUMN visibility TYPE platform.visibility
      USING visibility::text::platform.visibility;
    ALTER TABLE hindsight.enrollment
      ALTER COLUMN visibility SET DEFAULT 'personal'::platform.visibility;
    ALTER TABLE hindsight.enrollment ALTER COLUMN visibility SET NOT NULL;
  END IF;
END $$;

ALTER TABLE hindsight.enrollment ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. review / finding / replay — the component base contract (no visibility)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['review','finding','replay'] LOOP
    EXECUTE format('ALTER TABLE hindsight.%I ADD COLUMN IF NOT EXISTS organization_id uuid', t);
    EXECUTE format('ALTER TABLE hindsight.%I ADD COLUMN IF NOT EXISTS created_by uuid', t);
    EXECUTE format('ALTER TABLE hindsight.%I ADD COLUMN IF NOT EXISTS updated_by uuid', t);
    EXECUTE format('ALTER TABLE hindsight.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
    EXECUTE format('ALTER TABLE hindsight.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', t);
    EXECUTE format('ALTER TABLE hindsight.%I ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT ''{}''::jsonb', t);

    -- Backfill org + owner from the owning enrollment. Every child carries
    -- enrollment_id NOT NULL, so this reaches every row.
    EXECUTE format(
      'UPDATE hindsight.%I c SET organization_id = e.organization_id, created_by = COALESCE(c.created_by, e.created_by, e.user_id)
         FROM hindsight.enrollment e WHERE e.id = c.enrollment_id AND c.organization_id IS NULL', t);

    EXECUTE format('ALTER TABLE hindsight.%I ALTER COLUMN organization_id SET NOT NULL', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Base FK constraints (all four tables)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['enrollment','review','finding','replay'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t||'_organization_id_fkey'
                     AND conrelid = ('hindsight.'||quote_ident(t))::regclass) THEN
      EXECUTE format('ALTER TABLE hindsight.%I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES iam.organizations(id)', t, t||'_organization_id_fkey');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t||'_created_by_fkey'
                     AND conrelid = ('hindsight.'||quote_ident(t))::regclass) THEN
      EXECUTE format('ALTER TABLE hindsight.%I ADD CONSTRAINT %I FOREIGN KEY (created_by) REFERENCES auth.users(id)', t, t||'_created_by_fkey');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t||'_updated_by_fkey'
                     AND conrelid = ('hindsight.'||quote_ident(t))::regclass) THEN
      EXECUTE format('ALTER TABLE hindsight.%I ADD CONSTRAINT %I FOREIGN KEY (updated_by) REFERENCES auth.users(id)', t, t||'_updated_by_fkey');
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The canonical trigger trio
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['enrollment','review','finding','replay'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS _stamp_actor ON hindsight.%I', t);
    EXECUTE format('CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON hindsight.%I FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS _touch_row ON hindsight.%I', t);
    EXECUTE format('CREATE TRIGGER _touch_row BEFORE UPDATE ON hindsight.%I FOR EACH ROW EXECUTE FUNCTION platform._touch_row()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS _stamp_org_default ON hindsight.%I', t);
    EXECUTE format('CREATE TRIGGER _stamp_org_default BEFORE INSERT ON hindsight.%I FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default()', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Register in the ENTITY registry — the step that was missed
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO platform.entity_types
  (token, schema_name, table_name, label, is_versioned, has_soft_delete, is_component, is_listed, is_active, default_visibility, title_column, notes)
VALUES
  ('hindsight_enrollment','hindsight','enrollment','Hindsight Enrollment', false, true,  false, false, true, 'personal'::platform.visibility, 'display_name',
   'Continuous-review enrollment. Admin-only feature; deliberately NOT in shareable_resource_registry.'),
  ('hindsight_review','hindsight','review','Hindsight Review',            false, false, true,  false, true, NULL, NULL, 'Component of hindsight_enrollment.'),
  ('hindsight_finding','hindsight','finding','Hindsight Finding',          false, false, true,  false, true, NULL, NULL, 'Component of hindsight_enrollment.'),
  ('hindsight_replay','hindsight','replay','Hindsight Replay',             false, false, true,  false, true, NULL, NULL, 'Component of hindsight_enrollment.')
ON CONFLICT (token) DO UPDATE SET
  schema_name = EXCLUDED.schema_name, table_name = EXCLUDED.table_name, label = EXCLUDED.label,
  is_component = EXCLUDED.is_component, has_soft_delete = EXCLUDED.has_soft_delete,
  is_active = true, notes = EXCLUDED.notes;

-- Composition edges: every child resolves access through its enrollment.
INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
VALUES ('hindsight_review','hindsight_enrollment','enrollment_id','composition'),
       ('hindsight_finding','hindsight_enrollment','enrollment_id','composition'),
       ('hindsight_replay','hindsight_enrollment','enrollment_id','composition')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Canonical RLS — replaces the four bespoke `*_owner` policies
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS enrollment_owner ON hindsight.enrollment;
DROP POLICY IF EXISTS review_owner     ON hindsight.review;
DROP POLICY IF EXISTS finding_owner    ON hindsight.finding;
DROP POLICY IF EXISTS replay_owner     ON hindsight.replay;

SELECT iam.apply_rls('hindsight','enrollment','hindsight_enrollment','entity');
SELECT iam.apply_rls('hindsight','review','hindsight_review','component');
SELECT iam.apply_rls('hindsight','finding','hindsight_finding','component');
SELECT iam.apply_rls('hindsight','replay','hindsight_replay','component');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Remove the wrong sharing registration
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM platform.shareable_resource_registry WHERE resource_type = 'hindsight_enrollment';
