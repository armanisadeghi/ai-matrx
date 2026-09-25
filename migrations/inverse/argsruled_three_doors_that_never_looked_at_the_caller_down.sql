-- INVERSE of migrations/campaign/argsruled_three_doors_that_never_looked_at_the_caller.sql.
--
-- It restores all three bodies exactly as they stood before that file: provision_scope_dataset
-- making rows in whatever organization the scope it was handed belongs to, knob_snapshot
-- resolving any named person's own settings, and unified_data_store_set recording whoever the
-- caller names as the person who flipped the switch.
--
-- chair-step: it replaces three live client-door bodies.

set lock_timeout = '2s';

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
end; $function$

;
CREATE OR REPLACE FUNCTION platform.knob_snapshot(p_organization_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_scopes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'platform', 'iam', 'public'
AS $function$
declare
  v_stamp timestamptz;
begin
  -- 🚨 THE ACCESS DECISION, BEFORE THE FIRST READ AND BEFORE EXISTENCE.
  -- The first cut of this function had a truthful door row saying "passing another
  -- organization's id returns that organization's configuration" and called that
  -- acceptable because it is "only configuration". ddl_guard refused it and cited
  -- seo.keyword_value_map, which had a truthful door row and handed 114,686 rows of
  -- another tenant's data to a non-member on 2026-09-17. The guard was right: an
  -- organization's configuration says which features they run, what their ceilings are
  -- and how their operation is posture-d, and none of that is a stranger's to read.
  -- A foreign id and an invented one answer identically, on purpose.
  if p_organization_id is not null
     and not iam.is_trusted_backend()
     and not iam.has_org_access(p_organization_id) then
    raise exception 'platform.knob_snapshot: not a member of that organization'
      using errcode = '42501';
  end if;

  -- 🚨 ONE FETCH, NOT ONE PER SETTING. Arman, 2026-09-20: "we can't be fetching
  -- individual configurations for everything that we do, and we can't be trying to do
  -- these things live or through any sort of application level logic regardless of if
  -- it's a server or the client."
  --
  -- Measured before building this: 870 knobs, 536 delegated, and the ENTIRE resolved map
  -- is 49 kB (31 kB delegated) - a few kB on the wire. There was never a size argument
  -- for resolving them one at a time.
  --
  -- 🚨 IT CALLS knob_resolve PER KEY ON PURPOSE. Resolution is ONE rule and this may not
  -- become a second copy of it: precedence, overridable_by, rung locks, direction and
  -- range clamping all live in knob_resolve, and a snapshot that reimplemented them
  -- set-wise would drift from the single-key answer the moment either changed - exactly
  -- the split-brain this system exists to prevent. These are function calls inside ONE
  -- query, not round trips.
  --
  -- `stamp` is the cache key: the newest write across the register and THIS org's
  -- overrides and rung locks. A holder whose stamp still matches holds current truth and
  -- needs no refetch. The settings_changed directive channel pushes invalidation; this is
  -- the belt to that suspenders, for a tab that was asleep when the push went out.
  select greatest(
           coalesce((select max(updated_at) from platform.feature_knob), 'epoch'::timestamptz),
           coalesce((select max(updated_at) from platform.knob_override
                      where organization_id is not distinct from p_organization_id), 'epoch'::timestamptz),
           coalesce((select max(updated_at) from platform.knob_rung_lock
                      where organization_id is not distinct from p_organization_id), 'epoch'::timestamptz))
    into v_stamp;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'user_id',         p_user_id,
    'stamp',           to_jsonb(v_stamp),
    'count',           (select count(*) from platform.feature_knob),
    'resolved', coalesce((
      select jsonb_object_agg(
               k.feature || '.' || k.key,
               platform.knob_resolve(k.feature, k.key, p_organization_id, p_user_id, p_scopes))
        from platform.feature_knob k), '{}'::jsonb));
end
$function$

;
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
$function$

;
