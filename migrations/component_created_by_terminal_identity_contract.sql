-- chair-step: terminal component identity contract after corrected frontend and server consumers
-- are live. It refuses unattributed legacy alerts, removes only temporary legacy arbiters, keeps
-- one lifetime canvas row per viewer (revived by the client on save), and makes removed alerts
-- leave the live recipient identity.
-- component_created_by_terminal_identity_contract
-- based-on: public.agx_usage_report() 9a1ba89e5182e4a8d4b3a9f8c3255e4796492a10dcf32d971babaaa8e9cbb190
set local lock_timeout = '2s';

-- A NULL recipient can only be reconciled by a writer that carries an explicit recipient. The
-- former created_by value is the component parent owner, not evidence of addressee identity.
do $terminal$
begin
  if exists (select 1 from agent.drift_alert where recipient_id is null) then
    raise exception 'terminal identity contract refused: NULL recipient_id needs explicit attributable recipient evidence; no alert was guessed or changed';
  end if;
end
$terminal$;

alter table agent.drift_alert alter column recipient_id set not null;
alter table canvas.canvas_item_state drop constraint if exists canvas_item_state_canvas_created_by_key;
drop index if exists agent.agx_drift_alert_open_unique;
drop index if exists agent.agx_drift_alert_open_recipient_unique;
create unique index agx_drift_alert_open_recipient_unique
  on agent.drift_alert (recipient_id, agent_id)
  where deleted_at is null and status in ('pending', 'acknowledged');

-- Canvas state is one durable row per viewer/artifact; the frontend upsert supplies deleted_at=NULL
-- so an intentional archive revives its same identity rather than updating an invisible row.
CREATE OR REPLACE FUNCTION public.agx_usage_report()
 RETURNS TABLE(agent_id uuid, agent_name text, current_version integer, agent_is_active boolean, owned_by_caller boolean, my_usage_count integer, my_breaking integer, my_silent integer, my_warning integer, my_info integer, my_stale_pins integer, others_usage_count integer, others_redflag_count integer, by_type jsonb, alert_id uuid, alert_status text, alert_severity text, alert_detected_at timestamp with time zone, alert_last_scanned_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_usage_report: not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH r AS (SELECT * FROM public.agx_usage_scan_core(NULL, v_uid, 'all')),
  agent_scope AS (
    SELECT a.id, a.name, a.version, (a.is_active AND NOT a.is_archived) AS live,
           (a.created_by = v_uid OR (a.organization_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM iam.organization_member om WHERE om.organization_id = a.organization_id
               AND om.user_id = v_uid AND om.role IN ('owner', 'admin')))) AS oversees
    FROM agent.definition a
    WHERE a.created_by = v_uid
       OR (a.organization_id IS NOT NULL AND EXISTS (SELECT 1 FROM iam.organization_member om
             WHERE om.organization_id = a.organization_id AND om.user_id = v_uid AND om.role IN ('owner', 'admin')))
       OR EXISTS (SELECT 1 FROM r WHERE r.agent_id = a.id AND r.managed_by_caller)
  )
  SELECT s.id, s.name, s.version, s.live, s.oversees,
    (count(*) FILTER (WHERE r.managed_by_caller))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'breaking'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'silent_breaking'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'warning'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'info'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.stale_pin))::integer,
    CASE WHEN s.oversees THEN (count(*) FILTER (WHERE NOT r.managed_by_caller))::integer END,
    CASE WHEN s.oversees THEN (count(*) FILTER (WHERE NOT r.managed_by_caller AND r.is_usage_active
      AND r.severity IN ('breaking', 'silent_breaking', 'warning')))::integer END,
    COALESCE((SELECT jsonb_object_agg(t.usage_type, t.n) FROM (SELECT r2.usage_type, count(*) AS n
      FROM r r2 WHERE r2.agent_id = s.id AND (r2.managed_by_caller OR s.oversees) GROUP BY r2.usage_type) t), '{}'::jsonb),
    al.id, al.status, al.severity, al.detected_at, al.last_scanned_at
  FROM agent_scope s LEFT JOIN r ON r.agent_id = s.id
  LEFT JOIN LATERAL (
    SELECT a2.id, a2.status, a2.severity, a2.detected_at, a2.last_scanned_at
    FROM agent.drift_alert a2
    WHERE a2.recipient_id = v_uid AND a2.agent_id = s.id AND a2.deleted_at IS NULL
      AND a2.status IN ('pending', 'acknowledged')
    ORDER BY a2.detected_at DESC LIMIT 1
  ) al ON true
  GROUP BY s.id, s.name, s.version, s.live, s.oversees, al.id, al.status, al.severity, al.detected_at, al.last_scanned_at;
END;
$function$;
