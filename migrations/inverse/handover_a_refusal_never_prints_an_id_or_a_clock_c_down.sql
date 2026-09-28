-- Inverse of handover_a_refusal_never_prints_an_id_or_a_clock_c.sql: the 151 bodies it replaced, byte for byte.
-- chair-step: restores the 151 function bodies whose refusals printed an id or a clock (handover_a_refusal_never_prints_an_id_or_a_clock_c.sql)



CREATE OR REPLACE FUNCTION public._d31_impl_update_user_list(p_list_id uuid, p_list_name character varying DEFAULT NULL::character varying, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_authenticated_read boolean DEFAULT NULL::boolean, p_public_read boolean DEFAULT NULL::boolean, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_item jsonb;
    v_result jsonb;
    v_org uuid;
    v_user uuid;
begin
    select organization_id, user_id into v_org, v_user
      from workbench.udt_structured_lists
     where id = p_list_id;

    update workbench.udt_structured_lists set
        list_name = coalesce(p_list_name, list_name),
        description = coalesce(p_description, description),
        is_public = coalesce(p_is_public, is_public),
        public_read = coalesce(p_public_read, public_read),
        updated_at = now()
    where id = p_list_id;

    if p_items is not null then
        if v_org is null then
          raise exception 'list % has no organization, so its items cannot be replaced', p_list_id
            using errcode = '23502',
                  hint = 'File the list in an organization before replacing its items.';
        end if;
        delete from workbench.udt_structured_list_items where list_id = p_list_id;

        for v_item in select * from jsonb_array_elements(p_items) loop
            insert into workbench.udt_structured_list_items (
                label, description, help_text, group_name,
                user_id, is_public, public_read, list_id, organization_id
            )
            values (
                v_item->>'Label', v_item->>'Description', v_item->>'Help Text', v_item->>'Group',
                v_user,
                (select is_public from workbench.udt_structured_lists where id = p_list_id),
                (select public_read from workbench.udt_structured_lists where id = p_list_id),
                p_list_id,
                v_org
            );
        end loop;
    end if;

    select jsonb_build_object(
        'list_id', l.id, 'list_name', l.list_name, 'description', l.description,
        'items', (
            select jsonb_agg(jsonb_build_object(
                'id', i.id, 'label', i.label, 'description', i.description,
                'help_text', i.help_text, 'group_name', i.group_name
            ))
            from workbench.udt_structured_list_items i where i.list_id = l.id
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = p_list_id;

    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public._library_audit(p_actor uuid, p_action text, p_entity_type text, p_entity_id uuid, p_industry_id uuid, p_org uuid, p_detail jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'rag'
AS $function$
begin
  raise exception 'library audit: this seven-argument writer derived the audit row''s organization from the actor, which is not an organization anybody named. Remedy: call public._library_audit(p_actor, p_acting_org, p_action, p_entity_type, p_entity_id, p_industry_id, p_target_org, p_detail) and pass the organization this door already checked its caller against. (actor %, action %, target %)',
    p_actor, p_action, p_org
    using errcode = '23502';
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_data_row_to_user_table(p_table_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_add_data_row_to_user_table(p_table_id, p_data);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_promote(target_user_id uuid, target_level admin_level DEFAULT 'developer'::admin_level, target_permissions jsonb DEFAULT '{}'::jsonb, target_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS admin.admins
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted admin.admins;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  -- Verify the target user exists in auth.users for a clean 23503 error
  -- (admins_user_id_fkey also enforces this at the constraint level).
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'User % does not exist', target_user_id USING ERRCODE = '23503';
  END IF;

  INSERT INTO admin.admins (user_id, level, permissions, metadata)
  VALUES (target_user_id, target_level, target_permissions, target_metadata)
  RETURNING * INTO inserted;

  RETURN inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_revoke(target_user_id uuid)
 RETURNS admin.admins
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  removed admin.admins;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot revoke your own admin access' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO removed FROM admin.admins WHERE user_id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % is not an admin', target_user_id USING ERRCODE = '23503';
  END IF;

  IF removed.level = 'super_admin' AND public._count_super_admins() <= 1 THEN
    RAISE EXCEPTION 'Cannot revoke the last Super Admin' USING ERRCODE = '42501';
  END IF;

  DELETE FROM admin.admins WHERE user_id = target_user_id;

  RETURN removed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_guest_block(p_guest_id uuid, p_blocked boolean, p_reason text DEFAULT NULL::text, p_blocked_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_guest users.guest_executions%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_metadata jsonb;
  v_history jsonb;
  v_len integer;
begin
  if v_actor is null or not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;

  if p_guest_id is null or p_blocked is null then
    raise exception 'A guest id and a blocked flag are required' using errcode = '22023';
  end if;

  if p_blocked and p_blocked_until is not null and p_blocked_until <= now() then
    raise exception 'A block must end in the future (got %)', p_blocked_until
      using errcode = '22023';
  end if;

  if not p_blocked and p_blocked_until is not null then
    raise exception 'Unblocking takes no end time' using errcode = '22023';
  end if;

  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'The reason is limited to 500 characters' using errcode = '22001';
  end if;

  select * into v_guest
  from users.guest_executions
  where id = p_guest_id
  for update;

  if not found then
    perform platform.refuse_not_found('Guest not found');
  end if;

  v_metadata := case
    when jsonb_typeof(v_guest.metadata) = 'object' then v_guest.metadata
    else '{}'::jsonb
  end;
  v_history := case
    when jsonb_typeof(v_metadata -> 'admin_block_history') = 'array'
      then v_metadata -> 'admin_block_history'
    else '[]'::jsonb
  end;
  v_history := v_history || jsonb_build_array(jsonb_build_object(
    'action', case when p_blocked then 'block' else 'unblock' end,
    'actor_user_id', v_actor,
    'at', now(),
    'reason', v_reason,
    'blocked_until', case when p_blocked then p_blocked_until end,
    'previous', jsonb_build_object(
      'is_blocked', coalesce(v_guest.is_blocked, false),
      'blocked_until', v_guest.blocked_until,
      'blocked_reason', v_guest.blocked_reason
    )
  ));
  v_len := jsonb_array_length(v_history);
  if v_len > 50 then
    select jsonb_agg(e order by ord)
    into v_history
    from jsonb_array_elements(v_history) with ordinality as t(e, ord)
    where ord > v_len - 50;
  end if;

  update users.guest_executions
  set is_blocked = p_blocked,
      blocked_until = case when p_blocked then p_blocked_until end,
      blocked_reason = case when p_blocked then v_reason end,
      metadata = jsonb_set(v_metadata, '{admin_block_history}', v_history, true)
  where id = p_guest_id
  returning * into v_guest;

  return jsonb_build_object(
    'guest_id', v_guest.id,
    'is_blocked', coalesce(v_guest.is_blocked, false),
    'block_active', coalesce(v_guest.is_blocked, false)
      and (v_guest.blocked_until is null or v_guest.blocked_until > now()),
    'blocked_until', v_guest.blocked_until,
    'blocked_reason', v_guest.blocked_reason,
    'updated_at', v_guest.updated_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_spend_breakdown(p_from timestamp with time zone, p_to timestamp with time zone, p_tz text DEFAULT 'UTC'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_thresholds jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz               text;
  v_hours            numeric;
  v_context_heavy    numeric;
  v_iteration_heavy  integer;
  v_spike_multiplier numeric;
  v_hog_share_pct    numeric;
  v_repeat_burst     integer;
  v_ledger_total     numeric;
  v_ledger_rows      bigint;
  v_totals           jsonb;
  v_dimensions       jsonb := '{}'::jsonb;
  v_series_day       jsonb;
  v_series_hour      jsonb;
  v_signals          jsonb := '{}'::jsonb;
  v_top_requests     jsonb;
  v_dim              record;
  v_row              jsonb;
  v_filter_key       text;
  v_filter_value     text;
  v_column           text;
  v_median_hour      numeric;
  v_total_cost       numeric;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin_spend_breakdown: super admin only'
      USING ERRCODE = '42501';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RAISE EXCEPTION 'admin_spend_breakdown: the window must be a non-empty [from, to) range (got % → %)', p_from, p_to
      USING ERRCODE = '22023';
  END IF;
  IF p_to - p_from > interval '92 days' THEN
    RAISE EXCEPTION 'admin_spend_breakdown: the window is capped at 92 days (asked for %)', p_to - p_from
      USING ERRCODE = '22023';
  END IF;

  -- Every threshold is a knob the client resolved; a missing one is a defect
  -- to surface, never a number to assume.
  v_context_heavy    := (p_thresholds->>'context_heavy_tokens')::numeric;
  v_iteration_heavy  := (p_thresholds->>'iteration_heavy')::integer;
  v_spike_multiplier := (p_thresholds->>'spike_multiplier')::numeric;
  v_hog_share_pct    := (p_thresholds->>'hog_share_pct')::numeric;
  v_repeat_burst     := (p_thresholds->>'repeat_burst')::integer;
  IF v_context_heavy IS NULL OR v_iteration_heavy IS NULL OR v_spike_multiplier IS NULL
     OR v_hog_share_pct IS NULL OR v_repeat_burst IS NULL THEN
    RAISE EXCEPTION 'admin_spend_breakdown: p_thresholds must carry context_heavy_tokens, iteration_heavy, spike_multiplier, hog_share_pct and repeat_burst (got %)', p_thresholds
      USING ERRCODE = '22023';
  END IF;

  -- An unknown zone would silently move every day boundary, so fall back loudly to UTC.
  BEGIN
    PERFORM now() AT TIME ZONE coalesce(p_tz, 'UTC');
    v_tz := coalesce(p_tz, 'UTC');
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'UTC';
  END;

  v_hours := extract(epoch FROM (p_to - p_from)) / 3600.0;

  -- The whole ledger inside the window, BEFORE filters, so the client can say
  -- how much of it the filtered view explains.
  SELECT coalesce(sum(cost), 0), count(*)
  INTO v_ledger_total, v_ledger_rows
  FROM runtime.global_execution
  WHERE created_at >= p_from AND created_at < p_to;

  -- ── The fact set: one row per execution, every dimension resolved ──────────
  DROP TABLE IF EXISTS pg_temp.spend_fact;
  CREATE TEMP TABLE spend_fact ON COMMIT DROP AS
  WITH g AS (
    SELECT
      e.id, e.created_at, coalesce(e.cost, 0) AS cost,
      e.organization_id, e.link_kind, e.link_id, e.type, e.request_id, e.context, e.meters,
      -- context values are stored as text and can be absent; only a real uuid casts.
      CASE WHEN (e.context->>'user_id') ~ '^[0-9a-f-]{36}$'
           THEN (e.context->>'user_id')::uuid END              AS ctx_user_id,
      CASE WHEN (e.context->>'agent_id') ~ '^[0-9a-f-]{36}$'
           THEN (e.context->>'agent_id')::uuid END             AS ctx_agent_id,
      CASE WHEN e.link_kind = 'conversation' AND e.link_id ~ '^[0-9a-f-]{36}$'
           THEN e.link_id::uuid
           WHEN (e.context->>'conversation_id') ~ '^[0-9a-f-]{36}$'
           THEN (e.context->>'conversation_id')::uuid END      AS ctx_conversation_id,
      -- A request can own SEVERAL ledger rows (one request in the 2026-09-10/11
      -- window owned 71). The request-level facts — its token totals, its
      -- iteration count, its unpriced-call count — belong to ONE of them, or
      -- every per-request signal counts them once per execution. The earliest
      -- execution is the head; the rest carry cost only.
      (e.request_id IS NULL OR row_number() OVER (
         PARTITION BY e.request_id ORDER BY e.created_at, e.id) = 1) AS is_request_head
    FROM runtime.global_execution e
    WHERE e.created_at >= p_from AND e.created_at < p_to
  )
  SELECT
    g.id                                                        AS execution_id,
    g.created_at,
    g.cost,
    CASE WHEN ur.id IS NULL THEN coalesce((g.meters->>'input_tokens')::bigint, 0)
         WHEN g.is_request_head THEN coalesce(ur.total_input_tokens, 0) ELSE 0 END  AS tokens_in,
    CASE WHEN ur.id IS NULL THEN coalesce((g.meters->>'cached_tokens')::bigint, 0)
         WHEN g.is_request_head THEN coalesce(ur.total_cached_tokens, 0) ELSE 0 END AS tokens_cached,
    CASE WHEN ur.id IS NULL THEN coalesce((g.meters->>'output_tokens')::bigint, 0)
         WHEN g.is_request_head THEN coalesce(ur.total_output_tokens, 0) ELSE 0 END AS tokens_out,
    g.is_request_head,
    g.organization_id,
    coalesce(o.name, 'Unattributed')                            AS organization_name,
    coalesce(ur.created_by, g.ctx_user_id)                      AS user_id,
    au.email                                                    AS user_email,
    coalesce(ur.agent_id, g.ctx_agent_id)                       AS agent_id,
    ad.name                                                     AS agent_name,
    coalesce(nullif(ur.source_app, ''), 'aidream')              AS app,
    coalesce(nullif(ur.source_feature, ''),
             nullif(g.context->>'agent_run_label', ''),
             g.link_kind, g.type)                               AS feature,
    coalesce(ur.origin_class,
             CASE g.link_kind
               WHEN 'sch_run'            THEN 'scheduled'
               WHEN 'internal_agent_run' THEN 'child_agent'
               ELSE 'system' END)                               AS origin_class,
    CASE WHEN coalesce(ur.origin_class, '') IN ('human', 'api')
         THEN 'manual' ELSE 'automated' END                     AS trigger,
    coalesce(g.link_kind, g.type)                               AS source,
    g.ctx_conversation_id                                       AS conversation_id,
    c.title                                                     AS conversation_title,
    ur.id                                                       AS request_id,
    ur.status                                                   AS request_status,
    ur.finish_reason,
    CASE WHEN g.is_request_head THEN coalesce(ur.iterations, 0) ELSE 0 END       AS iterations,
    CASE WHEN g.is_request_head THEN coalesce(ur.total_tool_calls, 0) ELSE 0 END AS tool_calls,
    m.model,
    m.provider,
    CASE WHEN g.is_request_head THEN m.unpriced_calls ELSE 0 END AS unpriced_calls,
    -- The LOGIN SESSION: every sign-in (a person, or an agent driving the UI
    -- as admin@admin.com) gets its own Supabase session id, carried on the
    -- request's JWT claims. It is the only thing that separates two agents
    -- sharing one account. Label = who, and when they signed in.
    ur.metadata->'jwt_claims'->>'session_id'                    AS login_session_id,
    -- The label is built on the request's head row only (min() over the
    -- dimension ignores NULLs), so to_timestamp runs once per request, not
    -- once per ledger row.
    CASE WHEN g.is_request_head AND ur.metadata->'jwt_claims'->>'session_id' IS NOT NULL THEN
      coalesce(ur.metadata->'jwt_claims'->>'email', au.email, 'unknown')
      || ' · signed in '
      || CASE WHEN (ur.metadata->'jwt_claims'->'amr'->0->>'timestamp') ~ '^[0-9]+$'
              THEN to_char(to_timestamp((ur.metadata->'jwt_claims'->'amr'->0->>'timestamp')::bigint)
                           AT TIME ZONE v_tz, 'Mon DD, HH12:MI AM')
              ELSE 'at an unknown time (' || left(ur.metadata->'jwt_claims'->>'session_id', 8) || ')' END
    END                                                         AS login_label,
    to_char(g.created_at AT TIME ZONE v_tz, 'YYYY-MM-DD')       AS local_day,
    date_trunc('hour', g.created_at AT TIME ZONE v_tz)          AS local_hour,
    to_char(g.created_at AT TIME ZONE v_tz, 'YYYY-MM-DD"T"HH24:00') AS local_hour_key
  FROM g
  LEFT JOIN chat.user_request ur ON ur.id = g.request_id
  LEFT JOIN iam.organizations o  ON o.id = g.organization_id
  LEFT JOIN auth.users au        ON au.id = coalesce(ur.created_by, g.ctx_user_id)
  LEFT JOIN agent.definition ad  ON ad.id = coalesce(ur.agent_id, g.ctx_agent_id)
  LEFT JOIN chat.conversation c  ON c.id = g.ctx_conversation_id
  LEFT JOIN LATERAL (
    -- The model that billed the most of this request. A request can fall back
    -- across models; one label per execution keeps the dimension summing to
    -- the ledger. unpriced_calls counts API calls whose cost is NULL — a
    -- pricing gap, not free work.
    SELECT x.model, x.provider, x.unpriced_calls
    FROM (
      SELECT coalesce(md.name, r.ai_model_id::text, 'unknown') AS model,
             coalesce(r.provider, 'unknown')                    AS provider,
             sum(r.cost)                                        AS model_cost,
             sum(count(*) FILTER (WHERE r.cost IS NULL)) OVER () AS unpriced_calls
      FROM chat.request r
      LEFT JOIN ai.model_definition md ON md.id = r.ai_model_id
      WHERE r.user_request_id = ur.id AND r.deleted_at IS NULL
      GROUP BY 1, 2
    ) x
    ORDER BY x.model_cost DESC NULLS LAST
    LIMIT 1
  ) m ON ur.id IS NOT NULL;

  -- ── Filters: equality on the dimension key; '(none)' means NULL ────────────
  FOR v_filter_key, v_filter_value IN
    SELECT key, value #>> '{}' FROM jsonb_each(coalesce(p_filters, '{}'::jsonb))
  LOOP
    v_column := CASE v_filter_key
      WHEN 'organization' THEN 'organization_id::text'
      WHEN 'user'         THEN 'user_id::text'
      WHEN 'agent'        THEN 'agent_id::text'
      WHEN 'app'          THEN 'app'
      WHEN 'feature'      THEN 'feature'
      WHEN 'origin'       THEN 'origin_class'
      WHEN 'trigger'      THEN 'trigger'
      WHEN 'source'       THEN 'source'
      WHEN 'model'        THEN 'model'
      WHEN 'conversation' THEN 'conversation_id::text'
      WHEN 'session'      THEN 'login_session_id'
      WHEN 'day'          THEN 'local_day'
      WHEN 'hour'         THEN 'local_hour_key'
      ELSE NULL END;
    IF v_column IS NULL THEN
      RAISE EXCEPTION 'admin_spend_breakdown: unknown filter key % (allowed: organization, user, agent, app, feature, origin, trigger, source, model, conversation, session, day, hour)', v_filter_key
        USING ERRCODE = '22023';
    END IF;
    IF v_filter_value IS NULL OR v_filter_value = '' THEN
      CONTINUE;
    END IF;
    IF v_filter_value = '(none)' THEN
      EXECUTE format('DELETE FROM spend_fact WHERE %s IS NOT NULL', v_column);
    ELSE
      EXECUTE format('DELETE FROM spend_fact WHERE %s IS DISTINCT FROM $1', v_column)
        USING v_filter_value;
    END IF;
  END LOOP;

  -- The fact set is read a dozen times below; two small indexes and fresh
  -- statistics turn each pass into an index scan instead of a full re-read.
  CREATE INDEX ON spend_fact (local_day);
  CREATE INDEX ON spend_fact (local_hour);
  ANALYZE spend_fact;

  -- ── Totals ─────────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'cost',            coalesce(sum(cost), 0),
    'executions',      count(*),
    'paid_executions', count(*) FILTER (WHERE cost > 0),
    'requests',        count(DISTINCT request_id),
    'conversations',   count(DISTINCT conversation_id),
    'tokens_in',       coalesce(sum(tokens_in), 0),
    'tokens_cached',   coalesce(sum(tokens_cached), 0),
    'tokens_out',      coalesce(sum(tokens_out), 0),
    'manual_cost',     coalesce(sum(cost) FILTER (WHERE trigger = 'manual'), 0),
    'automated_cost',  coalesce(sum(cost) FILTER (WHERE trigger = 'automated'), 0),
    'linked_cost',     coalesce(sum(cost) FILTER (WHERE request_id IS NOT NULL), 0),
    'unlinked_cost',   coalesce(sum(cost) FILTER (WHERE request_id IS NULL), 0),
    'ledger_cost',     v_ledger_total,
    'ledger_rows',     v_ledger_rows,
    'hours',           round(v_hours, 2)
  )
  INTO v_totals
  FROM spend_fact;

  v_total_cost := (v_totals->>'cost')::numeric;

  -- ── Dimensions: the same shape for every one ───────────────────────────────
  FOR v_dim IN
    SELECT * FROM (VALUES
      ('organization', 'organization_id::text', 'organization_name', 100),
      ('user',         'user_id::text',         'coalesce(user_email, user_id::text)', 100),
      ('agent',        'agent_id::text',        'agent_name', 100),
      ('app',          'app',                   'app', 100),
      ('feature',      'feature',               'feature', 100),
      ('origin',       'origin_class',          'origin_class', 100),
      ('trigger',      'trigger',               'trigger', 100),
      ('source',       'source',                'source', 100),
      ('model',        'model',                 'model', 100),
      ('conversation', 'conversation_id::text', 'conversation_title', 60),
      ('session',      'login_session_id',      'login_label', 100),
      ('day',          'local_day',             'local_day', 100),
      ('hour',         'local_hour_key',        'local_hour_key', 100)
    ) AS d(name, key_expr, label_expr, cap)
  LOOP
    EXECUTE format($q$
      WITH d AS (
        SELECT %s AS key, min(%s) AS label,
               sum(cost) AS cost, count(*) AS n,
               count(DISTINCT request_id) AS requests,
               sum(tokens_in) AS tokens_in, sum(tokens_cached) AS tokens_cached,
               sum(tokens_out) AS tokens_out,
               sum(cost) FILTER (WHERE trigger = 'manual')    AS manual_cost,
               sum(cost) FILTER (WHERE trigger = 'automated') AS automated_cost,
               max(created_at) AS last_at
        FROM spend_fact
        GROUP BY 1
      ),
      ranked AS (
        SELECT d.*, row_number() OVER (ORDER BY cost DESC NULLS LAST, n DESC) AS rn
        FROM d
      )
      SELECT jsonb_build_object(
        'rows', coalesce(jsonb_agg(jsonb_build_object(
                  'key',            coalesce(key, '(none)'),
                  'label',          coalesce(label, 'Unattributed'),
                  'cost',           coalesce(cost, 0),
                  'share',          CASE WHEN $1 > 0 THEN coalesce(cost, 0) / $1 ELSE 0 END,
                  'n',              n,
                  'requests',       requests,
                  'tokens_in',      coalesce(tokens_in, 0),
                  'tokens_cached',  coalesce(tokens_cached, 0),
                  'tokens_out',     coalesce(tokens_out, 0),
                  'manual_cost',    coalesce(manual_cost, 0),
                  'automated_cost', coalesce(automated_cost, 0),
                  'last_at',        last_at
                ) ORDER BY cost DESC NULLS LAST, n DESC) FILTER (WHERE rn <= %s), '[]'::jsonb),
        'other_cost', coalesce(sum(cost) FILTER (WHERE rn > %s), 0),
        'other_n',    coalesce(sum(n)    FILTER (WHERE rn > %s), 0),
        'distinct',   count(*))
      FROM ranked
    $q$, v_dim.key_expr, v_dim.label_expr, v_dim.cap, v_dim.cap, v_dim.cap)
    INTO v_row
    USING v_total_cost;

    v_dimensions := v_dimensions || jsonb_build_object(v_dim.name, v_row);
  END LOOP;

  -- ── Series ─────────────────────────────────────────────────────────────────
  WITH per_day AS (
    SELECT local_day,
           sum(cost) AS cost,
           sum(cost) FILTER (WHERE trigger = 'manual')    AS manual,
           sum(cost) FILTER (WHERE trigger = 'automated') AS automated,
           count(*) AS n
    FROM spend_fact
    GROUP BY local_day
  )
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'day'), '[]'::jsonb)
  INTO v_series_day
  FROM (
    SELECT jsonb_build_object(
             'day',       to_char(d.day, 'YYYY-MM-DD'),
             'cost',      coalesce(s.cost, 0),
             'manual',    coalesce(s.manual, 0),
             'automated', coalesce(s.automated, 0),
             'n',         coalesce(s.n, 0)) AS x
    FROM generate_series(
           date_trunc('day', p_from AT TIME ZONE v_tz),
           date_trunc('day', (p_to - interval '1 microsecond') AT TIME ZONE v_tz),
           interval '1 day') AS d(day)
    LEFT JOIN per_day s ON s.local_day = to_char(d.day, 'YYYY-MM-DD')
  ) q;

  IF v_hours <= 96 THEN
    WITH per_hour AS (
      SELECT local_hour,
             sum(cost) AS cost,
             sum(cost) FILTER (WHERE trigger = 'manual')    AS manual,
             sum(cost) FILTER (WHERE trigger = 'automated') AS automated,
             count(*) AS n
      FROM spend_fact
      GROUP BY local_hour
    )
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'hour'), '[]'::jsonb)
    INTO v_series_hour
    FROM (
      SELECT jsonb_build_object(
               'hour',      to_char(h.hour, 'YYYY-MM-DD"T"HH24:00'),
               'cost',      coalesce(s.cost, 0),
               'manual',    coalesce(s.manual, 0),
               'automated', coalesce(s.automated, 0),
               'n',         coalesce(s.n, 0)) AS x
      FROM generate_series(
             date_trunc('hour', p_from AT TIME ZONE v_tz),
             date_trunc('hour', (p_to - interval '1 microsecond') AT TIME ZONE v_tz),
             interval '1 hour') AS h(hour)
      LEFT JOIN per_hour s ON s.local_hour = h.hour
    ) q;
  ELSE
    v_series_hour := NULL;
  END IF;

  -- ── Signals: where to dig ──────────────────────────────────────────────────

  -- 1. Money spent on requests that failed, were abandoned, or were cut off
  --    at the output limit. Spent, and nothing usable came back. Counted per
  --    REQUEST (a request may own several ledger rows).
  WITH failed AS (
    SELECT request_id, sum(cost) AS cost,
           min(request_status) AS status, min(finish_reason) AS finish_reason,
           min(feature) AS feature, min(agent_name) AS agent,
           min(coalesce(user_email, user_id::text)) AS who,
           min(conversation_id::text) AS conversation_id, min(conversation_title) AS conversation,
           min(created_at) AS at
    FROM spend_fact
    WHERE request_id IS NOT NULL
      AND (request_status IN ('failed', 'abandoned') OR finish_reason = 'max_tokens')
    GROUP BY request_id
  )
  SELECT jsonb_build_object(
    'cost', coalesce(sum(cost), 0),
    'n',    count(*),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'request_id', request_id, 'cost', cost, 'status', status,
               'finish_reason', finish_reason, 'feature', feature,
               'agent', agent, 'user', who,
               'conversation_id', conversation_id, 'conversation', conversation,
               'at', at) ORDER BY cost DESC)
      FROM (SELECT * FROM failed ORDER BY cost DESC LIMIT 25) t), '[]'::jsonb))
  INTO v_row
  FROM failed;
  v_signals := v_signals || jsonb_build_object('failed_spend', v_row);

  -- 2. Context-heavy: conversations whose average context per API call
  --    (input + cached tokens / iterations) exceeds the knob. Every call
  --    re-sends the whole history, so cost grows with the square of the
  --    conversation length — the single biggest lever on a long session.
  WITH per_conv AS (
    SELECT conversation_id, min(conversation_title) AS title,
           sum(cost) AS cost, count(DISTINCT request_id) AS requests,
           sum(iterations) AS calls,
           CASE WHEN sum(iterations) > 0
                THEN (sum(tokens_in) + sum(tokens_cached))::numeric / sum(iterations)
                ELSE 0 END AS avg_context,
           min(user_email) AS user_email, min(agent_name) AS agent, min(feature) AS feature
    FROM spend_fact
    WHERE conversation_id IS NOT NULL AND request_id IS NOT NULL
    GROUP BY conversation_id
  )
  SELECT jsonb_build_object(
    'cost', coalesce(sum(cost) FILTER (WHERE avg_context >= v_context_heavy), 0),
    'n',    count(*) FILTER (WHERE avg_context >= v_context_heavy),
    'threshold', v_context_heavy,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'conversation_id', conversation_id, 'conversation', title, 'cost', cost,
               'requests', requests, 'calls', calls, 'avg_context', round(avg_context),
               'user', user_email, 'agent', agent, 'feature', feature) ORDER BY cost DESC)
      FROM (SELECT * FROM per_conv WHERE avg_context >= v_context_heavy
            ORDER BY cost DESC LIMIT 25) t), '[]'::jsonb))
  INTO v_row
  FROM per_conv;
  v_signals := v_signals || jsonb_build_object('context_heavy', v_row);

  -- 3. Iteration-heavy: single requests that looped through the model many
  --    times (tool loops). Legitimate for agentic work; suspicious past the knob.
  --    Per REQUEST: cost is the sum of every ledger row the request owns.
  WITH heavy AS (
    SELECT request_id, sum(cost) AS cost, max(iterations) AS iterations,
           max(tool_calls) AS tool_calls, min(feature) AS feature, min(agent_name) AS agent,
           min(coalesce(user_email, user_id::text)) AS who,
           min(conversation_id::text) AS conversation_id, min(conversation_title) AS conversation,
           min(created_at) AS at
    FROM spend_fact
    WHERE request_id IS NOT NULL
    GROUP BY request_id
    HAVING max(iterations) >= v_iteration_heavy
  )
  SELECT jsonb_build_object(
    'cost', coalesce(sum(cost), 0),
    'n',    count(*),
    'threshold', v_iteration_heavy,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'request_id', request_id, 'cost', cost, 'iterations', iterations,
               'tool_calls', tool_calls, 'feature', feature, 'agent', agent,
               'user', who, 'conversation_id', conversation_id, 'conversation', conversation,
               'at', at) ORDER BY cost DESC)
      FROM (SELECT * FROM heavy ORDER BY cost DESC LIMIT 25) t), '[]'::jsonb))
  INTO v_row
  FROM heavy;
  v_signals := v_signals || jsonb_build_object('iteration_heavy', v_row);

  -- 4. Hogs: a single conversation that alone is more than hog_share_pct of
  --    the whole window.
  WITH per_conv AS (
    SELECT conversation_id, min(conversation_title) AS title, sum(cost) AS cost,
           count(DISTINCT request_id) AS requests, min(user_email) AS user_email,
           min(agent_name) AS agent, min(feature) AS feature,
           CASE WHEN coalesce(sum(cost) FILTER (WHERE trigger = 'manual'), 0)
                     >= coalesce(sum(cost) FILTER (WHERE trigger = 'automated'), 0)
                THEN 'manual' ELSE 'automated' END AS trigger,
           min(created_at) AS first_at, max(created_at) AS last_at
    FROM spend_fact
    WHERE conversation_id IS NOT NULL
    GROUP BY conversation_id
  )
  SELECT jsonb_build_object(
    'cost', coalesce(sum(cost) FILTER (WHERE v_total_cost > 0 AND cost / v_total_cost * 100 >= v_hog_share_pct), 0),
    'n',    count(*) FILTER (WHERE v_total_cost > 0 AND cost / v_total_cost * 100 >= v_hog_share_pct),
    'threshold', v_hog_share_pct,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'conversation_id', conversation_id, 'conversation', title, 'cost', cost,
               'share', CASE WHEN v_total_cost > 0 THEN cost / v_total_cost ELSE 0 END,
               'requests', requests, 'user', user_email, 'agent', agent, 'feature', feature,
               'trigger', trigger, 'first_at', first_at, 'last_at', last_at) ORDER BY cost DESC)
      FROM (SELECT * FROM per_conv
            WHERE v_total_cost > 0 AND cost / v_total_cost * 100 >= v_hog_share_pct
            ORDER BY cost DESC LIMIT 25) t), '[]'::jsonb))
  INTO v_row
  FROM per_conv;
  v_signals := v_signals || jsonb_build_object('conversation_hogs', v_row);

  -- 5. Spikes: hours that cost more than spike_multiplier × the median
  --    non-zero hour. A loop or a runaway job shows up here first.
  WITH per_hour AS (
    SELECT local_hour, sum(cost) AS cost, count(*) AS n
    FROM spend_fact
    GROUP BY local_hour
    HAVING sum(cost) > 0
  ),
  med AS (
    SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY cost))::numeric AS median FROM per_hour
  ),
  spiking AS (
    SELECT h.local_hour, h.cost, h.n, m.median
    FROM per_hour h, med m
    WHERE h.cost > v_spike_multiplier * m.median
  ),
  top_feature AS (
    SELECT DISTINCT ON (f.local_hour) f.local_hour, f.feature
    FROM spend_fact f JOIN spiking s ON s.local_hour = f.local_hour
    GROUP BY f.local_hour, f.feature
    ORDER BY f.local_hour, sum(f.cost) DESC
  ),
  top_user AS (
    SELECT DISTINCT ON (f.local_hour) f.local_hour, coalesce(f.user_email, f.user_id::text) AS who
    FROM spend_fact f JOIN spiking s ON s.local_hour = f.local_hour
    GROUP BY f.local_hour, coalesce(f.user_email, f.user_id::text)
    ORDER BY f.local_hour, sum(f.cost) DESC
  )
  SELECT jsonb_build_object(
    'median_hour', coalesce((SELECT median FROM med), 0),
    'threshold',   v_spike_multiplier,
    'cost', coalesce((SELECT sum(cost) FROM spiking), 0),
    'n',    (SELECT count(*) FROM spiking),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'hour', to_char(s.local_hour, 'YYYY-MM-DD"T"HH24:00'),
               'cost', s.cost, 'n', s.n,
               'multiple', CASE WHEN s.median > 0 THEN round((s.cost / s.median)::numeric, 1) ELSE NULL END,
               'top_feature', tf.feature,
               'top_user', tu.who) ORDER BY s.cost DESC)
      FROM (SELECT * FROM spiking ORDER BY cost DESC LIMIT 25) s
      LEFT JOIN top_feature tf ON tf.local_hour = s.local_hour
      LEFT JOIN top_user tu ON tu.local_hour = s.local_hour), '[]'::jsonb))
  INTO v_row;
  v_signals := v_signals || jsonb_build_object('spike_hours', v_row);

  -- 6. Repeat bursts: the same person + agent + feature firing at least
  --    repeat_burst requests inside one ten-minute bucket. Humans do not type
  --    that fast; loops and retry storms do.
  WITH buckets AS (
    SELECT user_id, min(user_email) AS user_email, agent_id, min(agent_name) AS agent,
           feature, trigger,
           date_trunc('hour', created_at) + (floor(extract(minute FROM created_at) / 10) * interval '10 minutes') AS bucket,
           count(DISTINCT request_id) AS requests, sum(cost) AS cost
    FROM spend_fact
    WHERE request_id IS NOT NULL
    GROUP BY user_id, agent_id, feature, trigger, bucket
    HAVING count(DISTINCT request_id) >= v_repeat_burst
  )
  SELECT jsonb_build_object(
    'cost', coalesce(sum(cost), 0),
    'n',    count(*),
    'threshold', v_repeat_burst,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'bucket', bucket, 'user', coalesce(user_email, user_id::text), 'agent', agent,
               'feature', feature, 'trigger', trigger, 'requests', requests, 'cost', cost)
             ORDER BY cost DESC)
      FROM (SELECT * FROM buckets ORDER BY cost DESC LIMIT 25) t), '[]'::jsonb))
  INTO v_row
  FROM buckets;
  v_signals := v_signals || jsonb_build_object('repeat_bursts', v_row);

  -- 7. Unpriced: API calls whose cost is NULL — the model had no price on file,
  --    so the ledger UNDER-counts by an unknown amount.
  SELECT jsonb_build_object(
    'n', coalesce(sum(unpriced_calls), 0),
    'requests', count(*) FILTER (WHERE unpriced_calls > 0))
  INTO v_row
  FROM spend_fact
  WHERE request_id IS NOT NULL;
  v_signals := v_signals || jsonb_build_object('unpriced', v_row);

  -- ── The most expensive individual requests, every dimension on the row ─────
  -- One row per REQUEST (its ledger rows summed); a ledger row no request
  -- explains stands on its own.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'request_id',       request_id,
           'execution_id',     execution_id,
           'at',               at,
           'cost',             cost,
           'share',            CASE WHEN v_total_cost > 0 THEN cost / v_total_cost ELSE 0 END,
           'organization_id',  organization_id,
           'organization',     organization_name,
           'user_id',          user_id,
           'user',             who,
           'agent_id',         agent_id,
           'agent',            agent_name,
           'app',              app,
           'feature',          feature,
           'origin',           origin_class,
           'trigger',          trigger,
           'source',           source,
           'model',            model,
           'provider',         provider,
           'conversation_id',  conversation_id,
           'conversation',     conversation_title,
           'status',           request_status,
           'finish_reason',    finish_reason,
           'iterations',       iterations,
           'tool_calls',       tool_calls,
           'tokens_in',        tokens_in,
           'tokens_cached',    tokens_cached,
           'tokens_out',       tokens_out
         ) ORDER BY cost DESC), '[]'::jsonb)
  INTO v_top_requests
  FROM (
    SELECT request_id,
           min(execution_id::text)::uuid AS execution_id,
           min(created_at) AS at, sum(cost) AS cost,
           min(organization_id::text)::uuid AS organization_id, min(organization_name) AS organization_name,
           min(user_id::text)::uuid AS user_id, min(coalesce(user_email, user_id::text)) AS who,
           min(agent_id::text)::uuid AS agent_id, min(agent_name) AS agent_name,
           min(app) AS app, min(feature) AS feature, min(origin_class) AS origin_class,
           min(trigger) AS trigger, min(source) AS source, min(model) AS model, min(provider) AS provider,
           min(conversation_id::text)::uuid AS conversation_id, min(conversation_title) AS conversation_title,
           min(request_status) AS request_status, min(finish_reason) AS finish_reason,
           max(iterations) AS iterations, max(tool_calls) AS tool_calls,
           sum(tokens_in) AS tokens_in, sum(tokens_cached) AS tokens_cached, sum(tokens_out) AS tokens_out
    FROM spend_fact
    GROUP BY coalesce(request_id::text, execution_id::text), request_id
    ORDER BY sum(cost) DESC NULLS LAST
    LIMIT 40
  ) t;

  RETURN jsonb_build_object(
    'generated_at',       now(),
    'timezone',           v_tz,
    'timezone_requested', p_tz,
    'window',             jsonb_build_object('from', p_from, 'to', p_to, 'hours', round(v_hours, 2)),
    'filters',            coalesce(p_filters, '{}'::jsonb),
    'thresholds',         p_thresholds,
    'totals',             v_totals,
    'dimensions',         v_dimensions,
    'series',             jsonb_build_object('day', v_series_day, 'hour', v_series_hour),
    'signals',            v_signals,
    'top_requests',       v_top_requests);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_taxonomy_upsert(p_id uuid DEFAULT NULL::uuid, p_slug text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_level text DEFAULT NULL::text, p_parent_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_docs_path text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_anchors jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'admin_taxonomy_upsert: super admin required';
  end if;
  if p_id is null then
    if p_slug is null or p_name is null or p_level is null then
      raise exception 'admin_taxonomy_upsert: slug, name, level required for insert';
    end if;
    -- organization_id: platform.taxonomy_node is the platform's own docs/
    -- product taxonomy (super-admin authored), not org data. Belongs to the
    -- ratified platform tenant via public.system_org_id('system'). Never
    -- defaulted or resolver-chosen (Data Doctrine, 2026-09-19).
    insert into platform.taxonomy_node (slug, name, level, parent_id, status, docs_path, notes, anchors, organization_id)
    values (p_slug, p_name, p_level, p_parent_id, coalesce(p_status, 'proposed'),
            p_docs_path, p_notes, coalesce(p_anchors, '{}'::jsonb), public.system_org_id('system'))
    returning id into v_id;
  else
    update platform.taxonomy_node set
      slug = coalesce(p_slug, slug),
      name = coalesce(p_name, name),
      level = coalesce(p_level, level),
      parent_id = case when p_level = 'domain' then null else coalesce(p_parent_id, parent_id) end,
      status = coalesce(p_status, status),
      docs_path = coalesce(p_docs_path, docs_path),
      notes = coalesce(p_notes, notes),
      anchors = coalesce(p_anchors, anchors),
      updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'admin_taxonomy_upsert: node % not found', p_id; end if;
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update(target_user_id uuid, target_level admin_level DEFAULT NULL::admin_level, target_permissions jsonb DEFAULT NULL::jsonb, target_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS admin.admins
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_row admin.admins;
  updated admin.admins;
  new_level public.admin_level;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO current_row FROM admin.admins WHERE user_id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % is not an admin', target_user_id USING ERRCODE = '23503';
  END IF;

  new_level := COALESCE(target_level, current_row.level);

  -- Bricking: a super admin cannot demote themselves.
  IF target_user_id = auth.uid()
     AND current_row.level = 'super_admin'
     AND new_level <> 'super_admin' THEN
    RAISE EXCEPTION 'Cannot demote yourself from Super Admin' USING ERRCODE = '42501';
  END IF;

  -- Bricking: cannot demote the last super admin.
  IF current_row.level = 'super_admin'
     AND new_level <> 'super_admin'
     AND public._count_super_admins() <= 1 THEN
    RAISE EXCEPTION 'Cannot demote the last Super Admin' USING ERRCODE = '42501';
  END IF;

  UPDATE admin.admins
     SET level       = new_level,
         permissions = COALESCE(target_permissions, current_row.permissions),
         metadata    = COALESCE(target_metadata,    current_row.metadata)
   WHERE user_id = target_user_id
  RETURNING * INTO updated;

  RETURN updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_create_shortcut(p_agent_id uuid, p_label text, p_category_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_use_latest boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_agent record;
  v_version_id uuid;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_user_id is not null and p_user_id <> v_uid then
    raise exception 'cannot create a shortcut for another user' using errcode = '42501';
  end if;
  if p_organization_id is not null
     and coalesce(iam.has_org_access(p_organization_id), false) is not true then
    raise exception 'not authorized for organization %', p_organization_id using errcode = '42501';
  end if;
  if p_project_id is not null
     and coalesce(iam.has_access('project', p_project_id, 'editor'), false) is not true then
    raise exception 'not authorized for project %', p_project_id using errcode = '42501';
  end if;
  if p_task_id is not null
     and coalesce(iam.has_access('task', p_task_id, 'editor'), false) is not true then
    raise exception 'not authorized for task %', p_task_id using errcode = '42501';
  end if;

  select a.id, a.name, a.version
  into v_agent
  from agent.definition a
  where a.id = p_agent_id;
  if not found then raise exception 'Agent not found'; end if;

  if not p_use_latest then
    select av.id into v_version_id
    from agent.definition_version av
    where av.agent_id = p_agent_id and av.version_number = v_agent.version;
  end if;

  if p_user_id is null and p_organization_id is null
     and p_project_id is null and p_task_id is null then
    p_user_id := v_uid;
  end if;

  v_new_id := gen_random_uuid();
  insert into agent.shortcut (
    id, category_id, label, agent_id, agent_version_id, use_latest,
    enabled_features, display_mode, allow_chat, auto_run,
    show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results, show_pre_execution_gate,
    bypass_gate_seconds, is_active, created_by, organization_id
  ) values (
    v_new_id, p_category_id, p_label, p_agent_id, v_version_id, p_use_latest,
    '["general"]'::jsonb, 'modal-full', true, false,
    false, 'inline', false, false, false, false, false,
    3, true, p_user_id, p_organization_id
  );

  if p_project_id is not null then
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    values ('agent_shortcut', v_new_id, 'project', p_project_id,
            coalesce(p_organization_id, (select w.organization_id from workspace.projects w where w.id = p_project_id)),
            v_uid)
    on conflict do nothing;
  end if;
  if p_task_id is not null then
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    values ('agent_shortcut', v_new_id, 'task', p_task_id,
            coalesce(p_organization_id, (select w.organization_id from workspace.tasks w where w.id = p_task_id)),
            v_uid)
    on conflict do nothing;
  end if;
  return v_new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agx_create_shortcut_m(p_agent_id uuid, p_label text, p_category_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_use_latest boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_agent record;
  v_version_id uuid;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_user_id is not null and p_user_id <> v_uid then
    raise exception 'cannot create a shortcut for another user' using errcode = '42501';
  end if;
  if p_organization_id is not null
     and coalesce(iam.has_org_access(p_organization_id), false) is not true then
    raise exception 'not authorized for organization %', p_organization_id using errcode = '42501';
  end if;
  if p_project_id is not null
     and coalesce(iam.has_access('project', p_project_id, 'editor'), false) is not true then
    raise exception 'not authorized for project %', p_project_id using errcode = '42501';
  end if;
  if p_task_id is not null
     and coalesce(iam.has_access('task', p_task_id, 'editor'), false) is not true then
    raise exception 'not authorized for task %', p_task_id using errcode = '42501';
  end if;

  select a.id, a.name, a.version into v_agent from agent.definition a where a.id = p_agent_id;
  if not found then raise exception 'Agent not found'; end if;

  if not p_use_latest then
    select av.id into v_version_id
    from agent.definition_version av
    where av.agent_id = p_agent_id and av.version_number = v_agent.version;
  end if;

  if p_user_id is null and p_organization_id is null
     and p_project_id is null and p_task_id is null then
    p_user_id := v_uid;
  end if;

  insert into mandate.vw_shortcut (
    category_id, label, agent_id, agent_version_id, use_latest,
    enabled_features, display_mode, allow_chat, auto_run,
    show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results, show_pre_execution_gate,
    bypass_gate_seconds, is_active, created_by, organization_id
  ) values (
    p_category_id, p_label, p_agent_id, v_version_id, p_use_latest,
    '["general"]'::jsonb, 'modal-full', true, false,
    false, 'inline', false, false, false, false, false,
    3, true, p_user_id, p_organization_id
  )
  returning id into v_new_id;

  if p_project_id is not null then
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    values ('agent_shortcut', v_new_id, 'project', p_project_id,
            coalesce(p_organization_id, (select w.organization_id from workspace.projects w where w.id = p_project_id)),
            v_uid)
    on conflict do nothing;
  end if;
  if p_task_id is not null then
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    values ('agent_shortcut', v_new_id, 'task', p_task_id,
            coalesce(p_organization_id, (select w.organization_id from workspace.tasks w where w.id = p_task_id)),
            v_uid)
    on conflict do nothing;
  end if;
  return v_new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agx_declare_contract_break(p_agent_id uuid, p_version_number integer, p_kind text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_kind IS NOT NULL AND p_kind NOT IN ('input','output','both') THEN
    RAISE EXCEPTION 'invalid contract break kind: %', p_kind;
  END IF;
  IF NOT (is_platform_admin() OR EXISTS (
    SELECT 1 FROM agent.definition d
    WHERE d.id = p_agent_id
      AND (d.created_by = (SELECT auth.uid()) OR iam.has_access('agent', d.id, 'editor'))
  )) THEN
    RAISE EXCEPTION 'not authorized to declare a contract break on this agent';
  END IF;
  UPDATE agent.definition_version
  SET contract_break_declared = p_kind
  WHERE agent_id = p_agent_id AND version_number = p_version_number;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'version % not found for agent %', p_version_number, p_agent_id;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.agx_exemplar_approve(p_exemplar_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_agent uuid; v_cap integer; v_approved integer;
BEGIN
  SELECT e.agent_id INTO v_agent FROM agent.exemplar e
  WHERE e.id = p_exemplar_id AND e.deleted_at IS NULL;
  IF v_agent IS NULL THEN RAISE EXCEPTION 'test case % not found', p_exemplar_id; END IF;
  IF NOT (is_platform_admin() OR EXISTS (
    SELECT 1 FROM agent.exemplar e
    WHERE e.id = p_exemplar_id
      AND (e.created_by = (SELECT auth.uid())
           OR iam.has_access('agent_exemplar', e.id, 'editor')
           OR iam.has_access('agent', e.agent_id, 'editor'))
  )) THEN
    RAISE EXCEPTION 'not authorized to approve this test case';
  END IF;
  SELECT (value #>> '{}')::integer INTO v_cap
  FROM platform.feature_knob WHERE feature='agent_exemplars' AND key='max_approved_per_agent';
  IF v_cap IS NULL THEN
    RAISE EXCEPTION 'feature knob agent_exemplars.max_approved_per_agent is missing';
  END IF;
  SELECT count(*) INTO v_approved FROM agent.exemplar
  WHERE agent_id = v_agent AND status='approved' AND deleted_at IS NULL AND id <> p_exemplar_id;
  IF v_approved >= v_cap THEN
    RAISE EXCEPTION 'approved test-case cap reached for this agent (% of %). Archive one first.', v_approved, v_cap
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE agent.exemplar e SET
    status = 'approved',
    input_contract_hash = d.input_contract_hash,
    output_contract_hash = d.output_contract_hash,
    agent_version = d.version
  FROM agent.definition d
  WHERE e.id = p_exemplar_id AND d.id = e.agent_id;
END $function$;

CREATE OR REPLACE FUNCTION public.agx_promote_shortcut_to_global(p_shortcut_id uuid, p_target_category_id uuid, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_source record; v_category record; v_new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can promote shortcuts to global'; END IF;
  SELECT * INTO v_source FROM agent.shortcut WHERE id = p_shortcut_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source shortcut % not found', p_shortcut_id; END IF;
  SELECT * INTO v_category FROM platform.categories WHERE id = p_target_category_id AND dimension = 'shortcut';
  IF NOT FOUND THEN RAISE EXCEPTION 'Target category % not found', p_target_category_id; END IF;
  IF v_category.organization_id IS NOT NULL
     OR (v_category.metadata->>'user_id')    IS NOT NULL
     OR (v_category.metadata->>'project_id') IS NOT NULL
     OR (v_category.metadata->>'task_id')    IS NOT NULL THEN
    RAISE EXCEPTION 'Target category must be global (all ownership columns NULL)';
  END IF;
  v_new_id := gen_random_uuid();
  INSERT INTO agent.shortcut (
    id, category_id, label, description, icon_name, keyboard_shortcut, sort_order,
    agent_id, agent_version_id, use_latest, enabled_features, scope_mappings, context_mappings, value_mappings,
    display_mode, allow_chat, auto_run, show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content, hide_reasoning, hide_tool_results,
    show_pre_execution_gate, pre_execution_message, bypass_gate_seconds,
    default_user_input, default_variables, context_overrides, llm_overrides,
    is_active, created_by, organization_id)
  VALUES (
    v_new_id, p_target_category_id,
    COALESCE(NULLIF(btrim(p_label), ''), v_source.label),
    v_source.description, v_source.icon_name, NULL, v_source.sort_order,
    v_source.agent_id, v_source.agent_version_id, v_source.use_latest,
    v_source.enabled_features, v_source.scope_mappings, v_source.context_mappings, v_source.value_mappings,
    v_source.display_mode, v_source.allow_chat, v_source.auto_run,
    v_source.show_variable_panel, v_source.variables_panel_style,
    v_source.show_definition_messages, v_source.show_definition_message_content,
    v_source.hide_reasoning, v_source.hide_tool_results,
    v_source.show_pre_execution_gate, v_source.pre_execution_message, v_source.bypass_gate_seconds,
    v_source.default_user_input, v_source.default_variables, v_source.context_overrides, v_source.llm_overrides,
    true, NULL, NULL);
  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_promote_shortcut_to_global_m(p_shortcut_id uuid, p_target_category_id uuid, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_source record; v_category record; v_new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can promote shortcuts to global'; END IF;
  SELECT * INTO v_source FROM mandate.vw_shortcut WHERE id = p_shortcut_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source shortcut % not found', p_shortcut_id; END IF;
  SELECT * INTO v_category FROM platform.categories WHERE id = p_target_category_id AND dimension = 'shortcut';
  IF NOT FOUND THEN RAISE EXCEPTION 'Target category % not found', p_target_category_id; END IF;
  IF v_category.organization_id IS NOT NULL
     OR (v_category.metadata->>'user_id')    IS NOT NULL
     OR (v_category.metadata->>'project_id') IS NOT NULL
     OR (v_category.metadata->>'task_id')    IS NOT NULL THEN
    RAISE EXCEPTION 'Target category must be global (all ownership columns NULL)';
  END IF;
  INSERT INTO mandate.vw_shortcut (
    category_id, label, description, icon_name, keyboard_shortcut, sort_order,
    agent_id, agent_version_id, use_latest, enabled_features, scope_mappings, context_mappings, value_mappings, write_policies,
    display_mode, allow_chat, auto_run, show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content, hide_reasoning, hide_tool_results,
    show_pre_execution_gate, pre_execution_message, bypass_gate_seconds,
    default_user_input, default_variables, context_overrides, llm_overrides,
    is_active, created_by, organization_id)
  VALUES (
    p_target_category_id,
    COALESCE(NULLIF(btrim(p_label), ''), v_source.label),
    v_source.description, v_source.icon_name, NULL, v_source.sort_order,
    v_source.agent_id, v_source.agent_version_id, v_source.use_latest,
    v_source.enabled_features, v_source.scope_mappings, v_source.context_mappings, v_source.value_mappings, v_source.write_policies,
    v_source.display_mode, v_source.allow_chat, v_source.auto_run,
    v_source.show_variable_panel, v_source.variables_panel_style,
    v_source.show_definition_messages, v_source.show_definition_message_content,
    v_source.hide_reasoning, v_source.hide_tool_results,
    v_source.show_pre_execution_gate, v_source.pre_execution_message, v_source.bypass_gate_seconds,
    v_source.default_user_input, v_source.default_variables, v_source.context_overrides, v_source.llm_overrides,
    true, NULL, NULL)
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_template(p_template_id uuid, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_template_type record;
  v_type_id_map jsonb := '{}'::jsonb;
  v_new_type_id uuid;
  v_field record;
  v_created_types jsonb := '[]'::jsonb;
  v_items_count integer := 0;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
  end if;

  if not exists (select 1 from context.templates t where t.id = p_template_id and t.is_active = true) then
    perform platform.refuse_not_found(format('active template %s not found', p_template_id));
  end if;

  for v_template_type in
    select * from context.template_scope_types where template_id = p_template_id order by sort_order
  loop
    insert into context.scope_types (
      organization_id, label_singular, label_plural, icon, description,
      sort_order, max_assignments_per_entity, slug
    ) values (
      p_org_id, v_template_type.label_singular, v_template_type.label_plural,
      v_template_type.icon, v_template_type.description, v_template_type.sort_order,
      v_template_type.max_assignments_per_entity,
      context.slugify(v_template_type.label_plural)   -- explicit; trigger also guarantees this
    )
    returning id into v_new_type_id;

    v_type_id_map := v_type_id_map || jsonb_build_object(v_template_type.id::text, v_new_type_id::text);
    v_created_types := v_created_types || jsonb_build_array(jsonb_build_object(
      'id', v_new_type_id, 'label_singular', v_template_type.label_singular, 'label_plural', v_template_type.label_plural));

    for v_field in
      select * from context.template_context_items where template_scope_type_id = v_template_type.id order by sort_order
    loop
      -- A REFERENCE FIELD POINTS AT A SCOPE OF ITS OWN TYPE (SCOPES-WRITE-THROUGH). Every business
      -- template's "Reports To" is "the team member this person reports to", and a reference item
      -- must name what it may point at (context_items_reference_types_required): without this, 26 of
      -- the 34 templates could not be applied at all.
      insert into context.context_items (
        scope_type_id, key, display_name, description, value_type,
        status, fetch_hint, sensitivity, source_type, created_by,
        allowed_reference_types, allowed_scope_type_ids
      ) values (
        v_new_type_id, v_field.key, v_field.display_name, v_field.description, v_field.value_type,
        'active', 'on_demand', 'internal', 'manual', (select auth.uid()),
        case when v_field.value_type = 'reference' then array['scope'] end,
        case when v_field.value_type = 'reference' then array[v_new_type_id] end
        -- slug auto-mirrored from key by context.ensure_slug()
      );
      v_items_count := v_items_count + 1;
    end loop;
  end loop;

  for v_template_type in
    select id, parent_template_type_id from context.template_scope_types
    where template_id = p_template_id and parent_template_type_id is not null
  loop
    update context.scope_types
    set parent_type_id = (v_type_id_map ->> v_template_type.parent_template_type_id::text)::uuid
    where id = (v_type_id_map ->> v_template_type.id::text)::uuid;
  end loop;

  return jsonb_build_object(
    'template_id', p_template_id, 'organization_id', p_org_id,
    'scope_types_created', v_created_types, 'context_items_count', v_items_count);
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_template_by_key(p_template_key text, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_template_id uuid;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id
      using errcode = '42501';
  end if;

  select t.id
  into v_template_id
  from context.templates t
  where t.key = p_template_key
    and t.is_active = true;

  if v_template_id is null then
    perform platform.refuse_not_found(format('Template with key %s not found', p_template_key));
  end if;

  return public.apply_template(v_template_id, p_org_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.assoc_add(p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid, p_org_id uuid DEFAULT NULL::uuid, p_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_role text DEFAULT NULL::text, p_position integer DEFAULT NULL::integer, p_payload_kind text DEFAULT NULL::text, p_payload jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_org uuid;
    v_id uuid;
    v_container_side text;
    v_container_type text;
    v_container_id uuid;
    v_org_from_fallback boolean := false;
    v_source_editor boolean;
    v_source_viewer boolean;
    v_target_editor boolean;
    v_target_viewer boolean;
    v_label text := p_label;        -- 1361: the label written — the registry's when it names the pair
    v_registry_label text;
begin
    if (select auth.uid()) is null then
        raise exception 'assoc_add: authenticated user required'
            using errcode = '42501';
    end if;

    if p_source_type = 'file' and p_target_type = 'conversation' then
        if p_role is not null or p_position is not null
           or p_payload_kind is not null or p_payload is not null then
            raise exception 'file -> conversation supports only the canonical role-less attachment edge'
                using errcode = '42501';
        end if;
        return public.conversation_file_add(
            p_target_id,
            p_source_id,
            p_label,
            coalesce(p_metadata, '{}'::jsonb),
            coalesce(p_metadata, '{}'::jsonb) ? 'resource_policy'
        );
    end if;

    -- 🚨 1361 (2026-09-27) — THE REGISTRY NAMES THE EDGE, NOT THE CLIENT. When platform.association_types
    -- registers exactly one row for (source type, target type) and that row carries a label, that label
    -- is written whatever the caller sent: none (assoc_set_targets cannot send one), a display name
    -- (the scope's own name), or the right one. platform.enforce_known_association refused both of the
    -- first two, so filing a Source under a scope failed and bulk sets on a named pair always failed.
    -- A pair registered with several labels, or with a NULL (open) label, keeps the caller's label.
    select case when count(*) = 1 then max(at.label) end
      into v_registry_label
      from platform.association_types at
     where at.source_type = p_source_type
       and at.target_type = p_target_type
       and at.is_active;
    v_label := coalesce(v_registry_label, p_label);

    select at.container_side
      into v_container_side
      from platform.association_types at
     where at.source_type = p_source_type
       and at.target_type = p_target_type
       and at.is_active
     order by (at.label is not distinct from v_label) desc, (at.label is null) desc
     limit 1;

    v_source_editor := iam.has_access(
        p_source_type, p_source_id, 'editor'::public.permission_level
    );
    v_source_viewer := iam.has_access(
        p_source_type, p_source_id, 'viewer'::public.permission_level
    );
    v_target_editor := iam.has_access(
        p_target_type, p_target_id, 'editor'::public.permission_level
    );
    v_target_viewer := iam.has_access(
        p_target_type, p_target_id, 'viewer'::public.permission_level
    );

    if v_container_side is distinct from 'none'
       and v_container_side is not null then
        if v_source_editor is not true or v_target_editor is not true then
            raise exception 'assoc_add: editor access to both endpoints is required for an access-conveying edge'
                using errcode = '42501';
        end if;

        if v_container_side = 'target' then
            v_container_type := p_target_type;
            v_container_id := p_target_id;
        elsif v_container_side = 'source' then
            v_container_type := p_source_type;
            v_container_id := p_source_id;
        else
            raise exception 'assoc_add: unsupported container_side %', v_container_side
                using errcode = '23514';
        end if;

        v_org := private.association_container_organization_id(
            v_container_type,
            v_container_id
        );
        if v_org is null then
            raise exception 'assoc_add: access-conveying container has no organization'
                using errcode = '23514';
        end if;
    else
        if coalesce((
            (v_source_editor and v_target_viewer)
            or (v_source_viewer and v_target_editor)
        ), false) is not true then
            raise exception 'assoc_add: non-conveying edges require editor access to one endpoint and viewer access to the other'
                using errcode = '42501';
        end if;

        -- Derive the edge org from a real endpoint. A caller-supplied org is
        -- only a fallback for registered endpoint types with no org column.
        v_org := private.association_container_organization_id(
            p_source_type,
            p_source_id
        );
        if v_org is null then
            v_org := private.association_container_organization_id(
                p_target_type,
                p_target_id
            );
        end if;
        if v_org is null then
            v_org := p_org_id;
            v_org_from_fallback := true;
        end if;
    end if;

    if v_org is null or (
        v_org_from_fallback and not iam.has_org_access(v_org)
    ) then
        raise exception
            'assoc_add: no org access (org=%, %/% -> %/% role=%)',
            v_org, p_source_type, p_source_id, p_target_type, p_target_id, p_role
            using errcode = '42501';
    end if;

    insert into platform.associations (
        source_type, source_id, target_type, target_id, organization_id,
        role, label, position, metadata, payload_kind, payload, created_by
    ) values (
        p_source_type, p_source_id, p_target_type, p_target_id, v_org,
        p_role, v_label, p_position, coalesce(p_metadata, '{}'::jsonb),
        p_payload_kind, p_payload, (select auth.uid())
    )
    on conflict (source_type, source_id, target_type, target_id, role)
    do update set
        label = coalesce(excluded.label, platform.associations.label),
        position = coalesce(excluded.position, platform.associations.position),
        metadata = excluded.metadata,
        payload_kind = coalesce(
            excluded.payload_kind,
            platform.associations.payload_kind
        ),
        payload = case
            when excluded.payload_kind is not null then excluded.payload
            else platform.associations.payload
        end
    returning id into v_id;

    -- TAILS-5: RE-ADDING SOMETHING THAT WAS REMOVED HANDS BACK NO ROW, AND THAT IS NOT NULL.
    -- `trg_associations_revive_tombstone` revives the tombstoned edge IN PLACE and skips the
    -- insert, so this statement returns zero rows — correctly, because nothing was inserted.
    -- The edge exists and this reads it by the key it was just written under. Returning NULL
    -- here would be the silent failure the trigger fix was written to avoid.
    if v_id is null then
        select a.id into v_id
          from platform.associations a
         where a.source_type = p_source_type and a.source_id = p_source_id
           and a.target_type = p_target_type and a.target_id = p_target_id
           and a.role is not distinct from p_role
         limit 1;
    end if;
    if v_id is null then
        perform platform.refuse_not_found(format('assoc_add: the edge %s/%s -> %s/%s (role %s) was neither written nor found afterwards', p_source_type, p_source_id, p_target_type, p_target_id, coalesce(p_role, '<none>')), 'TAILS-5: this door never hands back a null id. If you are seeing this, the write was refused by something that did not raise.');
    end if;

    return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.assoc_list(p_type text, p_id uuid, p_direction text DEFAULT 'out'::text, p_role text DEFAULT NULL::text)
 RETURNS TABLE(assoc_id uuid, direction text, role text, label text, edge_position integer, other_type text, other_id uuid, metadata jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  -- DD-205: the anchor. Unchanged, and it still refuses out loud rather than answering emptily.
  IF NOT iam.assoc_side_readable(p_type, p_id) THEN
    RAISE EXCEPTION 'assoc_list: you may not read %/% , so its edges cannot be listed (DD-205: an edge is revealed only when BOTH ends may be read).', p_type, p_id
      USING ERRCODE = '42501';
  END IF;
  IF p_direction NOT IN ('out','in','both') THEN RAISE EXCEPTION 'direction must be out|in|both'; END IF;
  RETURN QUERY
    SELECT a.id,'out'::text,a.role,a.label,a.position,a.target_type,a.target_id,a.metadata,a.created_at
      FROM platform.associations_live a
     WHERE p_direction IN ('out','both') AND a.source_type=p_type AND a.source_id=p_id
       AND (p_role IS NULL OR a.role=p_role)
       AND (a.role IS DISTINCT FROM 'context_tag' OR p_role = 'context_tag')   -- SC-4: a copied tag is not an attachment
       AND iam.org_readable(a.organization_id, a.target_type)        -- DD-205: the EDGE's own tenancy
       AND iam.assoc_side_readable(a.target_type, a.target_id)       -- DD-205: AND the row it reveals
    UNION ALL
    SELECT a.id,'in'::text,a.role,a.label,a.position,a.source_type,a.source_id,a.metadata,a.created_at
      FROM platform.associations_live a
     WHERE p_direction IN ('in','both') AND a.target_type=p_type AND a.target_id=p_id
       AND (p_role IS NULL OR a.role=p_role)
       AND iam.org_readable(a.organization_id, a.source_type)        -- DD-205
       AND iam.assoc_side_readable(a.source_type, a.source_id)       -- DD-205
    ORDER BY 5 NULLS LAST, 9;
END; $function$;

CREATE OR REPLACE FUNCTION billing.plan_limit_set(p_plan_id text, p_capability text, p_period billing.meter_period, p_limit_value bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
  declare v_row billing.plan_limit%rowtype; v_org uuid;
  begin
    if not public.is_super_admin() then
      raise exception 'billing.plan_limit_set: super-admin only' using errcode = '42501';
    end if;
    select organization_id into v_org from billing.plan where plan_key = p_plan_id;
    if not found then
      raise exception 'billing.plan_limit_set: unknown plan %', p_plan_id using errcode = '22023';
    end if;
    if v_org is null then
      raise exception 'organization_required: plan % carries no organization', p_plan_id using errcode = '23502';
    end if;
    if not exists (select 1 from billing.capability where capability = p_capability) then
      raise exception 'billing.plan_limit_set: unknown capability %', p_capability using errcode = '22023';
    end if;
    if p_limit_value is not null and p_limit_value < 0 then
      raise exception 'billing.plan_limit_set: limit_value may not be negative' using errcode = '22023';
    end if;
    insert into billing.plan_limit as pl (plan_id, capability, period, limit_value, organization_id)
    values (p_plan_id, p_capability, p_period, p_limit_value, v_org)
    on conflict (plan_id, capability, period) do update
      set limit_value = excluded.limit_value,
          updated_at = now(),
          deleted_at = null
    returning * into v_row;
    return to_jsonb(v_row);
  end;
$function$;

CREATE OR REPLACE FUNCTION public.bump_version(p_file_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_new INT;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('file', p_file_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to modify file %', p_file_id USING ERRCODE = '42501';
    END IF;
    UPDATE files.files
       SET current_version = current_version + 1,
           updated_at = now()
     WHERE id = p_file_id
       AND deleted_at IS NULL
    RETURNING current_version INTO v_new;
    IF v_new IS NULL THEN
        perform platform.refuse_not_found(format('bump_version: file %s not found or deleted', p_file_id));
    END IF;
    RETURN v_new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cat_write(p_dimension text, p_category_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_slug text DEFAULT NULL::text, p_set_slug boolean DEFAULT false, p_parent_id uuid DEFAULT NULL::uuid, p_set_parent boolean DEFAULT false, p_color text DEFAULT NULL::text, p_set_color boolean DEFAULT false, p_icon text DEFAULT NULL::text, p_set_icon boolean DEFAULT false, p_position integer DEFAULT NULL::integer, p_set_position boolean DEFAULT false, p_placement_type text DEFAULT NULL::text, p_set_placement_type boolean DEFAULT false, p_metadata_patch jsonb DEFAULT NULL::jsonb, p_is_system boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_row platform.categories;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_dim text := nullif(btrim(coalesce(p_dimension, '')), '');
begin
  if v_actor is null then
    raise exception 'cat_write: a category belongs to an organization, and nobody is signed in.'
      using errcode = '42501';
  end if;
  if v_dim is null then
    raise exception 'cat_write: name the dimension this category belongs to (feedback, shortcut, skill, app, …).'
      using errcode = '22004';
  end if;
  if p_metadata_patch is not null
     and jsonb_typeof(p_metadata_patch) is distinct from 'object' then
    raise exception 'cat_write: the metadata patch is an object.' using errcode = '22023';
  end if;

  -- ── CREATE ──
  if p_category_id is null then
    if v_name is null then
      raise exception 'cat_write: a category needs a name.' using errcode = '22004';
    end if;
    if p_organization_id is null then
      raise exception 'cat_write: name the organization this category belongs to.'
        using errcode = '22004';
    end if;
    -- THE LADDER. What std_insert asked, plus the is_system arm the cat_* doors already carry.
    if not (iam.has_org_access(p_organization_id)
            or (p_organization_id in (select organization_id from iam.system_orgs where global_readable)
                and public.is_super_admin())) then
      raise exception 'cat_write: % is not an organization you can add a category to.', p_organization_id
        using errcode = '42501';
    end if;
    if coalesce(p_is_system, false) and not public.is_super_admin() then
      raise exception 'cat_write: a SYSTEM category is platform vocabulary, not an organization''s — that needs a super admin.'
        using errcode = '42501';
    end if;
    -- THE PARENT IS THIS ORGANIZATION'S OR THE PLATFORM'S, the sentence cat_create already
    -- carries (0850): a foreign parent and an invented one answer the SAME way, so the door is
    -- not an existence oracle over every category id.
    if p_parent_id is not null and not exists (
         select 1 from platform.categories parent
          where parent.id = p_parent_id and parent.deleted_at is null
            and parent.dimension = v_dim
            and (parent.organization_id = p_organization_id or parent.is_system)) then
      raise exception 'cat_write: parent category not found' using errcode = '22023';
    end if;

    insert into platform.categories
      (organization_id, dimension, name, slug, parent_id, is_system, color, icon,
       "position", placement_type, metadata, created_by, updated_by)
    values
      (p_organization_id, v_dim, v_name, nullif(btrim(coalesce(p_slug, '')), ''),
       p_parent_id, coalesce(p_is_system, false), p_color, p_icon,
       p_position, nullif(btrim(coalesce(p_placement_type, '')), ''),
       coalesce(p_metadata_patch, '{}'::jsonb), v_actor, v_actor)
    returning * into v_row;

    return public._category_json(v_row);
  end if;

  -- ── UPDATE ──
  -- RESOLVED BY (id, dimension) TOGETHER. One table holds every vocabulary in the product and
  -- no policy on it has ever looked at which one a row belongs to.
  select * into v_row
    from platform.categories c
   where c.id = p_category_id and c.dimension = v_dim and c.deleted_at is null;
  if not found then
    return null;
  end if;

  if v_row.is_system then
    if not public.is_super_admin() then
      raise exception 'cat_write: this is platform vocabulary, not your organization''s — changing it needs a super admin.'
        using errcode = '42501';
    end if;
  elsif not (iam.has_org_access(v_row.organization_id)
             or v_row.created_by = v_actor
             or iam.has_access('category', v_row.id, 'editor'::public.permission_level)
             or ((v_row.visibility >= 'internal'::platform.visibility) and public.is_platform_admin())) then
    -- A CATEGORY THE CALLER MAY NOT EVEN SEE ANSWERS WHAT A MISSING ONE ANSWERS
    -- (ARGS-RULED-2, 2026-09-22). Until this line a stranger got 42501 here and NULL a few
    -- lines up for an invented id, so one call per guessed uuid told a signed-in account
    -- whether it named a live category of another organization. Somebody who may SEE it
    -- (public, or a viewer grant) already knows it exists and is still told plainly why not.
    if not (v_row.visibility = 'public'::platform.visibility
            or iam.has_access('category', v_row.id, 'viewer'::public.permission_level)) then
      return null;
    end if;
    raise exception 'cat_write: this category is not yours to change.' using errcode = '42501';
  end if;

  if p_set_parent and p_parent_id is not null and not exists (
       select 1 from platform.categories parent
        where parent.id = p_parent_id and parent.deleted_at is null
          and parent.dimension = v_dim
          and (parent.organization_id = v_row.organization_id or parent.is_system)) then
    raise exception 'cat_write: parent category not found' using errcode = '22023';
  end if;

  -- A PATCH, NOT A REPLACEMENT. Every optional column carries its own `p_set_*` flag, so a
  -- caller changing a name cannot erase a colour it never mentioned — which is what the
  -- existing cat_update does, and what several of these call sites were working around.
  update platform.categories c
     set name = coalesce(v_name, c.name),
         slug = case when p_set_slug then nullif(btrim(coalesce(p_slug, '')), '') else c.slug end,
         parent_id = case when p_set_parent then p_parent_id else c.parent_id end,
         color = case when p_set_color then p_color else c.color end,
         icon = case when p_set_icon then p_icon else c.icon end,
         "position" = case when p_set_position then p_position else c."position" end,
         placement_type = case when p_set_placement_type
                               then nullif(btrim(coalesce(p_placement_type, '')), '')
                               else c.placement_type end,
         -- THE MERGE. ContentBlocksManager wrote `{ is_active }` over the whole column and
         -- wiped `legacy_table` with it.
         metadata = case when p_metadata_patch is null then c.metadata
                         else c.metadata || p_metadata_patch end,
         updated_by = v_actor
   where c.id = v_row.id and c.dimension = v_dim and c.deleted_at is null
  returning * into v_row;

  return public._category_json(v_row);
end;
$function$;

CREATE OR REPLACE FUNCTION public.checklist_run_start(p_organization_id uuid, p_checklist_key text, p_target_key text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_target text := coalesce(p_target_key, '');
  v_row platform.guided_checklist_run;
begin
  if v_actor is null then
    raise exception 'checklist_run_start: a guided checklist belongs to the person doing it, and nobody is signed in.'
      using errcode = '42501';
  end if;
  if p_organization_id is null or coalesce(btrim(p_checklist_key), '') = '' then
    raise exception 'checklist_run_start: name the organization and the checklist.'
      using errcode = '22004';
  end if;
  -- THE LADDER. Same question `std_insert` asked: this person may act in this organization.
  if not iam.has_org_access(p_organization_id) then
    raise exception 'checklist_run_start: % is not an organization you can act in.', p_organization_id
      using errcode = '42501';
  end if;

  -- A run is per (checklist, target, organization). The client's loadOrCreateRun already
  -- races two tabs and re-reads; doing the read INSIDE the door makes the race impossible
  -- instead of recoverable.
  select * into v_row
    from platform.guided_checklist_run r
   where r.checklist_key = p_checklist_key
     and r.target_key = v_target
     and r.organization_id = p_organization_id
     and r.deleted_at is null
   limit 1;

  if not found then
    insert into platform.guided_checklist_run
      (checklist_key, target_key, organization_id, state, created_by)
    values (p_checklist_key, v_target, p_organization_id, '{}'::jsonb, v_actor)
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'id', v_row.id, 'checklist_key', v_row.checklist_key, 'target_key', v_row.target_key,
    'organization_id', v_row.organization_id, 'state', v_row.state,
    'completed_at', v_row.completed_at, 'dismissed_at', v_row.dismissed_at,
    'created_at', v_row.created_at, 'updated_at', v_row.updated_at, 'version', v_row.version);
end;
$function$;

CREATE OR REPLACE FUNCTION public.cmt_add(p_entity_type text, p_entity_id uuid, p_body text, p_parent_id uuid DEFAULT NULL::uuid, p_org_id uuid DEFAULT NULL::uuid, p_anchor jsonb DEFAULT NULL::jsonb, p_suggested_text text DEFAULT NULL::text, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid := p_org_id;
  v_scoped boolean;
  v_entity_org uuid;
  v_named boolean := p_org_id is not null;
  v_problem text;
  v_id uuid;
begin
  -- 🚨 RC-A2b (2026-09-25): a comment is never the record a comment is on. A reply goes through
  -- the record's own thread (p_parent_id). Refused by TYPE, before any lookup, so it confirms
  -- nothing about any id (verify-RC-A2 F3; kept here because this file recreates cmt_add).
  if platform.token_is_detail(p_entity_type) then  -- RC-A2e: every declared detail
    raise exception 'cmt_add: a comment cannot be filed on a % — reply in its thread instead: cmt_add(<the record type>, <the record id>, body, p_parent_id => <the comment id>)',
      p_entity_type using errcode = '22023';
  end if;
  -- Deny before resolving organization or looking up the row (RC-A2: no existence oracle).
  if not platform.detail_parent_access(p_entity_type, p_entity_id, 'commenter'::public.permission_level) then
    raise exception 'cmt_add: you cannot comment on this record (%/%) -- commenting needs the commenter level on it. Ask its owner to share it with you at commenter or above.',
      p_entity_type, p_entity_id
      using errcode = '42501';
  end if;

  v_scoped := platform.entity_is_org_scoped(p_entity_type);
  if v_scoped then
    v_entity_org := platform.entity_organization_id(p_entity_type, p_entity_id);
  end if;
  if v_org is null then
    v_org := v_entity_org;
  end if;
  if v_org is null then
    raise exception 'cmt_add: nothing named the organization this comment belongs to. The record (%/%) did not answer -- either its entity type is not organization-scoped or the row does not exist. Remedy: pass p_org_id, the organization you are acting in.',
      p_entity_type, p_entity_id
      using errcode = '23502';
  end if;
  if v_named and not iam.has_org_access(v_org) then
    raise exception 'cmt_add: no org access (org=%, %/%)', v_org, p_entity_type, p_entity_id
      using errcode = '42501';
  end if;
  if v_scoped and v_entity_org is distinct from v_org then
    raise exception 'cmt_add: entity not found in this organization' using errcode = '22023';
  end if;

  if p_parent_id is not null and not exists (
       select 1 from platform.comments parent
        where parent.id = p_parent_id and parent.deleted_at is null
          and parent.entity_type = p_entity_type and parent.entity_id = p_entity_id
          and parent.organization_id = v_org) then
    raise exception 'cmt_add: parent comment not found' using errcode = '22023';
  end if;

  -- RC-B11: the passage. A reply belongs to its thread's passage and carries none.
  if p_anchor is not null then
    if p_parent_id is not null then
      raise exception 'cmt_add: a reply carries no passage -- the thread it answers already points at one'
        using errcode = '22023';
    end if;
    if p_anchor ->> '__kind' is distinct from 'text_anchor' then
      raise exception 'cmt_add: a passage comment carries a text_anchor ("__kind": "text_anchor")'
        using errcode = '22023';
    end if;
    v_problem := coalesce(platform.text_anchor_problem(p_anchor),
                          platform.text_anchor_target_problem(p_entity_type, p_entity_id, p_anchor));
    if v_problem is not null then
      raise exception 'cmt_add: this comment''s passage is invalid: %', v_problem
        using errcode = '23514',
              hint = 'Anchor to the exact text of one version of the record (Unicode code points); a comment on the whole record carries no anchor.';
    end if;
  end if;
  if p_suggested_text is not null and p_anchor is null then
    raise exception 'cmt_add: a suggestion replaces a passage, so it needs one (p_anchor)'
      using errcode = '22023';
  end if;

  -- RC-B11: a repeat of the same create (a Retry after a lost response) is the first row.
  if p_client_request_id is not null then
    select c.id into v_id from platform.comments c
     where c.created_by = (select auth.uid()) and c.client_request_id = p_client_request_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into platform.comments (organization_id, entity_type, entity_id, parent_id, body, anchor,
                                 suggested_text, client_request_id, created_by, updated_by)
  values (v_org, p_entity_type, p_entity_id, p_parent_id, coalesce(p_body, ''), p_anchor,
          p_suggested_text, p_client_request_id, (select auth.uid()), (select auth.uid()))
  on conflict (created_by, client_request_id) where client_request_id is not null do nothing
  returning id into v_id;
  if v_id is null then  -- a concurrent twin of this same request won the race
    select c.id into v_id from platform.comments c
     where c.created_by = (select auth.uid()) and c.client_request_id = p_client_request_id;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION communication._meet_actor(p_claimed uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    if p_claimed is not null and p_claimed <> v_uid then
      raise exception 'meet: the acting user (%) is not the authenticated user', p_claimed
        using errcode = '42501';
    end if;
    return v_uid;
  end if;
  -- 1369: `current_user` is the owner inside a definer body, so it cannot tell a browser from
  -- the server. The one published predicate can (db-rules §6d-6).
  if not iam.is_trusted_backend() then
    raise exception 'meet: this action requires an authenticated user'
      using errcode = '42501';
  end if;
  -- Trusted server lane (service_role / the aidream pooler role). A claimed
  -- user is honored; NULL means "the server is acting and has already decided".
  return p_claimed;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.meet_set_occurrence(p_meeting_id uuid, p_original_start timestamp with time zone, p_action text, p_new_start timestamp with time zone, p_new_duration_minutes integer, p_reason text, p_by_user_id uuid)
 RETURNS communication.meet_occurrence_overrides
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor uuid; v_m communication.meet_meetings; v_o communication.meet_occurrence_overrides;
begin
  v_actor := communication._meet_actor(p_by_user_id);
  if not communication._meet_may(p_meeting_id, v_actor, 'editor') then
    raise exception 'meet_set_occurrence: only the host, a co-host, or an editor of this meeting can change its occurrences'
      using errcode = '42501';
  end if;
  select * into v_m from communication.meet_meetings
   where id = p_meeting_id and deleted_at is null for update;
  if not found then
    perform platform.refuse_not_found('meet_set_occurrence: no such meeting');
  end if;
  if v_m.recurrence_rule is null then
    raise exception 'meet_set_occurrence: this meeting does not repeat — reschedule or cancel the meeting itself'
      using errcode = '22023';
  end if;
  if v_m.cancelled_at is not null then
    raise exception 'meet_set_occurrence: this series was cancelled — its occurrences cannot change' using errcode = '55000';
  end if;
  if p_action not in ('cancel', 'move', 'restore') then
    raise exception 'meet_set_occurrence: the action is cancel, move or restore (got %)', p_action using errcode = '22023';
  end if;
  if not exists (
       select 1 from communication.meet_expand_occurrences(
         v_m.recurrence_rule, v_m.scheduled_for, v_m.time_zone,
         p_original_start, p_original_start + interval '1 second', 1) g
        where g = p_original_start) then
    raise exception 'meet_set_occurrence: % is not an occurrence of this series — name the start time the series generates',
      p_original_start using errcode = '22023';
  end if;
  if p_action = 'move' then
    if p_new_start is null then
      raise exception 'meet_set_occurrence: moving an occurrence needs its new start time' using errcode = '22023';
    end if;
    if p_new_duration_minutes is not null and (p_new_duration_minutes < 1 or p_new_duration_minutes > 1440) then
      raise exception 'meet_set_occurrence: a meeting lasts 1 to 1440 minutes' using errcode = '22023';
    end if;
  end if;

  select * into v_o from communication.meet_occurrence_overrides
   where meeting_id = p_meeting_id and original_start = p_original_start and deleted_at is null
   for update;

  if p_action = 'restore' then
    if not found then
      raise exception 'meet_set_occurrence: that occurrence is already on its normal schedule' using errcode = '22023';
    end if;
    update communication.meet_occurrence_overrides
       set deleted_at = now(), calendar_sequence = calendar_sequence + 1, changed_by = v_actor
     where id = v_o.id
    returning * into v_o;
    return v_o;
  end if;

  if found then
    update communication.meet_occurrence_overrides
       set state = case when p_action = 'cancel' then 'cancelled' else 'moved' end,
           new_start = case when p_action = 'move' then p_new_start else null end,
           new_duration_minutes = case when p_action = 'move' then p_new_duration_minutes else null end,
           reason = nullif(btrim(coalesce(p_reason, '')), ''),
           changed_by = v_actor,
           calendar_sequence = calendar_sequence + 1
     where id = v_o.id
    returning * into v_o;
  else
    insert into communication.meet_occurrence_overrides
      (meeting_id, original_start, state, new_start, new_duration_minutes, reason, changed_by,
       calendar_sequence, organization_id)
    values
      (p_meeting_id, p_original_start,
       case when p_action = 'cancel' then 'cancelled' else 'moved' end,
       case when p_action = 'move' then p_new_start else null end,
       case when p_action = 'move' then p_new_duration_minutes else null end,
       nullif(btrim(coalesce(p_reason, '')), ''), v_actor,
       -- The series' own sequence + 1, so the exception always outranks the series it amends.
       v_m.calendar_sequence + 1,
       v_m.organization_id)
    returning * into v_o;
  end if;
  return v_o;
end;
$function$;

CREATE OR REPLACE FUNCTION content_ir.admin_upsert_kind_content_block(p_kind_definition_id uuid, p_block_id text, p_label text, p_description text, p_icon_name text, p_template text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'content_ir', 'public', 'platform', 'skill'
AS $function$
declare
  v_kind text;
  v_org uuid;
  v_category uuid;
  v_skill uuid;
  v_meta jsonb;
  v_row skill.render_definition;
begin
  if not public.is_super_admin() then
    raise exception 'admin_upsert_kind_content_block: super admin only'
      using errcode = '42501';
  end if;

  if coalesce(btrim(p_block_id), '') = ''
     or coalesce(btrim(p_template), '') = ''
     or coalesce(btrim(p_label), '') = '' then
    raise exception 'admin_upsert_kind_content_block: block_id, label and template are required';
  end if;

  select kd.kind, kd.organization_id into v_kind, v_org
  from content_ir.kind_definition kd
  where kd.id = p_kind_definition_id and kd.deleted_at is null;
  if v_kind is null then
    raise exception 'admin_upsert_kind_content_block: kind_definition % not found', p_kind_definition_id;
  end if;

  select c.id into v_category
  from platform.categories c
  where c.placement_type = 'content-block'
    and c.organization_id = v_org
    and lower(c.name) = 'agent skills'
  limit 1;

  select d.id into v_skill
  from skill.definition d
  where d.skill_id = 'kind_' || v_kind and d.deleted_at is null
  limit 1;

  v_meta := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object('__kind_source', v_kind,
                          'kind_definition_id', p_kind_definition_id,
                          'generated', true);

  insert into skill.render_definition (
    block_id, label, description, icon_name, template,
    category_id, skill_id, organization_id, is_active, sort_order,
    version, visibility, block_type, metadata
  )
  values (
    p_block_id, btrim(p_label), p_description,
    coalesce(nullif(btrim(p_icon_name), ''), 'Shapes'), p_template,
    v_category, v_skill, v_org, true, 100,
    1,
    (case when v_org = '39c38960-d30c-4840-b0c1-c9960de95582'
          then 'public' else 'internal' end)::platform.visibility,
    'render_kind', v_meta
  )
  on conflict (block_id) where (deleted_at is null) do update set
    label = excluded.label,
    description = excluded.description,
    icon_name = excluded.icon_name,
    template = excluded.template,
    category_id = coalesce(excluded.category_id, skill.render_definition.category_id),
    skill_id = coalesce(excluded.skill_id, skill.render_definition.skill_id),
    organization_id = excluded.organization_id,
    is_active = true,
    deleted_at = null,
    visibility = excluded.visibility,
    block_type = 'render_kind',
    metadata = skill.render_definition.metadata || excluded.metadata
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

CREATE OR REPLACE FUNCTION content_ir.set_kind_activation(p_kind_definition_id uuid, p_active boolean, p_note text DEFAULT NULL::text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    d record;
    -- auth.uid() wins whenever present; p_actor only fills the server gap.
    v_uid uuid := coalesce(auth.uid(), p_actor);
    -- The service role is an authorized actor in its own right (D166): it may
    -- call with no auth.uid() and no p_actor. Detected via the JWT role claim
    -- (current_user is the definer owner here, never 'service_role').
    v_is_service boolean :=
        coalesce(auth.jwt() ->> 'role', '') = 'service_role'
        or session_user = 'service_role';
    v_verdict jsonb;
begin
    if v_uid is null and not v_is_service then
        raise exception 'set_kind_activation: no acting user (auth.uid() null and no p_actor)';
    end if;
    if p_active is null then
        raise exception
            'set_kind_activation: p_active must be true or false, not null';
    end if;

    select id, kind, created_by, is_active
      into d
      from content_ir.kind_definition
     where id = p_kind_definition_id;

    if d.id is null then
        raise exception 'set_kind_activation: kind definition % does not exist',
            p_kind_definition_id;
    end if;

    -- THE canonical gate: the same SECURITY DEFINER body behind the RLS
    -- policies and every kind_* tool write. Editor on the kind, or super
    -- admin (actor-aware), or the service role.
    if not v_is_service
       and not coalesce(
               iam.has_access_for(v_uid, 'content_ir_kind', d.id, 'editor'),
               false)
       and not coalesce(public.is_super_admin_for(v_uid), false)
    then
        raise exception
            'set_kind_activation: not authorized for kind "%" — you need editor access to the definition (or super admin)',
            d.kind;
    end if;

    if p_active is not true then
        perform set_config('content_ir.activation_ok', '1', true);
        update content_ir.kind_definition
           set is_active = false,
               updated_by = coalesce(v_uid, updated_by),
               metadata = case
                   when p_note is null then metadata
                   else jsonb_set(metadata, '{activation_note}', to_jsonb(p_note), true)
               end
         where id = d.id;

        return jsonb_build_object(
            'ok', true, 'kind', d.kind, 'kind_definition_id', d.id,
            'is_active', false, 'was_active', d.is_active, 'gated', false
        );
    end if;

    v_verdict := content_ir.evaluate_kind_activation(d.id);

    if not (v_verdict ->> 'would_activate')::boolean then
        raise exception
            'set_kind_activation: kind "%" failed the dual gate — %',
            d.kind,
            array_to_string(
                array(select jsonb_array_elements_text(v_verdict -> 'reasons')), ' | ');
    end if;

    perform set_config('content_ir.activation_ok', '1', true);
    update content_ir.kind_definition
       set is_active = true,
           updated_by = coalesce(v_uid, updated_by),
           metadata = case
               when p_note is null then metadata
               else jsonb_set(metadata, '{activation_note}', to_jsonb(p_note), true)
           end
     where id = d.id;

    return jsonb_build_object(
        'ok', true, 'kind', d.kind, 'kind_definition_id', d.id,
        'is_active', true, 'was_active', d.is_active, 'gated', true,
        'verdict', v_verdict
    );
end;
$function$;

CREATE OR REPLACE FUNCTION context.provision_scope_dataset(p_item_id uuid, p_scope_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item context.context_items; v_scope context.scopes; v_template workbench.udt_dataset_templates;
  v_dataset_id uuid; v_owner uuid; v_fence text; v_label text;
begin
  select * into v_item from context.context_items where id=p_item_id and is_active and deleted_at is null;
  select * into v_scope from context.scopes where id=p_scope_id and deleted_at is null;
  -- ARGS-RULED (2026-09-21). THE CALLER, BEFORE ANYTHING IS MADE IN SOMEBODY ELSE'S TENANT.
  -- This door took two ids and checked NEITHER against the person calling it: it resolved the
  -- scope, matched its scope_type to the item's, and then created a dataset, its fields, an
  -- instance row and a context value — all in `v_scope.organization_id`, whoever that was. It
  -- has carried a DECLARED `{"unchecked": true}` rule since 2026-09-17 and the reason did not
  -- hold: an organization id that decides where rows are written is an id that confers access.
  if v_scope.id is not null
     and not iam.is_trusted_backend()
     and not iam.has_org_access(v_scope.organization_id) then
    raise exception 'You are not a member of the organization that scope belongs to, so nothing was provisioned.'
      using errcode = '42501',
            hint = 'A context scope belongs to one organization, and provisioning its template-backed table writes a dataset, its fields and a context value into that organization. Switch to the organization the scope lives in, or ask an owner of it to add you.';
  end if;
  if not found or v_item.id is null or v_item.scope_type_id <> v_scope.scope_type_id then return null; end if;
  if v_item.reference_source->>'container_type' <> 'dataset_template' then return null; end if;
  select * into v_template from workbench.udt_dataset_templates
   where id=(v_item.reference_source->>'template_id')::uuid and is_active;
  -- A template belongs either to the scope's own organization, or to the
  -- PLATFORM (the system organization) — a platform starter kit such as "Known
  -- defects" is authored once and used by every organization, exactly like the
  -- 34 scope templates. Any third organization's template is still refused.
  if not found or v_template.organization_id not in (
       v_scope.organization_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid) then
    raise exception 'dataset template binding is invalid for context item %', p_item_id using errcode='22023';
  end if;
  select dataset_id into v_dataset_id from context.scope_dataset_instances
   where context_item_id=p_item_id and scope_id=p_scope_id;
  if v_dataset_id is not null then return v_dataset_id; end if;
  v_owner := coalesce(auth.uid(), v_scope.created_by, v_item.created_by, v_template.created_by);
  if v_owner is null then raise exception 'cannot provision template dataset without an owner' using errcode='23502'; end if;
  v_label := v_scope.name || ' — ' || v_item.display_name;
  perform set_config('app.udt_template_provisioning','on',true);
  insert into workbench.udt_datasets (
    table_name, description, user_id, organization_id, validation_mode,
    template_id, template_version, created_by, updated_by
  ) values (
    v_label,
    'Template-backed context table for ' || v_scope.name || ' / ' || v_item.display_name,
    v_owner, v_scope.organization_id, 'strict', v_template.id, v_template.version, v_owner, v_owner
  ) returning id into v_dataset_id;
  insert into workbench.udt_dataset_fields (
    table_id, field_name, display_name, data_type, field_order, is_required,
    default_value, validation_rules, user_id, organization_id, created_by, updated_by
  ) select v_dataset_id, f.field_name, f.display_name, f.data_type, f.field_order,
      f.is_required, f.default_value, f.validation_rules, v_owner, v_scope.organization_id, v_owner, v_owner
    from workbench.udt_dataset_template_fields f where f.template_id=v_template.id order by f.field_order;
  -- organization_id is NOT NULL on this table (the org-null-ban sweep added it
  -- after this function was written, and nothing re-read the writer). It is the
  -- SCOPE's organization, never the template's: a platform template provisions
  -- into the tenant that asked for it.
  insert into context.scope_dataset_instances (
    context_item_id, scope_id, dataset_id, template_id, template_version, created_by,
    organization_id
  ) values (p_item_id, p_scope_id, v_dataset_id, v_template.id, v_template.version, v_owner,
    v_scope.organization_id)
  on conflict (context_item_id, scope_id) do nothing;
  -- Kind Directives two-key shell — __kind FIRST (jsonb normalizes key order at
  -- rest, so the fence is built as TEXT to preserve first-key streaming reads).
  -- The noun is `table`, whose resolver expands the reference to the table's
  -- ROWS; `dataset` is a record pointer and renders the row's description.
  v_fence := '```matrx' || chr(10)
    || '{"__kind":"directive_v1_reference_table","items":'
    || jsonb_build_array(jsonb_build_object('table_id',v_dataset_id,'table_name',v_label,'label',v_label))::text
    || '}' || chr(10) || '```';
  perform context.write_context_value(
    p_item_id=>p_item_id, p_scope_id=>p_scope_id, p_value_text=>v_fence,
    p_change_summary=>'Provisioned template-backed dataset', p_source_type=>'system', p_actor=>v_owner
  );
  return v_dataset_id;
end; $function$;

CREATE OR REPLACE FUNCTION context.validate_dataset_template_source(p_source jsonb, p_org_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_template_id uuid;
begin
  if p_source is null or p_source->>'container_type' <> 'dataset_template' then return null; end if;
  if coalesce(p_source->>'dimension', 'whole') <> 'whole'
     or coalesce(p_source->>'provision', 'per_scope') <> 'per_scope' then
    raise exception 'dataset_template references require dimension=whole and provision=per_scope' using errcode = '22023';
  end if;
  begin v_template_id := (p_source->>'template_id')::uuid;
  exception when others then raise exception 'dataset_template reference requires a valid template_id' using errcode = '22023'; end;
  -- The organization's own template, or a PLATFORM one (the system
  -- organization). Nothing else.
  if not exists (
    select 1 from workbench.udt_dataset_templates t
    where t.id = v_template_id
      and t.organization_id in (p_org_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
      and t.is_active
  ) then raise exception 'active dataset template % is neither this organization''s nor a platform template', v_template_id using errcode = '22023'; end if;
  return v_template_id;
end; $function$;

CREATE OR REPLACE FUNCTION context.validate_reference_value(p_item_id uuid, p_value_text text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item context.context_items;
  v_envelope jsonb;
  v_type text;
  v_items jsonb;
  v_count int;
  v_scope_type_id uuid;
  v_scope_id uuid;
BEGIN
  SELECT * INTO v_item FROM context.context_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'context item % not found', p_item_id USING ERRCODE = '22023';
  END IF;

  IF v_item.value_type <> 'reference' THEN
    RETURN;
  END IF;

  IF p_value_text IS NULL THEN
    RETURN;
  END IF;

  v_envelope := context.parse_reference_fence(p_value_text);
  IF v_envelope IS NULL THEN
    RAISE EXCEPTION 'value is not a valid matrx reference fence for item %', p_item_id
      USING ERRCODE = '22023';
  END IF;

  v_type := v_envelope->>'type';
  IF v_item.allowed_reference_types IS NULL
     OR NOT (v_type = ANY (v_item.allowed_reference_types)) THEN
    RAISE EXCEPTION 'reference type % is not allowed on item % (allowed: %)',
      v_type, p_item_id, v_item.allowed_reference_types
      USING ERRCODE = '22023';
  END IF;

  v_items := v_envelope->'items';
  v_count := COALESCE(jsonb_array_length(v_items), 0);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'reference fence for item % has no items', p_item_id
      USING ERRCODE = '22023';
  END IF;
  IF v_count > v_item.max_items THEN
    RAISE EXCEPTION 'reference fence for item % carries % items, max_items is %',
      p_item_id, v_count, v_item.max_items
      USING ERRCODE = '22023';
  END IF;

  IF v_type = 'scope' AND v_item.allowed_scope_type_ids IS NOT NULL
     AND cardinality(v_item.allowed_scope_type_ids) > 0 THEN
    FOR v_scope_id IN
      SELECT (elem->>'id')::uuid FROM jsonb_array_elements(v_items) elem
    LOOP
      SELECT scope_type_id INTO v_scope_type_id FROM context.scopes WHERE id = v_scope_id;
      IF v_scope_type_id IS NULL OR NOT (v_scope_type_id = ANY (v_item.allowed_scope_type_ids)) THEN
        RAISE EXCEPTION 'scope % is not of an allowed scope type for item %', v_scope_id, p_item_id
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_context_item(p_scope_type_id uuid, p_key text, p_display_name text, p_value_type context_value_type, p_description text DEFAULT ''::text, p_category text DEFAULT NULL::text, p_fetch_hint context_fetch_hint DEFAULT 'on_demand'::context_fetch_hint, p_sensitivity context_sensitivity DEFAULT 'internal'::context_sensitivity, p_tags text[] DEFAULT '{}'::text[], p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint, p_allowed_reference_types text[] DEFAULT NULL::text[], p_max_items integer DEFAULT 1, p_allowed_scope_type_ids uuid[] DEFAULT NULL::uuid[], p_reference_source jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid; v_sort smallint; v_org_id uuid;
begin
  select organization_id into v_org_id from context.scope_types where id=p_scope_type_id and deleted_at is null;
  if v_org_id is null then perform platform.refuse_not_found(format('active scope type %s not found', p_scope_type_id)); end if;
  if (auth.role()='service_role' or iam.has_org_admin(v_org_id)) is not true then raise exception 'organization admin required for %',v_org_id using errcode='42501'; end if;
  perform context.validate_dataset_template_source(p_reference_source,v_org_id);
  v_sort:=coalesce(p_sort_order,(select (coalesce(max(sort_order),0)+1)::smallint from context.context_items where scope_type_id=p_scope_type_id and is_active));
  insert into context.context_items (scope_type_id,key,display_name,description,category,value_type,fetch_hint,sensitivity,status,source_type,tags,slug,sort_order,created_by,allowed_reference_types,max_items,allowed_scope_type_ids,reference_source)
  values (p_scope_type_id,p_key,p_display_name,p_description,p_category,p_value_type,p_fetch_hint,p_sensitivity,'active','manual',p_tags,p_slug,v_sort,(select auth.uid()),p_allowed_reference_types,coalesce(p_max_items,1),p_allowed_scope_type_ids,p_reference_source) returning id into v_id;
  return (select to_jsonb(ci) from context.context_items ci where ci.id=v_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.create_scope(p_org_id uuid, p_type_id uuid, p_name text, p_parent_scope_id uuid DEFAULT NULL::uuid, p_description text DEFAULT ''::text, p_settings jsonb DEFAULT '{}'::jsonb, p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_scope context.scopes; v_type_label text; v_sort smallint;
BEGIN
  -- ADMIN LANE: a platform admin on /administration/** manages any organization's scopes.
  IF NOT (public.is_platform_admin() OR iam.has_org_access(p_org_id)) THEN
    RAISE EXCEPTION 'not authorized for organization %', p_org_id USING ERRCODE = '42501';
  END IF;
  -- THE TYPE AND THE PARENT BELONG TO THE SAME TENANT AS THE SCOPE (0850). Proven live:
  -- the non-member test account created a scope of another organization's scope type
  -- and read back that type's label ("Client"); an invented type id answered with a
  -- foreign-key error instead, which told a real id from a made-up one. Both now answer
  -- with this one sentence, before anything is read or written.
  IF p_type_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM context.scope_types st
        WHERE st.id = p_type_id AND st.organization_id = p_org_id) THEN
    RAISE EXCEPTION 'create_scope: scope type not found in this organization'
      USING ERRCODE = '22023';
  END IF;
  IF p_parent_scope_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM context.scopes s
        WHERE s.id = p_parent_scope_id AND s.organization_id = p_org_id AND s.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'create_scope: parent scope not found in this organization'
      USING ERRCODE = '22023';
  END IF;
  v_sort := COALESCE(
    p_sort_order,
    (SELECT COALESCE(MAX(sort_order), 0) + 1
       FROM context.scopes
      WHERE organization_id = p_org_id AND scope_type_id = p_type_id
        AND ((p_parent_scope_id IS NULL AND parent_scope_id IS NULL)
             OR parent_scope_id = p_parent_scope_id))::smallint
  );
  INSERT INTO context.scopes (
    organization_id, scope_type_id, parent_scope_id, name, description, settings, slug, sort_order, created_by
  ) VALUES (
    p_org_id, p_type_id, p_parent_scope_id, p_name, p_description, p_settings, p_slug, v_sort, (select auth.uid())
  )
  RETURNING * INTO v_scope;
  SELECT label_singular INTO v_type_label FROM context.scope_types WHERE id = p_type_id;
  RETURN to_jsonb(v_scope) || jsonb_build_object('type_label', v_type_label);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_scope_type(p_org_id uuid, p_label_singular text, p_label_plural text, p_parent_type_id uuid DEFAULT NULL::uuid, p_icon text DEFAULT 'folder'::text, p_description text DEFAULT ''::text, p_sort_order smallint DEFAULT 0, p_max_assignments smallint DEFAULT NULL::smallint, p_default_variable_keys text[] DEFAULT '{}'::text[], p_color text DEFAULT NULL::text, p_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_result jsonb;
BEGIN
  -- ADMIN LANE: a platform admin on /administration/** manages any organization's scope types.
  IF NOT (public.is_platform_admin() OR iam.has_org_access(p_org_id)) THEN
    RAISE EXCEPTION 'not authorized for organization %', p_org_id USING ERRCODE = '42501';
  END IF;
  -- THE PARENT TYPE BELONGS TO THE SAME TENANT (0850): same class as create_scope.
  IF p_parent_type_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM context.scope_types st
        WHERE st.id = p_parent_type_id AND st.organization_id = p_org_id) THEN
    RAISE EXCEPTION 'create_scope_type: parent scope type not found in this organization'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO context.scope_types (
    organization_id, parent_type_id, label_singular, label_plural,
    icon, description, sort_order, max_assignments_per_entity, default_variable_keys,
    color, slug
  ) VALUES (
    p_org_id, p_parent_type_id, p_label_singular, p_label_plural,
    p_icon, p_description, p_sort_order, p_max_assignments, p_default_variable_keys,
    COALESCE(p_color, ''), p_slug
  )
  RETURNING to_jsonb(context.scope_types.*) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_tasks_bulk(p_items jsonb, p_project_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_scope_ids uuid[] DEFAULT '{}'::uuid[], p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_task workspace.tasks;
  v_tasks jsonb := '[]'::jsonb;
  v_scope_id uuid;
  v_priority task_priority;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'at most 100 tasks may be created at once' using errcode = '22023';
  end if;
  if p_organization_id is not null
     and coalesce(iam.has_org_access(p_organization_id), false) is not true then
    raise exception 'not authorized for organization %', p_organization_id using errcode = '42501';
  end if;
  if p_project_id is not null
     and coalesce(iam.has_access('project', p_project_id, 'editor'), false) is not true then
    raise exception 'not authorized for project %', p_project_id using errcode = '42501';
  end if;
  if p_entity_type is not null and p_entity_id is not null
     and coalesce(iam.has_access(p_entity_type, p_entity_id, 'editor'), false) is not true then
    raise exception 'not authorized for % %', p_entity_type, p_entity_id using errcode = '42501';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_scope_ids, '{}'::uuid[])) requested(scope_id)
    left join context.scopes s on s.id = requested.scope_id and s.deleted_at is null
    where s.id is null or coalesce(iam.has_org_access(s.organization_id), false) is not true
  ) then
    raise exception 'one or more requested scopes are not accessible' using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_priority := case
      when v_item->>'priority' in ('low','medium','high') then (v_item->>'priority')::task_priority
      else null
    end;
    insert into workspace.tasks (
      title, description, project_id, organization_id, priority, due_date, status, created_by
    ) values (
      coalesce(nullif(trim(v_item->>'title'), ''), 'Untitled task'),
      v_item->>'description', p_project_id, p_organization_id, v_priority,
      case when v_item->>'due_date' is not null then (v_item->>'due_date')::date else null end,
      coalesce(v_item->>'status', 'incomplete'), v_uid
    ) returning * into v_task;

    if p_entity_type is not null and p_entity_id is not null then
      perform public.assoc_add(
        p_entity_type, p_entity_id, 'task', v_task.id, v_task.organization_id,
        v_item->>'title',
        coalesce(p_metadata, '{}'::jsonb)
          || jsonb_build_object('item_index', coalesce((v_item->>'index')::int, 0))
      );
    end if;
    foreach v_scope_id in array coalesce(p_scope_ids, '{}'::uuid[]) loop
      perform public.assoc_add('task', v_task.id, 'scope', v_scope_id, p_organization_id);
    end loop;
    v_tasks := v_tasks || jsonb_build_array(to_jsonb(v_task));
  end loop;
  return jsonb_build_object('tasks', v_tasks);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_user_list(p_list_name character varying, p_description text, p_user_id uuid, p_is_public boolean, p_authenticated_read boolean DEFAULT false, p_public_read boolean DEFAULT false, p_items jsonb DEFAULT '[]'::jsonb, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_list_id uuid;
    v_item jsonb;
    v_result jsonb;
begin
    if p_organization_id is null then
      raise exception 'create_user_list requires the initiating organization_id'
        using errcode = '23502',
              hint = 'Pass the organization the person is working in. Never infer it.';
    end if;
    if not (auth.role() = 'service_role' or p_user_id = (select auth.uid())) then
      raise exception 'access denied: caller is not the target user' using errcode = '42501';
    end if;
    if auth.role() is distinct from 'service_role'
       and not iam.has_org_access(p_organization_id) then
      raise exception 'access denied: caller cannot file a list in organization %', p_organization_id
        using errcode = '42501';
    end if;

    -- lane LISTS-AFTER-SWITCH: an organization whose Data tables moved to the new system makes
    -- its new lists there (a Table of choices), never in the older lists nothing reads.
    if platform.older_tables_switched(p_organization_id) then
      return platform._pick_list_born_in_store(p_organization_id, p_list_name, p_description, coalesce(p_items, '[]'::jsonb));
    end if;

    insert into workbench.udt_structured_lists (
        list_name, description, user_id, is_public, public_read, organization_id
    )
    values (
        p_list_name, p_description, p_user_id, p_is_public, p_public_read, p_organization_id
    )
    returning id into v_list_id;

    for v_item in select * from jsonb_array_elements(p_items) loop
        insert into workbench.udt_structured_list_items (
            label, description, help_text, group_name,
            user_id, is_public, public_read, list_id, organization_id
        )
        values (
            v_item->>'Label', v_item->>'Description', v_item->>'Help Text', v_item->>'Group',
            p_user_id, p_is_public, p_public_read, v_list_id, p_organization_id
        );
    end loop;

    select jsonb_build_object(
        'list_id', l.id, 'list_name', l.list_name, 'description', l.description,
        'lives_in', 'older',
        'items', (
            select jsonb_agg(jsonb_build_object(
                'id', i.id, 'label', i.label, 'description', i.description,
                'help_text', i.help_text, 'group_name', i.group_name
            ))
            from workbench.udt_structured_list_items i where i.list_id = l.id
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = v_list_id;

    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.creator_claim_handle(p_handle text, p_display_name text DEFAULT NULL::text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'users'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_handle text := public.creator_normalize_handle(p_handle);
  v_taken uuid;
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.id into v_taken
  from users.profiles p
  where lower(p.creator_handle) = v_handle and p.deleted_at is null and p.id <> v_uid
  limit 1;
  if v_taken is not null then
    raise exception 'That handle is already taken' using errcode = '23505';
  end if;

  -- CARRYING, NOT CHOOSING. The profile row already has an organization (the column is NOT
  -- NULL), stamped at signup by public._provision_new_user_profile. Reading it is carrying
  -- an organization somebody already set.
  select organization_id into v_org from users.profiles where id = v_uid;

  if v_org is null then
    -- No profile row: signup provisioning failed for this user (see
    -- the signup provisioning warning). The old body invented one here. The call names it
    -- instead -- the organization the creator is acting in, which the client already has.
    v_org := p_organization_id;
    if v_org is null then
      raise exception 'creator_claim_handle: you have no profile row yet, so nothing carries the organization this creator profile belongs to. Remedy: call public.creator_claim_handle(p_handle, p_display_name, p_organization_id) and pass the organization you are acting in.'
        using errcode = '23502';
    end if;
    if not iam.has_org_access(v_org) then
      raise exception 'creator_claim_handle: no org access (org=%)', v_org using errcode = '42501';
    end if;
  end if;

  insert into users.profiles (id, organization_id, display_name, creator_handle)
  values (v_uid, v_org, coalesce(nullif(btrim(p_display_name), ''), 'Creator'), v_handle)
  on conflict (id) do update set
    creator_handle = v_handle,
    display_name = coalesce(nullif(btrim(p_display_name), ''), users.profiles.display_name),
    updated_at = now();

  return public.creator_get_mine();
end;
$function$;

CREATE OR REPLACE FUNCTION crm.ensure_user_party_in_org(p_user_id uuid, p_organization_id uuid, p_source text DEFAULT 'signup'::text, p_require_membership boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user auth.users%rowtype;
  v_email text;
  v_phone text;
  v_display_name text;
  v_party_id uuid;
  v_candidate_ids uuid[] := '{}'::uuid[];
  v_candidate_claim uuid;
  v_medium record;
  v_medium_id uuid;
  v_rows integer;
  v_changed boolean := false;
  v_party_disposition text := 'existing';
  v_media_added text[] := '{}'::text[];
begin
  if p_user_id is null then
    raise exception 'ensure_user_party_in_org: p_user_id cannot be null';
  end if;
  if p_organization_id is null then
    raise exception 'ensure_user_party_in_org: p_organization_id cannot be null';
  end if;
  if p_source not in ('signup', 'promotion', 'backfill', 'reconcile', 'hr.employee_create') then
    raise exception 'ensure_user_party_in_org: unsupported source';
  end if;

  if not exists (
    select 1 from iam.organizations o where o.id = p_organization_id
  ) then
    raise exception 'ensure_user_party_in_org: organization % does not exist', p_organization_id;
  end if;

  -- 🚨 ORGANIZATION IS TENANCY. This asks whether the person BELONGS to the
  -- tenant their party is about to be filed in — never whether they may touch
  -- some row. A caller that already knows the membership holds (the AI Matrx
  -- account-party wrapper below, which has never required one) passes false.
  if p_require_membership and not iam.is_org_member(p_user_id, p_organization_id) then
    raise exception 'ensure_user_party_in_org: user % is not a member of organization %',
      p_user_id, p_organization_id using errcode = '42501';
  end if;

  select u.* into v_user from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'ensure_user_party_in_org: auth user does not exist';
  end if;
  if v_user.is_anonymous is true then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_user_id::text, 0)
  );

  v_email := nullif(lower(trim(v_user.email)), '');
  v_phone := nullif(trim(v_user.phone), '');
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'ensure_user_party_in_org: auth phone is not canonical E.164';
  end if;

  select coalesce(
    nullif(case
      when lower(trim(profile.display_name)) <> 'user' then trim(profile.display_name)
      else ''
    end, ''),
    nullif(trim(coalesce(
      v_user.raw_user_meta_data ->> 'full_name',
      v_user.raw_user_meta_data ->> 'name',
      v_user.raw_user_meta_data ->> 'preferred_username',
      v_user.raw_user_meta_data ->> 'user_name'
    )), ''),
    nullif(initcap(regexp_replace(split_part(v_email, '@', 1), '[._+-]+', ' ', 'g')), ''),
    'AI Matrx User'
  ) into v_display_name
  from (select 1) seed
  left join users.profiles profile
    on profile.id = p_user_id and profile.deleted_at is null;

  select p.id into v_party_id
  from crm.party p
  where p.organization_id = p_organization_id
    and p.claimed_by = p_user_id
    and p.deleted_at is null
    and p.canonical_id is null;

  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
    into v_candidate_ids
  from crm.contact_medium medium
  join crm.party_contact_point point
    on point.medium_id = medium.id and point.deleted_at is null
  join crm.party p
    on p.id = point.party_id
   and p.organization_id = medium.organization_id
   and p.deleted_at is null
   and p.canonical_id is null
   and p.party_kind = 'person'
  where medium.organization_id = p_organization_id
    and medium.deleted_at is null
    and (
      (v_email is not null and medium.channel = 'email' and medium.value_key = v_email)
      or
      (v_phone is not null and medium.channel = 'phone' and medium.value_key = v_phone)
    );

  if cardinality(v_candidate_ids) > 1 then
    raise exception 'ensure_user_party_in_org: auth identity matches multiple active CRM parties';
  end if;

  if v_party_id is not null then
    if exists (
      select 1 from unnest(v_candidate_ids) candidate_id
      where candidate_id <> v_party_id
    ) then
      raise exception 'ensure_user_party_in_org: claimed party conflicts with contact identity';
    end if;
  elsif cardinality(v_candidate_ids) = 1 then
    v_party_id := v_candidate_ids[1];
    select p.claimed_by into v_candidate_claim
    from crm.party p where p.id = v_party_id for update;
    if v_candidate_claim is not null and v_candidate_claim <> p_user_id then
      raise exception 'ensure_user_party_in_org: contact identity is claimed by another user';
    end if;
    if v_candidate_claim is null then
      update crm.party
      set claimed_by = p_user_id,
          claimed_at = coalesce(claimed_at, now()),
          updated_by = p_user_id
      where id = v_party_id;
      v_changed := true;
      v_party_disposition := 'claimed';
    end if;
  else
    insert into crm.party (
      party_kind, display_name, record_class, claimed_by, claimed_at,
      source, source_detail, organization_id, created_by, updated_by,
      visibility, attributes, metadata
    ) values (
      'person', v_display_name, 'contact', p_user_id, now(),
      'user_registration', p_source, p_organization_id, p_user_id, p_user_id,
      'internal',
      jsonb_build_object('identity_kind', 'auth_user'),
      jsonb_build_object('provisioning_source', p_source)
    )
    returning id into v_party_id;
    v_changed := true;
    v_party_disposition := 'created';
  end if;

  for v_medium in
    select *
    from (values
      ('email'::text, v_user.email::text, v_email::text, v_user.email_confirmed_at),
      ('phone'::text, v_user.phone::text, v_phone::text, v_user.phone_confirmed_at)
    ) as candidate(channel, value_raw, value_key, confirmed_at)
    where candidate.value_key is not null
  loop
    insert into crm.contact_medium (
      channel, value_raw, value_key, verification_status, verified_at,
      organization_id, created_by, updated_by, visibility, details, metadata
    ) values (
      v_medium.channel, v_medium.value_raw, v_medium.value_key,
      case when v_medium.confirmed_at is null then 'unverified' else 'verified' end,
      v_medium.confirmed_at, p_organization_id, p_user_id, p_user_id, 'internal',
      jsonb_build_object('source', 'auth_user', 'provisioning_source', p_source),
      jsonb_build_object('provisioning_source', p_source)
    )
    on conflict (
      organization_id, channel, (coalesce(platform_slug, ''::text)), value_key
    ) where deleted_at is null
    do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_changed := true;
      v_media_added := array_append(v_media_added, v_medium.channel);
    end if;

    select medium.id into strict v_medium_id
    from crm.contact_medium medium
    where medium.organization_id = p_organization_id
      and medium.channel = v_medium.channel
      and coalesce(medium.platform_slug, '') = ''
      and medium.value_key = v_medium.value_key
      and medium.deleted_at is null;

    if v_medium.confirmed_at is not null then
      update crm.contact_medium
      set verification_status = 'verified',
          verified_at = coalesce(verified_at, v_medium.confirmed_at),
          updated_by = p_user_id,
          details = details || jsonb_build_object('auth_verified', true)
      where id = v_medium_id
        and verification_status = 'unverified';
      get diagnostics v_rows = row_count;
      v_changed := v_changed or v_rows > 0;
    end if;

    insert into crm.party_contact_point (
      party_id, medium_id, purpose_code, is_primary, is_identity_key,
      source, confidence, organization_id, created_by, updated_by, channel, metadata
    ) values (
      v_party_id, v_medium_id,
      case when v_medium.channel = 'phone' then 'mobile' else 'personal' end,
      false, false, 'auth_user', 100, p_organization_id, p_user_id, p_user_id,
      v_medium.channel,
      jsonb_build_object('provisioning_source', p_source)
    )
    on conflict (party_id, medium_id) where deleted_at is null
    do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_changed := true;
      if not v_medium.channel = any(v_media_added) then
        v_media_added := array_append(v_media_added, v_medium.channel);
      end if;
    end if;
  end loop;

  if v_changed then
    perform platform.log_activity(
      p_organization_id,
      case
        when v_party_disposition = 'claimed' then 'crm.user_party.claimed'
        else 'crm.user_party.provisioned'
      end,
      'party',
      v_party_id,
      jsonb_build_object(
        'source', p_source,
        'party_disposition', v_party_disposition,
        'media_attached', to_jsonb(v_media_added)
      ),
      p_user_id
    );
  end if;

  return v_party_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crm_inbox_set_handled(p_interaction_id uuid, p_handled boolean DEFAULT true)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_party uuid;
  v_result timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'crm_inbox_set_handled: not authenticated'; END IF;

  SELECT i.party_id INTO v_party
  FROM crm.interaction i
  WHERE i.id = p_interaction_id AND i.deleted_at IS NULL AND i.direction = 'inbound';

  IF v_party IS NULL THEN
    RAISE EXCEPTION 'crm_inbox_set_handled: no inbound interaction %', p_interaction_id;
  END IF;

  -- EDITOR reach, restated from crm.interaction's std_update policy. A viewer
  -- may read the inbox; only someone who can edit the record may clear it.
  IF NOT (v_party IN (SELECT unnest(iam.accessible_entity_ids('party'::text, 'editor'::permission_level)))
          OR iam.has_access('crm_interaction'::text, p_interaction_id, 'editor'::permission_level)) THEN
    RAISE EXCEPTION 'crm_inbox_set_handled: not permitted on interaction %', p_interaction_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE crm.interaction i
  SET attributes = jsonb_set(
        coalesce(i.attributes, '{}'::jsonb),
        '{inbox}',
        coalesce(i.attributes -> 'inbox', '{}'::jsonb)
          || CASE WHEN p_handled
                  THEN jsonb_build_object('handled_at', to_jsonb(v_now), 'handled_by', to_jsonb(v_uid))
                  ELSE jsonb_build_object('handled_at', 'null'::jsonb, 'handled_by', 'null'::jsonb) END,
        true)
  WHERE i.id = p_interaction_id;

  v_result := CASE WHEN p_handled THEN v_now ELSE NULL END;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_set_primary_contact_point(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_party uuid; v_channel text;
begin
  select party_id, channel into v_party, v_channel
    from crm.party_contact_point where id = p_id and deleted_at is null;
  if v_party is null then
    perform platform.refuse_not_found(format('crm_set_primary_contact_point: contact point %s not found', p_id));
  end if;
  if not iam.has_access('party', v_party, 'editor') then
    raise exception 'crm_set_primary_contact_point: no edit access to party %', v_party using errcode = '42501';
  end if;
  update crm.party_contact_point set is_primary = false
   where party_id = v_party and channel = v_channel and deleted_at is null and is_primary and id <> p_id;
  update crm.party_contact_point set is_primary = true where id = p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.ctx_validate_value_scope_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item_type_id uuid;
  v_scope_type_id uuid;
BEGIN
  SELECT scope_type_id INTO v_item_type_id
  FROM context.context_items WHERE id = NEW.context_item_id;

  SELECT scope_type_id INTO v_scope_type_id
  FROM context.scopes WHERE id = NEW.scope_id;

  IF v_item_type_id IS NULL THEN
    RAISE EXCEPTION 'context_item_id % does not exist', NEW.context_item_id;
  END IF;

  IF v_scope_type_id IS NULL THEN
    RAISE EXCEPTION 'scope_id % does not exist', NEW.scope_id;
  END IF;

  IF v_scope_type_id IS DISTINCT FROM v_item_type_id THEN
    RAISE EXCEPTION
      'Scope/item type mismatch: scope % is type %, but item % is defined on type %',
      NEW.scope_id, v_scope_type_id, NEW.context_item_id, v_item_type_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION custom._booking_availability(p_organization_id uuid, p_raw jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_in    jsonb := coalesce(p_raw, '{}'::jsonb);
  v_tz    text  := coalesce(nullif(btrim(v_in ->> 'timezone'), ''), 'UTC');
  v_len   integer := coalesce((v_in ->> 'slot_minutes')::integer, 30);
  v_buf   integer := coalesce((v_in ->> 'buffer_minutes')::integer, 0);
  v_lead  integer := coalesce((v_in ->> 'lead_minutes')::integer, 120);
  v_cap   integer := coalesce((v_in ->> 'max_per_day')::integer, 8);
  v_days  integer := coalesce((v_in ->> 'days')::integer, 14);
  v_wins  jsonb := v_in -> 'windows';
  v_out   jsonb := '[]'::jsonb;
  w       jsonb;
  v_wd    integer;
  v_from  time;
  v_to    time;
  v_who   uuid;
begin
  -- THE TIMEZONE IS ASKED OF POSTGRES, not matched against a list we would have to keep.
  begin
    perform now() at time zone v_tz;
  exception when others then
    raise exception 'There is no timezone called "%", so no hours could be offered in it.', v_tz
      using errcode = '22023',
            hint = 'Use an IANA name such as America/Chicago, Europe/London or UTC. This is the organization''s own timezone — the visitor''s browser shows the same moment in theirs.';
  end;

  if v_len < 5 or v_len > 480 then
    raise exception 'A % minute appointment is not a length this offers.', v_len
      using errcode = '22023', hint = 'Slot length is between 5 minutes and 8 hours.';
  end if;
  if v_buf < 0 or v_buf > 480 then
    raise exception 'A gap of % minutes between appointments is not a gap.', v_buf
      using errcode = '22023', hint = 'The buffer is between 0 and 480 minutes.';
  end if;
  if v_lead < 0 or v_lead > 43200 then
    raise exception 'Asking for % minutes of notice is not notice.', v_lead
      using errcode = '22023', hint = 'Lead time is between 0 minutes and 30 days.';
  end if;
  if v_cap < 1 or v_cap > 100 then
    raise exception '% appointments a day is not a limit anybody meant.', v_cap
      using errcode = '22023', hint = 'Between 1 and 100 a day.';
  end if;
  if v_days < 1 or v_days > 90 then
    raise exception 'Offering % days ahead is not a window.', v_days
      using errcode = '22023', hint = 'Between 1 and 90 days ahead.';
  end if;

  -- NO WINDOWS MEANS THE DEFAULT, not an empty calendar. An organization that said
  -- nothing about its hours is offering its working week, and a booking page that
  -- offered nothing would look broken rather than unconfigured.
  if jsonb_typeof(v_wins) is distinct from 'array' or jsonb_array_length(v_wins) = 0 then
    v_wins := jsonb_build_array(
      jsonb_build_object('weekday', 1, 'from', '09:00', 'to', '17:00'),
      jsonb_build_object('weekday', 2, 'from', '09:00', 'to', '17:00'),
      jsonb_build_object('weekday', 3, 'from', '09:00', 'to', '17:00'),
      jsonb_build_object('weekday', 4, 'from', '09:00', 'to', '17:00'),
      jsonb_build_object('weekday', 5, 'from', '09:00', 'to', '17:00'));
  end if;

  for w in select value from jsonb_array_elements(v_wins) loop
    v_wd := (w ->> 'weekday')::integer;
    if v_wd is null or v_wd < 0 or v_wd > 6 then
      raise exception 'A window has to name a day of the week, and this one says %.',
                      coalesce(w ->> 'weekday', 'nothing')
        using errcode = '22023',
              hint = '0 is Sunday and 6 is Saturday, the same numbering the database uses.';
    end if;
    begin
      v_from := (w ->> 'from')::time;
      v_to   := (w ->> 'to')::time;
    exception when others then
      raise exception 'A window on day % does not give an hour it starts and an hour it ends.', v_wd
        using errcode = '22023', hint = 'Each window is {"weekday": 1, "from": "09:00", "to": "17:00"}.';
    end;
    if v_to <= v_from then
      raise exception 'A window on day % ends at % and starts at %, so nothing fits in it.',
                      v_wd, v_to, v_from
        using errcode = '22023', hint = 'The end has to be later in the day than the start.';
    end if;

    -- A WINDOW MAY BELONG TO ONE MEMBER — that is the "with whom" of a booking. Somebody
    -- who is not in this organization cannot be booked in its name.
    v_who := nullif(btrim(coalesce(w ->> 'member_user_id', '')), '')::uuid;
    if v_who is not null and not exists (
         select 1 from iam.memberships m
          where m.container_type = 'organization'
            and m.organization_id = p_organization_id and m.user_id = v_who
            and m.deleted_at is null and coalesce(m.status, 'active') = 'active') then
      raise exception 'Nobody with the id % is a member of this organization, so their hours cannot be offered.', v_who
        using errcode = '23503',
              hint = 'A window either names a member of this organization or names nobody, in which case the booking is with the organization.';
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'weekday', v_wd,
      'from', to_char(v_from, 'HH24:MI'),
      'to', to_char(v_to, 'HH24:MI'),
      'member_user_id', v_who));
  end loop;

  return jsonb_build_object(
    'timezone', v_tz, 'slot_minutes', v_len, 'buffer_minutes', v_buf,
    'lead_minutes', v_lead, 'max_per_day', v_cap, 'days', v_days, 'windows', v_out);
end;
$function$;

CREATE OR REPLACE FUNCTION custom._field_document_for(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d        jsonb;
  v_parity text := nullif(p_spec ->> 'parity_type', '');
  v_key    text := nullif(p_spec ->> 'key', '');
  -- ── LIMITS-FIX 2026-09-21: ONE WORD FOR WHAT A PERSON READS ON THE COLUMN. ──────────
  -- A table spec's inline field says `name` (`custom._table_shape_guard` demands it) and
  -- this door said `label`, so the same concept had two words one call apart and a caller
  -- that used the table's word was told "A field needs a name" while holding one. Real-data
  -- crew D hit this on 2026-09-21 declaring a podcast episode pipeline. Both words are read
  -- here; `label` still wins when a caller sends both, so no existing caller changes.
  v_label  text := coalesce(nullif(p_spec ->> 'label', ''), nullif(p_spec ->> 'name', ''));
  v_multi  boolean := coalesce((p_spec ->> 'multi')::boolean, false);
  v_config jsonb := coalesce(p_spec -> 'config', '{}'::jsonb);
  v_rules  jsonb := coalesce(p_spec -> 'rules', '[]'::jsonb);
  v_plain  text := coalesce(nullif(p_spec ->> 'plain', ''), 'text');
  v_alias  text := lower(btrim(coalesce(p_spec ->> 'type', '')));
  -- FIX-10B-F6: the caller said the word `signature`. It is one of the kinds
  -- `custom.field_kinds()` publishes and it is NOT a parity type — it is plain
  -- text wearing the one format `custom.doc_sign` accepts — so it is resolved
  -- here, beside the other words, and carried into the plain-text arm below.
  v_signature boolean := false;
  -- GRID-PRIMITIVES G5: the three column kinds the store fills in itself.
  v_system text := null;
  -- GRID-PRIMITIVES G3: a formula a person TYPED, parsed by the store.
  v_parsed jsonb := null;
  v_relation uuid := null;   -- SEAT-SUITES: the Table a caller's own relation column points at
  -- SC-R / P12, 2026-09-24: a column that points at a PLATFORM thing — an agent, a note, a web
  -- site, a workbook — rather than at a record of one of this organization's Tables.
  v_entity  boolean := false;
  v_allowed jsonb   := null;
  -- LIMITS-FIX 2026-09-21: the same one-word rule for the relation's target. Real-data crew E
  -- reported that no client door could declare a table-to-table relation; the door could, and
  -- has since 2026-09-19 — it only ever answered to `relation_target`, and a caller reaching
  -- for `target_table` got "A column that points at other records is a Person column or a File
  -- column", which describes a different mistake entirely.
  v_target text := coalesce(nullif(p_spec ->> 'relation_target', ''), nullif(p_spec ->> 'target_table', ''));
  v_deps   jsonb := case when jsonb_typeof(p_spec -> 'depends_on') = 'array'
                         then p_spec -> 'depends_on' else '[]'::jsonb end;
begin
  -- ── STORE-T: `type` IS THE WORD EVERY CALLER REACHES FOR, AND IT WAS THROWN AWAY. ──────
  -- Measured on 2026-09-20: `{"type":"number"}` produced a TEXT column and `{"type":"banana"}`
  -- was ACCEPTED, silently, as text. Only `parity_type` and `plain` were ever read, so every
  -- agent, script and other client that said "type" got a text column and was never told.
  -- Now it is read as what it plainly means, and a word that means nothing is refused BY NAME
  -- with the list — nothing is guessed and nothing is silently dropped.
  if v_alias <> '' and v_parity is null and nullif(p_spec ->> 'plain', '') is null then
    if exists (select 1 from custom.parity_field_types() t where t.parity_type = v_alias) then
      v_parity := v_alias;
    elsif v_alias in ('number', 'range', 'integer', 'decimal', 'float') then
      v_plain := 'number';
    elsif v_alias in ('long_text', 'longtext', 'long text', 'paragraph') then
      v_plain := 'long_text';
    elsif v_alias in ('text', 'string') then
      v_plain := 'text';
    elsif v_alias in ('boolean', 'bool', 'checkbox', 'check_box', 'tick', 'tickbox',
                      'yes_no', 'yesno', 'yes/no', 'toggle', 'switch') then
      -- LIMITS-FIX: every word a person, an agent or a spreadsheet reaches for when they
      -- mean a tick box lands on the one type that is one.
      v_parity := 'checkbox';
    elsif v_alias = 'list' then
      v_parity := 'select';
    elsif v_alias in ('signature', 'sign', 'e_signature', 'esignature') then
      -- ── FIX-10B-F6, 2026-09-22: THE E-SIGN HALF OF DOCUMENTS COULD NOT BE REACHED. ──────
      -- `custom.doc_sign` accepts exactly one field — text whose format is `signature` — and
      -- this door would write that format only when a caller sent `format: signature`
      -- alongside a plain text type. No screen sends a format: the add-a-column panel
      -- collects an INTENTION and the store answers the behaviour, the format and the unit.
      -- So the sentence under a rendered document ("Crews needs a signature column - a text
      -- column whose format is signature") named a precondition no screen could meet, and
      -- every sign request, expiring link and sealed hash behind it was unreachable.
      -- VERIFIER-10 F6, measured from the admin seat on Rincon Plumbing's Crews table.
      -- A signature is now a WORD like every other kind, published by
      -- `custom.field_kinds()`, and the panel that offers it sends the word.
      v_plain := 'text';
      v_signature := true;
    elsif v_alias in ('autonumber', 'created_time', 'modified_time', 'auto_number',
                      'created', 'modified', 'last_modified', 'last_modified_time') then
      -- ── GRID-PRIMITIVES G5, 2026-09-22: THE STORE'S OWN STAMPS AS COLUMNS. ──────────────
      -- The older grid has an Autonumber, a Created time and a Last modified time column,
      -- and none of the three is typed: the database assigns the number and the row carries
      -- its own stamps. Here each is a formula Field whose expression is the system node —
      -- fx.autonumber is worked out ONCE, on write, and kept; the two stamps on read — so
      -- every reader that serves a worked-out value serves these with nothing new, and a
      -- hand-typed value is refused exactly as it is for any formula (FLD-9).
      v_parity := 'formula';
      v_system := case when v_alias in ('autonumber', 'auto_number') then 'autonumber'
                       when v_alias in ('created_time', 'created') then 'created_time'
                       else 'modified_time' end;
    elsif v_alias in ('entity_reference', 'entity', 'entity_ref', 'reference', 'platform_reference') then
      -- ── SC-R / P12, 2026-09-24: A RECORD POINTING AT SOMETHING THAT IS NOT A RECORD. ─────
      -- The scope system let a client's column point at its web site, its intake note or the
      -- agent that works it (16 such columns live on the main database), and the store could
      -- not: a relation reached one Table of this organization or the kernel File / Person
      -- Table and nothing else, so the mover had to refuse all sixteen. An entity reference is
      -- a RELATION (FLD-1's closed set of five behaviours holds) whose target mode is `any`
      -- (REL-8), restricted to the kinds it names in `allowed_types` — the scope system's own
      -- word `allowed_reference_types` is read too. Each kind must be one
      -- custom.entity_reference_kinds() lists; custom._field_shape_guard says which is not.
      v_entity := true;
      v_allowed := coalesce(
        case when jsonb_typeof(p_spec -> 'allowed_types') = 'array' then p_spec -> 'allowed_types' end,
        case when jsonb_typeof(v_config -> 'allowed_types') = 'array' then v_config -> 'allowed_types' end,
        case when jsonb_typeof(p_spec -> 'allowed_reference_types') = 'array' then p_spec -> 'allowed_reference_types' end,
        case when jsonb_typeof(p_spec -> 'allowed_types') = 'string'
             then jsonb_build_array(p_spec -> 'allowed_types') end);
      select coalesce(jsonb_agg(w order by first_at), '[]'::jsonb) into v_allowed
        from (select lower(btrim(x #>> '{}')) as w, min(o) as first_at
                from jsonb_array_elements(coalesce(v_allowed, '[]'::jsonb)) with ordinality as a(x, o)
               where jsonb_typeof(x) = 'string' and btrim(x #>> '{}') <> ''
               group by 1) s;
      if jsonb_array_length(v_allowed) = 0 then
        raise exception 'A column that points at things on the platform has to say which kinds of thing, and "%" names none.', coalesce(v_label, v_key, 'this column')
          using errcode = '23514',
                hint = 'SC-R / P12: send allowed_types, a list such as ["note", "web_site"]; select token, label from custom.entity_reference_kinds() lists every kind. A file is a File column and a person a Person column. Nothing was created.';
      end if;
    elsif v_alias = 'relation' then
      -- ── SEAT-SUITES, 2026-09-19: A COLUMN POINTING AT ANOTHER OF YOUR OWN TABLES COULD
      -- NOT BE MADE AT ALL. ────────────────────────────────────────────────────────────
      -- `member` points at the kernel Person Table and `attachment` at the kernel File
      -- Table, and those were the ONLY two relations this door could build. A person with
      -- an Invoice Table and a Line Table could not give Invoice a Lines column through any
      -- door, although the store holds exactly that shape already: the parity-floor
      -- fixture's own `lines` field is a plain relation at a custom Table, and every guard,
      -- every edge, every rollup and `custom.record_relation_edges` handle it. Only the
      -- door refused, and it refused EVEN WHEN THE CALLER SAID WHICH TABLE.
      -- THE RULE: a caller that NAMES its target gets the relation it asked for; a caller
      -- that names nothing still gets the old sentence, because a relation with no target
      -- is the thing that sentence is actually about.
      if v_target is null then
        raise exception 'A column that points at other records is a Person column or a File column, and "%" does not say which.', v_alias
          using errcode = '23514',
                hint = 'FLD-11: say member for a person or attachment for a file, or name the Table this column points at in relation_target. Nothing was created.';
      end if;
      v_relation := v_target::uuid;
      -- ── RELATION-DECLARE, 2026-09-20: A COLUMN COULD POINT AT SOMETHING THAT IS NOT A
      -- TABLE, AND NOBODY WAS TOLD. ────────────────────────────────────────────────────────
      -- This arm took the caller's uuid and wrote it down unread. A uuid naming NOTHING at
      -- all was accepted; a uuid naming a RECORD instead of a Table was accepted. The column
      -- then points at a thing with no records to pick from and no title field to make a chip
      -- out of, and every reader downstream has to guess what that means. Measured from the
      -- seat `authenticated` on the main database, 2026-09-20. (A Table in ANOTHER
      -- organization was already refused by custom._field_shape_guard; that stands.)
      if not exists (select 1 from custom.record t
                      where t.id = v_relation
                        and t.deleted_at is null
                        and t.table_id = custom.table_kernel_id()
                        and (t.organization_id = p_organization_id or t.data_class = 'kernel')) then
        raise exception 'A column that points at other records has to point at a TABLE, and "%" is not one of this organization''s tables.', v_relation
          using errcode = '23503',
                hint = 'FLD-11 / REL-8: relation_target names the Table whose records this column may point at - open the Table you meant and use its id. Nothing was created.';
      end if;
    else
      raise exception 'There is no kind of column called "%".', p_spec ->> 'type'
        using errcode = '23514',
              hint = format('FLD-11: %s. Nothing was created.', custom._field_kinds_sentence());
    end if;
  end if;
  if v_label is null then
    raise exception 'A field needs a name - it is what a person reads on the column.'
      using errcode = '23514', hint = 'Give the field a name (a table spec''s own word) or a label - they mean the same thing here. Everything else this door can work out.';
  end if;
  if v_key is null then
    -- The panel derives the key from the label; a caller that did not is not
    -- refused for a machine token it never meant to think about.
    v_key := regexp_replace(lower(btrim(v_label)), '[^a-z0-9]+', '_', 'g');
    v_key := regexp_replace(v_key, '^_+|_+$', '', 'g');
    if v_key !~ '^[a-z]' then v_key := 'f_' || v_key; end if;
    v_key := left(v_key, 48);
  end if;
  if v_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'A field''s key is made of lower-case letters, digits and underscores, and this one is "%".', v_key
      using errcode = '23514', hint = 'FLD-13: leave the key out and the store makes one from the name.';
  end if;

  -- THE FLOOR EVERY FIELD STANDS ON. Every key the guards demand is written,
  -- always, so no caller can omit one by accident.
  d := jsonb_build_object(
    'key',                  v_key,
    'label',                v_label,
    'multi',                v_multi,
    'dated',                coalesce((p_spec ->> 'dated')::boolean, false),
    'required',             coalesce((p_spec ->> 'required')::boolean, false),
    'sort',                 coalesce((p_spec ->> 'sort')::numeric, 100),
    'source',               coalesce(nullif(p_spec ->> 'source', ''), 'manual'),
    'source_config',        coalesce(p_spec -> 'source_config', '{}'::jsonb),
    'sensitivity',          coalesce(nullif(p_spec ->> 'sensitivity', ''), 'internal'),
    'context_policy',       coalesce(nullif(p_spec ->> 'context_policy', ''), 'include'),
    'applies_to_types',     coalesce(p_spec -> 'applies_to_types', '[]'::jsonb),
    -- STORE-T / T7: THE CALLER'S OWN DEPENDENCY LIST, KEPT. It used to be hard-coded to the
    -- empty list here, so NO client-made formula ever had dependencies, `custom.field_dependants`
    -- could never name one, and REC-18's refusal — "this field is used by …" — could not fire for
    -- anything a person or an agent built. That is the third half of T7.
    'depends_on',           v_deps,
    'entity_definition_id', p_table_id);

  -- SEAT-SUITES 2026-09-19: two properties `custom.field` has always projected and this door
  -- silently dropped, so a person could read them and never set them. They are carried only
  -- when the caller names them, so no existing field's document changes shape.
  if nullif(p_spec ->> 'review_interval_days', '') is not null then
    d := d || jsonb_build_object('review_interval_days', (p_spec ->> 'review_interval_days')::integer);
  end if;
  if p_spec ? 'default' then
    d := d || jsonb_build_object('default', p_spec -> 'default');
  end if;

  -- SC-R / P12: THE ENTITY REFERENCE (see its arm above). A relation with no Table target: its
  -- target mode is `any` and `allowed_types` says which platform kinds it may name. No display
  -- spec — its words are each thing's own title, read by platform.relation_label.
  if v_entity then
    d := d || jsonb_build_object(
      'type',             'relation',
      'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
      'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                               then p_spec ->> 'on_target_delete' else 'set_null' end,
      'rules',            v_rules,
      'config',           (v_config - 'allowed_types' - 'target_tables')
                          || jsonb_build_object('target_mode', 'any', 'allowed_types', v_allowed));
    return custom._with_display_format(d, p_spec - 'display');
  end if;

  -- THE RELATION A CALLER NAMED ITSELF (see the `relation` arm above). It carries no parity
  -- type — `custom.parity_type` answers nothing for it, exactly as it answers nothing for
  -- plain text and plain numbers — and every relation property is the caller's to declare.
  if v_relation is not null then
    d := d || jsonb_build_object(
      'type',             'relation',
      'relation_target',  v_relation,
      'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
      'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                               then p_spec ->> 'on_target_delete' else 'set_null' end,
      'rules',            v_rules,
      'config',           v_config);
    if nullif(p_spec ->> 'inverse_key', '') is not null then
      d := d || jsonb_build_object('inverse_key', p_spec ->> 'inverse_key');
    end if;
    return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
  end if;

  if v_parity is null then
    -- The three behaviours a person picks that are NOT one of the parity types:
    -- plain text, a long text and a plain number. They carry no parity type,
    -- which is exactly what `custom.parity_type` answers for them.
    if v_plain = 'number' then
      d := d || jsonb_build_object('type', 'range', 'config', v_config, 'rules', v_rules);
      if nullif(p_spec ->> 'unit', '') is not null then
        d := d || jsonb_build_object('unit', p_spec ->> 'unit');
      end if;
    elsif v_plain = 'long_text' then
      d := d || jsonb_build_object('type', 'text', 'format', 'long',
                                   'config', v_config || jsonb_build_object('multiline', true),
                                   'rules', v_rules);
    else
      d := d || jsonb_build_object('type', 'text', 'config', v_config, 'rules', v_rules);
      -- ── SEAT-SUITES, 2026-09-19: A SIGNATURE FIELD COULD NOT BE DECLARED BY ANYBODY. ────
      -- `custom.doc_signature_field_ok` accepts exactly one shape — a text field whose
      -- `format` is `signature` — and `custom.doc_sign` refuses every other field by name.
      -- No door wrote that `format`: this branch dropped it, and the parity types
      -- have no signature among them. So `custom.doc_sign`, which IS granted to
      -- `authenticated`, could never be used by a signed-in person at all: the one field it
      -- accepts had no way to exist outside an INSERT straight into `custom.record`, which
      -- needs a table privilege nobody has. Measured from the seat on the main database on
      -- 2026-09-19 while converting `scripts/campaign-tests/w3_doc_c43.sql`.
      -- A plain text field may now SAY it holds a signature, and nothing else changes: a
      -- field that does not ask for it is written exactly as before.
      if v_signature or nullif(p_spec ->> 'format', '') = 'signature' then
        d := d || jsonb_build_object('format', 'signature');
      end if;
    end if;
    return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
  end if;

  if not exists (select 1 from custom.parity_field_types() t where t.parity_type = v_parity) then
    raise exception 'There is no field type called "%" in this system.', v_parity
      using errcode = '23514',
            hint = format('FLD-11: %s.', custom._parity_types_sentence());
  end if;

  d := d || jsonb_build_object('parity_type', v_parity);

  case v_parity
    -- ── the two list types ───────────────────────────────────────────────────
    when 'select', 'multi_select' then
      d := d || jsonb_build_object(
        'type',   'list',
        'multi',  v_parity = 'multi_select',
        'rules',  v_rules,
        'config', v_config || jsonb_build_object(
                    'options_table_id', coalesce(nullif(p_spec ->> 'options_table_id', ''),
                                                nullif(v_config ->> 'options_table_id', ''))));

    -- ── the two relation types a person names by what they hold ─────────────
    when 'member' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.person_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        -- STORE-T / T7 (REL-2): what happens to this record when the thing it points at is
        -- deleted is the CALLER'S to declare — restrict, set_null or cascade. It was hard-coded
        -- to set_null, so no client could ever declare the `restrict` T7 asks for and every
        -- delete of a pointed-at record was accepted. set_null stays the default.
        'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                                 then p_spec ->> 'on_target_delete' else 'set_null' end,
        'rules',            v_rules,
        'config',           v_config);
    when 'attachment' then
      d := d || jsonb_build_object(
        'type',             'relation',
        'relation_target',  custom.file_kernel_id(),
        'relation_max',     coalesce((p_spec ->> 'relation_max')::integer, case when v_multi then 25 else 1 end),
        -- REC-31: removing the file removes the attachment, never the record — so `cascade` is
        -- the one answer this field may not give, and custom._field_type_parity_guard refuses it
        -- by name. restrict is a caller's to choose.
        'on_target_delete', case when nullif(p_spec ->> 'on_target_delete', '') in ('restrict','set_null','cascade')
                                 then p_spec ->> 'on_target_delete' else 'set_null' end,
        'rules',            v_rules,
        'config',           v_config);

    -- ── the three worked-out types ──────────────────────────────────────────
    when 'lookup' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
        'rules',      v_rules,
        'config',     v_config || jsonb_strip_nulls(jsonb_build_object(
                        'via',  nullif(p_spec ->> 'via', ''),
                        'pick', nullif(p_spec ->> 'pick', ''))));
    when 'rollup' then
      d := d || jsonb_build_object(
        'type',       'formula',
        'source',     'formula',
        -- FLD-11: a rollup that stamped itself at write time would be stale the
        -- moment a contained record changed, and the store refuses that — so the
        -- only answer this door can give is the right one.
        'compute_on', 'read',
        'rules',      v_rules,
        'config',     v_config || jsonb_strip_nulls(jsonb_build_object(
                        'via', nullif(p_spec ->> 'via', ''),
                        'agg', nullif(p_spec ->> 'agg', ''),
                        'of',  nullif(p_spec ->> 'of', ''))));
    when 'formula' then
      -- ── GRID-PRIMITIVES G3 / G5, 2026-09-22. ────────────────────────────────────────────
      -- A system kind carries its system expression and says which it is; nothing else it
      -- was sent can change what it works out. A formula a person TYPED (`formula_text`, the
      -- older grid's language) is parsed here by custom.formula_parse, against this Table's
      -- own columns; a mistake is refused in the parser's own words with where it is, and
      -- the text is kept beside the expression so the person edits text and never JSON.
      if v_system is not null then
        v_config := (v_config - 'formula_text') || jsonb_build_object('system', v_system);
        d := d || jsonb_build_object(
          'type',       'formula',
          'source',     'formula',
          'compute_on', case when v_system = 'autonumber' then 'write' else 'read' end,
          'rules',      v_rules,
          'config',     v_config || jsonb_build_object('expr', jsonb_build_object('op', 'fx.' || v_system)));
        if coalesce(jsonb_typeof(p_spec -> 'display_format'), 'null') = 'null' then
          p_spec := p_spec || jsonb_build_object('display_format', jsonb_build_object('id', v_system));
        end if;
      else
        if nullif(btrim(coalesce(p_spec ->> 'formula_text', '')), '') is not null then
          v_parsed := custom.formula_parse(p_organization_id, p_table_id, p_spec ->> 'formula_text');
          if not coalesce((v_parsed ->> 'ok')::boolean, false) then
            raise exception 'The formula for "%" cannot be worked out: % (at character %).',
                            v_label, v_parsed ->> 'error', coalesce((v_parsed ->> 'position')::integer, 0) + 1
              using errcode = '23514',
                    hint = 'GRID-PRIMITIVES G3: a formula names columns in braces, like {Visit fee} - {Deposit taken}; select signature, says from custom.formula_node_kinds() lists every function. Nothing was written.';
          end if;
          v_config := v_config || jsonb_build_object('formula_text', p_spec ->> 'formula_text',
                                                     'expr', v_parsed -> 'expr');
        elsif p_spec ? 'expr' then
          -- An expression written by hand no longer matches any text it came with.
          v_config := v_config - 'formula_text';
        end if;
        d := d || jsonb_build_object(
          'type',       'formula',
          'source',     'formula',
          'compute_on', coalesce(nullif(p_spec ->> 'compute_on', ''), 'read'),
          'rules',      v_rules,
          'config',     v_config || jsonb_build_object('expr',
                          coalesce(v_parsed -> 'expr', p_spec -> 'expr', v_config -> 'expr')));
      end if;

    -- ── the three formatted texts. The format says how to SHOW it; the
    --    pattern Rule is what makes it enforceable (FLD-3 / FLD-11), so the
    --    door writes the Rule rather than leaving a label on an empty box.
    when 'url' then
      d := d || jsonb_build_object('type', 'text', 'format', 'url', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', '^https?://[^\s]+$')) end);
    when 'email' then
      d := d || jsonb_build_object('type', 'text', 'format', 'email', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', '^[^@\s]+@[^@\s]+\.[^@\s]+$')) end);
    when 'phone' then
      d := d || jsonb_build_object('type', 'text', 'format', 'phone', 'config', v_config,
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r where r ->> 'kind' = 'pattern')
                      then v_rules
                      else v_rules || jsonb_build_array(jsonb_build_object(
                             'kind', 'pattern', 'value', custom.phone_pattern())) end);

    -- ── the three numbers and dates ─────────────────────────────────────────
    when 'currency' then
      d := d || jsonb_build_object(
        'type', 'range', 'format', 'currency',
        'unit', coalesce(nullif(p_spec ->> 'unit', ''), '$'),
        'config', v_config, 'rules', v_rules);
    when 'percent' then
      d := d || jsonb_build_object(
        'type', 'range', 'format', 'percent', 'unit', '%', 'config', v_config,
        -- FLD-3 / FLD-11: a percent field that takes -40 is a percent in name only.
        'rules', case when exists (select 1 from jsonb_array_elements(v_rules) r
                                    where r ->> 'kind' in ('min', 'max'))
                      then v_rules
                      else v_rules || jsonb_build_array(
                             jsonb_build_object('kind', 'min', 'value', 0),
                             jsonb_build_object('kind', 'max', 'value', 100)) end);
    -- ── the tick box ────────────────────────────────────────────────────────
    -- No format, no unit, no options Table and no Rule: what it holds IS the
    -- behaviour. A default is carried when the caller named one (above), which is
    -- how a column can start life ticked.
    when 'checkbox' then
      d := d || jsonb_build_object('type', 'boolean', 'config', v_config, 'rules', v_rules);

    when 'datetime' then
      d := d || jsonb_build_object(
        'type', 'range', 'rules', v_rules,
        'config', v_config || jsonb_build_object(
                    'kind', case when coalesce(p_spec ->> 'kind', v_config ->> 'kind') = 'datetime'
                                 then 'datetime' else 'date' end));
      if coalesce(p_spec ->> 'kind', v_config ->> 'kind') = 'datetime' then
        d := d || jsonb_build_object('format', 'datetime');
      end if;
    else
      raise exception 'The field type "%" is known but this store does not yet know what it is made of.', v_parity
        using errcode = '23514',
              hint = 'custom._field_document_for has an arm per parity type; this one is missing. Nothing was written.';
  end case;

  return custom._with_display_format(custom._with_display(p_organization_id, d, p_spec - 'display_format'), p_spec);
end
$function$;

CREATE OR REPLACE FUNCTION custom.sign_request_create(p_organization_id uuid, p_render_id uuid, p_field_key text, p_signer_email text, p_signer_name text, p_expires_in interval DEFAULT '14 days'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     record;
  v_field   jsonb;
  v_secret  bytea;
  v_id      uuid;
  v_token   text;
  v_expires timestamptz;
  v_signer  uuid;
  v_email   text := lower(btrim(coalesce(p_signer_email, '')));
  v_name    text := btrim(coalesce(p_signer_name, ''));
  v_prior   uuid;
  v_tmpl    text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.sign_request_create');
  perform custom.assert_store_door(p_organization_id, 'custom.sign_request_create');

  if p_organization_id is null or p_render_id is null then
    raise exception 'custom.sign_request_create: organization_id and the document version are both required'
      using errcode = '22004';
  end if;

  select d.record_id, d.table_id, d.template_id, d.template_version, d.content_hash
    into v_doc
    from custom.doc_render d
   where d.organization_id = p_organization_id and d.id = p_render_id
     and d.deleted_at is null;
  if v_doc.record_id is null then
    raise exception 'there is no such document in this organization to ask anybody to sign' using errcode = '02000',
            hint = 'A signature request is over a rendered document version. Render one first: custom.doc_render_document(organization, template, record).',
            detail = jsonb_build_object('render_id', p_render_id)::text;
  end if;

  -- THE LADDER, ASKED WHERE THE RECORD IS KNOWN — the lesson W3-DOC's own door learned the
  -- hard way (`custom.doc_sign` once named a parameter it did not have and died on line nine).
  perform custom.assert_client_may_change(p_organization_id, v_doc.record_id,
                                          'custom.sign_request_create',
                                          'editor'::public.permission_level, 'record');

  -- VAL-10: THE FIELD IS NAMED WHEN THE ASK IS MADE, not when the signature arrives, so
  -- nobody can be asked for one signature and made to give another.
  select f.data into v_field
    from custom.field f
   where f.organization_id = p_organization_id
     and f.entity_definition_id = v_doc.table_id
     and f.key = p_field_key;
  if v_field is null then
    raise exception 'there is no field "%" on the table this document was rendered from', p_field_key
      using errcode = '23503', hint = 'VAL-10: a signature is a Value, so it belongs to a Field.';
  end if;
  if not custom.doc_signature_field_ok(v_field) then
    raise exception '"%" is a % field, and a signature is written on a text field whose format is signature',
                    coalesce(v_field ->> 'label', p_field_key), coalesce(v_field ->> 'type', 'nothing')
      using errcode = '23514',
            hint = format('The signature fields on this table are: %s.',
                          coalesce((select string_agg(format('%s (%s)', g.label, g.key), ', ' order by g.sort, g.key)
                                      from custom.field g
                                     where g.organization_id = p_organization_id
                                       and g.entity_definition_id = v_doc.table_id
                                       and custom.doc_signature_field_ok(g.data)),
                                   'none yet - declare one with type text and format signature'));
  end if;

  -- ALREADY SIGNED IS NOT A THING TO ASK ABOUT. `custom.doc_sign` would refuse at the end of
  -- the journey; refusing here means the client never gets a link that was never going to work.
  select s.id into v_prior
    from custom.doc_signature s
   where s.organization_id = p_organization_id
     and s.record_id = v_doc.record_id
     and s.field_key = p_field_key
     and s.deleted_at is null
   limit 1;
  if v_prior is not null then
    raise exception '"%" on this record is already signed, so there is nothing left to ask for',
                    coalesce(v_field ->> 'label', p_field_key)
      using errcode = '23505',
            hint = 'VAL-10: a signature is immutable once signed. A further agreement is a further Field with its own signature, or a further document version with its own seal.';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'a signature request has to be addressed to somebody, and "%" is not an email address', p_signer_email
      using errcode = '23514';
  end if;
  if v_name = '' then
    raise exception 'a signature request has to name who is being asked to sign'
      using errcode = '23514',
            hint = 'The name is shown on the signing page so the person opening the link can see they are the one who was meant to.';
  end if;

  v_expires := now() + coalesce(p_expires_in, interval '14 days');
  if v_expires <= now() then
    raise exception 'a signing link has to expire in the future, and % is not', v_expires
      using errcode = '22023';
  end if;

  -- THE SIGNER'S ACCOUNT, IF THERE IS ONE. A member signing in the app and an outsider
  -- (VIS-31's external principal) reach the same link; the difference is only that we can tell
  -- the first one about it through the notification system. No account is the normal case and
  -- is never an obstacle.
  select u.id into v_signer from auth.users u where lower(u.email) = v_email limit 1;

  select coalesce(r.data ->> 'name', 'a document') into v_tmpl
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_doc.template_id
     and r.data_class = 'doc_template';

  v_secret := extensions.gen_random_bytes(32);
  v_id := extensions.gen_random_uuid();

  insert into custom.record (organization_id, id, table_id, data_class, data)
  values (p_organization_id, v_id, null, 'sign_request', jsonb_strip_nulls(jsonb_build_object(
    'render_id',        p_render_id,
    'record_id',        v_doc.record_id,
    'table_id',         v_doc.table_id,
    'template_id',      v_doc.template_id,
    'document_title',   v_tmpl,
    'field_key',        p_field_key,
    'signer_email',     v_email,
    'signer_name',      v_name,
    'signer_user_id',   v_signer,
    'token_hash',       encode(sha256(convert_to(
                          custom.sign_token_encode(
                            decode(replace(p_organization_id::text, '-', ''), 'hex')
                            || decode(replace(v_id::text, '-', ''), 'hex')
                            || v_secret), 'UTF8')), 'hex'),
    'document_hash',    v_doc.content_hash,
    'document_version', v_doc.template_version,
    'sent_at',          now(),
    'expires_at',       v_expires,
    'bad_attempts',     0,
    'reminder_count',   0)));

  v_token := custom.sign_token_encode(
               decode(replace(p_organization_id::text, '-', ''), 'hex')
               || decode(replace(v_id::text, '-', ''), 'hex')
               || v_secret);

  -- THE ONE AND ONLY TIME THE SECRET EXISTS OUTSIDE THE SIGNER'S EMAIL.
  return jsonb_build_object(
    'request_id',       v_id,
    'token',            v_token,
    'path',             '/sign/' || v_token,
    'signer_email',     v_email,
    'signer_name',      v_name,
    'signer_has_account', v_signer is not null,
    'document_title',   v_tmpl,
    'document_version', v_doc.template_version,
    'document_hash',    v_doc.content_hash,
    'expires_at',       v_expires,
    'state',            'sent');
end;
$function$;

CREATE OR REPLACE FUNCTION public.cx_canvas_save_user_version(p_user_id uuid, p_canvas_id uuid, p_title text, p_content jsonb)
 RETURNS canvas.canvas_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_orig canvas.canvas_items;
  v_new canvas.canvas_items;
  v_root uuid;
  v_next integer;
BEGIN
  IF NOT (auth.role() = 'service_role' OR p_user_id = ( SELECT auth.uid())) THEN
    RAISE EXCEPTION 'access denied: caller is not the target user' USING errcode = '42501';
  END IF;

  SELECT * INTO v_orig
  FROM canvas.canvas_items
  WHERE id = p_canvas_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'canvas item % not found or not owned by user', p_canvas_id;
  END IF;

  v_root := COALESCE(v_orig.parent_canvas_id, v_orig.id);

  PERFORM 1 FROM canvas.canvas_items WHERE id = v_root FOR UPDATE;

  SELECT COALESCE(MAX(version), v_orig.version) + 1 INTO v_next
  FROM canvas.canvas_items
  WHERE id = v_root OR parent_canvas_id = v_root;

  INSERT INTO canvas.canvas_items
    (user_id, type, title, content, conversation_id,
     source_message_id, artifact_index, version, parent_canvas_id, source_type,
     external_system, external_id, organization_id, metadata,
     source_system, source_id)
  VALUES
    (p_user_id, v_orig.type, COALESCE(NULLIF(p_title, ''), v_orig.title), p_content,
     v_orig.conversation_id, NULL, NULL, v_next, v_root, 'user_created',
     v_orig.external_system, v_orig.external_id, v_orig.organization_id, v_orig.metadata,
     v_orig.source_system, v_orig.source_id)
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cx_message_set_content(p_message_id uuid, p_new_content jsonb)
 RETURNS chat.message
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_row        chat.message;
  v_conv_owner uuid;
  v_now        timestamptz := now();
  v_history    jsonb;
  v_old_ids    text[];
  v_new_ids    text[];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'no_session' USING ERRCODE = '28000';
  END IF;

  SELECT m.* INTO v_row FROM chat.message m WHERE m.id = p_message_id;
  IF NOT FOUND THEN
    perform platform.refuse_not_found('message_not_found');
  END IF;

  SELECT c.created_by INTO v_conv_owner
    FROM chat.conversation c
   WHERE c.id = v_row.conversation_id;

  IF v_conv_owner IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

  -- TOOL-GRAPH GUARD (migration 0151): a content rewrite through this RPC may
  -- reshape text/artifact blocks but must NEVER add, remove, or re-id
  -- tool_call blocks. The tool_use ↔ tool_result pairing graph is provider-
  -- critical (Anthropic 400s on any mismatch) and is owned exclusively by the
  -- server's persistence path. This is the DB layer of the bcc588b6 fix —
  -- the write that corrupted that conversation is structurally rejected here.
  v_old_ids := chat._message_tool_call_ids(v_row.content);
  v_new_ids := chat._message_tool_call_ids(p_new_content);
  IF v_old_ids IS DISTINCT FROM v_new_ids THEN
    RAISE EXCEPTION
      'tool_call_graph_change_forbidden: cx_message_set_content may not change the tool_call blocks of message % (existing call_ids=%, proposed call_ids=%). Rewrite text/artifact blocks only — the tool-pairing graph is server-owned. (Migration 0151; FOUND_DEFECTS bcc588b6.)',
      p_message_id, v_old_ids, v_new_ids
      USING ERRCODE = 'P0001';
  END IF;

  v_history := COALESCE(v_row.content_history, '[]'::jsonb)
            || jsonb_build_array(jsonb_build_object(
                 'content',  v_row.content,
                 'saved_at', v_now,
                 'reason',   'artifact_materialization'
               ));

  UPDATE chat.message
     SET content         = p_new_content,
         content_history = v_history
   WHERE id = p_message_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_context_item(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_result jsonb;
begin
  select st.organization_id
    into v_org
    from context.context_items ci
    join context.scope_types st on st.id = ci.scope_type_id
   where ci.id = p_item_id
     and ci.deleted_at is null;

  if v_org is null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;

  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for %', v_org
      using errcode = '42501';
  end if;

  update context.context_items
     set deleted_at = now(),
         is_active = false,
         updated_at = now()
   where id = p_item_id
  returning jsonb_build_object('id', id, 'deleted_at', deleted_at) into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_certify_content(p_resource_type text, p_resource_id uuid, p_note text DEFAULT NULL::text)
 RETURNS education.content_certification
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'education'
AS $function$
declare
  v_row education.content_certification;
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- THE ORGANIZATION: the certification is a child of the RESOURCE being
  -- certified — inherit that resource's own organization_id. Never defaulted.
  -- Only 'fc_set' is certifiable today (features/education/library/actions.ts);
  -- an unrecognized resource_type has no legitimate source and is refused.
  if p_resource_type = 'fc_set' then
    select organization_id into v_org from education.fc_set where id = p_resource_id;
  else
    raise exception 'organization_required: edu_certify_content has no organization resolver for resource_type %', p_resource_type
      using errcode = 'P0001',
            hint = 'Add an organization lookup for this resource_type before certifying it.';
  end if;

  if v_org is null then
    raise exception 'organization_required: resource % % was not found (or carries no organization)', p_resource_type, p_resource_id
      using errcode = 'P0001';
  end if;

  insert into education.content_certification (resource_type, resource_id, note, certified_by, organization_id)
  values (p_resource_type, p_resource_id, p_note, v_uid, v_org)
  on conflict (resource_type, resource_id)
    do update set note = excluded.note, certified_by = v_uid, certified_at = now(),
                  -- Re-certifying an uncertified (archived) resource starts a
                  -- fresh certification: no earlier human sign-off carries over.
                  human_verified_at = case when content_certification.deleted_at is null
                                           then content_certification.human_verified_at end,
                  human_verified_by = case when content_certification.deleted_at is null
                                           then content_certification.human_verified_by end,
                  deleted_at = null
  returning * into v_row;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_learn_doc_set_status(p_id uuid, p_publish boolean)
 RETURNS education.learn_doc
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'education', 'platform'
AS $function$
declare
  v_row education.learn_doc;
  v_owner uuid;
  v_org uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select created_by, organization_id into v_owner, v_org
    from education.learn_doc where id = p_id and deleted_at is null;
  if v_owner is null and v_org is null then
    raise exception 'learn_doc % not found', p_id;
  end if;

  -- DD-162: the class gets a say even when the administrator door is already open. Publishing a
  -- document changes who may read it, which is the same question as changing who owns it.
  perform iam.assert_may_transfer('learn_doc', v_owner, v_owner, v_org);

  update education.learn_doc set
    visibility = case when p_publish then 'public'::platform.visibility else 'personal'::platform.visibility end,
    published_at = case when p_publish then coalesce(published_at, now()) else published_at end
  where id = p_id and deleted_at is null
  returning * into v_row;
  if v_row.id is null then
    raise exception 'learn_doc % not found', p_id;
  end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_learn_doc_upsert(p_slug text, p_title text, p_summary text, p_sections jsonb, p_id uuid DEFAULT NULL::uuid, p_subject text DEFAULT NULL::text, p_letter text DEFAULT 'Lr'::text, p_keywords text[] DEFAULT '{}'::text[], p_related jsonb DEFAULT '{}'::jsonb, p_content_updated_at date DEFAULT NULL::date)
 RETURNS education.learn_doc
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'education', 'platform'
AS $function$
declare
  v_row education.learn_doc;
  v_slug text := lower(btrim(p_slug));
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_slug = '' then
    raise exception 'slug is required';
  end if;
  if v_slug !~ '^[a-z0-9]+(?:[/-][a-z0-9]+)*$' then
    raise exception 'invalid slug %: use lowercase letters, numbers, hyphens, and / only', v_slug;
  end if;
  if v_slug = 'admin' or v_slug like 'admin/%' then
    raise exception 'slug "admin" is reserved';
  end if;

  if p_id is null then
    -- Platform learning content (super-admin authored): a PLATFORM row, named.
    insert into education.learn_doc
      (slug, title, summary, sections, subject, letter, keywords, related, content_updated_at, organization_id)
    values
      (v_slug, p_title, p_summary, coalesce(p_sections,'[]'::jsonb), p_subject,
       coalesce(p_letter,'Lr'), coalesce(p_keywords,'{}'), coalesce(p_related,'{}'::jsonb),
       coalesce(p_content_updated_at, current_date), public.system_org_id('system'))
    returning * into v_row;
  else
    update education.learn_doc set
      slug = v_slug,
      title = p_title,
      summary = p_summary,
      sections = coalesce(p_sections,'[]'::jsonb),
      subject = p_subject,
      letter = coalesce(p_letter,'Lr'),
      keywords = coalesce(p_keywords,'{}'),
      related = coalesce(p_related,'{}'::jsonb),
      content_updated_at = coalesce(p_content_updated_at, content_updated_at, current_date)
    where id = p_id and deleted_at is null
    returning * into v_row;
    if v_row.id is null then
      raise exception 'learn_doc % not found', p_id;
    end if;
  end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_resolve_suggestion(p_id uuid, p_status text)
 RETURNS education.deck_suggestion
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'education'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_row education.deck_suggestion;
begin
  if p_status not in ('accepted','declined','open') then
    raise exception 'invalid status %', p_status;
  end if;
  update education.deck_suggestion set
    status = p_status,
    resolved_at = case when p_status = 'open' then null else now() end
  where id = p_id
    and (owner_id = v_uid or public.is_super_admin())
  returning * into v_row;
  if v_row.id is null then
    raise exception 'suggestion % not found or not yours', p_id;
  end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_suggest_edit(p_resource_id uuid, p_body text, p_resource_type text DEFAULT 'fc_set'::text)
 RETURNS education.deck_suggestion
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'education'
AS $function$
declare
  v_owner uuid;
  v_uid   uuid := auth.uid();
  v_row   education.deck_suggestion;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if coalesce(btrim(p_body),'') = '' then
    raise exception 'suggestion body is required';
  end if;
  if p_resource_type <> 'fc_set' then
    raise exception 'unsupported resource_type %', p_resource_type;
  end if;

  select created_by into v_owner from education.fc_set
  where id = p_resource_id and deleted_at is null;
  if v_owner is null then
    raise exception 'deck % not found', p_resource_id;
  end if;
  if v_owner = v_uid then
    raise exception 'cannot suggest an edit to your own deck';
  end if;

  insert into education.deck_suggestion (resource_type, resource_id, owner_id, suggested_by, body)
  values (p_resource_type, p_resource_id, v_owner, v_uid, p_body)
  returning * into v_row;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.entity_access_summary(p_type text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_schema text;
  v_table text;
  v_vis platform.visibility;
  v_owner uuid;
  v_org uuid;
  v_found boolean;
  v_can_manage boolean;
  v_grant_count int := 0;
  v_grants jsonb := '[]'::jsonb;
  v_containers jsonb := '[]'::jsonb;
  v_member_count int := 0;
begin
  if v_uid is null then
    raise exception 'entity_access_summary: not authenticated';
  end if;
  if not iam.has_access(p_type, p_id, 'viewer') then
    raise exception 'entity_access_summary: no access to % %', p_type, p_id;
  end if;

  select schema_name, table_name into v_schema, v_table
  from platform.entity_types
  where token = p_type;

  if v_schema is null then
    raise exception 'entity_access_summary: unknown entity type %', p_type;
  end if;

  select * into v_vis, v_owner, v_org, v_found
  from platform.entity_row_access_attrs(v_schema, v_table, p_id);

  if not coalesce(v_found, false) then
    raise exception 'entity_access_summary: % % not found', p_type, p_id;
  end if;

  v_can_manage := iam.has_access(p_type, p_id, 'admin');

  select count(*)::int into v_grant_count
  from iam.permissions pm
  where pm.resource_type = p_type
    and pm.resource_id = p_id
    and pm.status = 'active'
    and coalesce(pm.is_public, false) = false
    and (pm.expires_at is null or pm.expires_at > now());

  if v_can_manage then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'grantee_type', case when pm.granted_to_organization_id is not null
                               then 'organization' else 'user' end,
          'grantee_id', coalesce(pm.granted_to_organization_id, pm.granted_to_user_id),
          'grantee_label', case when pm.granted_to_organization_id is not null
                                then platform.entity_title('organization', pm.granted_to_organization_id)
                                else null end,
          'level', pm.permission_level::text,
          'expires_at', pm.expires_at
        )
        order by pm.created_at
      ),
      '[]'::jsonb
    )
    into v_grants
    from iam.permissions pm
    where pm.resource_type = p_type
      and pm.resource_id = p_id
      and pm.status = 'active'
      and coalesce(pm.is_public, false) = false
      and (pm.expires_at is null or pm.expires_at > now());
  end if;

  select coalesce(
    jsonb_agg(c.entry order by c.depth, c.container_type),
    '[]'::jsonb
  )
  into v_containers
  from (
    select
      r.depth,
      r.container_type,
      jsonb_build_object(
        'container_type', r.container_type,
        'container_id', r.container_id,
        'container_type_label', et.label,
        'label', platform.entity_title(r.container_type, r.container_id),
        'level', r.max_level::text,
        'depth', r.depth,
        'visibility', ca.o_vis::text,
        'organization_id', ca.o_org,
        'organization_name', platform.entity_title('organization', ca.o_org),
        'org_readable', (ca.o_vis >= 'internal'::platform.visibility and ca.o_org is not null),
        'member_count', (
          select count(distinct m.user_id)::int
          from iam.memberships m
          where m.container_type = r.container_type
            and m.container_id = r.container_id
            and m.deleted_at is null
        )
      ) as entry
    from platform.reachability r
    join platform.entity_types et on et.token = r.container_type
    cross join lateral platform.entity_row_access_attrs(et.schema_name, et.table_name, r.container_id) ca
    where r.item_type = p_type
      and r.item_id = p_id
      and ca.o_found
      and iam.has_access(r.container_type, r.container_id, 'viewer')
  ) c;

  select count(distinct m.user_id)::int into v_member_count
  from iam.memberships m
  where m.container_type = p_type
    and m.container_id = p_id
    and m.deleted_at is null;

  return jsonb_build_object(
    'entity_type', p_type,
    'entity_id', p_id,
    'visibility', v_vis::text,
    'owner_id', v_owner,
    'viewer_is_owner', (v_owner = v_uid),
    'organization_id', v_org,
    'organization_name', platform.entity_title('organization', v_org),
    'can_manage', v_can_manage,
    'is_public', (v_vis = 'public'::platform.visibility),
    'org_readable', (v_vis >= 'internal'::platform.visibility and v_org is not null
                     and (v_schema is distinct from 'custom' or iam.member_lane_open(v_org))),
    'direct_grant_count', v_grant_count,
    'direct_grants', v_grants,
    'member_count', v_member_count,
    'containers', v_containers,
    'container_count', jsonb_array_length(v_containers)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.entity_row_create(p_token text, p_title text, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_et    record;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'entity_row_create: nobody is signed in.' using errcode = '42501';
  end if;
  if v_title is null then
    raise exception 'entity_row_create: a new % needs a name.', coalesce(p_token, 'record')
      using errcode = '22004';
  end if;
  if p_organization_id is null then
    raise exception 'entity_row_create: name the organization this belongs to.'
      using errcode = '22004';
  end if;
  if not iam.has_org_access(p_organization_id) then
    raise exception 'entity_row_create: % is not an organization you can act in.', p_organization_id
      using errcode = '42501';
  end if;

  select et.schema_name, et.table_name, et.title_column, et.audit_class, et.label
    into v_et
    from platform.entity_types et
   where et.token = p_token and et.is_active and et.reference_pickable;
  if not found then
    raise exception 'entity_row_create: % is not a reference-pickable entity.', p_token
      using errcode = '22023',
            hint = 'Only an active, reference-pickable token in platform.entity_types can be created from a picker.';
  end if;
  if v_et.title_column is null then
    raise exception 'entity_row_create: a % has no single name column, so it cannot be created from a name alone.', coalesce(v_et.label, p_token)
      using errcode = '22023';
  end if;
  -- ACCESS MACHINERY IS NEVER REACHED BY A GENERIC "MAKE ME A ROW".
  if coalesce(v_et.audit_class, 'entity') = 'machinery' then
    raise exception 'entity_row_create: % is access machinery and is never created from a picker.', coalesce(v_et.label, p_token)
      using errcode = '42501';
  end if;
  -- 🚨 A TABLE WITH NO `organization_id` CANNOT CARRY ONE, and the direct path has been
  -- sending it anyway and getting 42703. `iam.organizations` is that table: creating an
  -- organization is `public.org_create`, which asks a different set of questions.
  if not exists (select 1 from information_schema.columns c
                  where c.table_schema = v_et.schema_name
                    and c.table_name = v_et.table_name
                    and c.column_name = 'organization_id') then
    raise exception 'entity_row_create: a % is not something that lives inside an organization, so it cannot be created here.', coalesce(v_et.label, p_token)
      using errcode = '22023',
            hint = 'An organization itself is created with public.org_create.';
  end if;

  execute format(
    'insert into %I.%I (%I, created_by, organization_id) values ($1, $2, $3) returning id',
    v_et.schema_name, v_et.table_name, v_et.title_column)
    into v_id using v_title, v_actor, p_organization_id;

  return jsonb_build_object('id', v_id, 'title', v_title, 'token', p_token);
end;
$function$;

CREATE OR REPLACE FUNCTION public.flexible_data_write(p_organization_id uuid, p_patch jsonb, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_row platform.flexible_data;
begin
  if v_actor is null then
    raise exception 'flexible_data_write: nobody is signed in.' using errcode = '42501';
  end if;
  if p_organization_id is null or jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'flexible_data_write: name the organization and pass an object.'
      using errcode = '22004';
  end if;
  if not iam.has_org_access(p_organization_id) then
    raise exception 'flexible_data_write: % is not an organization you can act in.', p_organization_id
      using errcode = '42501';
  end if;

  if p_id is null then
    insert into platform.flexible_data
      (label, slug, data, category_id, organization_id, created_by, visibility)
    values (
      coalesce(nullif(btrim(coalesce(p_patch ->> 'label', '')), ''), 'Untitled'),
      nullif(btrim(coalesce(p_patch ->> 'slug', '')), ''),
      case when jsonb_typeof(p_patch -> 'data') = 'object' then p_patch -> 'data' else '{}'::jsonb end,
      nullif(p_patch ->> 'category_id', '')::uuid,
      p_organization_id,
      v_actor,
      coalesce(nullif(p_patch ->> 'visibility', '')::platform.visibility, 'personal'::platform.visibility))
    returning * into v_row;
    return jsonb_build_object('id', v_row.id, 'label', v_row.label, 'version', v_row.version);
  end if;

  select * into v_row from platform.flexible_data f
   where f.id = p_id and f.organization_id = p_organization_id and f.deleted_at is null;
  if not found then
    raise exception 'flexible_data_write: there is no such record here.' using errcode = '23503';
  end if;
  -- THE LADDER. The predicate `std_update` carried.
  if not (v_row.created_by = v_actor
          or iam.has_access('flexible_data', v_row.id, 'editor'::public.permission_level)
          or (v_row.visibility >= 'internal'::platform.visibility and public.is_platform_admin())) then
    raise exception 'flexible_data_write: this record is not yours to change.' using errcode = '42501';
  end if;

  -- `deleted_at` IS NOT A KEY OF THIS PATCH. Archiving is flexible_data_archive: an archive is
  -- a different act from an edit, and a door that lets a caller set deleted_at in a patch is a
  -- delete wearing an edit''s name.
  update platform.flexible_data f
     set label      = case when p_patch ? 'label'      then coalesce(nullif(btrim(p_patch ->> 'label'), ''), f.label) else f.label end,
         slug       = case when p_patch ? 'slug'       then nullif(btrim(coalesce(p_patch ->> 'slug', '')), '') else f.slug end,
         data       = case when jsonb_typeof(p_patch -> 'data') = 'object' then p_patch -> 'data' else f.data end,
         visibility = case when p_patch ? 'visibility' then coalesce(nullif(p_patch ->> 'visibility', '')::platform.visibility, f.visibility) else f.visibility end,
         updated_by = v_actor
   where f.id = p_id
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'label', v_row.label, 'version', v_row.version);
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_kg_cost_batch_detail(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'iam', 'batch'
AS $function$
DECLARE
  v_batch batch.provider_batch%ROWTYPE;
  v_org_name text;
  v_result jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION '/kg-cost is admin-only';
  END IF;

  SELECT * INTO v_batch FROM batch.provider_batch WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch.provider_batch row % not found', p_batch_id;
  END IF;
  IF v_batch.organization_id IS NOT NULL THEN
    SELECT name INTO v_org_name FROM iam.organizations WHERE id = v_batch.organization_id;
  END IF;

  SELECT jsonb_build_object(
    'id', v_batch.id, 'custom_id', NULL, 'provider', v_batch.provider,
    'batch_id', v_batch.batch_id, 'kind', v_batch.purpose, 'purpose', v_batch.purpose,
    'model', v_batch.model, 'request_count', v_batch.request_count,
    'prefix_group_key', v_batch.prefix_group_key, 'created_by', v_batch.created_by,
    'organization_id', v_batch.organization_id, 'organization_name', v_org_name,
    'source_kind', NULL, 'source_id', NULL,
    'status', v_batch.status, 'est_cost_usd', COALESCE(v_batch.est_cost_usd, 0),
    'est_live_cost_usd', COALESCE(v_batch.est_live_cost_usd, 0), 'cost_usd', v_batch.cost_usd,
    'tokens_in', v_batch.tokens_in, 'tokens_out', v_batch.tokens_out,
    'cache_read_tokens', v_batch.cache_read_tokens, 'cache_write_tokens', v_batch.cache_write_tokens,
    'poll_count', COALESCE(v_batch.poll_count, 0),
    'last_polled_at', v_batch.last_polled_at, 'response_uri', NULL, 'error', v_batch.error,
    'metadata', v_batch.metadata, 'submitted_at', v_batch.submitted_at, 'completed_at', v_batch.completed_at,
    'next_poll_at', v_batch.next_poll_at, 'cost_recorded_at', v_batch.cost_recorded_at,
    'created_at', v_batch.created_at, 'updated_at', v_batch.updated_at,
    'work_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', w.id, 'custom_id', w.custom_id, 'purpose', w.purpose, 'status', w.status,
        'result_handler', w.result_handler, 'handler_status', w.handler_status,
        'link_kind', w.link_kind, 'link_id', w.link_id,
        'est_live_cost_usd', w.est_live_cost_usd, 'actual_cost_usd', w.actual_cost_usd
      ) ORDER BY w.created_at)
      FROM batch.work_item w WHERE w.provider_batch_row_id = v_batch.id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_kg_cost_org_detail(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'iam', 'batch'
AS $function$
DECLARE
  v_prefs iam.organization_preferences%ROWTYPE;
  v_org_name text;
  v_result jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION '/kg-cost is admin-only';
  END IF;

  SELECT * INTO v_prefs FROM iam.organization_preferences WHERE organization_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_preferences row not found for %', p_org_id;
  END IF;
  SELECT name INTO v_org_name FROM iam.organizations WHERE id = p_org_id;

  SELECT jsonb_build_object(
    'organization_id', v_prefs.organization_id,
    'organization_name', v_org_name,
    'budget_usd', COALESCE(v_prefs.daily_auto_rag_budget_usd, 0),
    'used_today_usd', COALESCE(v_prefs.daily_auto_rag_cost_used_usd, 0),
    'window_start', v_prefs.daily_auto_rag_window_start,
    'daily_series', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', d.bucket, 'cost_usd', d.cost) ORDER BY d.bucket)
      FROM (
        SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS bucket, SUM(cost_usd) AS cost
        FROM batch.cost_event
        WHERE organization_id = p_org_id AND created_at >= now() - interval '30 days'
        GROUP BY 1
      ) d
    ), '[]'::jsonb),
    'top_sources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('source', s.source, 'cost_usd', s.c, 'count', s.n))
      FROM (
        SELECT source, SUM(cost_usd) AS c, COUNT(*) AS n
        FROM batch.cost_event
        WHERE organization_id = p_org_id AND created_at >= now() - interval '30 days' AND source IS NOT NULL
        GROUP BY source
        ORDER BY SUM(cost_usd) DESC
        LIMIT 20
      ) s
    ), '[]'::jsonb),
    'batch_summary', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('status', b.status, 'count', b.n, 'total_cost_usd', b.total_cost) ORDER BY b.status)
      FROM (
        SELECT status, COUNT(*) AS n, SUM(cost_usd) AS total_cost
        FROM batch.provider_batch
        WHERE organization_id = p_org_id
        GROUP BY status
      ) b
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fork_processed_document(p_source_id uuid, p_organization_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_org  uuid := p_organization_id;
  v_new  uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Name the organization your copy belongs to.'
      USING ERRCODE = '23502', HINT = 'Pass p_organization_id.';
  END IF;
  IF NOT iam.has_org_access(v_org) THEN
    RAISE EXCEPTION 'You are not a member of that organization.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_read_processed_document(p_source_id, v_user) THEN
    RAISE EXCEPTION 'not permitted to read source document %', p_source_id USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_new
  FROM docproc.processed_documents
  WHERE created_by = v_user AND parent_processed_id = p_source_id AND derivation_kind = 'user_fork'
    AND organization_id = v_org
  LIMIT 1;
  IF v_new IS NOT NULL THEN RETURN v_new; END IF;
  INSERT INTO docproc.processed_documents (
    organization_id, created_by, source_kind, source_id, parent_processed_id,
    derivation_kind, derivation_metadata, name, mime_type, total_pages,
    source_hash, storage_uri, content, clean_content, structured_json, metadata,
    file_content_hash, extractor_name, extractor_version, cleaner_name, cleaner_version, rag_boost
  )
  SELECT
    v_org, v_user, source_kind, source_id, p_source_id,
    'user_fork', jsonb_build_object('forked_from', p_source_id, 'forked_by', v_user),
    name || ' (my copy)', mime_type, total_pages,
    source_hash, storage_uri, content, clean_content, structured_json,
    COALESCE(metadata, '{}'::jsonb), file_content_hash, extractor_name,
    extractor_version, cleaner_name, cleaner_version, 0
  FROM docproc.processed_documents WHERE id = p_source_id
  RETURNING id INTO v_new;
  INSERT INTO docproc.processed_document_pages (
    organization_id, processed_document_id, page_index, page_number, width, height, rotation,
    raw_text, raw_char_count, extraction_method, blocks, words, cleaned_text,
    cleaned_char_count, section_kind, section_title, section_subtype,
    is_continuation, used_ocr, extraction_confidence, image_cld_file_id, image_dpi, metadata
  )
  SELECT
    v_org, v_new, page_index, page_number, width, height, rotation,
    raw_text, raw_char_count, extraction_method, blocks, words, cleaned_text,
    cleaned_char_count, section_kind, section_title, section_subtype,
    is_continuation, used_ocr, extraction_confidence, image_cld_file_id, image_dpi, metadata
  FROM docproc.processed_document_pages WHERE processed_document_id = p_source_id;
  RETURN v_new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_organization_members_with_users(p_org_id uuid)
 RETURNS TABLE(id uuid, organization_id uuid, user_id uuid, role text, joined_at timestamp with time zone, invited_by uuid, user_email text, user_display_name text, user_avatar_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id
      using errcode = '42501';
  end if;

  return query
  select
    om.id,
    om.organization_id,
    om.user_id,
    om.role::text,
    om.joined_at,
    om.invited_by,
    au.email::text,
    coalesce(
      au.raw_user_meta_data ->> 'full_name',
      au.raw_user_meta_data ->> 'name',
      ''
    )::text,
    coalesce(au.raw_user_meta_data ->> 'avatar_url', '')::text
  from iam.organization_member om
  left join auth.users au on au.id = om.user_id
  where om.organization_id = p_org_id
  order by om.joined_at asc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_scope_tree(p_org_id uuid, p_type_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
  end if;
  select jsonb_agg(
    to_jsonb(s) || jsonb_build_object(
      'type_label', st.label_singular,
      'type_label_plural', st.label_plural,
      'type_icon', st.icon,
      'type_color', st.color
    ) order by st.sort_order, s.sort_order, s.name
  ) into v_result
  from context.scopes s
  join context.scope_types st on s.scope_type_id = st.id
  where s.organization_id = p_org_id
    and s.deleted_at is null and st.deleted_at is null
    and s.id in (select context._readable_scope_ids())
    and (p_type_id is null or s.scope_type_id = p_type_id);
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- lane LISTS-AFTER-SWITCH: a list that lives in the store answers from its copy (same id,
  -- same shape, lives_in = record); the store's own ladder decides who may read it.
  if platform.list_lives_in(p_list_id) = 'record' then
    if (auth.role() = 'service_role'
        or coalesce(custom.has_visibility((select auth.uid()), 'record', p_list_id, 'viewer'::public.permission_level), false)) is not true then
      raise exception 'viewer access required for list %', p_list_id using errcode = '42501';
    end if;
    return public._d31_impl_get_user_list_with_items(p_list_id);
  end if;
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id
        -- lane OLDER-DOORS-AFTER-SWITCH: a list that moved with the switch still reads (marked moved).
        and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id))
        and (l.is_public or l.public_read or l.user_id = (select auth.uid()))
    )
    or coalesce(iam.has_access('structured_list', p_list_id, 'viewer'::public.permission_level), false)
  ) is not true then
    raise exception 'viewer access required for list %', p_list_id using errcode = '42501';
  end if;
  return public._d31_impl_get_user_list_with_items(p_list_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_table_complete(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'viewer') is not true then
    raise exception 'viewer access required for dataset %', p_table_id using errcode = '42501';
  end if;
  -- lane OLDER-DOORS-AFTER-SWITCH: the same answer, marked moved when the table moved with its
  -- organization's Data tables switch (null for every live table).
  return public._d31_impl_get_user_table_complete(p_table_id, p_sort_field, p_sort_direction)
         || jsonb_build_object('moved_to', workbench.older_table_moved_to(p_table_id));
end;
$function$;

CREATE OR REPLACE FUNCTION history.migration_undo(p_organization_id uuid, p_log_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  m        history.migration_log%rowtype;
  v_kind   text;
  v_target uuid;
  v_patch  jsonb;
  v_ver    integer;
  v_also   uuid;
  v_back   integer := 0;
  v_was    integer := 0;              -- STORE-TAILS-3: rows of `also` archived before the undo
  v_unalias uuid;
  v_revoked integer := 0;
  v_back_tbl uuid;
begin
  -- THE SWITCH, READ HERE. This function lives in `history`, not in `custom`, so it is not
  -- covered by the schema's own closed-door posture and says out loud which knob holds it off:
  -- while custom/system_enabled resolves false for this organization the record store takes
  -- writes only from the role that owns custom.record, and an undo is a write.
  if not custom.store_is_open(p_organization_id) then
    perform custom.assert_store_door(p_organization_id, 'history.migration_log');
  end if;

  select * into m from history.migration_log l
   where l.organization_id = p_organization_id and l.id = p_log_id;
  if m.id is null then
    raise exception 'There is no Migration % on the record for this organization.', p_log_id
      using errcode = '02000';
  end if;
  if m.undone_at is not null then
    raise exception 'That Migration was already undone, on %.', m.undone_at
      using errcode = '22023',
            hint = 'HIS-8: undoing it twice would apply the same inverse to values that are already back. Nothing was changed. The undo itself is on the record too, so you can see what it did.';
  end if;

  -- MERGE-HISTORY: THE UNDO SAYS ITS OWN NAME. Every other compound verb is stamped through
  -- `history.migration_record`, because HIS-8 makes it record its inverse before it writes.
  -- An undo records none — it IS the inverse — so it marks the statement itself, and the
  -- versions it writes read "undo of merge" instead of "UPDATE" and "RESTORE".
  if coalesce(nullif(current_setting('history.mark_at', true), ''), '') <> statement_timestamp()::text then
    perform set_config('history.mark_at',   statement_timestamp()::text, true);
    perform set_config('history.mark_id',   p_log_id::text,              true);
    perform set_config('history.mark_verb', 'undo of ' || m.verb,        true);
  end if;

  v_kind   := m.inverse ->> 'kind';
  v_target := coalesce(nullif(m.inverse ->> 'record_id', '')::uuid, m.target_id);

  if v_kind = 'none' then
    raise exception 'The Migration "%" cannot be undone, and said so when it ran.', m.verb
      using errcode = '0A000',
            hint = format('HIS-8: it was recorded as one-way deliberately. What it did is still fully on the record — %s — so the state before it is readable even though it cannot be put back automatically.', coalesce(m.note, 'see the Migration log entry'));
  end if;

  -- THE SAME WRITE PATH, and that is the law rather than a convenience.
  if v_kind = 'restore' then
    -- STORE-TAILS-3: what came back WITH it is counted as what was archived before this undo
    -- and is here after it. custom.record_restore now brings back the unit its archive took, so
    -- the rows of `also` may already be back when the loop below reaches them — they came back
    -- with it all the same, and the answer says so.
    select count(*) into v_was
      from jsonb_array_elements(coalesce(m.inverse -> 'also', '[]'::jsonb)) x
      join custom.record r
        on r.organization_id = p_organization_id and r.id = (x #>> '{}')::uuid
     where r.deleted_at is not null;
    perform custom.record_restore(p_organization_id, v_target);
    -- EVERYTHING THE DELETE TOOK WITH IT. A delete that cascaded and an undo that put one
    -- record back is not an undo; it is a smaller version of the same data loss.
    for v_also in select (x #>> '{}')::uuid
                    from jsonb_array_elements(coalesce(m.inverse -> 'also', '[]'::jsonb)) x loop
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_also
                    and r.deleted_at is not null) then
        perform custom.record_restore(p_organization_id, v_also);
      end if;
    end loop;
    select v_was - count(*) into v_back
      from jsonb_array_elements(coalesce(m.inverse -> 'also', '[]'::jsonb)) x
      join custom.record r
        on r.organization_id = p_organization_id and r.id = (x #>> '{}')::uuid
     where r.deleted_at is not null;
  else
    v_patch := m.inverse -> 'patch';
    if v_patch is null or jsonb_typeof(v_patch) <> 'object' then
      raise exception 'The undo stored for "%" says it is a patch and carries none.', m.verb
        using errcode = '22023', hint = 'HIS-8: nothing was changed.';
    end if;
    -- ── SEAT-SUITES, 2026-09-19: A RETYPE COULD BE LOGGED AND NEVER UNDONE. ───────────
    -- `custom.migrate_retype` moves a record to another Table and records an inverse that
    -- ALREADY carries the Table it came from (`inverse.table_id`) together with the whole
    -- document, misfit values and all. This function read the patch and ignored the table —
    -- so the undo tried to write `phone` back onto a record still sitting on a Table that has
    -- no `phone`, and `custom.validate_value_envelope` refused it by name. Measured from the
    -- seat `authenticated` on the main database on 2026-09-19: "This record carries where
    -- "phone" came from, and this table has no field called "phone"." Every retype in the
    -- system was therefore recorded as reversible and was not: the misfit values a person was
    -- promised were "in History, neither coerced nor deleted" could never come back.
    --
    -- THE RECORD GOES BACK TO ITS TABLE FIRST, and the patch then lands on a Table that has
    -- the columns it names. Nothing else changes: an inverse without `table_id` — which is
    -- every other verb, and every retype logged before this — behaves exactly as before.
    v_back_tbl := nullif(m.inverse ->> 'table_id', '')::uuid;
    if v_back_tbl is not null then
      update custom.record r
         set table_id = v_back_tbl
       where r.organization_id = p_organization_id
         and r.id = v_target
         and r.table_id is distinct from v_back_tbl;
    end if;
    v_ver := custom.record_update(p_organization_id, v_target, v_patch);
  end if;

  -- THE ID HAS TO STOP RESOLVING (T5). A merge sends the loser's id to the winner forever;
  -- undoing the merge puts the loser back, and an id still pointing at the winner lands every
  -- relation to the restored record on the WRONG record. The alias is revoked rather than
  -- deleted: the merge happened, and the record of it stays.
  v_unalias := nullif(m.inverse ->> 'unalias', '')::uuid;
  if v_unalias is not null then
    update custom.record_alias a
       set revoked_at = now()
     where a.organization_id = p_organization_id and a.old_id = v_unalias
       and a.revoked_at is null;
    get diagnostics v_revoked = row_count;
    if v_revoked = 0 then
      raise exception 'The undo of "%" says the id % must stop resolving, and there is no live alias for it. Nothing here is half done — the restore above is in this same transaction and goes back with this refusal.', m.verb, v_unalias
        using errcode = '02000',
              hint = 'HIS-8 / T5: an undo that could not put the id back would leave every relation to the restored record pointing at the record it was merged into.';
    end if;
  end if;

  update history.migration_log l
     set undone_at = now(),
         undone_by = coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid()))
   where l.organization_id = p_organization_id and l.id = p_log_id;

  return jsonb_build_object('undone', p_log_id, 'verb', m.verb, 'kind', v_kind,
                            'record_id', v_target, 'version_after', v_ver,
                            'also_restored', v_back, 'ids_unaliased', v_revoked, 'at', now());
end;
$function$;

CREATE OR REPLACE FUNCTION history.retention_set(p_organization_id uuid, p_table_id uuid, p_days integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_floor integer;
  v_kind  text;
  v_owner oid;
begin
  -- THE DOOR, ONCE. It reads custom/system_enabled through custom.store_is_open and admits
  -- the role that owns custom.record while the switch is off.
  perform custom.assert_store_door(p_organization_id, 'history.retention_set');

  -- THE GUARD, NAMED IN THE BODY — with the door's OWN two arms, not a narrower copy of one
  -- of them. `custom.store_is_open` is the knob read (custom/system_enabled); the owner is
  -- read from the catalogue so this can never drift from the table it guards.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if not custom.store_is_open(p_organization_id)
     and not pg_has_role(custom.caller_role(), v_owner, 'member') then
    raise exception 'The custom data store is switched off, so retention was not changed.'
      using errcode = '42501',
            hint = 'custom/system_enabled resolves false and this caller does not own custom.record. Nothing was written. The switch checklist turns the knob on; a caller never does.';
  end if;

  if p_organization_id is null or p_table_id is null then
    raise exception 'history.retention_set: the organization and the table are both required — the store is keyed (organization_id, id).'
      using errcode = '22004';
  end if;

  select r.data_class into v_kind
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id;
  if v_kind is null then
    raise exception 'There is no table % in this organization.', p_table_id
      using errcode = '02000', hint = 'Nothing was changed.';
  end if;
  if v_kind <> 'table' then
    raise exception 'Retention is set on a table, and % is a %.', p_table_id, v_kind
      using errcode = '22023',
            hint = 'HIS-2: retention is a property of a Table (REC-1), so every record of that table is kept for the same time. A single record does not keep its own history rule.';
  end if;

  -- HIS-1 / HIS-2: HOW LONG, never WHETHER.
  if p_days is null or p_days <= 0 then
    raise exception 'History cannot be switched off for a table — % is not a length of time to keep it for.', coalesce(p_days::text, 'nothing')
      using errcode = '23514',
            hint = 'HIS-1 and HIS-2: everything that happens is recorded, always; what a table chooses is how LONG the record is kept, and the shortest that can be is this organization''s retention floor. Ask for the floor (history.retention_floor_days) and set that if you want the minimum.';
  end if;

  v_floor := history.retention_floor_days(p_organization_id);
  if p_days < v_floor then
    raise exception 'This table would keep its history for % days, and nothing here is kept for less than %.', p_days, v_floor
      using errcode = '23514',
            hint = format('HIS-2 / HIS-3: %s days is this organization''s retention floor. Set this table to %s or more. The floor itself only ever goes up (history.retention_floor_raise), so there is no way round this by lowering it first.', v_floor, v_floor);
  end if;

  perform custom.record_update(p_organization_id, p_table_id,
                               jsonb_build_object('retention_days', p_days));
  return p_days;
end;
$function$;

CREATE OR REPLACE FUNCTION hr.export_finish(p_organization_id uuid, p_export_id uuid, p_lines jsonb, p_artifact_file_id uuid, p_artifact_sha256 text, p_total_hours text, p_total_amount text, p_adjustment_ids uuid[], p_disputes_carried jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_export hr.payroll_export%rowtype;
  v_count  integer;
begin
  select * into v_export from hr.payroll_export pe
   where pe.id = p_export_id and pe.organization_id = p_organization_id;
  if not found then
    perform platform.refuse_not_found(format('not_found: export %s', p_export_id));
  end if;
  if v_export.delivery_state <> 'generated' then
    raise exception 'hr_state_conflict: export % is %, and lines are written once at generation',
      p_export_id, v_export.delivery_state using errcode = 'P0001';
  end if;
  if exists (select 1 from hr.payroll_export_line pel where pel.payroll_export_id = p_export_id) then
    raise exception 'hr_state_conflict: export % already has lines; the line set is append-only and written once',
      p_export_id using errcode = 'P0001';
  end if;

  perform hr.arm_write();

  insert into hr.payroll_export_line (
    payroll_export_id, employment_id, employee_number, external_employee_id, work_date,
    workweek_id, position_assignment_id, job_title_snapshot, earning_code, external_earning_code,
    hours_category, hours, rate, amount, jurisdiction_key, original_pay_period_id,
    source_work_interval_ids, source_version, rule_version_ids, engine_key, engine_version,
    calc, computed_at, organization_id, created_by)
  select p_export_id,
         (l ->> 'employment_id')::uuid,
         l ->> 'employee_number',
         l ->> 'external_employee_id',
         (l ->> 'work_date')::date,
         (l ->> 'workweek_id')::uuid,
         nullif(l ->> 'position_assignment_id','')::uuid,
         l ->> 'job_title_snapshot',
         l ->> 'earning_code',
         l ->> 'external_earning_code',
         l ->> 'hours_category',
         (l ->> 'hours')::numeric,
         nullif(l ->> 'rate','')::numeric,
         nullif(l ->> 'amount','')::numeric,
         l ->> 'jurisdiction_key',
         nullif(l ->> 'original_pay_period_id','')::uuid,
         coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(
                     coalesce(l -> 'source_work_interval_ids','[]'::jsonb)) x), '{}'::uuid[]),
         coalesce((l ->> 'source_version')::integer, 1),
         coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(
                     coalesce(l -> 'rule_version_ids','[]'::jsonb)) x), '{}'::uuid[]),
         coalesce(l ->> 'engine_key', 'hr.export'),
         coalesce(l ->> 'engine_version', 'v1'),
         '{}'::jsonb,
         now(),
         p_organization_id,
         auth.uid()
    from jsonb_array_elements(p_lines) l;

  get diagnostics v_count = row_count;

  update hr.payroll_export
     set line_count = v_count,
         total_hours = nullif(p_total_hours,'')::numeric,
         total_amount = nullif(p_total_amount,'')::numeric,
         artifact_file_id = p_artifact_file_id,
         artifact_sha256 = p_artifact_sha256,
         includes_adjustment_ids = coalesce(p_adjustment_ids, '{}'::uuid[]),
         metadata = coalesce(metadata,'{}'::jsonb)
                    || jsonb_build_object('disputes_carried', coalesce(p_disputes_carried,'[]'::jsonb))
   where id = p_export_id;

  -- §4.4 — a generated export moves the period to `exported`. The transition trigger allows
  -- approved → exported and nothing else, so a period already `exported` is left alone rather
  -- than re-transitioned (a second attempt before acknowledgment is legitimate; §4.5).
  update hr.pay_period
     set state = 'exported', exported_at = now()
   where id = v_export.pay_period_id
     and organization_id = p_organization_id
     and state = 'approved';

  perform set_config('hr.privileged_write', '', true);
  return v_count;
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_export_claim(p_organization_id uuid, p_pay_period_id uuid, p_export_format text, p_idempotency_key text, p_includes_pii boolean DEFAULT false, p_supersedes_export_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(export_id uuid, export_version integer, replayed boolean, supersedes_export_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  -- 🚨 SERVER CONNECTION ONLY (1062). aidream reaches this under acting_as_user: its own pool
  -- (session_user 'postgres') with SET LOCAL ROLE authenticated + the caller's JWT claims. A
  -- PostgREST call arrives as session_user 'authenticator' and is refused here, so no client can
  -- hand this door anything — the payroll export is server-computed, full stop.
  if session_user is distinct from 'postgres' then
    raise exception 'hr_export_server_only: public.hr_export_claim is called by the AI Matrx server, never directly by a client'
      using errcode = '42501',
            hint = 'Start an export through POST /hr/exports; the server computes and finishes the file.';
  end if;
  if v_uid is null then
    raise exception 'hr_capability_denied: a payroll export is claimed by a signed-in person'
      using errcode = '42501';
  end if;
  if not hr.capability(v_uid, 'payroll.export', null, current_date, p_organization_id) then
    raise exception 'hr_capability_denied: caller lacks payroll.export in organization %', p_organization_id
      using errcode = '42501';
  end if;
  if coalesce(p_includes_pii, false)
     and not hr.capability(v_uid, 'payroll.export_pii', null, current_date, p_organization_id) then
    raise exception 'hr_capability_denied: caller lacks payroll.export_pii in organization %', p_organization_id
      using errcode = '42501';
  end if;
  return query
    select c.export_id, c.export_version, c.replayed, c.supersedes_export_id
      from hr.export_claim(p_organization_id, p_pay_period_id, p_export_format, p_idempotency_key,
                           p_includes_pii, p_supersedes_export_id) c;
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_export_finish(p_organization_id uuid, p_export_id uuid, p_lines jsonb, p_artifact_file_id uuid, p_artifact_sha256 text, p_total_hours text, p_total_amount text, p_adjustment_ids uuid[], p_disputes_carried jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_claimant uuid;
begin
  -- 🚨 SERVER CONNECTION ONLY (1062). aidream reaches this under acting_as_user: its own pool
  -- (session_user 'postgres') with SET LOCAL ROLE authenticated + the caller's JWT claims. A
  -- PostgREST call arrives as session_user 'authenticator' and is refused here, so no client can
  -- hand this door anything — the payroll export is server-computed, full stop.
  if session_user is distinct from 'postgres' then
    raise exception 'hr_export_server_only: public.hr_export_finish is called by the AI Matrx server, never directly by a client'
      using errcode = '42501',
            hint = 'Start an export through POST /hr/exports; the server computes and finishes the file.';
  end if;
  if v_uid is null then
    raise exception 'hr_capability_denied: a payroll export is finished by a signed-in person'
      using errcode = '42501';
  end if;
  if not hr.capability(v_uid, 'payroll.export', null, current_date, p_organization_id) then
    raise exception 'hr_capability_denied: caller lacks payroll.export in organization %', p_organization_id
      using errcode = '42501';
  end if;
  select pe.actor_user_id into v_claimant
    from hr.payroll_export pe
   where pe.id = p_export_id and pe.organization_id = p_organization_id;
  if found and v_claimant is distinct from v_uid then
    raise exception 'hr_capability_denied: export % was claimed by someone else; only its claimant writes its lines', p_export_id
      using errcode = '42501';
  end if;
  -- not found → hr.export_finish raises its own named not_found.
  return hr.export_finish(p_organization_id, p_export_id, p_lines, p_artifact_file_id,
                          p_artifact_sha256, p_total_hours, p_total_amount, p_adjustment_ids,
                          p_disputes_carried);
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_leave_lead_days(p_key text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS integer[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    if not (auth.role() = 'service_role' or session_user = 'postgres') then
      raise exception 'hr_leave_lead_days: no signed-in caller' using errcode = '42501';
    end if;
  elsif p_organization_id is null or not hr._has_any_standing(v_uid, p_organization_id) then
    raise exception 'hr_leave_lead_days: caller has no standing in organization %', p_organization_id
      using errcode = '42501';
  end if;
  return hr._leave_lead_days(p_key, p_organization_id);
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_record_access_audit(p_organization_id uuid, p_action text, p_target_token text, p_purpose text, p_basis text, p_granted boolean, p_target_ids uuid[] DEFAULT '{}'::uuid[], p_row_count integer DEFAULT NULL::integer, p_subject_employment_id uuid DEFAULT NULL::uuid, p_sensitivity_tier text DEFAULT 'confidential'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid        uuid := auth.uid();
  v_actor_emp  uuid;
begin
  if p_organization_id is null then
    raise exception 'hr_record_access_audit: an audit row belongs to an organization'
      using errcode = '22023';
  end if;

  if v_uid is null then
    -- THE ENGINE LANE (worker, accrual fan-out): the server's own session only.
    if not (auth.role() = 'service_role' or session_user = 'postgres') then
      raise exception 'hr_record_access_audit: no signed-in caller' using errcode = '42501';
    end if;
    return hr._record_access_audit(
      p_organization_id => p_organization_id, p_action => p_action,
      p_target_token => p_target_token, p_purpose => p_purpose, p_basis => p_basis,
      p_granted => p_granted, p_target_ids => coalesce(p_target_ids, '{}'::uuid[]),
      p_row_count => p_row_count, p_subject_employment_id => p_subject_employment_id,
      p_sensitivity_tier => p_sensitivity_tier, p_actor_type => 'automation');
  end if;

  -- 🚨 A SIGNED-IN CALLER WRITES ONLY INTO AN ORGANIZATION THEY HAVE STANDING IN, about a subject
  -- who belongs to it. The actor is auth.uid(); the actor employment is derived, not supplied.
  if not hr._has_audit_standing(v_uid, p_organization_id) then
    raise exception 'hr_record_access_audit: caller has no standing in organization %', p_organization_id
      using errcode = '42501';
  end if;
  if p_subject_employment_id is not null and not exists (
       select 1 from hr.employment em
        where em.id = p_subject_employment_id and em.organization_id = p_organization_id) then
    raise exception 'hr_record_access_audit: subject employment % is not in organization %',
      p_subject_employment_id, p_organization_id using errcode = '42501';
  end if;

  select em.id into v_actor_emp
    from hr.employment em
    join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid
     and em.organization_id = p_organization_id
     and em.deleted_at is null and e.deleted_at is null
   order by em.created_at
   limit 1;

  return hr._record_access_audit(
    p_organization_id => p_organization_id, p_action => p_action,
    p_target_token => p_target_token, p_purpose => p_purpose, p_basis => p_basis,
    p_granted => p_granted, p_target_ids => coalesce(p_target_ids, '{}'::uuid[]),
    p_row_count => p_row_count, p_subject_employment_id => p_subject_employment_id,
    p_sensitivity_tier => p_sensitivity_tier,
    p_actor_type => 'hr_admin', p_actor_employment_id => v_actor_emp, p_actor_user_id => v_uid);
end
$function$;

CREATE OR REPLACE FUNCTION iam.api_key_create(p_organization_id uuid, p_name text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_org_name text;
  v_service_user_id uuid := gen_random_uuid();
  v_key_id text;
  v_secret text;
  v_api_key text;
  v_display text;
  v_row iam.api_keys%ROWTYPE;
  v_attempts integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'api_key_create: authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'api_key_create: a key name is required';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'api_key_create: expires_at must be in the future';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM iam.memberships m
    WHERE m.user_id = v_caller
      AND m.container_type = 'organization'
      AND m.container_id = p_organization_id
      AND m.role = 'owner'
      AND m.status = 'active'
      AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'api_key_create: only an organization OWNER may create API keys'
      USING ERRCODE = '42501';
  END IF;

  SELECT o.name INTO v_org_name FROM iam.organizations o WHERE o.id = p_organization_id;
  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'api_key_create: unknown organization %', p_organization_id;
  END IF;

  LOOP
    v_key_id := iam._api_key_base62(extensions.gen_random_bytes(9));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM iam.api_keys k WHERE k.key_id = v_key_id);
    v_attempts := v_attempts + 1;
    IF v_attempts > 5 THEN
      RAISE EXCEPTION 'api_key_create: could not allocate a unique key_id';
    END IF;
  END LOOP;

  v_secret  := iam._api_key_base62(extensions.gen_random_bytes(32));
  v_api_key := 'mx_live_' || v_key_id || '_' || v_secret;
  v_display := left(v_api_key, 12) || '…' || right(v_api_key, 4);

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token,
    reauthentication_token, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_service_user_id,
    'authenticated', 'authenticated', NULL, NULL, NULL,
    jsonb_build_object('provider', 'api_key', 'providers', jsonb_build_array('api_key')),
    jsonb_build_object(
      'full_name', 'api-key:' || btrim(p_name) || '@' || v_org_name,
      'matrx_identity', 'api_key_service',
      'api_key_name', btrim(p_name),
      'organization_id', p_organization_id
    ),
    now(), now(), '', '', '', '', '', '', '', '', true
  );

  INSERT INTO iam.memberships (
    organization_id, container_type, container_id, user_id, role, status,
    created_by, metadata
  ) VALUES (
    p_organization_id, 'organization', p_organization_id, v_service_user_id,
    'member', 'active', v_caller,
    jsonb_build_object('api_key_service', true)
  );

  INSERT INTO iam.api_keys (
    organization_id, key_id, secret_hash, display_prefix, name,
    service_user_id, status, expires_at, created_by
  ) VALUES (
    p_organization_id, v_key_id,
    encode(extensions.digest(convert_to(v_api_key, 'utf8'), 'sha256'), 'hex'),
    v_display, btrim(p_name), v_service_user_id, 'active', p_expires_at, v_caller
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'api_key', v_api_key,
    'key_id', v_row.key_id,
    'display_prefix', v_row.display_prefix,
    'name', v_row.name,
    'organization_id', v_row.organization_id,
    'service_user_id', v_row.service_user_id,
    'status', v_row.status,
    'expires_at', v_row.expires_at,
    'created_at', v_row.created_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION iam.api_key_revoke(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_row iam.api_keys%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'api_key_revoke: authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM iam.api_keys WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'api_key_revoke: unknown API key %', p_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM iam.memberships m
    WHERE m.user_id = v_caller
      AND m.container_type = 'organization'
      AND m.container_id = v_row.organization_id
      AND m.role = 'owner'
      AND m.status = 'active'
      AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'api_key_revoke: only an organization OWNER may revoke API keys'
      USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'revoked' THEN
    RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status, 'revoked_at', v_row.revoked_at);
  END IF;

  UPDATE iam.api_keys
     SET status = 'revoked', revoked_at = now(), updated_by = v_caller
   WHERE id = p_id
  RETURNING * INTO v_row;

  UPDATE iam.memberships
     SET deleted_at = now(), updated_by = v_caller
   WHERE user_id = v_row.service_user_id
     AND container_type = 'organization'
     AND container_id = v_row.organization_id
     AND deleted_at IS NULL;

  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status, 'revoked_at', v_row.revoked_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.industry_curator_grant(p_user uuid, p_industry uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS iam.industry_curators
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid; v_row iam.industry_curators; v_industry_org uuid;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_admin(v_actor);
    -- organization_id: a curator grant is a CHILD of the industry it grants
    -- curatorship over — inherit the parent row's organization_id, never a
    -- default or the caller's personal org.
    SELECT organization_id INTO v_industry_org FROM iam.industries WHERE id = p_industry;
    IF v_industry_org IS NULL THEN
        RAISE EXCEPTION 'organization_required: industry % not found', p_industry;
    END IF;
    INSERT INTO iam.industry_curators(user_id, industry_id, granted_by, organization_id)
    VALUES (p_user, p_industry, v_actor, v_industry_org)
    ON CONFLICT (user_id, industry_id) DO UPDATE SET granted_by = EXCLUDED.granted_by, deleted_at = NULL
    RETURNING * INTO v_row;
    INSERT INTO rag.library_audit_log(actor_user_id, action, industry_id, detail, organization_id)
    VALUES (v_actor, 'industry_curator_grant', p_industry, jsonb_build_object('user', p_user), v_industry_org);
    RETURN v_row;
END; $function$;

CREATE OR REPLACE FUNCTION public.industry_curator_revoke(p_user uuid, p_industry uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid; v_industry_org uuid;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_admin(v_actor);
    -- organization_id: the audit row is about a specific industry — inherit
    -- its organization_id, read before the curator row is archived.
    SELECT organization_id INTO v_industry_org FROM iam.industries WHERE id = p_industry;
    IF v_industry_org IS NULL THEN
        RAISE EXCEPTION 'organization_required: industry % not found', p_industry;
    END IF;
    -- Delete means archive (2026-09-27): the grant is archived; a later
    -- industry_curator_grant for the same person and industry revives it.
    UPDATE iam.industry_curators SET deleted_at = now()
     WHERE user_id = p_user AND industry_id = p_industry AND deleted_at IS NULL;
    INSERT INTO rag.library_audit_log(actor_user_id, action, industry_id, detail, organization_id)
    VALUES (v_actor, 'industry_curator_revoke', p_industry, jsonb_build_object('user', p_user), v_industry_org);
END; $function$;

CREATE OR REPLACE FUNCTION public.industry_set_active(p_industry uuid, p_active boolean, p_actor uuid DEFAULT NULL::uuid)
 RETURNS iam.industries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid; v_row iam.industries;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_admin(v_actor);
    UPDATE iam.industries SET is_active = p_active, updated_at = now()
     WHERE id = p_industry
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'industry % not found', p_industry;
    END IF;
    -- organization_id: inherit from the just-updated industry row (parent) —
    -- never re-derived independently.
    INSERT INTO rag.library_audit_log(actor_user_id, action, industry_id, detail, organization_id)
    VALUES (v_actor, CASE WHEN p_active THEN 'industry_reactivate' ELSE 'industry_deactivate' END,
            p_industry, jsonb_build_object('is_active', p_active), v_row.organization_id);
    RETURN v_row;
END; $function$;

CREATE OR REPLACE FUNCTION public.library_publish(p_entity_type text, p_entity_id uuid, p_audience text, p_industry_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS platform.entity_grants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'rag', 'iam'
AS $function$
declare v_actor uuid; v_lib uuid; v_row platform.entity_grants;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  perform public._library_assert_admin(v_actor);
  v_lib := public.system_org_id('library');
  if v_lib is null then raise exception 'Matrx Library org not configured (system_orgs.key=''library'')'; end if;
  if public._library_entity_owner(p_entity_type, p_entity_id) <> v_lib then
    raise exception '% % is not a Matrx Library resource', p_entity_type, p_entity_id;
  end if;
  perform public._library_publish_gate(p_entity_type, p_entity_id, p_audience);
  select * into v_row from platform.entity_grants
   where entity_type = p_entity_type and entity_id = p_entity_id and audience = p_audience
     and industry_id is not distinct from p_industry_id and organization_id is not distinct from p_organization_id
   limit 1;
  if v_row.id is null then
    insert into platform.entity_grants(entity_type, entity_id, audience, industry_id, organization_id, granted_by)
    values (p_entity_type, p_entity_id, p_audience, p_industry_id, p_organization_id, v_actor)
    returning * into v_row;
  end if;
  -- Acting organization: the Matrx Library org, which this door required the resource to
  -- belong to before it would publish it. p_organization_id is the org being granted it.
  perform public._library_audit(v_actor, v_lib, 'grant_publish', p_entity_type, p_entity_id,
                                p_industry_id, p_organization_id,
                                jsonb_build_object('audience', p_audience));
  return v_row;
end $function$;

CREATE OR REPLACE FUNCTION public.library_subscribe(p_entity_type text, p_entity_id uuid, p_organization_id uuid DEFAULT NULL::uuid, p_target jsonb DEFAULT NULL::jsonb, p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'rag', 'iam', 'seo', 'web'
AS $function$
declare v_actor uuid; v_row platform.entity_grants; v_status text; v_result jsonb := '{}'::jsonb; v_via text; v_org uuid := p_organization_id;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  if v_org is null and p_entity_type = 'seo_starter_pack' and p_target ? 'site_id' then
    select s.organization_id into v_org from web.site s where s.id = (p_target->>'site_id')::uuid and s.deleted_at is null;
  end if;
  if v_org is null then raise exception 'library: organization required' using errcode = '22023'; end if;
  if v_actor is null or not exists (
      select 1 from iam.organization_member om where om.organization_id = v_org and om.user_id = v_actor) then
    raise exception 'not authorized: caller is not a member of org %', v_org using errcode = '42501';
  end if;

  if p_entity_type = 'data_store' then
    if not exists (select 1 from rag.data_stores s where s.id = p_entity_id and s.discoverable and s.deleted_at is null) then
      raise exception 'store % is not discoverable', p_entity_id;
    end if;

  elsif p_entity_type = 'seo_starter_pack' then
    select status into v_status from seo.starter_pack where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'seo_pack_not_found: %', p_entity_id; end if;
    v_via := public.library_entitlement('seo_starter_pack', p_entity_id, v_org);
    if not coalesce(public.is_admin()
            or v_via = 'organization'
            or (v_via in ('industry', 'global') and v_status = 'ratified'), false) then
      raise exception 'library: organization % is not entitled to pack % (status %, via %)',
        v_org, p_entity_id, v_status, coalesce(v_via, 'none') using errcode = '42501';
    end if;

  elsif p_entity_type = 'rulebook' then
    select status into v_status from platform.rulebook where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'rulebook_not_found: %', p_entity_id; end if;
    v_via := public.library_entitlement('rulebook', p_entity_id, v_org);
    if not coalesce(public.is_admin()
            or v_via = 'organization'
            or (v_via in ('industry', 'global') and v_status = 'active'), false) then
      raise exception 'library: organization % is not entitled to Rulebook % (status %, via %)',
        v_org, p_entity_id, v_status, coalesce(v_via, 'none') using errcode = '42501';
    end if;

  else
    raise exception 'library: % cannot be subscribed to', p_entity_type;
  end if;

  select * into v_row from platform.entity_grants
   where entity_type = p_entity_type and entity_id = p_entity_id and audience = 'organization' and organization_id = v_org
   limit 1;
  if v_row.id is null then
    insert into platform.entity_grants(entity_type, entity_id, audience, organization_id, granted_by)
    values (p_entity_type, p_entity_id, 'organization', v_org, v_actor)
    returning * into v_row;
  end if;

  if p_entity_type = 'seo_starter_pack' and p_target ? 'site_id' then
    -- KI-030: `rule_ids` is gone — a pack's meaning is items now, so `item_ids`
    -- selects every part including the dimension values.
    v_result := seo.adopt_starter_pack(
      (p_target->>'site_id')::uuid, p_entity_id,
      case when p_target ? 'include' then (select array_agg(x) from jsonb_array_elements_text(p_target->'include') x) end,
      case when p_target ? 'topic_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'topic_ids') x) end,
      coalesce((p_target->>'seed_guidelines')::boolean, true),
      p_target->'geo_places', p_target->'geo_place_ids',
      case when p_target ? 'item_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'item_ids') x) end,
      coalesce((p_target->>'reset')::boolean, false));
  elsif p_entity_type = 'rulebook' then
    v_result := platform.materialize_library_rulebook(p_entity_id, v_org, v_actor, coalesce(p_target, '{}'::jsonb));
  end if;

  -- Acting organization: the subscribing organization, whose membership this door just
  -- checked the caller against. It is also the organization acted upon.
  perform public._library_audit(v_actor, v_org, 'self_subscribe', p_entity_type, p_entity_id,
                                null, v_org,
                                jsonb_build_object('target', coalesce(p_target, '{}'::jsonb) - 'geo_places' - 'geo_place_ids'));
  return v_result || jsonb_build_object('grant_id', v_row.id, 'subscribed', true, 'organization_id', v_org);
end $function$;

CREATE OR REPLACE FUNCTION public.library_unsubscribe(p_entity_type text, p_entity_id uuid, p_organization_id uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'rag', 'iam'
AS $function$
declare v_actor uuid;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  if v_actor is null or not exists (
      select 1 from iam.organization_member om where om.organization_id = p_organization_id and om.user_id = v_actor) then
    raise exception 'not authorized: caller is not a member of org %', p_organization_id using errcode = '42501';
  end if;
  delete from platform.entity_grants
   where entity_type = p_entity_type and entity_id = p_entity_id and audience = 'organization' and organization_id = p_organization_id;
  -- Acting organization: the organization whose membership this door just checked.
  perform public._library_audit(v_actor, p_organization_id, 'self_unsubscribe', p_entity_type,
                                p_entity_id, null, p_organization_id, '{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.list_scope_type_items(p_scope_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_org_id uuid;
begin
  select st.organization_id
  into v_org_id
  from context.scope_types st
  where st.id = p_scope_type_id
    and st.deleted_at is null;

  if v_org_id is null then
    perform platform.refuse_not_found(format('active scope type %s not found', p_scope_type_id));
  end if;

  if (auth.role() = 'service_role' or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for organization %', v_org_id
      using errcode = '42501';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', ci.id,
      'key', ci.key,
      'slug', ci.slug,
      'display_name', ci.display_name,
      'description', ci.description,
      'category', ci.category,
      'value_type', ci.value_type,
      'fetch_hint', ci.fetch_hint,
      'sensitivity', ci.sensitivity,
      'status', ci.status,
      'tags', ci.tags,
      'sort_order', ci.sort_order,
      'custom_component', ci.custom_component,
      'allowed_reference_types', ci.allowed_reference_types,
      'max_items', ci.max_items,
      'allowed_scope_type_ids', ci.allowed_scope_type_ids,
      'reference_source', ci.reference_source
    )
    order by ci.sort_order, ci.display_name
  )
  into v_result
  from context.context_items ci
  where ci.scope_type_id = p_scope_type_id
    and ci.is_active = true;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_scope_types(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
  end if;
  select jsonb_agg(
    to_jsonb(st.*) || jsonb_build_object(
      'parent_type_label', pt.label_singular,
      'scope_count', (select count(*) from context.scopes s where s.scope_type_id = st.id and s.deleted_at is null)
    ) order by st.sort_order, st.label_singular
  ) into v_result
  from context.scope_types st
  left join context.scope_types pt on st.parent_type_id = pt.id
  where st.organization_id = p_org_id and st.deleted_at is null;
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_scopes(p_org_id uuid, p_type_id uuid DEFAULT NULL::uuid, p_parent_scope_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
  end if;
  select jsonb_agg(
    to_jsonb(s) || jsonb_build_object(
      'type_label', st.label_singular,
      'type_label_plural', st.label_plural,
      'type_icon', st.icon,
      'type_color', st.color,
      'child_count', (select count(*) from context.scopes c where c.parent_scope_id = s.id and c.deleted_at is null),
      'assignment_count', (select count(*) from platform.associations_live a where a.target_type = 'scope' and a.target_id = s.id)
    ) order by s.sort_order, s.name
  ) into v_result
  from context.scopes s
  join context.scope_types st on s.scope_type_id = st.id
  where s.organization_id = p_org_id
    and s.deleted_at is null and st.deleted_at is null
    and s.id in (select context._readable_scope_ids())
    and (p_type_id is null or s.scope_type_id = p_type_id)
    and ((p_parent_scope_id is null and s.parent_scope_id is null) or s.parent_scope_id = p_parent_scope_id);
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_udt_dataset_templates(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if iam.has_org_access(p_org_id) is not true then raise exception 'not authorized for organization %',p_org_id using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t)
      || jsonb_build_object('is_platform', t.organization_id <> p_org_id)
      || jsonb_build_object('fields',coalesce((
      select jsonb_agg(to_jsonb(f) order by f.field_order) from workbench.udt_dataset_template_fields f where f.template_id=t.id
    ),'[]'::jsonb)) order by (t.organization_id <> p_org_id), lower(t.name))
    from workbench.udt_dataset_templates t
   where t.organization_id in (p_org_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
     and t.is_active),'[]'::jsonb);
end; $function$;

CREATE OR REPLACE FUNCTION platform._stamp_actor_tier()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  has_upd_tier     boolean;
  has_upd_sys      boolean;
  has_crt_tier     boolean;
  has_crt_sys      boolean;
  has_confirmation boolean;
  has_conf_by      boolean;
  has_conf_at      boolean;
  table_scope_id   uuid;
  tier             text;
  raw_tier         text;
  sys              text;
  agent_id         uuid;
  patch            jsonb := '{}'::jsonb;
  row_json         jsonb;
  org              uuid;
  actor            uuid;
  born             text;
  col_flags        text;
BEGIN
  -- Read live from pg_attribute on every firing: this is the catalog, not a cache,
  -- so it already sees a column added earlier in this transaction.  Every column this
  -- function writes is tested for on its own, because the write below is now a direct
  -- field assignment and a missing column is an error rather than a silent skip.
  -- WRITE-PERF-4: the same seven questions, asked of the catalogue once per relation per
  -- statement instead of once per ROW, and cleared by `platform.memo_ddl_forgets_the_shape`
  -- the moment ANY DDL runs -- so the promise this comment makes (a column added earlier in
  -- this transaction is seen) is still kept, by an event trigger rather than by paying for a
  -- catalogue scan on every row. Without that event trigger this would be a cache pretending
  -- to be the catalogue and it would not ship.
  col_flags := platform.memo_col_flags(TG_RELID,
                 ARRAY['updated_by_tier', 'updated_by_system', 'created_by_tier',
                       'created_by_system', 'confirmation', 'confirmed_by', 'confirmed_at']);
  has_upd_tier     := substr(col_flags, 1, 1) = 't';
  has_upd_sys      := substr(col_flags, 2, 1) = 't';
  has_crt_tier     := substr(col_flags, 3, 1) = 't';
  has_crt_sys      := substr(col_flags, 4, 1) = 't';
  has_confirmation := substr(col_flags, 5, 1) = 't';
  has_conf_by      := substr(col_flags, 6, 1) = 't';
  has_conf_at      := substr(col_flags, 7, 1) = 't';

  -- Column-guarded: inert on every table that does not carry what it writes. That guard is what
  -- makes this trigger legal on a `component`, where _stamp_actor is forbidden (db-rules §6d-1).
  IF NOT COALESCE(has_upd_tier, false)
     AND NOT (COALESCE(has_crt_tier, false) AND TG_OP = 'INSERT')
     AND NOT (COALESCE(has_confirmation, false) AND TG_OP = 'INSERT') THEN
    RETURN NEW;
  END IF;

  raw_tier := platform.declared_actor_tier();
  sys      := platform.actor_system();
  -- DD-211: WHICH AGENT, when one is writing. Three current_setting() reads, no SPI,
  -- no catalog probe -- the per-row cost FEATURE.md §2 measures is a round trip, and
  -- this is not one.
  agent_id := platform.declared_actor_agent();

  -- Chair R-A/R-B: the RAW declaration first, so a client's x-matrx-actor-tier header reaches the
  -- tier columns. platform.actor_tier() remains the fallback for the *_by_tier columns only, so
  -- nothing that worked before wf_044 changes.
  tier := COALESCE(raw_tier, platform.actor_tier());

  -- wf_051 / V-45 §6: an agent must name itself; a person needs no system. `platform.actor_system()`
  -- resolves to `platform.declared_actor_system()` alone (matrx-frontend's
  -- dd131_actor_system_no_person_header.sql) — NULL here means genuinely undeclared, on whichever
  -- channel this write arrived on. A `human` tier is exempt on purpose: its NULL system is the
  -- chair's ruling, not a gap.
  IF tier IN ('ai', 'code') AND sys IS NULL THEN
    RAISE EXCEPTION
      'This write declares actor_tier=%, but names no actor_system. An agent or automated write must say WHICH agent/system it is (x-matrx-actor-system on the client channel, or the app.actor_system GUC on a server channel) — a person''s write needs no system at all, but "an AI did it" with no name is not provenance. Table: %.%',
      tier, TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  -- DD-211: a PERSON'S write carries no agent. "A person did this" and "agent X did
  -- this" are two different authors, and a row cannot have both -- accepting the pair
  -- would let a human-tier write borrow an agent's born-confirmed exception.
  IF tier = 'human' AND agent_id IS NOT NULL THEN
    RAISE EXCEPTION
      'This write declares actor_tier=human AND an actor_agent (%). A person''s write carries no agent: either the person is the author (drop the x-matrx-actor-agent header / the app.actor_agent GUC) or the agent is (declare actor_tier=ai and the agent that is running). Table: %.%',
      agent_id, TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(has_upd_tier, false) THEN
    patch := patch || jsonb_build_object('updated_by_tier', tier);
    IF COALESCE(has_upd_sys, false) THEN
      patch := patch || jsonb_build_object('updated_by_system', sys);
    END IF;
  END IF;
  IF COALESCE(has_crt_tier, false) AND TG_OP = 'INSERT' THEN
    patch := patch || jsonb_build_object('created_by_tier', tier);
    IF COALESCE(has_crt_sys, false) THEN
      patch := patch || jsonb_build_object('created_by_system', sys);
    END IF;
  END IF;

  -- ---- DD-131: the confirmation branch, INSERT only (wf_046/wf_048, unchanged by wf_051). -----
  -- UPDATE never moves the value here: every transition is a named action with its own door (§3).
  IF COALESCE(has_confirmation, false) AND TG_OP = 'INSERT' THEN
    table_scope_id := platform._confirmation_admission(TG_RELID);

    IF table_scope_id IS NULL THEN
      -- The column exists but this table is not admitted (or is not registered at all). Write
      -- the only value that is TRUE of such a row -- nobody has confirmed it -- so the flag can
      -- be turned off again without bricking the table (wf_048).
      born  := 'unconfirmed';
      patch := patch || jsonb_build_object('confirmation', born);
      IF COALESCE(has_conf_by, false) THEN patch := patch || jsonb_build_object('confirmed_by', NULL); END IF;
      IF COALESCE(has_conf_at, false) THEN patch := patch || jsonb_build_object('confirmed_at', NULL); END IF;
    ELSE
      row_json := to_jsonb(NEW);
      org   := NULLIF(row_json ->> 'organization_id', '')::uuid;
      actor := COALESCE(NULLIF(current_setting('app.user_id', true), '')::uuid, auth.uid());

      IF raw_tier = 'human' THEN
        -- A person declared themselves the author. Writing it is standing behind it.
        born := 'confirmed';
      ELSIF raw_tier IN ('ai', 'code') THEN
        -- Born confirmed ONLY when a person decided that in advance, at BOTH rungs (§3.3, §4.2
        -- keys 1 and 2). They are a conjunction across different rungs, so no precedence race.
        --
        -- DD-198 shape: an ARRAY of {kind, id}. DD-211: the rungs are WRITTEN OUT at the call
        -- site -- the table always, and the AGENT too when one is writing -- so that both the
        -- array guard and the rung census can READ which rungs this read stands on. A local
        -- variable here made this call site unreadable to both (dd211b's header). knob_resolve
        -- filters every candidate override by the knob's own `overridable_by`, so naming both
        -- rungs on both keys can never cross them over.
        IF  COALESCE((platform.knob_resolve('records', 'confirmation.agent_write_born_confirmed',
                        org, NULL,
                        CASE WHEN agent_id IS NULL
                             THEN jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id))
                             ELSE jsonb_build_array(jsonb_build_object('kind', 'agent', 'id', agent_id),
                                                    jsonb_build_object('kind', 'table', 'id', table_scope_id))
                        END))::text::boolean, false)
        AND COALESCE((platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed',
                        org, NULL,
                        CASE WHEN agent_id IS NULL
                             THEN jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id))
                             ELSE jsonb_build_array(jsonb_build_object('kind', 'agent', 'id', agent_id),
                                                    jsonb_build_object('kind', 'table', 'id', table_scope_id))
                        END))::text::boolean, false)
        THEN
          born := 'confirmed';
        ELSE
          born := 'unconfirmed';
        END IF;
      ELSE
        -- raw_tier IS NULL: a server channel that declared nothing. Fail SAFE and fail LOUD.
        born := 'unconfirmed';
        PERFORM platform._report_undeclared_confirmation_write(TG_RELID, org, actor);
      END IF;

      -- Unconditional: no API, no RPC, no client and no agent may pass `confirmation`,
      -- `confirmed_by` or `confirmed_at` (§2.2 rule 3).
      patch := patch || jsonb_build_object('confirmation', born);
      IF born = 'confirmed' THEN
        IF COALESCE(has_conf_by, false) THEN patch := patch || jsonb_build_object('confirmed_by', actor); END IF;
        IF COALESCE(has_conf_at, false) THEN patch := patch || jsonb_build_object('confirmed_at', now()); END IF;
      ELSE
        IF COALESCE(has_conf_by, false) THEN patch := patch || jsonb_build_object('confirmed_by', NULL); END IF;
        IF COALESCE(has_conf_at, false) THEN patch := patch || jsonb_build_object('confirmed_at', NULL); END IF;
      END IF;
    END IF;
  END IF;

  IF patch = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  -- DD-184: apply the patch by DIRECT FIELD ASSIGNMENT. `jsonb_populate_record(NEW, patch)`
  -- rebuilds the whole row from a TupleDesc cached at this call site's first firing in the
  -- transaction, which silently NULLs any column added after that.  Each key is present only
  -- when the column exists (checked against pg_attribute above), so no assignment can raise.
  IF patch ? 'updated_by_tier'   THEN NEW.updated_by_tier   := patch ->> 'updated_by_tier';   END IF;
  IF patch ? 'updated_by_system' THEN NEW.updated_by_system := patch ->> 'updated_by_system'; END IF;
  IF patch ? 'created_by_tier'   THEN NEW.created_by_tier   := patch ->> 'created_by_tier';   END IF;
  IF patch ? 'created_by_system' THEN NEW.created_by_system := patch ->> 'created_by_system'; END IF;
  IF patch ? 'confirmation'      THEN NEW.confirmation      := patch ->> 'confirmation';      END IF;
  IF patch ? 'confirmed_by'      THEN NEW.confirmed_by      := (patch ->> 'confirmed_by')::uuid; END IF;
  IF patch ? 'confirmed_at'      THEN NEW.confirmed_at      := (patch ->> 'confirmed_at')::timestamptz; END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION platform.assert_same_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_col    text := tg_argv[0];
  v_target text := tg_argv[1];
  v_fk     uuid;
  v_theirs uuid;
  v_mine   uuid;
begin
  execute format('select ($1).%I, ($1).organization_id', v_col) into v_fk, v_mine using new;
  if v_fk is null then return new; end if;
  execute format('select t.organization_id from %s t where t.id = $1', v_target)
    into v_theirs using v_fk;
  if v_theirs is null then return new; end if;
  if v_theirs is distinct from v_mine then
    raise exception 'assert_same_org: %.% = % belongs to organization %, but this row belongs to organization %',
      tg_table_name, v_col, v_fk, v_theirs, v_mine
      using errcode = 'check_violation',
            hint = 'A row may only reference a row of the same organization. The initiating operation supplies organization_id explicitly; nothing here assigns it (NO-BACKSTOP, db-rules §2/§6e).';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.emit_pending_assist(p_organization_id uuid, p_source_kind text, p_source_key text, p_title text, p_body text, p_action jsonb, p_surface_name text, p_entity_type text, p_entity_id uuid, p_dedupe_key text, p_expires_at timestamp with time zone, p_priority smallint, p_evidence jsonb, p_confidence real, p_reasoning text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_constraint text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'emit_pending_assist requires a signed-in user'; END IF;
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'emit_pending_assist requires organization_id'; END IF;
  IF NOT iam.has_org_access(p_organization_id) THEN
    RAISE EXCEPTION 'emit_pending_assist requires access to organization %', p_organization_id USING ERRCODE = '42501';
  END IF;
  IF p_dedupe_key IS NULL OR btrim(p_dedupe_key) = '' THEN RAISE EXCEPTION 'emit_pending_assist requires dedupe_key'; END IF;
  IF p_source_key IS NULL OR btrim(p_source_key) = '' THEN RAISE EXCEPTION 'emit_pending_assist requires source_key'; END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'emit_pending_assist requires title'; END IF;
  IF p_action IS NULL THEN RAISE EXCEPTION 'emit_pending_assist requires action'; END IF;

  INSERT INTO platform.assists (
    user_id, organization_id, created_by, source_kind, source_key, title, body,
    action, surface_name, entity_type, entity_id, dedupe_key, expires_at, priority,
    evidence, confidence, reasoning, first_seen_at, status
  ) VALUES (
    v_uid, p_organization_id, v_uid, COALESCE(NULLIF(btrim(p_source_kind), ''), 'deterministic'),
    p_source_key, p_title, p_body, p_action, p_surface_name, p_entity_type, p_entity_id,
    p_dedupe_key, p_expires_at, COALESCE(p_priority, 0), p_evidence, p_confidence,
    p_reasoning, now(), 'pending'
  ) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint IS DISTINCT FROM 'assists_dedupe_pending_key' THEN RAISE; END IF;
  UPDATE platform.assists
     SET title = p_title, body = p_body, action = p_action, expires_at = p_expires_at,
         priority = COALESCE(p_priority, 0), evidence = p_evidence, confidence = p_confidence,
         reasoning = p_reasoning, occurrences = COALESCE(occurrences, 1) + 1, updated_at = now()
   WHERE dedupe_key = p_dedupe_key AND status = 'pending' AND deleted_at IS NULL
     AND user_id = v_uid AND organization_id = p_organization_id
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.label_decision_item(p_item_id uuid, p_answer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_row     record;
  v_label   text;
  v_agreed  boolean;
  v_choices text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to label a decision answer.' USING ERRCODE = '42501';
  END IF;

  SELECT jv.id, jv.question, jv.verdict, jv.metadata, jv.organization_id
    INTO v_row
    FROM platform.judge_verdict jv
   WHERE jv.id = p_item_id AND jv.subject_kind = 'decision_answer' AND jv.deleted_at IS NULL;
  -- Labelling is for members of the item's own organization. Not found and not yours read the
  -- same, so the answer never reveals that another organization's item exists.
  IF NOT FOUND OR v_row.organization_id IS NULL
     OR v_row.organization_id NOT IN (SELECT iam.my_orgs()) THEN
    RAISE EXCEPTION 'No decision answer % is yours to label.', p_item_id USING ERRCODE = 'P0002';
  END IF;

  v_label := platform.normalize_decision_label(v_row.metadata, p_answer);
  IF v_label IS NULL THEN
    SELECT COALESCE(string_agg(format('%s (%s)', e->>'key', COALESCE(e->>'label', e->>'key')), ', '),
                    'none recorded')
      INTO v_choices
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_row.metadata->'options') = 'array'
                                     THEN v_row.metadata->'options' ELSE '[]'::jsonb END) e;
    RAISE EXCEPTION '% is not an answer to %. Use one of: %.',
      quote_literal(COALESCE(p_answer, '')), quote_literal(v_row.question), v_choices
      USING ERRCODE = '22023';
  END IF;

  v_agreed := v_row.verdict = v_label;
  UPDATE platform.judge_verdict
     SET authority_kind     = 'human_feedback',
         authority_verdict  = v_label,
         authority_ref_type = 'user',
         authority_ref_id   = v_uid,
         agreed             = v_agreed,
         agreement_at       = now(),
         updated_by         = v_uid,
         updated_at         = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'question', v_row.question,
    'verdict', v_row.verdict,
    'authority_verdict', v_label,
    'agreed', v_agreed);
END
$function$;

CREATE OR REPLACE FUNCTION platform.relation_declaration(p_organization_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f         record;
  v_flavor  text;
  v_mode    text;
  v_card    text;
  v_on_del  text;
  v_bind    text;
  v_targets uuid[];
  v_owned   boolean;
  v_table   uuid;
  v_class   text;
  v_key     text;
  v_hit     jsonb;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- THE CALLER, BEFORE THE FIRST READ. A field document describes a table's shape, so the
  -- wall comes first and the table second — and both are asked before this function admits
  -- that the field exists, so a foreign id and an invented one answer identically.
  perform custom.assert_client_may_reach(p_organization_id, 'platform.relation_declaration');

  -- THE SAME FIELD, ALREADY DECLARED IN THIS TRANSACTION. Every relation edge written by one
  -- statement points through the same Field, so this was asked once per edge and answered the
  -- same thing every time. The entry carries the Table this Field belongs to and its class, so
  -- the THIRD guard below still runs on a hit exactly as it runs on a miss: what is remembered
  -- is the READ, never the DECISION.
  v_key := 'rd:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_field_id::text, '-');
  v_hit := platform.memo_s_get(v_key)::jsonb;
  if v_hit is not null then
    v_table := nullif(v_hit ->> 'table', '')::uuid;
    v_class := v_hit ->> 'class';
    if v_table is not null and coalesce(v_class, '') <> 'kernel' then
      perform custom.assert_may_know_table(p_organization_id, v_table, 'platform.relation_declaration');
    end if;
    return v_hit -> 'out';
  end if;

  select r.id, r.organization_id, r.data into f
    from custom.record r
   where r.id = p_field_id
     and (r.organization_id = p_organization_id or r.data_class = 'kernel')
     and r.deleted_at is null
   limit 1;
  if not found then
    raise exception 'there is no field % in this organization', p_field_id using errcode = '23503';
  end if;
  v_table := nullif(f.data ->> 'entity_definition_id', '')::uuid;
  select r.data_class into v_class from custom.record r
   where r.id = p_field_id and (r.organization_id = p_organization_id or r.data_class = 'kernel')
   limit 1;
  -- A kernel field belongs to a standard table nobody was shared; asking the table question
  -- of it would refuse every caller for a shape the platform itself declares.
  if v_table is not null and coalesce(v_class, '') <> 'kernel' then
    perform custom.assert_may_know_table(p_organization_id, v_table, 'platform.relation_declaration');
  end if;
  if coalesce(f.data ->> 'type', '') <> 'relation' then
    raise exception 'the field % behaves as %, so it declares no relation',
      coalesce(f.data ->> 'name', f.data ->> 'label', p_field_id::text),
      coalesce(nullif(f.data ->> 'type', ''), 'nothing')
      using errcode = '23514',
            hint = 'FLD-1 / REL-10: only a field whose behavior is `relation` carries a relation. A list field points at an options Table and is not this.';
  end if;

  -- REL-1. OWNERSHIP IS THE CONTAINED TABLE'S FACT, NOT THE FIELD'S.
  if f.data ? 'flavor' or f.data -> 'config' ? 'flavor' then
    raise exception 'the field % cannot declare whether the relation owns what it points at',
      coalesce(f.data ->> 'name', p_field_id::text)
      using errcode = '23514',
            hint = 'REL-1 / V-39: ownership is ONE fact, stored once - on the table being pointed at, as `contained_by_relation`, because it is that table''s records that are or are not contained. Every field pointing at it reads the same answer, so two fields can never disagree about it. Declare it on the table.';
  end if;

  v_mode := lower(coalesce(nullif(f.data -> 'config' ->> 'target_mode', ''), 'one'));
  if not (v_mode = any (platform.relation_target_modes())) then
    raise exception 'the field % points at "%", and a relation points at one table, several, or any',
      coalesce(f.data ->> 'name', p_field_id::text), v_mode
      using errcode = '23514',
            hint = 'REL-8: target_mode is one of ' || array_to_string(platform.relation_target_modes(), ', ') || '.';
  end if;

  if v_mode = 'one' then
    v_targets := array[nullif(f.data ->> 'relation_target', '')::uuid];
    if v_targets[1] is null then
      raise exception 'the field % points at one table and does not say which',
        coalesce(f.data ->> 'name', p_field_id::text) using errcode = '23514', hint = 'FLD-13 / REL-8: relation_target.';
    end if;
  elsif v_mode = 'several' then
    select array_agg((t #>> '{}')::uuid) into v_targets
      from jsonb_array_elements(coalesce(f.data -> 'config' -> 'target_tables', '[]'::jsonb)) t;
    if v_targets is null or array_length(v_targets, 1) is null then
      raise exception 'the field % points at several tables and names none of them',
        coalesce(f.data ->> 'name', p_field_id::text)
        using errcode = '23514',
              hint = 'REL-8: target_mode `several` carries config.target_tables, the list of tables it may point at. One table is target_mode `one`; no list at all is target_mode `any`.';
    end if;
  else
    v_targets := null;   -- `any`: polymorphic without restriction
  end if;

  v_owned := false;
  if v_mode = 'one' then
    select coalesce((t.data ->> 'contained_by_relation')::boolean, false) into v_owned
      from custom.record t
     where t.id = v_targets[1] and t.deleted_at is null
       and (t.organization_id = p_organization_id or t.data_class = 'kernel')
     limit 1;
  end if;
  v_flavor := case when coalesce(v_owned, false) then 'owned' else 'referenced' end;

  v_card := case when coalesce((f.data ->> 'relation_max')::integer, 0) = 1
                 then 'at_most_one' else 'many' end;

  v_on_del := lower(coalesce(nullif(f.data ->> 'on_target_delete', ''),
                             case when v_flavor = 'owned' then 'cascade' else 'set_null' end));
  if not (v_on_del = any (platform.relation_on_delete_actions())) then
    raise exception 'the field % says "%" happens when the thing it points at is deleted',
      coalesce(f.data ->> 'name', p_field_id::text), v_on_del
      using errcode = '23514',
            hint = 'REL-2: on_target_delete is one of ' || array_to_string(platform.relation_on_delete_actions(), ', ') || ', and it is a property of its own - an owned relation may restrict, and a referenced one may cascade.';
  end if;

  v_bind := lower(coalesce(nullif(f.data -> 'config' ->> 'binding', ''), 'live'));
  if not (v_bind = any (platform.relation_bindings())) then
    raise exception 'the field % is bound "%" to what it points at',
      coalesce(f.data ->> 'name', p_field_id::text), v_bind
      using errcode = '23514',
            hint = 'REL-3: binding is one of ' || array_to_string(platform.relation_bindings(), ', ') || '. `live` follows the target; `snapshot` freezes a copy in the relation''s own payload at write time.';
  end if;

  v_hit := jsonb_build_object(
    'field_id',    f.id,
    'key',         coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'),
    'flavor',      v_flavor,
    'on_delete',   v_on_del,
    'binding',     v_bind,
    'ordered',     coalesce((f.data -> 'config' ->> 'ordered')::boolean, false),
    'loops',       coalesce((f.data -> 'config' ->> 'loops')::boolean, false),
    'carries',     coalesce((f.data -> 'config' ->> 'carries')::boolean, v_flavor = 'owned'),
    'carries_max', coalesce(nullif(f.data -> 'config' ->> 'carries_max', ''), 'editor'),
    'cardinality', v_card,
    'max',         greatest(coalesce((f.data ->> 'relation_max')::integer, 1), 1),
    'target_mode', v_mode,
    'target_tables', case when v_targets is null then null else to_jsonb(v_targets) end,
    'inverse_key', nullif(f.data ->> 'inverse_key', ''));

  perform platform.memo_s_put(v_key, jsonb_build_object('table', v_table, 'class', v_class,
                                                        'out', v_hit)::text);
  return v_hit;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relation_field(p_organization_id uuid, p_record_id uuid, p_field_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table uuid;
  v_field uuid;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- The record first, at viewer, and before this answers whether it exists.
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'platform.relation_field',
                                        'viewer'::public.permission_level, 'record');
  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_table is null then
    raise exception 'there is no record % in this organization', p_record_id using errcode = '23503';
  end if;
  select f.id into v_field
    from custom.record f
   where f.deleted_at is null
     and (f.organization_id = p_organization_id or f.data_class = 'kernel')
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') = p_field_key
   limit 1;
  if v_field is null then
    raise exception 'this record''s table has no field called "%"', p_field_key
      using errcode = '23503',
            hint = 'REL-10: a relation''s `role` IS the field key, so a role with no field behind it would be an edge nothing declares. Declare the field first.';
  end if;
  return v_field;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.unified_data_store_set(p_organization_id uuid, p_on boolean, p_acting_user_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid := coalesce(p_acting_user_id, auth.uid());
  v_door     jsonb;
  v_written  jsonb;
  v_readback jsonb;
  v_key      text;
begin
  perform platform.assert_may_operate_unified_data_ramp(p_organization_id, 'Turning this organization''s data store on or off');

  if v_actor is null then
    raise exception 'platform.unified_data_store_set: no acting user. The caller must pass p_acting_user_id — the person it has already established is a platform admin — because auth.uid() is null on a server lane and the override would otherwise be written by nobody.'
      using errcode = 'P0001';
  end if;
  if p_organization_id is null or p_on is null then
    raise exception 'platform.unified_data_store_set: name the organization and say on or off. Nothing was changed.'
      using errcode = '22004';
  end if;
  -- ARGS-RULED (2026-09-21). THE ACTOR IS WHOEVER RAN IT, AND THEY MAY NOT NAME SOMEBODY ELSE.
  -- `p_acting_user_id` is written into the override's audit trail as the person who flipped this
  -- organization's data store, and nothing compared it to the caller: an owner could turn the
  -- store on or off and record another administrator as having done it. GUARD-STAMPS closed the
  -- same class on custom.portal_principal_bind on 2026-09-21. The server lane keeps its reason
  -- for passing one — auth.uid() is null there — and that is exactly what is_trusted_backend is.
  if p_acting_user_id is not null
     and not iam.is_trusted_backend()
     and p_acting_user_id is distinct from (select auth.uid()) then
    raise exception 'platform.unified_data_store_set: the actor on this switch is whoever ran it. Nothing was changed.'
      using errcode = '42501',
            hint = 'p_acting_user_id exists so a SERVER lane, where auth.uid() is null, can say who it is acting for. A signed-in caller is already named by their own session.';
  end if;

  -- BOTH HALVES, IN ONE STATEMENT. `system_enabled` is the switch every person
  -- and every client reads; `code_paths_enabled` is the mirror aidream's server
  -- kill switch reads. Writing one and not the other is how an organization came
  -- to be on the store with its agent tool still refusing (lane NAV-FIX). The
  -- loop makes it impossible to add a third and forget it.
  foreach v_key in array array['system_enabled', 'code_paths_enabled'] loop
    -- THE DOOR QUESTION IS STILL ASKED, exactly as platform.knob_override_set asks it.
    v_door := platform.knob_write_door_for('custom.' || v_key);
    if (v_door ->> 'ok')::boolean
       and (v_door ->> 'set_door') is distinct from 'platform.knob_override_set' then
      raise exception 'platform.unified_data_store_set: custom.% is written through %, not through this screen. That is where its own permission gate and its own audit trail live.',
        v_key, v_door ->> 'set_door'
        using errcode = 'P0001';
    end if;

    v_written := platform._knob_override_write(
      'custom', v_key, 'organization', p_organization_id, p_organization_id,
      to_jsonb(p_on),
      coalesce(p_note, 'Unified-data switch screen, the store itself, ' || (case when p_on then 'ON' else 'OFF' end)),
      v_actor);

    if v_written is null or not coalesce((v_written ->> 'ok')::boolean, false) then
      raise exception 'platform.unified_data_store_set: the override was NOT written for custom.% — the knob writer answered %. Nothing has changed and this organization has not moved.',
        v_key, coalesce(v_written::text, 'null')
        using errcode = 'P0001',
              hint = 'platform.knob_override_set RETURNS a refusal rather than raising one, so a discarded result looks exactly like success. This is the failure the consumer switch used to swallow.';
    end if;

    -- READ IT BACK. The screen may only say "switched on" when the database agrees.
    v_readback := platform.knob_resolve('custom', v_key, p_organization_id, null, null);
    if v_readback is distinct from to_jsonb(p_on) then
      raise exception 'platform.unified_data_store_set: wrote % for custom.% but platform.knob_resolve still answers % for organization %. The switch did not take.',
        to_jsonb(p_on), v_key, coalesce(v_readback::text, 'null'), p_organization_id
        using errcode = 'P0001';
    end if;
  end loop;

  return platform.unified_data_store_state(p_organization_id);
end;
$function$;

CREATE OR REPLACE FUNCTION platform.upsert_output_feedback(p_subject_type text, p_subject_id uuid, p_verdict text DEFAULT NULL::text, p_prose text DEFAULT NULL::text, p_request_id text DEFAULT NULL::text, p_surface_name text DEFAULT NULL::text, p_original_content text DEFAULT NULL::text, p_corrected_content text DEFAULT NULL::text, p_corrected_ref_type text DEFAULT NULL::text, p_corrected_ref_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS platform.output_feedback
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_row platform.output_feedback;
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_verdict is not null and p_verdict not in ('positive','negative','mixed') then
    raise exception 'invalid verdict %', p_verdict using errcode = '22023';
  end if;
  -- THE DOOR: feedback is written only on an output the person can read.
  if not platform._output_feedback_subject_readable(p_subject_type, p_subject_id) then
    raise exception 'not_readable: you cannot read % %, so you cannot rate it',
      p_subject_type, p_subject_id using errcode = '42501';
  end if;

  -- The rated output's organization wins. An explicit org is accepted only
  -- when the subject has none we can read; a disagreeing one is refused.
  v_org := platform._output_feedback_subject_org(p_subject_type, p_subject_id);
  if v_org is not null and p_organization_id is not null and p_organization_id <> v_org then
    raise exception 'organization_conflict: % % belongs to organization %, not %',
      p_subject_type, p_subject_id, v_org, p_organization_id using errcode = '22023';
  end if;
  v_org := coalesce(v_org, p_organization_id);
  if v_org is null then
    raise exception 'organization_required: no organization for % % — pass p_organization_id',
      p_subject_type, p_subject_id using errcode = '23502';
  end if;

  insert into platform.output_feedback as f (
    subject_type, subject_id, verdict, prose, request_id, surface_name,
    original_content, corrected_content, corrected_ref_type, corrected_ref_id,
    corrected_at, organization_id, created_by
  ) values (
    p_subject_type, p_subject_id,
    coalesce(p_verdict, 'mixed'), p_prose, p_request_id, p_surface_name,
    p_original_content, p_corrected_content, p_corrected_ref_type, p_corrected_ref_id,
    case when p_corrected_content is not null then now() end,
    v_org, v_uid
  )
  on conflict (subject_type, subject_id, created_by) do update set
    verdict           = coalesce(p_verdict, f.verdict),
    prose             = coalesce(p_prose, f.prose),
    request_id        = coalesce(p_request_id, f.request_id),
    surface_name      = coalesce(p_surface_name, f.surface_name),
    -- The ORIGINAL is written once and never overwritten: the first capture is
    -- the model's actual output. Later edits only move `corrected_content`.
    original_content  = coalesce(f.original_content, p_original_content),
    corrected_content = coalesce(p_corrected_content, f.corrected_content),
    corrected_ref_type= coalesce(p_corrected_ref_type, f.corrected_ref_type),
    corrected_ref_id  = coalesce(p_corrected_ref_id, f.corrected_ref_id),
    corrected_at      = case when p_corrected_content is not null then now()
                             else f.corrected_at end,
    organization_id   = v_org,
    deleted_at        = null
  returning * into v_row;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.upsert_unit_purpose(p_unit_type text, p_unit_id uuid, p_title text, p_statement text, p_grounding_tag text, p_inputs jsonb DEFAULT NULL::jsonb, p_outputs jsonb DEFAULT NULL::jsonb, p_safe_conditions jsonb DEFAULT NULL::jsonb, p_position integer DEFAULT 0)
 RETURNS platform.purpose
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org        uuid;
  v_purpose_id uuid;
  v_row        platform.purpose;
  v_existing   platform.purpose;
begin
  -- (0447 diff #1) 'mandate' joins the whitelist.
  if p_unit_type not in ('agent','workflow','tool','mandate') then
    raise exception 'upsert_unit_purpose: % is not a unit that can carry a purpose (agent|workflow|tool|mandate)', p_unit_type
      using errcode = 'check_violation';
  end if;
  if p_grounding_tag not in ('H','V','A') then
    raise exception 'upsert_unit_purpose: grounding_tag must be H (human) | V (AI-drafted, human-verified) | A (AI-only), got %', p_grounding_tag
      using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_statement),'') = '' then
    raise exception 'upsert_unit_purpose: a purpose needs both a title and a statement — an empty purpose is the same as none'
      using errcode = 'check_violation';
  end if;

  -- The unit owns the org; a purpose can never live in a different tenant than
  -- the thing it describes.
  -- (0447 diff #2) mandate rows live in agent.mandate.
  if p_unit_type = 'agent' then
    select organization_id into v_org from agent.definition where id = p_unit_id;
  elsif p_unit_type = 'workflow' then
    select organization_id into v_org from workflow.definition where id = p_unit_id;
  elsif p_unit_type = 'mandate' then
    select platform.purpose_mandate_organization(p_unit_id) into v_org;
  else
    select organization_id into v_org from tool.definition where id = p_unit_id;
  end if;

  if v_org is null then
    perform platform.refuse_not_found(format('upsert_unit_purpose: no %s with id %s (or it carries no organization)', p_unit_type, p_unit_id));
  end if;

  -- A signed-in caller must be able to edit the unit. The server lane
  -- (service role, auth.uid() null) is already the trusted writer — the same
  -- posture every service-role write on this platform has.
  if auth.uid() is not null and not iam.has_access(p_unit_type, p_unit_id, 'editor') then
    raise exception 'upsert_unit_purpose: you cannot edit this %', p_unit_type
      using errcode = 'insufficient_privilege';
  end if;

  select a.source_id into v_purpose_id
    from platform.associations_live a
   where a.source_type = 'purpose'
     and a.target_type = p_unit_type
     and a.target_id   = p_unit_id
     and a.role        = 'served_by'
     and coalesce(a.position, 0) = p_position
   limit 1;

  if v_purpose_id is not null then
    select * into v_existing from platform.purpose where id = v_purpose_id;

    -- THE ANTI-STACKING GUARD (Engram §4.5). An AI-only statement never
    -- overwrites a human or human-verified one. Loud, and a no-op rather than a
    -- failure: the caller (a describer sweep) is doing its job correctly, the
    -- answer is simply "a human already grounded this one".
    if p_grounding_tag = 'A' and v_existing.grounding_tag in ('H','V') then
      raise warning '[purpose] refusing to overwrite % purpose % on %:% with an AI-only statement (anti-stacking, Engram 4.5)',
        v_existing.grounding_tag, v_existing.id, p_unit_type, p_unit_id;
      return v_existing;
    end if;

    update platform.purpose
       set title           = p_title,
           statement       = p_statement,
           grounding_tag   = p_grounding_tag,
           inputs          = coalesce(p_inputs,  inputs),
           outputs         = coalesce(p_outputs, outputs),
           safe_conditions = coalesce(p_safe_conditions, safe_conditions)
     where id = v_purpose_id
     returning * into v_row;
    return v_row;
  end if;

  -- No purpose at this position yet. One primary per unit: refuse to mint a
  -- SECOND position-0 purpose behind the caller's back.
  if p_position = 0 and exists (
    select 1 from platform.associations_live a
     where a.source_type='purpose' and a.target_type=p_unit_type
       and a.target_id=p_unit_id and a.role='served_by' and coalesce(a.position,0)=0
  ) then
    raise exception 'upsert_unit_purpose: %:% already has a primary purpose', p_unit_type, p_unit_id
      using errcode = 'unique_violation';
  end if;

  insert into platform.purpose (title, statement, grounding_tag, inputs, outputs, safe_conditions, organization_id)
  values (p_title, p_statement, p_grounding_tag,
          coalesce(p_inputs,'[]'::jsonb), coalesce(p_outputs,'[]'::jsonb),
          p_safe_conditions, v_org)
  returning * into v_row;

  insert into platform.associations (source_type, source_id, target_type, target_id, role, position, organization_id)
  values ('purpose', v_row.id, p_unit_type, p_unit_id, 'served_by', p_position, v_org);

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.provision_mcp_server(p_slug text, p_name text, p_vendor text, p_category mcp_server_category, p_transport mcp_transport, p_auth_strategy mcp_auth_strategy, p_organization_id uuid, p_endpoint_url text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_icon_url text DEFAULT NULL::text, p_color text DEFAULT NULL::text, p_docs_url text DEFAULT NULL::text, p_website_url text DEFAULT NULL::text, p_status mcp_server_status DEFAULT 'beta'::mcp_server_status, p_is_official boolean DEFAULT false, p_oauth_scopes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_server_id uuid := gen_random_uuid();
    v_executor text := 'mcp.' || p_slug;
    v_bundle_id uuid := gen_random_uuid();
    v_lister_id uuid := gen_random_uuid();
    v_lister_name text := 'bundle:list_' || p_slug;
    v_executor_cfg jsonb;
    v_actor_id uuid := auth.uid();
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND public.is_super_admin() IS NOT TRUE THEN
        RAISE EXCEPTION 'provision_mcp_server: super-admin access is required'
            USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM iam.organizations WHERE id = p_organization_id) THEN
        RAISE EXCEPTION 'provision_mcp_server: unknown organization %', p_organization_id
            USING ERRCODE = '22023';
    END IF;
    IF p_slug IS NULL OR p_slug !~ '^[a-z0-9][a-z0-9-]*$' THEN
        RAISE EXCEPTION 'Slug must match ^[a-z0-9][a-z0-9-]*$ (got: %)', p_slug;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tool.executor WHERE name = 'matrx-ai-core' AND is_active) THEN
        RAISE EXCEPTION 'Required active executor is missing: matrx-ai-core';
    END IF;
    IF EXISTS (SELECT 1 FROM tool.mcp_server WHERE slug = p_slug) THEN
        RAISE EXCEPTION 'MCP server slug already exists: %', p_slug;
    END IF;
    IF EXISTS (SELECT 1 FROM tool.executor WHERE name = v_executor) THEN
        RAISE EXCEPTION 'Executor already exists: %', v_executor;
    END IF;
    IF EXISTS (SELECT 1 FROM tool.bundle WHERE name = p_slug) THEN
        RAISE EXCEPTION 'Bundle name already exists: %', p_slug;
    END IF;
    IF EXISTS (SELECT 1 FROM tool.definition WHERE name = v_lister_name) THEN
        RAISE EXCEPTION 'Lister tool name already exists: %', v_lister_name;
    END IF;

    INSERT INTO tool.mcp_server (
        id, organization_id, created_by, slug, name, vendor, category, description, transport, auth_strategy,
        endpoint_url, icon_url, color, docs_url, website_url,
        status, is_official, is_featured, has_remote, has_local, supports_mcp_apps,
        oauth_scopes, sort_order, visibility
    ) VALUES (
        v_server_id, p_organization_id, v_actor_id, p_slug, p_name, p_vendor, p_category, p_description,
        p_transport, p_auth_strategy, p_endpoint_url, p_icon_url, p_color, p_docs_url, p_website_url,
        p_status, p_is_official, false,
        p_transport IN ('http','sse'), p_transport = 'stdio', false,
        p_oauth_scopes, 100, 'internal'
    );

    v_executor_cfg := jsonb_build_object(
        'transport', p_transport::text,
        'server_slug', p_slug,
        'endpoint_url', COALESCE(p_endpoint_url, ''),
        'auth_strategy', p_auth_strategy::text
    );
    INSERT INTO tool.executor (
        name, description, mcp_server_id, config, is_active,
        organization_id, created_by, visibility
    ) VALUES (
        v_executor, 'MCP server runtime - ' || p_name, v_server_id, v_executor_cfg, true,
        p_organization_id, v_actor_id, 'internal'
    );

    INSERT INTO tool.definition (
        id, name, description, parameters, category, source_kind, tool_group,
        is_active, gating, organization_id, visibility, created_by
    ) VALUES (
        v_lister_id, v_lister_name,
        'Discovery tool - loads the ' || p_name || ' MCP server tool catalog into the active toolset.',
        '{}'::jsonb, 'mcp', 'native', 'core', true, '[]'::jsonb, p_organization_id,
        'internal', v_actor_id
    );

    PERFORM platform.upsert_unit_purpose(
        'tool', v_lister_id, 'Load the ' || p_name || ' tool catalog',
        'Load the registered ' || p_name || ' MCP server tool catalog into the active agent toolset on demand.', 'A'
    );

    INSERT INTO tool.binding (tool_id, executor_name, is_active, organization_id)
    VALUES (v_lister_id, 'matrx-ai-core', true, p_organization_id)
    ON CONFLICT (tool_id, executor_name) DO UPDATE SET is_active = true, updated_at = now();

    INSERT INTO tool.bundle (
        id, name, description, is_system, created_by, lister_tool_id, metadata,
        is_active, organization_id, visibility
    ) VALUES (
        v_bundle_id, p_slug, 'Auto-managed bundle for the ' || p_name || ' MCP server.',
        true, v_actor_id, v_lister_id,
        jsonb_build_object('kind','mcp','server_slug',p_slug,'server_id',v_server_id::text),
        true, p_organization_id, 'internal'
    );

    RETURN jsonb_build_object(
        'server_id', v_server_id, 'server_slug', p_slug, 'executor', v_executor,
        'bundle_id', v_bundle_id, 'bundle_name', p_slug,
        'lister_tool_id', v_lister_id, 'lister_name', v_lister_name,
        'next_step', 'POST /api/mcp/servers/' || v_server_id || '/refresh to fetch the catalog'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rename_folder(p_folder_id uuid, p_new_path text, p_new_parent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_owner UUID;
    v_old_path TEXT;
    v_new_name TEXT;
    v_descendants_files INT;
    v_descendants_folders INT;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('folder', p_folder_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to rename folder %', p_folder_id USING ERRCODE = '42501';
    END IF;
    IF p_new_parent_id IS NOT NULL AND auth.uid() IS NOT NULL
       AND NOT iam.has_access('folder', p_new_parent_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to move into folder %', p_new_parent_id USING ERRCODE = '42501';
    END IF;
    SELECT created_by, folder_path INTO v_owner, v_old_path
      FROM files.folders WHERE id = p_folder_id AND deleted_at IS NULL;
    IF v_owner IS NULL THEN
        perform platform.refuse_not_found(format('folder %s not found', p_folder_id));
    END IF;

    p_new_path := trim(both '/' from p_new_path);
    v_new_name := split_part(p_new_path, '/', GREATEST(array_length(string_to_array(p_new_path, '/'), 1), 1));

    UPDATE files.folders
       SET folder_path = p_new_path,
           folder_name = v_new_name,
           parent_id   = COALESCE(p_new_parent_id, parent_id),
           updated_at  = now()
     WHERE id = p_folder_id;

    UPDATE files.folders
       SET folder_path = p_new_path || substring(folder_path FROM length(v_old_path) + 1),
           updated_at  = now()
     WHERE created_by = v_owner
       AND folder_path LIKE v_old_path || '/%'
       AND deleted_at IS NULL;
    GET DIAGNOSTICS v_descendants_folders = ROW_COUNT;

    PERFORM set_config('matrx.rename_primitive', 'subtree', true);
    UPDATE files.files
       SET file_path  = p_new_path || substring(file_path FROM length(v_old_path) + 1),
           updated_at = now()
     WHERE created_by = v_owner
       AND file_path LIKE v_old_path || '/%'
       AND deleted_at IS NULL;
    GET DIAGNOSTICS v_descendants_files = ROW_COUNT;
    PERFORM set_config('matrx.rename_primitive', '', true);

    RETURN jsonb_build_object(
        'old_path', v_old_path,
        'new_path', p_new_path,
        'descendant_folders', v_descendants_folders,
        'descendant_files', v_descendants_files
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_context_item(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-COVERAGE-2. The twin of public.delete_context_item, at its rung (an admin of the scope
-- type's organization). delete_context_item sets deleted_at AND is_active = false, so the restore
-- clears both: the Field comes back in use. It also finishes a Field that already came back with its
-- scope type (deleted_at clear, is_active still false from the old one-way archive).
declare
  v_org uuid;
  v_live boolean;
  v_result jsonb;
begin
  select st.organization_id, (ci.deleted_at is null and ci.is_active)
    into v_org, v_live
    from context.context_items ci
    join context.scope_types st on st.id = ci.scope_type_id
   where ci.id = p_item_id;

  if v_org is null then
    perform platform.refuse_not_found(format('context item %s not found', p_item_id));
  end if;
  if v_live then
    return jsonb_build_object('id', p_item_id, 'restored', false, 'detail', 'It is already in use.');
  end if;

  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for %', v_org
      using errcode = '42501';
  end if;

  update context.context_items
     set deleted_at = null,
         is_active = true,
         updated_at = now()
   where id = p_item_id
  returning jsonb_build_object('id', id, 'restored', true) into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restore_file(p_file_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_ok BOOLEAN := false;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('file', p_file_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to restore file %', p_file_id USING ERRCODE = '42501';
    END IF;
    UPDATE files.files SET deleted_at = NULL
     WHERE id = p_file_id AND deleted_at IS NOT NULL
    RETURNING true INTO v_ok;
    RETURN COALESCE(v_ok, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_folder(p_folder_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_folders INT;
    v_files INT;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('folder', p_folder_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to restore folder %', p_folder_id USING ERRCODE = '42501';
    END IF;
    WITH RECURSIVE descendants AS (
        SELECT id FROM files.folders WHERE id = p_folder_id
        UNION ALL
        SELECT d.id FROM files.folders d JOIN descendants ds ON d.parent_id = ds.id
    ),
    restored_folders AS (
        UPDATE files.folders SET deleted_at = NULL
         WHERE id IN (SELECT id FROM descendants) AND deleted_at IS NOT NULL
        RETURNING id
    ),
    restored_files AS (
        UPDATE files.files SET deleted_at = NULL
         WHERE parent_folder_id IN (SELECT id FROM restored_folders) AND deleted_at IS NOT NULL
        RETURNING id
    )
    SELECT (SELECT count(*) FROM restored_folders), (SELECT count(*) FROM restored_files)
    INTO v_folders, v_files;
    RETURN jsonb_build_object('folders', v_folders, 'files', v_files);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rulebook_create(p_organization_id uuid, p_name text, p_slug text, p_description text DEFAULT ''::text, p_source jsonb DEFAULT '{}'::jsonb, p_sections jsonb DEFAULT '{}'::jsonb, p_visibility text DEFAULT 'internal'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_row platform.rulebook;
  v_vis platform.visibility;
  v_bad text;
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_token uuid;
  v_token_text text;
  v_base text;
  v_slug text;
  v_constraint text;
  v_name_in_use boolean := false;
  v_attempt integer;
begin
  if v_actor is null then
    raise exception 'rulebook_create: a Rulebook belongs to the person who started it, and nobody is signed in.'
      using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'rulebook_create: name the organization this Rulebook belongs to.' using errcode = '22004';
  end if;
  if coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_slug), '') = '' then
    raise exception 'rulebook_create: a Rulebook needs a name and a slug.' using errcode = '22004';
  end if;
  begin
    v_vis := coalesce(p_visibility, 'internal')::platform.visibility;
  exception when others then
    raise exception 'rulebook_create: % is not a sharing level. Use personal, internal, link or public.', p_visibility
      using errcode = '22023';
  end;

  -- THE LADDER. The question std_insert asked, minus the platform-admin arm: a door that
  -- creates a row in somebody's name decides on the ORGANIZATION, and a platform admin
  -- creating a Rulebook is acting in an organization like anybody else.
  if not (iam.has_org_access(p_organization_id)
          or (p_organization_id in (select organization_id from iam.system_orgs where global_readable)
              and public.is_super_admin())) then
    raise exception 'rulebook_create: % is not an organization you can start a Rulebook in.', p_organization_id
      using errcode = '42501';
  end if;

  if jsonb_typeof(v_meta) is distinct from 'object' then
    raise exception 'rulebook_create: metadata is an object.' using errcode = '22023';
  end if;

  -- THE TOKEN IS TRANSPORT, NOT METADATA. Taken out before the declared-key check and before the
  -- write, so a stored `metadata` can never carry it and the declared client set stays as it was.
  v_token_text := v_meta ->> 'client_token';
  v_meta := v_meta - 'client_token';
  if v_token_text is not null then
    begin
      v_token := v_token_text::uuid;
    exception when others then
      raise exception 'rulebook_create: client_token must be a uuid.' using errcode = '22023';
    end;
  end if;

  select string_agg(k, ', ') into v_bad
    from jsonb_object_keys(v_meta) k
   where not (k = any (public._rulebook_client_metadata_keys()));
  if v_bad is not null then
    raise exception 'rulebook_create: metadata key(s) % are not written by a client. The client set is %.',
      v_bad, array_to_string(public._rulebook_client_metadata_keys(), ', ')
      using errcode = '42501';
  end if;

  -- THE REPLAY, ANSWERED BEFORE ANYTHING IS WRITTEN. A create is an intent, and one intent is one
  -- Rulebook however many times a browser says it.
  if v_token is not null then
    select r.* into v_row
      from platform.rulebook r
     where r.created_by = v_actor
       and r.client_token = v_token;
    if found then
      if v_row.organization_id is distinct from p_organization_id then
        raise exception 'rulebook_create: this create token belongs to a different organization. Start a new create.'
          using errcode = '22023';
      end if;
      return public._rulebook_json(v_row)
             || jsonb_build_object('created', false, 'name_already_in_use', false);
    end if;
  end if;

  -- WHAT THE SCREEN NEEDS IN ORDER TO SAY SOMETHING. Measured, never enforced: a name already in
  -- use is a fact about her own library, not a refusal.
  select exists (
    select 1 from platform.rulebook r
     where r.organization_id = p_organization_id
       and r.deleted_at is null
       and lower(btrim(r.name)) = lower(btrim(p_name))
  ) into v_name_in_use;

  -- THE SLUG IS THIS DOOR'S PROBLEM. The unique index is global and the client hands us a slug
  -- derived from words a person typed, so a collision is ordinary, not exceptional. Resolved
  -- against the INSERT itself rather than against a prior SELECT, because a SELECT would be a
  -- check that races.
  v_base := btrim(p_slug);
  v_slug := v_base;
  for v_attempt in 1..25 loop
    begin
      insert into platform.rulebook
        (name, slug, description, source, sections, rules, status, organization_id, visibility,
         metadata, created_by, client_token)
      values
        (btrim(p_name), v_slug, coalesce(p_description, ''),
         coalesce(p_source, '{}'::jsonb), coalesce(p_sections, '{}'::jsonb), '[]'::jsonb,
         'draft', p_organization_id, v_vis, v_meta, v_actor, v_token)
      returning * into v_row;
      return public._rulebook_json(v_row)
             || jsonb_build_object('created', true, 'name_already_in_use', v_name_in_use);
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'rulebook_client_token_unique' then
        -- Two presses landed at once. The INDEX, not a lookup, is what made one of them lose;
        -- the loser reads the winner's row and answers with it.
        select r.* into v_row
          from platform.rulebook r
         where r.created_by = v_actor
           and r.client_token = v_token;
        if found then
          if v_row.organization_id is distinct from p_organization_id then
            raise exception 'rulebook_create: this create token belongs to a different organization. Start a new create.'
              using errcode = '22023';
          end if;
          return public._rulebook_json(v_row)
                 || jsonb_build_object('created', false, 'name_already_in_use', false);
        end if;
        raise;
      end if;
      if v_constraint is distinct from 'rulebook_slug_live_unique' then
        raise;
      end if;
      -- `-2`, `-3`, ... reads as a second book of the same name. Past the tenth the counting is
      -- noise and the only job left is to land, so a random tail takes over.
      if v_attempt < 10 then
        v_slug := left(v_base, 250) || '-' || (v_attempt + 1)::text;
      else
        v_slug := left(v_base, 240) || '-' || substr(md5(gen_random_uuid()::text), 1, 8);
      end if;
    end;
  end loop;

  raise exception 'rulebook_create: could not find a free address for a Rulebook named "%" after 25 tries. Nothing was saved -- try a different name.', btrim(p_name)
    using errcode = '23505';
end;
$function$;

CREATE OR REPLACE FUNCTION public.saved_view_save(p_surface_key text, p_id uuid DEFAULT NULL::uuid, p_subject_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_set_description boolean DEFAULT false, p_definition jsonb DEFAULT NULL::jsonb, p_definition_version integer DEFAULT NULL::integer, p_visibility text DEFAULT NULL::text, p_is_default boolean DEFAULT NULL::boolean, p_sort_order numeric DEFAULT NULL::numeric, p_touch boolean DEFAULT false, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_row platform.saved_view;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_vis platform.visibility;
begin
  if v_actor is null then
    raise exception 'saved_view_save: a saved view belongs to the person who saved it, and nobody is signed in.'
      using errcode = '42501';
  end if;
  if coalesce(btrim(p_surface_key), '') = '' then
    raise exception 'saved_view_save: name the surface this view belongs to.' using errcode = '22004';
  end if;
  if p_visibility is not null then
    -- Qualified, and validated here rather than by a cast error the caller cannot read.
    begin
      v_vis := p_visibility::platform.visibility;
    exception when others then
      raise exception 'saved_view_save: % is not a sharing level. Use personal, internal, link or public.', p_visibility
        using errcode = '22023';
    end;
  end if;
  if p_definition is not null and jsonb_typeof(p_definition) is distinct from 'object' then
    raise exception 'saved_view_save: the definition of a view is an object.' using errcode = '22023';
  end if;

  -- ── CREATE ──
  if p_id is null then
    if v_name is null then
      raise exception 'saved_view_save: name the view so the team can find it again.' using errcode = '22004';
    end if;
    if p_organization_id is null then
      raise exception 'saved_view_save: name the organization this view belongs to.' using errcode = '22004';
    end if;
    -- THE LADDER. The question std_insert asked: this person may act in this organization.
    if not iam.has_org_access(p_organization_id) then
      raise exception 'saved_view_save: % is not an organization you can save a view in.', p_organization_id
        using errcode = '42501';
    end if;

    if coalesce(p_is_default, false) then
      -- One default per person per surface per subject is a PARTIAL UNIQUE INDEX, so the
      -- clear has to happen first or the database refuses the insert. Doing both inside the
      -- door makes that ordering impossible to get wrong, which is the bug the two-statement
      -- client version could always have.
      update platform.saved_view s
         set is_default = false, updated_by = v_actor
       where s.created_by = v_actor
         and s.surface_key = p_surface_key
         and s.subject_id is not distinct from p_subject_id
         and s.is_default
         and s.deleted_at is null;
    end if;

    insert into platform.saved_view
      (name, description, surface_key, subject_id, organization_id, definition,
       definition_version, visibility, is_default, sort_order, last_used_at, created_by)
    values
      (v_name,
       case when p_set_description then nullif(btrim(coalesce(p_description, '')), '') else null end,
       p_surface_key, p_subject_id, p_organization_id,
       coalesce(p_definition, '{}'::jsonb),
       coalesce(p_definition_version, 1),
       coalesce(v_vis, 'personal'::platform.visibility),
       coalesce(p_is_default, false),
       p_sort_order,
       case when p_touch then now() else null end,
       v_actor)
    returning * into v_row;

    return public._saved_view_json(v_row);
  end if;

  -- ── UPDATE ──
  -- RESOLVED BY (id, surface_key) TOGETHER. A row under another surface key reads as absent:
  -- a door never tells a caller that somebody else's row exists, and a view saved for one
  -- list surface must never be writable from another.
  select * into v_row
    from platform.saved_view s
   where s.id = p_id and s.surface_key = p_surface_key and s.deleted_at is null;
  if not found then
    return null;
  end if;

  -- THE LADDER. The exact predicate std_update carried.
  if not (v_row.created_by = v_actor
          or iam.has_access('platform_saved_view', v_row.id, 'editor'::public.permission_level)) then
    raise exception 'saved_view_save: this view is not yours to change.' using errcode = '42501';
  end if;

  if p_expected_version is not null and v_row.version <> p_expected_version then
    -- A version miss is NULL, not an error: the caller re-reads and replays, exactly as the
    -- client's guardedUpdate already does.
    return null;
  end if;

  if coalesce(p_is_default, false) and not v_row.is_default then
    update platform.saved_view s
       set is_default = false, updated_by = v_actor
     where s.created_by = v_row.created_by
       and s.surface_key = v_row.surface_key
       and s.subject_id is not distinct from v_row.subject_id
       and s.id <> v_row.id
       and s.is_default
       and s.deleted_at is null;
  end if;

  update platform.saved_view s
     set name = coalesce(v_name, s.name),
         description = case when p_set_description
                            then nullif(btrim(coalesce(p_description, '')), '')
                            else s.description end,
         definition = coalesce(p_definition, s.definition),
         definition_version = coalesce(p_definition_version, s.definition_version),
         visibility = coalesce(v_vis, s.visibility),
         is_default = coalesce(p_is_default, s.is_default),
         sort_order = coalesce(p_sort_order, s.sort_order),
         last_used_at = case when p_touch then now() else s.last_used_at end,
         updated_by = v_actor
   where s.id = v_row.id
     and s.surface_key = p_surface_key
     and s.deleted_at is null
     and (p_expected_version is null or s.version = p_expected_version)
  returning * into v_row;

  if not found then
    return null;
  end if;
  return public._saved_view_json(v_row);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sch_enqueue_manual_run(p_task_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_task_user_id uuid;
  v_task_org_id uuid;
  v_run_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- organization_id is inherited from the PARENT task being run — never
  -- chosen by this function. A manual run always belongs to the same
  -- organization as the task it runs.
  SELECT user_id, organization_id INTO v_task_user_id, v_task_org_id
  FROM scheduler.sch_task WHERE id = p_task_id;
  IF v_task_user_id IS NULL THEN
    perform platform.refuse_not_found(format('task not found: %s', p_task_id));
  END IF;
  IF v_task_user_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: caller does not own task' USING ERRCODE = '42501';
  END IF;
  IF v_task_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_required: task % has no organization to run under', p_task_id
      USING ERRCODE = 'P0001',
            HINT = 'The task row is missing organization_id; it cannot be run until repaired.';
  END IF;

  INSERT INTO scheduler.sch_run (task_id, trigger_id, user_id, status, surface, queue, due_at, organization_id)
  VALUES (p_task_id, NULL, v_task_user_id, 'queued', NULL, 'default', now(), v_task_org_id)
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$function$;

CREATE OR REPLACE FUNCTION scheduler.admin_disable_task(p_task_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_task scheduler.sch_task%rowtype;
begin
  -- Access before existence: a non-admin learns nothing about which ids exist.
  if not public.is_super_admin() then
    raise exception 'Disabling another person''s schedule needs a super admin on the admin lane (/administration).'
      using errcode = '42501';
  end if;
  if p_task_id is null then
    raise exception 'p_task_id is required' using errcode = '22023';
  end if;

  select * into v_task from scheduler.sch_task where id = p_task_id for update;
  if not found then
    raise exception 'Scheduled task % does not exist (it may have been deleted).', p_task_id
      using errcode = 'P0002';
  end if;

  update scheduler.sch_task set enabled = false where id = p_task_id;

  insert into admin.admin_audit_log
    (actor_user_id, action, target_user_id, before, after, organization_id, metadata)
  values
    ((select auth.uid()), 'scheduler_task_disable', v_task.user_id,
     jsonb_build_object('enabled', v_task.enabled),
     jsonb_build_object('enabled', false),
     v_task.organization_id,
     jsonb_build_object('task_id', v_task.id, 'title', v_task.title, 'reason', p_reason));

  return jsonb_build_object('task_id', v_task.id, 'enabled', false, 'was_enabled', v_task.enabled);
end
$function$;

CREATE OR REPLACE FUNCTION scheduler.admin_mark_run_failed(p_run_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run scheduler.sch_run%rowtype;
  v_at  timestamptz := now();
begin
  if not public.is_super_admin() then
    raise exception 'Marking another person''s run failed needs a super admin on the admin lane (/administration).'
      using errcode = '42501';
  end if;
  if p_run_id is null then
    raise exception 'p_run_id is required' using errcode = '22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'A reason is required: it becomes the run''s error message.' using errcode = '22023';
  end if;

  select * into v_run from scheduler.sch_run where id = p_run_id for update;
  if not found then
    raise exception 'Scheduled run % does not exist.', p_run_id using errcode = 'P0002';
  end if;

  update scheduler.sch_run
     set status = 'failed', finished_at = v_at, error_message = p_reason, claim_token = null
   where id = p_run_id;

  insert into admin.admin_audit_log
    (actor_user_id, action, target_user_id, before, after, organization_id, metadata)
  values
    ((select auth.uid()), 'scheduler_run_mark_failed', v_run.user_id,
     jsonb_build_object('status', v_run.status, 'finished_at', v_run.finished_at,
                        'error_message', v_run.error_message,
                        'had_claim', v_run.claim_token is not null),
     jsonb_build_object('status', 'failed', 'finished_at', v_at, 'error_message', p_reason,
                        'had_claim', false),
     v_run.organization_id,
     jsonb_build_object('run_id', v_run.id, 'task_id', v_run.task_id));

  return jsonb_build_object('run_id', v_run.id, 'status', 'failed', 'previous_status', v_run.status);
end
$function$;

CREATE OR REPLACE FUNCTION scheduler.sch_run_claim(p_task_id uuid, p_surface text, p_trigger_id uuid DEFAULT NULL::uuid, p_queue text DEFAULT NULL::text, p_lease_seconds integer DEFAULT 600)
 RETURNS scheduler.sch_run
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_task record;
  v_now timestamptz := now();
  v_lease integer := greatest(1, coalesce(p_lease_seconds, 600));
  v_row scheduler.sch_run;
begin
  if v_uid is null then
    raise exception 'You must be signed in to claim scheduled work.' using errcode = '42501';
  end if;

  select t.id, t.user_id, t.organization_id, t.next_due_at, t.queue
    into v_task
    from scheduler.sch_task t
   where t.id = p_task_id and t.deleted_at is null;

  if v_task.id is null then
    perform platform.refuse_not_found('That scheduled task no longer exists.');
  end if;
  -- "refusing to claim task %: task has no valid organization_id" — the same refusal both
  -- clients and the Python scanner already make, moved to where it cannot be skipped.
  if v_task.organization_id is null then
    raise exception 'Refusing to claim task %: it has no organization.', p_task_id
      using errcode = '23514';
  end if;
  -- The platform-admin arm leads, exactly as it does in every policy iam.apply_rls generates.
  -- Without it this door is stricter than the client write it replaced.
  if not ((select public.is_platform_admin()) or iam.has_org_access(v_task.organization_id)) then
    raise exception 'You are not a member of the organization that owns that task.'
      using errcode = '42501';
  end if;

  insert into scheduler.sch_run (
    task_id, trigger_id, user_id, organization_id, status, surface, queue,
    due_at, claimed_at, claim_token, claim_expires_at, metadata
  ) values (
    v_task.id,
    p_trigger_id,
    v_task.user_id,
    v_task.organization_id,
    'claimed',
    p_surface,
    coalesce(p_queue, v_task.queue),
    coalesce(v_task.next_due_at, v_now),
    v_now,
    -- THE MINT. The only place a claim token comes from.
    extensions.gen_random_uuid(),
    v_now + make_interval(secs => v_lease),
    jsonb_build_object('claim_protocol', 2)
  ) returning * into v_row;
  -- No exception handler on purpose: `sch_run_unique_active_per_task` must reach the caller
  -- as 23505 so the existing race classifier still works.

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.scope_system_apply(p_org_id uuid, p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  op jsonb; kind text; v_id uuid; v_type_id uuid; v_parent_id uuid; v_item_id uuid; v_scope_id uuid;
  v_template_id uuid; v_row jsonb; v_results jsonb := '[]'::jsonb; v_value jsonb; v_value_type text;
begin
  if iam.has_org_admin(p_org_id) is not true then
    raise exception 'organization admin required for %', p_org_id using errcode = '42501';
  end if;
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception 'operations must be an array' using errcode = '22023';
  end if;

  for op in select * from jsonb_array_elements(p_operations) loop
    kind := op->>'op'; v_id := null; v_type_id := null; v_parent_id := null;
    v_item_id := null; v_scope_id := null; v_template_id := null; v_row := null;

    if kind = 'upsert_scope_type' then
      if op ? 'id' then v_id := (op->>'id')::uuid; end if;
      if v_id is null then
        select id into v_id from context.scope_types
        where organization_id = p_org_id and deleted_at is null and slug = op->>'key';
      end if;
      v_parent_id := null;
      if op ? 'parent_key' then
        select id into v_parent_id from context.scope_types
        where organization_id = p_org_id and deleted_at is null and slug = op->>'parent_key';
      end if;
      if v_id is null then
        insert into context.scope_types (
          organization_id, parent_type_id, label_singular, label_plural, icon, description,
          color, sort_order, max_assignments_per_entity, default_variable_keys, slug
        ) values (
          p_org_id, v_parent_id, op->>'label_singular',
          coalesce(op->>'label_plural', (op->>'label_singular') || 's'),
          coalesce(op->>'icon', 'folder'), coalesce(op->>'description', ''),
          coalesce(op->>'color', ''), coalesce((op->>'sort_order')::smallint, 0),
          nullif(op->>'max_assignments', '')::smallint,
          coalesce(array(select jsonb_array_elements_text(op->'default_variable_keys')), '{}'),
          op->>'key'
        ) returning id into v_id;
      else
        update context.scope_types set
          parent_type_id = case when op ? 'parent_key' then v_parent_id else parent_type_id end,
          label_singular = coalesce(op->>'label_singular', label_singular),
          label_plural = coalesce(op->>'label_plural', label_plural),
          icon = coalesce(op->>'icon', icon),
          description = coalesce(op->>'description', description),
          color = coalesce(op->>'color', color),
          sort_order = coalesce((op->>'sort_order')::smallint, sort_order),
          max_assignments_per_entity = case
            when op ? 'max_assignments' then nullif(op->>'max_assignments', '')::smallint
            else max_assignments_per_entity
          end,
          updated_by = (select auth.uid()),
          updated_at = now()
        where id = v_id and organization_id = p_org_id;
      end if;
      select to_jsonb(st) into v_row from context.scope_types st where id = v_id;

    elsif kind = 'archive_scope_type' then
      select id into v_id from context.scope_types
      where organization_id = p_org_id and deleted_at is null
        and (id::text = op->>'id' or slug = op->>'key');
      update context.scope_types
        set deleted_at = now(), updated_by = (select auth.uid()), updated_at = now()
      where id = v_id;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'upsert_context_item' then
      v_type_id := public._scope_system_resolve_type_id(p_org_id, op, 'context item');
      if op ? 'id' then
        v_item_id := (op->>'id')::uuid;
      else
        select id into v_item_id from context.context_items
        where scope_type_id = v_type_id and is_active and deleted_at is null and key = op->>'key';
      end if;
      if op->'reference_source'->>'container_type' = 'dataset_template' then
        if not (op->'reference_source' ? 'template_id') and op->'reference_source' ? 'template_name' then
          select id into v_template_id from workbench.udt_dataset_templates
          where organization_id = p_org_id and is_active
            and lower(name) = lower(op->'reference_source'->>'template_name');
          if v_template_id is null then
            raise exception 'table template % not found',
              op->'reference_source'->>'template_name' using errcode = '22023';
          end if;
          op := jsonb_set(op, '{reference_source,template_id}', to_jsonb(v_template_id::text), true);
        end if;
        perform context.validate_dataset_template_source(op->'reference_source', p_org_id);
      end if;
      if v_item_id is null then
        insert into context.context_items (
          scope_type_id, key, display_name, description, category, tags, status, value_type,
          fetch_hint, sensitivity, source_type, is_active, created_by, slug, sort_order,
          allowed_reference_types, max_items, allowed_scope_type_ids, reference_source,
          custom_component
        ) values (
          v_type_id, op->>'key', coalesce(op->>'display_name', op->>'key'),
          coalesce(op->>'description', ''), op->>'category',
          coalesce(array(select jsonb_array_elements_text(op->'tags')), '{}'),
          'active',
          coalesce(op->>'value_type', 'string')::public.context_value_type,
          coalesce(op->>'fetch_hint', 'on_demand')::public.context_fetch_hint,
          coalesce(op->>'sensitivity', 'internal')::public.context_sensitivity,
          'manual', true, (select auth.uid()), coalesce(op->>'slug', op->>'key'),
          coalesce((op->>'sort_order')::smallint, 0),
          case when op ? 'allowed_reference_types'
            then array(select jsonb_array_elements_text(op->'allowed_reference_types'))
            else null end,
          coalesce((op->>'max_items')::integer, 1),
          case when op ? 'allowed_scope_type_ids'
            then array(select jsonb_array_elements_text(op->'allowed_scope_type_ids'))::uuid[]
            else null end,
          op->'reference_source',
          case when op ? 'custom_component' then op->'custom_component' else null end
        ) returning id into v_item_id;
      else
        update context.context_items set
          display_name = coalesce(op->>'display_name', display_name),
          description = coalesce(op->>'description', description),
          category = case when op ? 'category' then op->>'category' else category end,
          value_type = coalesce(op->>'value_type', value_type::text)::public.context_value_type,
          fetch_hint = coalesce(op->>'fetch_hint', fetch_hint::text)::public.context_fetch_hint,
          sensitivity = coalesce(op->>'sensitivity', sensitivity::text)::public.context_sensitivity,
          sort_order = coalesce((op->>'sort_order')::smallint, sort_order),
          allowed_reference_types = case when op ? 'allowed_reference_types'
            then array(select jsonb_array_elements_text(op->'allowed_reference_types'))
            else allowed_reference_types end,
          max_items = coalesce((op->>'max_items')::integer, max_items),
          allowed_scope_type_ids = case when op ? 'allowed_scope_type_ids'
            then array(select jsonb_array_elements_text(op->'allowed_scope_type_ids'))::uuid[]
            else allowed_scope_type_ids end,
          reference_source = case when op ? 'reference_source'
            then op->'reference_source' else reference_source end,
          custom_component = case when op ? 'custom_component'
            then op->'custom_component' else custom_component end,
          updated_by = (select auth.uid()),
          updated_at = now()
        where id = v_item_id and scope_type_id = v_type_id;
      end if;
      select to_jsonb(ci) into v_row from context.context_items ci where id = v_item_id;
      v_id := v_item_id;

    elsif kind = 'archive_context_item' then
      select ci.id into v_id
      from context.context_items ci
      join context.scope_types st on st.id = ci.scope_type_id
      where st.organization_id = p_org_id and ci.deleted_at is null
        and (ci.id::text = op->>'id' or (st.slug = op->>'scope_type_key' and ci.key = op->>'key'));
      update context.context_items
        set is_active = false, deleted_at = now(), updated_by = (select auth.uid()), updated_at = now()
      where id = v_id;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'upsert_scope' then
      v_type_id := public._scope_system_resolve_type_id(p_org_id, op, 'scope');
      v_parent_id := null;
      if op ? 'parent_key' then
        select id into v_parent_id from context.scopes
        where organization_id = p_org_id and deleted_at is null and slug = op->>'parent_key';
      end if;
      if op ? 'id' then
        v_scope_id := (op->>'id')::uuid;
      else
        select id into v_scope_id from context.scopes
        where organization_id = p_org_id and scope_type_id = v_type_id
          and deleted_at is null and slug = op->>'key';
      end if;
      if v_scope_id is null then
        insert into context.scopes (
          organization_id, scope_type_id, parent_scope_id, name, description,
          settings, created_by, slug, sort_order
        ) values (
          p_org_id, v_type_id, v_parent_id, op->>'name', coalesce(op->>'description', ''),
          coalesce(op->'settings', '{}'::jsonb), (select auth.uid()), op->>'key',
          coalesce((op->>'sort_order')::smallint, 0)
        ) returning id into v_scope_id;
      else
        update context.scopes set
          parent_scope_id = case when op ? 'parent_key' then v_parent_id else parent_scope_id end,
          name = coalesce(op->>'name', name),
          description = coalesce(op->>'description', description),
          settings = case when op ? 'settings' then op->'settings' else settings end,
          sort_order = coalesce((op->>'sort_order')::smallint, sort_order),
          updated_by = (select auth.uid()),
          updated_at = now()
        where id = v_scope_id and organization_id = p_org_id;
      end if;
      select to_jsonb(s) into v_row from context.scopes s where id = v_scope_id;
      v_id := v_scope_id;

    elsif kind = 'archive_scope' then
      select id into v_id from context.scopes
      where organization_id = p_org_id and deleted_at is null
        and (id::text = op->>'id' or slug = op->>'key');
      update context.scopes
        set deleted_at = now(), updated_by = (select auth.uid()), updated_at = now()
      where id = v_id;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'set_value' then
      select s.id, s.scope_type_id into v_scope_id, v_type_id
      from context.scopes s
      where s.organization_id = p_org_id and s.deleted_at is null
        and (s.id::text = op->>'scope_id' or s.slug = op->>'scope_key');
      select ci.id, ci.value_type::text into v_item_id, v_value_type
      from context.context_items ci
      where ci.scope_type_id = v_type_id and ci.is_active and ci.deleted_at is null
        and (ci.id::text = op->>'context_item_id' or ci.key = op->>'item_key');
      if v_scope_id is null or v_item_id is null then
        raise exception 'scope or context item not found for value operation' using errcode = '22023';
      end if;
      v_value := op->'value';
      select to_jsonb(x) into v_row from context.write_context_value(
        p_item_id => v_item_id,
        p_scope_id => v_scope_id,
        p_value_text => case when v_value_type in (
          'string', 'email', 'url', 'phone', 'color', 'markdown', 'reference'
        ) then v_value#>>'{}' end,
        p_value_number => case when v_value_type in ('number', 'percent')
          then (v_value#>>'{}')::numeric end,
        p_value_boolean => case when v_value_type = 'boolean'
          then (v_value#>>'{}')::boolean end,
        p_value_json => case when v_value_type in ('object', 'array', 'currency')
          then v_value end,
        p_value_date => case when v_value_type = 'date'
          then (v_value#>>'{}')::date end,
        p_value_timestamp => case when v_value_type = 'datetime'
          then (v_value#>>'{}')::timestamptz end,
        p_value_time => case when v_value_type = 'time'
          then (v_value#>>'{}')::time end,
        p_value_document_url => case when v_value_type = 'document'
          then v_value#>>'{}' end,
        p_change_summary => coalesce(op->>'change_summary', 'Updated by scope_system tool'),
        p_source_type => 'ai_generated',
        p_actor => (select auth.uid())
      ) x;
      v_id := v_row->>'id';

    elsif kind = 'upsert_table_template' then
      if op ? 'id' then
        v_template_id := (op->>'id')::uuid;
      else
        select id into v_template_id from workbench.udt_dataset_templates
        where organization_id = p_org_id and is_active and lower(name) = lower(op->>'name');
      end if;
      if v_template_id is null then
        insert into workbench.udt_dataset_templates (
          organization_id, name, description, created_by, updated_by
        ) values (
          p_org_id, op->>'name', coalesce(op->>'description', ''), (select auth.uid()), (select auth.uid())
        ) returning id into v_template_id;
        insert into workbench.udt_dataset_template_fields (
          template_id, field_name, display_name, data_type, field_order,
          is_required, default_value, validation_rules
        )
        select
          v_template_id, f->>'field_name', coalesce(f->>'display_name', f->>'field_name'),
          coalesce(f->>'data_type', 'string')::public.field_data_type,
          coalesce((f->>'field_order')::integer, ord::integer - 1),
          coalesce((f->>'is_required')::boolean, false),
          f->'default_value', f->'validation_rules'
        from jsonb_array_elements(coalesce(op->'fields', '[]'::jsonb)) with ordinality as x(f, ord);
      else
        update workbench.udt_dataset_templates set
          name = coalesce(op->>'name', name),
          description = coalesce(op->>'description', description),
          updated_by = (select auth.uid()),
          updated_at = now()
        where id = v_template_id and organization_id = p_org_id;
      end if;
      select to_jsonb(t) into v_row from workbench.udt_dataset_templates t where id = v_template_id;
      v_id := v_template_id;

    elsif kind = 'archive_table_template' then
      select id into v_id from workbench.udt_dataset_templates
      where organization_id = p_org_id and is_active
        and (id::text = op->>'id' or lower(name) = lower(op->>'name'));
      update workbench.udt_dataset_templates
        set is_active = false, updated_by = (select auth.uid()), updated_at = now()
      where id = v_id;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    else
      raise exception 'unknown scope-system operation %', kind using errcode = '22023';
    end if;

    if v_id is null then
      perform platform.refuse_not_found(format('operation %s did not match or create a record', kind));
    end if;
    v_results := v_results || jsonb_build_array(
      jsonb_build_object('op', kind, 'id', v_id, 'record', v_row)
    );
  end loop;

  return jsonb_build_object(
    'organization_id', p_org_id,
    'applied', jsonb_array_length(v_results),
    'results', v_results
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.scope_system_inspect(p_org_id uuid, p_include_values boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if iam.has_org_access(p_org_id) is not true then raise exception 'not authorized for organization %',p_org_id using errcode='42501'; end if;
  return jsonb_build_object(
    'organization_id',p_org_id,
    'scope_types',coalesce((select jsonb_agg(
      (to_jsonb(st)-'organization_id'-'created_at'-'updated_at'-'updated_by') || jsonb_build_object(
        'context_items',coalesce((select jsonb_agg(to_jsonb(ci)-'created_at'-'updated_at'-'status_updated_at'-'status_updated_by'-'created_by'-'updated_by' order by ci.sort_order,ci.display_name)
          from context.context_items ci where ci.scope_type_id=st.id and ci.is_active and ci.deleted_at is null),'[]'::jsonb),
        'scopes',coalesce((select jsonb_agg((to_jsonb(s)-'organization_id'-'created_at'-'updated_at'-'created_by'-'updated_by') ||
          case when p_include_values then jsonb_build_object('values',coalesce((select jsonb_object_agg(ci.key,
            coalesce(to_jsonb(v.value_text),to_jsonb(v.value_number),to_jsonb(v.value_boolean),v.value_json,to_jsonb(v.value_date),to_jsonb(v.value_timestamp),to_jsonb(v.value_time),to_jsonb(v.value_document_url)))
            from context.context_items ci left join context.context_item_values v on v.context_item_id=ci.id and v.scope_id=s.id and v.is_current
            where ci.scope_type_id=st.id and ci.is_active and ci.deleted_at is null),'{}'::jsonb)) else '{}'::jsonb end
          order by s.sort_order,s.name) from context.scopes s where s.scope_type_id=st.id and s.deleted_at is null and context._scope_readable(s.id,'viewer')),'[]'::jsonb)
      ) order by st.sort_order,st.label_singular) from context.scope_types st where st.organization_id=p_org_id and st.deleted_at is null),'[]'::jsonb),
    'table_templates',public.list_udt_dataset_templates(p_org_id)
  );
end; $function$;

CREATE OR REPLACE FUNCTION public.search_scopes(p_org_id uuid, p_query text, p_type_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
  end if;
  select jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'description', s.description,
      'parent_scope_id', s.parent_scope_id,
      'type_id', st.id,
      'type_label', st.label_singular,
      'type_icon', st.icon,
      'type_color', st.color
    ) order by st.sort_order, s.sort_order, s.name
  ) into v_result
  from context.scopes s
  join context.scope_types st on s.scope_type_id = st.id
  where s.organization_id = p_org_id
    and s.deleted_at is null and st.deleted_at is null
    and s.id in (select context._readable_scope_ids())
    and s.name ilike '%' || coalesce(p_query, '') || '%'
    and (p_type_id is null or s.scope_type_id = p_type_id);
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION seo._tm_map(p_map_id uuid, p_level permission_level, OUT organization_id uuid, OUT brand_id uuid)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  -- Every door checks its own p_map_id first and names itself; this is the
  -- backstop, so a future caller that forgets cannot turn NULL into "denied".
  IF p_map_id IS NULL THEN
    RAISE EXCEPTION 'topical_map: p_map_id is required (got NULL)' USING ERRCODE = '22023';
  END IF;
  -- Arman, 2026-09-15: a topical map is a shareable resource. iam.has_access is
  -- THE canonical check for one; bare org membership is not a share.
  IF NOT (public.is_platform_admin()
          OR iam.has_access('seo_topical_map', p_map_id, p_level)) THEN
    RAISE EXCEPTION 'topical_map_denied: no % access to map %', p_level, p_map_id USING ERRCODE = '42501';
  END IF;
  SELECT m.organization_id, m.brand_id INTO organization_id, brand_id
    FROM seo.topical_map m WHERE m.id = p_map_id AND m.deleted_at IS NULL;
  IF organization_id IS NULL THEN
    perform platform.refuse_not_found(format('topical_map %s not found', p_map_id));
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION seo._tm_site(p_site_id uuid, p_level permission_level, p_denied text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION '%: p_site_id is NULL; the site set for NULL is decided by seo._tm_visible_sites, never here', p_denied
      USING ERRCODE = '22023';
  END IF;
  IF NOT (public.is_platform_admin()
          OR iam.has_access('web_site', p_site_id, p_level)) THEN
    RAISE EXCEPTION '%: no % access to site %', p_denied, p_level, p_site_id USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL) THEN
    perform platform.refuse_not_found(format('site %s not found', p_site_id));
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION seo.adopt_starter_pack(p_site_id uuid, p_pack_id uuid, p_include text[] DEFAULT NULL::text[], p_topic_ids uuid[] DEFAULT NULL::uuid[], p_seed_guidelines boolean DEFAULT true, p_geo_places jsonb DEFAULT NULL::jsonb, p_geo_place_ids jsonb DEFAULT NULL::jsonb, p_item_ids uuid[] DEFAULT NULL::uuid[], p_reset boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'web', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_uid uuid := auth.uid();
  v_pack seo.starter_pack%rowtype;
  v_topics int := 0; v_bands int := 0; v_geo_bands int := 0;
  v_areas int := 0; v_guidelines boolean := false;
  v_filled int := 0; v_pending bigint := 0;
  v_meaning int := 0; v_matchers int := 0; v_worths int := 0; v_skipped int := 0;
  v_reset_topics int := 0; v_reset_bands int := 0;
  v_reset_geo_bands int := 0; v_reset_areas int := 0; v_reset_meaning int := 0;
  v_existing text;
  v_want text[] := coalesce(p_include, array['topics','value_bands','geo_bands','geo_areas','meaning']);
  it seo.starter_pack_item%rowtype;
  m jsonb; v_dim uuid; v_value uuid; v_n int;
begin
  perform seo.gsc_assert_site_access(p_site_id);

  select * into v_pack from seo.starter_pack where id = p_pack_id and deleted_at is null;
  if not found then
    raise exception 'seo_pack_not_found: %', p_pack_id;
  end if;

  select organization_id into v_org from web.site where id = p_site_id and deleted_at is null;
  if v_org is null then
    raise exception 'seo_site_not_found: %', p_site_id;
  end if;

  if 'topics' = any(v_want) then
    with ins as (
      insert into seo.site_topic_value
        (site_id, topic_id, weight, lead_quality, offering_match, notes,
         organization_id, created_by, updated_by, metadata)
      select p_site_id, i.topic_id, i.weight, i.lead_quality, i.offering_match,
             i.notes, v_org, v_uid, v_uid,
             jsonb_build_object('adopted_from_pack', v_pack.slug, 'pack_item_id', i.id)
      from seo.starter_pack_item i
      where i.pack_id = p_pack_id and i.item_kind = 'topic' and i.deleted_at is null
        and (p_topic_ids is null or i.topic_id = any(p_topic_ids))
        and (p_item_ids is null or i.id = any(p_item_ids))
      on conflict (site_id, topic_id) do nothing
      returning 1)
    select count(*)::int into v_topics from ins;

    if p_reset then
      with upd as (
        update seo.site_topic_value t
           set weight = i.weight, lead_quality = i.lead_quality,
               offering_match = i.offering_match, notes = i.notes,
               deleted_at = null, updated_by = v_uid,
               metadata = coalesce(t.metadata, '{}'::jsonb)
                          || jsonb_build_object('reset_to_pack_at', now())
          from seo.starter_pack_item i
         where i.pack_id = p_pack_id and i.item_kind = 'topic' and i.deleted_at is null
           and (p_item_ids is null or i.id = any(p_item_ids))
           and t.site_id = p_site_id
           and t.metadata->>'pack_item_id' = i.id::text
        returning 1)
      select count(*)::int into v_reset_topics from upd;
    end if;
  end if;

  if 'value_bands' = any(v_want) then
    with ins as (
      insert into seo.site_vocabulary
        (site_id, vocab_kind, value, label, description, sort, config,
         organization_id, created_by, updated_by, metadata)
      select p_site_id, 'value_band', i.value, i.label, i.description, i.sort, i.config,
             v_org, v_uid, v_uid,
             jsonb_build_object('adopted_from_pack', v_pack.slug, 'pack_item_id', i.id)
      from seo.starter_pack_item i
      where i.pack_id = p_pack_id and i.item_kind = 'value_band' and i.deleted_at is null
        and (p_item_ids is null or i.id = any(p_item_ids))
        and not exists (select 1 from seo.site_vocabulary v
                         where v.site_id = p_site_id and v.vocab_kind = 'value_band'
                           and v.value = i.value)
      on conflict do nothing
      returning 1)
    select count(*)::int into v_bands from ins;

    if p_reset then
      with upd as (
        update seo.site_vocabulary v
           set label = i.label, description = i.description, sort = i.sort,
               config = i.config, active = true, deleted_at = null, updated_by = v_uid,
               metadata = coalesce(v.metadata, '{}'::jsonb)
                          || jsonb_build_object('reset_to_pack_at', now())
          from seo.starter_pack_item i
         where i.pack_id = p_pack_id and i.item_kind = 'value_band' and i.deleted_at is null
           and (p_item_ids is null or i.id = any(p_item_ids))
           and v.site_id = p_site_id and v.vocab_kind = 'value_band'
           and v.metadata->>'pack_item_id' = i.id::text
           and not exists (select 1 from seo.site_vocabulary live
                            where live.site_id = p_site_id and live.vocab_kind = 'value_band'
                              and live.value = v.value and live.deleted_at is null
                              and live.id <> v.id)
        returning 1)
      select count(*)::int into v_reset_bands from upd;
    end if;
  end if;

  if 'geo_bands' = any(v_want) then
    with ins as (
      insert into seo.site_vocabulary
        (site_id, vocab_kind, value, label, description, sort, config,
         organization_id, created_by, updated_by, metadata)
      select p_site_id, 'geo_band', i.value, i.label, i.description, i.sort, i.config,
             v_org, v_uid, v_uid,
             jsonb_build_object('adopted_from_pack', v_pack.slug, 'pack_item_id', i.id)
      from seo.starter_pack_item i
      where i.pack_id = p_pack_id and i.item_kind = 'geo_band' and i.deleted_at is null
        and (p_item_ids is null or i.id = any(p_item_ids))
        and not exists (select 1 from seo.site_vocabulary v
                         where v.site_id = p_site_id and v.vocab_kind = 'geo_band'
                           and v.value = i.value)
      on conflict do nothing
      returning 1)
    select count(*)::int into v_geo_bands from ins;

    if p_reset then
      with upd as (
        update seo.site_vocabulary v
           set label = i.label, description = i.description, sort = i.sort,
               config = i.config, active = true, deleted_at = null, updated_by = v_uid,
               metadata = coalesce(v.metadata, '{}'::jsonb)
                          || jsonb_build_object('reset_to_pack_at', now())
          from seo.starter_pack_item i
         where i.pack_id = p_pack_id and i.item_kind = 'geo_band' and i.deleted_at is null
           and (p_item_ids is null or i.id = any(p_item_ids))
           and v.site_id = p_site_id and v.vocab_kind = 'geo_band'
           and v.metadata->>'pack_item_id' = i.id::text
           and not exists (select 1 from seo.site_vocabulary live
                            where live.site_id = p_site_id and live.vocab_kind = 'geo_band'
                              and live.value = v.value and live.deleted_at is null
                              and live.id <> v.id)
        returning 1)
      select count(*)::int into v_reset_geo_bands from upd;
    end if;
  end if;

  if 'geo_areas' = any(v_want) then
    with ins as (
      insert into seo.site_geo_area
        (site_id, label, area_kind, match_tokens, place_ids, geo_band, notes,
         organization_id, created_by, updated_by, metadata)
      select p_site_id, a.label, a.area_kind, a.tokens, a.place_ids, a.geo_band, a.notes,
             v_org, v_uid, v_uid,
             jsonb_build_object(
               'adopted_from_pack', v_pack.slug,
               'pack_item_id', a.item_id,
               'places_pending',
               jsonb_array_length(a.tokens) = 0
                 and coalesce(array_length(a.place_ids, 1), 0) = 0)
      from seo._pack_geo_archetypes(p_pack_id, p_geo_places, p_geo_place_ids) a
      where (p_item_ids is null or a.item_id = any(p_item_ids))
        and not exists (select 1 from seo.site_geo_area g
                         where g.site_id = p_site_id and g.label = a.label)
      on conflict do nothing
      returning 1)
    select count(*)::int into v_areas from ins;

    with upd as (
      update seo.site_geo_area g
         set match_tokens = a.tokens,
             place_ids = a.place_ids,
             metadata = (coalesce(g.metadata, '{}'::jsonb) - 'places_pending')
                        || jsonb_build_object('places_filled_at', now()),
             updated_by = v_uid
        from seo._pack_geo_archetypes(p_pack_id, p_geo_places, p_geo_place_ids) a
       where g.site_id = p_site_id
         and g.deleted_at is null
         and g.label = a.label
         and (p_item_ids is null or a.item_id = any(p_item_ids))
         and coalesce(jsonb_array_length(g.match_tokens), 0) = 0
         and coalesce(array_length(g.place_ids, 1), 0) = 0
         and (jsonb_array_length(a.tokens) > 0
              or coalesce(array_length(a.place_ids, 1), 0) > 0)
      returning 1)
    select count(*)::int into v_filled from upd;

    if p_reset then
      with upd as (
        update seo.site_geo_area g
           set area_kind = coalesce(i.area_kind, 'city'), geo_band = i.geo_band,
               notes = i.notes, deleted_at = null, updated_by = v_uid,
               metadata = coalesce(g.metadata, '{}'::jsonb)
                          || jsonb_build_object('reset_to_pack_at', now())
          from seo.starter_pack_item i
         where i.pack_id = p_pack_id and i.item_kind = 'geo_area' and i.deleted_at is null
           and (p_item_ids is null or i.id = any(p_item_ids))
           and g.site_id = p_site_id
           and g.metadata->>'pack_item_id' = i.id::text
           and not exists (select 1 from seo.site_geo_area live
                            where live.site_id = p_site_id and live.label = g.label
                              and live.deleted_at is null and live.id <> g.id)
        returning 1)
      select count(*)::int into v_reset_areas from upd;
    end if;
  end if;

  -- ── MEANING: dimension values + matchers + worth (KI-030) ────────────────
  -- Additive and idempotent by construction: a matcher is written only when
  -- this site has no live matcher with the same phrase on the same value, and
  -- a worth row only when this site has expressed NO worth for that value.
  -- A site's own ruling is never overwritten — not even by `reset`, which only
  -- puts back rows still carrying this pack's provenance.
  if 'meaning' = any(v_want) then
    for it in
      select * from seo.starter_pack_item
       where pack_id = p_pack_id and item_kind = 'meaning' and deleted_at is null
         and (p_item_ids is null or id = any(p_item_ids))
       order by sort, label
    loop
      if it.dimension_scope = 'site' then
        v_dim := seo._ensure_site_dimension(
          p_site_id, it.dimension_slug,
          coalesce(it.dimension_label, initcap(replace(it.dimension_slug, '_', ' '))),
          it.description, 'intrinsic');
        v_value := seo._ensure_value(v_dim, it.value, it.label,
          jsonb_build_object('pack_item_id', it.id::text,
                             'adopted_from_pack', v_pack.slug,
                             'description', it.description));
      else
        -- Platform vocabularies are governed rows. A pack may SCORE one; it may
        -- never invent one, so an unknown value is reported, not created.
        select id into v_dim from platform.categories
         where dimension = 'seo_facet' and parent_id is null
           and slug = it.dimension_slug and deleted_at is null;
        select id into v_value from platform.categories
         where dimension = 'seo_facet'
           and slug = it.dimension_slug || ':' || it.value and deleted_at is null;
        if v_dim is null or v_value is null then
          v_skipped := v_skipped + 1;
          continue;
        end if;
      end if;
      v_meaning := v_meaning + 1;

      for m in select value from jsonb_array_elements(coalesce(it.matchers, '[]'::jsonb)) loop
        insert into seo.dimension_value_matcher
          (site_id, value_id, kind, pattern, exclusions, enabled, origin, pack_id, notes,
           organization_id, created_by, updated_by, metadata)
        select p_site_id, v_value, m->>'kind', m->>'pattern',
               case when jsonb_typeof(m->'exclusions') = 'array'
                    then array(select jsonb_array_elements_text(m->'exclusions'))
                    else null end,
               coalesce((m->>'enabled')::boolean, true), 'pack', p_pack_id,
               'from starter pack "' || v_pack.slug || '"',
               v_org, v_uid, v_uid,
               jsonb_build_object('adopted_from_pack', v_pack.slug,
                                  'pack_item_id', it.id::text)
        where not exists (
          select 1 from seo.dimension_value_matcher x
           where x.site_id = p_site_id and x.value_id = v_value
             and x.kind = m->>'kind'
             and lower(coalesce(x.pattern, '')) = lower(m->>'pattern')
             and x.deleted_at is null);
        get diagnostics v_n = row_count;
        v_matchers := v_matchers + v_n;
      end loop;

      if it.worth_effect is not null then
        insert into seo.site_value_worth
          (site_id, value_id, effect, amount, origin, pack_id, notes,
           organization_id, created_by, updated_by, metadata)
        select p_site_id, v_value, it.worth_effect, it.worth_amount, 'pack', p_pack_id,
               coalesce(it.notes, 'from starter pack "' || v_pack.slug || '"'),
               v_org, v_uid, v_uid,
               jsonb_build_object('adopted_from_pack', v_pack.slug,
                                  'pack_item_id', it.id::text)
        where not exists (
          select 1 from seo.site_value_worth w
           where w.site_id = p_site_id and w.value_id = v_value and w.deleted_at is null);
        get diagnostics v_n = row_count;
        v_worths := v_worths + v_n;
      end if;

      if p_reset then
        update seo.site_value_worth w
           set effect = it.worth_effect, amount = it.worth_amount,
               notes = coalesce(it.notes, w.notes), deleted_at = null, updated_by = v_uid,
               metadata = coalesce(w.metadata, '{}'::jsonb)
                          || jsonb_build_object('reset_to_pack_at', now())
         where w.site_id = p_site_id and w.value_id = v_value
           and w.metadata->>'pack_item_id' = it.id::text
           and it.worth_effect is not null;
        get diagnostics v_n = row_count;
        v_reset_meaning := v_reset_meaning + v_n;

        update seo.dimension_value_matcher x
           set deleted_at = null, updated_by = v_uid,
               metadata = coalesce(x.metadata, '{}'::jsonb)
                          || jsonb_build_object('reset_to_pack_at', now())
         where x.site_id = p_site_id and x.value_id = v_value
           and x.metadata->>'pack_item_id' = it.id::text
           and x.deleted_at is not null
           and not exists (
             select 1 from seo.dimension_value_matcher live
              where live.site_id = x.site_id and live.value_id = x.value_id
                and live.kind = x.kind
                and lower(coalesce(live.pattern,'')) = lower(coalesce(x.pattern,''))
                and live.deleted_at is null);
        get diagnostics v_n = row_count;
        v_reset_meaning := v_reset_meaning + v_n;
      end if;
    end loop;
  end if;

  if p_seed_guidelines and v_pack.guidelines is not null then
    select g.guidelines into v_existing from seo.gsc_site_kw_guidelines(p_site_id) g;
    if coalesce(btrim(v_existing), '') = '' then
      perform 1 from seo.gsc_set_site_kw_guidelines(p_site_id, v_pack.guidelines);
      v_guidelines := true;
    end if;
  end if;

  select count(*) into v_pending
  from seo.site_geo_area g
  where g.site_id = p_site_id and g.deleted_at is null
    and coalesce(jsonb_array_length(g.match_tokens), 0) = 0
    and coalesce(array_length(g.place_ids, 1), 0) = 0;

  return jsonb_build_object(
    'pack', v_pack.slug, 'site_id', p_site_id,
    'topics', v_topics, 'value_bands', v_bands, 'geo_bands', v_geo_bands,
    'geo_areas', v_areas, 'guidelines_seeded', v_guidelines,
    'meaning_values', v_meaning, 'matchers', v_matchers, 'worths', v_worths,
    'meaning_skipped', v_skipped,
    'geo_areas_filled', v_filled, 'geo_areas_pending', v_pending,
    'reset_meaning', v_reset_meaning, 'reset_topics', v_reset_topics,
    'reset_value_bands', v_reset_bands, 'reset_geo_bands', v_reset_geo_bands,
    'reset_geo_areas', v_reset_areas);
end;
$function$;

CREATE OR REPLACE FUNCTION seo.create_map_facet_values(p_brand_id uuid, p_facet_key text, p_values jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_org uuid; v_fid uuid; r jsonb; v_id uuid; v_parent uuid; v_created text[] := '{}'; v_updated text[] := '{}';
        v_actor uuid; v_rt text; v_ri uuid;
BEGIN
  IF p_brand_id IS NULL THEN RAISE EXCEPTION 'create_map_facet_values: p_brand_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_facet_key IS NULL THEN RAISE EXCEPTION 'create_map_facet_values: p_facet_key is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_values IS NULL THEN RAISE EXCEPTION 'create_map_facet_values: p_values is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF NOT (public.is_platform_admin() OR iam.has_access('web_brand', p_brand_id, 'editor')) THEN
    RAISE EXCEPTION 'facet_values_denied' USING ERRCODE='42501';
  END IF;
  SELECT organization_id INTO v_org FROM web.brand WHERE id = p_brand_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN perform platform.refuse_not_found(format('brand %s not found', p_brand_id)); END IF;
  SELECT id INTO v_fid FROM seo.map_facet WHERE key = p_facet_key AND deleted_at IS NULL
     AND (organization_id = v_org OR organization_id IN (SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable))
   ORDER BY (organization_id = v_org) DESC LIMIT 1;
  IF v_fid IS NULL THEN perform platform.refuse_not_found(format('facet %s not found', p_facet_key)); END IF;
  IF jsonb_typeof(p_values) <> 'array' THEN RAISE EXCEPTION 'p_values must be a JSON array' USING ERRCODE='22023'; END IF;

  v_actor := (SELECT auth.uid());
  IF v_actor IS NOT NULL AND NOT public.is_platform_admin() THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_values) LOOP
      v_rt := r->>'ref_type'; v_ri := (r->>'ref_id')::uuid;
      IF v_rt IS NOT NULL AND v_ri IS NOT NULL
         AND iam.has_access_for(v_actor, v_rt, v_ri, 'viewer'::public.permission_level) IS NOT TRUE THEN
        RAISE EXCEPTION 'create_map_facet_values: no viewer access to %/% referenced by value %',
          v_rt, v_ri, r->>'slug' USING ERRCODE='42501';
      END IF;
    END LOOP;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_values) LOOP
    SELECT id INTO v_id FROM seo.map_facet_value WHERE facet_id = v_fid AND brand_id = p_brand_id AND slug = r->>'slug' AND deleted_at IS NULL;
    IF v_id IS NULL THEN
      INSERT INTO seo.map_facet_value (organization_id, facet_id, brand_id, slug, name, ref_type, ref_id)
      VALUES (v_org, v_fid, p_brand_id, r->>'slug', COALESCE(r->>'name', r->>'slug'), r->>'ref_type', (r->>'ref_id')::uuid);
      v_created := v_created || (r->>'slug');
    ELSE
      UPDATE seo.map_facet_value SET name = COALESCE(r->>'name', name),
             ref_type = CASE WHEN r ? 'ref_type' THEN r->>'ref_type' ELSE ref_type END,
             ref_id   = CASE WHEN r ? 'ref_id' THEN (r->>'ref_id')::uuid ELSE ref_id END
       WHERE id = v_id;
      v_updated := v_updated || (r->>'slug');
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM jsonb_array_elements(p_values) WHERE value ? 'parent_slug' LOOP
    SELECT id INTO v_parent FROM seo.map_facet_value WHERE facet_id = v_fid AND brand_id = p_brand_id AND slug = r->>'parent_slug' AND deleted_at IS NULL;
    IF v_parent IS NULL AND (r->>'parent_slug') IS NOT NULL THEN
      perform platform.refuse_not_found(format('parent_slug %s not found for %s', r->>'parent_slug', r->>'slug'));
    END IF;
    UPDATE seo.map_facet_value SET parent_id = v_parent WHERE facet_id = v_fid AND brand_id = p_brand_id AND slug = r->>'slug' AND deleted_at IS NULL;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'created', to_jsonb(v_created), 'updated', to_jsonb(v_updated));
END $function$;

CREATE OR REPLACE FUNCTION seo.dimension_matcher_upsert(p_site_id uuid, p_value_id uuid, p_kind text, p_pattern text DEFAULT NULL::text, p_place_id uuid DEFAULT NULL::uuid, p_fact_value_id uuid DEFAULT NULL::uuid, p_condition_rule_id uuid DEFAULT NULL::uuid, p_origin text DEFAULT 'human'::text, p_notes text DEFAULT NULL::text, p_enabled boolean DEFAULT true)
 RETURNS TABLE(id uuid, site_id uuid, value_id uuid, kind text, pattern text, place_id uuid, fact_value_id uuid, condition_rule_id uuid, enabled boolean, origin text, notes text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'web', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_org  uuid;
  v_dim  record;
  v_text text := NULLIF(btrim(COALESCE(p_pattern, '')), '');
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_matcher_unauthenticated';
  END IF;
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  SELECT s.organization_id INTO v_org FROM web.site s
   WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_org IS NULL THEN
    perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_site_id));
  END IF;

  IF p_origin NOT IN ('human','pack','agent','migration') THEN
    RAISE EXCEPTION 'seo_matcher_bad_origin: %', p_origin;
  END IF;

  -- The value must be a real VALUE of a seo_facet dimension, and a site
  -- dimension's values only accept matchers from their own site.
  SELECT v.id AS value_id,
         d.id AS dimension_id,
         d.slug AS dimension_slug,
         COALESCE(d.metadata->>'scope','platform') AS scope,
         (d.metadata->>'site_id')::uuid AS dim_site_id
    INTO v_dim
  FROM platform.categories v
  JOIN platform.categories d ON d.id = v.parent_id AND d.deleted_at IS NULL
  WHERE v.id = p_value_id AND v.deleted_at IS NULL AND v.dimension = 'seo_facet';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_matcher_unknown_value: % is not a value of any keyword dimension', p_value_id;
  END IF;
  IF v_dim.scope = 'site' AND v_dim.dim_site_id IS DISTINCT FROM p_site_id THEN
    RAISE EXCEPTION 'seo_matcher_forbidden: "%" belongs to another site', v_dim.dimension_slug;
  END IF;

  -- Find the live twin (the dvm_target_check constraint guarantees exactly one
  -- target column is populated, so this comparison is total).
  SELECT m.id INTO v_id
    FROM seo.dimension_value_matcher m
   WHERE m.deleted_at IS NULL
     AND m.site_id = p_site_id
     AND m.value_id = p_value_id
     AND m.kind = p_kind
     AND m.pattern IS NOT DISTINCT FROM v_text
     AND m.place_id IS NOT DISTINCT FROM p_place_id
     AND m.fact_value_id IS NOT DISTINCT FROM p_fact_value_id
     AND m.condition_rule_id IS NOT DISTINCT FROM p_condition_rule_id
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO seo.dimension_value_matcher
      (site_id, value_id, kind, pattern, place_id, fact_value_id, condition_rule_id,
       enabled, origin, notes, organization_id, created_by, updated_by)
    VALUES
      (p_site_id, p_value_id, p_kind, v_text, p_place_id, p_fact_value_id, p_condition_rule_id,
       COALESCE(p_enabled, true), p_origin, NULLIF(btrim(COALESCE(p_notes,'')),''),
       v_org, v_uid, v_uid)
    RETURNING dimension_value_matcher.id INTO v_id;
  ELSE
    UPDATE seo.dimension_value_matcher m
       SET enabled    = COALESCE(p_enabled, m.enabled),
           notes      = COALESCE(NULLIF(btrim(COALESCE(p_notes,'')),''), m.notes),
           origin     = p_origin,
           updated_by = v_uid,
           updated_at = now()
     WHERE m.id = v_id;
  END IF;

  RETURN QUERY
  SELECT m.id, m.site_id, m.value_id, m.kind, m.pattern, m.place_id,
         m.fact_value_id, m.condition_rule_id, m.enabled, m.origin, m.notes, m.created_at
    FROM seo.dimension_value_matcher m WHERE m.id = v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.fn_refresh_page_intent_queue(p_site_id uuid, p_window_days integer)
 RETURNS TABLE(scanned bigint, now_pending bigint, now_done bigint, now_held bigint, skipped_no_topic bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
declare
    v_as_of date := current_date;
    v_map   uuid;
begin
    if p_site_id is null then
        raise exception 'pageintentq_bad_site: p_site_id is required'
            using errcode = '22023';
    end if;
    -- The authority is STATED, never an absent grant: enrolling a site's pages is an
    -- editor's act, and a stranger who guesses the site id gets 42501.
    perform seo.gsc_assert_site_editor(p_site_id);
    if p_window_days is null or p_window_days < 1 then
        raise exception 'pageintentq_bad_window: p_window_days must be >= 1'
            using errcode = '22023';
    end if;

    v_map := seo.site_map_id(p_site_id);
    if v_map is null then
        raise exception 'pageintentq_no_map: site % uses no topical map, so no page on it has a topic to judge a destination against', p_site_id;
    end if;

    return query
    with perf as (
        -- Byte-for-byte seo._tm_page_perf's window and dedupe (0780 decision 3): the
        -- freshest row per (page, provider, date), the per-page dimension profile only,
        -- summed across providers. A plain SUM over this table reports ~5x the truth.
        select f.page_id as pid,
               sum(f.clicks)::bigint as clicks,
               sum(f.impressions)::bigint as impressions
          from (
            select distinct on (d.page_id, d.provider, d.date)
                   d.page_id, d.clicks, d.impressions
              from seo.search_performance_daily d
             where d.site_id = p_site_id
               and d.page_id is not null
               and d.dimension_profile = 'page'
               and d.date >= (current_date - (greatest(1, p_window_days) - 1))
             order by d.page_id, d.provider, d.date, d.created_at desc, d.id desc
          ) f
         group by f.page_id
    ),
    -- ONLY pages that are already on the map, and the topic they cover most strongly.
    placed as (
        select distinct on (a.source_id)
               a.source_id as pid,
               a.target_id as tid
          from platform.associations a
          join seo.map_topic t on t.id = a.target_id
           and t.map_id = v_map and t.deleted_at is null and t.status <> 'rejected'
          join web.page p on p.id = a.source_id
         where a.source_type = 'web_page'
           and a.target_type = 'seo_map_topic'
           and a.role = 'covers'
           and a.deleted_at is null
           and p.site_id = p_site_id
           and p.deleted_at is null
           and p.status = 'active'
         order by a.source_id,
                  coalesce((a.payload ->> 'confidence')::int, 0) desc,
                  a.created_at, a.id
    ),
    live as (
        select pl.pid,
               pl.tid,
               coalesce(perf.clicks, 0) as clicks,
               coalesce(perf.impressions, 0) as impressions,
               seo.fn_page_intent_lock(pl.pid) as lock_src,
               cur.intent_source, cur.intent_disposition, cur.intent_state
          from placed pl
          left join perf on perf.pid = pl.pid
          left join lateral seo.fn_page_intent_current(pl.pid) cur on true
    ),
    upserted as (
        insert into seo.page_intent_queue as q (
            site_id, page_id, topic_id, status,
            intent_source, intent_disposition, intent_state,
            priority_clicks, priority_impressions,
            demand_window_days, demand_as_of, completed_at
        )
        select p_site_id, l.pid, l.tid,
               case when l.lock_src is not null then 'held'
                    when l.intent_source is not null then 'done'
                    else 'pending' end,
               l.intent_source, l.intent_disposition, l.intent_state,
               l.clicks, l.impressions,
               p_window_days, v_as_of,
               case when l.intent_source is not null then now() end
          from live l
        on conflict (site_id, page_id) do update set
            -- Demand and the covering topic are measurements, always refreshed.
            topic_id             = excluded.topic_id,
            priority_clicks      = excluded.priority_clicks,
            priority_impressions = excluded.priority_impressions,
            demand_window_days   = excluded.demand_window_days,
            demand_as_of         = excluded.demand_as_of,
            intent_source        = excluded.intent_source,
            intent_disposition   = excluded.intent_disposition,
            intent_state         = excluded.intent_state,
            -- The transitions a refresh may make:
            --   • anything → held, the moment a person owns this page's destination;
            --   • anything → done, the moment the page carries any intent;
            --   • done/held → pending, when the intent was removed again.
            -- A 'failed' row stays quarantined and a 'running' row is never yanked
            -- from under its worker.
            status = case
                       when excluded.status = 'held' then 'held'
                       when excluded.status = 'done' then 'done'
                       when q.status in ('done', 'held') then 'pending'
                       else q.status
                     end,
            attempts = case
                         when q.status in ('done', 'held') and excluded.status = 'pending'
                           then 0 else q.attempts
                       end,
            -- 🚨 NEVER RE-STAMP AN OLD SETTLEMENT (0782 / KI-014): the daily ceiling
            -- counts completed_at, so a reconciliation that touched it would make the
            -- ceiling read this site's lifetime and stop a pass that had spent nothing.
            completed_at = case
                             when excluded.status in ('done', 'held')
                               then coalesce(q.completed_at, now())
                             else q.completed_at
                           end,
            updated_at   = now()
        returning q.status
    )
    select (select count(*) from live)::bigint,
           (select count(*) from upserted u where u.status = 'pending')::bigint,
           (select count(*) from upserted u where u.status = 'done')::bigint,
           (select count(*) from upserted u where u.status = 'held')::bigint,
           -- Named out loud rather than silently absent: "nothing to propose" and "this
           -- site is not on the map yet" are different problems with different remedies.
           (select count(*) from web.page p
             where p.site_id = p_site_id and p.deleted_at is null and p.status = 'active'
               and not exists (select 1 from placed pl where pl.pid = p.id))::bigint;
end;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_ingestion_health(p_site_id uuid)
 RETURNS TABLE(data_first_date date, data_last_date date, covered_days bigint, missing_days integer, expected_last_date date, days_behind integer, last_run_at timestamp with time zone, last_run_status text, last_run_error text, last_success_at timestamp with time zone, consecutive_failures integer, dispatcher_last_run_at timestamp with time zone, dispatcher_last_status text, dispatcher_last_error text, dispatcher_enabled boolean, dispatcher_paused_at timestamp with time zone, dispatcher_paused_reason text, is_healthy boolean, severity text, problem text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_lag_days constant int := 2;
  v_stale_threshold constant int := 2;
  v_stuck_run_hours constant int := 6;
  -- The nightly dispatcher, seeded with this fixed id by aidream migration
  -- 0304_seo_gsc_sync_system_task.sql. Pinned by id, never by title.
  v_dispatcher_task constant uuid := 'a7c1e2d3-0000-4e5f-9a00-000000000300';
  -- Printed wherever a terminal status carries no reason. This is a DEFECT
  -- report, not a value: a run that failed without saying why means the
  -- recorder is broken, and the reader must be told that rather than handed
  -- a shrug.
  v_no_reason constant text :=
    'the run recorded no reason, which is itself a defect — whatever ended it did not say why';
  -- Google's Search Console day boundary. Not a preference and not the
  -- viewer's zone: it is the only calendar GSC reports in, and it observes
  -- DST, so the offset must come from the tz database, never a constant.
  v_gsc_timezone constant text := 'America/Los_Angeles';
  v_expected date := (now() AT TIME ZONE v_gsc_timezone)::date - v_lag_days;
  v_first date;
  v_last date;
  v_days bigint;
  v_missing int;
  v_behind int;
  v_last_run_at timestamptz;
  v_last_status text;
  v_last_error text;
  v_last_success timestamptz;
  v_consec int := 0;
  v_disp_at timestamptz;
  v_disp_status text;
  v_disp_error text;
  v_disp_enabled boolean;
  v_disp_exists boolean := false;
  v_paused_at timestamptz;
  v_paused_reason text;
  v_site_attempted_at timestamptz;
  v_attempt_clause text;
  v_problem text;
  v_severity text;
BEGIN
  IF NOT iam.has_access('web_site', p_site_id, 'viewer') THEN
    RAISE EXCEPTION 'gsc_health_forbidden: no access to site %', p_site_id;
  END IF;

  SELECT MIN(spd.date), MAX(spd.date), COUNT(DISTINCT spd.date)
    INTO v_first, v_last, v_days
  FROM seo.search_performance_daily spd
  WHERE spd.provider = 'gsc'
    AND spd.site_id = p_site_id
    AND spd.dimension_profile <> 'search_appearance';

  -- Reported, never alarmed on — see the v3 header. A day with no rows is
  -- indistinguishable from a day with no traffic.
  v_missing := CASE
    WHEN v_first IS NULL OR v_last IS NULL THEN NULL
    ELSE GREATEST(0, ((v_last - v_first) + 1) - COALESCE(v_days, 0)::int)
  END;

  SELECT COALESCE(cr.completed_at, cr.started_at, cr.created_at),
         cr.status,
         cr.error->>'message'
    INTO v_last_run_at, v_last_status, v_last_error
  FROM seo.collection_run cr
  WHERE cr.site_id = p_site_id AND cr.capability = 'search_performance'
  ORDER BY cr.created_at DESC
  LIMIT 1;

  SELECT MAX(cr.completed_at) INTO v_last_success
  FROM seo.collection_run cr
  WHERE cr.site_id = p_site_id
    AND cr.capability = 'search_performance'
    AND cr.status = 'completed';

  SELECT COUNT(*) INTO v_consec
  FROM (
    SELECT cr.status,
           bool_or(cr.status <> 'failed') OVER (
             ORDER BY cr.created_at DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS hit_non_failure
    FROM seo.collection_run cr
    WHERE cr.site_id = p_site_id AND cr.capability = 'search_performance'
    ORDER BY cr.created_at DESC
  ) head
  WHERE NOT head.hit_non_failure;

  SELECT r.started_at, r.status, NULLIF(r.error_message, '')
    INTO v_disp_at, v_disp_status, v_disp_error
  FROM scheduler.sch_run r
  WHERE r.task_id = v_dispatcher_task
  ORDER BY r.started_at DESC NULLS LAST
  LIMIT 1;

  -- THE SWITCH ITSELF. A schedule that is disabled, soft-deleted, or missing
  -- outright will never produce another run, and no amount of reading its
  -- last run can reveal that.
  SELECT true,
         t.enabled AND t.deleted_at IS NULL,
         (t.metadata #>> '{governance_suspended,at}')::timestamptz,
         t.metadata #>> '{governance_suspended,reason}'
    INTO v_disp_exists, v_disp_enabled, v_paused_at, v_paused_reason
  FROM scheduler.sch_task t
  WHERE t.id = v_dispatcher_task;

  IF NOT v_disp_exists THEN
    v_disp_enabled := false;
  END IF;

  -- Did the last dispatcher pass actually reach THIS site? v3 asserted it had
  -- not, from the dispatcher's status alone, and was wrong.
  --
  -- Scoped to trigger='scheduled': a MANUAL "Sync now" after the pass is not
  -- evidence the pass reached this site, and crediting it to the schedule
  -- would tell the reader the nightly job is doing work it is not doing.
  IF v_disp_at IS NOT NULL THEN
    SELECT MAX(COALESCE(cr.completed_at, cr.started_at, cr.created_at))
      INTO v_site_attempted_at
    FROM seo.collection_run cr
    WHERE cr.site_id = p_site_id
      AND cr.capability = 'search_performance'
      AND cr.trigger = 'scheduled'
      AND cr.created_at >= v_disp_at;
  END IF;

  v_attempt_clause := CASE
    WHEN v_site_attempted_at IS NULL
      THEN 'This site was never reached on that pass'
    ELSE format('This site was collected on that pass (%s), and nothing scheduled has run since',
                to_char(v_site_attempted_at AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI'))
  END;

  v_behind := CASE WHEN v_last IS NULL THEN NULL ELSE (v_expected - v_last) END;

  IF v_last IS NULL AND v_last_run_at IS NULL THEN
    v_severity := 'info';
    v_problem := 'This site has never ingested Search Console data. Run a sync to backfill.';
  ELSIF v_last IS NULL THEN
    v_severity := 'critical';
    v_problem := 'Collection runs exist but no data landed — every run persisted zero rows.';
  ELSIF v_last_status IN ('running', 'pending')
        AND v_last_run_at < now() - make_interval(hours => v_stuck_run_hours) THEN
    v_severity := 'critical';
    v_problem := format(
      'A collection run has been stuck in %s since %s. It is not in flight — the worker died mid-run.',
      v_last_status, to_char(v_last_run_at AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI'));
  ELSIF v_consec >= 1 THEN
    v_severity := 'critical';
    v_problem := format('The last %s collection run(s) for this site failed: %s',
                        v_consec, COALESCE(v_last_error, v_no_reason));
  -- THE SWITCH, ahead of every run-history branch: when the nightly job is
  -- off, no run history explains the staleness and no retry can fix it.
  ELSIF NOT v_disp_enabled THEN
    v_severity := CASE WHEN COALESCE(v_behind, 0) >= v_stale_threshold
                       THEN 'critical' ELSE 'warning' END;
    -- The raw governance reason is machine-shaped ("no exact name+interval
    -- approval in common-docs/…") and means nothing to the expert whose
    -- dashboard this is. It travels in dispatcher_paused_reason for the copy
    -- payload and for agents; the sentence a human reads says what is true
    -- and what happens next.
    v_problem := format(
      'The nightly Search Console sync is switched OFF%s, so no site is being kept current. %s. Data here is %s days behind. Sync now updates this site once; the nightly job stays off until an administrator turns it back on.',
      CASE WHEN v_paused_at IS NULL THEN ''
           ELSE ' (paused ' || to_char(v_paused_at AT TIME ZONE 'utc', 'YYYY-MM-DD') || ')' END,
      v_attempt_clause,
      COALESCE(v_behind, 0));
  ELSIF v_disp_status = 'failed'
        AND COALESCE(v_behind, 0) >= v_stale_threshold THEN
    v_severity := 'critical';
    v_problem := format(
      'The nightly Search Console job is failing (last run %s: %s). %s — data is %s days behind.',
      to_char(v_disp_at AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI'),
      COALESCE(v_disp_error, v_no_reason), v_attempt_clause, v_behind);
  ELSIF v_behind >= v_stale_threshold THEN
    v_severity := 'critical';
    v_problem := format(
      'Data is %s days behind (latest %s, expected %s). Ingestion has stopped keeping up.',
      v_behind, v_last, v_expected);
  ELSE
    v_severity := NULL;
    v_problem := NULL;
  END IF;

  RETURN QUERY SELECT
    v_first, v_last, COALESCE(v_days, 0), v_missing, v_expected, v_behind,
    v_last_run_at, v_last_status, v_last_error, v_last_success, v_consec,
    v_disp_at, v_disp_status, v_disp_error,
    v_disp_enabled, v_paused_at, v_paused_reason,
    v_problem IS NULL, v_severity, v_problem;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_set_keyword_topic(p_site_id uuid, p_keyword_ids uuid[], p_topic_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(keyword_id uuid, value_band text, value_source text, value_score numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
-- The OUT parameter `keyword_id` shadows the column in ON CONFLICT without
-- this — the same pragma gsc_set_keyword_value already carries.
#variable_conflict use_column
DECLARE
  v_org uuid;
  v_notes text := NULLIF(btrim(p_notes), '');
  v_node_type text;
  v_offering uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords';
  END IF;
  -- The same ceiling `gsc_set_keyword_stamps` carries, said the same way.
  IF array_length(p_keyword_ids, 1) > 5000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: up to 5,000 keywords in one go.';
  END IF;

  IF p_topic_id IS NOT NULL THEN
    SELECT t.node_type INTO v_node_type FROM seo.topic t WHERE t.id = p_topic_id AND t.deleted_at IS NULL;
    IF NOT FOUND THEN
      perform platform.refuse_not_found(format('seo_topic_not_found: no topic %s', p_topic_id));
    END IF;
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  -- TRANSITION (brand-offerings cutover): the value resolver reads the
  -- canonical placement. An offering placement is written through THE
  -- placement writer; a taxonomy placement or a removal takes the keyword off
  -- this site's offerings. Deleted when every caller writes offerings directly.
  IF p_topic_id IS NOT NULL AND v_node_type IN ('product', 'service') THEN
    v_offering := seo.fn_site_offering_for_topic(p_site_id, p_topic_id);
    PERFORM 1 FROM seo.write_site_keyword_offering(v_org, p_site_id, p_keyword_ids, v_offering, v_notes, 'human');
  ELSE
    PERFORM 1 FROM seo.write_site_keyword_offering(v_org, p_site_id, p_keyword_ids, NULL, NULL, 'human');
  END IF;

  -- P30: placing a keyword while working a SITE states THAT SITE's opinion.
  -- Demotion (freeing the one-primary-per-scope index before the insert
  -- below) is scoped to this site's own rows only — a site placement can
  -- never demote, and therefore never overwrite, a brand/organization/system
  -- row for the same keyword.
  UPDATE seo.keyword_topic kt
  SET is_primary = false, updated_at = now(), updated_by = (SELECT auth.uid())
  WHERE kt.keyword_id = ANY (p_keyword_ids) AND kt.is_primary
    AND kt.scope_tier = 'site' AND kt.scope_site_id = p_site_id
    AND (p_topic_id IS NULL OR kt.topic_id <> p_topic_id);

  IF p_topic_id IS NULL THEN
    RETURN QUERY
    SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
    FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
    RETURN;
  END IF;

  -- The ON CONFLICT arbiter is uq_keyword_topic_site_scope
  -- (keyword_id, topic_id, scope_site_id) WHERE scope_tier='site' — it can
  -- only ever match another scope_tier='site' row for THIS site, so this
  -- upsert can never touch a higher tier's row even when that tier chose the
  -- exact same topic for the exact same keyword.
  INSERT INTO seo.keyword_topic AS kt
    (organization_id, created_by, keyword_id, topic_id, is_primary, assigned_by,
     notes, scope_tier, scope_site_id)
  SELECT v_org, (SELECT auth.uid()), kid, p_topic_id, true, 'human',
         v_notes, 'site', p_site_id
  FROM unnest(p_keyword_ids) AS kid
  ON CONFLICT (keyword_id, topic_id, scope_site_id) WHERE (scope_tier = 'site')
  DO UPDATE SET
    is_primary = true,
    deleted_at = NULL,
    assigned_by = 'human',
    -- A new reason replaces the old one; placing again WITHOUT a reason never
    -- erases the sentence someone already wrote.
    notes = COALESCE(EXCLUDED.notes, kt.notes),
    updated_at = now(),
    updated_by = (SELECT auth.uid());

  RETURN QUERY
  SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
  FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
EXCEPTION
  WHEN unique_violation THEN
    -- The table-wide keyword_id+topic_id constraint (kept for
    -- gsc_topic_delete's cross-tier merge) is the only other unique key that
    -- could still fire here — only when a higher tier already claimed the
    -- exact same topic for this exact keyword. Fail loud rather than let the
    -- upsert silently mutate that tier's row.
    RAISE EXCEPTION 'seo_topic_tier_conflict: keyword % already carries topic % at another tier — place it under a different Offering, or edit that tier''s placement directly', p_keyword_ids, p_topic_id
      USING ERRCODE = '23505';
END;
$function$;

CREATE OR REPLACE FUNCTION seo.keyword_meaning_suggest(p_site_id uuid, p_proposal jsonb, p_title text, p_body text DEFAULT NULL::text, p_reasoning text DEFAULT NULL::text, p_confidence real DEFAULT NULL::real, p_evidence jsonb DEFAULT NULL::jsonb, p_provenance jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(assist_id uuid, status text, dedupe_key text, payload_hash text, addressee uuid, proposal jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'web', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_site      record;
  v_kind      text := p_proposal ->> 'proposal';
  v_p         jsonb := p_proposal;
  v_hash      text;
  v_dedupe    text;
  v_existing  record;
  v_action    jsonb;
  v_id        uuid;
  v_source    text;
  v_dim       record;
  v_val       record;
  v_fact      record;
  v_label     text;
  v_ids       uuid[];
  v_phrases   jsonb;
  v_by_agent  boolean;
  v_addressee uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_suggest_unauthenticated';
  END IF;
  PERFORM seo.gsc_assert_site_access(p_site_id);

  IF v_kind IS NULL OR v_kind NOT IN ('matcher','worth','stamp','guideline_edit','offering') THEN
    RAISE EXCEPTION 'seo_suggest_bad_proposal: proposal must be matcher | worth | stamp | guideline_edit | offering (got %)', COALESCE(v_kind,'null');
  END IF;
  IF NULLIF(btrim(COALESCE(p_title,'')),'') IS NULL THEN
    RAISE EXCEPTION 'seo_suggest_title_required: say in one line what you are proposing';
  END IF;

  SELECT s.id AS id, s.organization_id AS organization_id, s.created_by AS created_by,
         COALESCE(s.name, s.domain) AS label
    INTO v_site
    FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_site.id IS NULL THEN
    perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_site_id));
  END IF;
  -- KI-034 — WHO IS ASKED TO APPROVE THIS.
  -- An agent's proposal always goes to the owner of the thing being changed.
  -- A person's own proposal goes to that person, provided they may edit the
  -- site. Before this every proposal was addressed to the site owner, so an
  -- agency employee who corrected a keyword was told to approve it in a queue
  -- they could not open — their own work was invisible to them.
  -- Agent origin is read off the provenance the tool layer stamps (tool call,
  -- run, agent name); a person acting in the product carries none of those.
  v_by_agent := COALESCE(p_provenance, '{}'::jsonb) ?| ARRAY['toolCallId','runId','agentName'];
  -- KI-031: a draft a PERSON asked for in the product comes back to that
  -- person, provided they may edit the site. `auth.uid()` still decides who
  -- that is; `requestedBy` only asserts that a human initiated the run.
  v_addressee := CASE
    WHEN (COALESCE(p_provenance, '{}'::jsonb) ? 'requestedBy')
         AND seo.fn_is_site_editor(p_site_id) THEN v_uid
    WHEN v_by_agent THEN v_site.created_by
    WHEN seo.fn_is_site_editor(p_site_id) THEN v_uid
    ELSE v_site.created_by
  END;
  IF v_addressee IS NULL THEN
    RAISE EXCEPTION 'seo_suggest_no_addressee: site % has no owner to approve this', p_site_id;
  END IF;

  IF v_kind IN ('matcher','worth','stamp') THEN
    SELECT d.id AS id, d.slug AS slug, d.name AS label,
           COALESCE(d.metadata->>'scope','platform') AS scope,
           (d.metadata->>'site_id')::uuid AS dim_site_id
      INTO v_dim
    FROM platform.categories d
    WHERE d.dimension = 'seo_facet' AND d.parent_id IS NULL AND d.deleted_at IS NULL
      AND d.slug = (v_p ->> 'dimensionSlug');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'seo_suggest_unknown_dimension: there is no dimension named "%"', COALESCE(v_p ->> 'dimensionSlug','(none)');
    END IF;
    IF v_dim.scope = 'site' AND v_dim.dim_site_id IS DISTINCT FROM p_site_id THEN
      RAISE EXCEPTION 'seo_suggest_forbidden: "%" belongs to another site', v_dim.slug;
    END IF;

    SELECT v.id AS id, v.name AS label
      INTO v_val
    FROM platform.categories v
    WHERE v.parent_id = v_dim.id AND v.deleted_at IS NULL
      AND v.slug = v_dim.slug || ':' || (v_p ->> 'valueSlug');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'seo_suggest_unknown_value: "%" is not a value of "%". Propose it on the dimension first.', COALESCE(v_p ->> 'valueSlug','(none)'), v_dim.slug;
    END IF;

    v_p := v_p || jsonb_build_object(
      'valueId',        v_val.id,
      'dimensionSlug',  v_dim.slug,
      'dimensionLabel', v_dim.label,
      'valueSlug',      v_p ->> 'valueSlug',
      'valueLabel',     v_val.label
    );
  END IF;

  IF v_kind = 'matcher' THEN
    IF (v_p ->> 'matcherKind') = 'place' AND (v_p ->> 'placeId') IS NOT NULL THEN
      SELECT g.name INTO v_label FROM seo.geo_place g
       WHERE g.id = (v_p ->> 'placeId')::uuid AND g.deleted_at IS NULL;
      IF v_label IS NULL THEN
        RAISE EXCEPTION 'seo_suggest_unknown_place: % is not a place in the gazetteer', v_p ->> 'placeId';
      END IF;
      v_p := v_p || jsonb_build_object('placeLabel', v_label);
    ELSIF (v_p ->> 'matcherKind') = 'fact' THEN
      SELECT v.id AS id, d.name || ' -> ' || v.name AS label
        INTO v_fact
      FROM platform.categories v
      JOIN platform.categories d ON d.id = v.parent_id AND d.deleted_at IS NULL
      WHERE v.deleted_at IS NULL AND v.dimension = 'seo_facet'
        AND d.slug = (v_p ->> 'factDimensionSlug')
        AND v.slug = (v_p ->> 'factDimensionSlug') || ':' || (v_p ->> 'factValueSlug');
      IF NOT FOUND THEN
        RAISE EXCEPTION 'seo_suggest_unknown_fact: "%:%" is not a dimension value', COALESCE(v_p ->> 'factDimensionSlug','(none)'), COALESCE(v_p ->> 'factValueSlug','(none)');
      END IF;
      v_p := v_p || jsonb_build_object('factValueId', v_fact.id, 'factLabel', v_fact.label);
    ELSIF (v_p ->> 'matcherKind') = 'condition' AND (v_p ->> 'conditionRuleId') IS NOT NULL THEN
      SELECT r.name INTO v_label FROM seo.gsc_dig_rule r
       WHERE r.id = (v_p ->> 'conditionRuleId')::uuid AND r.deleted_at IS NULL;
      IF v_label IS NULL THEN
        RAISE EXCEPTION 'seo_suggest_unknown_condition: % is not a Dig Here rule', v_p ->> 'conditionRuleId';
      END IF;
      v_p := v_p || jsonb_build_object('conditionLabel', v_label);
    END IF;
  END IF;

  IF v_kind = 'stamp' THEN
    SELECT array_agg(x::uuid) INTO v_ids
      FROM jsonb_array_elements_text(COALESCE(v_p -> 'keywordIds','[]'::jsonb)) AS t(x);
    IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
      RAISE EXCEPTION 'gsc_no_keywords: choose at least one keyword';
    END IF;
    SELECT jsonb_agg(k.phrase ORDER BY k.phrase) INTO v_phrases
      FROM seo.keyword k WHERE k.id = ANY(v_ids) AND k.deleted_at IS NULL;
    IF v_phrases IS NULL THEN
      RAISE EXCEPTION 'seo_suggest_unknown_keywords: none of those keyword ids exist';
    END IF;
    v_p := v_p || jsonb_build_object('keywordPhrases', v_phrases);
  END IF;

  IF v_kind = 'guideline_edit' THEN
    v_p := v_p || jsonb_build_object(
      'baseVersion',
      COALESCE((SELECT (s.settings -> 'kw_guidelines' ->> 'version')::int
                  FROM web.site s WHERE s.id = p_site_id), 0)
    );
    IF NULLIF(btrim(COALESCE(v_p ->> 'proposedText','')),'') IS NULL THEN
      RAISE EXCEPTION 'seo_suggest_empty_guidelines: send the FULL proposed document, not a patch';
    END IF;
  END IF;

  -- KI-040 step 6: an Offering the Business Discovery Ladder proposes.
  IF v_kind = 'offering' THEN
    IF NULLIF(btrim(COALESCE(v_p ->> 'name','')),'') IS NULL THEN
      RAISE EXCEPTION 'seo_suggest_offering_name_required: name the offering';
    END IF;
    IF COALESCE(v_p ->> 'offeringKind','') NOT IN ('product','service') THEN
      RAISE EXCEPTION 'seo_suggest_offering_kind: an offering is a product or a service (got %)', COALESCE(v_p ->> 'offeringKind','null');
    END IF;
    IF (v_p ? 'valueAdd') AND jsonb_typeof(v_p -> 'valueAdd') NOT IN ('number','null') THEN
      RAISE EXCEPTION 'seo_suggest_offering_value: valueAdd is a number of points or null';
    END IF;
    v_p := v_p || jsonb_build_object('name', btrim(v_p ->> 'name'));
  END IF;

  v_hash   := md5(v_p::text);
  v_dedupe := 'seo.keyword_meaning:' || p_site_id::text || ':' || v_hash;
  v_source := 'seo.keyword_meaning.' || v_kind;

  SELECT a.id AS id, a.status AS status INTO v_existing
    FROM platform.assists a
   WHERE a.dedupe_key = v_dedupe AND a.deleted_at IS NULL
   ORDER BY (a.status = 'pending') DESC, a.created_at DESC
   LIMIT 1;

  IF v_existing.id IS NOT NULL AND v_existing.status IN ('accepted','dismissed') THEN
    RETURN QUERY SELECT v_existing.id, 'already_decided'::text, v_dedupe, v_hash, v_addressee, v_p;
    RETURN;
  END IF;

  IF v_existing.id IS NOT NULL AND v_existing.status = 'pending' THEN
    UPDATE platform.assists a
       SET title       = p_title,
           body        = p_body,
           reasoning   = p_reasoning,
           confidence  = p_confidence,
           evidence    = p_evidence,
           occurrences = a.occurrences + 1,
           updated_at  = now()
     WHERE a.id = v_existing.id;
    RETURN QUERY SELECT v_existing.id, 'already_pending'::text, v_dedupe, v_hash, v_addressee, v_p;
    RETURN;
  END IF;

  v_action := jsonb_build_object(
    'kind',        'apply_keyword_meaning',
    'siteId',      p_site_id,
    'siteLabel',   v_site.label,
    'proposal',    v_p,
    'provenance',  COALESCE(p_provenance, '{}'::jsonb)
                     || jsonb_build_object('proposedBy', v_uid,
                                           'proposedByAgent', v_by_agent,
                                           'addressedTo', v_addressee),
    'payloadHash', v_hash
  );

  INSERT INTO platform.assists
    (user_id, entity_type, entity_id, surface_name, source_kind, source_key,
     title, body, reasoning, confidence, action, dedupe_key, expires_at,
     priority, organization_id, evidence, first_seen_at)
  VALUES
    (v_addressee, 'web_site', p_site_id,
     'matrx-user/keyword-meaning-review', 'agent', v_source,
     p_title, p_body, p_reasoning, p_confidence, v_action, v_dedupe,
     now() + interval '30 days',
     0, v_site.organization_id, p_evidence, now())
  RETURNING assists.id INTO v_id;

  RETURN QUERY SELECT v_id, 'created'::text, v_dedupe, v_hash, v_addressee, v_p;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.map_facet_value_ref(p_value_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_type text; v_id uuid; v_brand uuid; v_org uuid; v_found boolean := false;
BEGIN
  IF p_value_id IS NULL THEN RAISE EXCEPTION 'map_facet_value_ref: p_value_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  SELECT ref_type, ref_id, brand_id, organization_id INTO v_type, v_id, v_brand, v_org
    FROM seo.map_facet_value WHERE id = p_value_id AND deleted_at IS NULL;
  v_found := FOUND;
  -- The reachability gate runs BEFORE any return: an unreachable value and an id
  -- that is no value at all are the same sentence.
  IF NOT COALESCE(v_found, false)
     OR NOT COALESCE(public.is_platform_admin()
               OR (v_brand IS NOT NULL AND iam.has_access('web_brand', v_brand, 'viewer'::public.permission_level))
               OR (v_brand IS NULL AND v_org IN (SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable))
               OR EXISTS (SELECT 1 FROM seo.topical_map m
                           WHERE m.deleted_at IS NULL
                             AND ((v_brand IS NOT NULL AND m.brand_id = v_brand)
                                  OR (v_brand IS NULL AND m.organization_id = v_org))
                             AND iam.has_access('seo_topical_map', m.id, 'viewer'::public.permission_level)), false) THEN
    RAISE EXCEPTION 'map_facet_value_ref_denied: no access to facet value %', p_value_id USING ERRCODE='42501';
  END IF;
  IF v_type IS NULL OR v_id IS NULL THEN RETURN NULL; END IF;
  -- ROUND 18: a ref to a row this caller cannot open is NULL, identical to no ref.
  RETURN seo._tm_ref(v_type, v_id);
END $function$;

CREATE OR REPLACE FUNCTION seo.release_page_measurement_quarantine(p_page_id uuid, p_strategy text DEFAULT 'mobile'::text, p_reason text DEFAULT 'manual release'::text)
 RETURNS seo.page_measurement_health
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row seo.page_measurement_health;
begin
    select * into v_row
      from seo.page_measurement_health
     where page_id = p_page_id and strategy = p_strategy;
    if v_row.id is null then
        raise exception 'no measurement health row for page % [%]', p_page_id, p_strategy;
    end if;
    if not iam.has_access('web_page', v_row.page_id, 'editor') then
        raise exception 'page not found or access denied';
    end if;
    update seo.page_measurement_health set
        consecutive_terminal_failures = 0,
        quarantined_at = null,
        quarantine_reason = null,
        quarantine_expires_at = null,
        released_at = now(),
        release_reason = p_reason,
        updated_at = now()
    where id = v_row.id
    returning * into v_row;
    return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION seo.set_site_map(p_site_id uuid, p_map_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_site_brand uuid; v_site_org uuid; v_old uuid;
BEGIN
  IF p_site_id IS NULL THEN RAISE EXCEPTION 'set_site_map: p_site_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'set_site_map: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'editor');
  PERFORM seo._tm_site(p_site_id, 'editor'::public.permission_level, 'set_site_map_denied');
  SELECT s.brand_id, s.organization_id INTO v_site_brand, v_site_org
    FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_site_brand IS DISTINCT FROM v_map.brand_id THEN
    RAISE EXCEPTION 'set_site_map: site brand % does not match map brand %', v_site_brand, v_map.brand_id USING ERRCODE='23514';
  END IF;
  -- TAILS-7: ARCHIVED, NOT DESTROYED. Which map a site uses is a person's own
  -- deliberate choice, and moving a site from one map to another and back used to
  -- destroy the first edge outright: a new row, a new id, no created_by, no day it
  -- was first chosen. It is withdrawn now, so putting the site back on its old map
  -- revives THE SAME edge (platform.revive_tombstoned_association) with its history.
  -- The loop is at most one row: there is one `uses` edge per site.
  FOR v_old IN
    SELECT a.target_id FROM platform.associations a
     WHERE a.source_type='web_site' AND a.source_id=p_site_id
       AND a.target_type='seo_topical_map' AND a.role='uses' AND a.deleted_at IS NULL
  LOOP
    PERFORM platform.assoc_unset('web_site', p_site_id, 'seo_topical_map', v_old, 'uses',
                                 'web_site', p_site_id);
  END LOOP;
  INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role)
  VALUES ('web_site', p_site_id, 'seo_topical_map', p_map_id, v_site_org, 'uses');
  RETURN jsonb_build_object('ok', true, 'site_id', p_site_id, 'map_id', p_map_id);
END $function$;

CREATE OR REPLACE FUNCTION seo.site_map_id(p_site_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map uuid;
BEGIN
  -- ROUND 17: NULL used to answer NULL ("no site, no map"), which a caller
  -- cannot tell from "this site uses no map". A missing argument is 22023.
  IF p_site_id IS NULL THEN RAISE EXCEPTION 'site_map_id: p_site_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF NOT (public.is_platform_admin()
          OR iam.has_access('web_site', p_site_id, 'viewer'::public.permission_level)) THEN
    RAISE EXCEPTION 'site_map_denied: no viewer access to site %', p_site_id USING ERRCODE = '42501';
  END IF;
  SELECT a.target_id INTO v_map FROM platform.associations a
   WHERE a.source_type='web_site' AND a.source_id=p_site_id
     AND a.target_type='seo_topical_map' AND a.role='uses' AND a.deleted_at IS NULL
   LIMIT 1;
  RETURN v_map;
END $function$;

CREATE OR REPLACE FUNCTION seo.site_value_worth_upsert(p_site_id uuid, p_value_id uuid, p_effect text, p_amount numeric DEFAULT NULL::numeric, p_origin text DEFAULT 'human'::text, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, site_id uuid, value_id uuid, effect text, amount numeric, origin text, notes text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'web', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_org    uuid;
  v_dim    record;
  v_id     uuid;
  v_amount numeric;
  v_notes  text := NULLIF(btrim(COALESCE(p_notes,'')),'');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_worth_unauthenticated';
  END IF;
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  SELECT s.organization_id INTO v_org FROM web.site s
   WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_org IS NULL THEN
    perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_site_id));
  END IF;

  IF p_effect NOT IN ('add','scale','never','clear') THEN
    RAISE EXCEPTION 'seo_worth_bad_effect: % (add | scale | never | clear)', p_effect;
  END IF;
  IF p_origin NOT IN ('human','pack','agent','migration') THEN
    RAISE EXCEPTION 'seo_worth_bad_origin: %', p_origin;
  END IF;

  SELECT v.id AS id,
         d.slug AS dimension_slug,
         COALESCE(d.metadata->>'scope','platform') AS scope,
         (d.metadata->>'site_id')::uuid AS dim_site_id
    INTO v_dim
  FROM platform.categories v
  JOIN platform.categories d ON d.id = v.parent_id AND d.deleted_at IS NULL
  WHERE v.id = p_value_id AND v.deleted_at IS NULL AND v.dimension = 'seo_facet';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_worth_unknown_value: % is not a value of any keyword dimension', p_value_id;
  END IF;
  IF v_dim.scope = 'site' AND v_dim.dim_site_id IS DISTINCT FROM p_site_id THEN
    RAISE EXCEPTION 'seo_worth_forbidden: "%" belongs to another site', v_dim.dimension_slug;
  END IF;

  IF p_effect = 'clear' THEN
    UPDATE seo.site_value_worth w
       SET deleted_at = now(), updated_by = v_uid, updated_at = now()
     WHERE w.site_id = p_site_id AND w.value_id = p_value_id AND w.deleted_at IS NULL;
    RETURN;
  END IF;

  v_amount := CASE WHEN p_effect = 'never' THEN NULL ELSE p_amount END;

  -- Explicit find-then-write, NOT `ON CONFLICT (site_id, value_id)`: this
  -- function's RETURNS TABLE out-params are named after the very columns the
  -- conflict target names, and PL/pgSQL resolves that to "column reference
  -- site_id is ambiguous" AT RUN TIME — the function creates cleanly and then
  -- fails on the first real call. svw_site_value_uniq still guarantees the
  -- one-row-per-(site,value) rule underneath.
  SELECT w.id INTO v_id
    FROM seo.site_value_worth w
   WHERE w.site_id = p_site_id AND w.value_id = p_value_id AND w.deleted_at IS NULL
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO seo.site_value_worth AS w
      (site_id, value_id, effect, amount, origin, notes, organization_id, created_by, updated_by)
    VALUES
      (p_site_id, p_value_id, p_effect, v_amount, p_origin, v_notes, v_org, v_uid, v_uid)
    RETURNING w.id INTO v_id;
  ELSE
    UPDATE seo.site_value_worth w
       SET effect     = p_effect,
           amount     = v_amount,
           origin     = p_origin,
           notes      = COALESCE(v_notes, w.notes),
           updated_by = v_uid,
           updated_at = now()
     WHERE w.id = v_id;
  END IF;

  RETURN QUERY
  SELECT w.id, w.site_id, w.value_id, w.effect, w.amount, w.origin, w.notes, w.updated_at
    FROM seo.site_value_worth w WHERE w.id = v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.starter_pack_detail(p_pack_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'iam', 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_out jsonb;
begin
  if not (public.is_admin()
          or (v_uid is not null and public.is_pack_curator(v_uid, p_pack_id))
          or (v_uid is not null and public.user_can_read_via_library_grant(v_uid, 'seo_starter_pack', p_pack_id))) then
    raise exception 'seo_pack_not_entitled: %', p_pack_id using errcode = '42501';
  end if;
  select jsonb_build_object(
    'pack', (to_jsonb(p) - 'proposal') || jsonb_build_object(
              'industry_name', ind.name, 'industry_slug', ind.slug,
              'can_author', (public.is_admin() or (v_uid is not null and public.is_pack_curator(v_uid, p.id) and p.status in ('draft','proposed'))),
              'is_admin', public.is_admin(),
              'subscriber_count', (select count(*) from platform.entity_grants g where g.entity_type='seo_starter_pack' and g.entity_id=p.id and g.audience='organization'),
              'open_questions', coalesce(p.metadata->'open_questions', '[]'::jsonb),
              'status_history', coalesce(p.metadata->'status_history', '[]'::jsonb)),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'topic_id', t.id, 'name', t.name, 'slug', t.slug, 'node_type', t.node_type, 'parent_id', t.parent_id,
        'description', t.description, 'weight', i.weight, 'lead_quality', i.lead_quality, 'offering_match', i.offering_match,
        'notes', i.notes, 'sort', i.sort) order by i.sort, t.name)
      from seo.starter_pack_item i join seo.topic t on t.id = i.topic_id and t.deleted_at is null
      where i.pack_id = p.id and i.item_kind = 'topic' and i.deleted_at is null), '[]'::jsonb),
    'value_bands', coalesce((
      select jsonb_agg(jsonb_build_object('item_id', i.id, 'value', i.value, 'label', i.label, 'description', i.description,
        'config', i.config, 'notes', i.notes, 'sort', i.sort) order by i.sort)
      from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'value_band' and i.deleted_at is null), '[]'::jsonb),
    'geo_bands', coalesce((
      select jsonb_agg(jsonb_build_object('item_id', i.id, 'value', i.value, 'label', i.label, 'description', i.description,
        'config', i.config, 'notes', i.notes, 'sort', i.sort) order by i.sort)
      from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'geo_band' and i.deleted_at is null), '[]'::jsonb),
    'geo_areas', coalesce((
      select jsonb_agg(jsonb_build_object('item_id', i.id, 'label', i.label, 'area_kind', i.area_kind, 'match_tokens', i.match_tokens,
        'geo_band', i.geo_band, 'notes', i.notes, 'sort', i.sort) order by i.sort)
      from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'geo_area' and i.deleted_at is null), '[]'::jsonb),
    'meaning', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'dimension_scope', i.dimension_scope, 'dimension_slug', i.dimension_slug,
        'dimension_label', i.dimension_label, 'value', i.value, 'label', i.label,
        'description', i.description, 'notes', i.notes, 'matchers', i.matchers,
        'worth_effect', i.worth_effect, 'worth_amount', i.worth_amount, 'sort', i.sort)
        order by i.sort, i.label)
      from seo.starter_pack_item i where i.pack_id = p.id and i.item_kind = 'meaning' and i.deleted_at is null), '[]'::jsonb))
  into v_out
  from seo.starter_pack p left join iam.industries ind on ind.id = p.industry_id
  where p.id = p_pack_id and p.deleted_at is null;
  return v_out;
end $function$;

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

  -- WHO ADOPTED: the saver (updated_by) on the component tables below — their created_by is the
  -- SITE's owner (db-rules §6d-1). keyword_class_rule is an entity, so its created_by is the person.
  select x.created_at, x.created_by into v_adopted_at, v_adopted_by
  from (
    select r.created_at, r.created_by from seo.keyword_class_rule r
     where r.site_id = p_site_id and r.metadata->>'adopted_from_pack' = v_slug
    union all
    select v.created_at, v.updated_by from seo.site_vocabulary v
     where v.site_id = p_site_id and v.metadata->>'adopted_from_pack' = v_slug
    union all
    select g.created_at, g.updated_by from seo.site_geo_area g
     where g.site_id = p_site_id and g.metadata->>'adopted_from_pack' = v_slug
    union all
    select t.created_at, t.updated_by from seo.site_topic_value t
     where t.site_id = p_site_id and t.metadata->>'adopted_from_pack' = v_slug
    union all
    select w.created_at, w.updated_by from seo.site_value_worth w
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

CREATE OR REPLACE FUNCTION public.set_scope_context_value(p_scope_id uuid, p_context_item_id uuid, p_value_text text DEFAULT NULL::text, p_value_number numeric DEFAULT NULL::numeric, p_value_boolean boolean DEFAULT NULL::boolean, p_value_json jsonb DEFAULT NULL::jsonb, p_value_document_url text DEFAULT NULL::text, p_value_date date DEFAULT NULL::date, p_value_timestamp timestamp with time zone DEFAULT NULL::timestamp with time zone, p_value_time time without time zone DEFAULT NULL::time without time zone, p_change_summary text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row context.context_item_values;
BEGIN
  PERFORM context._assert_scope_readable(p_scope_id, 'editor');
  IF NOT EXISTS (
    SELECT 1 FROM context.context_items ci
    JOIN context.scopes s ON s.id = p_scope_id
    WHERE ci.id = p_context_item_id AND ci.scope_type_id = s.scope_type_id
  ) THEN
    RAISE EXCEPTION 'context item % does not belong to scope %', p_context_item_id, p_scope_id USING ERRCODE = '22023';
  END IF;
  v_row := context.write_context_value(
    p_item_id => p_context_item_id, p_scope_id => p_scope_id,
    p_value_text => p_value_text, p_value_number => p_value_number, p_value_boolean => p_value_boolean,
    p_value_json => p_value_json, p_value_date => p_value_date, p_value_document_url => p_value_document_url,
    p_value_timestamp => p_value_timestamp, p_value_time => p_value_time,
    p_change_summary => p_change_summary, p_source_type => 'manual', p_actor => (select auth.uid())
  );
  RETURN jsonb_build_object(
    'id', v_row.id, 'context_item_id', v_row.context_item_id, 'scope_id', v_row.scope_id,
    'version', v_row.version, 'is_current', v_row.is_current,
    'value_text', v_row.value_text, 'value_number', v_row.value_number,
    'value_boolean', v_row.value_boolean, 'value_json', v_row.value_json,
    'value_date', v_row.value_date, 'value_timestamp', v_row.value_timestamp, 'value_time', v_row.value_time,
    'value_document_url', v_row.value_document_url, 'created_at', v_row.created_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_file(p_file_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_ok BOOLEAN := false;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('file', p_file_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to delete file %', p_file_id USING ERRCODE = '42501';
    END IF;
    UPDATE files.files SET deleted_at = now()
     WHERE id = p_file_id AND deleted_at IS NULL
    RETURNING true INTO v_ok;
    IF v_ok THEN
        UPDATE platform.share_links SET is_active = false
         WHERE resource_type = 'file' AND resource_id = p_file_id;
    END IF;
    RETURN COALESCE(v_ok, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_folder(p_folder_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_owner UUID;
    v_folders INT;
    v_files INT;
    v_links INT;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('folder', p_folder_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to delete folder %', p_folder_id USING ERRCODE = '42501';
    END IF;
    SELECT created_by INTO v_owner FROM files.folders WHERE id = p_folder_id AND deleted_at IS NULL;
    IF v_owner IS NULL THEN
        RETURN jsonb_build_object('folders', 0, 'files', 0, 'links', 0);
    END IF;

    WITH RECURSIVE descendants AS (
        SELECT id FROM files.folders WHERE id = p_folder_id
        UNION ALL
        SELECT d.id
          FROM files.folders d
          JOIN descendants ds ON d.parent_id = ds.id
         WHERE d.deleted_at IS NULL
    ),
    deleted_folders AS (
        UPDATE files.folders
           SET deleted_at = now()
         WHERE id IN (SELECT id FROM descendants)
           AND deleted_at IS NULL
        RETURNING id
    ),
    deleted_files AS (
        UPDATE files.files
           SET deleted_at = now()
         WHERE parent_folder_id IN (SELECT id FROM deleted_folders)
           AND deleted_at IS NULL
        RETURNING id
    ),
    deactivated_links AS (
        UPDATE platform.share_links
           SET is_active = false
         WHERE (resource_type = 'folder' AND resource_id IN (SELECT id FROM deleted_folders))
            OR (resource_type = 'file'   AND resource_id IN (SELECT id FROM deleted_files))
        RETURNING id
    )
    SELECT
        (SELECT count(*) FROM deleted_folders),
        (SELECT count(*) FROM deleted_files),
        (SELECT count(*) FROM deactivated_links)
    INTO v_folders, v_files, v_links;

    RETURN jsonb_build_object('folders', v_folders, 'files', v_files, 'links', v_links);
END;
$function$;

CREATE OR REPLACE FUNCTION public.study_record_attempt(p_item_type text, p_item_id uuid, p_session_id uuid DEFAULT NULL::uuid, p_method text DEFAULT 'flashcards'::text, p_result text DEFAULT NULL::text, p_score jsonb DEFAULT NULL::jsonb, p_score_value numeric DEFAULT NULL::numeric, p_response_kind text DEFAULT NULL::text, p_response_audio_file_id uuid DEFAULT NULL::uuid, p_response_image_file_id uuid DEFAULT NULL::uuid, p_response_transcript text DEFAULT NULL::text, p_latency_ms integer DEFAULT NULL::integer, p_graded_by text DEFAULT NULL::text, p_difficulty numeric DEFAULT NULL::numeric, p_stability numeric DEFAULT NULL::numeric, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_retrievability numeric DEFAULT NULL::numeric, p_lapses integer DEFAULT NULL::integer, p_attempt_id uuid DEFAULT NULL::uuid, p_reviewed_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_attempt_id uuid;
  v_existing education.study_attempt%rowtype;
  v_correct boolean := (p_result = 'correct');
  v_partial boolean := (p_result = 'partial');
  v_prev_streak integer := 0;
  v_streak integer;
  v_interval_days integer;
  v_now timestamptz := least(coalesce(p_reviewed_at, now()), now());
  v_mrow education.item_mastery%rowtype;
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'study_record_attempt: not authenticated' using errcode = '42501';
  end if;

  if p_attempt_id is not null then
    select * into v_existing from education.study_attempt a where a.id = p_attempt_id;
    if found then
      if v_existing.created_by is distinct from v_uid then
        raise exception 'study_record_attempt: attempt id belongs to another user' using errcode = '42501';
      end if;
      -- The id must identify the SAME observation, or the caller is reusing ids
      -- and a real attempt would be silently dropped.
      if v_existing.item_type is distinct from p_item_type
         or v_existing.item_id is distinct from p_item_id then
        raise exception 'study_record_attempt: attempt id % already records a different item (%/%), refusing to treat this as a replay',
          p_attempt_id, v_existing.item_type, v_existing.item_id using errcode = '22023';
      end if;
      select * into v_mrow from education.item_mastery
       where created_by = v_uid and item_type = p_item_type and item_id = p_item_id;
      return jsonb_build_object(
        'attempt_id', p_attempt_id,
        'mastery', case when v_mrow.item_id is null then null else to_jsonb(v_mrow) end,
        'replayed', true);
    end if;
  end if;

  -- THE ORGANIZATION (Data Doctrine, Arman 2026-09-19): never defaulted, never
  -- the caller's personal org. Resolve from the studied item's OWN row when
  -- the item type is backed by an organization-scoped table (fc_card,
  -- assessment_item); otherwise fall back to the study_session it was
  -- recorded under (education.study_session, itself always stamped
  -- explicitly by studyService.createSession — never defaulted there
  -- either). A client-minted item id (handwritten_work / spoken_prompt) with
  -- no session has no legitimate source and is refused.
  if p_item_type = 'fc_card' then
    select organization_id into v_org from education.fc_card where id = p_item_id;
  elsif p_item_type = 'assessment_item' then
    select organization_id into v_org from education.assessment_item where id = p_item_id;
  end if;

  if v_org is null and p_session_id is not null then
    select organization_id into v_org from education.study_session where id = p_session_id;
  end if;

  if v_org is null then
    raise exception 'organization_required: study_record_attempt has no organization source for item_type % item_id %', p_item_type, p_item_id
      using errcode = 'P0001',
            hint = 'Pass p_session_id for an open study_session, or record against an fc_card/assessment_item that itself carries an organization.';
  end if;

  begin
    insert into education.study_attempt (
      id, item_type, item_id, session_id, method, result, score, score_value,
      response_kind, response_audio_file_id, response_image_file_id, response_transcript,
      latency_ms, graded_by, reviewed_at, organization_id
    ) values (
      coalesce(p_attempt_id, gen_random_uuid()),
      p_item_type, p_item_id, p_session_id, p_method, p_result, p_score, p_score_value,
      p_response_kind, p_response_audio_file_id, p_response_image_file_id, p_response_transcript,
      p_latency_ms, p_graded_by, v_now, v_org
    ) returning id into v_attempt_id;
  exception when unique_violation then
    select * into v_mrow from education.item_mastery
     where created_by = v_uid and item_type = p_item_type and item_id = p_item_id;
    return jsonb_build_object(
      'attempt_id', p_attempt_id,
      'mastery', case when v_mrow.item_id is null then null else to_jsonb(v_mrow) end,
      'replayed', true);
  end;

  if p_result is null then
    insert into education.item_mastery as m (created_by, item_type, item_id, attempt_count, last_attempt_at, organization_id)
    values (v_uid, p_item_type, p_item_id, 1, v_now, v_org)
    on conflict (created_by, item_type, item_id) do update set
      attempt_count   = m.attempt_count + 1,
      last_attempt_at = greatest(m.last_attempt_at, excluded.last_attempt_at)
    returning * into v_mrow;
    return jsonb_build_object('attempt_id', v_attempt_id, 'mastery', to_jsonb(v_mrow));
  end if;

  if p_difficulty is null or p_stability is null or p_due_at is null or p_retrievability is null or p_lapses is null then
    raise exception 'study_record_attempt: graded attempts require FSRS state (difficulty, stability, due_at, retrievability, lapses) — compute via lib/srs/fsrs.ts before calling'
      using errcode = '22023';
  end if;

  select coalesce(streak, 0) into v_prev_streak from education.item_mastery
   where created_by = v_uid and item_type = p_item_type and item_id = p_item_id;

  v_streak := case when v_correct then coalesce(v_prev_streak, 0) + 1 else 0 end;
  v_interval_days := greatest(0, round(extract(epoch from (p_due_at - v_now)) / 86400)::integer);

  insert into education.item_mastery as m (
    created_by, item_type, item_id, mastery_score, difficulty, stability, retrievability,
    lapses, interval_days, due_at, last_review, last_result, last_attempt_at,
    attempt_count, correct_count, streak, struggle_flag, organization_id
  ) values (
    v_uid, p_item_type, p_item_id, p_retrievability, p_difficulty, p_stability, p_retrievability,
    p_lapses, v_interval_days, p_due_at, v_now, p_result, v_now,
    1, case when v_correct then 1 else 0 end, v_streak,
    coalesce((not v_correct and not v_partial), false), v_org
  )
  on conflict (created_by, item_type, item_id) do update set
    -- Counters and history ALWAYS accrue (this attempt really happened)...
    attempt_count   = m.attempt_count + 1,
    correct_count   = m.correct_count + (case when v_correct then 1 else 0 end),
    last_attempt_at = greatest(m.last_attempt_at, excluded.last_attempt_at),
    -- ...but SCHEDULER state only moves forward. A replayed offline attempt
    -- reviewed BEFORE the stored last_review must not regress the schedule a
    -- newer online review already computed.
    mastery_score   = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.mastery_score  else m.mastery_score  end,
    difficulty      = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.difficulty     else m.difficulty     end,
    stability       = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.stability      else m.stability      end,
    retrievability  = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.retrievability else m.retrievability end,
    lapses          = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.lapses         else m.lapses         end,
    interval_days   = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.interval_days  else m.interval_days  end,
    due_at          = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.due_at         else m.due_at         end,
    last_result     = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.last_result    else m.last_result    end,
    streak          = case when m.last_review is null or excluded.last_review >= m.last_review then excluded.streak         else m.streak         end,
    last_review     = greatest(m.last_review, excluded.last_review),
    struggle_flag   = case when m.last_review is null or excluded.last_review >= m.last_review
                           then coalesce((not v_correct and not v_partial) or (m.streak = 0 and not v_correct), false)
                           else m.struggle_flag end
  returning * into v_mrow;

  return jsonb_build_object('attempt_id', v_attempt_id, 'mastery', to_jsonb(v_mrow));
end $function$;

CREATE OR REPLACE FUNCTION public.tool_register_mcp_discovered(p_server_id uuid, p_tool_specs jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tool', 'iam'
AS $function$
DECLARE
    v_slug         text;
    v_server_name  text;
    v_executor     text;
    v_spec         jsonb;
    v_count        integer := 0;
    v_local_name   text;
    v_canonical    text;
    v_tool_id      uuid;
    v_allowlist    jsonb;
    v_seen         text[] := '{}';
    v_organization_id uuid;
    v_visibility tool.mcp_server.visibility%TYPE;
BEGIN
    IF jsonb_typeof(p_tool_specs) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'tool_register_mcp_discovered: p_tool_specs must be an array';
    END IF;

    SELECT slug, name, metadata->'tool_allowlist', organization_id, visibility
      INTO v_slug, v_server_name, v_allowlist, v_organization_id, v_visibility
      FROM tool.mcp_server
     WHERE id = p_server_id;
    IF v_slug IS NULL THEN
        RAISE EXCEPTION 'tool_register_mcp_discovered: server % not found', p_server_id;
    END IF;
    IF v_organization_id IS NULL OR v_visibility IS NULL THEN
        RAISE EXCEPTION 'tool_register_mcp_discovered: server % lacks organization or visibility', p_server_id;
    END IF;

    v_executor := 'mcp.' || v_slug;
    IF NOT EXISTS (SELECT 1 FROM tool.executor WHERE name = v_executor AND is_active) THEN
        RAISE EXCEPTION 'tool_register_mcp_discovered: active executor "%" not found', v_executor;
    END IF;

    FOR v_spec IN SELECT value FROM jsonb_array_elements(p_tool_specs) LOOP
        v_local_name := nullif(btrim(coalesce(v_spec->>'name', v_spec->>'local_name')), '');
        IF v_local_name IS NULL THEN
            RAISE EXCEPTION 'tool_register_mcp_discovered: tool spec missing name';
        END IF;
        IF v_allowlist IS NOT NULL
           AND jsonb_typeof(v_allowlist) = 'array'
           AND NOT (v_allowlist ? v_local_name) THEN
            CONTINUE;
        END IF;

        v_canonical := v_executor || '.' || v_local_name;
        v_seen := array_append(v_seen, v_canonical);

        INSERT INTO tool.definition (
            name, description, parameters, output_schema, annotations,
            source_kind, managed_by_server_id, tool_group, organization_id,
            visibility, is_active, deactivated_at
        ) VALUES (
            v_canonical,
            COALESCE(v_spec->>'description', ''),
            COALESCE(v_spec->'parameters', '{}'::jsonb),
            v_spec->'output_schema',
            COALESCE(v_spec->'annotations', '[]'::jsonb),
            'mcp_discovered',
            p_server_id,
            'mcp',
            v_organization_id,
            v_visibility,
            true,
            null
        )
        ON CONFLICT (name) DO UPDATE SET
            description          = EXCLUDED.description,
            parameters           = EXCLUDED.parameters,
            output_schema        = EXCLUDED.output_schema,
            annotations          = EXCLUDED.annotations,
            source_kind          = 'mcp_discovered',
            managed_by_server_id = p_server_id,
            tool_group           = 'mcp',
            organization_id      = v_organization_id,
            visibility           = v_visibility,
            is_active            = true,
            deactivated_at       = null,
            updated_at           = now()
        RETURNING id INTO v_tool_id;

        IF NOT EXISTS (
            SELECT 1
              FROM platform.associations_live a
             WHERE a.source_type = 'purpose'
               AND a.target_type = 'tool'
               AND a.target_id = v_tool_id
               AND a.role = 'served_by'
               AND COALESCE(a.position, 0) = 0
        ) THEN
            PERFORM platform.upsert_unit_purpose(
                'tool',
                v_tool_id,
                'Use ' || v_server_name || ': ' || v_local_name,
                COALESCE(
                    nullif(btrim(v_spec->>'description'), ''),
                    'Run the ' || v_local_name || ' capability provided by ' || v_server_name || '.'
                ),
                'A'
            );
        END IF;

        INSERT INTO tool.binding (tool_id, executor_name, is_active, organization_id)
        VALUES (v_tool_id, v_executor, true, v_organization_id)
        ON CONFLICT (tool_id, executor_name) DO UPDATE
        SET is_active = true, organization_id = v_organization_id, updated_at = now();

        v_count := v_count + 1;
    END LOOP;

    UPDATE tool.definition
       SET is_active = false,
           deactivated_at = now(),
           updated_at = now()
     WHERE managed_by_server_id = p_server_id
       AND source_kind = 'mcp_discovered'
       AND is_active
       AND NOT (name = ANY(v_seen));

    RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.udt_backfill_autonumber(p_table_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_field_name text;
  v_start bigint;
  v_numbered integer;
begin
  if auth.uid() is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  select field_name into v_field_name
  from workbench.udt_dataset_fields
  where id = p_field_id
    and table_id = p_table_id
    and deleted_at is null
    and metadata->'format'->>'id' = 'autonumber';
  if v_field_name is null then
    return jsonb_build_object('success', false, 'error', 'That column is not an Autonumber column of this table.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('udt_autonumber:' || p_field_id::text, 0));

  select coalesce(max((r.data->>v_field_name)::bigint), 0)
    into v_start
    from workbench.udt_dataset_rows r
    where r.table_id = p_table_id
      and (r.data->>v_field_name) ~ '^[0-9]{1,18}$';

  with todo as (
    select r.id, row_number() over (order by r.created_at, r.id) as n
    from workbench.udt_dataset_rows r
    where r.table_id = p_table_id
      and r.deleted_at is null
      and not coalesce((r.data->>v_field_name) ~ '^[0-9]{1,18}$', false)
  ),
  done as (
    update workbench.udt_dataset_rows r
       set data = coalesce(r.data, '{}'::jsonb) || jsonb_build_object(v_field_name, v_start + todo.n)
      from todo
     where r.id = todo.id
    returning 1
  )
  select count(*) into v_numbered from done;

  return jsonb_build_object('success', true, 'numbered', v_numbered, 'highest', v_start + v_numbered);
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_bulk_write(p_table_id uuid, p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid(); v_dataset workbench.udt_datasets%ROWTYPE;
  v_op JSONB; v_op_kind TEXT; v_row_id UUID;
  v_result JSONB; v_results JSONB := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'udt_bulk_write: not authenticated'; END IF;
  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_bulk_write: table % not found', p_table_id; END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_bulk_write: caller lacks editor permission';
  END IF;
  IF jsonb_typeof(p_operations) <> 'array' THEN
    RAISE EXCEPTION 'udt_bulk_write: p_operations must be a JSON array';
  END IF;

  FOR v_op IN SELECT * FROM jsonb_array_elements(p_operations) LOOP
    v_op_kind := v_op ->> 'op';
    v_row_id  := NULLIF(v_op ->> 'row_id', '')::uuid;

    IF v_op_kind = 'insert' THEN
      -- An op with no "data" is an empty row, never a NULL row body.
      INSERT INTO workbench.udt_dataset_rows(table_id, data, user_id)
      VALUES (p_table_id, COALESCE(v_op -> 'data', '{}'::jsonb), v_caller)
      RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(v_result);

    ELSIF v_op_kind = 'update' THEN
      -- Refuse rather than silently blanking the row: "update with no data" is
      -- a caller mistake, and quietly emptying every field is the worst
      -- possible reading of it.
      IF v_op -> 'data' IS NULL OR jsonb_typeof(v_op -> 'data') <> 'object' THEN
        RAISE EXCEPTION 'udt_bulk_write: update op for row % needs a "data" object', v_row_id;
      END IF;
      IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
                  WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
        -- An archived row is not edited: it says so, and the rest of the batch continues.
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'error', 'row_in_trash', 'row_id', v_row_id, 'message', 'This row is in Trash. Restore it from Trash to edit it.'));
        CONTINUE;
      END IF;
      UPDATE workbench.udt_dataset_rows
         SET data = v_op -> 'data', updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NULL
       RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSIF v_op_kind = 'merge' THEN
      IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
                  WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
        -- An archived row is not edited: it says so, and the rest of the batch continues.
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'error', 'row_in_trash', 'row_id', v_row_id, 'message', 'This row is in Trash. Restore it from Trash to edit it.'));
        CONTINUE;
      END IF;
      UPDATE workbench.udt_dataset_rows
         SET data = COALESCE(data, '{}'::jsonb) || COALESCE(v_op -> 'data', '{}'::jsonb),
             updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NULL
       RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSIF v_op_kind = 'cell' THEN
      IF NOT EXISTS (
        SELECT 1 FROM workbench.udt_dataset_fields
         WHERE table_id = p_table_id AND field_name = v_op ->> 'field_name' AND deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'udt_bulk_write: cell op references undeclared field % on table %',
          v_op ->> 'field_name', p_table_id;
      END IF;
      IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
                  WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
        -- An archived row is not edited: it says so, and the rest of the batch continues.
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'error', 'row_in_trash', 'row_id', v_row_id, 'message', 'This row is in Trash. Restore it from Trash to edit it.'));
        CONTINUE;
      END IF;
      UPDATE workbench.udt_dataset_rows
         SET data = jsonb_set(
                      COALESCE(data, '{}'::jsonb),
                      ARRAY[v_op ->> 'field_name'],
                      -- SQL NULL would null the WHOLE document, not the key.
                      COALESCE(v_op -> 'value', 'null'::jsonb),
                      true
                    ),
             updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NULL
       RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSIF v_op_kind = 'delete' THEN
      -- Delete means archive (2026-09-27): the row is archived, never removed.
      UPDATE workbench.udt_dataset_rows
         SET deleted_at = now(), updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id AND deleted_at IS NULL
       RETURNING to_jsonb(workbench.udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );

    ELSE
      RAISE EXCEPTION 'udt_bulk_write: unknown op kind %', v_op_kind;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('table_id', p_table_id, 'count', jsonb_array_length(v_results), 'results', v_results);
END;
$function$;

CREATE OR REPLACE FUNCTION public.udt_change_field_type(p_table_id uuid, p_field_id uuid, p_new_type field_data_type, p_strategy text DEFAULT 'cast_or_null'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid(); v_dataset workbench.udt_datasets%ROWTYPE; v_field workbench.udt_dataset_fields%ROWTYPE;
  v_changed INTEGER := 0; v_total INTEGER := 0;
  v_unfit INTEGER := 0; v_preserved INTEGER := 0;
  v_reason TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'udt_change_field_type: not authenticated'; END IF;
  IF p_strategy NOT IN ('cast_or_null','cast_or_skip') THEN
    RAISE EXCEPTION 'udt_change_field_type: unknown strategy %', p_strategy;
  END IF;
  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_change_field_type: table % not found', p_table_id; END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_change_field_type: caller lacks editor permission';
  END IF;
  SELECT * INTO v_field FROM workbench.udt_dataset_fields WHERE id = p_field_id AND table_id = p_table_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_change_field_type: field % not in table %', p_field_id, p_table_id; END IF;

  -- DD-260. The from-type is read from the stored definition, so a caller that has
  -- ALREADY flipped it has destroyed the only record of what the values used to be.
  -- Refuse rather than stamp `<new>→<new>` on the row history — a screen never lies.
  IF v_field.data_type = p_new_type THEN
    RAISE EXCEPTION
      'udt_change_field_type: field "%" is already declared % — there is no "from" type left to record, so this call would stamp row history with "type_change:%→%" and tell the user nothing about what their value used to be. Nothing was changed.',
      v_field.field_name, p_new_type, p_new_type, p_new_type
      USING errcode = 'P0001',
            hint = 'Call udt_change_field_type FIRST and let it flip the declared type: it updates workbench.udt_dataset_fields.data_type itself, in the same transaction as the row rewrite and the history proof. Do NOT send data_type in update_user_table_config''s p_field_updates for a type change (that was the Table settings dialog''s bug, DD-260). If the type genuinely did not change, do not call this at all.';
  END IF;

  SELECT COUNT(*) INTO v_total FROM workbench.udt_dataset_rows WHERE table_id = p_table_id;

  -- Data Doctrine Rule 3. Values that do NOT fit the new type: count them BEFORE
  -- anything is rewritten, so the proof below has a number to hold the history to.
  SELECT COUNT(*) INTO v_unfit
    FROM workbench.udt_dataset_rows r
   WHERE r.table_id = p_table_id
     AND r.data ? v_field.field_name
     AND jsonb_typeof(r.data -> v_field.field_name) <> 'null'
     AND public.udt_cast_jsonb_value(r.data -> v_field.field_name, p_new_type) IS NULL;

  v_reason := 'type_change:' || v_field.data_type::text || '→' || p_new_type::text;
  -- The ONE versioning path (udt_log_row_version) stamps this on every version row
  -- the rewrite produces, in this same transaction. Transaction-local: it cannot
  -- leak into another statement's writes.
  PERFORM set_config('matrx.udt_version_reason', v_reason, true);

  WITH updated AS (
    UPDATE workbench.udt_dataset_rows r
       SET data = jsonb_set(r.data, ARRAY[v_field.field_name],
             COALESCE(
               public.udt_cast_jsonb_value(r.data -> v_field.field_name, p_new_type),
               CASE p_strategy WHEN 'cast_or_null' THEN 'null'::jsonb
                               ELSE r.data -> v_field.field_name END
             ), true),
           updated_at = now()
     -- Only touch rows that actually have this field. Absent==null semantically;
     -- nothing to cast, no audit row to write, no realtime event to emit.
     WHERE r.table_id = p_table_id
       AND r.data ? v_field.field_name
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_changed FROM updated;

  PERFORM set_config('matrx.udt_version_reason', '', true);

  -- The proof. Every value this call is about to leave empty must be readable in
  -- the row's history, with the reason, in THIS transaction. `now()` is the
  -- transaction timestamp and the version row's default, so this counts only what
  -- this call wrote. Under 'cast_or_skip' nothing is emptied, so nothing is owed.
  IF p_strategy = 'cast_or_null' AND v_unfit > 0 THEN
    SELECT COUNT(*) INTO v_preserved
      FROM workbench.udt_dataset_row_versions v
     WHERE v.table_id = p_table_id
       AND v.reason = v_reason
       AND v.changed_at = now()
       AND v.prior_data ? v_field.field_name
       AND jsonb_typeof(v.prior_data -> v_field.field_name) <> 'null'
       AND public.udt_cast_jsonb_value(v.prior_data -> v_field.field_name, p_new_type) IS NULL;

    IF v_preserved < v_unfit THEN
      RAISE EXCEPTION
        'udt_change_field_type: % value(s) in "%" cannot become % and only % reached row history — refusing to empty a cell whose only copy would be lost. Nothing was changed.',
        v_unfit, v_field.field_name, p_new_type, v_preserved
        USING errcode = 'P0001',
              hint = 'The row-version trigger udt_dataset_rows_version_update on workbench.udt_dataset_rows is what preserves these values. Restore it (migrations/udt_v2_backbone.sql), or run the change with strategy ''cast_or_skip'', which leaves un-castable values in place.';
    END IF;
  END IF;

  UPDATE workbench.udt_dataset_fields SET data_type = p_new_type, updated_at = now() WHERE id = p_field_id;

  RETURN jsonb_build_object(
    'field_id',                 p_field_id,
    'new_type',                 p_new_type,
    'strategy',                 p_strategy,
    'rows_rewritten',           v_changed,
    'rows_skipped',             v_total - v_changed,
    'rows_total',               v_total,
    -- What the screen must say. Rule 3 + "a screen never lies": the caller emptied
    -- this many cells, and every one of them is in that row's history under
    -- `history_reason`, restorable from the row's history.
    'values_moved_to_history',  CASE WHEN p_strategy = 'cast_or_null' THEN v_unfit ELSE 0 END,
    'history_reason',           v_reason
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.udt_delete_field(p_table_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_field_name text;
  v_display_name text;
  v_remaining int;
  v_rows_cleared int := 0;
begin
  if (
    workbench.udt_dataset_access(p_table_id, 'editor')
  ) is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  select field_name, display_name into v_field_name, v_display_name
  from workbench.udt_dataset_fields
  where id = p_field_id and table_id = p_table_id and deleted_at is null;

  if v_field_name is null then
    return jsonb_build_object('success', false, 'error', 'Column not found in this table');
  end if;

  select count(*) into v_remaining
  from workbench.udt_dataset_fields
  where table_id = p_table_id and deleted_at is null;

  if v_remaining <= 1 then
    return jsonb_build_object(
      'success', false,
      'error', 'A table must keep at least one column. Add another column before removing this one.'
    );
  end if;

  -- Delete means archive (2026-09-27): the column is archived, never removed,
  -- and its values stay in the rows so restoring the column brings them back
  -- (every reader lists live columns only). rows_cleared stays 0.
  update workbench.udt_dataset_fields
     set deleted_at = now(), updated_at = now()
   where id = p_field_id and table_id = p_table_id and deleted_at is null;

  -- Close the gap in field_order so the remaining columns stay 1..n.
  with ordered as (
    select id, row_number() over (order by field_order, created_at) as rn
    from workbench.udt_dataset_fields
    where table_id = p_table_id and deleted_at is null
  )
  update workbench.udt_dataset_fields f
  set field_order = ordered.rn
  from ordered
  where f.id = ordered.id and f.field_order is distinct from ordered.rn;

  -- Never leave the table pointing at a column that no longer exists.
  update workbench.udt_datasets
  set row_ordering_config = case
        when row_ordering_config->'default_sort'->>'field' = v_field_name
          then row_ordering_config - 'default_sort'
        else row_ordering_config
      end,
      version = version + 1,
      updated_at = now()
  where id = p_table_id;

  update workbench.udt_datasets
  set row_ordering_config = row_ordering_config - 'label_field'
  where id = p_table_id
    and row_ordering_config->>'label_field' = v_field_name;

  return jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'field_id', p_field_id,
    'field_name', v_field_name,
    'display_name', v_display_name,
    'rows_cleared', v_rows_cleared
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_field_format(p_table_id uuid, p_field_id uuid, p_format jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_metadata jsonb;
begin
  if (
    workbench.udt_dataset_access(p_table_id, 'editor')
  ) is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  -- p_format null clears the format; the column then renders with its storage
  -- type's identity format, exactly as it did before formats existed.
  update workbench.udt_dataset_fields
  set metadata = case
        when p_format is null or p_format = 'null'::jsonb
          then coalesce(metadata, '{}'::jsonb) - 'format'
        else coalesce(metadata, '{}'::jsonb) || jsonb_build_object('format', p_format)
      end,
      updated_at = now()
  where id = p_field_id and table_id = p_table_id and deleted_at is null
  returning metadata into v_metadata;

  if v_metadata is null then
    return jsonb_build_object('success', false, 'error', 'Column not found in this table');
  end if;

  return jsonb_build_object(
    'success', true,
    'field_id', p_field_id,
    'metadata', v_metadata
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_table_row_actions(p_table_id uuid, p_row_actions jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_action jsonb;
  v_step jsonb;
  v_kind text;
  v_set text;
  v_field text;
  v_name text;
  v_metadata jsonb;
  v_ids text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  if p_row_actions is not null and jsonb_typeof(p_row_actions) <> 'null' then
    if jsonb_typeof(p_row_actions) <> 'array' then
      raise exception 'row_actions must be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_row_actions) > 24 then
      raise exception 'a table can have at most 24 row actions' using errcode = '22023';
    end if;
    if length(p_row_actions::text) > 200000 then
      raise exception 'row_actions is larger than 200 KB' using errcode = '22023';
    end if;
    for v_action in select * from jsonb_array_elements(p_row_actions) loop
      if jsonb_typeof(v_action) <> 'object' then
        raise exception 'each row action must be an object' using errcode = '22023';
      end if;
      if coalesce(v_action->>'id', '') = '' then
        raise exception 'a row action is missing its id' using errcode = '22023';
      end if;
      if v_action->>'id' = any (v_ids) then
        raise exception 'two row actions share the id "%"', v_action->>'id' using errcode = '22023';
      end if;
      v_ids := v_ids || (v_action->>'id');
      v_name := btrim(coalesce(v_action->>'name', ''));
      if v_name = '' then
        raise exception 'a row action is missing its name' using errcode = '22023';
      end if;
      if length(v_name) > 80 then
        raise exception 'row action name "%" is longer than 80 characters', left(v_name, 20) using errcode = '22023';
      end if;
      v_kind := coalesce(v_action->>'kind', 'update');
      if v_kind = 'agent' then
        if btrim(coalesce(v_action->>'prompt', '')) = '' then
          raise exception 'row action "%" asks an agent but has no prompt', v_name using errcode = '22023';
        end if;
      elsif v_kind = 'update' then
        if jsonb_typeof(v_action->'steps') <> 'array' or jsonb_array_length(v_action->'steps') = 0 then
          raise exception 'row action "%" has no changes', v_name using errcode = '22023';
        end if;
        if jsonb_array_length(v_action->'steps') > 60 then
          raise exception 'row action "%" changes more than 60 columns', v_name using errcode = '22023';
        end if;
        for v_step in select * from jsonb_array_elements(v_action->'steps') loop
          v_field := v_step->>'field';
          if v_field is null or not exists (
            select 1 from workbench.udt_dataset_fields
            where table_id = p_table_id and field_name = v_field and deleted_at is null
          ) then
            raise exception 'row action "%" names a column "%" that is not on this table', v_name, coalesce(v_field, '') using errcode = '22023';
          end if;
          if exists (
            select 1 from workbench.udt_dataset_fields
            where table_id = p_table_id and field_name = v_field and deleted_at is null
              and metadata->'format'->>'id' in ('formula', 'created_time', 'modified_time', 'autonumber')
          ) then
            raise exception 'row action "%" sets the calculated column "%"', v_name, v_field using errcode = '22023';
          end if;
          v_set := v_step->>'set';
          if v_set not in ('value', 'clear', 'formula') then
            raise exception 'row action "%": step.set must be value, clear or formula', v_name using errcode = '22023';
          end if;
          if v_set = 'formula' and btrim(coalesce(v_step->>'expression', '')) = '' then
            raise exception 'row action "%": the formula for "%" is empty', v_name, v_field using errcode = '22023';
          end if;
        end loop;
      else
        raise exception 'row action "%": kind must be update or agent', v_name using errcode = '22023';
      end if;
    end loop;
    if jsonb_array_length(p_row_actions) = 0 then
      p_row_actions := null;
    end if;
  else
    p_row_actions := null;
  end if;

  update workbench.udt_datasets
     set metadata = case
           when p_row_actions is null then coalesce(metadata, '{}'::jsonb) - 'row_actions'
           else jsonb_set(coalesce(metadata, '{}'::jsonb), '{row_actions}', p_row_actions, true)
         end
   where id = p_table_id and deleted_at is null
   returning metadata into v_metadata;
  if v_metadata is null then
    perform platform.refuse_not_found(format('dataset %s not found', p_table_id));
  end if;

  return jsonb_build_object('success', true, 'row_actions', coalesce(v_metadata -> 'row_actions', '[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_table_row_label(p_table_id uuid, p_row_label jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_kind text;
  v_field text;
  v_expression text;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  if p_row_label is not null and jsonb_typeof(p_row_label) <> 'null' then
    if jsonb_typeof(p_row_label) <> 'object' then
      raise exception 'row_label must be an object' using errcode = '22023';
    end if;
    v_kind := p_row_label->>'kind';
    if v_kind = 'field' then
      v_field := p_row_label->>'field';
      if v_field is null or not exists (
        select 1 from workbench.udt_dataset_fields
        where table_id = p_table_id and field_name = v_field and deleted_at is null
      ) then
        raise exception 'row_label.field "%" is not a column of this table', coalesce(v_field, '') using errcode = '22023';
      end if;
      p_row_label := jsonb_build_object('kind', 'field', 'field', v_field);
    elsif v_kind = 'formula' then
      v_expression := p_row_label->>'expression';
      if v_expression is null or btrim(v_expression) = '' then
        raise exception 'row_label.expression is empty' using errcode = '22023';
      end if;
      if length(v_expression) > 2000 then
        raise exception 'row_label.expression is longer than 2000 characters' using errcode = '22023';
      end if;
      p_row_label := jsonb_build_object('kind', 'formula', 'expression', v_expression);
    else
      raise exception 'row_label.kind must be "field" or "formula", got "%"', coalesce(v_kind, '') using errcode = '22023';
    end if;
  else
    p_row_label := null;
  end if;

  update workbench.udt_datasets
     set metadata = case
           when p_row_label is null then coalesce(metadata, '{}'::jsonb) - 'row_label'
           else jsonb_set(coalesce(metadata, '{}'::jsonb), '{row_label}', p_row_label, true)
         end
   where id = p_table_id and deleted_at is null
   returning metadata into v_metadata;
  if v_metadata is null then
    perform platform.refuse_not_found(format('dataset %s not found', p_table_id));
  end if;

  return jsonb_build_object('success', true, 'row_label', v_metadata -> 'row_label');
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_table_style(p_table_id uuid, p_path text[], p_value jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_style jsonb;
  v_depth int;
  v_head text;
  v_parent text[];
  i int;
begin
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  v_depth := coalesce(array_length(p_path, 1), 0);
  if v_depth < 1 or v_depth > 3 then
    raise exception 'style path must have 1 to 3 segments, got %', v_depth using errcode = '22023';
  end if;
  v_head := p_path[1];
  if v_head not in ('colorBy', 'rules', 'rows', 'cells', 'columns') then
    raise exception 'unknown style key "%": expected colorBy, rules, rows, cells or columns', v_head using errcode = '22023';
  end if;
  if (v_head in ('colorBy', 'rules') and v_depth <> 1)
     or (v_head in ('rows', 'columns') and v_depth <> 2)
     or (v_head = 'cells' and v_depth <> 3) then
    raise exception 'style key "%" does not take a path of % segments', v_head, v_depth using errcode = '22023';
  end if;

  select coalesce(metadata -> 'style', '{}'::jsonb)
    into v_style
    from workbench.udt_datasets
   where id = p_table_id
   for update;

  if v_style is null then
    perform platform.refuse_not_found(format('dataset %s not found', p_table_id));
  end if;
  if jsonb_typeof(v_style) <> 'object' then
    v_style := '{}'::jsonb;
  end if;

  if p_value is null or p_value = 'null'::jsonb then
    -- Delete the leaf, then prune empty parents so the blob never accumulates
    -- `{ "cells": { "<row>": {} } }` husks.
    v_style := v_style #- p_path;
    for i in reverse (v_depth - 1)..1 loop
      v_parent := p_path[1:i];
      if v_style #> v_parent = '{}'::jsonb then
        v_style := v_style #- v_parent;
      end if;
    end loop;
  else
    -- jsonb_set only creates the LAST segment; make every parent exist first.
    for i in 1..(v_depth - 1) loop
      v_parent := p_path[1:i];
      if v_style #> v_parent is null or jsonb_typeof(v_style #> v_parent) <> 'object' then
        v_style := jsonb_set(v_style, v_parent, '{}'::jsonb, true);
      end if;
    end loop;
    v_style := jsonb_set(v_style, p_path, p_value, true);
  end if;

  v_style := v_style || jsonb_build_object('version', 1);

  update workbench.udt_datasets
     set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), array['style'], v_style, true),
         updated_at = now()
   where id = p_table_id;

  return jsonb_build_object('success', true, 'table_id', p_table_id, 'style', v_style);
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_upsert_cell(p_table_id uuid, p_row_id uuid, p_field_name text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid(); v_dataset workbench.udt_datasets%ROWTYPE; v_row workbench.udt_dataset_rows%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'udt_upsert_cell: not authenticated'; END IF;
  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_upsert_cell: table % not found', p_table_id; END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_upsert_cell: caller lacks editor permission';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM workbench.udt_dataset_fields WHERE table_id = p_table_id AND field_name = p_field_name AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'udt_upsert_cell: field % not in table %', p_field_name, p_table_id;
  END IF;
  IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
              WHERE id = p_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
    PERFORM workbench.udt_refuse_row_in_trash();
  END IF;
  UPDATE workbench.udt_dataset_rows
     SET data = jsonb_set(
                  COALESCE(data, '{}'::jsonb),
                  ARRAY[p_field_name],
                  -- SQL NULL here would make jsonb_set return NULL for the
                  -- WHOLE document. Clearing a cell means this key becomes
                  -- JSON null; every other field is untouched.
                  COALESCE(p_value, 'null'::jsonb),
                  true
                ),
         updated_at = now()
   WHERE id = p_row_id AND table_id = p_table_id AND deleted_at IS NULL RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_upsert_cell: row % not found in table %', p_row_id, p_table_id; END IF;
  RETURN to_jsonb(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.udt_upsert_row(p_table_id uuid, p_row_id uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller  UUID := auth.uid();
  v_dataset workbench.udt_datasets%ROWTYPE;
  v_row     workbench.udt_dataset_rows%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'udt_upsert_row: not authenticated';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'udt_upsert_row: p_data is required';
  END IF;

  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'udt_upsert_row: table % not found', p_table_id;
  END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_upsert_row: caller lacks editor permission on table %', p_table_id;
  END IF;

  IF p_row_id IS NULL THEN
    INSERT INTO workbench.udt_dataset_rows(table_id, data, user_id)
    VALUES (p_table_id, p_data, v_caller) RETURNING * INTO v_row;
  ELSE
    -- lane OLDER-DOORS-AFTER-SWITCH: an update MERGES p_data into the row (cells it does not name
    -- stay); it used to replace the whole row. A moved table refuses in the row guard.
    IF jsonb_typeof(p_data) <> 'object' THEN
      RAISE EXCEPTION 'udt_upsert_row: p_data must be an object' USING errcode = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM workbench.udt_dataset_rows
                WHERE id = p_row_id AND table_id = p_table_id AND deleted_at IS NOT NULL) THEN
      PERFORM workbench.udt_refuse_row_in_trash();
    END IF;
    UPDATE workbench.udt_dataset_rows SET data = COALESCE(data, '{}'::jsonb) || p_data, updated_at = now()
     WHERE id = p_row_id AND table_id = p_table_id AND deleted_at IS NULL RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'udt_upsert_row: row % not found in table %', p_row_id, p_table_id;
    END IF;
  END IF;
  RETURN to_jsonb(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_context_item(p_item_id uuid, p_display_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_value_type context_value_type DEFAULT NULL::context_value_type, p_fetch_hint context_fetch_hint DEFAULT NULL::context_fetch_hint, p_sensitivity context_sensitivity DEFAULT NULL::context_sensitivity, p_tags text[] DEFAULT NULL::text[], p_sort_order smallint DEFAULT NULL::smallint, p_status context_item_status DEFAULT NULL::context_item_status, p_status_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_result jsonb;
begin
  select st.organization_id
    into v_org
    from context.context_items ci
    join context.scope_types st on st.id = ci.scope_type_id
   where ci.id = p_item_id
     and ci.deleted_at is null;

  if v_org is null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;

  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for %', v_org
      using errcode = '42501';
  end if;

  update context.context_items
     set display_name = coalesce(p_display_name, display_name),
         description  = coalesce(p_description, description),
         category     = coalesce(p_category, category),
         value_type   = coalesce(p_value_type, value_type),
         fetch_hint   = coalesce(p_fetch_hint, fetch_hint),
         sensitivity  = coalesce(p_sensitivity, sensitivity),
         tags         = coalesce(p_tags, tags),
         sort_order   = coalesce(p_sort_order, sort_order),
         status       = coalesce(p_status, status),
         status_note  = coalesce(p_status_note, status_note),
         updated_at   = now()
   where id = p_item_id
  returning to_jsonb(context.context_items.*) into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_scope(p_scope_id uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_settings jsonb DEFAULT NULL::jsonb, p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_result jsonb; v_type_label text; v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM context.scopes WHERE id = p_scope_id;
  -- ADMIN LANE: a platform admin on /administration/** manages any organization's scopes.
  IF v_org IS NULL OR NOT (public.is_platform_admin() OR iam.has_org_access(v_org)) THEN
    RAISE EXCEPTION 'not authorized to update scope %', p_scope_id USING ERRCODE = '42501';
  END IF;
  UPDATE context.scopes SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    settings = COALESCE(p_settings, settings),
    slug = COALESCE(p_slug, slug),
    sort_order = COALESCE(p_sort_order, sort_order),
    updated_at = now()
  WHERE id = p_scope_id
  RETURNING to_jsonb(context.scopes.*) INTO v_result;
  SELECT st.label_singular INTO v_type_label
  FROM context.scope_types st JOIN context.scopes s ON s.scope_type_id = st.id
  WHERE s.id = p_scope_id;
  RETURN v_result || jsonb_build_object('type_label', v_type_label);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_scope_type(p_type_id uuid, p_label_singular text DEFAULT NULL::text, p_label_plural text DEFAULT NULL::text, p_icon text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint, p_max_assignments smallint DEFAULT NULL::smallint, p_color text DEFAULT NULL::text, p_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_org_id uuid;
begin
  select st.organization_id
  into v_org_id
  from context.scope_types st
  where st.id = p_type_id
    and st.deleted_at is null;

  if v_org_id is null then
    perform platform.refuse_not_found(format('active scope type %s not found', p_type_id));
  end if;

  -- ADMIN LANE: a platform admin on /administration/** manages any organization's scope types.
  if (auth.role() = 'service_role' or public.is_platform_admin() or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for organization %', v_org_id
      using errcode = '42501';
  end if;

  update context.scope_types
  set label_singular = coalesce(p_label_singular, label_singular),
      label_plural = coalesce(p_label_plural, label_plural),
      icon = coalesce(p_icon, icon),
      description = coalesce(p_description, description),
      sort_order = coalesce(p_sort_order, sort_order),
      max_assignments_per_entity = coalesce(
        p_max_assignments,
        max_assignments_per_entity
      ),
      color = coalesce(p_color, color),
      slug = coalesce(p_slug, slug),
      updated_at = now()
  where id = p_type_id
  returning to_jsonb(context.scope_types.*) into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_list(p_list_id uuid, p_list_name character varying DEFAULT NULL::character varying, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_authenticated_read boolean DEFAULT NULL::boolean, p_public_read boolean DEFAULT NULL::boolean, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org  uuid;
  v_item jsonb;
  v_rows jsonb[];
  v_old  uuid;
begin
  -- lane LISTS-AFTER-SWITCH: a list that lives in the store is written through the store's own
  -- doors in the caller's seat (rename / describe the Table; p_items replaces the choices: the
  -- current ones are archived — soft, restorable — and the new ones written).
  if platform.list_lives_in(p_list_id) = 'record' then
    select t.organization_id into v_org
      from custom.record t where t.id = p_list_id and t.data_class = 'table' and t.deleted_at is null limit 1;
    if v_org is null then
      raise exception 'there is no list with the id % in the new system', p_list_id using errcode = '02000';
    end if;
    if (auth.role() = 'service_role'
        or coalesce(custom.has_visibility((select auth.uid()), 'record', p_list_id, 'editor'::public.permission_level), false)) is not true then
      raise exception 'owner access required for list %', p_list_id using errcode = '42501';
    end if;
    if nullif(btrim(coalesce(p_list_name, '')), '') is not null or p_description is not null then
      perform custom.record_update(v_org, p_list_id, jsonb_strip_nulls(jsonb_build_object(
        'name', nullif(btrim(coalesce(p_list_name, '')), ''), 'description', p_description)));
    end if;
    if p_items is not null then
      for v_old in select c.id from custom.record c
                    where c.organization_id = v_org and c.table_id = p_list_id
                      and c.data_class = 'record' and c.deleted_at is null loop
        perform custom.record_delete(v_org, v_old);
      end loop;
      for v_item in select * from jsonb_array_elements(p_items) loop
        continue when coalesce(nullif(btrim(coalesce(v_item ->> 'Label', v_item ->> 'label')), ''), '') = '';
        v_rows := v_rows || jsonb_strip_nulls(jsonb_build_object(
          'name', coalesce(v_item ->> 'Label', v_item ->> 'label'),
          'description', coalesce(v_item ->> 'Description', v_item ->> 'description'),
          'help_text', coalesce(v_item ->> 'Help Text', v_item ->> 'help_text'),
          'group_name', coalesce(v_item ->> 'Group', v_item ->> 'group_name'),
          'icon', coalesce(v_item ->> 'icon_name', v_item ->> 'icon')));
      end loop;
      if coalesce(cardinality(v_rows), 0) > 0 then
        perform custom.record_write_many(v_org, p_list_id, v_rows);
      end if;
    end if;
    return platform._store_pick_list_document(p_list_id, null, 'detail') - 'items_grouped'
           || jsonb_build_object('items', coalesce((
                select jsonb_agg(jsonb_build_object(
                         'id', c.id, 'label', c.data ->> 'name', 'description', c.data ->> 'description',
                         'help_text', c.data ->> 'help_text', 'group_name', c.data ->> 'group_name') order by c.created_at, c.id)
                  from custom.record c
                 where c.organization_id = v_org and c.table_id = p_list_id
                   and c.data_class = 'record' and c.deleted_at is null), '[]'::jsonb));
  end if;

  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id and l.user_id = (select auth.uid())
    )
  ) is not true then
    raise exception 'owner access required for list %', p_list_id using errcode = '42501';
  end if;
  return public._d31_impl_update_user_list(
    p_list_id, p_list_name, p_description, p_is_public,
    p_authenticated_read, p_public_read, p_items
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_table_config(p_table_id uuid, p_table_updates jsonb DEFAULT NULL::jsonb, p_field_updates jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_update_user_table_config(p_table_id, p_table_updates, p_field_updates);
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_table_metadata(p_table_id uuid, p_table_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_authenticated_read boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_update_user_table_metadata(
    p_table_id, p_table_name, p_description, p_is_public, p_authenticated_read
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_mcp_connection(p_server_id uuid, p_config_id uuid DEFAULT NULL::uuid, p_transport mcp_transport DEFAULT 'http'::mcp_transport, p_endpoint_override text DEFAULT NULL::text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid uuid := auth.uid();
    v_id uuid;
    v_display_name text;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- The organization is where a NEW connection is filed — named by the caller, never chosen here.
    IF p_organization_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22004',
          MESSAGE = 'upsert_mcp_connection: name the organization this connection is filed in (p_organization_id).';
    END IF;
    IF p_organization_id IS NOT NULL AND NOT iam.has_org_access(p_organization_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
          MESSAGE = 'upsert_mcp_connection: you are not a member of the organization this connection would be filed in.';
    END IF;

    SELECT COALESCE(NULLIF(s.name, ''), s.slug)
      INTO v_display_name
      FROM tool.mcp_server s
     WHERE s.id = p_server_id
       AND s.deleted_at IS NULL;

    IF v_display_name IS NULL THEN
        RAISE EXCEPTION 'MCP server % not found', p_server_id;
    END IF;

    INSERT INTO tool.mcp_user_conn (
        created_by, organization_id, server_id, status, connected_at, last_used_at,
        config_id, transport_used, endpoint_url_override,
        display_name, error_count, last_error, updated_at
    ) VALUES (
        v_uid, p_organization_id, p_server_id, 'connected', now(), now(),
        p_config_id, p_transport, p_endpoint_override,
        v_display_name, 0, NULL, now()
    )
    ON CONFLICT (created_by, server_id) DO UPDATE SET
        status = 'connected',
        connected_at = COALESCE(tool.mcp_user_conn.connected_at, now()),
        last_used_at = now(),
        config_id = COALESCE(p_config_id, tool.mcp_user_conn.config_id),
        transport_used = p_transport,
        endpoint_url_override = COALESCE(p_endpoint_override, tool.mcp_user_conn.endpoint_url_override),
        -- Never rename an existing connection on reconnect.
        display_name = COALESCE(tool.mcp_user_conn.display_name, EXCLUDED.display_name),
        -- A connection keeps the organization it was filed in; a row an old client wrote without
        -- one takes the organization this caller names (and was just checked for).
        organization_id = COALESCE(tool.mcp_user_conn.organization_id, EXCLUDED.organization_id),
        deleted_at = NULL,
        error_count = 0, last_error = NULL, updated_at = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.version_restore(p_token text, p_id uuid, p_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_s text; v_t text; v_rel regclass; v_snap jsonb; v_cols text; v_sel text; v_new int; v_n int; v_content int; v_feature_owned boolean;
BEGIN
  SELECT schema_name,table_name,feature_owned_restore INTO v_s,v_t,v_feature_owned FROM platform.entity_types WHERE token=p_token;
  IF v_s IS NULL THEN RAISE EXCEPTION 'unknown token %',p_token; END IF;
  IF v_feature_owned OR EXISTS (SELECT 1 FROM platform.entity_types WHERE token=p_token AND service_only_history) THEN RAISE EXCEPTION 'classified history requires feature-owned restoration' USING ERRCODE='42501'; END IF;
  -- 1345: a client_read_only type is written ONLY through its own doors. This function writes as
  -- any editor, and every organization member is an editor of an Organization row, so without
  -- this line a restore was a second, ungated write path onto the table.
  IF EXISTS (SELECT 1 FROM platform.entity_types WHERE token=p_token AND client_read_only) THEN RAISE EXCEPTION 'a % is changed only through the screen that manages it, so it cannot be restored from its history here', p_token USING ERRCODE='42501', HINT='Make the change again through that screen.'; END IF;
  v_rel:=to_regclass(quote_ident(v_s)||'.'||quote_ident(v_t));
  IF v_rel IS NULL THEN RAISE EXCEPTION 'cannot restore %: the registry says this type lives in %.%, and no such table exists, so there is nothing to restore into. Point the registry row at a real table, or restore this type through its own door.',p_token,v_s,v_t; END IF;
  IF NOT iam.has_access(p_token,p_id,'editor') THEN RAISE EXCEPTION 'access denied'; END IF;
  SELECT row_data INTO v_snap FROM history.row_versions WHERE entity_type=p_token AND row_id=p_id AND version=p_version ORDER BY id DESC LIMIT 1;
  IF v_snap IS NULL THEN RAISE EXCEPTION 'version % not found for % %',p_version,p_token,p_id; END IF;
  SELECT count(*) INTO v_content FROM information_schema.columns WHERE table_schema=v_s AND table_name=v_t AND is_generated='NEVER' AND column_name NOT IN ('id','organization_id','created_by','created_at','updated_at','updated_by','version','deleted_at');
  IF v_content=0 THEN RAISE EXCEPTION 'cannot restore %: every column of %.% is identity, ownership or lifecycle bookkeeping, so a saved version of it holds no content to put back.',p_token,v_s,v_t; END IF;
  SELECT string_agg(quote_ident(column_name),', ' ORDER BY ordinal_position),string_agg('r.'||quote_ident(column_name),', ' ORDER BY ordinal_position) INTO v_cols,v_sel FROM information_schema.columns c WHERE table_schema=v_s AND table_name=v_t AND is_generated='NEVER' AND column_name NOT IN ('id','organization_id','created_by','created_at','updated_at','updated_by','version','deleted_at') AND v_snap ? c.column_name::text;
  IF v_cols IS NULL THEN RAISE EXCEPTION 'cannot restore % version %: that saved version holds none of the % content column(s) of %.%, so there is nothing in it to put back.',p_token,p_version,v_content,v_s,v_t; END IF;
  EXECUTE format('UPDATE %I.%I t SET (%s)=(SELECT %s FROM jsonb_populate_record(NULL::%I.%I,$1) r) WHERE t.id=$2',v_s,v_t,v_cols,v_sel,v_s,v_t) USING v_snap,p_id;
  GET DIAGNOSTICS v_n=ROW_COUNT; IF v_n=0 THEN RAISE EXCEPTION 'live row % not found (restore of hard-deleted rows unsupported)',p_id; END IF;
  EXECUTE format('SELECT version FROM %I.%I WHERE id=$1',v_s,v_t) INTO v_new USING p_id; RETURN v_new;
END $function$;

CREATE OR REPLACE FUNCTION public.version_snapshot(p_token text, p_id uuid, p_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_snap jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM platform.entity_types WHERE token=p_token AND service_only_history) THEN RAISE EXCEPTION 'classified history requires the Vault-owned reader' USING ERRCODE='42501'; END IF;
  -- 🚨 RC-A2d (R1): see public.version_list — a detail's earlier text is for its author and the
  -- record's admins only.
  IF NOT iam.has_access(p_token,p_id,
       (CASE WHEN platform.token_is_detail(p_token)
             THEN 'admin' ELSE 'viewer' END)::public.permission_level)
  THEN RAISE EXCEPTION 'access denied'; END IF;
  SELECT row_data INTO v_snap FROM history.row_versions WHERE entity_type=p_token AND row_id=p_id AND version=p_version ORDER BY id DESC LIMIT 1;
  IF v_snap IS NULL THEN RAISE EXCEPTION 'version % not found for % %',p_version,p_token,p_id; END IF; RETURN v_snap;
END $function$;

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
    -- The last PERSON who wrote in the chat (updated_by), never m.created_by: chat.message is a
    -- component, so the database rewrites created_by to the conversation's owner (db-rules §6d-1).
    from edges e join lateral (
      select max(m.created_at) last_at, count(*) cnt, (array_agg(m.updated_by order by m.created_at desc) filter (where m.updated_by is not null))[1] actor
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

CREATE OR REPLACE FUNCTION web.count_link_edges(p_site_id uuid, p_session_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_target_url text DEFAULT NULL::text, p_anchor_text text DEFAULT NULL::text, p_rel text DEFAULT NULL::text, p_is_internal boolean DEFAULT NULL::boolean, p_http_status_min integer DEFAULT NULL::integer, p_http_status_max integer DEFAULT NULL::integer, p_position_min integer DEFAULT NULL::integer, p_position_max integer DEFAULT NULL::integer)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'web', 'iam', 'public'
AS $function$
declare
  result bigint;
begin
  if not iam.has_access('web_site', p_site_id, 'viewer'::permission_level) then
    raise exception 'not authorized for site %', p_site_id using errcode = '42501';
  end if;
  select count(*) into result
  from web.link_edge e
  where e.site_id = p_site_id
    and e.deleted_at is null
    and (p_session_id is null or exists (
      select 1 from web.snapshot s
      where s.id = e.snapshot_id and s.session_id = p_session_id
    ))
    and (p_search is null or e.target_url ilike '%' || p_search || '%'
      or e.anchor_text ilike '%' || p_search || '%'
      or e.rel ilike '%' || p_search || '%')
    and (p_target_url is null or e.target_url ilike '%' || p_target_url || '%')
    and (p_anchor_text is null or e.anchor_text ilike '%' || p_anchor_text || '%')
    and (p_rel is null or e.rel ilike '%' || p_rel || '%')
    and (p_is_internal is null or e.is_internal = p_is_internal)
    and (p_http_status_min is null or e.http_status >= p_http_status_min)
    and (p_http_status_max is null or e.http_status <= p_http_status_max)
    and (p_position_min is null or e.position >= p_position_min)
    and (p_position_max is null or e.position <= p_position_max);
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION workbench.guard_template_schema_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_template_id uuid;
begin
  if current_setting('app.udt_template_provisioning', true) = 'on' then return coalesce(new, old); end if;
  select d.template_id into v_template_id
  from workbench.udt_datasets d where d.id = coalesce(new.table_id, old.table_id);
  if v_template_id is not null then
    raise exception 'dataset schema is locked to template %', v_template_id using errcode = '55000';
  end if;
  return coalesce(new, old);
end; $function$;

CREATE OR REPLACE FUNCTION workbench.udt_dataset_archive(p_table_id uuid, p_moved_to_table_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org        uuid;
  v_name       text;
  v_deleted    timestamptz;
  v_moved_to   text;
  v_in_store   boolean;
  v_rows       bigint;
  v_in_store_n bigint;
begin
  select d.organization_id, d.table_name, d.deleted_at, d.metadata #>> '{moved_to,table_id}'
    into v_org, v_name, v_deleted, v_moved_to
    from workbench.udt_datasets d
   where d.id = p_table_id;

  if v_org is null then
    raise exception 'there is no data table with the id %, so there is nothing to archive', p_table_id
      using errcode = '02000',
            hint = 'Archiving is a step of the move and the move names the dataset it just copied. A dataset that is not there was never copied.';
  end if;

  -- ALREADY DONE IS DONE. A rerun of the move re-archives nothing and raises nothing.
  if v_deleted is not null and v_moved_to = p_moved_to_table_id::text then
    return jsonb_build_object('table_id', p_table_id, 'archived', false,
                              'already_archived_at', v_deleted,
                              'moved_to', p_moved_to_table_id);
  end if;
  if v_deleted is not null and v_moved_to is distinct from p_moved_to_table_id::text then
    raise exception 'the data table % is already archived and says it became %, not %',
                    coalesce(v_name, p_table_id::text), coalesce(v_moved_to, 'nothing'), p_moved_to_table_id
      using errcode = '23514',
            hint = 'Two different answers to "where did this table go" is the one thing this door will not write. Unarchive it with workbench.udt_dataset_unarchive first if the earlier pointer was wrong.';
  end if;

  -- THE REFUSAL THAT MATTERS: never archive a source whose copy is not there.
  select true into v_in_store
    from custom.record r
   where r.organization_id = v_org
     and r.id = p_moved_to_table_id
     and r.data_class = 'table'
     and r.deleted_at is null;

  if v_in_store is not true then
    raise exception 'the data table % has not arrived in the record store yet, so it is not being archived',
                    coalesce(v_name, p_table_id::text)
      using errcode = '23514',
            hint = 'A move COPIES first and archives second. This door refuses the second half until the first half is visibly true: there is no Table record % in this organization. Run the copy again.';
  end if;

  -- AND THE SECOND HALF OF IT: every live row of the source is in the store under its own id
  -- (CUT-4). Counted rather than trusted, because "the Table arrived" is not "the rows did".
  select count(*) into v_rows
    from workbench.udt_dataset_rows w
   where w.table_id = p_table_id and w.deleted_at is null;
  select count(*) into v_in_store_n
    from custom.record r
   where r.organization_id = v_org
     and r.table_id = p_moved_to_table_id
     and r.data_class = 'record'
     and r.deleted_at is null;

  if v_in_store_n < v_rows then
    raise exception 'the data table % has % live rows and only % of them are in the record store, so it is not being archived',
                    coalesce(v_name, p_table_id::text), v_rows, v_in_store_n
      using errcode = '23514',
            hint = 'Nothing was archived and nothing was lost — the source is exactly as it was. Run the copy again; it is idempotent, so it will write only what is missing.';
  end if;

  update workbench.udt_datasets
     set deleted_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'moved_to', jsonb_build_object(
             'store', 'custom.record',
             'table_id', p_moved_to_table_id,
             'at', now(),
             'rows', v_rows,
             'reason', coalesce(nullif(btrim(p_reason), ''),
                                'moved into the unified record store; the rows kept their own identifiers')))
   where id = p_table_id;

  return jsonb_build_object('table_id', p_table_id, 'archived', true,
                            'moved_to', p_moved_to_table_id, 'rows', v_rows);
end;
$function$;

CREATE OR REPLACE FUNCTION workbench.udt_dataset_unarchive(p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_deleted timestamptz;
  v_name    text;
begin
  select d.deleted_at, d.table_name into v_deleted, v_name
    from workbench.udt_datasets d where d.id = p_table_id;
  if v_name is null then
    raise exception 'there is no data table with the id %, so there is nothing to bring back', p_table_id
      using errcode = '02000';
  end if;
  if v_deleted is null then
    return jsonb_build_object('table_id', p_table_id, 'unarchived', false,
                              'why', 'it was not archived');
  end if;
  update workbench.udt_datasets
     set deleted_at = null,
         metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('unarchived_at', now())
   where id = p_table_id;
  return jsonb_build_object('table_id', p_table_id, 'unarchived', true);
end;
$function$;

CREATE OR REPLACE FUNCTION workbench.udt_structured_list_archive(p_list_id uuid, p_moved_to_table_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org        uuid;
  v_name       text;
  v_deleted    timestamptz;
  v_moved_to   text;
  v_in_store   boolean;
  v_items      bigint;
  v_in_store_n bigint;
begin
  select l.organization_id, l.list_name, l.deleted_at, l.metadata #>> '{moved_to,table_id}'
    into v_org, v_name, v_deleted, v_moved_to
    from workbench.udt_structured_lists l
   where l.id = p_list_id;

  if v_org is null then
    raise exception 'there is no pick list with the id % in an organization, so there is nothing to archive', p_list_id
      using errcode = '02000';
  end if;
  if v_deleted is not null and v_moved_to = p_moved_to_table_id::text then
    return jsonb_build_object('list_id', p_list_id, 'archived', false, 'already_archived_at', v_deleted, 'moved_to', p_moved_to_table_id);
  end if;
  if v_deleted is not null then
    raise exception 'the pick list % is already archived and says it became %, not %',
                    coalesce(nullif(btrim(v_name), ''), p_list_id::text), coalesce(v_moved_to, 'nothing'), p_moved_to_table_id
      using errcode = '23514';
  end if;

  -- Never archive a list whose copy is not there: the copy is a Table of choices, same id.
  select true into v_in_store
    from custom.record r
   where r.organization_id = v_org and r.id = p_moved_to_table_id
     and r.data_class = 'table' and r.deleted_at is null;
  if v_in_store is not true then
    raise exception 'the pick list % has not arrived in the new system yet, so it is not being archived',
                    coalesce(nullif(btrim(v_name), ''), p_list_id::text)
      using errcode = '23514',
            hint = 'Copy again on the organization''s settings page (Data) copies it; then press the switch again.';
  end if;
  select count(*) into v_items
    from workbench.udt_structured_list_items i where i.list_id = p_list_id and i.deleted_at is null;
  -- CHOICE-COLUMN-EDIT, 2026-09-27: a live older choice is "in the new system" when its copy
  -- holds an option with its id (live, or retired there by a person — an edit made in the new
  -- system). Counting live copies refused the press forever once a person retired a choice on
  -- the copy, and let a person's added choice hide a genuinely missing one.
  select v_items - count(*) into v_in_store_n
    from workbench.udt_structured_list_items i
   where i.list_id = p_list_id and i.deleted_at is null
     and not exists (select 1 from custom.record r
                      where r.organization_id = v_org and r.table_id = p_moved_to_table_id
                        and r.id = i.id and r.data_class = 'record');
  if v_in_store_n < v_items then
    raise exception 'the pick list % has % live choices and only % of them are in the new system, so it is not being archived',
                    coalesce(nullif(btrim(v_name), ''), p_list_id::text), v_items, v_in_store_n
      using errcode = '23514',
            hint = 'Nothing was archived. Copy again on the organization''s settings page (Data) copies what is missing.';
  end if;

  update workbench.udt_structured_lists
     set deleted_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'moved_to', jsonb_build_object(
             'store', 'custom.record', 'table_id', p_moved_to_table_id, 'at', now(), 'items', v_items,
             'reason', coalesce(nullif(btrim(p_reason), ''), 'moved into the unified record store as a Table of choices; the choices kept their own identifiers')))
   where id = p_list_id;

  return jsonb_build_object('list_id', p_list_id, 'archived', true, 'moved_to', p_moved_to_table_id, 'items', v_items);
end;
$function$;

CREATE OR REPLACE FUNCTION workbench.udt_structured_list_unarchive(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_deleted timestamptz;
  v_found   boolean;
begin
  select l.deleted_at, true into v_deleted, v_found from workbench.udt_structured_lists l where l.id = p_list_id;
  if v_found is not true then
    raise exception 'there is no pick list with the id %, so there is nothing to bring back', p_list_id using errcode = '02000';
  end if;
  if v_deleted is null then
    return jsonb_build_object('list_id', p_list_id, 'unarchived', false, 'why', 'it was not archived');
  end if;
  update workbench.udt_structured_lists
     set deleted_at = null,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('unarchived_at', clock_timestamp())
   where id = p_list_id;
  return jsonb_build_object('list_id', p_list_id, 'unarchived', true);
end;
$function$;

