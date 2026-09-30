-- INVERSE of migrations/campaign/scopesaccess_the_kernel_answers_a_scope_type_from_the_store.sql (lane SCOPES-READS-ACCESS).
-- chair-step: puts back entity_row_access_attrs answering a scope type from context.scope_types, and the kernel expectation production held before.
@BASEDON@

CREATE OR REPLACE FUNCTION platform.entity_row_access_attrs(p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform'
AS $function$
DECLARE
  v_registry_vis platform.visibility;
  v_probe record;
BEGIN
  o_found := false;
  o_vis := 'personal'::platform.visibility;
  o_owner := NULL;
  o_org := NULL;

  IF p_schema IS NULL OR p_table IS NULL OR p_id IS NULL THEN
    RETURN;
  END IF;

  -- 🚨 LADDER-PERF (2026-09-20) — A PARTITIONED ROW IS PROBED BY A CACHED PLAN.
  -- Everything below this line is unchanged and is still the general case. What changed is
  -- that a table PostgreSQL has to plan a sixteen-way Append for is no longer planned from
  -- scratch on every call: plpgsql's EXECUTE never caches a plan, and this function is called
  -- once per node of every containment walk in iam.has_access_for_base. Measured on the main
  -- database: 0.881 ms a call for custom.record, of which 0.814 ms was planning — against
  -- 0.139 ms for the identical probe as static, plan-cached SQL. The static arms are GENERATED
  -- from platform.entity_types by platform.rebuild_static_row_probes(), they use the shape the
  -- fallbacks below would have reached, and any surprise at all hands the question straight
  -- back to them (o_handled = false).
  v_probe := platform.partitioned_row_attrs(p_schema, p_table, p_id);
  IF v_probe.o_handled THEN
    o_vis := v_probe.o_vis; o_owner := v_probe.o_owner;
    o_org := v_probe.o_org; o_found := v_probe.o_found;
    RETURN;
  END IF;

  -- 🚨 SCOPES-READS-ACCESS (2026-09-29) — A SCOPE AND A CONTEXT FIELD ARE ANSWERED FROM THE RECORD STORE.
  -- A scope is the Record of its context Table under the same id, and a context field the Field record
  -- under the same id; the scopes cutover moves context.* to the graveyard, after which the dynamic
  -- probe below would find nothing. Each arm returns exactly what that probe returns on the old table
  -- today, including its not-found answer (every output NULL: a SELECT INTO over no row), proved by
  -- the lane's shadow compare over every scope and field. This is a hand-written arm beside the
  -- generated ones on purpose: platform.rebuild_static_row_probes() generates probes of a table by its
  -- own name, and these answer for a table that is leaving. context.scope_types stays on the dynamic
  -- probe: a scope type's creator has no home in the store yet (its Table carries the copier).
  IF p_schema = 'context' AND p_table = 'scopes' THEN
    SELECT r.visibility, r.created_by, r.organization_id, true
      INTO o_vis, o_owner, o_org, o_found
      FROM custom.record r
      JOIN custom.record t ON t.organization_id = r.organization_id AND t.id = r.table_id
     WHERE r.id = p_id AND r.data_class = 'record' AND t.data ->> 'kept_for' = 'context';
    RETURN;
  END IF;
  IF p_schema = 'context' AND p_table = 'context_items' THEN
    SELECT coalesce((SELECT et.default_visibility FROM platform.entity_types et
                      WHERE et.schema_name = p_schema AND et.table_name = p_table LIMIT 1),
                    'personal'::platform.visibility),
           NULL::uuid, NULL::uuid, true
      INTO o_vis, o_owner, o_org, o_found
      FROM custom.record f
     WHERE f.id = p_id AND f.data_class = 'field'
       AND f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
    RETURN;
  END IF;

  BEGIN
    EXECUTE format(
      'SELECT visibility, created_by, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  BEGIN
    EXECUTE format(
      'SELECT visibility, owner_id, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  BEGIN
    EXECUTE format(
      'SELECT ''personal''::platform.visibility, owner_id, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  BEGIN
    EXECUTE format(
      'SELECT ''personal''::platform.visibility, created_by, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  -- Registry-declared intent for tables with no ownership columns; 'personal'
  -- remains the default when the registry declares nothing.
  SELECT et.default_visibility
    INTO v_registry_vis
  FROM platform.entity_types et
  WHERE et.schema_name = p_schema
    AND et.table_name = p_table
  LIMIT 1;

  -- No ownership columns, but the table IS org-scoped (context.scope_types,
  -- runtime plumbing, ...): surface organization_id so membership-based access
  -- can apply, with the registry's declared visibility.
  BEGIN
    EXECUTE format(
      'SELECT $2::platform.visibility, NULL::uuid, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found
    USING p_id, coalesce(v_registry_vis, 'personal'::platform.visibility);
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  -- Row exists but the table carries NO ownership columns at all — a platform
  -- catalog (ui.ui_surface, ...). There is no owner and no org to key access
  -- on, so 'personal' is meaningless here and denies everyone. Honor the
  -- registry's declared intent; 'personal' remains the default when the
  -- registry declares nothing.
  BEGIN
    EXECUTE format(
      'SELECT $2::platform.visibility, NULL::uuid, NULL::uuid, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found
    USING p_id, coalesce(v_registry_vis, 'personal'::platform.visibility);
  EXCEPTION WHEN others THEN
    o_found := false;
  END;
END;
$function$
;

CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT 'b80a5056842aefb142b0631f545ad329'::text
$function$
;

CREATE OR REPLACE FUNCTION iam.entity_read_kernel_members_expected()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT '{"members": {"files.is_crawl_artifact(p_file_id uuid)": "7eb586213cedff72ee4abb4dd60a0433", "iam.candidate_admits(p_type text, p_id uuid)": "aaafd2a1d1fb3e3579c326fe11d70cac", "iam.accessible_entity_candidates(p_type text)": "ff4a1d407ed7e37438cb773f0d5ce80e", "iam.accessible_child_parents(p_child_type text)": "97be40a64243f6225d0eadfb82e33827", "iam.has_org_access_for(p_user_id uuid, p_org uuid)": "05abb4362cb28aa7d775eedf975889f9", "public.is_pack_curator(p_user uuid, p_pack_id uuid)": "5e6f2b3c9c4f0f9011655974ef1532b7", "public.is_org_admin_for(p_user_id uuid, p_org_id uuid)": "ac5072f5e23eb0dfffb7ef05e9899ad4", "files.crawl_site_conveys(p_user_id uuid, p_file_id uuid)": "5fadac4e0d1ad31e788cdb446422d8fc", "public._edu_can_read_via_assignment(p_type text, p_id uuid)": "d97bbb3323238c5b8afb88e3e6337434", "public.is_rulebook_curator(p_user uuid, p_rulebook_id uuid)": "b781c4c0210974d680f53a603cb723aa", "public.library_is_open(p_entity_type text, p_entity_id uuid)": "36c934bb956df459e334c15085aacd30", "public.user_can_read_data_store_via_grant(p_user uuid, p_store uuid)": "63b3fd7f798351c9c8e7517fcfedc3fc", "public._edu_can_read_via_assignment(p_user_id uuid, p_type text, p_id uuid)": "a0d7ac13ea23ec81b8eb15bbb87e3cbb", "public.user_can_read_via_library_grant(p_user uuid, p_type text, p_id uuid)": "a49b44fa2f0de5d3aecace9d950f49e4", "files.has_access_for(p_user_id uuid, p_file_id uuid, p_required permission_level)": "d324b5143d4172b0a6b8b8188930ff7b", "iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer)": "9fe155aa00093efd6fc9c89ab94b8479", "iam.has_access_for(p_user_id uuid, p_type text, p_id uuid, p_required permission_level)": "c7e2eec401c991f06be4bf28453548e5", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level)": "e37fdacb359b9a528d7aef6b2bfb5270", "iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)": "a6ab1c2ef321a02fc89d6e453c37bc4a", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)": "e6b147f6962003e0dc2c8b826ef4ee06", "public.has_permission_for(p_user_id uuid, p_resource_type text, p_resource_id uuid, p_required_permission permission_level)": "9dc1eecf01de31f4db0b0e07b1665a2b", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean, p_path text[])": "746f0149143475d84be45497155a7b27", "platform.entity_row_access_attrs(p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean)": "f68d1328e50c38b8495c3bb865dc2f71"}, "fingerprint": "b80a5056842aefb142b0631f545ad329"}'::jsonb
$function$
;

do $post$
begin
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'scopesaccess inverse: the live fingerprint % is not the restored expectation %', iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  end if;
  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values ((select fingerprint_to from platform.kernel_fingerprint_record order by recorded_at desc limit 1), iam.entity_read_kernel_fingerprint(),
          array['platform.entity_row_access_attrs(p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean)'],
          'SCOPES-READS-ACCESS inverse: a scope type is answered from context.scope_types again.',
          'v2', '{}'::jsonb, 'inverse scopesaccess_the_kernel_answers_a_scope_type_from_the_store_down.sql / lane SCOPES-READS-ACCESS',
          'platform.entity_row_access_attrs');
end $post$;
