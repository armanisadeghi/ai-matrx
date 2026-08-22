-- bare auth.uid() -> (select auth.uid()) : InitPlan sweep, batch 3 of 3 (writes, admin actions, audit stamps and triggers)
--
-- THE BUG CLASS. A bare `auth.uid()` in a query is re-evaluated PER ROW
-- (current_setting + jsonb parse each time) and the planner will not treat it
-- as a constant, so it also refuses an index on the compared column. On a
-- SECURITY DEFINER helper that RLS calls per row, that is a whole-table scan
-- with iam.has_access firing for every row.
--
-- THE FIX. `(select auth.uid())` is an InitPlan: evaluated once per query,
-- then a constant the planner can index against. Identical rows, identical
-- security. Proven on public.get_cx_conversation_source_facets:
-- 2,869 ms -> 18 ms (migrations/cx_source_facets_initplan_uid.sql).
--
-- EQUIVALENCE. Every body below was produced mechanically from the LIVE
-- pg_get_functiondef by wrapping bare occurrences and nothing else. The
-- generator asserts the round trip: unwrapping only the occurrences it
-- inserted must reproduce the previous prosrc BYTE FOR BYTE. Occurrences
-- inside string literals, `--` comments, and plpgsql scalar assignments /
-- IF guards were deliberately left bare -- they are not per-row predicates,
-- and in iam.apply_rls / iam.verify_canonical the literal text IS the product.
-- SECURITY DEFINER/INVOKER, volatility, search_path and signatures are
-- carried through unchanged by construction (whole definition reused).
--
-- Idempotent: CREATE OR REPLACE, and re-running finds nothing left to wrap.
-- Campaign: docs/handoffs/access-kernel-scan-performance.md (ATTACHED CAMPAIGN).

-- 77 functions, 136 occurrences.

-- billing.addon_grant(p_org uuid, p_capability text, p_period billing.meter_period, p_limit bigint, p_source text, p_note text, p_expires_at timestamp with time zone) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION billing.addon_grant(p_org uuid, p_capability text, p_period billing.meter_period, p_limit bigint, p_source text, p_note text, p_expires_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
declare v_row billing.account_addon%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'billing.addon_grant: super-admin only' using errcode = '42501';
  end if;
  insert into billing.account_addon
    (organization_id, capability, period, limit_value, source, note, granted_by, expires_at)
  values (p_org, p_capability, p_period, p_limit, coalesce(p_source,'grant'), p_note, (select auth.uid()), p_expires_at)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

-- billing.org_plan_assign(p_org uuid, p_plan text, p_note text) — 3 occurrence(s)
CREATE OR REPLACE FUNCTION billing.org_plan_assign(p_org uuid, p_plan text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
declare v_row billing.org_plan%rowtype; v_tier billing.tier;
begin
  if not public.is_super_admin() then
    raise exception 'billing.org_plan_assign: super-admin only' using errcode = '42501';
  end if;
  select tier into v_tier from billing.plan where id = p_plan and active;
  if v_tier is null then
    raise exception 'billing.org_plan_assign: unknown or inactive plan "%"', p_plan;
  end if;
  insert into billing.org_plan as op
    (organization_id, plan_id, tier, source, note, granted_by, updated_by)
  values (p_org, p_plan, v_tier, 'grant', p_note, (select auth.uid()), (select auth.uid()))
  on conflict (organization_id) do update
    set plan_id = excluded.plan_id, tier = excluded.tier, note = excluded.note,
        updated_at = now(), updated_by = (select auth.uid()), version = op.version + 1
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

-- billing.org_plan_set(p_org uuid, p_tier billing.tier, p_source text, p_note text, p_expires_at timestamp with time zone) — 3 occurrence(s)
CREATE OR REPLACE FUNCTION billing.org_plan_set(p_org uuid, p_tier billing.tier, p_source text, p_note text, p_expires_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
declare v_row billing.org_plan%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'billing.org_plan_set: super-admin only'
      using errcode = '42501';
  end if;
  insert into billing.org_plan as p
    (organization_id, tier, source, note, granted_by, expires_at, updated_by)
  values (p_org, p_tier, coalesce(p_source,'grant'), p_note, (select auth.uid()), p_expires_at, (select auth.uid()))
  on conflict (organization_id) do update
    set tier = excluded.tier, source = excluded.source, note = excluded.note,
        expires_at = excluded.expires_at, updated_at = now(),
        updated_by = (select auth.uid()), version = p.version + 1
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

-- crm._deal_stage_track() — 1 occurrence(s)
CREATE OR REPLACE FUNCTION crm._deal_stage_track()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_customer_stage uuid;
begin
  if TG_OP = 'INSERT' or OLD.stage_id is distinct from NEW.stage_id then
    insert into crm.deal_stage_event (deal_id, pipeline_id, stage_id, from_stage_id, entered_at, organization_id)
    values (NEW.id, NEW.pipeline_id, NEW.stage_id,
            case when TG_OP = 'UPDATE' then OLD.stage_id end,
            NEW.stage_entered_at, NEW.organization_id);
  end if;

  if NEW.status = 'won' and (TG_OP = 'INSERT' or OLD.status is distinct from 'won') then
    insert into platform.outcome_event
      (intent_type, intent_id, subject_type, subject_id, outcome_kind, party_id,
       occurred_at, match_method, confidence, status, decided_by, decided_at,
       disposition, dedupe_key, organization_id,
       match_detail)
    values
      ('crm_deal', NEW.id, 'crm_deal', NEW.id, 'deal_won', NEW.primary_party_id,
       coalesce(NEW.closed_at, now()), 'manual', 100, 'confirmed', (select auth.uid()), now(),
       'automatic', 'crm_deal:' || NEW.id || ':won', NEW.organization_id,
       pg_catalog.jsonb_build_object('amount', NEW.amount, 'currency', NEW.currency,
                                     'pipeline_id', NEW.pipeline_id, 'auto_confirmed', true))
    on conflict (dedupe_key) do nothing;

    if NEW.primary_party_id is not null then
      select id into v_customer_stage from platform.categories
       where dimension = 'crm_lifecycle_stage' and slug = 'customer'
         and is_system and deleted_at is null limit 1;
      -- Forward-only: never demote a human's lifecycle verdict; fill timestamps only when NULL.
      update crm.party p
         set lifecycle_stage_id = coalesce(p.lifecycle_stage_id, v_customer_stage),
             lifecycle_stage_changed_at = case when p.lifecycle_stage_id is null then now()
                                               else p.lifecycle_stage_changed_at end,
             became_customer_at = coalesce(p.became_customer_at, now())
       where p.id = NEW.primary_party_id
         and (p.became_customer_at is null or p.lifecycle_stage_id is null);
    end if;
  end if;
  return NEW;
end $function$;

-- files.files_org_move_guard() — 1 occurrence(s)
CREATE OR REPLACE FUNCTION files.files_org_move_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'iam', 'auth'
AS $function$
begin
  if auth.role() is distinct from 'anon' and auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if new.organization_id is distinct from old.organization_id then
    if auth.uid() is null or auth.uid() is distinct from old.created_by then
      raise exception 'matrx_validation_gate: only the file creator may move a file to another organization'
        using errcode = '42501';
    end if;
    if new.organization_id is not null
       and not iam.has_org_access_for((select auth.uid()), new.organization_id) then
      raise exception 'matrx_validation_gate: cannot move a file into an organization you are not a member of'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

-- iam._org_audit(p_org uuid, p_target uuid, p_action text, p_detail jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION iam._org_audit(p_org uuid, p_target uuid, p_action text, p_detail jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  insert into iam.org_admin_audit(organization_id, actor_user_id, target_user_id, action, detail)
  values (p_org, (select auth.uid()), p_target, p_action, coalesce(p_detail, '{}'::jsonb));
$function$;

-- iam.fn_grant_resource_permission(p_resource_type text, p_resource_id uuid, p_grantee_id uuid, p_grantee_type text, p_level text, p_expires_at timestamp with time zone) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION iam.fn_grant_resource_permission(p_resource_type text, p_resource_id uuid, p_grantee_id uuid, p_grantee_type text DEFAULT 'user'::text, p_level text DEFAULT 'read'::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'iam'
AS $function$
declare
  v_canonical_level public.permission_level;
  v_row iam.permissions%rowtype;
begin
  if p_resource_type not in ('file', 'folder', 'web_site') then
    raise exception 'unsupported resource_type %', p_resource_type;
  end if;
  if p_grantee_type not in ('user', 'organization') then
    raise exception 'unsupported grantee_type %; the user-group ACL path is removed', p_grantee_type;
  end if;
  if p_level not in ('read', 'write', 'viewer', 'editor', 'admin') then
    raise exception 'unsupported permission level %', p_level;
  end if;
  if not iam.has_access(p_resource_type, p_resource_id, 'admin') then
    raise exception 'insufficient permission on %', p_resource_type;
  end if;

  v_canonical_level := case p_level
    when 'read' then 'viewer'::public.permission_level
    when 'viewer' then 'viewer'::public.permission_level
    when 'write' then 'editor'::public.permission_level
    when 'editor' then 'editor'::public.permission_level
    when 'admin' then 'admin'::public.permission_level
  end;

  if p_grantee_type = 'organization' then
    insert into iam.permissions (
      resource_type, resource_id, granted_to_organization_id,
      permission_level, created_by, status, expires_at
    )
    values (
      p_resource_type, p_resource_id, p_grantee_id,
      v_canonical_level, (select auth.uid()), 'active', p_expires_at
    )
    on conflict (resource_type, resource_id, granted_to_organization_id)
    do update set
      permission_level = excluded.permission_level,
      created_by = excluded.created_by,
      status = 'active',
      expires_at = excluded.expires_at
    returning * into v_row;
  else
    insert into iam.permissions (
      resource_type, resource_id, granted_to_user_id,
      permission_level, created_by, status, expires_at
    )
    values (
      p_resource_type, p_resource_id, p_grantee_id,
      v_canonical_level, (select auth.uid()), 'active', p_expires_at
    )
    on conflict (resource_type, resource_id, granted_to_user_id)
    do update set
      permission_level = excluded.permission_level,
      created_by = excluded.created_by,
      status = 'active',
      expires_at = excluded.expires_at
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'resource_id', v_row.resource_id,
    'resource_type', v_row.resource_type,
    'grantee_id', coalesce(v_row.granted_to_organization_id, v_row.granted_to_user_id),
    'grantee_type', p_grantee_type,
    'permission_level', v_row.permission_level::text,
    'granted_by', v_row.created_by,
    'expires_at', v_row.expires_at
  );
end;
$function$;

-- ops._stamp_capture_org() — 1 occurrence(s)
CREATE OR REPLACE FUNCTION ops._stamp_capture_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  cand uuid;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;  -- app already stamped the chosen org — hot-path no-op
  END IF;

  -- (2) the acting user's personal org — first candidate that resolves wins.
  FOREACH cand IN ARRAY ARRAY[NEW.created_by, NEW.user_id, (select auth.uid())]
  LOOP
    CONTINUE WHEN cand IS NULL;
    BEGIN
      NEW.organization_id := public._d31_impl_ensure_personal_organization(cand);
    EXCEPTION WHEN OTHERS THEN
      NEW.organization_id := NULL;  -- no such user — try the next candidate
    END;
    IF NEW.organization_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END LOOP;

  -- (3) genuinely system-context: the SYSTEM org. NEVER NULL (db-rules §2).
  NEW.organization_id := '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;
  RETURN NEW;
END
$function$;

-- platform.clear_output_feedback(p_subject_type text, p_subject_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION platform.clear_output_feedback(p_subject_type text, p_subject_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  delete from platform.output_feedback
   where subject_type = p_subject_type
     and subject_id = p_subject_id
     and created_by = (select auth.uid())
  returning true;
$function$;

-- platform.decide_outcome_event(p_outcome_id uuid, p_status text, p_note text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION platform.decide_outcome_event(p_outcome_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS platform.outcome_event
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row platform.outcome_event;
begin
  if p_status not in ('confirmed','rejected') then
    raise exception 'a human decision is confirmed or rejected, got %', p_status;
  end if;

  select * into v_row from platform.outcome_event where id = p_outcome_id;
  if v_row.id is null or not iam.has_access('platform_outcome_event', v_row.id, 'editor') then
    raise exception 'outcome event not found or access denied';
  end if;

  update platform.outcome_event
     set status = p_status,
         decided_by = (select auth.uid()),
         decided_at = now(),
         match_detail = match_detail
           || jsonb_build_object('human_decision', jsonb_build_object(
                'status', p_status,
                'note', p_note,
                'previous_status', v_row.status,
                'decided_at', now()))
   where id = p_outcome_id
   returning * into v_row;

  if p_status = 'confirmed' and v_row.subject_type = 'seo_reputation_case' then
    perform seo.update_reputation_case(
      v_row.subject_id, 'completed',
      jsonb_build_object(
        'completed_by_outcome_event', v_row.id,
        'outcome_kind', v_row.outcome_kind,
        'evidence_url', v_row.evidence_url));
  end if;

  return v_row;
end;
$function$;

-- platform.feature_knob_set(p_feature text, p_key text, p_value jsonb) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION platform.feature_knob_set(p_feature text, p_key text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'platform', 'public'
AS $function$
declare
  v_row platform.feature_knob%rowtype;
  v_num numeric;
begin
  if not public.is_admin() then
    raise exception 'platform.feature_knob_set: admin only' using errcode = '42501';
  end if;

  select * into v_row from platform.feature_knob where feature = p_feature and key = p_key;
  if v_row.feature is null then
    raise exception 'platform.feature_knob_set: unknown knob %.%', p_feature, p_key
      using errcode = '22023';
  end if;

  -- Reset to the agent-set default. The review obligation comes back with it.
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    update platform.feature_knob
       set value = default_value, set_by = 'agent',
           updated_by = (select auth.uid()), updated_at = now()
     where feature = p_feature and key = p_key
     returning * into v_row;
    return to_jsonb(v_row);
  end if;

  if v_row.value_type in ('number','integer') then
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'platform.feature_knob_set: %.% expects a number, got %',
        p_feature, p_key, jsonb_typeof(p_value) using errcode = '22023';
    end if;
    v_num := (p_value #>> '{}')::numeric;
    if v_row.value_type = 'integer' and v_num <> trunc(v_num) then
      raise exception 'platform.feature_knob_set: %.% expects a whole number, got %',
        p_feature, p_key, v_num using errcode = '22023';
    end if;
    if v_row.min_value is not null and v_num < v_row.min_value then
      raise exception 'platform.feature_knob_set: %.% must be >= % (got %)',
        p_feature, p_key, v_row.min_value, v_num using errcode = '22023';
    end if;
    if v_row.max_value is not null and v_num > v_row.max_value then
      raise exception 'platform.feature_knob_set: %.% must be <= % (got %)',
        p_feature, p_key, v_row.max_value, v_num using errcode = '22023';
    end if;
  elsif v_row.value_type = 'boolean' then
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'platform.feature_knob_set: %.% expects a boolean, got %',
        p_feature, p_key, jsonb_typeof(p_value) using errcode = '22023';
    end if;
  else
    if jsonb_typeof(p_value) <> 'string' then
      raise exception 'platform.feature_knob_set: %.% expects a string, got %',
        p_feature, p_key, jsonb_typeof(p_value) using errcode = '22023';
    end if;
    if v_row.allowed_values is not null
       and not (v_row.allowed_values @> jsonb_build_array(p_value)) then
      raise exception 'platform.feature_knob_set: %.% must be one of %',
        p_feature, p_key, v_row.allowed_values::text using errcode = '22023';
    end if;
  end if;

  -- set_by='human' is what takes the knob out of v_feature_knob_overdue; the
  -- date stays so a reset restores the obligation along with the value.
  update platform.feature_knob
     set value = p_value, set_by = 'human',
         updated_by = (select auth.uid()), updated_at = now()
   where feature = p_feature and key = p_key
   returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

-- public.add_data_row_to_user_table(p_table_id uuid, p_data jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.add_data_row_to_user_table(p_table_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_datasets d
      where d.id = p_table_id and d.user_id = (select auth.uid())
    )
    or coalesce(public.has_permission('dataset', p_table_id, 'editor'), false)
  ) is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_add_data_row_to_user_table(p_table_id, p_data);
end;
$function$;

-- public.add_feedback_comment(p_feedback_id uuid, p_author_type text, p_author_name text, p_content text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.add_feedback_comment(p_feedback_id uuid, p_author_type text, p_author_name text, p_content text)
 RETURNS users.feedback_comments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_name text; v_type text;
begin
  if (auth.role()='service_role' or coalesce(public.is_platform_admin(),false)) is not true then
    raise exception 'platform admin required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_content,''))) not between 1 and 20000 then
    raise exception 'comment content is required and must be at most 20000 characters' using errcode='22023';
  end if;
  if auth.role()='service_role' then
    v_name := coalesce(nullif(btrim(p_author_name),''),'Agent');
    v_type := case when p_author_type in ('admin','ai_agent') then p_author_type else 'ai_agent' end;
  else
    select coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',u.email::text,'Admin')
      into v_name from auth.users u where u.id=(select auth.uid());
    v_type := 'admin';
  end if;
  return public._d31_impl_add_feedback_comment(p_feedback_id,v_type,v_name,p_content);
end;
$function$;

-- public.admin_delete_catalog_entry(p_app text, p_kind text, p_key text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.admin_delete_catalog_entry(p_app text, p_kind text, p_key text)
 RETURNS catalog_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing public.catalog_entries;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('catalog:' || p_app || ':' || p_kind || ':' || p_key));

  SELECT * INTO existing FROM public.catalog_entries
   WHERE app = p_app AND kind = p_kind AND key = p_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No catalog entry %/%/%', p_app, p_kind, p_key USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.catalog_entries_history
    (entry_id, app, kind, key, schema_version, payload, artifact_url,
     artifact_sha256, artifact_size_bytes, min_app_version, is_active,
     sort_order, notes, op, changed_by)
  VALUES
    (existing.id, existing.app, existing.kind, existing.key,
     existing.schema_version, existing.payload, existing.artifact_url,
     existing.artifact_sha256, existing.artifact_size_bytes,
     existing.min_app_version, existing.is_active, existing.sort_order,
     existing.notes, 'delete', (select auth.uid()));

  DELETE FROM public.catalog_entries
   WHERE app = p_app AND kind = p_kind AND key = p_key;

  RETURN existing;
END;
$function$;

-- public.admin_reply_user_review(p_feedback_id uuid, p_message text, p_sender_name text, p_image_file_ids uuid[]) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.admin_reply_user_review(p_feedback_id uuid, p_message text, p_sender_name text DEFAULT 'Admin'::text, p_image_file_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_name text;
begin
  if (auth.role()='service_role' or coalesce(public.is_platform_admin(),false)) is not true then
    raise exception 'platform admin required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_message,''))) not between 1 and 20000 then
    raise exception 'message is required and must be at most 20000 characters' using errcode='22023';
  end if;
  if auth.role()='service_role' then v_name:=coalesce(nullif(btrim(p_sender_name),''),'Admin');
  else select coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',u.email::text,'Admin')
    into v_name from auth.users u where u.id=(select auth.uid()); end if;
  return public._d31_impl_admin_reply_user_review(p_feedback_id,p_message,v_name,p_image_file_ids);
end;
$function$;

-- public.admin_update_app_config(p_app text, p_schema_version integer, p_min_supported_app_version text, p_config jsonb, p_expected_updated_at timestamp with time zone) — 3 occurrence(s)
CREATE OR REPLACE FUNCTION public.admin_update_app_config(p_app text, p_schema_version integer, p_min_supported_app_version text, p_config jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS app_config
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing public.app_config;
  updated  public.app_config;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'config must be a JSON object' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('app_config:' || p_app));

  SELECT * INTO existing FROM public.app_config WHERE app = p_app;

  IF p_expected_updated_at IS NOT NULL
     AND FOUND
     AND existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Conflict: row for % changed since it was loaded (now %). Reload and re-apply.',
      p_app, existing.updated_at
      USING ERRCODE = '40001';
  END IF;

  IF FOUND THEN
    INSERT INTO public.app_config_history
      (app, schema_version, min_supported_app_version, config, changed_by)
    VALUES
      (existing.app, existing.schema_version, existing.min_supported_app_version,
       existing.config, (select auth.uid()));
  END IF;

  INSERT INTO public.app_config AS ac
    (app, schema_version, min_supported_app_version, config, updated_at, updated_by)
  VALUES
    (p_app, p_schema_version, p_min_supported_app_version, p_config, now(), (select auth.uid()))
  ON CONFLICT (app) DO UPDATE
    SET schema_version            = EXCLUDED.schema_version,
        min_supported_app_version = EXCLUDED.min_supported_app_version,
        config                    = EXCLUDED.config,
        updated_at                = now(),
        updated_by                = (select auth.uid())
  RETURNING * INTO updated;

  RETURN updated;
END;
$function$;

-- public.admin_upsert_assist_producer_policy(p_source_pattern text, p_match_kind text, p_display_name text, p_feature_key text, p_disposition text, p_audit_status text, p_production_enabled boolean, p_presentation_enabled boolean, p_cost_class text, p_max_pending_per_user integer, p_max_presented_per_cycle integer, p_working_message text, p_rationale text, p_config jsonb, p_reason text, p_expected_version integer) — 4 occurrence(s)
CREATE OR REPLACE FUNCTION public.admin_upsert_assist_producer_policy(p_source_pattern text, p_match_kind text, p_display_name text, p_feature_key text, p_disposition text, p_audit_status text, p_production_enabled boolean, p_presentation_enabled boolean, p_cost_class text, p_max_pending_per_user integer, p_max_presented_per_cycle integer, p_working_message text, p_rationale text, p_config jsonb, p_reason text, p_expected_version integer DEFAULT NULL::integer)
 RETURNS platform.assist_producer_policy
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_before platform.assist_producer_policy;
  v_after platform.assist_producer_policy;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A change reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_before
    FROM platform.assist_producer_policy
   WHERE source_pattern = p_source_pattern AND match_kind = p_match_kind
   FOR UPDATE;

  IF FOUND AND p_expected_version IS NOT NULL AND v_before.version <> p_expected_version THEN
    RAISE EXCEPTION 'Assist producer policy changed since it was loaded'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO platform.assist_producer_policy AS policy (
    source_pattern, match_kind, display_name, feature_key, disposition,
    audit_status, production_enabled, presentation_enabled, cost_class,
    max_pending_per_user, max_presented_per_cycle, working_message, rationale,
    config, created_by, updated_by
  ) VALUES (
    p_source_pattern, p_match_kind, p_display_name, p_feature_key, p_disposition,
    p_audit_status, p_production_enabled, p_presentation_enabled, p_cost_class,
    p_max_pending_per_user, p_max_presented_per_cycle, p_working_message,
    p_rationale, COALESCE(p_config, '{}'::jsonb), (select auth.uid()), (select auth.uid())
  )
  ON CONFLICT (source_pattern, match_kind) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    feature_key = EXCLUDED.feature_key,
    disposition = EXCLUDED.disposition,
    audit_status = EXCLUDED.audit_status,
    production_enabled = EXCLUDED.production_enabled,
    presentation_enabled = EXCLUDED.presentation_enabled,
    cost_class = EXCLUDED.cost_class,
    max_pending_per_user = EXCLUDED.max_pending_per_user,
    max_presented_per_cycle = EXCLUDED.max_presented_per_cycle,
    working_message = EXCLUDED.working_message,
    rationale = EXCLUDED.rationale,
    config = EXCLUDED.config,
    updated_at = now(),
    updated_by = (select auth.uid()),
    version = policy.version + 1
  RETURNING * INTO v_after;

  INSERT INTO platform.assist_producer_policy_history (
    policy_id, source_pattern, match_kind, before, after, reason, changed_by
  ) VALUES (
    v_after.id, v_after.source_pattern, v_after.match_kind,
    CASE WHEN v_before.id IS NULL THEN NULL ELSE to_jsonb(v_before) END,
    to_jsonb(v_after), p_reason, (select auth.uid())
  );

  RETURN v_after;
END;
$function$;

-- public.admin_upsert_catalog_entry(p_app text, p_kind text, p_key text, p_schema_version integer, p_payload jsonb, p_artifact_url text, p_artifact_sha256 text, p_artifact_size_bytes bigint, p_min_app_version text, p_is_active boolean, p_sort_order integer, p_notes text, p_expected_updated_at timestamp with time zone) — 3 occurrence(s)
CREATE OR REPLACE FUNCTION public.admin_upsert_catalog_entry(p_app text, p_kind text, p_key text, p_schema_version integer, p_payload jsonb, p_artifact_url text DEFAULT NULL::text, p_artifact_sha256 text DEFAULT NULL::text, p_artifact_size_bytes bigint DEFAULT NULL::bigint, p_min_app_version text DEFAULT NULL::text, p_is_active boolean DEFAULT false, p_sort_order integer DEFAULT 0, p_notes text DEFAULT NULL::text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS catalog_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing public.catalog_entries;
  updated  public.catalog_entries;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload must be a JSON object' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('catalog:' || p_app || ':' || p_kind || ':' || p_key));

  SELECT * INTO existing FROM public.catalog_entries
   WHERE app = p_app AND kind = p_kind AND key = p_key;

  IF p_expected_updated_at IS NOT NULL
     AND FOUND
     AND existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Conflict: entry %/%/% changed since it was loaded (now %). Reload and re-apply.',
      p_app, p_kind, p_key, existing.updated_at
      USING ERRCODE = '40001';
  END IF;

  IF FOUND THEN
    INSERT INTO public.catalog_entries_history
      (entry_id, app, kind, key, schema_version, payload, artifact_url,
       artifact_sha256, artifact_size_bytes, min_app_version, is_active,
       sort_order, notes, op, changed_by)
    VALUES
      (existing.id, existing.app, existing.kind, existing.key,
       existing.schema_version, existing.payload, existing.artifact_url,
       existing.artifact_sha256, existing.artifact_size_bytes,
       existing.min_app_version, existing.is_active, existing.sort_order,
       existing.notes, 'update', (select auth.uid()));
  END IF;

  INSERT INTO public.catalog_entries AS ce
    (app, kind, key, schema_version, payload, artifact_url, artifact_sha256,
     artifact_size_bytes, min_app_version, is_active, sort_order, notes,
     updated_at, updated_by)
  VALUES
    (p_app, p_kind, p_key, p_schema_version, p_payload, p_artifact_url,
     p_artifact_sha256, p_artifact_size_bytes, p_min_app_version, p_is_active,
     p_sort_order, p_notes, now(), (select auth.uid()))
  ON CONFLICT (app, kind, key) DO UPDATE
    SET schema_version      = EXCLUDED.schema_version,
        payload             = EXCLUDED.payload,
        artifact_url        = EXCLUDED.artifact_url,
        artifact_sha256     = EXCLUDED.artifact_sha256,
        artifact_size_bytes = EXCLUDED.artifact_size_bytes,
        min_app_version     = EXCLUDED.min_app_version,
        is_active           = EXCLUDED.is_active,
        sort_order          = EXCLUDED.sort_order,
        notes               = EXCLUDED.notes,
        updated_at          = now(),
        updated_by          = (select auth.uid())
  RETURNING * INTO updated;

  RETURN updated;
END;
$function$;

-- public.append_rows_to_user_table(p_table_id uuid, p_rows jsonb) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.append_rows_to_user_table(p_table_id uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_inserted int;
  v_allowed  text[];
  v_row      jsonb;
  v_clean    jsonb;
  v_key      text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets
    WHERE id = p_table_id AND user_id = (select auth.uid())
  ) THEN
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, or your access may not reach it',
      p_table_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT array_agg(field_name) INTO v_allowed
  FROM workbench.udt_dataset_fields
  WHERE table_id = p_table_id;

  v_inserted := 0;
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_clean := '{}'::jsonb;
    FOR v_key IN SELECT jsonb_object_keys(v_row)
    LOOP
      IF v_allowed IS NULL OR v_key = ANY(v_allowed) THEN
        v_clean := v_clean || jsonb_build_object(v_key, v_row -> v_key);
      END IF;
    END LOOP;

    INSERT INTO workbench.udt_dataset_rows (table_id, user_id, data)
    VALUES (p_table_id, (select auth.uid()), v_clean);
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

-- public.apply_template(p_template_id uuid, p_org_id uuid) — 1 occurrence(s)
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
    raise exception 'active template % not found', p_template_id using errcode = 'P0002';
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
      insert into context.context_items (
        scope_type_id, key, display_name, description, value_type,
        status, fetch_hint, sensitivity, source_type, created_by
      ) values (
        v_new_type_id, v_field.key, v_field.display_name, v_field.description, v_field.value_type,
        'active', 'on_demand', 'internal', 'manual', (select auth.uid())
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

-- public.apply_template_definition(p_org_id uuid, p_definition jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.apply_template_definition(p_org_id uuid, p_definition jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_type_record jsonb;
  v_field jsonb;
  v_new_type_id uuid;
  v_key_to_id jsonb := '{}'::jsonb;
  v_field_sort int;
  v_created jsonb := '[]'::jsonb;
  v_items_count int := 0;
  v_type_sort int := 0;
BEGIN
  -- Validate
  IF p_definition->'scope_types' IS NULL OR jsonb_typeof(p_definition->'scope_types') != 'array' THEN
    RAISE EXCEPTION 'Definition must include scope_types array';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM iam.organizations WHERE id = p_org_id) THEN
    RAISE EXCEPTION 'Organization % does not exist', p_org_id;
  END IF;

  -- First pass: insert all scope types (without parent refs)
  FOR v_type_record IN SELECT * FROM jsonb_array_elements(p_definition->'scope_types')
  LOOP
    IF v_type_record->>'singular' IS NULL OR v_type_record->>'plural' IS NULL THEN
      RAISE EXCEPTION 'Each scope_type must have singular and plural';
    END IF;

    INSERT INTO context.scope_types (
      organization_id, label_singular, label_plural, icon, description, sort_order, max_assignments_per_entity
    ) VALUES (
      p_org_id,
      v_type_record->>'singular',
      v_type_record->>'plural',
      COALESCE(v_type_record->>'icon', 'folder'),
      COALESCE(v_type_record->>'description', ''),
      COALESCE((v_type_record->>'sort_order')::int, v_type_sort),
      NULLIF(v_type_record->>'max_assignments_per_entity', '')::smallint
    )
    RETURNING id INTO v_new_type_id;

    v_type_sort := v_type_sort + 1;

    -- Track key → id for parent resolution
    IF v_type_record->>'key' IS NOT NULL THEN
      v_key_to_id := v_key_to_id || jsonb_build_object(v_type_record->>'key', v_new_type_id::text);
    END IF;

    v_created := v_created || jsonb_build_array(jsonb_build_object(
      'id', v_new_type_id,
      'key', v_type_record->>'key',
      'label_singular', v_type_record->>'singular',
      'label_plural', v_type_record->>'plural'
    ));

    -- Insert fields
    v_field_sort := 0;
    FOR v_field IN SELECT * FROM jsonb_array_elements(COALESCE(v_type_record->'fields', '[]'::jsonb))
    LOOP
      IF v_field->>'key' IS NULL OR v_field->>'display_name' IS NULL THEN
        RAISE EXCEPTION 'Each field must have key and display_name';
      END IF;

      INSERT INTO context.context_items (
        scope_type_id, key, display_name, description, value_type,
        status, fetch_hint, sensitivity, source_type, created_by
      ) VALUES (
        v_new_type_id,
        v_field->>'key',
        v_field->>'display_name',
        COALESCE(v_field->>'description', ''),
        COALESCE(NULLIF(v_field->>'value_type', '')::context_value_type, 'string'::context_value_type),
        'active', 'on_demand', 'internal', 'manual',
        (select auth.uid())
      );
      v_field_sort := v_field_sort + 1;
      v_items_count := v_items_count + 1;
    END LOOP;
  END LOOP;

  -- Second pass: resolve parent_key references
  FOR v_type_record IN SELECT * FROM jsonb_array_elements(p_definition->'scope_types')
  LOOP
    IF v_type_record->>'parent_key' IS NOT NULL AND v_type_record->>'key' IS NOT NULL THEN
      IF (v_key_to_id ? (v_type_record->>'parent_key')) AND (v_key_to_id ? (v_type_record->>'key')) THEN
        UPDATE context.scope_types
        SET parent_type_id = (v_key_to_id->>(v_type_record->>'parent_key'))::uuid
        WHERE id = (v_key_to_id->>(v_type_record->>'key'))::uuid;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'organization_id', p_org_id,
    'scope_types_created', v_created,
    'context_items_count', v_items_count
  );
END;
$function$;

-- public.assoc_add(p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid, p_org_id uuid, p_label text, p_metadata jsonb, p_role text, p_position integer, p_payload_kind text, p_payload jsonb) — 1 occurrence(s)
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

    select at.container_side
      into v_container_side
      from platform.association_types at
     where at.source_type = p_source_type
       and at.target_type = p_target_type
       and at.is_active;

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
        p_role, p_label, p_position, coalesce(p_metadata, '{}'::jsonb),
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

    return v_id;
end
$function$;

-- public.cat_create(p_dimension text, p_name text, p_org_id uuid, p_parent_id uuid, p_color text, p_icon text, p_slug text) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.cat_create(p_dimension text, p_name text, p_org_id uuid, p_parent_id uuid DEFAULT NULL::uuid, p_color text DEFAULT NULL::text, p_icon text DEFAULT NULL::text, p_slug text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'cat_create: not authenticated' using errcode = '42501';
  end if;
  if p_org_id is null or not iam.has_org_access(p_org_id) then
    raise exception 'cat_create: no org access' using errcode = '42501';
  end if;
  if nullif(btrim(p_dimension), '') is null then
    raise exception 'cat_create: dimension is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'cat_create: name is required' using errcode = '22023';
  end if;

  insert into platform.categories (
    organization_id, dimension, name, slug, parent_id, is_system,
    color, icon, created_by, updated_by
  ) values (
    p_org_id, btrim(p_dimension), btrim(p_name), nullif(btrim(p_slug), ''),
    p_parent_id, false, p_color, p_icon, (select auth.uid()), (select auth.uid())
  ) returning id into v_id;

  return v_id;
end;
$function$;

-- public.close_feedback_item(p_id uuid, p_status text, p_admin_notes text) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.close_feedback_item(p_id uuid, p_status text, p_admin_notes text DEFAULT NULL::text)
 RETURNS users.user_feedback
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_is_admin boolean:=coalesce(public.is_platform_admin(),false); v_is_owner boolean; v_current text;
begin
  select (f.user_id=(select auth.uid()) or f.created_by=(select auth.uid())),f.status
    into v_is_owner,v_current from users.user_feedback f
    where f.id=p_id and f.deleted_at is null;
  if auth.role()<>'service_role' and not v_is_admin then
    if coalesce(v_is_owner,false) is not true or p_status<>'closed' or v_current<>'resolved' then
      raise exception 'only the owner may close resolved feedback' using errcode='42501';
    end if;
    p_admin_notes:=null;
  end if;
  return public._d31_impl_close_feedback_item(p_id,p_status,p_admin_notes);
end;
$function$;

-- public.cmt_add(p_entity_type text, p_entity_id uuid, p_body text, p_parent_id uuid, p_org_id uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.cmt_add(p_entity_type text, p_entity_id uuid, p_body text, p_parent_id uuid DEFAULT NULL::uuid, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid := p_org_id; v_id uuid;
begin
  if v_org is null then
    if p_entity_type = 'task' then select organization_id into v_org from workspace.tasks where id = p_entity_id; end if;
  end if;
  if v_org is null then v_org := public.ensure_personal_organization(auth.uid()); end if;
  if not iam.has_org_access(v_org) then
    raise exception 'cmt_add: no org access (org=%, %/%)', v_org, p_entity_type, p_entity_id using errcode = '42501';
  end if;
  insert into platform.comments (organization_id, entity_type, entity_id, parent_id, body, created_by, updated_by)
  values (v_org, p_entity_type, p_entity_id, p_parent_id, p_body, (select auth.uid()), (select auth.uid()))
  returning id into v_id;
  return v_id;
end $function$;

-- public.cmt_delete(p_id uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.cmt_delete(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update platform.comments
     set deleted_at = now(), updated_by = (select auth.uid())
   where id = p_id and deleted_at is null
     and (created_by = (select auth.uid()) or iam.has_org_access(organization_id));
end $function$;

-- public.cmt_edit(p_id uuid, p_body text) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.cmt_edit(p_id uuid, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update platform.comments
     set body = p_body, updated_by = (select auth.uid())
   where id = p_id and deleted_at is null and created_by = (select auth.uid());
end $function$;

-- public.create_bundle_with_lister(p_name text, p_description text, p_is_system boolean, p_lister_tool_name text, p_member_tool_names text[]) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.create_bundle_with_lister(p_name text, p_description text DEFAULT ''::text, p_is_system boolean DEFAULT false, p_lister_tool_name text DEFAULT NULL::text, p_member_tool_names text[] DEFAULT ARRAY[]::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_bundle_id uuid;
    v_lister_id uuid;
    v_lister_name text := COALESCE(p_lister_tool_name, 'bundle:list_' || p_name);
    v_lister_desc text := 'Discovery tool — loads the ' || p_name ||
        ' bundle''s tools on demand, then removes itself. Call it when you need that toolkit.';
BEGIN
    SELECT id INTO v_lister_id FROM tool.definition WHERE name = v_lister_name;
    IF v_lister_id IS NULL THEN
        INSERT INTO tool.definition (name, description, parameters, category, tool_group, source_kind, is_active)
        VALUES (v_lister_name, v_lister_desc, '{}'::jsonb, 'bundle', 'core', 'native', true)
        RETURNING id INTO v_lister_id;
    ELSE
        UPDATE tool.definition SET is_active = true, updated_at = now() WHERE id = v_lister_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM tool.binding WHERE tool_id = v_lister_id AND executor_name = 'matrx-ai-core') THEN
        INSERT INTO tool.binding (tool_id, executor_name, is_active) VALUES (v_lister_id, 'matrx-ai-core', true);
    ELSE
        UPDATE tool.binding SET is_active = true, updated_at = now()
        WHERE tool_id = v_lister_id AND executor_name = 'matrx-ai-core';
    END IF;

    SELECT id INTO v_bundle_id FROM tool.bundle WHERE name = p_name;
    IF v_bundle_id IS NULL THEN
        INSERT INTO tool.bundle (name, description, is_system, lister_tool_id, created_by)
        VALUES (p_name, p_description, p_is_system, v_lister_id, (select auth.uid()))
        RETURNING id INTO v_bundle_id;
    ELSE
        UPDATE tool.bundle
        SET description = p_description, is_system = p_is_system, lister_tool_id = v_lister_id, updated_at = now()
        WHERE id = v_bundle_id;
    END IF;

    INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role, metadata)
    SELECT 'tool', d.id, 'tool_bundle', v_bundle_id,
           (SELECT organization_id FROM tool.bundle WHERE id = v_bundle_id),
           'member', jsonb_build_object('local_alias', d.name)
    FROM tool.definition d
    WHERE d.name = ANY(p_member_tool_names)
    ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

    RETURN v_bundle_id;
END;
$function$;

-- public.create_context_item(p_scope_type_id uuid, p_key text, p_display_name text, p_value_type context_value_type, p_description text, p_category text, p_fetch_hint context_fetch_hint, p_sensitivity context_sensitivity, p_tags text[], p_slug text, p_sort_order smallint, p_allowed_reference_types text[], p_max_items integer, p_allowed_scope_type_ids uuid[], p_reference_source jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.create_context_item(p_scope_type_id uuid, p_key text, p_display_name text, p_value_type context_value_type, p_description text DEFAULT ''::text, p_category text DEFAULT NULL::text, p_fetch_hint context_fetch_hint DEFAULT 'on_demand'::context_fetch_hint, p_sensitivity context_sensitivity DEFAULT 'internal'::context_sensitivity, p_tags text[] DEFAULT '{}'::text[], p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint, p_allowed_reference_types text[] DEFAULT NULL::text[], p_max_items integer DEFAULT 1, p_allowed_scope_type_ids uuid[] DEFAULT NULL::uuid[], p_reference_source jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid; v_sort smallint; v_org_id uuid;
begin
  select organization_id into v_org_id from context.scope_types where id=p_scope_type_id and deleted_at is null;
  if v_org_id is null then raise exception 'active scope type % not found',p_scope_type_id using errcode='P0002'; end if;
  if (auth.role()='service_role' or iam.has_org_admin(v_org_id)) is not true then raise exception 'organization admin required for %',v_org_id using errcode='42501'; end if;
  perform context.validate_dataset_template_source(p_reference_source,v_org_id);
  v_sort:=coalesce(p_sort_order,(select (coalesce(max(sort_order),0)+1)::smallint from context.context_items where scope_type_id=p_scope_type_id and is_active));
  insert into context.context_items (scope_type_id,key,display_name,description,category,value_type,fetch_hint,sensitivity,status,source_type,tags,slug,sort_order,created_by,allowed_reference_types,max_items,allowed_scope_type_ids,reference_source)
  values (p_scope_type_id,p_key,p_display_name,p_description,p_category,p_value_type,p_fetch_hint,p_sensitivity,'active','manual',p_tags,p_slug,v_sort,(select auth.uid()),p_allowed_reference_types,coalesce(p_max_items,1),p_allowed_scope_type_ids,p_reference_source) returning id into v_id;
  return (select to_jsonb(ci) from context.context_items ci where ci.id=v_id);
end; $function$;

-- public.create_new_user_table_dynamic(p_table_name text, p_description text, p_is_public boolean, p_authenticated_read boolean, p_initial_fields jsonb) — 5 occurrence(s)
CREATE OR REPLACE FUNCTION public.create_new_user_table_dynamic(p_table_name text, p_description text, p_is_public boolean, p_authenticated_read boolean DEFAULT false, p_initial_fields jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_table_id UUID;
    v_field_id UUID;
    v_field JSONB;
    v_data_type public.field_data_type;
    v_initial_row_id UUID;
    v_field_name TEXT;
    v_display_name TEXT;
    v_existing_count INT;
BEGIN
    SELECT COUNT(*) INTO v_existing_count
    FROM workbench.udt_datasets
    WHERE user_id = (select auth.uid()) AND table_name = p_table_name;

    IF v_existing_count > 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', format('A table named "%s" already exists.', p_table_name),
            'error_code', 'DUPLICATE_TABLE_NAME'
        );
    END IF;

    IF p_table_name IS NULL OR TRIM(p_table_name) = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Table name cannot be empty.',
            'error_code', 'EMPTY_TABLE_NAME'
        );
    END IF;

    INSERT INTO workbench.udt_datasets (table_name, description, user_id, is_public)
    VALUES (p_table_name, COALESCE(p_description, 'New table'), (select auth.uid()), p_is_public)
    RETURNING id INTO v_table_id;

    IF p_initial_fields IS NOT NULL AND jsonb_array_length(p_initial_fields) > 0 THEN
        FOR v_field IN SELECT * FROM jsonb_array_elements(p_initial_fields) LOOP
            EXECUTE format('SELECT %L::public.field_data_type', v_field->>'data_type') INTO v_data_type;
            v_display_name := COALESCE(NULLIF(v_field->>'display_name', ''), v_field->>'field_name');
            v_field_name := public.to_snake_case(v_field->>'field_name');

            IF NOT (v_field_name ~ '^[a-z][a-z0-9_]*$') THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'error', format('Invalid field name: "%s".', v_field_name),
                    'error_code', 'INVALID_FIELD_NAME'
                );
            END IF;

            INSERT INTO workbench.udt_dataset_fields (
                table_id, field_name, display_name, data_type, field_order,
                is_required, default_value, validation_rules, user_id
            )
            VALUES (
                v_table_id, v_field_name, v_display_name, v_data_type,
                COALESCE((v_field->>'field_order')::INT, 0),
                COALESCE((v_field->>'is_required')::BOOLEAN, FALSE),
                COALESCE(v_field->'default_value', 'null'::jsonb),
                COALESCE(v_field->'validation_rules', 'null'::jsonb),
                (select auth.uid())
            )
            RETURNING id INTO v_field_id;
        END LOOP;
    ELSE
        EXECUTE format('SELECT %L::public.field_data_type', 'integer') INTO v_data_type;
        INSERT INTO workbench.udt_dataset_fields (
            table_id, field_name, display_name, data_type, field_order,
            is_required, default_value, validation_rules, user_id
        )
        VALUES (v_table_id, 'id', 'ID', v_data_type, 0, TRUE, 'null'::jsonb, 'null'::jsonb, (select auth.uid()))
        RETURNING id INTO v_field_id;
    END IF;

    INSERT INTO workbench.udt_dataset_rows (table_id, data, user_id)
    VALUES (v_table_id, '{}'::jsonb, (select auth.uid()))
    RETURNING id INTO v_initial_row_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'table_id', v_table_id,
        'table_name', p_table_name,
        'message', 'Table created successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', format('Failed to create table: %s', SQLERRM),
        'error_code', 'UNEXPECTED_ERROR'
    );
END;
$function$;

-- public.create_note_version_manual(p_note_id uuid, p_content text, p_label text, p_change_source text, p_change_type text) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.create_note_version_manual(p_note_id uuid, p_content text, p_label text, p_change_source text DEFAULT 'user'::text, p_change_type text DEFAULT 'manual'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'workbench', 'history', 'iam'
AS $function$
declare v_org uuid; v_ver int; v_id bigint;
begin
  select organization_id, version into v_org, v_ver from workbench.notes where id=p_note_id;
  if v_org is null then raise exception 'note not found'; end if;
  if not exists (select 1 from workbench.notes n where n.id=p_note_id and (n.created_by=(select auth.uid()) or iam.has_access('note', n.id, 'editor'))) then
    raise exception 'not authorized';
  end if;
  insert into history.row_versions(entity_type,row_id,organization_id,version,operation,row_data,actor_id,occurred_at)
  values ('note', p_note_id, v_org, coalesce(v_ver,1), 'UPDATE',
    jsonb_build_object('id',p_note_id,'content',p_content,'label',p_label,'version',coalesce(v_ver,1))
      || jsonb_build_object('_change_source',p_change_source,'_change_type',p_change_type),
    (select auth.uid()), now())
  returning id into v_id;
  return v_id::text;
end $function$;

-- public.create_scope(p_org_id uuid, p_type_id uuid, p_name text, p_parent_scope_id uuid, p_description text, p_settings jsonb, p_slug text, p_sort_order smallint) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.create_scope(p_org_id uuid, p_type_id uuid, p_name text, p_parent_scope_id uuid DEFAULT NULL::uuid, p_description text DEFAULT ''::text, p_settings jsonb DEFAULT '{}'::jsonb, p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_scope context.scopes; v_type_label text; v_sort smallint;
BEGIN
  IF NOT iam.has_org_access(p_org_id) THEN
    RAISE EXCEPTION 'not authorized for organization %', p_org_id USING ERRCODE = '42501';
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

-- public.create_shortcut_from_agent_surface(p_agent_surface_id uuid, p_category_id uuid, p_user_id uuid, p_organization_id uuid, p_project_id uuid, p_task_id uuid, p_overrides jsonb) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.create_shortcut_from_agent_surface(p_agent_surface_id uuid, p_category_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_agent_id       uuid;
  v_surface_name   text;
  v_value_maps     jsonb;
  v_write_policies jsonb;
  v_effective_maps jsonb;
  v_agent          record;
  v_new_id         uuid;
  v_label          text;
  v_description    text;
  v_icon_name      text;
begin
  select a.source_id,
         us.name,
         coalesce(a.payload->'value_mappings', a.metadata->'value_mappings', '{}'::jsonb),
         coalesce(a.payload->'write_policies', '{}'::jsonb)
    into v_agent_id, v_surface_name, v_value_maps, v_write_policies
    from platform.associations_live a
    join ui.ui_surface us on us.id = a.target_id
   where a.id = p_agent_surface_id
     and a.source_type = 'agent'
     and a.target_type = 'surface';

  if v_agent_id is null then
    raise exception 'agent-surface binding association % not found', p_agent_surface_id;
  end if;

  select id, name, description into v_agent
    from agent.definition where id = v_agent_id;
  if not found then
    raise exception 'agent.definition row % not found', v_agent_id;
  end if;

  v_label       := coalesce(p_overrides->>'label',       v_agent.name || ' Shortcut');
  v_description := coalesce(p_overrides->>'description', v_agent.description);
  v_icon_name   := coalesce(p_overrides->>'icon_name',   null);

  v_effective_maps := coalesce((p_overrides->'value_mappings')::jsonb, v_value_maps);
  if v_write_policies <> '{}'::jsonb
     and not (v_effective_maps ? '__write_policies') then
    v_effective_maps := coalesce(v_effective_maps, '{}'::jsonb)
      || jsonb_build_object('__write_policies', v_write_policies);
  end if;

  insert into agent.shortcut (
    category_id, label, description, icon_name, agent_id, surface_name,
    value_mappings, created_by, organization_id,
    keyboard_shortcut, display_mode, allow_chat, auto_run, show_variable_panel,
    variables_panel_style, show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results, show_pre_execution_gate, pre_execution_message,
    bypass_gate_seconds, default_user_input, default_variables, context_overrides,
    llm_overrides, response_density, json_extraction, enabled_features, use_latest,
    agent_version_id, is_active
  ) values (
    p_category_id, v_label, v_description, v_icon_name, v_agent_id, v_surface_name,
    v_effective_maps,
    p_user_id, p_organization_id,
    p_overrides->>'keyboard_shortcut',
    coalesce(p_overrides->>'display_mode', 'modal-full'),
    coalesce((p_overrides->>'allow_chat')::boolean, true),
    coalesce((p_overrides->>'auto_run')::boolean, true),
    coalesce((p_overrides->>'show_variable_panel')::boolean, false),
    coalesce(p_overrides->>'variables_panel_style', 'inline'),
    coalesce((p_overrides->>'show_definition_messages')::boolean, false),
    coalesce((p_overrides->>'show_definition_message_content')::boolean, false),
    coalesce((p_overrides->>'hide_reasoning')::boolean, false),
    coalesce((p_overrides->>'hide_tool_results')::boolean, false),
    coalesce((p_overrides->>'show_pre_execution_gate')::boolean, false),
    p_overrides->>'pre_execution_message',
    coalesce((p_overrides->>'bypass_gate_seconds')::int, 3),
    p_overrides->>'default_user_input',
    (p_overrides->'default_variables')::jsonb,
    (p_overrides->'context_overrides')::jsonb,
    (p_overrides->'llm_overrides')::jsonb,
    coalesce(p_overrides->>'response_density', 'comfortable'),
    (p_overrides->'json_extraction')::jsonb,
    coalesce((p_overrides->'enabled_features')::jsonb, '["general"]'::jsonb),
    coalesce((p_overrides->>'use_latest')::boolean, true),
    nullif(p_overrides->>'agent_version_id', '')::uuid,
    true
  )
  returning id into v_new_id;

  if p_project_id is not null then
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    values ('agent_shortcut', v_new_id, 'project', p_project_id,
            coalesce(p_organization_id, (select w.organization_id from workspace.projects w where w.id = p_project_id)),
            coalesce(p_user_id, (select auth.uid())))
    on conflict do nothing;
  end if;
  if p_task_id is not null then
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    values ('agent_shortcut', v_new_id, 'task', p_task_id,
            coalesce(p_organization_id, (select w.organization_id from workspace.tasks w where w.id = p_task_id)),
            coalesce(p_user_id, (select auth.uid())))
    on conflict do nothing;
  end if;

  return v_new_id;
end;
$function$;

-- public.create_user_table_with_fields(p_table_name text, p_description text, p_is_public boolean, p_organization_id uuid, p_project_id uuid, p_task_id uuid, p_fields jsonb) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.create_user_table_with_fields(p_table_name text, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_fields jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_table_id uuid;
  v_field    jsonb;
BEGIN
  INSERT INTO workbench.udt_datasets (
    table_name, description, is_public,
    organization_id, project_id, task_id, user_id
  )
  VALUES (
    p_table_name, p_description, p_is_public,
    p_organization_id, p_project_id, p_task_id, (select auth.uid())
  )
  RETURNING id INTO v_table_id;

  FOR v_field IN SELECT * FROM jsonb_array_elements(p_fields)
  LOOP
    INSERT INTO workbench.udt_dataset_fields (
      table_id, user_id,
      field_name, display_name,
      data_type, field_order, is_required,
      default_value, validation_rules
    )
    VALUES (
      v_table_id,
      (select auth.uid()),
      v_field->>'field_name',
      COALESCE(v_field->>'display_name', v_field->>'field_name'),
      COALESCE((v_field->>'data_type')::public.field_data_type, 'string'::public.field_data_type),
      COALESCE((v_field->>'field_order')::int, 0),
      COALESCE((v_field->>'is_required')::boolean, false),
      v_field->'default_value',
      v_field->'validation_rules'
    );
  END LOOP;

  RETURN v_table_id;
END;
$function$;

-- public.crm_dismiss_merge_candidate(p_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.crm_dismiss_merge_candidate(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v crm.merge_candidate;
begin
  select * into v from crm.merge_candidate where id = p_id and deleted_at is null;
  if v.id is null then
    raise exception 'crm_dismiss_merge_candidate: candidate % not found', p_id using errcode = 'P0002';
  end if;
  if not (iam.has_access('party', v.source_id, 'editor') or iam.has_access('party', v.target_id, 'editor')) then
    raise exception 'crm_dismiss_merge_candidate: editor access required' using errcode = '42501';
  end if;
  update crm.merge_candidate
     set status = 'dismissed', dismissed_by = (select auth.uid()), dismissed_at = now()
   where id = p_id;
  perform platform.log_activity(v.organization_id, 'crm.party.merge_candidate_dismissed',
    'party', v.source_id, jsonb_build_object('candidate_id', p_id, 'target_id', v.target_id));
end $function$;

-- public.crm_merge_parties(p_winner uuid, p_loser uuid, p_method text, p_reason text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.crm_merge_parties(p_winner uuid, p_loser uuid, p_method text DEFAULT 'manual'::text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_merge_id uuid; v_moved jsonb := '{}'::jsonb; v_ids uuid[]; v_demoted uuid[];
begin
  if p_winner = p_loser then
    raise exception 'crm_merge_parties: cannot merge a party into itself' using errcode = '22023';
  end if;
  select organization_id into v_org from crm.party where id = p_winner and deleted_at is null;
  if v_org is null then
    raise exception 'crm_merge_parties: winner party % not found', p_winner using errcode = 'P0002';
  end if;
  if not exists (select 1 from crm.party where id = p_loser and deleted_at is null and organization_id = v_org) then
    raise exception 'crm_merge_parties: loser party % not found in the same organization', p_loser using errcode = 'P0002';
  end if;
  if not (iam.has_access('party', p_winner, 'editor') and iam.has_access('party', p_loser, 'editor')) then
    raise exception 'crm_merge_parties: editor access required on both parties' using errcode = '42501';
  end if;
  if exists (select 1 from crm.party where id in (p_winner, p_loser) and canonical_id is not null) then
    raise exception 'crm_merge_parties: one of these parties is already merged - unmerge first' using errcode = '22023';
  end if;

  -- Contact points: keep a moved primary unless the winner already has a
  -- primary on that channel. Record what was demoted, for exact unmerge.
  with moved as (
    update crm.party_contact_point cp
       set party_id = p_winner,
           is_primary = cp.is_primary and not exists (
             select 1 from crm.party_contact_point w
              where w.party_id = p_winner and w.channel = cp.channel
                and w.is_primary and w.deleted_at is null)
     where cp.party_id = p_loser and cp.deleted_at is null
       and not exists (select 1 from crm.party_contact_point w
                        where w.party_id = p_winner and w.medium_id = cp.medium_id and w.deleted_at is null)
    returning cp.id, (not cp.is_primary) as demoted_or_never,
              cp.is_primary as now_primary)
  select coalesce(array_agg(id), '{}'),
         coalesce(array_agg(id) filter (where not now_primary
           and exists (select 1 from crm.party_contact_point o where o.id = moved.id)), '{}')
    into v_ids, v_demoted from moved;
  -- The filter above cannot see the PRE-update flag from RETURNING; recompute
  -- demotions directly: a moved row that is primary at the loser's unique
  -- scope but not primary now was demoted by this merge.
  v_demoted := coalesce((
    select array_agg(cp.id) from crm.party_contact_point cp
     where cp.id = any (v_ids) and not cp.is_primary
       and exists (select 1 from crm.party_contact_point w
                    where w.party_id = p_winner and w.channel = cp.channel
                      and w.is_primary and w.deleted_at is null)
       and not exists (
         -- rows that were never primary at the loser leave no gap there:
         -- the loser still holds a primary for this channel among the
         -- rows that did NOT move.
         select 1 from crm.party_contact_point l
          where l.party_id = p_loser and l.channel = cp.channel
            and l.is_primary and l.deleted_at is null)), '{}');
  v_moved := v_moved || jsonb_build_object('party_contact_point', to_jsonb(v_ids),
                                           'primary_demoted_party_contact_point', to_jsonb(v_demoted));

  with moved as (
    update crm.address a
       set party_id = p_winner,
           is_primary = a.is_primary and not exists (
             select 1 from crm.address w
              where w.party_id = p_winner and w.purpose_code = a.purpose_code
                and w.is_primary and w.deleted_at is null)
     where a.party_id = p_loser and a.deleted_at is null
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_demoted := coalesce((
    select array_agg(a.id) from crm.address a
     where a.id = any (v_ids) and not a.is_primary
       and exists (select 1 from crm.address w
                    where w.party_id = p_winner and w.purpose_code = a.purpose_code
                      and w.is_primary and w.deleted_at is null)
       and not exists (select 1 from crm.address l
                        where l.party_id = p_loser and l.purpose_code = a.purpose_code
                          and l.is_primary and l.deleted_at is null)), '{}');
  v_moved := v_moved || jsonb_build_object('address', to_jsonb(v_ids),
                                           'primary_demoted_address', to_jsonb(v_demoted));

  with moved as (
    update crm.affiliation a
       set party_id = p_winner,
           is_primary = a.is_primary and not exists (
             select 1 from crm.affiliation w
              where w.party_id = p_winner and w.is_primary and w.deleted_at is null
                and daterange(w.start_date, w.end_date, '[]') && daterange(a.start_date, a.end_date, '[]'))
     where a.party_id = p_loser and a.deleted_at is null
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_demoted := coalesce((
    select array_agg(a.id) from crm.affiliation a
     where a.id = any (v_ids) and not a.is_primary
       and exists (select 1 from crm.affiliation w
                    where w.party_id = p_winner and w.is_primary and w.deleted_at is null
                      and w.id <> a.id
                      and daterange(w.start_date, w.end_date, '[]') && daterange(a.start_date, a.end_date, '[]'))
       and not exists (select 1 from crm.affiliation l
                        where l.party_id = p_loser and l.is_primary and l.deleted_at is null
                          and daterange(l.start_date, l.end_date, '[]') && daterange(a.start_date, a.end_date, '[]'))), '{}');
  v_moved := v_moved || jsonb_build_object('affiliation', to_jsonb(v_ids),
                                           'primary_demoted_affiliation', to_jsonb(v_demoted));

  with moved as (update crm.interaction set party_id = p_winner
                  where party_id = p_loser and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('interaction', to_jsonb(v_ids));

  with moved as (
    update crm.outreach_list_member cm set party_id = p_winner
     where cm.party_id = p_loser and cm.deleted_at is null
       and not exists (select 1 from crm.outreach_list_member w
                        where w.outreach_list_id = cm.outreach_list_id and w.party_id = p_winner and w.deleted_at is null)
    returning cm.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('outreach_list_member', to_jsonb(v_ids));

  with moved as (update crm.deal set primary_party_id = p_winner
                  where primary_party_id = p_loser and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('deal_primary', to_jsonb(v_ids));

  with moved as (
    update platform.associations a set source_id = p_winner
     where a.source_type = 'party' and a.source_id = p_loser
       and not exists (select 1 from platform.associations_live w
                        where w.source_type = 'party' and w.source_id = p_winner
                          and w.target_type = a.target_type and w.target_id = a.target_id
                          and w.role is not distinct from a.role)
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('assoc_source', to_jsonb(v_ids));

  with moved as (
    update platform.associations a set target_id = p_winner
     where a.target_type = 'party' and a.target_id = p_loser
       and not exists (select 1 from platform.associations_live w
                        where w.target_type = 'party' and w.target_id = p_winner
                          and w.source_type = a.source_type and w.source_id = a.source_id
                          and w.role is not distinct from a.role)
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('assoc_target', to_jsonb(v_ids));

  update crm.party set canonical_id = p_winner where id = p_loser;

  insert into crm.party_merge (winner_id, loser_id, moved, method, reason, merged_by, organization_id)
  values (p_winner, p_loser, v_moved, p_method, p_reason, (select auth.uid()), v_org)
  returning id into v_merge_id;

  perform platform.log_activity(v_org, 'crm.party.merge', 'party', p_winner,
    jsonb_build_object('loser_id', p_loser, 'merge_id', v_merge_id, 'method', p_method));
  return v_merge_id;
end $function$;

-- public.crm_resume_sending_identity(p_identity_id uuid, p_note text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.crm_resume_sending_identity(p_identity_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public', 'pg_temp'
AS $function$
declare si crm.sending_identity;
begin
  select * into si from crm.sending_identity where id = p_identity_id and deleted_at is null;
  if si.id is null then raise exception 'sending identity not found' using errcode='no_data_found'; end if;
  if not public.is_org_admin(si.organization_id) then
    raise exception 'only an organization admin can resume a paused mailbox' using errcode='42501';
  end if;
  if si.status <> 'paused' then
    return jsonb_build_object('ok', false, 'error', 'not_paused', 'status', si.status);
  end if;

  update crm.sending_identity
     set status = case when warmup_completed_at is null and warmup_started_at is not null
                       then 'warming' else 'ready' end,
         status_changed_at = now(), resumed_at = now(), resumed_by = (select auth.uid()),
         paused_at = null, paused_by_kind = null, pause_reason = null, pause_code = null
   where id = p_identity_id;

  update crm.outreach_list
     set paused_at = null, paused_by_kind = null, pause_reason = null
   where sending_identity_id = p_identity_id and paused_by_kind = 'system' and deleted_at is null;

  insert into crm.sending_identity_check (identity_id, check_kind, passed, message, organization_id, observed)
  values (p_identity_id, 'connection', true,
          coalesce('Resumed by a human. ' || p_note, 'Resumed by a human.'),
          si.organization_id, jsonb_build_object('previous_pause_reason', si.pause_reason));

  return jsonb_build_object('ok', true, 'identity_id', p_identity_id);
end $function$;

-- public.crm_unmerge_parties(p_merge_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.crm_unmerge_parties(p_merge_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_m crm.party_merge;
begin
  select * into v_m from crm.party_merge where id = p_merge_id and unmerged_at is null;
  if v_m.id is null then
    raise exception 'crm_unmerge_parties: merge record % not found or already undone', p_merge_id using errcode = 'P0002';
  end if;
  if not iam.has_access('party', v_m.winner_id, 'editor') then
    raise exception 'crm_unmerge_parties: editor access required' using errcode = '42501';
  end if;

  -- Move rows back PRESERVING their primary flags (a primary the winner
  -- inherited returns as the loser's primary), demoting only on a genuine
  -- conflict at the loser so the partial-unique indexes cannot 23505.
  update crm.party_contact_point cp
     set party_id = v_m.loser_id,
         is_primary = cp.is_primary and not exists (
           select 1 from crm.party_contact_point w
            where w.party_id = v_m.loser_id and w.channel = cp.channel
              and w.is_primary and w.deleted_at is null and w.id <> cp.id)
   where cp.id = any (array(select jsonb_array_elements_text(v_m.moved->'party_contact_point'))::uuid[]);
  update crm.address a
     set party_id = v_m.loser_id,
         is_primary = a.is_primary and not exists (
           select 1 from crm.address w
            where w.party_id = v_m.loser_id and w.purpose_code = a.purpose_code
              and w.is_primary and w.deleted_at is null and w.id <> a.id)
   where a.id = any (array(select jsonb_array_elements_text(v_m.moved->'address'))::uuid[]);
  update crm.affiliation a
     set party_id = v_m.loser_id,
         is_primary = a.is_primary and not exists (
           select 1 from crm.affiliation w
            where w.party_id = v_m.loser_id and w.is_primary and w.deleted_at is null
              and w.id <> a.id
              and daterange(w.start_date, w.end_date, '[]') && daterange(a.start_date, a.end_date, '[]'))
   where a.id = any (array(select jsonb_array_elements_text(v_m.moved->'affiliation'))::uuid[]);

  -- Restore the primaries THIS merge demoted (ledger keys absent on
  -- pre-crm_12 merges → empty sets, same behavior as before). Guarded: the
  -- flag comes back only if no other primary took the slot meanwhile.
  update crm.party_contact_point cp set is_primary = true
   where cp.id = any (array(select jsonb_array_elements_text(v_m.moved->'primary_demoted_party_contact_point'))::uuid[])
     and cp.deleted_at is null and not cp.is_primary
     and not exists (select 1 from crm.party_contact_point w
                      where w.party_id = cp.party_id and w.channel = cp.channel
                        and w.is_primary and w.deleted_at is null);
  update crm.address a set is_primary = true
   where a.id = any (array(select jsonb_array_elements_text(v_m.moved->'primary_demoted_address'))::uuid[])
     and a.deleted_at is null and not a.is_primary
     and not exists (select 1 from crm.address w
                      where w.party_id = a.party_id and w.purpose_code = a.purpose_code
                        and w.is_primary and w.deleted_at is null);
  update crm.affiliation a set is_primary = true
   where a.id = any (array(select jsonb_array_elements_text(v_m.moved->'primary_demoted_affiliation'))::uuid[])
     and a.deleted_at is null and not a.is_primary
     and not exists (select 1 from crm.affiliation w
                      where w.party_id = a.party_id and w.is_primary and w.deleted_at is null
                        and daterange(w.start_date, w.end_date, '[]') && daterange(a.start_date, a.end_date, '[]'));

  update crm.interaction set party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'interaction'))::uuid[]);
  update crm.outreach_list_member set party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'outreach_list_member'))::uuid[]);
  update crm.deal set primary_party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'deal_primary'))::uuid[]);
  update platform.associations set source_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'assoc_source'))::uuid[]);
  update platform.associations set target_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'assoc_target'))::uuid[]);

  update crm.party set canonical_id = null where id = v_m.loser_id;
  update crm.party_merge set unmerged_at = now(), unmerged_by = (select auth.uid()) where id = p_merge_id;

  perform platform.log_activity(v_m.organization_id, 'crm.party.unmerge', 'party', v_m.winner_id,
    jsonb_build_object('loser_id', v_m.loser_id, 'merge_id', p_merge_id));
end $function$;

-- public.delete_note_version(p_id text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.delete_note_version(p_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'workbench', 'history', 'iam'
AS $function$
declare v_note uuid;
begin
  select row_id into v_note from history.row_versions where id=p_id::bigint and entity_type='note';
  if v_note is null then return false; end if;
  if not exists (select 1 from workbench.notes n where n.id=v_note and (n.created_by=(select auth.uid()) or iam.has_access('note', n.id, 'editor'))) then
    raise exception 'not authorized to delete this note version';
  end if;
  delete from history.row_versions where id=p_id::bigint and entity_type='note';
  return true;
end $function$;

-- public.delete_scope(p_scope_id uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.delete_scope(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_child_count integer;
  v_assignment_count integer;
  v_org uuid;
begin
  select scope.organization_id
  into v_org
  from context.scopes as scope
  where scope.id = p_scope_id
    and scope.deleted_at is null;

  if v_org is null then
    raise exception 'scope not found' using errcode = 'P0002';
  end if;

  if auth.role() <> 'service_role'
     and not exists (
       select 1
       from iam.memberships as membership
       where membership.container_type = 'organization'
         and membership.container_id = v_org
         and membership.organization_id = v_org
         and membership.user_id = (select auth.uid())
         and membership.role in ('owner', 'admin')
         and membership.status = 'active'
         and membership.deleted_at is null
     ) then
    raise exception 'organization owner or admin required'
      using errcode = '42501';
  end if;

  with recursive children as (
    select scope.id
    from context.scopes as scope
    where scope.parent_scope_id = p_scope_id
      and scope.deleted_at is null
    union all
    select scope.id
    from context.scopes as scope
    join children as child on scope.parent_scope_id = child.id
    where scope.deleted_at is null
  )
  select count(*) into v_child_count from children;

  with recursive all_scopes as (
    select p_scope_id as id
    union all
    select scope.id
    from context.scopes as scope
    join all_scopes as parent on scope.parent_scope_id = parent.id
    where scope.deleted_at is null
  )
  select count(*)
  into v_assignment_count
  from platform.associations_live as association
  where association.target_type = 'scope'
    and association.target_id in (select id from all_scopes);

  with recursive all_scopes as (
    select p_scope_id as id
    union all
    select scope.id
    from context.scopes as scope
    join all_scopes as parent on scope.parent_scope_id = parent.id
    where scope.deleted_at is null
  )
  update context.scopes
  set deleted_at = now(),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id in (select id from all_scopes)
    and deleted_at is null;

  return jsonb_build_object(
    'deleted_children', v_child_count,
    'deleted_assignments', v_assignment_count
  );
end;
$function$;

-- public.delete_scope_type(p_type_id uuid) — 4 occurrence(s)
CREATE OR REPLACE FUNCTION public.delete_scope_type(p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_scope_count integer;
  v_assignment_count integer;
  v_org uuid;
begin
  select scope_type.organization_id
  into v_org
  from context.scope_types as scope_type
  where scope_type.id = p_type_id
    and scope_type.deleted_at is null;

  if v_org is null then
    raise exception 'scope type not found' using errcode = 'P0002';
  end if;

  if auth.role() <> 'service_role'
     and not exists (
       select 1
       from iam.memberships as membership
       where membership.container_type = 'organization'
         and membership.container_id = v_org
         and membership.organization_id = v_org
         and membership.user_id = (select auth.uid())
         and membership.role in ('owner', 'admin')
         and membership.status = 'active'
         and membership.deleted_at is null
     ) then
    raise exception 'organization owner or admin required'
      using errcode = '42501';
  end if;

  select count(*)
  into v_assignment_count
  from platform.associations_live as association
  join context.scopes as scope on association.target_id = scope.id
  where association.target_type = 'scope'
    and scope.scope_type_id = p_type_id
    and scope.deleted_at is null;

  select count(*)
  into v_scope_count
  from context.scopes as scope
  where scope.scope_type_id = p_type_id
    and scope.deleted_at is null;

  update context.scopes
  set deleted_at = now(),
      updated_by = (select auth.uid()),
      updated_at = now()
  where scope_type_id = p_type_id
    and deleted_at is null;

  update context.context_items
  set is_active = false,
      updated_by = (select auth.uid()),
      updated_at = now()
  where scope_type_id = p_type_id
    and is_active = true;

  update context.scope_types
  set deleted_at = now(),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = p_type_id
    and deleted_at is null;

  return jsonb_build_object(
    'deleted_scopes', v_scope_count,
    'deleted_assignments', v_assignment_count
  );
end;
$function$;

-- public.dict_delete_entries(p_level text, p_owner_id uuid, p_ids uuid[]) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.dict_delete_entries(p_level text, p_owner_id uuid, p_ids uuid[])
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT public.dict_delete_entries_for((select auth.uid()), p_level, p_owner_id, p_ids);
$function$;

-- public.dict_set_settings(p_level text, p_owner_id uuid, p_max_inline_chars integer) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.dict_set_settings(p_level text, p_owner_id uuid, p_max_inline_chars integer)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT public.dict_set_settings_for((select auth.uid()), p_level, p_owner_id, p_max_inline_chars);
$function$;

-- public.dict_upsert_entries(p_level text, p_owner_id uuid, p_entries jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.dict_upsert_entries(p_level text, p_owner_id uuid, p_entries jsonb)
 RETURNS SETOF dictionary.dict_entries
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT * FROM public.dict_upsert_entries_for((select auth.uid()), p_level, p_owner_id, p_entries);
$function$;

-- public.guardian_confirm_verification(p_link_id uuid, p_method text, p_ref text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.guardian_confirm_verification(p_link_id uuid, p_method text, p_ref text)
 RETURNS education.guardian_link
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education', 'public', 'pg_temp'
AS $function$
declare
  v_row               education.guardian_link;
  v_prior_verified_at timestamptz;
  v_prior_method      text;
begin
  if p_method is null or p_method not in ('card', 'signed_form', 'vendor_id') then
    raise exception 'Invalid consent method: %', coalesce(p_method, '(null)') using errcode = '22023';
  end if;

  select verified_at, consent_method into v_prior_verified_at, v_prior_method
  from education.guardian_link where id = p_link_id;

  update education.guardian_link
    set verified_at      = now(),
        consent_method   = p_method,
        verification_ref = p_ref,
        updated_at       = now()
  where id = p_link_id
    and status = 'active'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'No active guardian link % to verify', p_link_id using errcode = 'P0002';
  end if;

  insert into education.data_rights_event (user_id, action, detail)
  values (
    v_row.student_user_id,
    'guardian_consent_verified',
    jsonb_build_object(
      'link_id',            v_row.id,
      'guardian_user_id',   v_row.guardian_user_id,
      'student_user_id',    v_row.student_user_id,
      'method',             p_method,
      'verification_ref',   p_ref,
      'verified_at',        v_row.verified_at,
      'actor',              (select auth.uid()),
      'actor_db_role',      current_user,
      'via',                'guardian_confirm_verification',
      'prior_verified_at',  v_prior_verified_at,
      'prior_method',       v_prior_method,
      're_verification',    v_prior_verified_at is not null
    )
  );

  return v_row;
end;
$function$;

-- public.guardian_grant(p_guardian_email text, p_relationship text) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.guardian_grant(p_guardian_email text, p_relationship text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education', 'public', 'pg_temp'
AS $function$
declare
  v_guardian uuid;
  v_rl       jsonb;
begin
  v_rl := public.check_file_rate_limit(auth.uid(), 'edu_guardian_consent', 8);
  if not coalesce((v_rl->>'allowed')::boolean, true) then
    raise exception 'Too many consent requests. Please wait a minute and try again.'
      using errcode = 'P0001';
  end if;

  v_guardian := public.guardian_find_user_by_email(p_guardian_email);

  if v_guardian is not null and v_guardian = auth.uid() then
    raise exception 'You cannot add yourself as a guardian' using errcode = '22023';
  end if;

  if v_guardian is not null then
    insert into education.guardian_link
      (guardian_user_id, student_user_id, status, relationship, requested_by, created_by, reviewed_at)
    values
      (v_guardian, (select auth.uid()), 'active', p_relationship, 'student', (select auth.uid()), now())
    on conflict (guardian_user_id, student_user_id) do update
      set status       = 'active',
          relationship = coalesce(excluded.relationship, education.guardian_link.relationship),
          reviewed_at  = now(),
          revoked_at   = null,
          verified_at      = case when education.guardian_link.status = 'active' then education.guardian_link.verified_at else null end,
          consent_method   = case when education.guardian_link.status = 'active' then education.guardian_link.consent_method else null end,
          verification_ref = case when education.guardian_link.status = 'active' then education.guardian_link.verification_ref else null end,
          updated_at   = now();
  end if;

  return jsonb_build_object('status', 'granted');
end;
$function$;

-- public.guardian_request_student(p_student_email text, p_relationship text) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.guardian_request_student(p_student_email text, p_relationship text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education', 'public', 'pg_temp'
AS $function$
declare
  v_student uuid;
  v_rl      jsonb;
begin
  v_rl := public.check_file_rate_limit(auth.uid(), 'edu_guardian_consent', 8);
  if not coalesce((v_rl->>'allowed')::boolean, true) then
    raise exception 'Too many consent requests. Please wait a minute and try again.'
      using errcode = 'P0001';
  end if;

  v_student := public.guardian_find_user_by_email(p_student_email);

  if v_student is not null and v_student = auth.uid() then
    raise exception 'You cannot request access to your own account' using errcode = '22023';
  end if;

  if v_student is not null then
    insert into education.guardian_link
      (guardian_user_id, student_user_id, status, relationship, requested_by, created_by)
    values
      ((select auth.uid()), v_student, 'pending', p_relationship, 'guardian', (select auth.uid()))
    on conflict (guardian_user_id, student_user_id) do update
      set status       = case when education.guardian_link.status = 'active' then 'active' else 'pending' end,
          relationship = coalesce(excluded.relationship, education.guardian_link.relationship),
          requested_by = 'guardian',
          revoked_at   = null,
          -- A re-link NEVER inherits a previous verification. Only a fresh
          -- verifiable act (guardian_confirm_verification, service-only) may set
          -- these — matching what guardian_grant already did.
          verified_at      = case when education.guardian_link.status = 'active'
                                  then education.guardian_link.verified_at else null end,
          consent_method   = case when education.guardian_link.status = 'active'
                                  then education.guardian_link.consent_method else null end,
          verification_ref = case when education.guardian_link.status = 'active'
                                  then education.guardian_link.verification_ref else null end,
          updated_at   = now();
  end if;

  return jsonb_build_object('status', 'sent');
end;
$function$;

-- public.guardian_respond(p_guardian_user_id uuid, p_approve boolean) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.guardian_respond(p_guardian_user_id uuid, p_approve boolean)
 RETURNS education.guardian_link
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education', 'public', 'pg_temp'
AS $function$
declare v_row education.guardian_link;
begin
  update education.guardian_link
    set status = case when p_approve then 'active' else 'revoked' end,
        reviewed_at = case when p_approve then now() else reviewed_at end,
        revoked_at = case when p_approve then null else now() end,
        updated_at = now()
  where student_user_id = (select auth.uid()) and guardian_user_id = p_guardian_user_id and status = 'pending'
  returning * into v_row;
  if v_row.id is null then raise exception 'No pending guardian request found' using errcode = 'P0002'; end if;
  return v_row;
end;
$function$;

-- public.guardian_unlink(p_guardian_user_id uuid, p_student_user_id uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.guardian_unlink(p_guardian_user_id uuid, p_student_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education', 'public', 'pg_temp'
AS $function$
begin
  update education.guardian_link
    set status           = 'revoked',
        revoked_at       = now(),
        updated_at       = now(),
        -- Withdrawing consent withdraws the VERIFICATION with it.
        verified_at      = null,
        consent_method   = null,
        verification_ref = null
  where guardian_user_id = p_guardian_user_id and student_user_id = p_student_user_id
    and (guardian_user_id = (select auth.uid()) or student_user_id = (select auth.uid())) and status <> 'revoked';
end;
$function$;

-- public.inv_accept(p_token text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.inv_accept(p_token text)
 RETURNS TABLE(target_type text, target_id uuid, organization_id uuid, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_inv iam.invitations; v_uid uuid := (select auth.uid()); v_email text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select * into v_inv from iam.invitations i
   where i.token = p_token and i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = v_uid or lower(i.email) = lower(v_email));
  if v_inv.id is null then raise exception 'invalid or expired invitation'; end if;

  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by, updated_by)
  values (v_inv.organization_id, v_inv.target_type, v_inv.target_id, v_uid, coalesce(v_inv.role, 'member'), 'active', v_uid, v_uid)
  on conflict (container_type, container_id, user_id)
  do update set status = 'active', deleted_at = null, updated_by = v_uid;

  update iam.invitations
     set status = 'accepted', accepted_at = now(), invited_user_id = v_uid, updated_by = v_uid
   where id = v_inv.id;

  return query select v_inv.target_type, v_inv.target_id, v_inv.organization_id, v_inv.role;
end $function$;

-- public.mark_conversation_read(p_conversation_id uuid, p_message_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid, p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_read_at timestamptz;
BEGIN
  SELECT created_at INTO v_read_at
  FROM communication.dm_messages
  WHERE id = p_message_id AND conversation_id = p_conversation_id;

  UPDATE communication.dm_conversation_participants
  SET last_read_at = COALESCE(v_read_at, now())
  WHERE conversation_id = p_conversation_id
    AND user_id = (select auth.uid());
END;
$function$;

-- public.org_admin_set_member_controls(p_org_id uuid, p_user_id uuid, p_member_level text, p_tier_override text, p_storage_cap_bytes bigint, p_monthly_budget_mcents bigint, p_notes text) — 3 occurrence(s)
CREATE OR REPLACE FUNCTION public.org_admin_set_member_controls(p_org_id uuid, p_user_id uuid, p_member_level text DEFAULT NULL::text, p_tier_override text DEFAULT NULL::text, p_storage_cap_bytes bigint DEFAULT NULL::bigint, p_monthly_budget_mcents bigint DEFAULT NULL::bigint, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_row iam.org_member_controls;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;
  if not exists (select 1 from iam.organization_member om
    where om.organization_id = p_org_id and om.user_id = p_user_id) then
    raise exception 'User is not a member of this organization' using errcode = '23503';
  end if;
  insert into iam.org_member_controls(
    organization_id, user_id, member_level, tier_override, storage_cap_bytes, monthly_budget_mcents, notes, created_by, updated_by
  ) values (
    p_org_id, p_user_id, p_member_level, p_tier_override, p_storage_cap_bytes, p_monthly_budget_mcents, p_notes, (select auth.uid()), (select auth.uid())
  )
  on conflict (organization_id, user_id) do update
    set member_level = excluded.member_level, tier_override = excluded.tier_override,
        storage_cap_bytes = excluded.storage_cap_bytes, monthly_budget_mcents = excluded.monthly_budget_mcents,
        notes = excluded.notes, updated_at = now(), updated_by = (select auth.uid()), version = iam.org_member_controls.version + 1
  returning * into v_row;
  perform iam._org_audit(p_org_id, p_user_id, 'controls.update', jsonb_build_object(
    'member_level', p_member_level, 'tier_override', p_tier_override,
    'storage_cap_bytes', p_storage_cap_bytes, 'monthly_budget_mcents', p_monthly_budget_mcents));
  return to_jsonb(v_row);
end;
$function$;

-- public.org_admin_set_member_status(p_org_id uuid, p_user_id uuid, p_status text, p_reason text) — 5 occurrence(s)
CREATE OR REPLACE FUNCTION public.org_admin_set_member_status(p_org_id uuid, p_user_id uuid, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_row iam.org_member_controls; v_role text;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;
  if p_status not in ('active','suspended') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own status' using errcode = '42501';
  end if;
  select om.role::text into v_role from iam.organization_member om
  where om.organization_id = p_org_id and om.user_id = p_user_id;
  if v_role is null then
    raise exception 'User is not a member of this organization' using errcode = '23503';
  end if;
  if v_role = 'owner' and p_status = 'suspended' then
    raise exception 'Owners cannot be suspended' using errcode = '42501';
  end if;
  insert into iam.org_member_controls(
    organization_id, user_id, status, suspended_at, suspended_by, suspend_reason, created_by, updated_by
  ) values (
    p_org_id, p_user_id, p_status,
    case when p_status = 'suspended' then now() end,
    case when p_status = 'suspended' then (select auth.uid()) end,
    case when p_status = 'suspended' then p_reason end,
    (select auth.uid()), (select auth.uid())
  )
  on conflict (organization_id, user_id) do update
    set status = excluded.status,
        suspended_at = case when excluded.status = 'suspended' then now() else null end,
        suspended_by = case when excluded.status = 'suspended' then (select auth.uid()) else null end,
        suspend_reason = case when excluded.status = 'suspended' then p_reason else null end,
        updated_at = now(), updated_by = (select auth.uid()), version = iam.org_member_controls.version + 1
  returning * into v_row;
  perform iam._org_audit(p_org_id, p_user_id,
    case when p_status = 'suspended' then 'member.suspend' else 'member.reactivate' end,
    jsonb_build_object('reason', p_reason));
  return to_jsonb(v_row);
end;
$function$;

-- public.org_module_custom_value_policy_set(p_org_id uuid, p_module_key text, p_members_can_add boolean) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.org_module_custom_value_policy_set(p_org_id uuid, p_module_key text, p_members_can_add boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
begin
  if (select auth.uid()) is null or not exists(select 1 from iam.organization_member
    where organization_id=p_org_id and user_id=(select auth.uid()) and role in ('owner','admin')) then
    raise exception 'Only an organization admin can change this setting.' using errcode='42501'; end if;
  insert into platform.org_module_config(organization_id,module_token,members_can_add_custom_values)
  values(p_org_id,p_module_key,p_members_can_add)
  on conflict(organization_id,module_token) do update set
    members_can_add_custom_values=excluded.members_can_add_custom_values,updated_at=now();
  return jsonb_build_object('success',true,'members_can_add',p_members_can_add);
end;$function$;

-- public.org_module_custom_value_remove(p_org_id uuid, p_module_key text, p_namespace text, p_value text) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.org_module_custom_value_remove(p_org_id uuid, p_module_key text, p_namespace text, p_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
declare v_values jsonb;
begin
  if (select auth.uid()) is null or not exists(select 1 from iam.organization_member
    where organization_id=p_org_id and user_id=(select auth.uid()) and role in ('owner','admin')) then
    raise exception 'Only an organization admin can remove shared values.' using errcode='42501'; end if;

  select coalesce(jsonb_agg(item order by lower(item)),'[]'::jsonb) into v_values
  from jsonb_array_elements_text(coalesce((
    select case when jsonb_typeof(custom_values->p_namespace)='array'
      then custom_values->p_namespace else '[]'::jsonb end
    from platform.org_module_config where organization_id=p_org_id and module_token=p_module_key
  ),'[]'::jsonb)) item where item<>btrim(p_value);

  update platform.org_module_config
  set custom_values=jsonb_set(custom_values,array[p_namespace],v_values,true)
  where organization_id=p_org_id and module_token=p_module_key;
  return jsonb_build_object('success',true,'values',v_values);
end;$function$;

-- public.pin_prompt_app_to_version(p_app_id uuid, p_version_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.pin_prompt_app_to_version(p_app_id uuid, p_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_app record;
  v_version_num integer;
begin
  select app_row.id, app_row.agent_id
    into v_app
  from app.definition as app_row
  where app_row.id = p_app_id
    and app_row.deleted_at is null
    and (
      auth.role() = 'service_role'
      or app_row.created_by = (select auth.uid())
      or iam.has_access('app', app_row.id, 'editor'::public.permission_level)
    );

  if not found then
    return jsonb_build_object('success', false, 'error', 'App not found or edit access denied');
  end if;

  select version_row.version_number
    into v_version_num
  from agent.definition_version as version_row
  where version_row.id = p_version_id
    and version_row.agent_id = v_app.agent_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Version not found for this app agent');
  end if;

  update app.definition
  set agent_version_id = p_version_id,
      use_latest = false,
      pinned_version = v_version_num
  where id = p_app_id;

  return jsonb_build_object(
    'success', true,
    'app_id', p_app_id,
    'pinned_version', v_version_num,
    'agent_version_id', p_version_id
  );
end;
$function$;

-- public.reply_to_user_review(p_feedback_id uuid, p_message text, p_sender_name text, p_image_file_ids uuid[]) — 3 occurrence(s)
CREATE OR REPLACE FUNCTION public.reply_to_user_review(p_feedback_id uuid, p_message text, p_sender_name text DEFAULT 'User'::text, p_image_file_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_name text;
begin
  if (auth.role()='service_role' or exists (
    select 1 from users.user_feedback f where f.id=p_feedback_id and f.deleted_at is null
      and (f.user_id=(select auth.uid()) or f.created_by=(select auth.uid()))
  )) is not true then raise exception 'feedback owner required' using errcode='42501'; end if;
  if length(btrim(coalesce(p_message,''))) not between 1 and 20000 then
    raise exception 'message is required and must be at most 20000 characters' using errcode='22023';
  end if;
  if auth.role()='service_role' then v_name:=coalesce(nullif(btrim(p_sender_name),''),'User');
  else select coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',u.email::text,'User')
    into v_name from auth.users u where u.id=(select auth.uid()); end if;
  return public._d31_impl_reply_to_user_review(p_feedback_id,p_message,v_name,p_image_file_ids);
end;
$function$;

-- public.restore_note_version(p_note_id uuid, p_version_number integer) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.restore_note_version(p_note_id uuid, p_version_number integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'workbench', 'history', 'iam'
AS $function$
declare v_content text; v_label text; v_found boolean := false;
begin
  select h.row_data->>'content', h.row_data->>'label', true into v_content, v_label, v_found
  from history.row_versions h
  where h.entity_type='note' and h.row_id=p_note_id and h.version=p_version_number
  order by h.occurred_at desc limit 1;
  if not v_found then return false; end if;
  if not exists (select 1 from workbench.notes n where n.id=p_note_id and (n.created_by=(select auth.uid()) or iam.has_access('note', n.id, 'editor'))) then
    raise exception 'not authorized';
  end if;
  update workbench.notes set content=v_content, label=v_label,
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('last_change_source','system','last_change_type','version_restore')
  where id=p_note_id;
  return true;
end $function$;

-- public.sch_recompute_task_next_due_at(p_task_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.sch_recompute_task_next_due_at(p_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'scheduler'
AS $function$
BEGIN
  IF current_user = 'postgres' THEN
    UPDATE scheduler.sch_task
       SET next_due_at = (
         SELECT MIN(t.next_due_at) FROM scheduler.sch_trigger t
          WHERE t.task_id = p_task_id AND t.enabled = true AND t.next_due_at IS NOT NULL
       )
     WHERE id = p_task_id;
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE scheduler.sch_task
     SET next_due_at = (
       SELECT MIN(t.next_due_at) FROM scheduler.sch_trigger t
        WHERE t.task_id = p_task_id AND t.enabled = true AND t.next_due_at IS NOT NULL
     )
   WHERE id = p_task_id
     AND (user_id = (select auth.uid()) OR public.is_super_admin());
END;
$function$;

-- public.scope_system_apply(p_org_id uuid, p_operations jsonb) — 13 occurrence(s)
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
      raise exception 'operation % did not match or create a record', kind using errcode = 'P0002';
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

-- public.send_user_review_message(p_feedback_id uuid, p_message text, p_sender_name text, p_image_file_ids uuid[]) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.send_user_review_message(p_feedback_id uuid, p_message text, p_sender_name text DEFAULT 'Admin'::text, p_image_file_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_name text;
begin
  if (auth.role()='service_role' or coalesce(public.is_platform_admin(),false)) is not true then
    raise exception 'platform admin required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_message,''))) not between 1 and 20000 then
    raise exception 'message is required and must be at most 20000 characters' using errcode='22023';
  end if;
  if auth.role()='service_role' then v_name:=coalesce(nullif(btrim(p_sender_name),''),'Admin');
  else select coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',u.email::text,'Admin')
    into v_name from auth.users u where u.id=(select auth.uid()); end if;
  return public._d31_impl_send_user_review_message(p_feedback_id,p_message,v_name,p_image_file_ids);
end;
$function$;

-- public.set_scope_context_value(p_scope_id uuid, p_context_item_id uuid, p_value_text text, p_value_number numeric, p_value_boolean boolean, p_value_json jsonb, p_value_document_url text, p_value_date date, p_value_timestamp timestamp with time zone, p_value_time time without time zone, p_change_summary text) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.set_scope_context_value(p_scope_id uuid, p_context_item_id uuid, p_value_text text DEFAULT NULL::text, p_value_number numeric DEFAULT NULL::numeric, p_value_boolean boolean DEFAULT NULL::boolean, p_value_json jsonb DEFAULT NULL::jsonb, p_value_document_url text DEFAULT NULL::text, p_value_date date DEFAULT NULL::date, p_value_timestamp timestamp with time zone DEFAULT NULL::timestamp with time zone, p_value_time time without time zone DEFAULT NULL::time without time zone, p_change_summary text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row context.context_item_values;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM context.scopes s
    JOIN iam.organization_member om ON om.organization_id = s.organization_id AND om.user_id = (select auth.uid())
    WHERE s.id = p_scope_id
  ) THEN
    RAISE EXCEPTION 'not authorized to write to scope %', p_scope_id USING ERRCODE = '42501';
  END IF;
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

-- public.udt_delete_field(p_table_id uuid, p_field_id uuid) — 1 occurrence(s)
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
    auth.role() = 'service_role'
    or exists (select 1 from workbench.udt_datasets d where d.id = p_table_id and d.user_id = (select auth.uid()))
    or coalesce(public.has_permission('dataset', p_table_id, 'editor'), false)
  ) is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  select field_name, display_name into v_field_name, v_display_name
  from workbench.udt_dataset_fields
  where id = p_field_id and table_id = p_table_id;

  if v_field_name is null then
    return jsonb_build_object('success', false, 'error', 'Column not found in this table');
  end if;

  select count(*) into v_remaining
  from workbench.udt_dataset_fields
  where table_id = p_table_id;

  if v_remaining <= 1 then
    return jsonb_build_object(
      'success', false,
      'error', 'A table must keep at least one column. Add another column before removing this one.'
    );
  end if;

  -- Purge the key from every row that carries it. The row-version trigger
  -- records the prior shape, so the values remain recoverable from history.
  with cleared as (
    update workbench.udt_dataset_rows
    set data = data - v_field_name, updated_at = now()
    where table_id = p_table_id and data ? v_field_name
    returning 1
  )
  select count(*) into v_rows_cleared from cleared;

  delete from workbench.udt_dataset_fields
  where id = p_field_id and table_id = p_table_id;

  -- Close the gap in field_order so the remaining columns stay 1..n.
  with ordered as (
    select id, row_number() over (order by field_order, created_at) as rn
    from workbench.udt_dataset_fields
    where table_id = p_table_id
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

-- public.udt_set_field_format(p_table_id uuid, p_field_id uuid, p_format jsonb) — 1 occurrence(s)
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
    auth.role() = 'service_role'
    or exists (select 1 from workbench.udt_datasets d where d.id = p_table_id and d.user_id = (select auth.uid()))
    or coalesce(public.has_permission('dataset', p_table_id, 'editor'), false)
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
  where id = p_field_id and table_id = p_table_id
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

-- public.update_user_list(p_list_id uuid, p_list_name character varying, p_description text, p_is_public boolean, p_authenticated_read boolean, p_public_read boolean, p_items jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.update_user_list(p_list_id uuid, p_list_name character varying DEFAULT NULL::character varying, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_authenticated_read boolean DEFAULT NULL::boolean, p_public_read boolean DEFAULT NULL::boolean, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
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

-- public.update_user_own_feedback(p_feedback_id uuid, p_description text, p_feedback_type text) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.update_user_own_feedback(p_feedback_id uuid, p_description text DEFAULT NULL::text, p_feedback_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_description is not null and length(btrim(p_description)) not between 1 and 20000 then
    raise exception 'description must be between 1 and 20000 characters' using errcode='22023';
  end if;
  if p_feedback_type is not null and p_feedback_type not in ('bug','feature','suggestion','other') then
    raise exception 'invalid feedback type' using errcode='22023';
  end if;
  update users.user_feedback f
  set description=coalesce(p_description,f.description),
      feedback_type=coalesce(p_feedback_type,f.feedback_type),
      updated_at=now()
  where f.id=p_feedback_id and f.deleted_at is null and f.status='new'
    and (f.user_id=(select auth.uid()) or f.created_by=(select auth.uid()))
  returning to_jsonb(f.*) into v_result;
  if v_result is null then raise exception 'editable feedback not found' using errcode='P0002'; end if;
  return v_result;
end;
$function$;

-- public.update_user_table_config(p_table_id uuid, p_table_updates jsonb, p_field_updates jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.update_user_table_config(p_table_id uuid, p_table_updates jsonb DEFAULT NULL::jsonb, p_field_updates jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (select 1 from workbench.udt_datasets d where d.id = p_table_id and d.user_id = (select auth.uid()))
    or coalesce(public.has_permission('dataset', p_table_id, 'editor'), false)
  ) is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_update_user_table_config(p_table_id, p_table_updates, p_field_updates);
end;
$function$;

-- public.update_user_table_metadata(p_table_id uuid, p_table_name text, p_description text, p_is_public boolean, p_authenticated_read boolean) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.update_user_table_metadata(p_table_id uuid, p_table_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_authenticated_read boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (select 1 from workbench.udt_datasets d where d.id = p_table_id and d.user_id = (select auth.uid()))
    or coalesce(public.has_permission('dataset', p_table_id, 'editor'), false)
  ) is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_update_user_table_metadata(
    p_table_id, p_table_name, p_description, p_is_public, p_authenticated_read
  );
end;
$function$;

-- public.update_user_table_row_ordering(p_table_id uuid, p_enabled boolean, p_order jsonb, p_label_field text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.update_user_table_row_ordering(p_table_id uuid, p_enabled boolean, p_order jsonb DEFAULT NULL::jsonb, p_label_field text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_config JSONB;
BEGIN
    IF (
      auth.role() = 'service_role'
      OR EXISTS (SELECT 1 FROM workbench.udt_datasets d WHERE d.id = p_table_id AND d.user_id = (select auth.uid()))
      OR COALESCE(public.has_permission('dataset', p_table_id, 'editor'), false)
    ) IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Table not found or access denied');
    END IF;

    SELECT COALESCE(row_ordering_config, '{}'::jsonb) INTO v_config
    FROM workbench.udt_datasets WHERE id = p_table_id;

    -- Merge, never replace: default_sort and any future key survives.
    v_config := v_config || jsonb_build_object(
        'enabled', p_enabled,
        'order', COALESCE(p_order, v_config->'order', '[]'::jsonb)
    );

    IF p_label_field IS NOT NULL THEN
        -- Only accept a column that actually exists, so the config can never
        -- point at a deleted or renamed column.
        IF EXISTS (
            SELECT 1 FROM workbench.udt_dataset_fields
            WHERE table_id = p_table_id AND field_name = p_label_field
        ) THEN
            v_config := v_config || jsonb_build_object('label_field', p_label_field);
        END IF;
    END IF;

    UPDATE workbench.udt_datasets
    SET row_ordering_config = v_config, updated_at = now()
    WHERE id = p_table_id;

    RETURN jsonb_build_object('success', true, 'row_ordering_config', v_config);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- public.wsp_upsert_system_task(p_dedupe_key text, p_title text, p_description text, p_origin text, p_source_type text, p_source_id text, p_source_url text, p_source_label text, p_due_date date, p_priority text, p_assignee_id uuid, p_organization_id uuid, p_project_id uuid, p_metadata jsonb) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.wsp_upsert_system_task(p_dedupe_key text, p_title text, p_description text DEFAULT NULL::text, p_origin text DEFAULT 'system'::text, p_source_type text DEFAULT NULL::text, p_source_id text DEFAULT NULL::text, p_source_url text DEFAULT NULL::text, p_source_label text DEFAULT NULL::text, p_due_date date DEFAULT NULL::date, p_priority text DEFAULT NULL::text, p_assignee_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'workspace'
AS $function$
declare
  v_org uuid;
  v_existing workspace.tasks%rowtype;
  v_id uuid;
begin
  if p_dedupe_key is null or length(trim(p_dedupe_key)) = 0 then
    raise exception 'wsp_upsert_system_task: dedupe_key is required';
  end if;
  v_org := coalesce(p_organization_id, public.ensure_personal_organization(auth.uid()));
  if v_org is null then
    raise exception 'wsp_upsert_system_task: organization could not be resolved — pass p_organization_id when calling without a user session';
  end if;

  select * into v_existing from workspace.tasks
   where organization_id = v_org and dedupe_key = p_dedupe_key and deleted_at is null
   limit 1;

  if found then
    if v_existing.status in ('completed','cancelled','dismissed') then
      return jsonb_build_object('id', v_existing.id, 'created', false, 'status', v_existing.status);
    end if;
    update workspace.tasks
       set title = p_title,
           description = coalesce(p_description, description),
           due_date = coalesce(p_due_date, due_date),
           source_url = coalesce(p_source_url, source_url),
           source_label = coalesce(p_source_label, source_label),
           updated_at = now()
     where id = v_existing.id;
    return jsonb_build_object('id', v_existing.id, 'created', false, 'status', v_existing.status);
  end if;

  begin
    insert into workspace.tasks (
      title, description, status, origin, source_type, source_id, source_url, source_label,
      dedupe_key, due_date, priority, assignee_id, organization_id, project_id,
      metadata, created_by
    ) values (
      p_title, p_description, 'inbox', coalesce(p_origin, 'system'),
      p_source_type, p_source_id, p_source_url, p_source_label,
      p_dedupe_key, p_due_date,
      nullif(p_priority, '')::task_priority,
      coalesce(p_assignee_id, (select auth.uid())), v_org, p_project_id,
      coalesce(p_metadata, '{}'::jsonb), (select auth.uid())
    ) returning id into v_id;
    return jsonb_build_object('id', v_id, 'created', true, 'status', 'inbox');
  exception when unique_violation then
    -- Lost a race (or the row exists but RLS hid it from our select).
    select * into v_existing from workspace.tasks
     where organization_id = v_org and dedupe_key = p_dedupe_key and deleted_at is null
     limit 1;
    if found then
      return jsonb_build_object('id', v_existing.id, 'created', false, 'status', v_existing.status);
    end if;
    return jsonb_build_object('id', null, 'created', false, 'status', null, 'reason', 'exists_not_visible');
  end;
end;
$function$;

-- seo.update_backlink_human_ruling(p_backlink_id uuid, p_ruling jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION seo.update_backlink_human_ruling(p_backlink_id uuid, p_ruling jsonb)
 RETURNS seo.backlink
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row seo.backlink;
BEGIN
  IF p_ruling IS NULL OR jsonb_typeof(p_ruling) <> 'object' THEN
    RAISE EXCEPTION 'backlink ruling must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(p_ruling) > 20000 THEN
    RAISE EXCEPTION 'backlink ruling exceeds 20KB' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM seo.backlink WHERE id = p_backlink_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'backlink not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT iam.has_access('web_site', v_row.site_id, 'editor') THEN
    RAISE EXCEPTION 'editor access required' USING ERRCODE = '42501';
  END IF;
  UPDATE seo.backlink SET
    human_ruling = p_ruling || jsonb_build_object(
      'updated_by', (select auth.uid()), 'updated_at', now()),
    resolved_assessment = coalesce(deterministic_assessment, '{}'::jsonb)
      || coalesce(ai_assessment, '{}'::jsonb)
      || p_ruling
      || jsonb_build_object(
        'deterministic_assessment', coalesce(deterministic_assessment, '{}'::jsonb),
        'ai_assessment', coalesce(ai_assessment, '{}'::jsonb),
        'human_ruling', p_ruling),
    human_reviewed_at = now(),
    updated_at = now()
  WHERE id = p_backlink_id
  RETURNING * INTO v_row;
  RETURN v_row;
END
$function$;

-- seo.update_competitor_tracking(p_competitor_id uuid, p_tracking_status text, p_human_ruling jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION seo.update_competitor_tracking(p_competitor_id uuid, p_tracking_status text, p_human_ruling jsonb DEFAULT '{}'::jsonb)
 RETURNS seo.competitor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row seo.competitor;
begin
  if p_tracking_status not in ('candidate','tracked','ignored','archived') then
    raise exception 'invalid competitor tracking status' using errcode = '22023';
  end if;
  if p_human_ruling is null or jsonb_typeof(p_human_ruling) <> 'object' then
    raise exception 'competitor ruling must be a JSON object' using errcode = '22023';
  end if;
  if pg_column_size(p_human_ruling) > 20000 then
    raise exception 'competitor ruling exceeds 20KB' using errcode = '22023';
  end if;
  select * into v_row from seo.competitor where id = p_competitor_id;
  if not found then
    raise exception 'competitor not found' using errcode = 'P0002';
  end if;
  if not iam.has_access('web_site', v_row.site_id, 'editor') then
    raise exception 'editor access required' using errcode = '42501';
  end if;
  update seo.competitor set
    tracking_status = p_tracking_status,
    human_ruling = p_human_ruling || jsonb_build_object('updated_by', (select auth.uid()), 'updated_at', now()),
    resolved_assessment = coalesce(latest_autopsy, '{}'::jsonb)
      || p_human_ruling
      || jsonb_build_object('human_ruling', p_human_ruling),
    human_reviewed_at = now(),
    updated_at = now()
  where id = p_competitor_id
  returning * into v_row;
  return v_row;
end
$function$;

-- seo.update_referring_domain_human_ruling(p_profile_id uuid, p_ruling jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION seo.update_referring_domain_human_ruling(p_profile_id uuid, p_ruling jsonb)
 RETURNS seo.referring_domain_profile
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row seo.referring_domain_profile;
BEGIN
  IF p_ruling IS NULL OR jsonb_typeof(p_ruling) <> 'object' THEN
    RAISE EXCEPTION 'referring-domain ruling must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(p_ruling) > 20000 THEN
    RAISE EXCEPTION 'referring-domain ruling exceeds 20KB' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM seo.referring_domain_profile WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'referring-domain profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT iam.has_access('web_site', v_row.site_id, 'editor') THEN
    RAISE EXCEPTION 'editor access required' USING ERRCODE = '42501';
  END IF;
  UPDATE seo.referring_domain_profile SET
    human_ruling = p_ruling || jsonb_build_object(
      'updated_by', (select auth.uid()), 'updated_at', now()),
    opinion_verdict = coalesce(
      nullif(p_ruling ->> 'verdict', ''), opinion_verdict),
    resolved_opinion = coalesce(ai_assessment, '{}'::jsonb)
      || p_ruling
      || jsonb_build_object(
        'ai_opinion', coalesce(ai_assessment, '{}'::jsonb),
        'human_ruling', p_ruling),
    human_reviewed_at = now(),
    updated_at = now()
  WHERE id = p_profile_id
  RETURNING * INTO v_row;
  RETURN v_row;
END
$function$;

-- seo.vocabulary_registry_update(p_id uuid, p_label text, p_description text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION seo.vocabulary_registry_update(p_id uuid, p_label text, p_description text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, dimension text, slug text, name text, description text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_dim text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'seo_registry_forbidden: the platform vocabulary is edited by super admins only';
  END IF;
  IF btrim(COALESCE(p_label,'')) = '' THEN
    RAISE EXCEPTION 'seo_registry_blank_label: a vocabulary entry must have a name';
  END IF;
  SELECT c.dimension INTO v_dim FROM platform.categories c WHERE c.id = p_id AND c.deleted_at IS NULL;
  IF v_dim IS NULL THEN
    RAISE EXCEPTION 'seo_registry_not_found';
  END IF;
  IF v_dim NOT IN ('seo_facet','seo_value_band','seo_geo_band') THEN
    RAISE EXCEPTION 'seo_registry_bad_dimension: % is not an SEO vocabulary', v_dim;
  END IF;

  RETURN QUERY
  UPDATE platform.categories c
  SET name = btrim(p_label),
      metadata = CASE
        WHEN NULLIF(btrim(COALESCE(p_description,'')), '') IS NULL THEN c.metadata - 'description'
        ELSE c.metadata || jsonb_build_object('description', btrim(p_description)) END,
      updated_at = now(),
      updated_by = (select auth.uid())
  WHERE c.id = p_id AND c.deleted_at IS NULL
  RETURNING c.id, c.dimension, c.slug, c.name, c.metadata->>'description';
END;
$function$;

-- users._stamp_secret_audit_org() — 1 occurrence(s)
CREATE OR REPLACE FUNCTION users._stamp_secret_audit_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org   uuid;
  v_owner uuid;
  cand    uuid;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_secret_id IS NOT NULL THEN
    SELECT s.organization_id, s.user_id
      INTO v_org, v_owner
      FROM users.user_secrets s
     WHERE s.id = NEW.user_secret_id;
    IF v_org IS NOT NULL THEN
      NEW.organization_id := v_org;
      RETURN NEW;
    END IF;
  END IF;

  FOREACH cand IN ARRAY ARRAY[v_owner, NEW.user_id, NEW.actor_id, (select auth.uid())]
  LOOP
    CONTINUE WHEN cand IS NULL;
    BEGIN
      NEW.organization_id := public._d31_impl_ensure_personal_organization(cand);
    EXCEPTION WHEN OTHERS THEN
      NEW.organization_id := NULL;
    END;
    IF NEW.organization_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END LOOP;

  NEW.organization_id := '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;
  RETURN NEW;
END
$function$;

-- web.create_site(p_organization_id uuid, p_name text, p_root_url text, p_domain text, p_settings jsonb, p_integrations jsonb, p_visibility platform.visibility, p_brand_id uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION web.create_site(p_organization_id uuid, p_name text, p_root_url text, p_domain text, p_settings jsonb DEFAULT '{}'::jsonb, p_integrations jsonb DEFAULT '{}'::jsonb, p_visibility platform.visibility DEFAULT NULL::platform.visibility, p_brand_id uuid DEFAULT NULL::uuid)
 RETURNS web.site
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  created_site web.site;
  v_brand_id uuid;
  v_constraint_name text;
  normalized_name text := nullif(btrim(p_name), '');
  normalized_root_url text := nullif(btrim(p_root_url), '');
  normalized_domain text := lower(nullif(btrim(p_domain), ''));
  root_host text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_organization_id is null
     or not iam.has_org_access(p_organization_id) then
    raise exception 'Organization access required' using errcode = '42501';
  end if;

  if normalized_name is null then
    raise exception 'Site name is required' using errcode = '22023';
  end if;

  if normalized_root_url is null
     or normalized_root_url !~* '^https?://' then
    raise exception 'root_url must be an absolute HTTP(S) URL'
      using errcode = '22023';
  end if;

  root_host := lower(
    substring(
      normalized_root_url
      from '^https?://([^/:?#@]+)(?::[0-9]+)?(?:[/?#]|$)'
    )
  );

  if root_host is null then
    raise exception 'root_url must contain a valid host and no credentials'
      using errcode = '22023';
  end if;

  if normalized_domain is null
     or normalized_domain like '%://%'
     or normalized_domain like '%/%' then
    raise exception 'domain must be a normalized host without a scheme or path'
      using errcode = '22023';
  end if;

  normalized_domain := regexp_replace(normalized_domain, '\.$', '');
  root_host := regexp_replace(root_host, '\.$', '');

  if normalized_domain = '' then
    raise exception 'domain must not be empty' using errcode = '22023';
  end if;

  if normalized_domain is distinct from root_host then
    raise exception 'domain must exactly match the root_url host'
      using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) <> 'object' then
    raise exception 'settings must be a JSON object' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_integrations, '{}'::jsonb)) <> 'object' then
    raise exception 'integrations must be a JSON object' using errcode = '22023';
  end if;

  if p_brand_id is not null then
    select b.id into v_brand_id
    from web.brand b
    where b.id = p_brand_id
      and b.organization_id = p_organization_id
      and b.deleted_at is null;
    if v_brand_id is null then
      raise exception 'Brand not found in this organization'
        using errcode = '22023';
    end if;
  end if;

  select s.* into created_site
  from web.site s
  where s.organization_id = p_organization_id
    and s.domain = normalized_domain
    and s.deleted_at is null;

  if found then
    return created_site;
  end if;

  begin
    if p_brand_id is null then
      select b.id into v_brand_id
      from web.brand b
      where b.organization_id = p_organization_id
        and lower(b.name) = lower(normalized_name)
        and b.deleted_at is null
      limit 1;

      if v_brand_id is null then
        insert into web.brand (
          organization_id, created_by, name, website_url, status, visibility
        )
        values (
          p_organization_id, (select auth.uid()), normalized_name,
          normalized_root_url, 'active',
          coalesce(
            p_visibility,
            platform.entity_default_visibility('web_brand')
          )
        )
        returning id into v_brand_id;
      end if;
    end if;

    insert into web.site (
      organization_id, brand_id, name, root_url, domain,
      settings, integrations, visibility
    )
    values (
      p_organization_id, v_brand_id, normalized_name, normalized_root_url,
      normalized_domain, coalesce(p_settings, '{}'::jsonb),
      coalesce(p_integrations, '{}'::jsonb),
      coalesce(
        p_visibility,
        platform.entity_default_visibility('web_site')
      )
    )
    returning * into created_site;

    insert into web.property (
      organization_id, created_by, brand_id, kind, url, display_name, site_id
    )
    values (
      p_organization_id, (select auth.uid()), v_brand_id, 'website',
      normalized_root_url, normalized_name, created_site.id
    );
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name <> 'site_org_domain_live_unique' then
        raise;
      end if;

      select s.* into created_site
      from web.site s
      where s.organization_id = p_organization_id
        and s.domain = normalized_domain
        and s.deleted_at is null;

      if not found then
        raise;
      end if;
  end;

  return created_site;
end;
$function$;

-- web.move_site_brand(p_site_id uuid, p_brand_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION web.move_site_brand(p_site_id uuid, p_brand_id uuid)
 RETURNS web.site
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_site web.site;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT s.* INTO v_site
  FROM web.site s
  WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_site.id IS NULL THEN
    RAISE EXCEPTION 'Site not found' USING ERRCODE = '22023';
  END IF;

  IF NOT (v_site.created_by = auth.uid()
          OR iam.has_access('web_site', v_site.id, 'editor')) THEN
    RAISE EXCEPTION 'Editor access to this site required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM web.brand b
    WHERE b.id = p_brand_id
      AND b.organization_id = v_site.organization_id
      AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Brand not found in this organization' USING ERRCODE = '22023';
  END IF;

  IF NOT (EXISTS (
            SELECT 1 FROM web.brand b
            WHERE b.id = p_brand_id
              AND (b.created_by = (select auth.uid())
                   OR iam.has_access('web_brand', b.id, 'editor'))
          )) THEN
    RAISE EXCEPTION 'Editor access to the target brand required' USING ERRCODE = '42501';
  END IF;

  UPDATE web.site SET brand_id = p_brand_id
  WHERE id = v_site.id
  RETURNING * INTO v_site;

  UPDATE web.property SET brand_id = p_brand_id
  WHERE site_id = v_site.id AND deleted_at IS NULL;

  RETURN v_site;
END;
$function$;

