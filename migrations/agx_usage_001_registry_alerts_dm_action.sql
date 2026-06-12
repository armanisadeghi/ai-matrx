-- agx_usage_001_registry_alerts_dm_action.sql
--
-- Foundation for the Agent Find Usages + Drift Detection system:
--
--   1. public.agx_usage_registry — code-registered agent usages. aidream /
--      matrx-ai Python code pins ~35 agent versions via AgentRecordSource
--      constants (podcast generators, NER agents, research, PDF cleaner, …).
--      Those are real forward-looking usages that live outside the DB; this
--      registry makes them visible to the find-usages scan. Rows are synced
--      from code at aidream startup (production only) and via the super-admin
--      endpoint POST /agent-usage/sync. Declarations live in
--      packages/matrx-ai/matrx_ai/agents/usage_registry.py.
--
--   2. public.agx_drift_alert — per-(user, agent) drift alert ledger written by
--      the weekly server scan (tool 'agent_drift_weekly_scan'). Mirrors the
--      kg-suggestions dismissal semantics (status / viewed_at / dismissed_at /
--      suppressed_until) so a future unified notifications inbox can read both
--      ledgers. Fingerprint dedup: unchanged red-flag sets never re-notify.
--
--   3. dm_messages.action_data — generic actionable-message envelope so DMs can
--      carry deep-link action chips (drift notifications first).
--
--   4. Supporting indexes for the usage scans (FK columns are not auto-indexed).
--
-- Supabase default privileges grant ALL on new tables to anon/authenticated —
-- both tables REVOKE those and re-grant precisely (registry: read-only;
-- alerts: read own + lifecycle-column updates own). All writes flow through
-- the aidream ORM connection (table owner, bypasses RLS).

-- ---------------------------------------------------------------------------
-- 1. Code-registered usages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agx_usage_registry (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system    text NOT NULL CHECK (source_system IN ('matrx-ai', 'aidream')),
    usage_key        text NOT NULL,
    ref_kind         text NOT NULL CHECK (ref_kind IN ('version', 'agent', 'builtin')),
    -- master agent (resolved from the version row at sync time for version pins)
    agent_id         uuid REFERENCES public.agx_agent(id) ON DELETE RESTRICT,
    -- pinned snapshot. RESTRICT: deleting/purging a version that code depends on
    -- must scream, never silently null a code pin.
    agent_version_id uuid REFERENCES public.agx_version(id) ON DELETE RESTRICT,
    purpose          text NOT NULL,
    code_path        text,
    status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'vanished', 'retired')),
    first_seen_at    timestamptz NOT NULL DEFAULT now(),
    last_seen_at     timestamptz NOT NULL DEFAULT now(),
    last_synced_at   timestamptz NOT NULL DEFAULT now(),
    synced_by        text,
    CONSTRAINT agx_usage_registry_key_unique UNIQUE (source_system, usage_key),
    CONSTRAINT agx_usage_registry_ref_shape CHECK (
        (ref_kind = 'version' AND agent_version_id IS NOT NULL)
        OR (ref_kind = 'agent' AND agent_id IS NOT NULL)
        OR (ref_kind = 'builtin')
    )
);

COMMENT ON TABLE public.agx_usage_registry IS
    'Agent usages declared in backend code (AgentRecordSource pins). Synced from '
    'matrx_ai.agents.usage_registry declarations at aidream startup (production) '
    'and via POST /agent-usage/sync. ref_kind=builtin rows are legacy prompt-system '
    'agents tracked for visibility only (excluded from agx drift joins).';

CREATE INDEX IF NOT EXISTS agx_usage_registry_agent_idx
    ON public.agx_usage_registry (agent_id);
CREATE INDEX IF NOT EXISTS agx_usage_registry_version_idx
    ON public.agx_usage_registry (agent_version_id);

ALTER TABLE public.agx_usage_registry ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agx_usage_registry FROM anon, authenticated;
GRANT SELECT ON public.agx_usage_registry TO authenticated;

DROP POLICY IF EXISTS agx_usage_registry_read ON public.agx_usage_registry;
CREATE POLICY agx_usage_registry_read ON public.agx_usage_registry
    FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policies: writes only via the service/owner connection.

-- ---------------------------------------------------------------------------
-- 2. Drift alerts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agx_drift_alert (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id        uuid NOT NULL REFERENCES public.agx_agent(id) ON DELETE CASCADE,
    agent_name      text NOT NULL,
    severity        text NOT NULL CHECK (severity IN ('breaking', 'silent_breaking', 'warning')),
    usage_count     integer NOT NULL DEFAULT 0,
    breaking_count  integer NOT NULL DEFAULT 0,
    silent_count    integer NOT NULL DEFAULT 0,
    warning_count   integer NOT NULL DEFAULT 0,
    info_count      integer NOT NULL DEFAULT 0,
    -- normalized red-flag set: [{usage_type, usage_id, node_id, drift_class, severity}]
    findings        jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- sha256 over the sorted red-flag set; unchanged fingerprint = no re-notify
    fingerprint     text NOT NULL,
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'acknowledged', 'dismissed', 'resolved', 'expired')),
    viewed_at       timestamptz,
    dismissed_at    timestamptz,
    suppressed_until timestamptz,
    detected_at     timestamptz NOT NULL DEFAULT now(),
    last_scanned_at timestamptz NOT NULL DEFAULT now(),
    dm_message_id   uuid REFERENCES public.dm_messages(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agx_drift_alert IS
    'Per-(user, agent) drift alerts written by the weekly agent_drift_weekly_scan '
    'system task. Lifecycle mirrors kg-suggestions: viewed_at NULL = unseen badge; '
    'dismiss sets status=dismissed + dismissed_at; an unchanged fingerprint never '
    're-opens a dismissed alert; a changed one does (unless suppressed_until).';

-- one open alert per (user, agent)
CREATE UNIQUE INDEX IF NOT EXISTS agx_drift_alert_open_unique
    ON public.agx_drift_alert (user_id, agent_id)
    WHERE status IN ('pending', 'acknowledged');
CREATE INDEX IF NOT EXISTS agx_drift_alert_user_status_idx
    ON public.agx_drift_alert (user_id, status);
CREATE INDEX IF NOT EXISTS agx_drift_alert_agent_idx
    ON public.agx_drift_alert (agent_id);

ALTER TABLE public.agx_drift_alert ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agx_drift_alert FROM anon, authenticated;
GRANT SELECT ON public.agx_drift_alert TO authenticated;
-- lifecycle columns only — identity/finding columns are service-written
GRANT UPDATE (status, viewed_at, dismissed_at, suppressed_until)
    ON public.agx_drift_alert TO authenticated;

DROP POLICY IF EXISTS agx_drift_alert_select ON public.agx_drift_alert;
CREATE POLICY agx_drift_alert_select ON public.agx_drift_alert
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS agx_drift_alert_update ON public.agx_drift_alert;
CREATE POLICY agx_drift_alert_update ON public.agx_drift_alert
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
-- No INSERT/DELETE policies: alert rows are created/resolved by the weekly scan.

-- ---------------------------------------------------------------------------
-- 3. Actionable DM payloads
-- ---------------------------------------------------------------------------

ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS action_data jsonb;

COMMENT ON COLUMN public.dm_messages.action_data IS
    'Generic actionable-message envelope: {kind, version, payload}. The frontend '
    'renders kinds via features/messaging/actions/messageActionRegistry; unknown '
    'kinds render nothing. First kind: agent_drift {agent_id, agent_name, '
    'severity_counts, usage_count, alert_id?}.';

-- ---------------------------------------------------------------------------
-- 4. Scan-support indexes (FK columns are not auto-indexed in Postgres)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS agx_shortcut_agent_idx          ON public.agx_shortcut (agent_id);
CREATE INDEX IF NOT EXISTS agx_shortcut_agent_version_idx  ON public.agx_shortcut (agent_version_id);
CREATE INDEX IF NOT EXISTS aga_apps_agent_idx              ON public.aga_apps (agent_id);
CREATE INDEX IF NOT EXISTS aga_apps_agent_version_idx      ON public.aga_apps (agent_version_id);
CREATE INDEX IF NOT EXISTS prompt_apps_prompt_idx          ON public.prompt_apps (prompt_id);
CREATE INDEX IF NOT EXISTS sch_agent_task_agent_idx        ON public.sch_agent_task (agent_id);
CREATE INDEX IF NOT EXISTS agx_agent_surface_agent_idx     ON public.agx_agent_surface (agent_id);
CREATE INDEX IF NOT EXISTS agx_agent_source_agent_idx      ON public.agx_agent (source_agent_id);
CREATE INDEX IF NOT EXISTS cmp_comparison_entries_agent_idx ON public.cmp_comparison_entries (agent_id);
CREATE INDEX IF NOT EXISTS agx_version_agent_vn_idx        ON public.agx_version (agent_id, version_number);
