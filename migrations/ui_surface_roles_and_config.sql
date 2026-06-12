-- Surfaces Phase 3 — agent roles + centralized scoped surface config.
--
-- Three tables:
--
--   1. ui_surface_agent_role — code-first mirror of manifest `agentRoles`
--      (synced like ui_surface_value). A role is a named agent position a
--      surface uses: cleanup's "clean" + "custom_slot", scribe's "assistant".
--      The manifest's defaultAgentId is the platform default; runtime
--      overrides are global-scope rows in ui_surface_agent_pref.
--
--   2. ui_surface_agent_pref — who fills a role, per scope. kind='selection'
--      fills the role (one per position per tier); kind='roster_item' only
--      adds an agent to the role's picker. Scope columns follow the
--      agx_agent_surface house pattern (nullable user/org + reserved
--      scope_id → ctx_scopes, partial unique indexes per tier). project/task
--      columns deliberately omitted — ctx scopes are the strategic scoping
--      mechanism.
--
--   3. ui_surface_config — generic namespaced scoped JSONB config
--      (dictionary, session_defaults, tools, …). Namespaces are declared in
--      code (features/surfaces/config/namespace-registry.ts); adding one is
--      a TS module + manifest line, zero SQL. This is the table that kills
--      per-feature settings-table sprawl.
--
-- Resolution precedence (resolved client-side in surface-config.service.ts):
--   manifest default → global row → org rows (BY MEMBERSHIP) → [scope_id,
--   reserved] → user row → explicit per-session choice (feature-owned).

BEGIN;

-- ============================================================================
-- 1. ui_surface_agent_role
-- ============================================================================
CREATE TABLE public.ui_surface_agent_role (
  surface_name     text NOT NULL REFERENCES public.ui_surface(name)
                     ON UPDATE CASCADE ON DELETE CASCADE,
  name             text NOT NULL,
  label            text NOT NULL DEFAULT '',
  description      text NOT NULL DEFAULT '',
  kind             text NOT NULL DEFAULT 'single' CHECK (kind IN ('single','multi')),
  default_agent_id uuid REFERENCES public.agx_agent(id) ON DELETE SET NULL,
  max_agents       integer NOT NULL DEFAULT 1 CHECK (max_agents >= 1),
  allow_custom     boolean NOT NULL DEFAULT true,
  auto_run         text NOT NULL DEFAULT 'user-choice'
                     CHECK (auto_run IN ('always','never','user-choice')),
  sort_order       integer NOT NULL DEFAULT 1000,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ui_surface_agent_role_pkey PRIMARY KEY (surface_name, name),
  CONSTRAINT ui_surface_agent_role_name_chk CHECK (name ~ '^[a-z][a-z0-9_]*$')
);

ALTER TABLE public.ui_surface_agent_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY ui_surface_agent_role_read ON public.ui_surface_agent_role
  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY ui_surface_agent_role_write ON public.ui_surface_agent_role
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
CREATE POLICY ui_surface_agent_role_service_role ON public.ui_surface_agent_role
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. ui_surface_agent_pref
-- ============================================================================
CREATE TABLE public.ui_surface_agent_pref (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface_name    text NOT NULL,
  role_name       text NOT NULL,
  agent_id        uuid NOT NULL REFERENCES public.agx_agent(id) ON DELETE CASCADE,
  kind            text NOT NULL DEFAULT 'selection'
                    CHECK (kind IN ('selection','roster_item')),
  -- multi roles: which slot position the selection fills. single roles: 0.
  position        integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  -- per-entry config (label, source raw|clean, autoRun, docKind, displayName…)
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- scope tier: exactly one non-null, or all null = global (platform override)
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope_id        uuid REFERENCES public.ctx_scopes(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- A removed role declaration (manifest sync deleteStale) sweeps its prefs.
  CONSTRAINT ui_surface_agent_pref_role_fkey
    FOREIGN KEY (surface_name, role_name)
    REFERENCES public.ui_surface_agent_role(surface_name, name)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT ui_surface_agent_pref_one_scope CHECK (
    (CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN organization_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN scope_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);

-- Selections: one agent per (surface, role, position) per scope tier.
CREATE UNIQUE INDEX ui_surface_agent_pref_sel_global
  ON public.ui_surface_agent_pref (surface_name, role_name, position)
  WHERE kind = 'selection' AND user_id IS NULL AND organization_id IS NULL AND scope_id IS NULL;
CREATE UNIQUE INDEX ui_surface_agent_pref_sel_user
  ON public.ui_surface_agent_pref (surface_name, role_name, position, user_id)
  WHERE kind = 'selection' AND user_id IS NOT NULL;
CREATE UNIQUE INDEX ui_surface_agent_pref_sel_org
  ON public.ui_surface_agent_pref (surface_name, role_name, position, organization_id)
  WHERE kind = 'selection' AND organization_id IS NOT NULL;
CREATE UNIQUE INDEX ui_surface_agent_pref_sel_scope
  ON public.ui_surface_agent_pref (surface_name, role_name, position, scope_id)
  WHERE kind = 'selection' AND scope_id IS NOT NULL;
-- Roster items: one row per agent per (surface, role) per scope tier.
CREATE UNIQUE INDEX ui_surface_agent_pref_roster_global
  ON public.ui_surface_agent_pref (surface_name, role_name, agent_id)
  WHERE kind = 'roster_item' AND user_id IS NULL AND organization_id IS NULL AND scope_id IS NULL;
CREATE UNIQUE INDEX ui_surface_agent_pref_roster_user
  ON public.ui_surface_agent_pref (surface_name, role_name, agent_id, user_id)
  WHERE kind = 'roster_item' AND user_id IS NOT NULL;
CREATE UNIQUE INDEX ui_surface_agent_pref_roster_org
  ON public.ui_surface_agent_pref (surface_name, role_name, agent_id, organization_id)
  WHERE kind = 'roster_item' AND organization_id IS NOT NULL;
CREATE UNIQUE INDEX ui_surface_agent_pref_roster_scope
  ON public.ui_surface_agent_pref (surface_name, role_name, agent_id, scope_id)
  WHERE kind = 'roster_item' AND scope_id IS NOT NULL;

CREATE INDEX idx_ui_surface_agent_pref_agent
  ON public.ui_surface_agent_pref (agent_id);
CREATE INDEX idx_ui_surface_agent_pref_user
  ON public.ui_surface_agent_pref (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_ui_surface_agent_pref_org
  ON public.ui_surface_agent_pref (organization_id) WHERE organization_id IS NOT NULL;

ALTER TABLE public.ui_surface_agent_pref ENABLE ROW LEVEL SECURITY;

-- Read: global rows, own rows, member-org rows, member-org-owned ctx scopes.
CREATE POLICY ui_surface_agent_pref_read ON public.ui_surface_agent_pref
  FOR SELECT TO authenticated USING (
    (user_id IS NULL AND organization_id IS NULL AND scope_id IS NULL)
    OR user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR (scope_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.ctx_scopes s
          JOIN public.ctx_scope_types st ON st.id = s.scope_type_id
          WHERE s.id = scope_id AND public.is_org_member(st.organization_id)))
  );
CREATE POLICY ui_surface_agent_pref_read_anon ON public.ui_surface_agent_pref
  FOR SELECT TO anon USING (
    user_id IS NULL AND organization_id IS NULL AND scope_id IS NULL
  );
-- Writes: own user rows; org rows by org admins; ctx-scope rows by the
-- owning org's admins; global rows by platform admins.
CREATE POLICY ui_surface_agent_pref_insert ON public.ui_surface_agent_pref
  FOR INSERT TO authenticated WITH CHECK (
    (user_id = auth.uid() AND organization_id IS NULL AND scope_id IS NULL)
    OR (user_id IS NULL AND organization_id IS NOT NULL AND scope_id IS NULL
        AND public.is_org_admin(organization_id))
    OR (user_id IS NULL AND organization_id IS NULL AND scope_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.ctx_scopes s
          JOIN public.ctx_scope_types st ON st.id = s.scope_type_id
          WHERE s.id = scope_id AND public.is_org_admin(st.organization_id)))
    OR (user_id IS NULL AND organization_id IS NULL AND scope_id IS NULL
        AND public.is_platform_admin())
  );
CREATE POLICY ui_surface_agent_pref_update ON public.ui_surface_agent_pref
  FOR UPDATE TO authenticated USING (
    (user_id = auth.uid())
    OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
    OR (scope_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.ctx_scopes s
          JOIN public.ctx_scope_types st ON st.id = s.scope_type_id
          WHERE s.id = scope_id AND public.is_org_admin(st.organization_id)))
    OR (user_id IS NULL AND organization_id IS NULL AND scope_id IS NULL
        AND public.is_platform_admin())
  );
CREATE POLICY ui_surface_agent_pref_delete ON public.ui_surface_agent_pref
  FOR DELETE TO authenticated USING (
    (user_id = auth.uid())
    OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
    OR (scope_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.ctx_scopes s
          JOIN public.ctx_scope_types st ON st.id = s.scope_type_id
          WHERE s.id = scope_id AND public.is_org_admin(st.organization_id)))
    OR (user_id IS NULL AND organization_id IS NULL AND scope_id IS NULL
        AND public.is_platform_admin())
  );
CREATE POLICY ui_surface_agent_pref_service_role ON public.ui_surface_agent_pref
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. ui_surface_config
-- ============================================================================
CREATE TABLE public.ui_surface_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface_name    text NOT NULL REFERENCES public.ui_surface(name)
                    ON UPDATE CASCADE ON DELETE CASCADE,
  namespace       text NOT NULL CHECK (namespace ~ '^[a-z][a-z0-9_.]*$'),
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope_id        uuid REFERENCES public.ctx_scopes(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ui_surface_config_one_scope CHECK (
    (CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN organization_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN scope_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);

CREATE UNIQUE INDEX ui_surface_config_unique_global
  ON public.ui_surface_config (surface_name, namespace)
  WHERE user_id IS NULL AND organization_id IS NULL AND scope_id IS NULL;
CREATE UNIQUE INDEX ui_surface_config_unique_user
  ON public.ui_surface_config (surface_name, namespace, user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX ui_surface_config_unique_org
  ON public.ui_surface_config (surface_name, namespace, organization_id)
  WHERE organization_id IS NOT NULL;
CREATE UNIQUE INDEX ui_surface_config_unique_scope
  ON public.ui_surface_config (surface_name, namespace, scope_id)
  WHERE scope_id IS NOT NULL;
CREATE INDEX idx_ui_surface_config_user
  ON public.ui_surface_config (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_ui_surface_config_org
  ON public.ui_surface_config (organization_id) WHERE organization_id IS NOT NULL;

ALTER TABLE public.ui_surface_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY ui_surface_config_read ON public.ui_surface_config
  FOR SELECT TO authenticated USING (
    (user_id IS NULL AND organization_id IS NULL AND scope_id IS NULL)
    OR user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    OR (scope_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.ctx_scopes s
          JOIN public.ctx_scope_types st ON st.id = s.scope_type_id
          WHERE s.id = scope_id AND public.is_org_member(st.organization_id)))
  );
CREATE POLICY ui_surface_config_read_anon ON public.ui_surface_config
  FOR SELECT TO anon USING (
    user_id IS NULL AND organization_id IS NULL AND scope_id IS NULL
  );
CREATE POLICY ui_surface_config_insert ON public.ui_surface_config
  FOR INSERT TO authenticated WITH CHECK (
    (user_id = auth.uid() AND organization_id IS NULL AND scope_id IS NULL)
    OR (user_id IS NULL AND organization_id IS NOT NULL AND scope_id IS NULL
        AND public.is_org_admin(organization_id))
    OR (user_id IS NULL AND organization_id IS NULL AND scope_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.ctx_scopes s
          JOIN public.ctx_scope_types st ON st.id = s.scope_type_id
          WHERE s.id = scope_id AND public.is_org_admin(st.organization_id)))
    OR (user_id IS NULL AND organization_id IS NULL AND scope_id IS NULL
        AND public.is_platform_admin())
  );
CREATE POLICY ui_surface_config_update ON public.ui_surface_config
  FOR UPDATE TO authenticated USING (
    (user_id = auth.uid())
    OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
    OR (scope_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.ctx_scopes s
          JOIN public.ctx_scope_types st ON st.id = s.scope_type_id
          WHERE s.id = scope_id AND public.is_org_admin(st.organization_id)))
    OR (user_id IS NULL AND organization_id IS NULL AND scope_id IS NULL
        AND public.is_platform_admin())
  );
CREATE POLICY ui_surface_config_delete ON public.ui_surface_config
  FOR DELETE TO authenticated USING (
    (user_id = auth.uid())
    OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
    OR (scope_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.ctx_scopes s
          JOIN public.ctx_scope_types st ON st.id = s.scope_type_id
          WHERE s.id = scope_id AND public.is_org_admin(st.organization_id)))
    OR (user_id IS NULL AND organization_id IS NULL AND scope_id IS NULL
        AND public.is_platform_admin())
  );
CREATE POLICY ui_surface_config_service_role ON public.ui_surface_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- updated_at touch triggers (house pattern)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ui_surface_config_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER ui_surface_agent_role_touch
  BEFORE UPDATE ON public.ui_surface_agent_role
  FOR EACH ROW EXECUTE FUNCTION public.ui_surface_config_touch();
CREATE TRIGGER ui_surface_agent_pref_touch
  BEFORE UPDATE ON public.ui_surface_agent_pref
  FOR EACH ROW EXECUTE FUNCTION public.ui_surface_config_touch();
CREATE TRIGGER ui_surface_config_touch
  BEFORE UPDATE ON public.ui_surface_config
  FOR EACH ROW EXECUTE FUNCTION public.ui_surface_config_touch();

COMMIT;
