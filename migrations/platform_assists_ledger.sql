-- ASSISTS — the platform-wide "AI assists everywhere" ledger.
--
-- One generic table for every system-noticed, one-click-actionable item:
-- deterministic code, background agents, sweeps, and stream events write rows;
-- the user sees chips; accepting one dispatches the typed `action` binding
-- through the frontend assist action registry (features/assists/).
--
-- System-of-record: /Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md
--
-- Canonical model: ENTITY (token `assist`), RLS via iam.apply_rls — never
-- hand-written. An assist is addressed to ONE person: producers set
-- created_by = the addressee (user_id mirrors it explicitly so service-role
-- producers and analytics never depend on stamping behavior).
--
-- No FK on entity_id: polymorphic by design (entity_type is the canonical
-- entity token). Lists always filter by (entity_type, entity_id).
--
-- Idempotent. Apply then: notify pgrst, 'reload schema'; pnpm db-types.

CREATE TABLE IF NOT EXISTS platform.assists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Addressee. Access keys on the user, never the active org.
  user_id         uuid NOT NULL,

  -- What it's about (canonical entity token + id), when it's about a record.
  entity_type     text,
  entity_id       uuid,

  -- Where to surface it: `<client>/<surface>` matching ui.ui_surface.name.
  -- NULL = global only (the dock).
  surface_name    text,

  -- Who noticed: deterministic code (zero tokens), an agent, a background
  -- sweep, or a stream event.
  source_kind     text NOT NULL DEFAULT 'deterministic'
                  CHECK (source_kind IN ('deterministic','agent','sweep','stream')),
  -- Stable producer id, `<domain>.<producer>` (e.g. content_ir.missing_component).
  source_key      text NOT NULL,

  title           text NOT NULL,
  body            text,
  -- The agent's "why" when source_kind='agent'/'sweep'.
  reasoning       text,
  confidence      real,

  -- The typed action binding dispatched by features/assists/runtime/
  -- assist-action-registry.ts. Shape: { kind: 'launch_agent'|'navigate'|
  -- 'surface_write'|..., ...params }. The registry is the ONE seam; an
  -- unknown kind fails loudly client-side.
  action          jsonb NOT NULL,

  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','dismissed','expired','superseded')),
  decided_at      timestamptz,
  decided_by      uuid,
  -- Receipt of what the accepted action did (agent run id, write result, ...).
  result          jsonb,

  -- Producers upsert by this key instead of stacking duplicate chips.
  dedupe_key      text,
  expires_at      timestamptz,
  suppressed_until timestamptz,
  priority        smallint NOT NULL DEFAULT 0,

  organization_id uuid,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         integer NOT NULL DEFAULT 1,
  -- personal-justified: an assist is addressed to exactly one person (a nudge
  -- about THEIR shapes/runs/pages) — the canonical 'personal' case.
  visibility      platform.visibility NOT NULL DEFAULT 'personal',
  deleted_at      timestamptz
);

-- One live pending chip per producer-noticed thing.
CREATE UNIQUE INDEX IF NOT EXISTS assists_dedupe_pending_key
  ON platform.assists (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status = 'pending' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assists_user_pending_idx
  ON platform.assists (user_id, priority DESC, created_at DESC)
  WHERE status = 'pending' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assists_surface_idx
  ON platform.assists (surface_name)
  WHERE surface_name IS NOT NULL AND status = 'pending' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assists_entity_idx
  ON platform.assists (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- Platform base-entity behaviour (updated_at/version bump + actor stamping).
DROP TRIGGER IF EXISTS _touch_row ON platform.assists;
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON platform.assists
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
DROP TRIGGER IF EXISTS _stamp_actor ON platform.assists;
CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON platform.assists
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

INSERT INTO platform.entity_types
  (token, schema_name, table_name, label, default_visibility,
   is_component, is_versioned, has_soft_delete, is_active, is_listed, category,
   title_column)
SELECT 'assist', 'platform', 'assists', 'Assist', 'personal',
       false, false, true, true, true, 'platform', 'title'
WHERE NOT EXISTS (
  SELECT 1 FROM platform.entity_types WHERE token = 'assist'
);

SELECT iam.apply_rls('platform', 'assists', 'assist', 'entity');

GRANT SELECT, INSERT, UPDATE, DELETE ON platform.assists TO authenticated;
GRANT ALL ON platform.assists TO service_role;

NOTIFY pgrst, 'reload schema';
