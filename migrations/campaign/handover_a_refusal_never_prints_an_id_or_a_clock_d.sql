-- additive: yes
-- chair-step: replaces 40 live trigger and door bodies whose own existing DELETE/UPDATE statements are carried over unchanged; only refusal sentences change, so no row is touched
-- based-on: agent.guard_global_surface_binding() 1926b5784f64a568576941caa54b94f65fe1012c56a4da2299a7f6ad2620f426
-- based-on: batch.enforce_work_item_lifecycle() 5e8b02752f56c17ce2c4b0adb1063f9f25b58eb6aa2bf7b8721d85c9f9179ee8
-- based-on: billing._spend_guardrail_validate() d0d34ea179b76c68e21b7a9290b01d721b11b98a34fede8266636d9c28599ca7
-- based-on: chat.message_tool_graph_write_guard() e76c151f9aac62db0f00f3a9b7e586750f6af75a7b2a8ef30e84bf072562b0fc
-- based-on: content_ir.guard_kind_shape_uniqueness() 73b862734322e8c5cd729899b97e9e041f91f15173eb041c3b72ce0fe2d4ddef
-- based-on: context.enforce_context_item_reference_source() 39a4bfded05a09644ada82e1043673401f3fe82899f8e79e1951b00fb808c7ec
-- based-on: crm._contact_point_shape() 75b1233975090a1d27c66e1180cd59bc3eab21547b66008add321fde2f80495a
-- based-on: crm._deal_stage_shape() f6ae886caab6f0e0ea77c06c7fc1fa61b7bf576bc7e23539125bea7da2bd2db9
-- based-on: public.ctx_validate_value_scope_type() 7080b9efcea62afe9a4c56e58691a216ba8aeb10238c58f56fd80b66e29e8f11
-- based-on: docproc.guard_processed_document_delete() 2038679c7c129b07fdc42d5b824c0e1de990de141d4e30bee969241d296dd235
-- based-on: public.enforce_aga_rate_limit() 2bb679fed70dd0e6d6d3b7c4e77087c6a4b7ae7fa3eae3b93fdd316c4d5f4b8b
-- based-on: esign._guard_disclosure_immutable() 5724f968ef9e46e2af0f64a3e842245893a0be1daab0594146ac9635cab97ae3
-- based-on: esign._guard_frozen_document() cd234a441c19188058bbad0254d3805cd94fd20e4aa7fbecb563dd86d7c6b7a0
-- based-on: files.guard_rename_path_columns() 73c84b27e8471c43cb3be4f8e6e39e4c405258f05352570dfab4876f3376c25c
-- based-on: files.guard_tombstone_retention() 2f05ff6fab3839eaddef93a7a9754e2bb8a079da2377c2a5c0e0ab6912934a08
-- based-on: files.reject_web_artifact_file_mutation() add2e000e08809e02201d491bf6958e5ece25fdcdcc82545f36bea80b823ecd8
-- based-on: files.webhook_org_guard() 4d154b6775d720b6f1782f7d1774de1a96e2402169c4a55246034d016e34ab07
-- based-on: hr._block_delete_on_hold() 28cd4fe318709cfdf50a58a67f96d1ad327445efa7c43c7f54c234a3665a2164
-- based-on: hr._jurisdiction_rule_parameters_valid() e79228f2ecb11ffe8ddbfff36d54198c679b3d6eaaa51002157453ba3cd0d16f
-- based-on: iam._default_organization_is_a_membership() 14b65d60c99c698ddf5303e0f71454860ba0830813295582d02ba67a65b6027c
-- based-on: iam.api_key_identity_must_be_minted() e80e731bf78d57d0f0159eec2e3a8a23bca938447c48262ed98832118e31fc20
-- based-on: mandate.vw_shortcut_write() b9152c8cd76d15430ad1f62b261a734defab648eb209be62d73acb04aafea3c1
-- based-on: platform._custom_field_definition_guard() 1ce5749754a1baca39fa5cca2699daddf2fa844f9f58dd19193e6d656749c849
-- based-on: platform._custom_record_grant_guard() 26fe58b1d3bd146271c784961ea46aa245b850584b681cf7bd1fb28b3991b065
-- based-on: platform._custom_record_guard() 24ee53abb3fed2a8302315523565df5a040238bf1227868b45a649cd62e4f2f9
-- based-on: platform.enforce_retention_policy_settling() da283454e4b276e8b9c0c13eea94102f31530e16adba4aa40cafb821808da346
-- based-on: platform.validate_edge_payload() 8adb2a89a93b06734ba0636e2d83afdeb500bce5b59631cb7899964d5797f99a
-- based-on: seo._map_facet_value_shape() 8d5db3a07f988b6f7ee71de5d6a752725599e07519c736bae629ee16b7cef49b
-- based-on: seo._map_topic_shape() a0278a0823949b3f125babd1f5dcbb00fb55cdb2e5d5e10ed57e12214053ee74
-- based-on: seo._topic_tenancy_guard() bfdfeb2b17e5598ba85cb7654d873c81dd29219a239c737bf6184df0757189af
-- based-on: seo._topical_map_cascade_topics() 40115fc11f8f4c5c806a2875327e57fe194f857326e239d61b94deeccf18b83d
-- based-on: seo._topical_map_shape() 8caec821bdd1a62f1aae479e5ae9c00d550596efc82af4e4a5338fb6c30a68ec
-- based-on: seo.change_record_scope_guard() 4c3bad0a5661ba29ecb4455fb4570269db0e228e07fd218bd27717088ca55e47
-- based-on: seo.fn_engine_schedule_target_guard() 43831687b192db201530ca551396bc99ff95e519c6967f8cff2f8b41fb0f70c0
-- based-on: users._credential_mutation_receipt_must_complete() 0ea2f18a75f754a2a2935bfa7adc6944fac6a7f764720071bc9c3db7a7acf64c
-- based-on: users.enforce_secret_item_owner_match() ccfbc7444b41b53d79a04ef90e32a7e4633104a47eacf4dfb40b98c958f8bdb4
-- based-on: web.enforce_live_site_parent() 44c1389bef765223028de985b6deb4c714cb280dfe53d2acdb08c4fb4196c4cf
-- based-on: web.validate_screenshot_artifact_file() 11485eea5ff2eed194a209dda60ffa41a779fb26479a2ba671a1b3f878e3958a
-- based-on: workbench.guard_template_dataset_binding() aafaa2294f9b9ccb9951d09df2df26e511e88ea2b07cb09388ef2ef65f744e56
-- based-on: workflow.reject_plan_event_mutation() c2e7beaf22c8b95130844f800ea3604c89ca2c78d617a951bc86779f753a647d
--
-- HANDOVER (2026-09-28) — A REFUSAL NEVER PRINTS AN ID OR A CLOCK: the row fields (the third pass).
--
-- Replaces 40 live function bodies across 20 schemas (agent, batch, billing, chat, content_ir, context, crm, docproc, esign, files, hr, iam, mandate, platform, public, seo, users, web, workbench, workflow), same
-- signatures, each built from its LIVE body (pg_get_functiondef, 2026-09-28; identical on the clone)
-- with only its refusal sentences changed; nothing dropped, granted or revoked; no row touched.
--
-- Why a third pass: VERIFIER-29 found that the census judged only declared parameters and
-- variables, so a trigger's NEW.id / OLD.id (and every uuid or timestamp column read off NEW/OLD)
-- was invisible: "seo.topical_map: map 3f1c… was soft-deleted but live topics remain under it".
-- The census now types NEW.<col> / OLD.<col> by the column on every table the trigger is attached
-- to: 73 replaceable sentences in 40 functions. The row's id moves to DETAIL, the sentence says it
-- in words. Codes and code prefixes are unchanged.
-- The hold rule is corrected too: provision_shape_guard exempts TRIGGER functions from the
-- declared-door rule, so a SECURITY DEFINER trigger is replaceable and is fixed here (three the
-- second pass held are among these). Still held by rule: 2 functions that assign
-- NEW.organization_id, 1 more found by this pass (web.enforce_site_component_organization), and
-- the SECURITY DEFINER non-trigger functions with no declared access decision.
-- Read kernel: none of these is a member (aidream/db/entity_read_kernel_members.json).
-- Guard: matrx-frontend/scripts/campaign-tests/handover_a_refusal_never_prints_an_id_or_a_clock.sql
-- Inverse: migrations/inverse/handover_a_refusal_never_prints_an_id_or_a_clock_d_down.sql

CREATE OR REPLACE FUNCTION agent.guard_global_surface_binding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.source_type = 'agent' AND NEW.target_type = 'surface'
     AND NEW.role = 'binding:global' THEN
    IF (SELECT auth.uid()) IS NOT NULL AND NOT public.is_super_admin() THEN
      raise exception 'global-tier agent↔surface bindings are super-admin only' using ERRCODE = '42501',
            detail = jsonb_build_object('source_id', NEW.source_id, 'target_id', NEW.target_id)::text;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION batch.enforce_work_item_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_legal text[];
begin
  -- Identity is frozen at insert. Checked before the transition so a write
  -- that does both reports the more fundamental violation.
  if new.custom_id        is distinct from old.custom_id        then
    raise exception 'batch.work_item: custom_id is immutable (% -> %)', old.custom_id, new.custom_id using errcode = '23514',
            detail = jsonb_build_object('id', old.id)::text;
  end if;
  if new.purpose          is distinct from old.purpose          then
    raise exception 'batch.work_item: purpose is immutable (% -> %)', old.purpose, new.purpose using errcode = '23514',
            detail = jsonb_build_object('id', old.id)::text;
  end if;
  if new.provider         is distinct from old.provider         then
    raise exception 'batch.work_item: provider is immutable (% -> %)', old.provider, new.provider using errcode = '23514',
            detail = jsonb_build_object('id', old.id)::text;
  end if;
  if new.model            is distinct from old.model            then
    raise exception 'batch.work_item: model is immutable (% -> %)', old.model, new.model using errcode = '23514',
            detail = jsonb_build_object('id', old.id)::text;
  end if;
  if new.prefix_group_key is distinct from old.prefix_group_key then
    raise exception 'batch.work_item: prefix_group_key is immutable — it is the flush-group key' using errcode = '23514',
            detail = jsonb_build_object('id', old.id)::text;
  end if;
  if new.payload          is distinct from old.payload          then
    raise exception 'batch.work_item: payload is immutable — the row must not lie about what was sent' using errcode = '23514',
            detail = jsonb_build_object('id', old.id)::text;
  end if;
  if new.created_by       is distinct from old.created_by       then
    raise exception 'batch.work_item: created_by is immutable — ownership transfer is not a column write' using errcode = '23514',
            detail = jsonb_build_object('id', old.id)::text;
  end if;
  if new.organization_id  is distinct from old.organization_id  then
    raise exception 'batch.work_item: organization_id is immutable' using errcode = '23514',
            detail = jsonb_build_object('id', old.id)::text;
  end if;
  if new.created_at       is distinct from old.created_at       then
    raise exception 'batch.work_item: created_at is immutable' using errcode = '23514',
            detail = jsonb_build_object('id', old.id)::text;
  end if;

  -- A same-status UPDATE is always fine: most writes here move lease_expires_at,
  -- attempt_count, handler_status, result, deleted_at — not status.
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_legal := case old.status
    when 'pending'     then array['claimed', 'failed', 'abandoned']
    when 'claimed'     then array['pending', 'submitted', 'failed', 'abandoned']
    when 'submitted'   then array['completed', 'failed', 'abandoned']
    when 'failed'      then array['pending', 'dead_letter', 'abandoned']
    when 'completed'   then array[]::text[]   -- terminal: re-run is a NEW row
    when 'dead_letter' then array[]::text[]   -- terminal
    when 'abandoned'   then array[]::text[]   -- terminal
    else null
  end;

  if v_legal is null then
    raise exception 'batch.work_item: unknown current status % — the transition map is out of date with work_item_status_valid', old.status using errcode = '23514',
            detail = jsonb_build_object('id', old.id)::text;
  end if;

  if not (new.status = any (v_legal)) then
    raise exception 'batch.work_item: illegal status transition % -> % (legal from %: %)', old.status, new.status, old.status, case when cardinality(v_legal) = 0 then 'nothing — terminal state' else array_to_string(v_legal, ', ') end using errcode = '23514',
            detail = jsonb_build_object('id', old.id)::text;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION billing._spend_guardrail_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'iam', 'public'
AS $function$
declare
  v_actor    uuid := auth.uid();
  v_cap      billing.capability%rowtype;
  v_ent_lim  bigint;
  v_ent_unl  boolean;
begin
  select * into v_cap from billing.capability where capability = new.capability;
  if v_cap.capability is null then
    raise exception 'billing.spend_guardrail: unknown capability %. Register it in billing.capability first.', new.capability
      using errcode = '23514';
  end if;

  -- The period is DERIVED from the capability so a guardrail can never name a
  -- window the resolver does not meter.
  new.period := coalesce(v_cap.period, 'lifetime'::billing.meter_period);

  if new.scope = 'org' then
    if new.scope_user_id is not null then
      raise exception 'billing.spend_guardrail: an org-scope guardrail must leave scope_user_id NULL.' using errcode = '23514',
            detail = jsonb_build_object('scope_user_id', new.scope_user_id)::text;
    end if;
    new.visibility := 'internal'::platform.visibility;
    if v_actor is not null
       and not public.is_platform_admin()
       and not iam.has_org_admin(new.organization_id) then
      raise exception 'billing.spend_guardrail: only an owner or admin of this organization may set its budget.'
        using errcode = '42501';
    end if;
  else
    if new.scope_user_id is null then
      raise exception 'billing.spend_guardrail: a user-scope guardrail must name scope_user_id.'
        using errcode = '23514';
    end if;
    new.visibility := 'personal'::platform.visibility;
    if v_actor is not null
       and new.scope_user_id <> v_actor
       and not public.is_platform_admin() then
      raise exception 'billing.spend_guardrail: a person may only set their own budget.'
        using errcode = '42501';
    end if;
  end if;

  -- A guardrail above the entitlement is meaningless: refuse it, and say what
  -- the ceiling actually is.
  select rl.limit_value, rl.unlimited into v_ent_lim, v_ent_unl
  from billing.resolve_limit(new.organization_id, new.capability, new.period) rl;

  if not coalesce(v_ent_unl, false) and v_ent_lim is not null and new.limit_value > v_ent_lim then
    raise exception 'billing.spend_guardrail: % is above this account''s entitlement of % for % per %. A guardrail only ever lowers a limit — raising one is an add-on (billing.account_addon), not a guardrail.',
      new.limit_value, v_ent_lim, new.capability, new.period
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION chat.message_tool_graph_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_old_ids text[];
  v_new_ids text[];
BEGIN
  IF NEW.content IS NOT DISTINCT FROM OLD.content THEN
    RETURN NEW;
  END IF;
  IF current_setting('matrx.allow_tool_graph_rewrite', true) = 'on' THEN
    RETURN NEW;
  END IF;
  v_old_ids := chat._message_tool_call_ids(OLD.content);
  v_new_ids := chat._message_tool_call_ids(NEW.content);
  -- Filling a reservation (no prior tool_calls) is always allowed.
  IF coalesce(array_length(v_old_ids, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;
  IF v_old_ids IS DISTINCT FROM v_new_ids THEN
    raise exception 'tool_call_graph_change_forbidden: UPDATE on chat.message would change its tool_call blocks (existing call_ids=%, proposed=%). The tool_use↔tool_result pairing graph is written once by server persistence and is immutable through every funnel; rewrite text/artifact blocks only. Deliberate repair: SET LOCAL matrx.allow_tool_graph_rewrite = ''on''. (Migrations 0151/0207; incident e533112e 2026-07-18.)', v_old_ids, v_new_ids using ERRCODE = 'P0001',
            detail = jsonb_build_object('id', OLD.id)::text;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION content_ir.guard_kind_shape_uniqueness()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_dup_kind text;
    v_dup_id   uuid;
    v_check    boolean;
begin
    -- Is the incoming row in the guarded population at all?
    if new.deleted_at is not null
       or new.emitted_fingerprint is null
       or coalesce(new.is_contract_artifact, false)
       or not (
            coalesce(new.metadata ->> 'family', '') = 'user_authored'
            or coalesce(new.metadata ->> 'user_authored', '') = 'true'
          )
    then
        return new;
    end if;

    if tg_op = 'INSERT' then
        v_check := true;
    else
        v_check := coalesce(new.is_active, false)
                or new.emitted_fingerprint is distinct from old.emitted_fingerprint
                or (old.deleted_at is not null and new.deleted_at is null);
    end if;

    if not v_check then
        return new;
    end if;

    select o.kind, o.id
      into v_dup_kind, v_dup_id
      from content_ir.kind_definition o
     where o.emitted_fingerprint = new.emitted_fingerprint
       and o.id <> new.id
       and o.is_active
       and o.deleted_at is null
       and not coalesce(o.is_contract_artifact, false)
       and (
            coalesce(o.metadata ->> 'family', '') = 'user_authored'
            or coalesce(o.metadata ->> 'user_authored', '') = 'true'
           )
     order by o.created_at
     limit 1;

    if v_dup_kind is not null then
        raise exception 'content_ir.kind_definition: the shape of "%" is byte-identical to the ACTIVE kind "%" (fingerprint %). Two names for one shape is banned — the render registry is first-writer-wins, so one would silently display as the other.', new.kind, v_dup_kind, left(new.emitted_fingerprint, 16) || '…' using hint =
                'Bind to "' || v_dup_kind || '" instead (kind_get(''' || v_dup_kind
                || ''') / /shapes/' || v_dup_kind || '). If this really is a DIFFERENT '
                || 'concept, the schema has to differ too — a distinct shape needs '
                || 'distinct fields, not just a distinct name.',
            errcode = 'unique_violation',
            detail = jsonb_build_object('dup_id', v_dup_id)::text;
    end if;

    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION context.enforce_context_item_reference_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org_id uuid;
begin
  -- IS DISTINCT FROM treats NULL correctly (NULL is not dataset_template).
  if new.reference_source->>'container_type' is distinct from 'dataset_template' then
    return new;
  end if;

  select organization_id into v_org_id
  from context.scope_types
  where id = new.scope_type_id and deleted_at is null;
  if v_org_id is null then
    raise exception 'active scope type not found' using errcode='22023',
            detail = jsonb_build_object('scope_type_id', new.scope_type_id)::text;
  end if;
  perform context.validate_dataset_template_source(new.reference_source, v_org_id);

  -- `table` is the reference noun whose resolver expands to the table's rows,
  -- and it is the noun `provision_scope_dataset` mints into this item's value.
  if new.value_type <> 'reference'
     or new.allowed_reference_types is null
     or cardinality(new.allowed_reference_types) <> 1
     or new.allowed_reference_types[1] <> 'table'
     or new.max_items <> 1 then
    raise exception 'dataset-template context items require value_type=reference, allowed_reference_types=[table], and max_items=1'
      using errcode='23514';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION crm._contact_point_shape()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_channel text; v_org uuid;
begin
  select m.channel, m.organization_id into v_channel, v_org
    from crm.contact_medium m where m.id = NEW.medium_id;
  if v_channel is null then
    raise exception 'crm._contact_point_shape: contact_medium not found' using errcode = 'P0001', detail = jsonb_build_object('medium_id', NEW.medium_id)::text;
  end if;
  if v_org is distinct from NEW.organization_id then
    raise exception 'crm._contact_point_shape: medium org does not match contact point org' using errcode = 'P0001', detail = jsonb_build_object('org', v_org, 'organization_id', NEW.organization_id)::text;
  end if;
  NEW.channel := v_channel;
  return NEW;
end $function$;

CREATE OR REPLACE FUNCTION crm._deal_stage_shape()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_stage record;
  v_outcome text;
begin
  select c.parent_id, c.dimension, c.deleted_at, c.metadata->>'outcome' as outcome
    into v_stage
    from platform.categories c where c.id = NEW.stage_id;
  if v_stage is null or v_stage.dimension <> 'deal_pipeline' or v_stage.deleted_at is not null then
    raise exception 'crm.deal: stage is not a live deal_pipeline category' using errcode = 'P0001', detail = jsonb_build_object('stage_id', NEW.stage_id)::text;
  end if;
  if v_stage.parent_id is null then
    raise exception 'crm.deal: that is a pipeline, not a stage - pick one of its child stages' using errcode = 'P0001', detail = jsonb_build_object('stage_id', NEW.stage_id)::text;
  end if;
  if v_stage.parent_id <> NEW.pipeline_id then
    raise exception 'crm.deal: stage does not belong to this pipeline' using errcode = 'P0001', detail = jsonb_build_object('stage_id', NEW.stage_id, 'pipeline_id', NEW.pipeline_id)::text;
  end if;

  if TG_OP = 'UPDATE' and OLD.stage_id is distinct from NEW.stage_id then
    NEW.stage_entered_at := now();
    -- A manual sort position belongs to the column the deal was in.
    if OLD.sort_order is not distinct from NEW.sort_order then
      NEW.sort_order := null;
    end if;
  end if;

  v_outcome := v_stage.outcome;
  NEW.status := case when v_outcome = 'won' then 'won'
                     when v_outcome = 'lost' then 'lost'
                     else 'open' end;
  if NEW.status = 'open' then
    NEW.closed_at := null;
    NEW.lost_reason_id := null;
    NEW.lost_reason_note := null;
  else
    NEW.closed_at := coalesce(NEW.closed_at, now());
    if NEW.status <> 'lost' then
      NEW.lost_reason_id := null; NEW.lost_reason_note := null;
    end if;
  end if;
  return NEW;
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
    raise exception 'context_item_id does not exist' using errcode = 'P0001', detail = jsonb_build_object('context_item_id', NEW.context_item_id)::text;
  END IF;

  IF v_scope_type_id IS NULL THEN
    raise exception 'scope_id does not exist' using errcode = 'P0001', detail = jsonb_build_object('scope_id', NEW.scope_id)::text;
  END IF;

  IF v_scope_type_id IS DISTINCT FROM v_item_type_id THEN
    raise exception 'Scope/item type mismatch: the scope is of another type than the one the item is defined on' using errcode = 'P0001', detail = jsonb_build_object('scope_type_id', v_scope_type_id, 'item_type_id', v_item_type_id)::text;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION docproc.guard_processed_document_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.deleted_at is null and old.archived_at is null then
    raise exception 'processed_document is live — hard delete is forbidden; soft-delete first (lifecycle: active -> soft-deleted -> deleted)' using errcode = '55000',
            hint = 'set deleted_at (trash) and purge from the Trash surface',
            detail = jsonb_build_object('id', old.id)::text;
  end if;
  return old;
end
$function$;

CREATE OR REPLACE FUNCTION public.enforce_aga_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_app                  app.definition%ROWTYPE;
  v_window_hours         integer;
  v_cap                  integer;
  v_window_start_cutoff  timestamptz;
  v_rate                 app.rate_limit%ROWTYPE;
  v_ip                   inet;
BEGIN
  -- WHO IS RUNNING is NEW.runner_user_id (NULL for a guest, who is then the
  -- fingerprint, else the IP) -- never created_by, which on these component
  -- tables is the app OWNER (zzz_component_created_by). Keying on created_by
  -- stamped every guest's window with the owner and the second guest ever
  -- collided on uq_aga_rate_limits_user (page-pass /p/[slug], 2026-09-27).
  SELECT * INTO v_app FROM app.definition WHERE id = NEW.app_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_window_hours := GREATEST(COALESCE(v_app.rate_limit_window_hours, 24), 1);
  v_window_start_cutoff := now() - make_interval(hours => v_window_hours);

  IF NEW.runner_user_id IS NOT NULL THEN
    v_cap := COALESCE(v_app.rate_limit_authenticated, 100);
  ELSE
    v_cap := COALESCE(v_app.rate_limit_per_ip, 20);
  END IF;

  v_ip := NEW.ip_address;

  IF NEW.runner_user_id IS NOT NULL THEN
    SELECT * INTO v_rate
    FROM app.rate_limit
    WHERE app_id = NEW.app_id AND runner_user_id = NEW.runner_user_id;
  ELSIF NEW.fingerprint IS NOT NULL THEN
    SELECT * INTO v_rate
    FROM app.rate_limit
    WHERE app_id = NEW.app_id AND runner_user_id IS NULL AND fingerprint = NEW.fingerprint;
  ELSIF v_ip IS NOT NULL THEN
    SELECT * INTO v_rate
    FROM app.rate_limit
    WHERE app_id = NEW.app_id AND runner_user_id IS NULL AND fingerprint IS NULL AND ip_address = v_ip;
  END IF;

  IF v_rate.id IS NULL THEN
    INSERT INTO app.rate_limit (
      app_id, organization_id, runner_user_id, fingerprint, ip_address,
      execution_count, first_execution_at, last_execution_at, window_start_at
    ) VALUES (
      NEW.app_id, v_app.organization_id,
      NEW.runner_user_id,
      CASE WHEN NEW.runner_user_id IS NULL THEN NEW.fingerprint END,
      v_ip,
      1, now(), now(), now()
    )
    RETURNING * INTO v_rate;

    RETURN NEW;
  END IF;

  IF v_rate.is_blocked AND (v_rate.blocked_until IS NULL OR v_rate.blocked_until > now()) THEN
    raise exception 'aga_rate_limit_exceeded: identifier_blocked until=%', v_rate.blocked_until using ERRCODE = 'check_violation',
            detail = jsonb_build_object('app_id', NEW.app_id)::text;
  END IF;

  IF v_rate.window_start_at < v_window_start_cutoff THEN
    UPDATE app.rate_limit
       SET execution_count = 1,
           window_start_at = now(),
           last_execution_at = now(),
           is_blocked = false,
           blocked_until = NULL,
           blocked_reason = NULL,
           updated_at = now()
     WHERE id = v_rate.id;
    RETURN NEW;
  END IF;

  IF v_rate.execution_count >= v_cap THEN
    UPDATE app.rate_limit
       SET is_blocked = true,
           blocked_until = v_rate.window_start_at + make_interval(hours => v_window_hours),
           blocked_reason = 'window_cap_exceeded',
           last_execution_at = now(),
           updated_at = now()
     WHERE id = v_rate.id;

    raise exception 'aga_rate_limit_exceeded: count=% cap=%', v_rate.execution_count, v_cap using ERRCODE = 'check_violation',
            detail = jsonb_build_object('app_id', NEW.app_id)::text;
  END IF;

  UPDATE app.rate_limit
     SET execution_count = execution_count + 1,
         last_execution_at = now(),
         updated_at = now()
   WHERE id = v_rate.id;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION esign._guard_disclosure_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if exists (select 1 from esign.envelope_signer s where s.consent_disclosure_id = old.id) then
    if tg_op = 'DELETE' then
      raise exception 'esign: consent disclosure is cited by a live signature and is never deleted' using errcode = '42501',
            detail = jsonb_build_object('id', old.id)::text;
    end if;
    if new.body is distinct from old.body or new.title is distinct from old.title
    or new.version_label is distinct from old.version_label or new.locale is distinct from old.locale then
      raise exception 'esign: consent disclosure is cited by a signature — edit creates a NEW version (§4.1)' using errcode = '42501',
            detail = jsonb_build_object('id', old.id)::text;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $function$;

CREATE OR REPLACE FUNCTION esign._guard_frozen_document()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.is_frozen then
      raise exception 'esign: a frozen document is evidence and is never deleted' using errcode = '42501',
            detail = jsonb_build_object('envelope_id', old.envelope_id, 'id', old.id)::text;
    end if;
    return old;
  end if;
  if old.is_frozen then
    -- THE FREEZE LAW (§2.3). Re-rendering after send is impossible by construction, not by
    -- convention: a template edited after send must never change what a half-signed envelope shows.
    if new.content_hash    is distinct from old.content_hash
    or new.content_file_id is distinct from old.content_file_id
    or new.content_file_version is distinct from old.content_file_version
    or new.hash_algorithm  is distinct from old.hash_algorithm
    or new.byte_size       is distinct from old.byte_size
    or new.page_count      is distinct from old.page_count
    or new.mime_type       is distinct from old.mime_type
    or new.name            is distinct from old.name
    or new.position        is distinct from old.position
    or new.source_kind     is distinct from old.source_kind
    or new.template_id     is distinct from old.template_id
    or new.template_version is distinct from old.template_version
    or new.document_id     is distinct from old.document_id
    or new.document_version is distinct from old.document_version
    or new.field_map       is distinct from old.field_map
    or new.is_frozen       is distinct from old.is_frozen
    or new.frozen_at       is distinct from old.frozen_at then
      raise exception 'esign: document is frozen — the signed bytes are immutable (§2.3 the freeze law). A correction is a NEW envelope.' using errcode = '42501',
            detail = jsonb_build_object('id', old.id)::text;
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION files.guard_rename_path_columns()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_token text := nullif(current_setting('matrx.rename_primitive', true), '');
        v_authorized boolean;
        v_dir text;
BEGIN
  v_authorized := v_token IS NOT NULL
                  AND (v_token = OLD.id::text OR v_token = 'subtree');

  IF NEW.file_name IS DISTINCT FROM OLD.file_name
     OR NEW.file_path IS DISTINCT FROM OLD.file_path THEN
    IF NOT v_authorized THEN
      raise exception 'file_name / file_path on files.files are written ONLY by public.rename_file, public.move_file and public.rename_folder (row). They recompute the path together, so the two can never disagree; a hand UPDATE is how 22 rows ended up with a file_name that was not the basename of their own file_path, and file_path is half the unique key AND what every replica holds on disk.' using ERRCODE = 'insufficient_privilege',
            detail = jsonb_build_object('id', OLD.id)::text;
    END IF;
  END IF;

  IF NEW.parent_folder_id IS DISTINCT FROM OLD.parent_folder_id AND NOT v_authorized THEN
    v_dir := CASE WHEN position('/' in NEW.file_path) = 0
                  THEN '' ELSE regexp_replace(NEW.file_path, '/[^/]+$', '') END;
    IF OLD.parent_folder_id IS NOT NULL
       OR NEW.parent_folder_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM files.folders f
                       WHERE f.id = NEW.parent_folder_id AND f.folder_path = v_dir) THEN
      raise exception 'parent_folder_id on files.files is written ONLY by public.move_file (row). The ONE exception this trigger allows is back-filling a NULL pointer with the folder whose folder_path already equals this row''s own directory -- 1,666 alive rows carry a nested file_path with no parent_folder_id, and reconciling those is not a move.' using ERRCODE = 'insufficient_privilege',
            detail = jsonb_build_object('id', OLD.id)::text;
    END IF;
  END IF;

  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION files.guard_tombstone_retention()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'files'
AS $function$
DECLARE v_root uuid := nullif(current_setting('matrx.purge_root_id', true), '')::uuid;
        v_cur uuid; v_depth int := 0;
BEGIN
  IF OLD.deleted_at IS NULL
     OR OLD.deleted_at <= now() - (files.min_tombstone_retention_days() || ' days')::interval
  THEN
    RETURN OLD;
  END IF;
  IF v_root IS NOT NULL THEN
    v_cur := OLD.id;
    WHILE v_cur IS NOT NULL AND v_depth < 64 LOOP
      IF v_cur = v_root THEN RETURN OLD; END IF;
      SELECT parent_file_id INTO v_cur FROM files.files WHERE id = v_cur;
      v_depth := v_depth + 1;
    END LOOP;
  END IF;
  raise exception 'tombstone retention: file was deleted % ago; folder-sync contract D23 retains tombstones at least % days so an offline device converges instead of resurrecting the delete', now() - OLD.deleted_at, files.min_tombstone_retention_days() using ERRCODE = 'restrict_violation',
            detail = jsonb_build_object('id', OLD.id)::text;
END; $function$;

CREATE OR REPLACE FUNCTION files.reject_web_artifact_file_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'files', 'web'
AS $function$
begin
  -- Web artifact files (snapshot markdown/body, screenshots) are immutable in
  -- CONTENT and IDENTITY: bytes, path, checksum, content-versioning, and
  -- soft-delete state may never change. Access metadata (visibility,
  -- organization_id, descriptive metadata) stays editable — 2026-07-29
  -- incident: 7k crawl files stuck at visibility='personal' with no fix path.
  -- NOTE: `version` (row optimistic-concurrency counter) is bumped by
  -- platform._touch_row BEFORE this guard runs — it must stay unprotected.
  if (new.file_path      is not distinct from old.file_path)
    and (new.file_name    is not distinct from old.file_name)
    and (new.mime_type    is not distinct from old.mime_type)
    and (new.size_bytes   is not distinct from old.size_bytes)
    and (new.checksum     is not distinct from old.checksum)
    and (new.storage_uri  is not distinct from old.storage_uri)
    and (new.current_version is not distinct from old.current_version)
    and (new.deleted_at   is not distinct from old.deleted_at)
    and (new.parent_file_id is not distinct from old.parent_file_id)
    and (new.derivation_kind is not distinct from old.derivation_kind)
  then
    return new;
  end if;
  if exists (
    select 1 from web.snapshot s
    where s.body_file_id = old.id or s.markdown_file_id = old.id
  ) or exists (
    select 1 from web.screenshot s
    where s.file_id = old.id
  ) then
    raise exception 'referenced web artifact file is immutable (content/identity/deletion columns)' using errcode = '55000',
            detail = jsonb_build_object('id', old.id)::text;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION files.webhook_org_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'files', 'iam', 'public'
AS $function$
begin
  if NEW.organization_id is not null
     and not iam.is_org_member(NEW.owner_id, NEW.organization_id) then
    raise exception 'Webhook owner is not a member of this organization' using errcode = 'P0001', detail = jsonb_build_object('organization_id', NEW.organization_id)::text;
  end if;
  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION hr._block_delete_on_hold()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if coalesce(old.legal_hold_count, 0) > 0 then
    raise exception '%.% row is under % legal hold(s) and cannot be deleted; release the hold first', tg_table_schema, tg_table_name, old.legal_hold_count using errcode = 'P0001',
            detail = jsonb_build_object('id', old.id)::text;
  end if;
  return old;
end
$function$;

CREATE OR REPLACE FUNCTION hr._jurisdiction_rule_parameters_valid()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_schema jsonb;
  v_slug   text;
  v_errors text[];
  v_path   text;
  v_parts  text[];
begin
  select rc.parameter_schema, rc.slug into v_schema, v_slug
    from hr.jurisdiction_rule_class rc
   where rc.id = new.rule_class_id;

  if v_schema is null then
    raise exception 'hr.jurisdiction_rule: rule_class_id does not resolve to a rule class' using errcode = '23503',
            detail = jsonb_build_object('rule_class_id', new.rule_class_id)::text;
  end if;

  if v_schema <> '{}'::jsonb then
    v_errors := extensions.jsonschema_validation_errors(v_schema::json, new.parameters::json);
    if v_errors is not null and cardinality(v_errors) > 0 then
      raise exception 'hr.jurisdiction_rule: parameters fail the % class schema: %',
        v_slug, array_to_string(v_errors, '; ')
        using errcode = '22000',
              hint = 'SPEC-JURISDICTION 1.2: a rule row whose parameters fail its class schema is refused at write time. There is no advisory mode for a malformed parameter block.';
    end if;
  end if;

  -- section 1.4: an _unverified entry that does not name a real key cannot rot away from the
  -- parameters it describes, because it is refused.
  if jsonb_typeof(new.parameters -> '_unverified') = 'array' then
    for v_path in select jsonb_array_elements_text(new.parameters -> '_unverified') loop
      v_parts := string_to_array(v_path, '.');
      if (new.parameters #> v_parts) is null then
        raise exception 'hr.jurisdiction_rule: _unverified names "%", which is not a key in this row''s parameters', v_path
          using errcode = '22000',
                hint = 'SPEC-JURISDICTION 1.4: the validator rejects an _unverified entry that does not name a real key in the same object.';
      end if;
    end loop;
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION iam._default_organization_is_a_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_on boolean;
begin
  if new.default_organization_id is null then
    return new;
  end if;

  -- THE GUARD. custom/signup_provisioning_guard resolves false on both databases today, so
  -- this trigger refuses nothing until the switch is thrown; the OFF path is a no-op on a
  -- column nothing writes.
  v_on := coalesce(
    (platform.knob_resolve('custom', 'signup_provisioning_guard', new.default_organization_id) #>> '{}')::boolean,
    false);
  if not v_on then
    return new;
  end if;

  if not exists (
        select 1 from iam.memberships m
         where m.user_id = new.user_id
           and m.container_type = 'organization'
           and m.container_id = new.default_organization_id
           and m.status = 'active')
  then
    raise exception 'default organization: that is not an organization this person belongs to' using errcode = 'check_violation',
            hint = 'Doctrine 5.2 item 3 (REC-44): a person''s default organization must be one they are an active member of. Join the organization first, or choose one from iam.memberships for this user.',
            detail = jsonb_build_object('default_organization_id', new.default_organization_id)::text;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION iam.api_key_identity_must_be_minted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if new.service_user_id is null then
    raise exception 'api_keys: service_user_id is required'
      using errcode = '23502';
  end if;

  if not exists (
    select 1 from auth.users u
     where u.id = new.service_user_id
       and u.raw_app_meta_data->>'provider' = 'api_key'
  ) then
    raise exception 'api_keys: service_user_id is not an API-key service identity, so this key would authenticate as somebody who never issued it' using errcode = '42501',
            hint = 'The identity a key carries is minted by iam.api_key_create, which creates a dedicated auth.users principal stamped provider = ''api_key''. A key may never point at a human user account. CRITICAL-1, 2026-09-21.',
            detail = jsonb_build_object('service_user_id', new.service_user_id)::text;
  end if;

  -- The verdict, written where the server can read it through the ORM. Always overwritten,
  -- never merged from the incoming value, so no writer can assert it for itself.
  new.metadata := coalesce(new.metadata, '{}'::jsonb)
    || jsonb_build_object('identity_kind', 'api_key_service');

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION mandate.vw_shortcut_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_def_id uuid;
  v_actor uuid;
  v_org uuid;
  v_key text;
  v_treatment_config jsonb;
  v_old_version int;
BEGIN
  v_actor := (SELECT auth.uid());

  IF TG_OP = 'DELETE' THEN
    -- Delete means archive (Arman, 2026-09-27): a DELETE through the view moves
    -- the shortcut's mandate to Trash; Trash restores it.
    UPDATE mandate.definition d SET deleted_at = now()
    WHERE d.metadata ? 'shortcut_compat'
      AND COALESCE((d.metadata->>'legacy_id')::uuid, d.id) = OLD.id
      AND d.deleted_at IS NULL;
    RETURN OLD;
  END IF;

  v_treatment_config := mandate.shortcut_treatment_config(to_jsonb(NEW));

  IF TG_OP = 'INSERT' THEN
    v_def_id := gen_random_uuid();
    v_org := NEW.organization_id;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'vw_shortcut insert needs an explicit organization_id. The personal-organization fallback was removed on 2026-09-19: the database never chooses a tenant. Set organization_id on the insert.'
        USING ERRCODE = '23502';
    END IF;
    v_key := mandate.generate_shortcut_mandate_key(NEW.label, NEW.surface_name);

    INSERT INTO mandate.definition (
      id, goal, goal_grounding, mandate_key, label, description,
      origin, input_source,
      default_holder_type, default_holder_id, default_holder_version_id,
      default_consumption_map,
      is_enabled, organization_id, visibility, deleted_at,
      created_by, updated_by, metadata
    ) VALUES (
      v_def_id,
      COALESCE(NULLIF(btrim(NEW.description), ''), NEW.label),
      'A', v_key, NEW.label, NEW.description,
      'user', 'known_values',
      'agent', NEW.agent_id,
      CASE WHEN COALESCE(NEW.use_latest, false) THEN NULL ELSE NEW.agent_version_id END,
      NEW.value_mappings,
      COALESCE(NEW.is_active, true), v_org,
      COALESCE(NEW.visibility, 'internal'::platform.visibility),
      NEW.deleted_at,
      COALESCE(NEW.created_by, v_actor), COALESCE(NEW.created_by, v_actor),
      jsonb_strip_nulls(jsonb_build_object(
        'shortcut_compat', true,
        'shortcut_created_by', COALESCE(NEW.created_by, v_actor),
        'shortcut_updated_by', COALESCE(NEW.updated_by, NEW.created_by, v_actor),
        'shortcut_created_at', now(),
        'shortcut_updated_at', now(),
        'shortcut_version', 1))
      || jsonb_build_object('shortcut_metadata', COALESCE(NEW.metadata, '{}'::jsonb))
      || CASE WHEN NEW.scope_mappings IS NOT NULL
              THEN jsonb_build_object('shortcut_scope_mappings', NEW.scope_mappings) ELSE '{}'::jsonb END
      || CASE WHEN NEW.context_mappings IS NOT NULL
              THEN jsonb_build_object('shortcut_context_mappings', NEW.context_mappings) ELSE '{}'::jsonb END
    );

    INSERT INTO mandate.treatment (
      mandate_id, tier, name, is_default, config,
      is_enabled, organization_id, visibility, created_by, updated_by, metadata
    ) VALUES (
      v_def_id, 'widget', NEW.label, true, v_treatment_config,
      true, v_org, COALESCE(NEW.visibility, 'internal'::platform.visibility),
      COALESCE(NEW.created_by, v_actor), COALESCE(NEW.created_by, v_actor),
      '{}'::jsonb
    );

    -- 1042: NO pin binding. A shortcut's answer for everybody is its mandate's
    -- own default (D39); the menu reads the definition, and a run resolves the
    -- mandate on the server (user -> org -> system default). A binding is a
    -- person's or an organization's choice, made through the binding door.

    NEW.id := v_def_id;
    RETURN NEW;
  END IF;

  SELECT d.id, COALESCE((d.metadata->>'shortcut_version')::int, d.version)
    INTO v_def_id, v_old_version
  FROM mandate.definition d
  WHERE d.metadata ? 'shortcut_compat'
    AND COALESCE((d.metadata->>'legacy_id')::uuid, d.id) = OLD.id;
  IF v_def_id IS NULL THEN
    raise exception 'vw_shortcut update: no compat mandate behind shortcut id' using errcode = 'P0001', detail = jsonb_build_object('id', OLD.id)::text;
  END IF;

  UPDATE mandate.definition d SET
    goal = COALESCE(NULLIF(btrim(NEW.description), ''), NEW.label),
    label = NEW.label,
    description = NEW.description,
    default_holder_id = NEW.agent_id,
    default_holder_version_id =
      CASE WHEN COALESCE(NEW.use_latest, false) THEN NULL ELSE NEW.agent_version_id END,
    default_consumption_map = NEW.value_mappings,
    is_enabled = COALESCE(NEW.is_active, true),
    visibility = COALESCE(NEW.visibility, d.visibility),
    deleted_at = NEW.deleted_at,
    metadata = (d.metadata - 'shortcut_scope_mappings' - 'shortcut_context_mappings')
      || jsonb_strip_nulls(jsonb_build_object(
           'shortcut_updated_by', v_actor,
           'shortcut_updated_at', now(),
           'shortcut_version', v_old_version + 1))
      || jsonb_build_object('shortcut_metadata', COALESCE(NEW.metadata, '{}'::jsonb))
      || CASE WHEN NEW.scope_mappings IS NOT NULL
              THEN jsonb_build_object('shortcut_scope_mappings', NEW.scope_mappings) ELSE '{}'::jsonb END
      || CASE WHEN NEW.context_mappings IS NOT NULL
              THEN jsonb_build_object('shortcut_context_mappings', NEW.context_mappings) ELSE '{}'::jsonb END
  WHERE d.id = v_def_id;

  UPDATE mandate.treatment t SET
    name = NEW.label,
    config = v_treatment_config
  WHERE t.mandate_id = v_def_id AND t.tier = 'widget' AND t.is_default AND t.deleted_at IS NULL;

  -- A personal shortcut still carries its owner's user-rung pin (pre-1042 rows).
  -- It is kept IDENTICAL to the default on every edit, so the owner's own rung
  -- can never answer differently from what the menu shows.
  UPDATE mandate.binding b SET
    holder_id = NEW.agent_id,
    holder_version_id =
      CASE WHEN COALESCE(NEW.use_latest, false) THEN NULL ELSE NEW.agent_version_id END,
    consumption_map = NEW.value_mappings,
    config_overrides =
      CASE WHEN NEW.agent_id IS NULL
                AND (COALESCE(NEW.use_latest, false) OR NEW.agent_version_id IS NULL)
                AND NEW.value_mappings IS NULL
           THEN '{}'::jsonb ELSE b.config_overrides END,
    metadata = (b.metadata - 'scope_mappings' - 'context_mappings'
                - 'legacy_agent_version_id' - 'legacy_use_latest')
      || jsonb_strip_nulls(jsonb_build_object(
           'legacy_agent_version_id',
             CASE WHEN COALESCE(NEW.use_latest, false) THEN NEW.agent_version_id END,
           'legacy_use_latest',
             CASE WHEN NOT COALESCE(NEW.use_latest, false) AND NEW.agent_version_id IS NULL
                  THEN false END))
      || CASE WHEN NEW.scope_mappings IS NOT NULL
              THEN jsonb_build_object('scope_mappings', NEW.scope_mappings) ELSE '{}'::jsonb END
      || CASE WHEN NEW.context_mappings IS NOT NULL
              THEN jsonb_build_object('context_mappings', NEW.context_mappings) ELSE '{}'::jsonb END
  WHERE b.mandate_id = v_def_id AND b.metadata->>'role' = 'shortcut_pin' AND b.deleted_at IS NULL;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION platform._custom_field_definition_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_target   record;
  v_defn     record;
  v_schema   text;
  v_table    text;
  v_used     boolean;
  v_count    integer;
  v_cap      integer;
  v_opt_cap  integer;
  v_label_cap integer;
  v_list_org uuid;
  v_rank     jsonb := '{"standard":0,"confidential":1,"restricted":2}'::jsonb;
  v_ai_rank  jsonb := '{"allowed":0,"aggregate_only":1,"never":2}'::jsonb;
BEGIN
  IF NEW.target_kind = 'entity_table' THEN
    SELECT * INTO v_target FROM platform.custom_field_target
     WHERE target_token = NEW.target_token AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'custom_field_definition: token % is not a registered custom-field target', NEW.target_token
        USING ERRCODE = 'check_violation',
              HINT = 'Participation is a row in platform.custom_field_target, never a hardcoded list. A platform admin adds it with platform.adopt_custom_fields(token, ...).';
    END IF;
    IF NOT v_target.is_enabled THEN
      RAISE EXCEPTION 'custom_field_definition: custom fields are disabled for target %', NEW.target_token
        USING ERRCODE = 'check_violation',
              HINT = 'Set platform.custom_field_target.is_enabled = true for this token; a platform admin owns that row.';
    END IF;

    IF (v_rank -> NEW.sensitivity_tier)::int > (v_rank -> v_target.sensitivity_ceiling)::int THEN
      RAISE EXCEPTION 'custom_field_definition: sensitivity_tier % exceeds the % ceiling on target %',
        NEW.sensitivity_tier, v_target.sensitivity_ceiling, NEW.target_token
        USING ERRCODE = 'check_violation',
              HINT = 'A custom field is never a side door around a sensitivity tier (SPEC-EXTENSIBILITY 2.1). Raise the target ceiling deliberately, or lower the field.';
    END IF;
    IF (v_ai_rank -> NEW.ai_exposure)::int < (v_ai_rank -> v_target.ai_exposure_ceiling)::int THEN
      RAISE EXCEPTION 'custom_field_definition: ai_exposure % is looser than the % ceiling on target %',
        NEW.ai_exposure, v_target.ai_exposure_ceiling, NEW.target_token
        USING ERRCODE = 'check_violation',
              HINT = 'AR B2.20: the target''s AI sensitivity ceiling reaches custom fields. Equal or stricter, never looser.';
    END IF;
  ELSE
    SELECT * INTO v_defn FROM platform.custom_entity_definition
     WHERE id = NEW.target_definition_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      raise exception 'custom_field_definition: custom object does not exist' using ERRCODE = 'foreign_key_violation',
            detail = jsonb_build_object('target_definition_id', NEW.target_definition_id)::text;
    END IF;
    IF v_defn.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'custom_field_definition: a field may not be defined on another organization''s custom object'
        USING ERRCODE = 'check_violation',
              HINT = 'Tenant isolation is inherited, never re-implemented: the field row and the definition row carry the same organization_id.';
    END IF;
    IF (v_rank -> NEW.sensitivity_tier)::int > (v_rank -> v_defn.sensitivity_tier)::int THEN
      RAISE EXCEPTION 'custom_field_definition: sensitivity_tier % exceeds the custom object''s % tier',
        NEW.sensitivity_tier, v_defn.sensitivity_tier
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.reference_target_token IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = NEW.reference_target_token AND is_active) THEN
    RAISE EXCEPTION 'custom_field_definition: reference_target_token % is not an active entity token', NEW.reference_target_token
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reference_target_definition_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM platform.custom_entity_definition
                      WHERE id = NEW.reference_target_definition_id
                        AND organization_id = NEW.organization_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'custom_field_definition: reference_target_definition_id must name a live custom object in the same organization'
      USING ERRCODE = 'check_violation';
  END IF;

  -- RD-3's honest defect, defended: workbench.udt_structured_lists.organization_id is
  -- NULLABLE live (legacy). A NULL-org or foreign-org list is refused here rather than
  -- becoming a cross-org read at render time.
  IF NEW.option_list_id IS NOT NULL THEN
    SELECT organization_id INTO v_list_org FROM workbench.udt_structured_lists WHERE id = NEW.option_list_id;
    IF v_list_org IS NULL OR v_list_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'custom_field_definition: option_list_id must name a structured list owned by this organization'
        USING ERRCODE = 'check_violation',
              HINT = 'RD-3 ratchet item: workbench.udt_structured_lists.organization_id is nullable live, which conflicts with NO NULL ORG. The pointer path defends against it instead of trusting it.';
    END IF;
  END IF;

  IF NEW.options IS NOT NULL THEN
    v_opt_cap   := platform.extensibility_knob_int('custom_fields.max_options_per_select', NEW.organization_id);
    v_label_cap := platform.extensibility_knob_int('custom_fields.max_option_label_chars', NEW.organization_id);
    IF jsonb_array_length(NEW.options) > v_opt_cap THEN
      RAISE EXCEPTION 'custom_field_definition: % options exceeds the limit of % (extensibility.custom_fields.max_options_per_select)',
        jsonb_array_length(NEW.options), v_opt_cap
        USING ERRCODE = 'check_violation',
              HINT = 'The limit is a knob, not a constant. An organization admin can raise it through the extensibility settings; a platform admin can raise the platform default.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(NEW.options) e
       WHERE char_length(COALESCE(CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e ->> 'label' END,
                                  CASE WHEN jsonb_typeof(e) = 'object' THEN e ->> 'value' ELSE '' END, '')) > v_label_cap
    ) THEN
      RAISE EXCEPTION 'custom_field_definition: an option label exceeds % characters (extensibility.custom_fields.max_option_label_chars)', v_label_cap
        USING ERRCODE = 'check_violation',
              HINT = 'An option label is a label, not a document. The limit is a knob.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.target_kind = 'entity_table' THEN
      v_cap := platform.extensibility_knob_int('custom_fields.max_fields_per_target', NEW.organization_id, NEW.target_token);
      SELECT count(*) INTO v_count FROM platform.custom_field_definition
       WHERE organization_id = NEW.organization_id AND target_kind = 'entity_table'
         AND target_token = NEW.target_token AND deleted_at IS NULL AND archived_at IS NULL;
    ELSE
      v_cap := platform.extensibility_knob_int('custom_entities.max_fields_per_definition', NEW.organization_id, NULL, NEW.target_definition_id);
      SELECT count(*) INTO v_count FROM platform.custom_field_definition
       WHERE organization_id = NEW.organization_id AND target_kind = 'custom_entity'
         AND target_definition_id = NEW.target_definition_id AND deleted_at IS NULL AND archived_at IS NULL;
    END IF;
    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'custom_field_definition: this target already holds % of a maximum % custom fields', v_count, v_cap
        USING ERRCODE = 'check_violation',
              HINT = 'Limit: ' || CASE WHEN NEW.target_kind = 'entity_table'
                                       THEN 'extensibility.custom_fields.max_fields_per_target'
                                       ELSE 'extensibility.custom_entities.max_fields_per_definition' END ||
                     '. An organization admin raises it in the extensibility settings; archiving a field frees a slot.';
    END IF;
  END IF;

  -- THE THREE IMMUTABLE COLUMNS (2.2) -- once any value has been written.
  -- Changing any of them silently re-interprets every stored value.
  IF TG_OP = 'UPDATE' AND (
       NEW.field_key IS DISTINCT FROM OLD.field_key
    OR NEW.field_type IS DISTINCT FROM OLD.field_type
    OR NEW.reference_target_token IS DISTINCT FROM OLD.reference_target_token) THEN

    v_used := false;
    IF OLD.target_kind = 'entity_table' THEN
      SELECT et.schema_name, et.table_name INTO v_schema, v_table
        FROM platform.entity_types et WHERE et.token = OLD.target_token;
      IF v_schema IS NOT NULL THEN
        -- Scoped by organization_id (indexed) so the containment test never walks another
        -- tenant's rows. jsonb_path_ops does not serve `?`, which is why this is
        -- deliberately an org-scoped scan on a rare admin action and not a hot path.
        EXECUTE format(
          'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE organization_id = $1 AND custom ? $2 LIMIT 1)',
          v_schema, v_table) INTO v_used USING OLD.organization_id, OLD.field_key;
      END IF;
    ELSE
      SELECT EXISTS (SELECT 1 FROM platform.custom_record
                      WHERE entity_definition_id = OLD.target_definition_id
                        AND data ? OLD.field_key LIMIT 1) INTO v_used;
    END IF;

    IF v_used THEN
      RAISE EXCEPTION 'custom_field_definition: field_key / field_type / reference_target_token are immutable once values exist for %', OLD.field_key
        USING ERRCODE = 'check_violation',
              HINT = 'Changing any of them silently re-interprets every stored value. The supported path is: archive this definition, create a new one, migrate deliberately (SPEC-EXTENSIBILITY 2.2).';
    END IF;
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION platform._custom_record_grant_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_allowed boolean; v_slug text;
BEGIN
  IF NEW.resource_type <> 'custom_record' THEN RETURN NEW; END IF;

  SELECT d.allow_record_sharing, d.slug INTO v_allowed, v_slug
    FROM platform.custom_record r
    JOIN platform.custom_entity_definition d ON d.id = r.entity_definition_id
   WHERE r.id = NEW.resource_id;

  IF NOT FOUND THEN
    raise exception 'iam.permissions: custom_record does not exist' using ERRCODE = 'foreign_key_violation',
            detail = jsonb_build_object('resource_id', NEW.resource_id)::text;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'iam.permissions: custom object % does not allow per-record sharing', v_slug
      USING ERRCODE = 'check_violation',
            HINT = 'Records track their custom object and hold no independent access identity. Share the OBJECT, or set allow_record_sharing = true on it first (SPEC-EXTENSIBILITY 3.2).';
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION platform._custom_record_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_defn   record;
  v_cap    integer;
  v_count  integer;
  v_report jsonb;
  v_first  text;
BEGIN
  SELECT * INTO v_defn FROM platform.custom_entity_definition WHERE id = NEW.entity_definition_id;
  IF NOT FOUND OR v_defn.deleted_at IS NOT NULL THEN
    raise exception 'custom_record: custom object does not exist' using ERRCODE = 'foreign_key_violation',
            detail = jsonb_build_object('entity_definition_id', NEW.entity_definition_id)::text;
  END IF;

  -- Isolation is INHERITED, never re-implemented: a record and its definition carry the
  -- same organization_id, always. This is what makes the component RLS deferral to the
  -- definition actually mean tenant isolation.
  IF NEW.organization_id <> v_defn.organization_id THEN
    RAISE EXCEPTION 'custom_record: organization_id must match the custom object''s organization'
      USING ERRCODE = 'check_violation',
            HINT = 'Every write carries an explicit organization_id and it must be the definition''s. No resolver and no trigger chooses one.';
  END IF;

  IF v_defn.archived_at IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.deleted_at IS NULL) THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'custom_record: custom object % is archived and no longer accepts new records', v_defn.slug
        USING ERRCODE = 'check_violation',
              HINT = 'Existing records stay readable. Un-archive the object to resume writes.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_cap := platform.extensibility_knob_int('custom_entities.max_records_per_definition',
                                             NEW.organization_id, NULL, NEW.entity_definition_id);
    SELECT count(*) INTO v_count FROM platform.custom_record
     WHERE entity_definition_id = NEW.entity_definition_id AND deleted_at IS NULL;
    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'custom_record: % already holds % of a maximum % records', v_defn.slug, v_count, v_cap
        USING ERRCODE = 'check_violation',
              HINT = 'Limit: extensibility.custom_entities.max_records_per_definition. An organization admin raises it in the extensibility settings; crossing 250,000 is a tier-3 conversation, not a bigger number.';
    END IF;
  END IF;

  -- The validated write. Reference resolution is NOT done here (the validator is pure and
  -- a trigger has no caller context to resolve under); a client that needs
  -- invalid_reference calls platform.validate_custom_row with a resolution map first.
  IF TG_OP = 'INSERT' OR NEW.data IS DISTINCT FROM OLD.data THEN
    v_report := platform.validate_custom_row(
      'custom_entity', NEW.organization_id, NEW.data, NULL, NEW.entity_definition_id, v_defn.validation_mode);
    IF NOT (v_report ->> 'ok')::boolean THEN
      RAISE EXCEPTION 'custom_record: data failed % validation for %', v_defn.validation_mode, v_defn.slug
        USING ERRCODE = 'check_violation',
              DETAIL = v_report ->> 'errors',
              HINT = 'Call platform.validate_custom_row(...) before writing to get the full errors/warnings envelope.';
    END IF;
  END IF;

  SELECT d.field_key INTO v_first
    FROM platform.custom_field_definition d
   WHERE d.organization_id = NEW.organization_id AND d.target_kind = 'custom_entity'
     AND d.target_definition_id = NEW.entity_definition_id
     AND d.deleted_at IS NULL AND d.archived_at IS NULL
     AND d.field_type IN ('text','long_text')
   ORDER BY d.field_order, d.field_key LIMIT 1;

  NEW.record_name := platform.render_record_name(v_defn.record_name_template, NEW.data, v_first, NEW.id);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION platform.enforce_retention_policy_settling()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_interval interval;
  v_min      timestamptz;
  v_changed  boolean;
BEGIN
  -- A row that cannot destroy anything needs no settling. This is the exemption that
  -- makes the guard safe to live with: you can always make the platform safer instantly.
  IF NOT NEW.enabled OR NEW.mode = 'never' OR NEW.legal_hold THEN
    RETURN NEW;
  END IF;

  -- Which fields decide WHAT gets destroyed, WHOSE data it is, and WHEN it starts.
  -- Everything absent from this list (label, description, basis, review_due, updated_by,
  -- updated_at, warn_days, metadata, visibility) is editorial and must never
  -- re-arm the clock — otherwise fixing a typo in a description would silently postpone a
  -- legitimate policy by a day. Measured live 2026-09-13, one column at a time in a rolled-back
  -- transaction: every editorial column above is ACCEPTED today on an armed, settled policy, and
  -- only the addressing/arming columns below are refused. The addressing columns
  -- (`organization_id`, `entity_token`, `user_id`, `user_predicate`, `taxonomy_node_id`) belong
  -- here and are deliberately NOT removed: they decide whose rows a live destruction policy
  -- destroys, so re-pointing a settled policy at another tenant with no settling window is the
  -- same act as arming it, wearing a different column name.
  --
  -- `archive_tier` STAYS, and it is the one entry that is stricter than it strictly needs to be.
  -- V-65 is right that it is read only by platform.lifecycle_archive_candidates, which passes it
  -- through as the storage tier an ARCHIVED copy lands in — under mode='purge' it is inert, and
  -- under mode='archive' nothing is destroyed. But "inert under today's two readers" is not the
  -- same as "never decides destruction": a deep-tier archive is a different retrievability promise
  -- to the person whose data it is, the tier travels with the row into whatever the adapter does
  -- next, and nobody has proved a future mode cannot key on it. A guard that is one column too
  -- strict costs a 24 h wait on a tier change; a guard one column too loose is what this residue
  -- is. It stays until someone can prove the negative, and it is named here so the next reader
  -- knows it was considered and kept on purpose, not by inertia.
  IF TG_OP = 'UPDATE' THEN
    v_changed := (
         OLD.scope            IS DISTINCT FROM NEW.scope
      OR OLD.entity_token     IS DISTINCT FROM NEW.entity_token
      OR OLD.taxonomy_node_id IS DISTINCT FROM NEW.taxonomy_node_id
      OR OLD.organization_id  IS DISTINCT FROM NEW.organization_id
      OR OLD.user_id          IS DISTINCT FROM NEW.user_id
      OR OLD.user_predicate   IS DISTINCT FROM NEW.user_predicate
      OR OLD.trigger_kind     IS DISTINCT FROM NEW.trigger_kind
      OR OLD.mode             IS DISTINCT FROM NEW.mode
      OR OLD.retention_days   IS DISTINCT FROM NEW.retention_days
      OR OLD.archive_tier     IS DISTINCT FROM NEW.archive_tier
      OR OLD.legal_hold       IS DISTINCT FROM NEW.legal_hold
      OR OLD.priority         IS DISTINCT FROM NEW.priority
      OR OLD.enabled          IS DISTINCT FROM NEW.enabled
      -- 🚨 DD-201 (2026-09-13). `effective_from` IS the settling clock, and until this line it was
      -- the ONE column this guard never watched: an armed purge policy dated thirty days out could
      -- be re-dated to one minute from now — or into the past — by an update that changed nothing
      -- else, because `v_changed` stayed false and the RAISE below was never reached. Proven live
      -- in a rolled-back transaction before the fix: both of those updates were ACCEPTED. Watching
      -- it costs nothing legitimate — pushing the date further out still satisfies the check on the
      -- very next line, because the new value is further from now than the settling interval.
      OR OLD.effective_from   IS DISTINCT FROM NEW.effective_from
      -- 🚨 DD-201 RESIDUE (2026-09-14, found by V-65). `custody_selector` ADDRESSES ROWS. Its own
      -- column comment: "Optional exact selector for externally adopted files. The central
      -- file-custody adapter matches immutable files.files.metadata.external_object_custody
      -- source_kind and retention_policy before acting", and platform.lifecycle_file_custody_selector
      -- hands it to that adapter as the single enabled entity/file selector. Changing it alone
      -- re-points a live, settled, armed purge policy at a DIFFERENT set of adopted files —
      -- the same act as changing entity_token, which has always been refused. Proven live before
      -- this line, rolled back, on the armed and settled file policy
      -- d7e1cedf-d812-4cdc-ba7c-510e85d84c0e: swapping {meet_room_recording, meet_recordings_30d}
      -- for another source_kind/retention_policy pair was ACCEPTED with no settling window.
      OR OLD.custody_selector IS DISTINCT FROM NEW.custody_selector
    );
  ELSE
    v_changed := true;   -- every INSERT of a destructive policy settles
  END IF;

  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  v_interval := platform.retention_settling_interval();
  v_min      := now() + v_interval;

  IF NEW.effective_from < v_min THEN
    raise exception 'retention policy settling: this change arms destruction (scope=%, mode=%, retention_days=%), so effective_from must be at least % from now — the time given is % too early. Set effective_from = now() + interval ''%'' (or make the row safe instead: enabled=false, mode=''never'', or legal_hold=true, all of which apply instantly).', NEW.scope, NEW.mode, NEW.retention_days, v_interval, (v_min - NEW.effective_from), v_interval using ERRCODE = '22023',
            detail = jsonb_build_object('effective_from', NEW.effective_from)::text;
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION platform.validate_edge_payload()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'platform', 'extensions'
AS $function$
declare
  reg platform.edge_payload_kind%rowtype;
begin
  if new.payload is not null and new.payload_kind is null then
    raise exception 'edge payload without payload_kind (% -> %): real logic in an untyped bag is exactly what this system exists to kill', new.source_type, new.target_type using errcode = '23514',
            detail = jsonb_build_object('source_id', new.source_id, 'target_id', new.target_id)::text;
  end if;

  if new.payload_kind is null then
    return new;
  end if;

  select * into reg from platform.edge_payload_kind k where k.kind = new.payload_kind;
  if not found then
    raise exception 'unknown edge payload_kind "%" — register it in platform.edge_payload_kind first', new.payload_kind
      using errcode = '23514';
  end if;

  if reg.source_type is not null and reg.source_type <> new.source_type then
    raise exception 'payload_kind "%" requires source_type "%" but edge has "%"',
      new.payload_kind, reg.source_type, new.source_type using errcode = '23514';
  end if;
  if reg.target_type is not null and reg.target_type <> new.target_type then
    raise exception 'payload_kind "%" requires target_type "%" but edge has "%"',
      new.payload_kind, reg.target_type, new.target_type using errcode = '23514';
  end if;

  if new.payload is null then
    raise exception 'payload_kind "%" set but payload is null', new.payload_kind
      using errcode = '23514';
  end if;

  if not extensions.json_matches_schema(reg.json_schema::json, new.payload::json) then
    raise exception 'edge payload failed schema validation for kind "%" (v%): %',
      new.payload_kind, reg.version, new.payload::text using errcode = '23514';
  end if;

  return new;
end $function$;

CREATE OR REPLACE FUNCTION seo._map_facet_value_shape()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_pf uuid; v_pb uuid; v_cur uuid; v_hops int := 0; v_brand_org uuid; v_actor uuid;
BEGIN
  IF NEW.brand_id IS NOT NULL THEN
    SELECT organization_id INTO v_brand_org FROM web.brand WHERE id = NEW.brand_id;
    IF v_brand_org IS NULL THEN
      raise exception 'seo.map_facet_value: brand does not exist' using ERRCODE='23503',
            detail = jsonb_build_object('brand_id', NEW.brand_id)::text;
    END IF;
    IF NEW.organization_id IS DISTINCT FROM v_brand_org THEN
      raise exception 'seo.map_facet_value: organization_id must match brand' using ERRCODE='23514',
            detail = jsonb_build_object('brand_id', NEW.brand_id)::text;
    END IF;
  END IF;
  IF NEW.ref_type IS NOT NULL AND NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = NEW.ref_type AND is_active) THEN
    RAISE EXCEPTION 'seo.map_facet_value: ref_type % is not a registered entity type', NEW.ref_type USING ERRCODE='23514';
  END IF;
  -- TENANCY: pointing a facet value at a row is a read of that row's identity.
  -- Only checked when a signed-in identity is making the write; auth.uid() IS
  -- NULL is the trusted server lane, which carries no identity to check.
  IF NEW.ref_type IS NOT NULL AND NEW.ref_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.ref_type IS DISTINCT FROM OLD.ref_type
          OR NEW.ref_id IS DISTINCT FROM OLD.ref_id) THEN
    v_actor := (SELECT auth.uid());
    IF v_actor IS NOT NULL
       AND NOT (public.is_platform_admin()
                OR iam.has_access_for(v_actor, NEW.ref_type, NEW.ref_id, 'viewer'::public.permission_level)) THEN
      raise exception 'seo.map_facet_value: no viewer access to referenced %', NEW.ref_type using ERRCODE='42501',
            detail = jsonb_build_object('ref_id', NEW.ref_id)::text;
    END IF;
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'seo.map_facet_value: a value cannot be its own parent' USING ERRCODE='23514';
    END IF;
    SELECT facet_id, brand_id INTO v_pf, v_pb FROM seo.map_facet_value WHERE id = NEW.parent_id AND deleted_at IS NULL;
    IF v_pf IS NULL THEN
      raise exception 'seo.map_facet_value: parent does not exist or is deleted' using ERRCODE='23503',
            detail = jsonb_build_object('parent_id', NEW.parent_id)::text;
    END IF;
    IF v_pf <> NEW.facet_id OR v_pb IS DISTINCT FROM NEW.brand_id THEN
      raise exception 'seo.map_facet_value: parent must share facet and brand' using ERRCODE='23514',
            detail = jsonb_build_object('parent_id', NEW.parent_id)::text;
    END IF;
    v_cur := NEW.parent_id;
    WHILE v_cur IS NOT NULL LOOP
      v_hops := v_hops + 1;
      IF v_cur = NEW.id THEN
        raise exception 'seo.map_facet_value: cycle detected through parent' using ERRCODE='23514',
            detail = jsonb_build_object('parent_id', NEW.parent_id)::text;
      END IF;
      IF v_hops > 50 THEN
        RAISE EXCEPTION 'seo.map_facet_value: parent chain deeper than 50' USING ERRCODE='23514';
      END IF;
      SELECT parent_id INTO v_cur FROM seo.map_facet_value WHERE id = v_cur;
    END LOOP;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION seo._map_topic_shape()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map_org uuid; v_map_deleted timestamptz; v_parent_map uuid; v_cur uuid; v_hops int := 0;
BEGIN
  SELECT organization_id, deleted_at INTO v_map_org, v_map_deleted FROM seo.topical_map WHERE id = NEW.map_id;
  IF v_map_org IS NULL THEN
    raise exception 'seo.map_topic: map does not exist' using ERRCODE='23503',
            detail = jsonb_build_object('map_id', NEW.map_id)::text;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.map_id IS DISTINCT FROM OLD.map_id THEN
    RAISE EXCEPTION 'seo.map_topic: a topic cannot move between maps' USING ERRCODE='23514';
  END IF;
  IF v_map_deleted IS NOT NULL AND NEW.deleted_at IS NULL THEN
    raise exception 'seo.map_topic: cannot be live under soft-deleted map' using ERRCODE='23514',
            detail = jsonb_build_object('map_id', NEW.map_id)::text;
  END IF;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'seo.map_topic: organization_id is required (must equal the map''s organization)' USING ERRCODE='23502';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM v_map_org THEN
    raise exception 'seo.map_topic: organization_id must match map' using ERRCODE='23514',
            detail = jsonb_build_object('map_id', NEW.map_id)::text;
  END IF;

  -- ROUND 19 (D1). `rejected` is what happens to a PROPOSAL nobody wanted. It is
  -- not a way to take a live topic off the map: that is `retired`, which carries
  -- the attachment rule. Written with COALESCE so a NULL status cannot skip it.
  IF TG_OP = 'INSERT' AND COALESCE(NEW.status,'') = 'rejected' THEN
    RAISE EXCEPTION 'seo.map_topic: a topic is not born rejected — create it as proposed, then reject it'
      USING ERRCODE='22023';
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.status,'') = 'rejected'
     AND COALESCE(OLD.status,'') <> 'rejected' AND COALESCE(OLD.status,'') <> 'proposed' THEN
    RAISE EXCEPTION 'seo.map_topic: only a proposed topic can be rejected; retire an active topic instead (% is %)',
      NEW.slug, COALESCE(OLD.status,'<null>') USING ERRCODE='22023';
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'seo.map_topic: a topic cannot be its own parent' USING ERRCODE='23514';
    END IF;
    SELECT map_id INTO v_parent_map FROM seo.map_topic WHERE id = NEW.parent_id AND deleted_at IS NULL;
    IF v_parent_map IS NULL THEN
      raise exception 'seo.map_topic: parent does not exist or is deleted' using ERRCODE='23503',
            detail = jsonb_build_object('parent_id', NEW.parent_id)::text;
    END IF;
    IF v_parent_map <> NEW.map_id THEN
      raise exception 'seo.map_topic: parent belongs to a different map' using ERRCODE='23514',
            detail = jsonb_build_object('parent_id', NEW.parent_id)::text;
    END IF;
    v_cur := NEW.parent_id;
    WHILE v_cur IS NOT NULL LOOP
      v_hops := v_hops + 1;
      IF v_cur = NEW.id THEN
        raise exception 'seo.map_topic: cycle detected through parent' using ERRCODE='23514',
            detail = jsonb_build_object('parent_id', NEW.parent_id)::text;
      END IF;
      IF v_hops > 200 THEN
        RAISE EXCEPTION 'seo.map_topic: parent chain deeper than 200' USING ERRCODE='23514';
      END IF;
      SELECT parent_id INTO v_cur FROM seo.map_topic WHERE id = v_cur;
    END LOOP;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    IF EXISTS (SELECT 1 FROM seo.map_topic c WHERE c.parent_id = NEW.id AND c.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'seo.map_topic: cannot delete topic % while it has live children — move or merge them first', NEW.slug USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION seo._topic_tenancy_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_topic_org uuid;
BEGIN
  -- VALIDATION ONLY. This trigger RAISES or returns NEW unchanged; it never
  -- assigns organization_id (NO-BACKSTOP law).
  IF NEW.topic_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.topic_id IS NOT DISTINCT FROM OLD.topic_id
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;
  SELECT m.organization_id INTO v_topic_org
    FROM seo.map_topic t JOIN seo.topical_map m ON m.id = t.map_id
   WHERE t.id = NEW.topic_id;
  IF v_topic_org IS NULL THEN
    raise exception '%.%: map topic does not exist', TG_TABLE_SCHEMA, TG_TABLE_NAME using ERRCODE = '23503',
            detail = jsonb_build_object('topic_id', NEW.topic_id)::text;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM v_topic_org THEN
    raise exception '%.%: map topic belongs to another organization than this row — a row may only be filed under a topic in its own organization', TG_TABLE_SCHEMA, TG_TABLE_NAME using ERRCODE = '23514',
            detail = jsonb_build_object('topic_id', NEW.topic_id, 'topic_org', v_topic_org, 'organization_id', NEW.organization_id)::text;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION seo._topical_map_cascade_topics()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_n int; v_pass int := 0;
BEGIN
  -- TRASH
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    LOOP
      v_pass := v_pass + 1;
      IF v_pass > 201 THEN
        raise exception 'seo.topical_map: cascading the soft-delete of map did not finish in 201 passes — its topic tree is deeper than the 200-hop limit seo._map_topic_shape enforces, or a cycle exists' using ERRCODE = '55000',
            detail = jsonb_build_object('id', NEW.id)::text;
      END IF;
      UPDATE seo.map_topic t
         SET deleted_at = NEW.deleted_at,
             metadata   = coalesce(t.metadata, '{}'::jsonb)
                          || jsonb_build_object('deleted_via',
                               jsonb_build_object('type', 'seo_topical_map', 'id', NEW.id))
       WHERE t.map_id = NEW.id
         AND t.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM seo.map_topic c
                          WHERE c.parent_id = t.id AND c.deleted_at IS NULL);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      EXIT WHEN v_n = 0;
    END LOOP;

    IF EXISTS (SELECT 1 FROM seo.map_topic t
                WHERE t.map_id = NEW.id AND t.deleted_at IS NULL) THEN
      raise exception 'seo.topical_map: map was soft-deleted but live topics remain under it' using ERRCODE = '23514',
            detail = jsonb_build_object('id', NEW.id)::text;
    END IF;

  -- RESTORE
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    LOOP
      v_pass := v_pass + 1;
      IF v_pass > 201 THEN
        raise exception 'seo.topical_map: restoring map did not finish in 201 passes' using ERRCODE = '55000',
            detail = jsonb_build_object('id', NEW.id)::text;
      END IF;
      UPDATE seo.map_topic t
         SET deleted_at = NULL,
             metadata   = coalesce(t.metadata, '{}'::jsonb) - 'deleted_via'
       WHERE t.map_id = NEW.id
         AND t.deleted_at IS NOT NULL
         AND (t.metadata -> 'deleted_via' ->> 'id') = NEW.id::text
         AND (t.parent_id IS NULL
              OR EXISTS (SELECT 1 FROM seo.map_topic p
                          WHERE p.id = t.parent_id AND p.deleted_at IS NULL));
      GET DIAGNOSTICS v_n = ROW_COUNT;
      EXIT WHEN v_n = 0;
    END LOOP;
  END IF;

  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION seo._topical_map_shape()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_brand_org uuid;
BEGIN
  SELECT organization_id INTO v_brand_org FROM web.brand WHERE id = NEW.brand_id;
  IF v_brand_org IS NULL THEN
    raise exception 'seo.topical_map: brand does not exist' using ERRCODE='23503',
            detail = jsonb_build_object('brand_id', NEW.brand_id)::text;
  END IF;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'seo.topical_map: organization_id is required (must equal the brand''s organization)' USING ERRCODE='23502';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM v_brand_org THEN
    raise exception 'seo.topical_map: organization_id must match brand' using ERRCODE='23514',
            detail = jsonb_build_object('brand_id', NEW.brand_id)::text;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.brand_id IS DISTINCT FROM OLD.brand_id THEN
    RAISE EXCEPTION 'seo.topical_map: a map cannot move between brands' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION seo.change_record_scope_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'seo', 'web', 'pg_temp'
AS $function$
declare
  v_change seo.change_set%rowtype;
  v_page_site uuid;
begin
  if tg_table_name = 'change_set' then
    if new.primary_page_id is not null then
      select p.site_id into v_page_site
      from web.page p
      where p.id = new.primary_page_id and p.deleted_at is null;
      if v_page_site is distinct from new.site_id then
        raise exception 'seo_change_page_site_mismatch: primary page does not belong to this site'
          using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  select * into v_change
  from seo.change_set c
  where c.id = new.change_set_id and c.deleted_at is null;
  if not found then
    raise exception 'seo_change_not_found' using errcode = '23503',
            detail = jsonb_build_object('change_set_id', new.change_set_id)::text;
  end if;
  if new.organization_id is distinct from v_change.organization_id
     or new.site_id is distinct from v_change.site_id then
    raise exception 'seo_change_scope_mismatch: child scope must match its change set'
      using errcode = '23514';
  end if;

  if tg_table_name = 'change_theory' then
    if new.page_id is not null then
      select p.site_id into v_page_site
      from web.page p
      where p.id = new.page_id and p.deleted_at is null;
      if v_page_site is distinct from new.site_id then
        raise exception 'seo_change_page_site_mismatch: theory page does not belong to this site'
          using errcode = '23514';
      end if;
    end if;
  elsif tg_table_name = 'change_item' then
    select p.site_id into v_page_site
    from web.page p
    where p.id = new.page_id and p.deleted_at is null;
    if v_page_site is distinct from new.site_id then
      raise exception 'seo_change_page_site_mismatch: implementation page does not belong to this site'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'change_metric' then
    if not exists (
      select 1
      from seo.change_theory t
      where t.id = new.theory_id
        and t.change_set_id = new.change_set_id
        and t.site_id = new.site_id
        and t.deleted_at is null
    ) then
      raise exception 'seo_change_metric_theory_mismatch: metric theory must belong to its change set'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION seo.fn_engine_schedule_target_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_site_org uuid;
BEGIN
  IF NEW.scope_tier = 'organization' THEN
    IF NEW.scope_organization_id IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION
        'engine_schedule: an organization schedule must target its own organization'
        USING ERRCODE = '42501';
    END IF;

  ELSIF NEW.scope_tier = 'site' THEN
    SELECT s.organization_id INTO v_site_org FROM web.site s WHERE s.id = NEW.site_id;
    IF v_site_org IS NULL THEN
      raise exception 'engine_schedule: site does not exist' using ERRCODE = '42501',
            detail = jsonb_build_object('site_id', NEW.site_id)::text;
    END IF;
    IF v_site_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION
        'engine_schedule: that site belongs to another organization'
        USING ERRCODE = '42501';
    END IF;

  ELSIF NEW.scope_tier = 'system' THEN
    -- A system row governs every organization on the platform, so a PERSON must
    -- be a platform admin to set one. A background writer (the dispatcher
    -- stamping `last_dispatched_at`, a migration, the scheduler) has no JWT and
    -- therefore no `auth.uid()` — it is not a user escalating privilege, and
    -- blocking it would wedge the very automation these rows exist to drive.
    -- Caught live: the first claim against a system row failed on this check.
    IF (SELECT auth.uid()) IS NOT NULL AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION
        'engine_schedule: only a platform admin may set the system-wide schedule'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION users._credential_mutation_receipt_must_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'users'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM users.credential_mutation_receipts r
     WHERE r.id = NEW.id
       AND r.completed_at IS NOT NULL
       AND (
         (r.operation = 'backup_restore_item'
          AND r.principal_type = 'user' AND r.principal_id = r.actor_id
          AND r.target_item_id IS NULL AND r.target_field_id IS NULL
          AND r.request_fingerprint IS NOT NULL AND octet_length(r.request_fingerprint) = 32
          AND r.result_item_id IS NOT NULL AND r.result_field_id IS NULL
          AND r.result_passkey_id IS NULL AND r.result_value_version IS NULL
          AND EXISTS (
            SELECT 1 FROM users.credential_items i
             WHERE i.id = r.result_item_id AND i.user_id = r.actor_id
               AND i.organization_id IS NULL AND i.deleted_at IS NULL
               AND i.status = 'disabled' AND i.access_mode = 'restricted'
               AND i.browser_fill_enabled = false
               AND i.definition_key NOT IN ('native_passkey', 'passkey_private')
               AND NOT EXISTS (
                 SELECT 1 FROM users.user_secrets s WHERE s.credential_item_id = i.id
                   AND s.deleted_at IS NULL
                   AND (s.user_id IS DISTINCT FROM r.actor_id OR s.organization_id IS NOT NULL
                     OR s.is_active IS DISTINCT FROM false
                     OR s.access_mode IS DISTINCT FROM 'restricted'
                     OR s.inject_into_sandbox IS DISTINCT FROM false
                     OR s.execution_purpose IS DISTINCT FROM 'general'
                     OR s.handling NOT IN ('visible', 'revealable')
                     OR s.field_key IN ('passkey_private', 'totp_seed')))
               AND NOT EXISTS (
                 SELECT 1 FROM users.user_secret_grants g
                 WHERE g.credential_item_id = i.id OR g.user_secret_id IN (
                   SELECT s.id FROM users.user_secrets s WHERE s.credential_item_id = i.id))
               AND NOT EXISTS (
                 SELECT 1 FROM users.credential_attachments a
                 WHERE a.credential_item_id = i.id AND a.deleted_at IS NULL
                   AND a.handling NOT IN ('visible', 'revealable'))
               AND NOT EXISTS (
                 SELECT 1 FROM users.passkey_credentials p
                 WHERE p.credential_item_id = i.id AND p.deleted_at IS NULL)
          ))
         OR
         (r.operation = 'create_item'
          AND r.target_item_id IS NULL AND r.target_field_id IS NULL
          AND r.result_item_id IS NOT NULL AND r.result_field_id IS NULL
          AND r.result_value_version IS NULL
          AND r.request_fingerprint IS NULL AND r.result_passkey_id IS NULL)
         OR
         (r.operation = 'add_field'
          AND r.target_item_id IS NOT NULL AND r.target_field_id IS NULL
          AND r.result_item_id = r.target_item_id AND r.result_field_id IS NOT NULL
          AND r.result_value_version > 0
          AND r.request_fingerprint IS NULL AND r.result_passkey_id IS NULL)
         OR
         (r.operation = 'update_field'
          AND r.target_item_id IS NOT NULL AND r.target_field_id IS NOT NULL
          AND r.result_item_id = r.target_item_id AND r.result_field_id = r.target_field_id
          AND r.result_value_version > 0
          AND r.request_fingerprint IS NULL AND r.result_passkey_id IS NULL)
         OR
         (r.operation IN ('native_passkey_create', 'native_passkey_import')
          AND r.target_item_id IS NULL AND r.target_field_id IS NULL
          AND r.request_fingerprint IS NOT NULL AND octet_length(r.request_fingerprint) = 32
          AND r.result_item_id IS NOT NULL AND r.result_field_id IS NOT NULL
          AND r.result_passkey_id IS NOT NULL AND r.result_value_version = 1
          AND EXISTS (
            SELECT 1
              FROM users.passkey_credentials p
              JOIN users.credential_items i ON i.id = p.credential_item_id
              JOIN users.user_secrets s ON s.id = p.source_field_id
             WHERE p.id = r.result_passkey_id
               AND p.credential_item_id = r.result_item_id
               AND p.source_field_id = r.result_field_id
               AND p.organization_id = r.organization_id
               AND p.deleted_at IS NULL AND i.deleted_at IS NULL AND s.deleted_at IS NULL
               AND ((r.principal_type = 'organization'
                     AND i.organization_id = r.principal_id AND s.organization_id = r.principal_id)
                    OR (r.principal_type = 'user'
                        AND i.user_id = r.principal_id AND s.user_id = r.principal_id))
          ))
       )
  ) THEN
    raise exception 'receipt incomplete or invalid at commit' using errcode = 'P0001', detail = jsonb_build_object('id', NEW.id)::text;
  END IF;
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION users.enforce_secret_item_owner_match()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.credential_item_id is not null then
    if not exists (
      select 1 from users.credential_items i
      where i.id = new.credential_item_id
        and i.user_id is not distinct from new.user_id
        and i.organization_id is not distinct from new.organization_id
    ) then
      raise exception 'user_secrets owner does not match the owner of its credential_items row' using errcode = 'P0001', detail = jsonb_build_object('user_id', new.user_id, 'organization_id', new.organization_id, 'credential_item_id', new.credential_item_id)::text;
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION web.enforce_live_site_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.site_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1
    FROM web.site
   WHERE id = NEW.site_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    raise exception 'web.% cannot be live under soft-deleted web.site', TG_TABLE_NAME using ERRCODE = '23514',
            detail = jsonb_build_object('site_id', NEW.site_id)::text;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION web.validate_screenshot_artifact_file()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'web'
AS $function$
declare v_session_id uuid;
begin
  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
     AND (to_jsonb(OLD) - ARRAY['deleted_at', 'updated_at', 'updated_by', 'version'])
         = (to_jsonb(NEW) - ARRAY['deleted_at', 'updated_at', 'updated_by', 'version']) THEN
    RETURN NEW;
  END IF;

  select s.session_id into v_session_id
  from web.snapshot s
  where s.id = new.snapshot_id
    and s.organization_id = new.organization_id
    and s.site_id = new.site_id
    and s.page_id = new.page_id;
  if v_session_id is null then
    raise exception 'screenshot context does not match snapshot' using errcode = '23514',
            detail = jsonb_build_object('snapshot_id', new.snapshot_id)::text;
  end if;
  perform web.assert_crawl_artifact_file(
    new.file_id, new.organization_id, new.site_id, v_session_id, 'image/png'
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION workbench.guard_template_dataset_binding()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.template_id is not null and (
    new.template_id is distinct from old.template_id
    or new.template_version is distinct from old.template_version
    or new.validation_mode <> 'strict'
  ) then
    raise exception 'template binding and strict validation are immutable for this dataset' using errcode = '55000',
            detail = jsonb_build_object('id', old.id)::text;
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION workflow.reject_plan_event_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    raise exception 'workflow.plan_event is append-only: % is forbidden for this event', TG_OP using ERRCODE = '55000',
            detail = jsonb_build_object('id', OLD.id)::text;
END;
$function$;

