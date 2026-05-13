-- ============================================================
-- Surface Values System — Phase 1 foundation
-- ============================================================
-- Introduces the `SurfaceValue` concept:
--   • Each surface declares (in code) a set of named runtime values it can
--     supply at execution time. Those declarations are mirrored into
--     `public.ui_surface_value` so binding UIs can pick from them.
--   • `agx_agent_surface` becomes a multi-scope binding (admin / user / org /
--     project / task) carrying an optional `value_mappings` JSONB that
--     describes how an agent's variables and context slots resolve from a
--     surface's values, with map types `surface_value` | `direct_value` |
--     `prompt_user` | `unmapped`.
--   • `tl_def_surface` gains an `arg_mappings` JSONB with the same shape
--     (minus `prompt_user`).
--
-- Conventions followed:
--   • Multi-scope columns + canonical 5-policy RLS block — mirrors
--     migrations/scope_columns_on_content_blocks.sql and
--     migrations/scope_rls_on_agx_shortcut.sql.
--   • Helpers `public.is_org_admin / is_org_member / is_platform_admin`
--     are assumed to exist (created in scope_columns_on_shortcut_categories.sql).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1.  public.ui_surface_value
-- ------------------------------------------------------------
-- Normalized "SurfaceValue declarations". Code is the source of truth;
-- this table is a sync target driven by the manifest registry. Read by
-- binding UIs (mapping editors, audit views). Writes are super-admin only.
CREATE TABLE IF NOT EXISTS public.ui_surface_value (
  surface_name        text NOT NULL,
  name                text NOT NULL,
  label               text NOT NULL DEFAULT '',
  description         text NOT NULL DEFAULT '',
  value_type          text NOT NULL DEFAULT 'string',
  always_available    boolean NOT NULL DEFAULT false,
  typical_char_count  integer NOT NULL DEFAULT 0,
  sort_order          integer NOT NULL DEFAULT 1000,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ui_surface_value_pkey PRIMARY KEY (surface_name, name),
  CONSTRAINT ui_surface_value_surface_fkey FOREIGN KEY (surface_name)
    REFERENCES public.ui_surface (name) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT ui_surface_value_type_chk CHECK (
    value_type IN ('string', 'number', 'boolean', 'object', 'array')
  ),
  CONSTRAINT ui_surface_value_name_chk CHECK (
    name ~ '^[a-z][a-z0-9_]*$'
  )
);

CREATE INDEX IF NOT EXISTS ui_surface_value_surface_idx
  ON public.ui_surface_value (surface_name, sort_order, name);

COMMENT ON TABLE public.ui_surface_value IS
  'Code-first, DB-mirrored declarations of named runtime values a surface can supply at execution time. Read by binding UIs; writes are admin-driven via the manifest sync endpoint.';
COMMENT ON COLUMN public.ui_surface_value.name IS
  'Lower-snake-case key, unique within the surface (e.g. selection, current_file, open_tabs).';
COMMENT ON COLUMN public.ui_surface_value.always_available IS
  'True when the surface guarantees a value every launch; false for things like selection that may be undefined.';
COMMENT ON COLUMN public.ui_surface_value.typical_char_count IS
  'Rough average char count after stringification. Used by binding UIs to warn on context-window risk.';

ALTER TABLE public.ui_surface_value ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ui_surface_value_read"          ON public.ui_surface_value;
DROP POLICY IF EXISTS "ui_surface_value_read_anon"     ON public.ui_surface_value;
DROP POLICY IF EXISTS "ui_surface_value_write_admin"   ON public.ui_surface_value;
DROP POLICY IF EXISTS "ui_surface_value_service_role"  ON public.ui_surface_value;

CREATE POLICY "ui_surface_value_read"
ON public.ui_surface_value
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "ui_surface_value_read_anon"
ON public.ui_surface_value
FOR SELECT
TO anon
USING (true);

CREATE POLICY "ui_surface_value_write_admin"
ON public.ui_surface_value
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "ui_surface_value_service_role"
ON public.ui_surface_value
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- updated_at trigger (idempotent definition)
CREATE OR REPLACE FUNCTION public.tg_ui_surface_value_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ui_surface_value_touch_updated_at ON public.ui_surface_value;
CREATE TRIGGER ui_surface_value_touch_updated_at
  BEFORE UPDATE ON public.ui_surface_value
  FOR EACH ROW EXECUTE FUNCTION public.tg_ui_surface_value_touch_updated_at();


-- ------------------------------------------------------------
-- 2.  agx_agent_surface — multi-scope + value_mappings
-- ------------------------------------------------------------
-- Currently 3 columns: (agent_id, surface_name, created_at), composite PK,
-- zero rows in production. Safe to restructure.

-- 2a. Synthetic surrogate id (needed once we allow the same (agent_id,
--     surface_name) at multiple scopes).
ALTER TABLE public.agx_agent_surface
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

-- 2b. Swap the PK from composite to surrogate.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agx_agent_surface_pkey'
  ) THEN
    ALTER TABLE public.agx_agent_surface DROP CONSTRAINT agx_agent_surface_pkey;
  END IF;
END $$;

ALTER TABLE public.agx_agent_surface
  ADD CONSTRAINT agx_agent_surface_pkey PRIMARY KEY (id);

-- 2c. Scope columns.
ALTER TABLE public.agx_agent_surface
  ADD COLUMN IF NOT EXISTS user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS project_id      uuid,
  ADD COLUMN IF NOT EXISTS task_id         uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agx_agent_surface_organization_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE public.agx_agent_surface
        ADD CONSTRAINT agx_agent_surface_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'organizations table not found — skipping FK for agx_agent_surface.organization_id';
    END;
  END IF;
END $$;

-- 2d. value_mappings JSONB.
ALTER TABLE public.agx_agent_surface
  ADD COLUMN IF NOT EXISTS value_mappings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.agx_agent_surface.value_mappings IS
  'Optional ValueMapping map for this (agent, surface, scope) binding. Keys are agent variable / context-slot names; values are discriminated unions { mapType: "surface_value" | "direct_value" | "prompt_user" | "unmapped", ... }. Keys with no entry auto-name-match against the surface''s declared SurfaceValues.';

-- 2e. Partial unique indexes — one tier per scope so the same (agent, surface)
--     can coexist at global / user / org / project / task scopes without
--     allowing duplicates inside a single tier.
CREATE UNIQUE INDEX IF NOT EXISTS agx_agent_surface_unique_global
  ON public.agx_agent_surface (agent_id, surface_name)
  WHERE user_id IS NULL AND organization_id IS NULL
    AND project_id IS NULL AND task_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agx_agent_surface_unique_user
  ON public.agx_agent_surface (agent_id, surface_name, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agx_agent_surface_unique_org
  ON public.agx_agent_surface (agent_id, surface_name, organization_id)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agx_agent_surface_unique_project
  ON public.agx_agent_surface (agent_id, surface_name, project_id)
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agx_agent_surface_unique_task
  ON public.agx_agent_surface (agent_id, surface_name, task_id)
  WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agx_agent_surface_user_id
  ON public.agx_agent_surface (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agx_agent_surface_org_id
  ON public.agx_agent_surface (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agx_agent_surface_agent
  ON public.agx_agent_surface (agent_id);

-- 2f. RLS — canonical five-policy block + service role.
ALTER TABLE public.agx_agent_surface ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agx_agent_surface_read"          ON public.agx_agent_surface;
DROP POLICY IF EXISTS "agx_agent_surface_read_anon"     ON public.agx_agent_surface;
DROP POLICY IF EXISTS "agx_agent_surface_insert"        ON public.agx_agent_surface;
DROP POLICY IF EXISTS "agx_agent_surface_update"        ON public.agx_agent_surface;
DROP POLICY IF EXISTS "agx_agent_surface_delete"        ON public.agx_agent_surface;
DROP POLICY IF EXISTS "agx_agent_surface_service_role"  ON public.agx_agent_surface;

CREATE POLICY "agx_agent_surface_read"
ON public.agx_agent_surface
FOR SELECT
TO authenticated
USING (
  (user_id IS NULL AND organization_id IS NULL AND project_id IS NULL AND task_id IS NULL)
  OR user_id = auth.uid()
  OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
);

CREATE POLICY "agx_agent_surface_read_anon"
ON public.agx_agent_surface
FOR SELECT
TO anon
USING (
  user_id IS NULL AND organization_id IS NULL
  AND project_id IS NULL AND task_id IS NULL
);

CREATE POLICY "agx_agent_surface_insert"
ON public.agx_agent_surface
FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = auth.uid()
    AND organization_id IS NULL
    AND project_id IS NULL
    AND task_id IS NULL)
  OR (organization_id IS NOT NULL
    AND user_id IS NULL
    AND public.is_org_admin(organization_id))
  OR (user_id IS NULL
    AND organization_id IS NULL
    AND project_id IS NULL
    AND task_id IS NULL
    AND public.is_platform_admin())
);

CREATE POLICY "agx_agent_surface_update"
ON public.agx_agent_surface
FOR UPDATE
TO authenticated
USING (
  (user_id = auth.uid())
  OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
  OR (user_id IS NULL AND organization_id IS NULL AND project_id IS NULL AND task_id IS NULL AND public.is_platform_admin())
)
WITH CHECK (
  (user_id = auth.uid())
  OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
  OR (user_id IS NULL AND organization_id IS NULL AND project_id IS NULL AND task_id IS NULL AND public.is_platform_admin())
);

CREATE POLICY "agx_agent_surface_delete"
ON public.agx_agent_surface
FOR DELETE
TO authenticated
USING (
  (user_id = auth.uid())
  OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
  OR (user_id IS NULL AND organization_id IS NULL AND project_id IS NULL AND task_id IS NULL AND public.is_platform_admin())
);

CREATE POLICY "agx_agent_surface_service_role"
ON public.agx_agent_surface
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ------------------------------------------------------------
-- 3.  tl_def_surface — arg_mappings JSONB only
-- ------------------------------------------------------------
-- Tool↔surface bindings stay admin-defined for v1; no scope columns yet.
-- If user/org-defined tool bindings become a requirement, run the same
-- scope migration on this table.
ALTER TABLE public.tl_def_surface
  ADD COLUMN IF NOT EXISTS arg_mappings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tl_def_surface.arg_mappings IS
  'Optional ValueMapping map for this (tool, surface) binding. Keys are tool arg names; the surface pre-fills these so the model never sees them. Same discriminated-union shape as agx_agent_surface.value_mappings, but mapType "prompt_user" is rejected by the resolver (tools fire mid-stream, no prompt window).';


COMMIT;
