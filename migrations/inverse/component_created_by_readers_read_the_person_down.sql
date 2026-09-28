-- chair-step: restores the created_by readers component_created_by_readers_read_the_person repointed, drops viewer_id / recipient_id and puts back the (canvas_id, created_by) and (created_by, agent_id) keys — refuses if two viewers or two recipients now hold rows those keys would collide on.
-- component_created_by_readers_read_the_person_down — the inverse of component_created_by_readers_read_the_person.sql
-- based-on: public.agx_usage_report() 9a1ba89e5182e4a8d4b3a9f8c3255e4796492a10dcf32d971babaaa8e9cbb190
-- based-on: platform.count_messages(text, uuid[], timestamp with time zone, timestamp with time zone) 856bfa999078c2f915b244ce1a995bbb187882981e30dff56b7ec34d7359170e
-- based-on: platform.search_messages(text, uuid[], timestamp with time zone, timestamp with time zone, integer, integer) 2e18f45837b496ee44e67b4af82fc9508b92ff65323fec3233519bf70d5a44c6
-- based-on: public.crm_chasebox_items(text, text, uuid, integer, integer) 6d231c6003d7c23edb883d859fc6d7e8d051923acbf81b8b4191acea9fce707e
-- based-on: public.crm_inbox_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) 7533612839d58ce3ad36b2b6ff1b533d6778f940b9b50d96079c5d76b6b86dbd
-- based-on: public.hr_pending_changes(uuid) d80dccf4509dfc2560871b62325bf454a3a96b7bd5330af6bd5124e9e4988225
-- based-on: public.hr_employment_history(uuid) d05e4c6e3ea0eca6932d5a18efaa9fb9d213a130b7e751fa87d9dcda016759f3
-- based-on: public.war_room_recent_activity(uuid, integer, timestamp with time zone) 84e36def86921a6110ba6b8d85adce91160de635300d3e89003a529a4feb2998
-- based-on: seo.starter_pack_site_status(uuid, uuid) a643b115dd8cfd432d910314701eaa02a7f7d02d5fb7ee05fc33e916561291a0

do $refuse$
begin
  if exists (select 1 from canvas.canvas_item_state group by canvas_id, created_by having count(*) > 1) then
    raise exception 'inverse refused: canvas.canvas_item_state holds more than one viewer''s row for a canvas; the (canvas_id, created_by) key cannot come back without deleting a person''s state';
  end if;
  if exists (select 1 from agent.drift_alert where status in ('pending','acknowledged') group by created_by, agent_id having count(*) > 1) then
    raise exception 'inverse refused: agent.drift_alert holds open alerts for more than one recipient of an agent; the (created_by, agent_id) key cannot come back';
  end if;
end $refuse$;

alter table canvas.canvas_item_state add constraint canvas_item_state_canvas_created_by_key unique (canvas_id, created_by);
drop index if exists canvas.canvas_item_state_canvas_viewer_key;
drop index if exists canvas.idx_canvas_item_state_viewer_id;
alter table canvas.canvas_item_state drop column if exists viewer_id;

create unique index if not exists agx_drift_alert_open_unique
  on agent.drift_alert (created_by, agent_id) where status in ('pending', 'acknowledged');
drop index if exists agent.agx_drift_alert_open_recipient_unique;
drop index if exists agent.agx_drift_alert_recipient_status_idx;
alter table agent.drift_alert drop column if exists recipient_id;

update hr.function_contract
   set must_contain = array['ONE ACTOR PER ASSIGNMENT', 'where a.login_user_id = pa.created_by']
 where schema_name = 'public' and function_name = 'hr_employment_history'
   and home_migration = 'hr_l1_70_one_actor_per_row_not_one_row_per_actor.sql';
update hr.function_contract
   set must_contain = array['ONE REQUESTER PER PENDING CHANGE', 'where r.login_user_id = pa.created_by']
 where schema_name = 'public' and function_name = 'hr_pending_changes'
   and home_migration = 'hr_l1_70_one_actor_per_row_not_one_row_per_actor.sql';

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
  WITH r AS (
    SELECT * FROM public.agx_usage_scan_core(NULL, v_uid, 'all')
  ),
  agent_scope AS (
    SELECT a.id, a.name, a.version, (a.is_active AND NOT a.is_archived) AS live,
           (a.created_by = v_uid
            OR (a.organization_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM iam.organization_member om
                  WHERE om.organization_id = a.organization_id
                    AND om.user_id = v_uid AND om.role IN ('owner', 'admin')))) AS oversees
    FROM agent.definition a
    WHERE a.created_by = v_uid
       OR (a.organization_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM iam.organization_member om
             WHERE om.organization_id = a.organization_id
               AND om.user_id = v_uid AND om.role IN ('owner', 'admin')))
       OR EXISTS (SELECT 1 FROM r WHERE r.agent_id = a.id AND r.managed_by_caller)
  )
  SELECT
    s.id, s.name, s.version, s.live, s.oversees,
    (count(*) FILTER (WHERE r.managed_by_caller))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'breaking'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'silent_breaking'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'warning'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'info'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.stale_pin))::integer,
    CASE WHEN s.oversees THEN (count(*) FILTER (WHERE NOT r.managed_by_caller))::integer END,
    CASE WHEN s.oversees THEN (count(*) FILTER (WHERE NOT r.managed_by_caller AND r.is_usage_active
                                AND r.severity IN ('breaking', 'silent_breaking', 'warning')))::integer END,
    COALESCE((SELECT jsonb_object_agg(t.usage_type, t.n) FROM (
       SELECT r2.usage_type, count(*) AS n FROM r r2
       WHERE r2.agent_id = s.id AND (r2.managed_by_caller OR s.oversees)
       GROUP BY r2.usage_type) t), '{}'::jsonb),
    al.id, al.status, al.severity, al.detected_at, al.last_scanned_at
  FROM agent_scope s
  LEFT JOIN r ON r.agent_id = s.id
  LEFT JOIN LATERAL (
    SELECT a2.id, a2.status, a2.severity, a2.detected_at, a2.last_scanned_at
    FROM agent.drift_alert a2
    WHERE a2.created_by = v_uid AND a2.agent_id = s.id
      AND a2.status IN ('pending', 'acknowledged')
    ORDER BY a2.detected_at DESC LIMIT 1
  ) al ON true
  GROUP BY s.id, s.name, s.version, s.live, s.oversees,
           al.id, al.status, al.severity, al.detected_at, al.last_scanned_at;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.count_messages(p_query text, p_org_ids uuid[] DEFAULT NULL::uuid[], p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_words text[];
  v_tsq   tsquery;
  v_n     bigint;
begin
  if v_uid is null then
    raise exception 'Sign in to search your chats.' using errcode = '42501';
  end if;
  v_words := array(select w from regexp_split_to_table(
                     platform.search_normalize(left(btrim(coalesce(p_query, '')), 200)), '[^[:alnum:]]+') w
                   where w <> '');
  if cardinality(v_words) = 0 then
    return 0;
  end if;
  v_tsq := to_tsquery('simple', array_to_string(array(
             select quote_literal(w) || case when o = cardinality(v_words) then ':*' else '' end
               from unnest(v_words) with ordinality u(w, o)), ' & '));
  with matched as materialized (
    select distinct m.conversation_id
      from chat.message m
     where chat.message_search_tsv(m.content) @@ v_tsq
       and m.deleted_at is null and m.is_visible_to_user is true
       and m.created_by = v_uid
       and (p_org_ids is null or m.organization_id = any(p_org_ids))
       and (p_date_from is null or m.created_at >= p_date_from)
       and (p_date_to is null or m.created_at < p_date_to)
  )
  select count(*) into v_n
    from matched x
    join chat.conversation c on c.id = x.conversation_id and c.created_by = v_uid and c.deleted_at is null;
  return v_n;
end
$function$;

CREATE OR REPLACE FUNCTION platform.search_messages(p_query text, p_org_ids uuid[] DEFAULT NULL::uuid[], p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 20, p_per_conversation integer DEFAULT NULL::integer)
 RETURNS TABLE(conversation_id uuid, message_id uuid, role text, "position" integer, created_at timestamp with time zone, snippet text, conversation_title text, conversation_subtitle text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_per   integer := least(greatest(coalesce(p_per_conversation, 100), 1), 100);
  v_words text[];
  v_tsq   tsquery;
  v_any   tsquery;
begin
  if v_uid is null then
    raise exception 'Sign in to search your chats.' using errcode = '42501';
  end if;
  v_words := array(select w from regexp_split_to_table(
                     platform.search_normalize(left(btrim(coalesce(p_query, '')), 200)), '[^[:alnum:]]+') w
                   where w <> '');
  if cardinality(v_words) = 0 then
    return;
  end if;
  v_tsq := to_tsquery('simple', array_to_string(array(
             select quote_literal(w) || case when o = cardinality(v_words) then ':*' else '' end
               from unnest(v_words) with ordinality u(w, o)), ' & '));
  -- The headline highlights ANY query word in its window (the match itself is v_tsq's, all words).
  v_any := to_tsquery('simple', array_to_string(array(
             select quote_literal(w) || case when o = cardinality(v_words) then ':*' else '' end
               from unnest(v_words) with ordinality u(w, o)), ' | '));

  -- Newest first, never ts_rank (1374). The page is chosen from ids alone — the GIN match, then the
  -- newest v_limit, at most p_per_conversation per conversation — and message bodies are read ONLY
  -- for the returned rows (1401): detoasting a body is ~0.8 ms, and ts_headline re-parses whatever it
  -- is given, so it gets a 1,600-character window around the first query word, never the whole body
  -- (up to 100,000 characters; measured: 100 hits for 'project plan' took 615 ms that way).
  return query
    with matched as materialized (
      -- Materialized ON PURPOSE: the GIN index ANDed with message_created_by_fk_idx answers it.
      select m.id, m.created_at, m.conversation_id
        from chat.message m
       where chat.message_search_tsv(m.content) @@ v_tsq
         and m.deleted_at is null and m.is_visible_to_user is true
         and m.created_by = v_uid
         and (p_org_ids is null or m.organization_id = any(p_org_ids))
         and (p_date_from is null or m.created_at >= p_date_from)
         and (p_date_to is null or m.created_at < p_date_to)
    ),
    -- Candidates are bounded before anything else: the newest 2 x limit (1374's page) with no
    -- per-conversation cap, else enough newest ids to fill limit at the cap (never more than 4,000).
    cand as materialized (
      select x.id, x.created_at, x.conversation_id from matched x
       order by x.created_at desc, x.id
       limit case when p_per_conversation is null then v_limit * 2
                  else least(v_limit * 20, 4000) end
    ),
    live as (
      select x.id, x.created_at, x.conversation_id,
             row_number() over (partition by x.conversation_id order by x.created_at desc, x.id) as per_conv
        from cand x
       where exists (select 1 from chat.conversation c
                      where c.id = x.conversation_id and c.created_by = v_uid and c.deleted_at is null)
    ),
    page as materialized (
      select l.id from live l where l.per_conv <= v_per
       order by l.created_at desc, l.id
       limit v_limit
    ),
    -- Each returned body is detoasted and flattened to text ONCE (materialized: an inlined lateral
    -- evaluated the extraction once per reference).
    bodies as materialized (
      select m.id, m.conversation_id, m.role, m."position", m.created_at,
             chat.message_search_text(m.content) as txt
        from page p join chat.message m on m.id = p.id
    ),
    located as materialized (
      select b.*,
             greatest(1, coalesce((select min(nullif(strpos(lower(b.txt), w), 0))
                                     from unnest(v_words) w), 1) - 400) as at
        from bodies b
    )
    select l.conversation_id, l.id, l.role, l."position", l.created_at,
           ts_headline('simple', substr(l.txt, l.at, 1600), v_any,
                       'MaxWords=30, MinWords=10, ShortWord=2, MaxFragments=1, StartSel=«, StopSel=»'),
           -- 1394: the conversation's title and subtitle ride with each hit.
           coalesce(si.title, nullif(btrim(c.title), ''), 'Untitled conversation'),
           si.subtitle
      from located l
      join chat.conversation c on c.id = l.conversation_id
      left join platform.search_item si on si.entity_id = l.conversation_id and si.entity_token = 'conversation'
     order by l.created_at desc, l.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crm_chasebox_items(p_queue text, p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(queue text, id uuid, interaction_id uuid, member_id uuid, party_id uuid, party_name text, employer_name text, outreach_list_id uuid, outreach_list_name text, outreach_list_status text, sending_identity_id uuid, sending_identity_label text, subject text, detail text, problem_code text, problem_message text, problem_fix text, step integer, occurred_at timestamp with time zone, organization_id uuid, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, 'mine'));
  v_queue text := lower(coalesce(p_queue, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'crm_chasebox_items: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs') THEN
    RAISE EXCEPTION 'crm_chasebox_items: unsupported scope %', v_scope;
  END IF;
  IF v_queue NOT IN ('fresh_replies','pending_drafts','stalled_sequences',
                     'blocked_members','escalation_candidates') THEN
    RAISE EXCEPTION 'crm_chasebox_items: unknown queue %', v_queue;
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    SELECT DISTINCT m.container_id AS org_id
    FROM iam.memberships m
    WHERE m.user_id = v_uid AND m.container_type = 'organization'
      AND (p_org_id IS NULL OR m.container_id = p_org_id)
  ),
  -- THE RLS CEILING for the member half: crm.outreach_list_member's std_select
  -- keys on reach to its parent crm_outreach_list.
  reachable_lists AS (
    SELECT ol.id AS list_id, ol.name AS list_name, ol.status AS list_status,
           ol.lane AS list_lane, ol.sending_identity_id AS list_identity_id,
           ol.definition AS list_definition, ol.organization_id AS list_org_id,
           ol.created_by AS list_created_by, ol.paused_at AS list_paused_at,
           ol.pause_reason AS list_pause_reason
    FROM crm.outreach_list ol
    WHERE ol.deleted_at IS NULL
      AND ol.id IN (SELECT unnest(iam.accessible_entity_ids('crm_outreach_list'::text, 'viewer'::permission_level)))
      AND ((v_scope = 'mine' AND ol.created_by = v_uid)
        OR (v_scope IN ('orgs','team') AND ol.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
            -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
            AND (v_scope <> 'team' OR (ol.organization_id, ol.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))))
  ),
  reachable_parties AS (
    SELECT unnest(iam.accessible_entity_ids('party'::text, 'viewer'::permission_level)) AS pid
  ),

  -- ── 1. FRESH REPLIES ──────────────────────────────────────────────────────
  q_fresh AS (
    SELECT
      'fresh_replies'::text AS r_queue,
      r.id                  AS r_id,
      r.id                  AS r_interaction_id,
      r.member_id           AS r_member_id,
      r.party_id            AS r_party_id,
      r.party_name          AS r_party_name,
      r.employer_name       AS r_employer_name,
      r.outreach_list_id    AS r_list_id,
      r.outreach_list_name  AS r_list_name,
      r.outreach_list_status AS r_list_status,
      r.sending_identity_id AS r_identity_id,
      r.sending_identity_label AS r_identity_label,
      r.subject             AS r_subject,
      r.snippet             AS r_detail,
      coalesce(r.classification, 'unclassified') AS r_problem_code,
      coalesce(r.evidence, 'A real person replied and nobody has answered yet.') AS r_problem_message,
      'Read it and reply through the same governed send path.'::text AS r_problem_fix,
      r.step                AS r_step,
      r.occurred_at         AS r_occurred,
      r.organization_id     AS r_org_id
    FROM public.crm_inbox_list_scoped(v_scope, p_org_id, NULL, false, 'occurred', 'desc',
           jsonb_build_object('handled', jsonb_build_object('value', false)), 1000000, 0) r
    WHERE v_queue = 'fresh_replies'
  ),

  -- ── 2. DRAFTS AWAITING APPROVAL (IC-6) ────────────────────────────────────
  -- The sequence runner leaves a step `planned` whenever the earned-trust
  -- ladder says a human must approve it (D-W1-2). Surfacing those is a
  -- first-class Chasebox job — an unapproved draft is a stopped campaign.
  q_drafts AS (
    SELECT
      'pending_drafts'::text, i.id, i.id,
      nullif(i.attributes #>> '{outreach_single_send,member_id}', '')::uuid,
      i.party_id,
      pt.display_name,
      emp.display_name,
      i.outreach_list_id,
      ol.name, ol.status::text,
      ol.sending_identity_id,
      coalesce(nullif(si.from_name,''), si.from_address),
      coalesce(nullif(btrim(i.subject),''), '(no subject)'),
      left(coalesce(i.body,''), 400),
      'awaiting_approval'::text,
      'This message is written and waiting for a human to approve it.'::text,
      'Open it, read the exact rendered message, then approve and send.'::text,
      i.attempt_number::integer,
      coalesce(i.scheduled_at, i.created_at),
      i.organization_id
    FROM crm.interaction i
    LEFT JOIN crm.party pt          ON pt.id = i.party_id
    LEFT JOIN crm.party emp         ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.outreach_list ol  ON ol.id = i.outreach_list_id
    LEFT JOIN crm.sending_identity si ON si.id = ol.sending_identity_id
    WHERE v_queue = 'pending_drafts'
      AND i.deleted_at IS NULL
      AND i.direction = 'outbound'
      AND i.status = 'planned'
      AND i.attributes ? 'outreach_single_send'
      AND (i.party_id IN (SELECT rp.pid FROM reachable_parties rp)
           OR iam.has_access('crm_interaction'::text, i.id, 'viewer'::permission_level))
      AND ((v_scope = 'mine' AND (i.created_by = v_uid OR i.assigned_to = v_uid))
        OR (v_scope IN ('orgs','team') AND i.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
            -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
            AND (v_scope <> 'team' OR (i.organization_id, i.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))))
  ),

  -- ── 3. STALLED SEQUENCES ──────────────────────────────────────────────────
  -- Two ways a member stops moving: its own retry time passed and nothing
  -- happened, or the campaign/mailbox above it is paused. Both render the real
  -- pause_reason and a door to the thing that can resume it.
  q_stalled AS (
    SELECT
      'stalled_sequences'::text, m.id, NULL::uuid, m.id, m.party_id,
      pt.display_name, emp.display_name,
      rl.list_id, rl.list_name, rl.list_status::text,
      rl.list_identity_id, coalesce(nullif(si.from_name,''), si.from_address),
      NULL::text,
      'Step ' || coalesce(m.current_step, 0)::text || ' · ' ||
        coalesce(m.attempt_count, 0)::text || ' attempt(s) · status ' || m.status,
      CASE
        WHEN rl.list_paused_at IS NOT NULL THEN 'campaign_paused'
        WHEN si.paused_at IS NOT NULL THEN 'mailbox_paused'
        ELSE 'overdue'
      END::text,
      CASE
        WHEN rl.list_paused_at IS NOT NULL
          THEN 'The campaign is paused' ||
               coalesce(' — ' || nullif(rl.list_pause_reason,''), '') || '.'
        WHEN si.paused_at IS NOT NULL
          THEN 'The sending mailbox is paused' ||
               coalesce(' — ' || nullif(si.pause_reason,''), '') || '.'
        ELSE 'This step was due ' || to_char(m.next_attempt_at, 'YYYY-MM-DD HH24:MI') ||
             ' and has not moved since.'
      END::text,
      CASE
        WHEN rl.list_paused_at IS NOT NULL THEN 'Open the campaign and resume it, or fix what paused it.'
        WHEN si.paused_at IS NOT NULL THEN 'Open the mailbox checklist and resume sending.'
        ELSE 'Open the campaign and advance or retire this member.'
      END::text,
      m.current_step::integer,
      m.next_attempt_at,
      m.organization_id
    FROM crm.outreach_list_member m
    JOIN reachable_lists rl ON rl.list_id = m.outreach_list_id
    LEFT JOIN crm.party pt  ON pt.id = m.party_id
    LEFT JOIN crm.party emp ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.sending_identity si ON si.id = rl.list_identity_id
    WHERE v_queue = 'stalled_sequences'
      AND m.deleted_at IS NULL
      AND m.status NOT IN ('replied','not_interested','meeting_booked','suppressed','done','bounced')
      AND (
        (m.next_attempt_at IS NOT NULL AND m.next_attempt_at < now())
        OR rl.list_paused_at IS NOT NULL
        OR si.paused_at IS NOT NULL
      )
  ),

  -- ── 4. BLOCKED MEMBERS ────────────────────────────────────────────────────
  -- The send WOULD refuse. Cheap structural blocks are resolved in SQL; where a
  -- medium exists we ask crm.check_send_eligibility — THE ONE AUTHORITY — and
  -- render its own `fix`. Never a second copy of a compliance check.
  q_blocked AS (
    SELECT
      'blocked_members'::text, m.id, NULL::uuid, m.id, m.party_id,
      pt.display_name, emp.display_name,
      rl.list_id, rl.list_name, rl.list_status::text,
      rl.list_identity_id, coalesce(nullif(si.from_name,''), si.from_address),
      NULL::text,
      coalesce(cm.display_value, 'No contact point attached'),
      blk.b_code, blk.b_message, blk.b_fix,
      m.current_step::integer,
      m.last_attempt_at,
      m.organization_id
    FROM crm.outreach_list_member m
    JOIN reachable_lists rl ON rl.list_id = m.outreach_list_id
    LEFT JOIN crm.party pt  ON pt.id = m.party_id
    LEFT JOIN crm.party emp ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.sending_identity si ON si.id = rl.list_identity_id
    LEFT JOIN crm.party_contact_point cp ON cp.id = m.contact_point_id AND cp.deleted_at IS NULL
    LEFT JOIN crm.contact_medium cm ON cm.id = cp.medium_id AND cm.deleted_at IS NULL
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN m.contact_point_id IS NULL THEN 'recipient_not_in_list'
          WHEN cp.id IS NULL THEN 'contact_point_missing'
          WHEN pt.do_not_contact THEN 'party_do_not_contact'
          WHEN cp.opt_out_at IS NOT NULL THEN 'contact_point_opted_out'
          WHEN cm.id IS NULL THEN 'medium_missing'
          WHEN cm.is_contactable IS NOT TRUE THEN 'medium_not_contactable'
          ELSE nullif(v.v_first_block #>> '{code}', '')
        END AS b_code,
        CASE
          WHEN m.contact_point_id IS NULL
            THEN 'This member has no contact point, so eligibility always fails with recipient_not_in_list.'
          WHEN cp.id IS NULL THEN 'The attached contact point has been deleted.'
          WHEN pt.do_not_contact
            THEN 'This record is flagged do-not-contact. The send gate does not read that flag — the runner enforces it, so nothing will go out.'
          WHEN cp.opt_out_at IS NOT NULL THEN 'This person opted this address out.'
          WHEN cm.id IS NULL THEN 'The contact point points at a medium that no longer exists.'
          WHEN cm.is_contactable IS NOT TRUE
            THEN 'This address is suppressed, unsubscribed, complained, DNC-listed or hard-bounced.'
          ELSE coalesce(v.v_first_block #>> '{message}', 'The send gate refuses this recipient.')
        END AS b_message,
        CASE
          WHEN m.contact_point_id IS NULL
            THEN 'Open the record and attach the email address to use, then re-enroll.'
          WHEN cp.id IS NULL THEN 'Open the record and attach a live contact point.'
          WHEN pt.do_not_contact
            THEN 'Open the record — lift do-not-contact only if it was set by mistake.'
          WHEN cp.opt_out_at IS NOT NULL THEN 'An opt-out is not ours to lift. Remove this member from the campaign.'
          WHEN cm.id IS NULL THEN 'Open the record and re-add the address.'
          WHEN cm.is_contactable IS NOT TRUE
            THEN 'Open the record to see exactly what is on this value; a mistaken do-not-call is reversible, a legal opt-out is not.'
          ELSE coalesce(v.v_first_block #>> '{fix}', 'Open the sending checklist and resolve this item.')
        END AS b_fix
      FROM (
        SELECT CASE
          WHEN cm.id IS NULL OR cm.is_contactable IS NOT TRUE THEN NULL
          ELSE (crm.check_send_eligibility(cm.id, rl.list_id, rl.list_identity_id) -> 'blocks' -> 0)
        END AS v_first_block
      ) v
    ) blk
    WHERE v_queue = 'blocked_members'
      AND m.deleted_at IS NULL
      AND m.status NOT IN ('replied','not_interested','meeting_booked','done')
      AND blk.b_code IS NOT NULL
  ),

  -- ── 5. SECONDARY-CONTACT ESCALATION CANDIDATES ────────────────────────────
  -- The sequence finished and nobody replied. Rendered as a SUGGESTION only —
  -- research/03 is explicit that this never auto-sends.
  q_escalation AS (
    SELECT
      'escalation_candidates'::text, m.id, NULL::uuid, m.id, m.party_id,
      pt.display_name, emp.display_name,
      rl.list_id, rl.list_name, rl.list_status::text,
      rl.list_identity_id, coalesce(nullif(si.from_name,''), si.from_address),
      NULL::text,
      coalesce(m.attempt_count, 0)::text || ' message(s) sent · last '
        || coalesce(to_char(m.last_attempt_at, 'YYYY-MM-DD'), 'unknown'),
      'no_reply_after_sequence'::text,
      'The whole sequence ran and this person never replied.'::text,
      'Consider a different person at the same company — review the record and enroll them deliberately. Nothing is sent automatically.'::text,
      m.current_step::integer,
      m.last_attempt_at,
      m.organization_id
    FROM crm.outreach_list_member m
    JOIN reachable_lists rl ON rl.list_id = m.outreach_list_id
    LEFT JOIN crm.party pt  ON pt.id = m.party_id
    LEFT JOIN crm.party emp ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.sending_identity si ON si.id = rl.list_identity_id
    WHERE v_queue = 'escalation_candidates'
      AND m.deleted_at IS NULL
      AND m.status IN ('sent','delivered','opened','clicked','done')
      AND coalesce(m.attempt_count, 0) > 0
      -- Sequence exhausted: either the campaign itself is finished, or the
      -- member walked past the last step in definition.sequence.
      AND (rl.list_status = 'completed'
           OR (jsonb_typeof(rl.list_definition -> 'sequence') = 'array'
               AND coalesce(m.current_step, 0) >= jsonb_array_length(rl.list_definition -> 'sequence')))
      AND NOT EXISTS (
        SELECT 1 FROM crm.interaction ri
        WHERE ri.deleted_at IS NULL
          AND ri.direction = 'inbound'
          AND ri.party_id = m.party_id
          AND ri.outreach_list_id = m.outreach_list_id
      )
  ),

  merged AS (
    SELECT * FROM q_fresh
    UNION ALL SELECT * FROM q_drafts
    UNION ALL SELECT * FROM q_stalled
    UNION ALL SELECT * FROM q_blocked
    UNION ALL SELECT * FROM q_escalation
  ),
  counted AS (SELECT x.*, count(*) OVER () AS x_total FROM merged x)
  SELECT
    c.r_queue, c.r_id, c.r_interaction_id, c.r_member_id, c.r_party_id,
    c.r_party_name, c.r_employer_name, c.r_list_id, c.r_list_name, c.r_list_status,
    c.r_identity_id, c.r_identity_label, c.r_subject, c.r_detail,
    c.r_problem_code, c.r_problem_message, c.r_problem_fix, c.r_step,
    c.r_occurred, c.r_org_id, c.x_total
  FROM counted c
  -- Oldest pain first: the thing that has been stuck longest is the thing that
  -- most needs a human. Total order (ends in id) per the template.
  ORDER BY c.r_occurred ASC NULLS FIRST, c.r_id
  LIMIT greatest(coalesce(p_limit, 50), 1) OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_inbox_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'occurred'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, occurred_at timestamp with time zone, created_at timestamp with time zone, channel_code text, subject text, snippet text, thread_key text, classification text, evidence text, handled boolean, handled_at timestamp with time zone, party_id uuid, party_name text, party_kind text, employer_id uuid, employer_name text, outreach_list_id uuid, outreach_list_name text, outreach_list_status text, member_id uuid, member_status text, step integer, outbound_id uuid, outbound_subject text, outbound_sent_at timestamp with time zone, sending_identity_id uuid, sending_identity_label text, reputation_case_id uuid, reputation_case_label text, reputation_case_site_id uuid, reputation_case_brand_id uuid, backlink_id uuid, backlink_label text, backlink_site_id uuid, backlink_brand_id uuid, organization_id uuid, organization_name text, is_owner boolean, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_scope  text := lower(coalesce(p_scope, platform.entity_default_list_scope('crm_interaction')));
  v_dir    text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort   text := lower(coalesce(p_sort, 'occurred'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f      jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'crm_inbox_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','team','orgs') THEN
    RAISE EXCEPTION 'crm_inbox_list_scoped: unsupported scope % (this surface declares mine|orgs)', v_scope;
  END IF;
  IF v_sort NOT IN ('occurred','created','party_name','subject','snippet','classification',
                    'outreach_list_name','sending_identity_label','employer_name','step',
                    'handled','channel','organization_name','member_status','why') THEN
    v_sort := 'occurred';
  END IF;

  RETURN QUERY
  WITH reachable_parties AS (
    SELECT unnest(iam.accessible_entity_ids('party'::text, 'viewer'::permission_level)) AS party_id
  ),
  inbound AS (
    SELECT
      i.id                       AS u_id,
      coalesce(i.occurred_at, i.created_at) AS u_occurred,
      i.created_at               AS u_created,
      i.channel_code             AS u_channel,
      coalesce(nullif(btrim(i.subject), ''), '(no subject)') AS u_subject,
      left(coalesce(i.body, ''), 400) AS u_snippet,
      i.body                     AS u_body,
      i.thread_key               AS u_thread_key,
      public.crm_inbound_label(i.attributes)    AS u_classification,
      public.crm_inbound_evidence(i.attributes) AS u_evidence,
      (i.attributes #>> '{inbox,handled_at}')::timestamptz AS u_handled_at,
      i.party_id                 AS u_party_id,
      i.outreach_list_id         AS u_list_id,
      i.organization_id          AS u_org_id,
      i.created_by               AS u_created_by,
      i.assigned_to              AS u_assigned_to
    FROM crm.interaction i
    WHERE i.deleted_at IS NULL
      AND i.direction = 'inbound'
      -- THE RLS CEILING, RESTATED (crm.interaction std_select).
      AND (i.party_id IN (SELECT rp.party_id FROM reachable_parties rp)
           OR iam.has_access('crm_interaction'::text, i.id, 'viewer'::permission_level))
  ),
  scoped AS (
    -- MINE — the runner acts as the campaign owner (D-W1-3), so an ingested
    -- reply on my campaign carries created_by = me. Assignment counts too: a
    -- reply handed to me is mine to answer.
    SELECT b.*, true AS s_is_owner
    FROM inbound b
    WHERE v_scope = 'mine'
      AND (b.u_created_by = v_uid OR b.u_assigned_to = v_uid)
    UNION ALL
    SELECT b.*, (b.u_created_by = v_uid) AS s_is_owner
    FROM inbound b
    WHERE v_scope IN ('orgs','team')
      AND (p_org_id IS NULL OR b.u_org_id = p_org_id) AND b.u_org_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (b.u_org_id, b.u_created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
  ),
  -- The outbound step this reply answers: same Gmail thread, sent at or before
  -- the reply. D-W1-5 — correlation is by thread_key, never RFC822 Message-ID.
  contextual AS (
    SELECT
      s.*,
      ob.id           AS x_outbound_id,
      ob.subject      AS x_outbound_subject,
      coalesce(ob.occurred_at, ob.created_at) AS x_outbound_sent_at,
      ob.attempt_number::integer AS x_step,
      nullif(ob.attributes #>> '{outreach_single_send,reputation_case_id}', '')::uuid AS x_reputation_case_id,
      nullif(ob.attributes #>> '{outreach_single_send,backlink_id}', '')::uuid        AS x_backlink_id,
      nullif(ob.attributes #>> '{outreach_single_send,member_id}', '')::uuid          AS x_member_id
    FROM scoped s
    LEFT JOIN LATERAL (
      SELECT o.*
      FROM crm.interaction o
      WHERE o.deleted_at IS NULL
        AND o.direction = 'outbound'
        AND s.u_thread_key IS NOT NULL
        AND o.thread_key = s.u_thread_key
        AND coalesce(o.occurred_at, o.created_at) <= s.u_occurred
      ORDER BY coalesce(o.occurred_at, o.created_at) DESC, o.id
      LIMIT 1
    ) ob ON true
  ),
  joined AS (
    SELECT
      c.*,
      pt.display_name                AS j_party_name,
      pt.party_kind                  AS j_party_kind,
      pt.primary_employer_party_id   AS j_employer_id,
      emp.display_name               AS j_employer_name,
      ol.name                        AS j_list_name,
      ol.status                      AS j_list_status,
      ol.sending_identity_id         AS j_identity_id,
      coalesce(nullif(si.from_name, ''), si.from_address) AS j_identity_label,
      org.name                       AS j_org_name,
      mem.id                         AS j_member_id,
      mem.status                     AS j_member_status,
      coalesce(nullif(rc.headline,''), nullif(rc.source_title,''), rc.source_domain) AS j_case_label,
      rc.site_id                     AS j_case_site_id,
      rcs.brand_id                   AS j_case_brand_id,
      coalesce(nullif(bl.source_url,''), bl.source_domain) AS j_backlink_label,
      bl.site_id                     AS j_backlink_site_id,
      bls.brand_id                   AS j_backlink_brand_id,
      -- HANDLED. Two independent, honest signals; neither is a new table:
      --   (a) a human pressed "Mark handled" -> attributes.inbox.handled_at
      --   (b) we already answered -> a later outbound in the same thread
      -- (b) means replying through the ONE send primitive clears the row on its
      -- own, so the queue cannot rot behind a forgotten checkbox.
      (c.u_handled_at IS NOT NULL
       OR EXISTS (
            SELECT 1 FROM crm.interaction r
            WHERE r.deleted_at IS NULL
              AND r.direction = 'outbound'
              AND c.u_thread_key IS NOT NULL
              AND r.thread_key = c.u_thread_key
              AND coalesce(r.occurred_at, r.created_at) > c.u_occurred
          )) AS j_handled
    FROM contextual c
    LEFT JOIN crm.party pt              ON pt.id  = c.u_party_id
    LEFT JOIN crm.party emp             ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.outreach_list ol      ON ol.id  = c.u_list_id
    LEFT JOIN crm.sending_identity si   ON si.id  = ol.sending_identity_id
    LEFT JOIN iam.organizations org     ON org.id = c.u_org_id
    LEFT JOIN crm.outreach_list_member mem ON mem.id = c.x_member_id AND mem.deleted_at IS NULL
    LEFT JOIN seo.reputation_case rc    ON rc.id  = c.x_reputation_case_id
    LEFT JOIN web.site rcs              ON rcs.id = rc.site_id
    LEFT JOIN seo.backlink bl           ON bl.id  = c.x_backlink_id
    LEFT JOIN web.site bls              ON bls.id = bl.site_id
  ),
  filtered AS (
    SELECT j.*,
      (p_deep AND v_search IS NOT NULL AND coalesce(j.u_body,'') ILIKE '%'||v_search||'%') AS f_deep_hit
    FROM joined j
    WHERE (v_search IS NULL
        OR coalesce(j.j_party_name,'')   ILIKE '%'||v_search||'%'
        OR j.u_subject                   ILIKE '%'||v_search||'%'
        OR j.u_snippet                   ILIKE '%'||v_search||'%'
        OR coalesce(j.j_list_name,'')    ILIKE '%'||v_search||'%'
        OR coalesce(j.j_employer_name,'')ILIKE '%'||v_search||'%'
        OR (p_deep AND coalesce(j.u_body,'') ILIKE '%'||v_search||'%'))
      AND (NOT v_f ? 'party_name'  OR coalesce(j.j_party_name,'') ILIKE '%'||(v_f->'party_name'->>'value')||'%')
      AND (NOT v_f ? 'subject'     OR j.u_subject ILIKE '%'||(v_f->'subject'->>'value')||'%')
      AND (NOT v_f ? 'snippet'     OR j.u_snippet ILIKE '%'||(v_f->'snippet'->>'value')||'%')
      AND (NOT v_f ? 'employer_name' OR coalesce(j.j_employer_name,'') ILIKE '%'||(v_f->'employer_name'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.j_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      -- "Why we wrote" is a projection of the two motivating records; it filters
      -- and sorts like every other column rather than being the one exempt.
      AND (NOT v_f ? 'why'
           OR coalesce(j.j_case_label, j.j_backlink_label, '') ILIKE '%'||(v_f->'why'->>'value')||'%')
      AND (NOT v_f ? 'classification'
           OR coalesce(nullif(j.u_classification,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'classification'->'values')))
      AND (NOT v_f ? 'outreach_list_name'
           OR coalesce(nullif(j.j_list_name,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'outreach_list_name'->'values')))
      AND (NOT v_f ? 'sending_identity_label'
           OR coalesce(nullif(j.j_identity_label,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'sending_identity_label'->'values')))
      AND (NOT v_f ? 'member_status'
           OR coalesce(nullif(j.j_member_status,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'member_status'->'values')))
      AND (NOT v_f ? 'channel'
           OR j.u_channel IN (SELECT jsonb_array_elements_text(v_f->'channel'->'values')))
      AND (NOT v_f ? 'handled'
           OR j.j_handled IS NOT DISTINCT FROM (v_f->'handled'->>'value')::boolean)
      AND (NOT v_f ? 'step'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'step'->'values') b
                      WHERE public.crm_step_matches(j.x_step, b)))
      AND (NOT v_f ? 'occurred' OR j.u_occurred >= public.agx_since_bucket(v_f->'occurred'->'values'->>0))
      AND (NOT v_f ? 'created'  OR j.u_created  >= public.agx_since_bucket(v_f->'created'->'values'->>0))
  ),
  scored AS (
    -- Only a real page pays for per-row plpgsql scoring; the counts/facets
    -- callers come through with LIMIT 1 (same guard as trx_list_scoped).
    SELECT f.*, CASE WHEN v_search IS NOT NULL AND coalesce(p_limit, 25) > 1
      THEN public.crm_inbox_search_score(
        v_search, f.u_id, f.j_party_name, f.u_subject, f.u_snippet,
        f.j_list_name, f.j_employer_name, f.u_classification, f.f_deep_hit)
      ELSE 0 END AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT
    c.u_id, c.u_occurred, c.u_created, c.u_channel, c.u_subject, c.u_snippet,
    c.u_thread_key, c.u_classification, c.u_evidence, c.j_handled, c.u_handled_at,
    c.u_party_id, c.j_party_name, c.j_party_kind::text, c.j_employer_id, c.j_employer_name,
    c.u_list_id, c.j_list_name, c.j_list_status::text,
    c.j_member_id, c.j_member_status::text, c.x_step,
    c.x_outbound_id, c.x_outbound_subject, c.x_outbound_sent_at,
    c.j_identity_id, c.j_identity_label,
    c.x_reputation_case_id, c.j_case_label, c.j_case_site_id, c.j_case_brand_id,
    c.x_backlink_id, c.j_backlink_label, c.j_backlink_site_id, c.j_backlink_brand_id,
    c.u_org_id, c.j_org_name, c.s_is_owner, c.s_total
  FROM counted c
  ORDER BY
    -- RELEVANCE FIRST while searching (lib/entity-list/FEATURE.md rule 4).
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN v_sort='occurred'   AND v_dir='desc' THEN c.u_occurred END DESC,
    CASE WHEN v_sort='occurred'   AND v_dir='asc'  THEN c.u_occurred END ASC,
    CASE WHEN v_sort='created'    AND v_dir='desc' THEN c.u_created END DESC,
    CASE WHEN v_sort='created'    AND v_dir='asc'  THEN c.u_created END ASC,
    CASE WHEN v_sort='party_name' AND v_dir='desc' THEN lower(coalesce(c.j_party_name,'')) END DESC,
    CASE WHEN v_sort='party_name' AND v_dir='asc'  THEN lower(coalesce(c.j_party_name,'')) END ASC,
    CASE WHEN v_sort='subject'    AND v_dir='desc' THEN lower(c.u_subject) END DESC,
    CASE WHEN v_sort='subject'    AND v_dir='asc'  THEN lower(c.u_subject) END ASC,
    CASE WHEN v_sort='snippet'    AND v_dir='desc' THEN lower(c.u_snippet) END DESC,
    CASE WHEN v_sort='snippet'    AND v_dir='asc'  THEN lower(c.u_snippet) END ASC,
    CASE WHEN v_sort='classification' AND v_dir='desc' THEN lower(coalesce(c.u_classification,'')) END DESC,
    CASE WHEN v_sort='classification' AND v_dir='asc'  THEN lower(coalesce(c.u_classification,'')) END ASC,
    CASE WHEN v_sort='outreach_list_name' AND v_dir='desc' THEN lower(coalesce(c.j_list_name,'')) END DESC,
    CASE WHEN v_sort='outreach_list_name' AND v_dir='asc'  THEN lower(coalesce(c.j_list_name,'')) END ASC,
    CASE WHEN v_sort='sending_identity_label' AND v_dir='desc' THEN lower(coalesce(c.j_identity_label,'')) END DESC,
    CASE WHEN v_sort='sending_identity_label' AND v_dir='asc'  THEN lower(coalesce(c.j_identity_label,'')) END ASC,
    CASE WHEN v_sort='employer_name' AND v_dir='desc' THEN lower(coalesce(c.j_employer_name,'')) END DESC,
    CASE WHEN v_sort='employer_name' AND v_dir='asc'  THEN lower(coalesce(c.j_employer_name,'')) END ASC,
    CASE WHEN v_sort='member_status' AND v_dir='desc' THEN lower(coalesce(c.j_member_status,'')) END DESC,
    CASE WHEN v_sort='member_status' AND v_dir='asc'  THEN lower(coalesce(c.j_member_status,'')) END ASC,
    CASE WHEN v_sort='channel'  AND v_dir='desc' THEN c.u_channel END DESC,
    CASE WHEN v_sort='channel'  AND v_dir='asc'  THEN c.u_channel END ASC,
    CASE WHEN v_sort='step'     AND v_dir='desc' THEN c.x_step END DESC NULLS LAST,
    CASE WHEN v_sort='step'     AND v_dir='asc'  THEN c.x_step END ASC NULLS LAST,
    CASE WHEN v_sort='handled'  AND v_dir='desc' THEN c.j_handled END DESC,
    CASE WHEN v_sort='handled'  AND v_dir='asc'  THEN c.j_handled END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.j_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc'  THEN lower(coalesce(c.j_org_name,'')) END ASC,
    CASE WHEN v_sort='why' AND v_dir='desc' THEN lower(coalesce(c.j_case_label, c.j_backlink_label,'')) END DESC,
    CASE WHEN v_sort='why' AND v_dir='asc'  THEN lower(coalesce(c.j_case_label, c.j_backlink_label,'')) END ASC,
    c.u_id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_pending_changes(p_employment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_on date := current_date; v_emp_id uuid; v_v jsonb; v_kind text;
  v_comp boolean;
begin
  if v_uid is null then
    raise exception 'hr_pending_changes: no authenticated caller' using errcode = '42501';
  end if;
  select em.employee_id into v_emp_id from hr.employment em where em.id = p_employment_id;
  if v_emp_id is null then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;
  v_v := hr._l1_viewer(v_uid, v_emp_id, v_on);
  v_kind := coalesce(v_v ->> 'kind', 'none');
  if v_kind in ('none','peer') then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;
  v_comp := v_kind = 'self' or hr.capability(v_uid, 'comp.read', p_employment_id, v_on);

  return jsonb_build_object(
    'granted', true,
    'positions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pa.id, 'kind', 'position', 'effective_from', pa.effective_from,
        'job_title', jt.title, 'department', d.name, 'location', l.name,
        'manager_employment_id', pa.manager_employment_id,
        'fte', pa.fte, 'worker_class', pa.worker_class, 'flsa_status', pa.flsa_status,
        'change_reason', cat.name,
        'supersedes_id', pa.supersedes_id,
        'is_first', pa.supersedes_id is null,
        'requested_by', req.display_name,
        -- RECORDED DECISION 23: the FROM half, straight off supersedes_id. Never guessed.
        'previous', case when prev.id is null then null else jsonb_build_object(
            'id', prev.id, 'effective_from', prev.effective_from,
            'job_title', pjt.title, 'department', pd.name, 'location', pl.name,
            'manager_employment_id', prev.manager_employment_id,
            'fte', prev.fte, 'worker_class', prev.worker_class,
            'flsa_status', prev.flsa_status) end,
        'changed_fields', case when prev.id is null then '[]'::jsonb else (
            select coalesce(jsonb_agg(f), '[]'::jsonb) from (
              select 'job_title' as f where prev.job_title_id is distinct from pa.job_title_id
              union all select 'department' where prev.department_id is distinct from pa.department_id
              union all select 'location' where prev.location_id is distinct from pa.location_id
              union all select 'manager' where prev.manager_employment_id is distinct from pa.manager_employment_id
              union all select 'fte' where prev.fte is distinct from pa.fte
              union all select 'worker_class' where prev.worker_class is distinct from pa.worker_class
              union all select 'flsa_status' where prev.flsa_status is distinct from pa.flsa_status
            ) s) end,
        'can_cancel', true) order by pa.effective_from), '[]'::jsonb)
      from hr.position_assignment pa
      left join hr.job_title jt on jt.id = pa.job_title_id
      left join hr.department d on d.id = pa.department_id
      left join hr.location l on l.id = pa.location_id
      left join platform.categories cat on cat.id = pa.change_reason_category_id
      -- 🚨 ONE REQUESTER PER PENDING CHANGE (hr_l1_70) — the same defect the Job tab carried,
      -- in the same construction. A plain join on `req.login_user_id = pa.created_by` listed
      -- one scheduled change twice, with a different name on each copy, the moment two employee
      -- rows shared a login. LATERAL … LIMIT 1 makes one row per change structural.
      left join lateral (
        select r.display_name
          from hr.employee r
         where r.login_user_id = pa.created_by
           and r.organization_id = pa.organization_id
         order by (r.deleted_at is null) desc, r.created_at, r.id
         limit 1) req on true
      left join hr.position_assignment prev on prev.id = pa.supersedes_id
      left join hr.job_title  pjt on pjt.id = prev.job_title_id
      left join hr.department pd  on pd.id  = prev.department_id
      left join hr.location   pl  on pl.id  = prev.location_id
     where pa.employment_id = p_employment_id and pa.deleted_at is null
       and pa.effective_from > v_on),

    'compensation', case when v_comp then (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', 'compensation', 'effective_from', c.effective_from,
        'component_kind', c.component_kind, 'amount', c.amount, 'currency', c.currency,
        'per_unit', c.per_unit, 'pay_basis', c.pay_basis,
        'change_reason', cat.name, 'approved_at', c.approved_at,
        'approved_by', appr.display_name,
        'supersedes_id', c.supersedes_id,
        'is_first', c.supersedes_id is null,
        -- a prior salary is a salary: only returned inside the comp lane the row already needed
        'previous', case when pc.id is null then null else jsonb_build_object(
            'id', pc.id, 'effective_from', pc.effective_from, 'amount', pc.amount,
            'currency', pc.currency, 'per_unit', pc.per_unit, 'pay_basis', pc.pay_basis) end,
        'delta', case when pc.id is null then null else c.amount - pc.amount end,
        'can_cancel', true) order by c.effective_from), '[]'::jsonb)
      from hr.compensation c
      left join platform.categories cat on cat.id = c.change_reason_category_id
      left join hr.compensation pc on pc.id = c.supersedes_id
      left join hr.employment aem on aem.id = c.approved_by_employment_id
      left join hr.employee appr on appr.id = aem.employee_id
     where c.employment_id = p_employment_id and c.deleted_at is null
       and c.effective_from > v_on) else '[]'::jsonb end,

    'reporting_lines', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', rl.id, 'kind', 'reporting_line', 'effective_from', rl.effective_from,
        'line_kind', rl.line_kind, 'manager_employment_id', rl.manager_employment_id,
        'manager_name', mgr.display_name,
        'supersedes_id', rl.supersedes_id, 'is_first', rl.supersedes_id is null,
        'previous', case when prl.id is null then null else jsonb_build_object(
            'id', prl.id, 'line_kind', prl.line_kind,
            'manager_employment_id', prl.manager_employment_id) end,
        'can_cancel', true) order by rl.effective_from), '[]'::jsonb)
      from hr.reporting_line rl
      left join hr.reporting_line prl on prl.id = rl.supersedes_id
      left join hr.employment mem on mem.id = rl.manager_employment_id
      left join hr.employee mgr on mgr.id = mem.employee_id
     where rl.employment_id = p_employment_id and rl.deleted_at is null
       and rl.effective_from > v_on),

    'in_flight', (select coalesce(jsonb_agg(jsonb_build_object(
        'instance_id', wi.id, 'flow_key', wi.flow_key, 'state', wi.state,
        'target_token', wi.target_token, 'target_id', wi.target_id,
        'submitted_at', wi.submitted_at, 'due_at', wi.due_at,
        'payload', case when v_comp or wi.flow_key <> 'pay_change' then wi.payload end,
        'current_step', act.step_key,
        'current_step_label', act.label,
        'current_step_due_at', act.due_at,
        -- RECORDED DECISION 23: the approver, by NAME. §6.2 asks who it is sitting with, and
        -- "Now with: hr_approval" is a step key, not an answer.
        'current_approvers', coalesce(act.approvers, '[]'::jsonb),
        'approvals_needed', act.approvals_needed,
        'approvals_received', act.approvals_received)
      order by wi.created_at desc), '[]'::jsonb)
      from hr.workflow_instance wi
      left join lateral (
        select ws.step_key, sd.label, ws.due_at, ws.approvals_needed, ws.approvals_received,
               (select coalesce(jsonb_agg(jsonb_build_object(
                          'employment_id', ae.employment_id, 'display_name', e2.display_name)
                        order by e2.display_name), '[]'::jsonb)
                  from unnest(ws.resolved_approver_ids) as ae(employment_id)
                  join hr.employment aem2 on aem2.id = ae.employment_id
                  join hr.employee e2 on e2.id = aem2.employee_id) as approvers
          from hr.workflow_step ws
          left join hr.workflow_step_definition sd on sd.id = ws.step_definition_id
         where ws.workflow_instance_id = wi.id and ws.state = 'active'
         order by ws.step_order limit 1) act on true
     where wi.subject_employment_id = p_employment_id
       -- 🚨 THE STATES THIS FILTER NAMED DO NOT EXIST.
       -- It asked for four states that `hr.workflow_instance` has never held; the table's
       -- vocabulary is ('active','closed','failed','cancelled'), and the `hr.wf_request` door
       -- creates every request as 'active'. So `in_flight` was ALWAYS an empty array, for
       -- every flow and every person, and it looked exactly like "nothing is pending".
       -- That is what made a self-service edit vanish: the request really was opened, the
       -- approver really was waiting, and the field went back to showing its old value
       -- because the one door that could have said otherwise answered with [].
       -- A closed vocabulary invented rather than read is not a narrower filter, it is an
       -- empty one — and an empty list is the most convincing lie a door can tell.
       --
       -- 🚨 THAT DOOR IS NAMED UNQUALIFIED ON PURPOSE — DO NOT "FIX" IT TO hr.<name>.
       -- The F1 gate (hr.stable_doors_that_write) builds its call graph by testing whether
       -- one function's prosrc CONTAINS another's qualified name. It cannot tell a call from
       -- a comment, so writing the schema-qualified name here — as this comment originally
       -- did — invented an edge from this STABLE read door to a writer, and transitively to
       -- six more, turning F1 red over prose. The reach was never real: this function calls
       -- nothing. Keep workflow-door names unqualified inside comments in STABLE doors.
       and wi.state = 'active'
       and wi.deleted_at is null));
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_employment_history(p_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); v_v jsonb; v_kind text; v_on date := current_date;
begin
  if v_uid is null then
    raise exception 'hr_employment_history: no authenticated caller' using errcode = '42501';
  end if;
  v_v := hr._l1_viewer(v_uid, p_employee_id, v_on);
  if v_v is null or (v_v ->> 'kind') in ('none') then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;
  v_kind := v_v ->> 'kind';
  if v_kind = 'peer' then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;

  return jsonb_build_object(
    'granted', true,
    'spells', (select coalesce(jsonb_agg(jsonb_build_object(
        'employment_id', em.id, 'spell_number', em.spell_number, 'status', em.status,
        'hire_date', em.hire_date, 'original_hire_date', em.original_hire_date,
        'adjusted_service_date', em.adjusted_service_date,
        'probation_end_date', em.probation_end_date,
        'last_day_worked', em.last_day_worked, 'termination_date', em.termination_date,
        'is_rehire', em.is_rehire, 'prior_employment_id', em.prior_employment_id,
        'pay_group_id', em.pay_group_id,
        'employer_profile_id', em.employer_profile_id,
        'separation_id', case when v_kind = 'hr_admin' then em.separation_id end
      ) order by em.spell_number desc), '[]'::jsonb)
      from hr.employment em where em.employee_id = p_employee_id and em.deleted_at is null),
    'assignments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pa.id, 'employment_id', pa.employment_id,
        'job_title_id', pa.job_title_id, 'job_title', jt.title,
        'department_id', pa.department_id, 'department', d.name,
        'location_id', pa.location_id, 'location', l.name, 'timezone', l.tz,
        'jurisdiction_id', l.jurisdiction_id,
        'manager_employment_id', pa.manager_employment_id,
        'manager_name', mgr.display_name,
        'is_primary', pa.is_primary, 'worker_class', pa.worker_class,
        'flsa_status', pa.flsa_status, 'flsa_exemption_basis', pa.flsa_exemption_basis,
        'pay_basis', pa.pay_basis, 'schedule_class', pa.schedule_class,
        'fte', pa.fte, 'standard_hours_per_week', pa.standard_hours_per_week,
        'is_supervisor', pa.is_supervisor, 'cost_center', pa.cost_center,
        'eeo1_job_category', pa.eeo1_job_category,
        'effective_from', pa.effective_from, 'effective_to', pa.effective_to,
        'supersedes_id', pa.supersedes_id,
        'change_reason', cat.name,
        'recorded_at', pa.recorded_at,
        'recorded_by', act.display_name,
        'actor_type', coalesce(pa.metadata ->> 'actor_type', 'hr_admin'),
        'workflow_instance_id', pa.metadata ->> 'workflow_instance_id',
        'is_pending', pa.effective_from > v_on
      ) order by pa.effective_from desc, pa.recorded_at desc), '[]'::jsonb)
      from hr.position_assignment pa
      join hr.employment em on em.id = pa.employment_id and em.employee_id = p_employee_id
      left join hr.job_title jt on jt.id = pa.job_title_id
      left join hr.department d on d.id = pa.department_id
      left join hr.location l on l.id = pa.location_id
      left join hr.employment mem on mem.id = pa.manager_employment_id
      left join hr.employee mgr on mgr.id = mem.employee_id
      left join platform.categories cat on cat.id = pa.change_reason_category_id
      -- 🚨 ONE ACTOR PER ASSIGNMENT — A LOGIN IS NOT A KEY ON hr.employee (hr_l1_70).
      -- This was an ordinary equi-join from `pa.created_by` to the employee's login, narrowed by
      -- organization. (The old expression is NOT quoted here: this door's own contract BANS that
      -- text, and a pin cannot tell a call from a comment — the same trap the in_flight note in
      -- hr_pending_changes documents.) `login_user_id` carries no unique index, and
      -- two un-archived employee rows sharing one login in one employer is a SUPPORTED shape
      -- after the rehire/restore work — so the join multiplied every assignment once per
      -- matching employee row and the Job tab listed each job twice. Measured: 6 rows for 3
      -- assignments, `recorded_by` alternating between the two records.
      -- LATERAL … LIMIT 1 contributes exactly one row per assignment BY CONSTRUCTION, so the
      -- result's cardinality is the assignment table's and nothing can collapse two genuinely
      -- different assignments together. The order is stated so the byline is stable, not
      -- arbitrary: a live record before an archived one, then the oldest, then by id.
      left join lateral (
        select a.display_name
          from hr.employee a
         where a.login_user_id = pa.created_by
           and a.organization_id = em.organization_id
         order by (a.deleted_at is null) desc, a.created_at, a.id
         limit 1) act on true
     where pa.deleted_at is null),
    'reporting_lines', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', rl.id, 'employment_id', rl.employment_id,
        'manager_employment_id', rl.manager_employment_id, 'line_kind', rl.line_kind,
        'scope_note', rl.scope_note, 'effective_from', rl.effective_from,
        'effective_to', rl.effective_to, 'is_pending', rl.effective_from > v_on)
      order by rl.effective_from desc), '[]'::jsonb)
      from hr.reporting_line rl
      join hr.employment em on em.id = rl.employment_id and em.employee_id = p_employee_id
     where rl.deleted_at is null),
    'external_identities', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', xi.id, 'system_key', xi.system_key, 'external_id', xi.external_id,
        'external_url', xi.external_url, 'synced_at', xi.synced_at) order by xi.system_key), '[]'::jsonb)
      from hr.external_identity xi
     where xi.employee_id = p_employee_id and xi.deleted_at is null),
    'engagements', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'employment_id', g.employment_id,
        'platform_of_record', g.platform_of_record,
        'platform_external_id', g.platform_external_id, 'platform_url', g.platform_url,
        'engagement_terms', g.engagement_terms, 'starts_on', g.starts_on, 'ends_on', g.ends_on,
        'auto_renew', g.auto_renew, 'status', g.status,
        'sow_file_id', g.sow_file_id, 'w9_file_id', g.w9_file_id,
        'agreement_file_id', g.agreement_file_id) order by g.starts_on desc), '[]'::jsonb)
      from hr.engagement g
      join hr.employment em on em.id = g.employment_id and em.employee_id = p_employee_id
     where g.deleted_at is null));
end
$function$;

CREATE OR REPLACE FUNCTION public.war_room_recent_activity(p_war_room_id uuid, p_limit integer DEFAULT 25, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(occurred_at timestamp with time zone, thread_id uuid, thread_title text, entity_type text, entity_id uuid, label text, action text, actor_id uuid, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'workspace', 'chat', 'workbench', 'transcripts', 'files', 'iam'
AS $function$
#variable_conflict use_column
declare
  -- RC-A5d (rca5d_c): true only inside the admin lane, where the platform admin reads everything.
  v_admin boolean := public.is_platform_admin();
begin
  if not (v_admin or iam.has_access('war_room', p_war_room_id)) then
    raise exception 'not authorized for war_room %', p_war_room_id using errcode = '42501';
  end if;
  return query
  with threads as (
    -- RC-A5d (rca5d_c): only the threads this reader may open (RC-A2c: a thread whose anchor she
    -- may not open is not open to her, so its title — and the anchor-title fallback below — never
    -- reaches her either).
    select a.source_id as thread_id from platform.associations_live a
    where a.target_type='war_room' and a.target_id=p_war_room_id and a.source_type='thread'
      and (v_admin or iam.assoc_side_readable('thread', a.source_id))),
  tmeta as (
    select t.id as thread_id,
      coalesce(t.title,
        case t.anchor_type
          when 'task' then (select tk.title from workspace.tasks tk where tk.id=t.anchor_id)
          when 'project' then (select pj.name from workspace.projects pj where pj.id=t.anchor_id)
          else null end, 'Thread') as thread_title
    from workspace.threads t where t.id in (select thread_id from threads)),
  edges as (
    select a.id edge_id, a.source_type, a.source_id, a.label, a.created_at, a.created_by,
           case when a.target_type='thread' then a.target_id end as thread_id
    from platform.associations_live a
    where ((a.target_type='thread' and a.target_id in (select thread_id from threads))
       or (a.target_type='war_room' and a.target_id=p_war_room_id))
      -- RC-A5d (rca5d_c): and each record an edge names is asked (DD-195): an entity this reader may
      -- not open yields no row — not the edge label, not its title, not its activity.
      and (v_admin or (iam.org_readable(a.organization_id, a.source_type) and iam.assoc_side_readable(a.source_type, a.source_id)))),
  acts as (
    select mm.last_at as occurred_at, e.thread_id, e.source_type as entity_type, e.source_id as entity_id,
           e.label, 'chat_message'::text as action, mm.actor as actor_id,
           (mm.cnt::text||' message'||case when mm.cnt=1 then '' else 's' end) as detail
    from edges e join lateral (
      select max(m.created_at) last_at, count(*) cnt, (array_agg(m.created_by order by m.created_at desc))[1] actor
      from chat.message m where m.conversation_id=e.source_id and m.deleted_at is null) mm on true
    where e.source_type='conversation' and mm.last_at is not null
    union all select n.updated_at,e.thread_id,'note',e.source_id,e.label,'note_edited',n.created_by,null::text
      from edges e join workbench.notes n on n.id=e.source_id and n.deleted_at is null where e.source_type='note'
    union all select greatest(s.updated_at,s.started_at,s.created_at),e.thread_id,'studio_session',e.source_id,
      coalesce(e.label,s.title),'audio_activity',s.created_by,null::text
      from edges e join transcripts.studio_sessions s on s.id=e.source_id and s.deleted_at is null where e.source_type='studio_session'
    union all select t.updated_at,e.thread_id,'task',e.source_id,coalesce(e.label,t.title),'task_updated',t.created_by,t.title
      from edges e join workspace.tasks t on t.id=e.source_id and t.deleted_at is null where e.source_type='task'
    union all select p.updated_at,e.thread_id,'project',e.source_id,coalesce(e.label,p.name),'project_updated',p.created_by,p.name
      from edges e join workspace.projects p on p.id=e.source_id and p.deleted_at is null where e.source_type='project'
    union all select f.updated_at,e.thread_id,'file',e.source_id,e.label,'file_updated',f.created_by,null::text
      from edges e join files.files f on f.id=e.source_id and f.deleted_at is null where e.source_type='file'
    union all select e.created_at,e.thread_id,e.source_type,e.source_id,e.label,'attached',e.created_by,null::text
      from edges e where e.source_type<>'thread'
    union all select t.updated_at,t.id,'thread',t.id,null,'thread_updated',t.updated_by,null::text
      from workspace.threads t where t.id in (select thread_id from threads) and t.deleted_at is null)
  select a.occurred_at, a.thread_id, tm.thread_title, a.entity_type, a.entity_id, a.label, a.action, a.actor_id, a.detail
  from acts a left join tmeta tm on tm.thread_id=a.thread_id
  where a.occurred_at is not null and (p_since is null or a.occurred_at >= p_since)
  order by a.occurred_at desc
  limit greatest(1, least(coalesce(p_limit,25),200));
end; $function$;

CREATE OR REPLACE FUNCTION seo.starter_pack_site_status(p_site_id uuid, p_pack_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
declare
  v_slug text;
  v_adopted_at timestamptz;
  v_adopted_by uuid;
  v_items jsonb;
begin
  perform seo.gsc_assert_site_access(p_site_id);

  -- ACCESS BEFORE EXISTENCE, ON THE SECOND ARGUMENT. The site was asserted above and
  -- the pack was asserted by nothing, so an internal pack of a library the caller has
  -- no reach into came back whole. The refusal is the SAME sentence the unknown-pack
  -- path already raises, so a foreign pack and an invented id are indistinguishable.
  if p_pack_id is null
     or not iam.has_access('seo_starter_pack', p_pack_id, 'viewer'::public.permission_level) then
    raise exception 'seo_pack_not_found: %', p_pack_id;
  end if;

  select slug into v_slug from seo.starter_pack where id = p_pack_id and deleted_at is null;
  if v_slug is null then
    raise exception 'seo_pack_not_found: %', p_pack_id;
  end if;

  select x.created_at, x.created_by into v_adopted_at, v_adopted_by
  from (
    select r.created_at, r.created_by from seo.keyword_class_rule r
     where r.site_id = p_site_id and r.metadata->>'adopted_from_pack' = v_slug
    union all
    select v.created_at, v.created_by from seo.site_vocabulary v
     where v.site_id = p_site_id and v.metadata->>'adopted_from_pack' = v_slug
    union all
    select g.created_at, g.created_by from seo.site_geo_area g
     where g.site_id = p_site_id and g.metadata->>'adopted_from_pack' = v_slug
    union all
    select t.created_at, t.created_by from seo.site_topic_value t
     where t.site_id = p_site_id and t.metadata->>'adopted_from_pack' = v_slug
    union all
    select w.created_at, w.created_by from seo.site_value_worth w
     where w.site_id = p_site_id and w.metadata->>'adopted_from_pack' = v_slug
  ) x
  order by x.created_at asc
  limit 1;

  with meaning_items as (
    select jsonb_build_object(
      'kind', 'meaning',
      'ref', i.id,
      'label', i.label,
      'site_row_id', w.id,
      'rule_row_ids', coalesce(aliases.ids, '[]'::jsonb),
      'pack', jsonb_build_object(
        'dimension_slug', i.dimension_slug, 'dimension_label', i.dimension_label,
        'dimension_scope', i.dimension_scope, 'value', i.value, 'label', i.label,
        'worth_effect', i.worth_effect, 'worth_amount', i.worth_amount,
        'matchers', i.matchers, 'notes', i.notes),
      'site', case when v.value_id is null then null else jsonb_build_object(
        'worth_effect', w.effect, 'worth_amount', w.amount, 'origin', w.origin,
        'matchers', coalesce(mc.n, 0), 'patterns', coalesce(mc.patterns, '[]'::jsonb)) end,
      'state', case
        when v.value_id is null then 'missing'
        when w.id is null and coalesce(mc.n, 0) = 0 then
          case when coalesce(arch.n, 0) > 0 then 'archived' else 'missing' end
        when not coalesce(prov.from_pack, false) then 'yours'
        when (w.effect, w.amount) is distinct from (i.worth_effect, i.worth_amount)
          or coalesce(mc.n, 0) < jsonb_array_length(coalesce(i.matchers, '[]'::jsonb)) then 'changed'
        else 'as_adopted' end,
      'sort', i.sort) as item
    from seo.starter_pack_item i
    cross join lateral (
      select seo._pack_site_value_id(p_site_id, i.dimension_scope, i.dimension_slug, i.value) as value_id) v
    left join lateral (
      select * from seo.site_value_worth w2
       where w2.site_id = p_site_id and w2.value_id = v.value_id and w2.deleted_at is null
       limit 1) w on true
    left join lateral (
      select count(*)::int as n,
             coalesce(jsonb_agg(x.pattern order by x.pattern), '[]'::jsonb) as patterns
        from seo.dimension_value_matcher x
       where x.site_id = p_site_id and x.value_id = v.value_id and x.deleted_at is null
         and x.pattern is not null) mc on true
    left join lateral (
      select count(*)::int as n from seo.site_value_worth w3
       where w3.site_id = p_site_id and w3.value_id = v.value_id and w3.deleted_at is not null) arch on true
    left join lateral (
      select coalesce(jsonb_agg(r.id order by r.id), '[]'::jsonb) as ids
      from seo.keyword_class_rule r
      where r.site_id = p_site_id
        and r.deleted_at is null
        and r.metadata->>'adopted_from_pack' = v_slug
        and r.metadata->>'template_rule_id' in (
          select jsonb_array_elements_text(
            coalesce(i.metadata->'converted_from_rules', '[]'::jsonb)
          )
        )
    ) aliases on true
    left join lateral (
      -- Provenance: written by THIS pack, either by the current adopt path
      -- (pack_item_id) or, for sites that adopted before KI-030, through the
      -- template rule this item was converted from.
      select (
        w.metadata->>'pack_item_id' = i.id::text
        or exists (
          select 1 from seo.keyword_class_rule sr
           where sr.id::text = w.metadata->>'rule_id'
             and sr.site_id = p_site_id
             and sr.metadata->>'template_rule_id' in (
               select jsonb_array_elements_text(coalesce(i.metadata->'converted_from_rules', '[]'::jsonb))))
      ) as from_pack) prov on true
    where i.pack_id = p_pack_id and i.item_kind = 'meaning' and i.deleted_at is null
  ),
  vocab_items as (
    select jsonb_build_object(
      'kind', i.item_kind,
      'ref', i.id,
      'label', i.label,
      'site_row_id', v.id,
      'pack', jsonb_build_object('value', i.value, 'label', i.label,
        'description', i.description, 'config', i.config, 'sort', i.sort, 'notes', i.notes),
      'site', case when v.id is null then null else jsonb_build_object('value', v.value,
        'label', v.label, 'description', v.description, 'config', v.config, 'sort', v.sort) end,
      'state', case
        when v.id is null then 'missing'
        when v.deleted_at is not null or not v.active then 'archived'
        when (v.label, v.config) is distinct from (i.label, i.config) then 'changed'
        else 'as_adopted' end,
      'sort', i.sort) as item
    from seo.starter_pack_item i
    left join lateral (
      select * from seo.site_vocabulary v
       where v.site_id = p_site_id and v.vocab_kind = i.item_kind
         and (v.metadata->>'pack_item_id' = i.id::text
              or (not (coalesce(v.metadata,'{}'::jsonb) ? 'pack_item_id') and v.value = i.value))
       order by (v.deleted_at is null) desc, (v.metadata->>'pack_item_id' = i.id::text) desc, v.created_at desc
       limit 1) v on true
    where i.pack_id = p_pack_id and i.item_kind in ('value_band','geo_band') and i.deleted_at is null
  ),
  topic_items as (
    select jsonb_build_object(
      'kind', 'topic',
      'ref', i.id,
      'topic_id', i.topic_id,
      'label', tp.name,
      'site_row_id', t.id,
      'pack', jsonb_build_object('weight', i.weight, 'lead_quality', i.lead_quality,
        'offering_match', i.offering_match, 'notes', i.notes),
      'site', case when t.id is null then null else jsonb_build_object('weight', t.weight,
        'lead_quality', t.lead_quality, 'offering_match', t.offering_match, 'notes', t.notes) end,
      'state', case
        when t.id is null then 'missing'
        when t.deleted_at is not null then 'archived'
        when not (coalesce(t.metadata,'{}'::jsonb) ? 'pack_item_id') then 'yours'
        when (t.weight, t.lead_quality, t.offering_match)
             is distinct from (i.weight, i.lead_quality, i.offering_match) then 'changed'
        else 'as_adopted' end,
      'sort', i.sort) as item
    from seo.starter_pack_item i
    join seo.topic tp on tp.id = i.topic_id
    left join seo.site_topic_value t
      on t.site_id = p_site_id and t.topic_id = i.topic_id
    where i.pack_id = p_pack_id and i.item_kind = 'topic' and i.deleted_at is null
  ),
  area_items as (
    select jsonb_build_object(
      'kind', 'geo_area',
      'ref', i.id,
      'label', i.label,
      'site_row_id', g.id,
      'pack', jsonb_build_object('area_kind', coalesce(i.area_kind,'city'),
        'geo_band', i.geo_band, 'notes', i.notes),
      'site', case when g.id is null then null else jsonb_build_object('area_kind', g.area_kind,
        'geo_band', g.geo_band, 'notes', g.notes,
        'places', coalesce(array_length(g.place_ids, 1), 0),
        'tokens', coalesce(jsonb_array_length(g.match_tokens), 0),
        'places_pending', coalesce(jsonb_array_length(g.match_tokens), 0) = 0
                          and coalesce(array_length(g.place_ids, 1), 0) = 0) end,
      'state', case
        when g.id is null then 'missing'
        when g.deleted_at is not null then 'archived'
        when (g.area_kind, g.geo_band) is distinct from (coalesce(i.area_kind,'city'), i.geo_band) then 'changed'
        else 'as_adopted' end,
      'sort', i.sort) as item
    from seo.starter_pack_item i
    left join lateral (
      select * from seo.site_geo_area g
       where g.site_id = p_site_id
         and (g.metadata->>'pack_item_id' = i.id::text
              or (not (coalesce(g.metadata,'{}'::jsonb) ? 'pack_item_id') and g.label = i.label))
       order by (g.deleted_at is null) desc, (g.metadata->>'pack_item_id' = i.id::text) desc, g.created_at desc
       limit 1) g on true
    where i.pack_id = p_pack_id and i.item_kind = 'geo_area' and i.deleted_at is null
  ),
  everything as (
    select item from meaning_items
    union all select item from vocab_items
    union all select item from topic_items
    union all select item from area_items
  )
  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_items from everything;

  return jsonb_build_object(
    'pack_id', p_pack_id,
    'slug', v_slug,
    'adopted', v_adopted_at is not null,
    'adopted_at', v_adopted_at,
    'adopted_by', v_adopted_by,
    'adopted_by_label', (
      select coalesce(u.raw_user_meta_data->>'full_name',
                      u.raw_user_meta_data->>'name', u.email)
      from auth.users u where u.id = v_adopted_by),
    'counts', (
      select jsonb_build_object(
        'total', count(*),
        'missing', count(*) filter (where e->>'state' = 'missing'),
        'as_adopted', count(*) filter (where e->>'state' = 'as_adopted'),
        'changed', count(*) filter (where e->>'state' = 'changed'),
        'archived', count(*) filter (where e->>'state' = 'archived'),
        'yours', count(*) filter (where e->>'state' = 'yours'),
        'places_pending', count(*) filter (where (e->'site'->>'places_pending')::boolean))
      from jsonb_array_elements(v_items) e),
    'items', v_items);
end;
$function$;
