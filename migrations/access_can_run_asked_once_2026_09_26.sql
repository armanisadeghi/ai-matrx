-- draft: perf-lane can-run fast path + ladder asks each holder once; applying after rehearsal
-- based-on: iam.runnable_agent_for_org(uuid, uuid) cc1ea416f9b7c0f42eb3ae835e67f96025bcecc7d181aec7820674c7c2ff70fc
-- based-on: iam.runnable_version_for_org(uuid, uuid) f3d3f8dd47c7f3d71a615722d1c54b844121de84a3309dee7e6b915ba4020574
-- based-on: mandate._rungs(uuid[], uuid, uuid) c2aa43ee427b0bf40ea4755b6c6825cc602264132d3743ecec61d8e1baf44e4c
--
-- access_can_run_asked_once_2026_09_26.sql
--
-- THE CAN-RUN CHECK STOPS ASKING THE KERNEL ONCE PER MEMBER, AND THE LADDER ASKS IT ONCE PER HOLDER.
--
-- WHY (2026-09-26, /mandates/list-preview and /organizations/<org>/mandates, 0.85-1.2 s a call as
-- test@test.com): after mnd_member_list_ladder_only_for_rows_shown_2026_09_26 the list runs the
-- ladder only for the rows it shows, and what is left is platform access checks. Measured live on
-- the 50 rows of the My Orgs page: `mandate._rungs` 295 ms, of which the system rung's
-- `iam.runnable_agent_for_org` + `iam.runnable_version_for_org` were 275 ms — "can every member of
-- the mandate's home organization run this agent?" answered by one kernel walk
-- (`iam.has_access_for_base`, 0.5-1 ms) per MEMBER per ROW, while that organization's 102 mandates
-- name only 6 distinct agents and 1 distinct version.
--
-- NOW (every caller of the two shared checks benefits: mandate._rungs, mandate.binding_holder_runnable,
-- and the server's reads of them):
--   * `iam._agent_open_to_every_member` — TRUE only when the kernel is certain to admit every member
--     at viewer through an arm that does not depend on who asks (the row is public; internal+ in a
--     global-readable system org; internal+ in THIS organization with the class's member lane). Of
--     the 1,859 (agent, org) pairs the live data answers true, 1,833 are proven here with no walk.
--   * `iam.runnable_agent_for_org` / `iam.runnable_version_for_org` ask it before walking members;
--     otherwise they walk exactly as before.
--   * `mandate._rungs` asks each distinct (holder, principal) question once per call instead of once
--     per rung row (same functions, same arguments, one STABLE snapshot).
--
-- SAME ANSWERS, proven on the nightly clone inside one rolled-back transaction, new bodies as
-- pg_temp copies beside the live ones: 4,110 (agent|version, org) pairs — 0 differences for either
-- check; the full ladder (every live mandate) for test@test.com, admin@admin.com and two org owners,
-- each as the person alone, the person in up to three of their organizations, and each organization
-- alone — 20 seats, 0 differences (md5 of every row). Re-proven on production in a rolled-back
-- transaction before applying (see the UI-REGISTER done line).
--
-- Functions only: no table is touched, no lock beyond the catalogue rows replaced.

CREATE OR REPLACE FUNCTION iam._agent_open_to_every_member(p_agent_id uuid, p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 🚨 CAN-RUN FAST PATH (2026-09-26). TRUE only when the access kernel is CERTAIN to admit every
  -- member of p_organization_id to this agent at viewer — so iam.runnable_agent_for_org /
  -- iam.runnable_version_for_org can answer without walking the kernel once per member (each
  -- walk ~0.5-1 ms; an organization's system rung paid one per member per mandate row). FALSE
  -- means "not proven here", never "refused": the caller then asks the kernel per member exactly
  -- as before. It restates three arms of iam.has_access_for_base's FIRST node that do not depend
  -- on who asks, reading the same registry and the same row attributes the kernel reads:
  --   * the row is `public`                                   (the include_public arm)
  --   * the row is internal+ in a global-readable system org  (§6e, organization/public class)
  --   * the row is internal+ IN THIS ORGANIZATION and the class has the member lane — every
  --     member has iam.has_org_access_for(member, org) by definition of being a member, and
  --     outside schema `custom` that lane admits viewer (the 2026-08-12 editor cap).
  -- Everything the kernel does BEFORE those arms either returns true or skips the node for
  -- everyone alike; the skips are required absent here (a reference gate, a detail, an
  -- unregistered token, a missing row), so under these conditions the kernel answers true for
  -- every member. Guard: the before/after proof in the migration that introduced it.
  SELECT coalesce((
    SELECT (platform.reference_gate_columns(et.token))[2] IS NULL
       AND platform.detail_parent_columns(et.token) IS NULL
       AND et.rls_variant IS DISTINCT FROM 'detail'
       AND et.schema_name IS DISTINCT FROM 'custom'
       AND coalesce(attrs.o_found, false)
       AND (attrs.o_vis = 'public'::platform.visibility
            OR (attrs.o_vis >= 'internal'::platform.visibility
                AND attrs.o_org IS NOT NULL
                AND lanes.resolved_class IN ('organization', 'public')
                AND attrs.o_org IN (SELECT so.organization_id FROM iam.system_orgs so
                                     WHERE so.global_readable))
            OR (attrs.o_vis >= 'internal'::platform.visibility
                AND attrs.o_org = p_organization_id
                AND lanes.org_member_lane))
    FROM agent.definition a
    JOIN platform.entity_types et ON et.token = 'agent' AND et.is_active
    CROSS JOIN LATERAL platform.entity_row_access_attrs(et.schema_name, et.table_name, a.id) attrs
    CROSS JOIN LATERAL iam.class_lanes(et.token) lanes
    WHERE a.id = p_agent_id AND a.deleted_at IS NULL), false);
$function$;

CREATE OR REPLACE FUNCTION iam.runnable_agent_for_org(p_agent_id uuid, p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_agent_id IS NULL THEN NULL
    -- A live system agent is runnable by everyone, in every organization.
    WHEN EXISTS (
      SELECT 1 FROM agent.definition a
      WHERE a.id = p_agent_id AND a.deleted_at IS NULL
        AND a.agent_type = 'builtin' AND a.is_active
    ) THEN true
    -- No organization named, or THE system organization: the principal is
    -- "everybody on the platform", and only a system agent clears that bar.
    WHEN p_organization_id IS NULL
      OR p_organization_id IN (SELECT so.organization_id FROM iam.system_orgs so)
      THEN false
    -- CAN-RUN FAST PATH (2026-09-26): proven open to every member without asking per member
    -- (iam._agent_open_to_every_member says why that is the same answer).
    WHEN iam._agent_open_to_every_member(p_agent_id, p_organization_id) THEN true
    -- Otherwise the organization can run it only if every member can. An
    -- organization with no members has nobody to disagree — vacuously true.
    ELSE NOT EXISTS (
      SELECT 1 FROM iam.organization_member om
      WHERE om.organization_id = p_organization_id
        AND NOT EXISTS (
          SELECT 1 FROM iam.runnable_agent_fields_for(p_agent_id, om.user_id))
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION iam.runnable_version_for_org(p_version_id uuid, p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_version_id IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM agent.definition_version av
      JOIN agent.definition a ON a.id = av.agent_id
      WHERE av.id = p_version_id AND a.deleted_at IS NULL
        AND a.agent_type = 'builtin' AND a.is_active
    ) THEN true
    WHEN p_organization_id IS NULL
      OR p_organization_id IN (SELECT so.organization_id FROM iam.system_orgs so)
      THEN false
    -- CAN-RUN FAST PATH (2026-09-26): the version's agent is proven open to every member
    -- (iam.runnable_version_fields_for asks the kernel about the version's AGENT).
    WHEN EXISTS (
      SELECT 1 FROM agent.definition_version av
      WHERE av.id = p_version_id
        AND iam._agent_open_to_every_member(av.agent_id, p_organization_id)
    ) THEN true
    ELSE NOT EXISTS (
      SELECT 1 FROM iam.organization_member om
      WHERE om.organization_id = p_organization_id
        AND NOT EXISTS (
          SELECT 1 FROM iam.runnable_version_fields_for(p_version_id, om.user_id))
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION mandate._rungs(p_mandate_ids uuid[], p_user_id uuid, p_organization_id uuid)
 RETURNS TABLE(mandate_id uuid, mandate_key text, rung_order integer, rung text, binding_id uuid, organization_id uuid, subject_user_id uuid, is_enabled boolean, holder_type text, holder_id uuid, holder_version_id uuid, holder_live boolean, version_live boolean, chose_holder boolean, config_overrides jsonb, consumption_map jsonb, auto_run boolean, definition_id uuid, definition_enabled boolean, fallback_mandate_key text, dropped_reason text, dropped_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH scope AS (
    -- THE OTHER TWO IDS. The kernel below is asked about p_mandate_ids and was asked
    -- about nothing else, so rung 4 handed back any PERSON's private binding and rung 3
    -- any ORGANIZATION's — both proven live on production 2026-09-17 as a non-member.
    -- The lane test is the SAME one the kernel already uses three lines down, so the
    -- server lane and the service role are narrowed by neither. Outside it, an id the
    -- caller has no claim on becomes NULL, and a NULL id already means "this rung does
    -- not apply" — the body's own contract, not a new one.
    SELECT (session_user <> 'authenticator'
            AND nullif(current_setting('request.jwt.claims', true), '') IS NULL) AS server_lane
  ),
  asked AS (
    SELECT
      CASE WHEN (SELECT server_lane FROM scope)
                 OR p_user_id = (SELECT auth.uid())
           THEN p_user_id END AS user_id,
      CASE WHEN (SELECT server_lane FROM scope)
                 OR iam.has_org_access(p_organization_id)
           THEN p_organization_id END AS org_id
  ),
  d AS (
    SELECT x.id, x.mandate_key, x.organization_id, x.is_enabled,
           x.fallback_mandate_key, x.default_holder_type,
           x.default_holder_id, x.default_holder_version_id,
           x.required_output_keys,
           -- 1037: the rest of the system answer, from the same record.
           x.default_config_overrides, x.default_consumption_map, x.default_auto_run
    FROM mandate.definition x
    WHERE x.id = ANY (p_mandate_ids) AND x.deleted_at IS NULL
      -- DD-137c / §3.4 chokepoint 3. This function runs as its definer, so RLS never sees the
      -- ids it is handed. Since it is now callable by every signed-in browser, the kernel is
      -- asked here instead: an id the caller cannot read resolves to no rungs at all. The
      -- service role, which is how the server reads, is not a client and is not narrowed.
      -- dd137c4_fix1: inside SECURITY DEFINER, current_user IS THE OWNER (postgres), never
      -- service_role. A client is a PostgREST connection (session_user = authenticator) or any
      -- caller carrying JWT claims (the server impersonating a person); only a bare server
      -- connection is not narrowed.
      AND ((session_user <> 'authenticator'
            AND nullif(current_setting('request.jwt.claims', true), '') IS NULL)
           OR iam.has_access('mandate', x.id, 'viewer'))
  ),
  laddered AS (
    -- 1 · system — the definition's own defaults. Its principal is the
    -- mandate's HOME organization: a system-homed mandate decides for
    -- everybody, an org-homed one decides for that organization's members.
    -- 1037: it now carries the default's map, settings and auto-run too, so the
    -- system answer is read from ONE record.
    SELECT d.id, d.mandate_key, 1, 'system'::text,
           NULL::uuid, d.organization_id, NULL::uuid, true,
           d.default_holder_type, d.default_holder_id, d.default_holder_version_id,
           (d.default_holder_id IS NOT NULL),
           d.default_config_overrides, d.default_consumption_map, d.default_auto_run,
           d.id, d.is_enabled, d.fallback_mandate_key,
           d.organization_id, NULL::uuid, NULL::jsonb, d.required_output_keys
    FROM d

    -- (2 · global is RETIRED — aidream 1041. The answer for everybody is the
    -- definition's own default above; there is no platform-wide binding rung.)

    UNION ALL
    -- 3 · org — THE ACTIVE ORG the caller was given, and only that one (D-R1).
    -- 🚨 JUDGED FOR THE ASKING MEMBER (2026-09-25). The run (aidream
    -- `resolve_mandate`, owner ruling 2026-09-25) runs an org Holder with the
    -- RUNNING PERSON's access and refuses loudly when they cannot open it, so the
    -- ladder judges reachability for the same person whenever one is asked.
    -- With no person (a bare org question) it is judged for the organization.
    SELECT d.id, d.mandate_key, 3, 'org',
           b.id, b.organization_id, b.subject_user_id, b.is_enabled,
           b.holder_type, b.holder_id, b.holder_version_id,
           (b.holder_id IS NOT NULL),
           b.config_overrides, b.consumption_map, b.auto_run,
           d.id, d.is_enabled, d.fallback_mandate_key,
           b.organization_id, (SELECT user_id FROM asked), b.metadata, d.required_output_keys
    FROM d JOIN mandate.binding b ON b.mandate_id = d.id
    WHERE b.deleted_at IS NULL AND b.principal_type = 'org'
      AND (SELECT org_id FROM asked) IS NOT NULL
      AND b.organization_id = (SELECT org_id FROM asked)

    UNION ALL
    -- 4 · user — keyed on the PERSON. Its principal is the SUBJECT, which for
    -- this door is always the caller, so nothing moves here.
    SELECT d.id, d.mandate_key, 4, 'user',
           b.id, b.organization_id, b.subject_user_id, b.is_enabled,
           b.holder_type, b.holder_id, b.holder_version_id,
           (b.holder_id IS NOT NULL),
           b.config_overrides, b.consumption_map, b.auto_run,
           d.id, d.is_enabled, d.fallback_mandate_key,
           NULL::uuid, b.subject_user_id, b.metadata, d.required_output_keys
    FROM d JOIN mandate.binding b ON b.mandate_id = d.id
    WHERE b.deleted_at IS NULL AND b.principal_type = 'user'
      AND (SELECT user_id FROM asked) IS NOT NULL
      AND b.subject_user_id = (SELECT user_id FROM asked)
  ),
  lad AS MATERIALIZED (
    SELECT * FROM laddered AS l(id, mandate_key, rung_order, rung, binding_id, organization_id,
                       subject_user_id, is_enabled, holder_type, holder_id,
                       holder_version_id, chose_holder, config_overrides,
                       consumption_map, auto_run, definition_id, definition_enabled,
                       fallback_mandate_key, principal_org_id, principal_user_id,
                       binding_metadata, required_output_keys)
  ),
  -- 🚨 ASKED ONCE PER HOLDER (2026-09-26). Reachability used to be asked per RUNG ROW: one
  -- organization's 102 mandates name 6 distinct agents, and every row paid a kernel walk per
  -- member of the home organization. The same (holder, principal) question is now asked once
  -- per call and every rung reads its answer — the same functions, the same arguments, under the
  -- same snapshot (this function is STABLE), so the same answers.
  agent_reach AS MATERIALIZED (
    SELECT q.holder_id, q.principal_user_id, q.principal_org_id,
           CASE WHEN q.principal_user_id IS NOT NULL
                THEN EXISTS (SELECT 1 FROM iam.runnable_agent_fields_for(q.holder_id, q.principal_user_id))
                ELSE iam.runnable_agent_for_org(q.holder_id, q.principal_org_id) END AS live
    FROM (SELECT DISTINCT x.holder_id, x.principal_user_id,
                 CASE WHEN x.principal_user_id IS NULL THEN x.principal_org_id END AS principal_org_id
            FROM lad x
           WHERE x.holder_id IS NOT NULL AND x.holder_type = 'agent') q
  ),
  version_reach AS MATERIALIZED (
    SELECT q.holder_version_id, q.principal_user_id, q.principal_org_id,
           CASE WHEN q.principal_user_id IS NOT NULL
                THEN EXISTS (SELECT 1 FROM iam.runnable_version_fields_for(q.holder_version_id, q.principal_user_id))
                ELSE iam.runnable_version_for_org(q.holder_version_id, q.principal_org_id) END AS live
    FROM (SELECT DISTINCT x.holder_version_id, x.principal_user_id,
                 CASE WHEN x.principal_user_id IS NULL THEN x.principal_org_id END AS principal_org_id
            FROM lad x
           WHERE x.holder_version_id IS NOT NULL AND x.holder_type = 'agent') q
  ),
  judged AS (
    SELECT l.*,
      CASE
        WHEN l.holder_id IS NULL THEN NULL
        WHEN l.holder_type IS DISTINCT FROM 'agent' THEN NULL
        ELSE (SELECT r.live FROM agent_reach r
               WHERE r.holder_id = l.holder_id
                 AND r.principal_user_id IS NOT DISTINCT FROM l.principal_user_id
                 AND r.principal_org_id IS NOT DISTINCT FROM
                     CASE WHEN l.principal_user_id IS NULL THEN l.principal_org_id END)
      END AS holder_live,
      CASE
        WHEN l.holder_version_id IS NULL THEN NULL
        WHEN l.holder_type IS DISTINCT FROM 'agent' THEN NULL
        ELSE (SELECT r.live FROM version_reach r
               WHERE r.holder_version_id = l.holder_version_id
                 AND r.principal_user_id IS NOT DISTINCT FROM l.principal_user_id
                 AND r.principal_org_id IS NOT DISTINCT FROM
                     CASE WHEN l.principal_user_id IS NULL THEN l.principal_org_id END)
      END AS version_live,
      -- THE OUTPUT HALF. `enforced_holder_contract` keeps it in force ALWAYS,
      -- so this is not a display nicety: a holder that cannot produce the
      -- mandate's required keys is refused by `resolve_mandate` before any
      -- provider call. Judged on the PINNED VERSION's schema when the rung pins
      -- one, else the agent's — the rule `_agent_ref_contract_problems` uses.
      -- A NULL schema declares nothing and therefore fails EVERY required key,
      -- which is what the server already says in words.
      CASE
        WHEN l.holder_id IS NULL THEN NULL
        WHEN l.holder_type IS DISTINCT FROM 'agent' THEN NULL
        ELSE nullif(
               mandate.missing_output_keys(
                 l.required_output_keys,
                 (SELECT coalesce(av.output_schema, ag.output_schema)::jsonb
                    FROM agent.definition ag
                    LEFT JOIN agent.definition_version av
                           ON av.id = l.holder_version_id
                   WHERE ag.id = l.holder_id AND ag.deleted_at IS NULL)),
               ARRAY[]::text[])
      END AS missing_output_keys
    FROM lad l
  ),
  coded AS (
    SELECT j.*,
      -- WHY this rung will not decide, as ONE machine-readable value. NULL = it
      -- can. Precedence is the order a person would say it in: a row the
      -- platform turned off is off whatever else is true of it; a holder you
      -- cannot open is a bigger fact than one whose output shape is wrong.
      CASE
        WHEN NOT j.is_enabled AND nullif(j.binding_metadata->>'disabled_reason','') IS NOT NULL
          THEN 'platform_disabled'
        WHEN j.binding_id IS NOT NULL AND j.chose_holder
             AND ((j.holder_version_id IS NOT NULL AND j.version_live IS FALSE)
               OR (j.holder_version_id IS NULL AND j.holder_live IS FALSE))
          THEN 'holder_unreachable'
        -- The ONE code that may fall on the SYSTEM rung: the floor can be
        -- unusable for everybody, and when it is, saying "system decides" is
        -- the lie FIX-R7 closes. Reachability never drops the floor.
        WHEN j.chose_holder AND j.is_enabled
             AND coalesce(cardinality(j.missing_output_keys), 0) > 0
          THEN 'output_contract_unmet'
        ELSE NULL
      END AS dropped_code
    FROM judged j
  )
  SELECT c.id, c.mandate_key, c.rung_order, c.rung,
         c.binding_id, c.organization_id, c.subject_user_id, c.is_enabled,
         c.holder_type, c.holder_id, c.holder_version_id,
         c.holder_live, c.version_live,
         c.chose_holder, c.config_overrides, c.consumption_map, c.auto_run,
         c.definition_id, c.definition_enabled, c.fallback_mandate_key,
         -- The sentence a person reads. A person's own off switch stays silent
         -- (that is a choice, not a fault), which is why `platform_disabled`
         -- requires a written `disabled_reason` before it becomes a code.
         CASE c.dropped_code
           WHEN 'platform_disabled' THEN c.binding_metadata->>'disabled_reason'
           WHEN 'holder_unreachable' THEN
             CASE
               WHEN c.rung = 'org' AND c.principal_user_id IS NOT NULL THEN
                 -- The run's own words (aidream `_refuse_org_holder_for_running_person`):
                 -- it refuses for this member; it does not fall to the rung below.
                 'Your organization assigned a Holder to this job that you do not '
                 || 'have access to, so it cannot run for you. Ask an organization '
                 || 'admin to share it with you (or with the whole organization), '
                 || 'or to assign one every member can open.'
               WHEN c.rung = 'org' THEN
                 'This organization''s binding names a Holder its members '
                 || 'cannot open, so the organization''s choice cannot be '
                 || 'used and the rung below decides instead. Share the '
                 || 'agent with this organization, or bind one it already has.'
               ELSE
                 'This binding names a Holder this person cannot open, so '
                 || 'the rung below decides instead. Share the agent with '
                 || 'them, or bind one they already have.'
             END
           WHEN 'output_contract_unmet' THEN
             'This job requires the output '
             || CASE WHEN cardinality(c.missing_output_keys) = 1
                     THEN 'key ' ELSE 'keys ' END
             || array_to_string(c.missing_output_keys, ', ')
             || ', which the agent this rung names does not declare — so the run '
             || 'fails after it has been paid for, for everyone, not just for '
             || 'you. Give that agent an output schema declaring '
             || CASE WHEN cardinality(c.missing_output_keys) = 1
                     THEN 'that key' ELSE 'those keys' END
             || ', or name an agent that already does.'
           ELSE NULL
         END AS dropped_reason,
         c.dropped_code
  FROM coded c
  ORDER BY c.mandate_key, c.rung_order;
$function$;
REVOKE ALL ON FUNCTION iam._agent_open_to_every_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION iam._agent_open_to_every_member(uuid, uuid) TO service_role;
