-- chair-step: ADDS six frozen copies of today's column answer — iam._legacy_may_touch_field_itself, iam._legacy_may_touch_field, iam._legacy_visible_field_ids, custom._legacy_hidden_field_notice, custom._legacy_read_mask_for, custom._legacy_read_mask_at — the oracle the Store Tables equivalence proof compares the part answers with (PLAN §12 order 3, §12.1). Bodies are the live text; calls between frozen siblings are repointed to their _legacy_ copies and the frozen mask keeps its own memo slot ('rmf_legacy:'), so the proof never compares new code with itself. Not client-callable. Nothing live changes.
-- lane: access-setup-store
-- lock: iam,custom
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §12, §12.1.
-- Inverse: migrations/inverse/accesssetup_store_a_the_column_answers_are_frozen_as_the_oracle_down.sql

CREATE OR REPLACE FUNCTION iam._legacy_may_touch_field_itself(p_user_id uuid, p_field_id uuid, p_organization_id uuid, p_level_on_record permission_level, p_action text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sensitivity text;
  v_required    public.permission_level;
  v_granted     public.permission_level;
begin
  if p_field_id is null then return true; end if;

  select f.data ->> 'sensitivity'
    into v_sensitivity
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
  if not found then
    -- A field nobody declared is not a field this store will hand out.
    return false;
  end if;

  -- PORTAL (2026-09-20) — AN OUTSIDER'S FIELDS ARE THE ONES HER PORTAL DECLARED, AND THIS
  -- NARROWS ONLY. A portal says which fields a client sees and which she may change; the
  -- answer belongs here, in the one question the platform already asks about a field, so a
  -- portal screen and an edit through `custom.record_update` cannot disagree and neither of
  -- them needs to know a portal exists.
  --
  -- The first test is one index probe on `custom.portal_principal (user_id, organization_id)`
  -- and finds nothing for every member of every organization, which is the whole platform
  -- except the handful of people a portal named. A person who is BOTH a member here and a
  -- portal principal here is a member: the portal is for outsiders, and narrowing a colleague
  -- because somebody put their address in a client row would be a new way to lose access.
  if coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false)
     and exists (select 1 from custom.portal_principal pp
                  where pp.user_id = p_user_id
                    and pp.organization_id = p_organization_id
                    and pp.is_active)
     and not iam.has_org_access_for(p_user_id, p_organization_id) then
    if not exists (
      select 1
        from custom.portal_table pt
        join custom.portal p on p.id = pt.portal_id and p.is_active
        join custom.portal_principal pp on pp.portal_id = p.id
       where pt.organization_id = p_organization_id
         and pp.user_id = p_user_id
         and pp.is_active
         and case when p_action = 'read'
                  then p_field_id = any (pt.visible_field_ids)
                  else p_field_id = any (pt.editable_field_ids)
             end) then
      return false;
    end if;
  end if;

  v_required := iam.field_sensitivity_level(v_sensitivity, p_action, p_organization_id);

  -- VIS-21 / VIS-26: the OVERRIDE is a row in the one grant table, on the field record.
  v_granted := iam.granted_level(p_user_id, 'record', p_field_id);
  if v_granted is not null and v_granted >= v_required then
    return true;
  end if;

  return p_level_on_record is not null and p_level_on_record >= v_required;
end $function$;

CREATE OR REPLACE FUNCTION iam._legacy_may_touch_field(p_user_id uuid, p_field_id uuid, p_organization_id uuid, p_level_on_record permission_level, p_action text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_data  jsonb;
  v_input record;
begin
  if not iam._legacy_may_touch_field_itself(p_user_id, p_field_id, p_organization_id, p_level_on_record, p_action) then
    return false;
  end if;
  if p_field_id is null then return true; end if;

  -- STORE-LEAK-FORMULA (VERIFIER-18 finding 1): A WORKED-OUT ANSWER IS AS SECRET AS WHAT IT IS
  -- WORKED OUT FROM. A formula, lookup or rollup column is read only by a person who may read
  -- every live column it reads — asked with the same level, the same per-person grants and the
  -- same portal — so `{Budget} * 1.1` is withheld from everyone Budget is withheld from, even
  -- where a grant or a portal names the formula alone. Every door asks this one question, so
  -- the grid, the Sheet, the record panel, the aggregate, the filter and the export inherit it.
  select f.data into v_data
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
  if v_data is null
     or coalesce(v_data ->> 'type', '') <> 'formula'
     or not (coalesce(v_data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']) then
    return true;
  end if;

  for v_input in
    select c.input_id
      from custom.field_input_closure(p_organization_id, v_data, p_field_id) c
     where not c.retired
  loop
    if not iam._legacy_may_touch_field_itself(p_user_id, v_input.input_id, p_organization_id,
                                      p_level_on_record, 'read') then
      return false;
    end if;
  end loop;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION iam._legacy_visible_field_ids(p_user_id uuid, p_organization_id uuid, p_table_id uuid, p_level_on_record permission_level, p_action text DEFAULT 'read'::text)
 RETURNS TABLE(field_id uuid, field_key text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select f.id, f.data ->> 'key'
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and iam._legacy_may_touch_field(p_user_id, f.id, p_organization_id, p_level_on_record, p_action);
$function$;

CREATE OR REPLACE FUNCTION custom._legacy_hidden_field_notice(p_field custom.record, p_action text DEFAULT 'read'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- STORE-LEAK-FORMULA: a withheld worked-out column also says WHAT it is worked out from, so a
  -- reader is told "Budget with contingency is worked out from Budget" — never shown a value
  -- and never a bare "—". Every other column's notice is exactly what it was.
  select jsonb_build_object(
    'reason', p_field.data ->> 'sensitivity',
    'needs',  iam.level_label('record',
                iam.field_sensitivity_level(p_field.data ->> 'sensitivity', p_action,
                                            p_field.organization_id)),
    'or',     'a share of this one field with you')
  || coalesce((
    select jsonb_build_object(
             'reads', jsonb_agg(c.input_label order by c.input_label),
             'says',  format('%s is worked out from %s, which you have not been given.',
                             coalesce(nullif(p_field.data ->> 'label', ''), p_field.data ->> 'key'),
                             string_agg(c.input_label, ', ' order by c.input_label)))
      from custom.field_input_closure(p_field.organization_id, p_field.data, p_field.id) c
     where not c.retired
       and custom.sensitivity_rank(c.sensitivity) > custom.sensitivity_rank('internal')
    having count(*) > 0), '{}'::jsonb);
$function$;

CREATE OR REPLACE FUNCTION custom._legacy_read_mask_for(p_user_id uuid, p_organization_id uuid, p_table_id uuid, p_level permission_level, p_action text DEFAULT 'read'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_key      text;
  v_hit      text;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_all_ids  jsonb;
  v_out      jsonb;
begin
  if p_table_id is null then
    return jsonb_build_object('table_id', null, 'level', null,
                              'visible', '[]'::jsonb, 'declared', '[]'::jsonb,
                              'notices', '{}'::jsonb, 'key_ids', '{}'::jsonb,
                              'all_key_ids', '{}'::jsonb,
                              'undeclared_ride_along', true);
  end if;

  v_key := 'rmf_legacy:' || coalesce(p_user_id::text, '-') || ':' || coalesce(p_organization_id::text, '-')
        || ':' || p_table_id::text || ':' || coalesce(p_level::text, '-') || ':' || coalesce(p_action, '-');
  v_hit := platform.memo_k_get(v_key);
  if v_hit is not null then
    return v_hit::jsonb;
  end if;

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam._legacy_visible_field_ids(p_user_id, p_organization_id, p_table_id, p_level, p_action) f;

  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[]),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_declared, v_all_ids
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom._legacy_hidden_field_notice(f, p_action)), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_notices, v_key_ids
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and not (f.data ->> 'key' = any (v_visible));

  v_out := jsonb_build_object(
    'table_id',    p_table_id,
    'level',       p_level,
    'visible',     to_jsonb(v_visible),
    'declared',    to_jsonb(v_declared),
    'notices',     v_notices,
    'key_ids',     v_key_ids,
    'all_key_ids', v_all_ids,
    'undeclared_ride_along', true);
  perform platform.memo_k_put(v_key, v_out::text);
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._legacy_read_mask_at(p_record_id uuid, p_level_given boolean, p_level permission_level, p_action text DEFAULT 'read'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me    uuid := auth.uid();
  v_table uuid;
  v_org   uuid;
begin
  -- THE MASK IS TAKEN IN THE RECORD'S OWN ORGANIZATION (2026-09-23) — see custom.read_mask.
  select r.table_id, r.organization_id into v_table, v_org
    from custom.record r
   where r.id = p_record_id;
  if v_table is null then
    -- A record with no Table (a Home) declares no Fields, so nothing is masked and nothing
    -- is claimed. The caller's own door has already decided whether they may read it.
    return jsonb_build_object('table_id', null, 'level', null,
                              'visible', '[]'::jsonb, 'declared', '[]'::jsonb,
                              'notices', '{}'::jsonb, 'key_ids', '{}'::jsonb,
                              'undeclared_ride_along', true);
  end if;
  return custom._legacy_read_mask_for(v_me, v_org, v_table,
                              case when p_level_given then p_level
                                   else custom.effective_level(v_me, v_org, p_record_id) end,
                              p_action);
end;
$function$;

-- every SECURITY DEFINER copy declares its access decision in data (server only)
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', '_legacy_may_touch_field_itself', 'p_user_id uuid, p_field_id uuid, p_organization_id uuid, p_level_on_record permission_level, p_action text', array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid, 'permission_level'::regtype::oid, 'text'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_store_a_the_column_answers_are_frozen_as_the_oracle.sql (lane access-setup-store)',
   'ACCESS-SETUP §12.1: frozen copy of iam.may_touch_field_itself before Store Tables parts; the equivalence oracle.',
   'server_only: the Store Tables equivalence oracle calls it inside a rolled-back transaction; never a client door', false, false),
  ('iam', '_legacy_may_touch_field', 'p_user_id uuid, p_field_id uuid, p_organization_id uuid, p_level_on_record permission_level, p_action text', array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid, 'permission_level'::regtype::oid, 'text'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_store_a_the_column_answers_are_frozen_as_the_oracle.sql (lane access-setup-store)',
   'ACCESS-SETUP §12.1: frozen copy of iam.may_touch_field before Store Tables parts; the equivalence oracle.',
   'server_only: the Store Tables equivalence oracle calls it inside a rolled-back transaction; never a client door', false, false),
  ('iam', '_legacy_visible_field_ids', 'p_user_id uuid, p_organization_id uuid, p_table_id uuid, p_level_on_record permission_level, p_action text', array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid, 'permission_level'::regtype::oid, 'text'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_store_a_the_column_answers_are_frozen_as_the_oracle.sql (lane access-setup-store)',
   'ACCESS-SETUP §12.1: frozen copy of iam.visible_field_ids before Store Tables parts; the equivalence oracle.',
   'server_only: the Store Tables equivalence oracle calls it inside a rolled-back transaction; never a client door', false, false),
  ('custom', '_legacy_read_mask_for', 'p_user_id uuid, p_organization_id uuid, p_table_id uuid, p_level permission_level, p_action text', array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid, 'permission_level'::regtype::oid, 'text'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_store_a_the_column_answers_are_frozen_as_the_oracle.sql (lane access-setup-store)',
   'ACCESS-SETUP §12.1: frozen copy of custom.read_mask_for before Store Tables parts; the equivalence oracle.',
   'server_only: the Store Tables equivalence oracle calls it inside a rolled-back transaction; never a client door', false, false),
  ('custom', '_legacy_read_mask_at', 'p_record_id uuid, p_level_given boolean, p_level permission_level, p_action text', array['uuid'::regtype::oid, 'boolean'::regtype::oid, 'permission_level'::regtype::oid, 'text'::regtype::oid]::oid[],
   'migrations/campaign/accesssetup_store_a_the_column_answers_are_frozen_as_the_oracle.sql (lane access-setup-store)',
   'ACCESS-SETUP §12.1: frozen copy of custom.read_mask_at before Store Tables parts; the equivalence oracle.',
   'server_only: the Store Tables equivalence oracle calls it inside a rolled-back transaction; never a client door', false, false)
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;

REVOKE ALL ON FUNCTION iam._legacy_may_touch_field_itself(uuid,uuid,uuid,permission_level,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION iam._legacy_may_touch_field(uuid,uuid,uuid,permission_level,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION iam._legacy_visible_field_ids(uuid,uuid,uuid,permission_level,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION custom._legacy_hidden_field_notice(custom.record,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION custom._legacy_read_mask_for(uuid,uuid,uuid,permission_level,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION custom._legacy_read_mask_at(uuid,boolean,permission_level,text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION iam._legacy_may_touch_field_itself(uuid,uuid,uuid,permission_level,text) IS 'Frozen oracle (accesssetup_store_a, 2026-10-10): the column answer exactly as it was before Store Tables parts; compared by scripts/db-proofs/access-setup-store-equivalence.py; dropped after the swap is re-proven (PLAN §12 order 8). Not client-callable.';
COMMENT ON FUNCTION iam._legacy_may_touch_field(uuid,uuid,uuid,permission_level,text) IS 'Frozen oracle (accesssetup_store_a, 2026-10-10): the column answer exactly as it was before Store Tables parts; compared by scripts/db-proofs/access-setup-store-equivalence.py; dropped after the swap is re-proven (PLAN §12 order 8). Not client-callable.';
COMMENT ON FUNCTION iam._legacy_visible_field_ids(uuid,uuid,uuid,permission_level,text) IS 'Frozen oracle (accesssetup_store_a, 2026-10-10): the column answer exactly as it was before Store Tables parts; compared by scripts/db-proofs/access-setup-store-equivalence.py; dropped after the swap is re-proven (PLAN §12 order 8). Not client-callable.';
COMMENT ON FUNCTION custom._legacy_hidden_field_notice(custom.record,text) IS 'Frozen oracle (accesssetup_store_a, 2026-10-10): the column answer exactly as it was before Store Tables parts; compared by scripts/db-proofs/access-setup-store-equivalence.py; dropped after the swap is re-proven (PLAN §12 order 8). Not client-callable.';
COMMENT ON FUNCTION custom._legacy_read_mask_for(uuid,uuid,uuid,permission_level,text) IS 'Frozen oracle (accesssetup_store_a, 2026-10-10): the column answer exactly as it was before Store Tables parts; compared by scripts/db-proofs/access-setup-store-equivalence.py; dropped after the swap is re-proven (PLAN §12 order 8). Not client-callable.';
COMMENT ON FUNCTION custom._legacy_read_mask_at(uuid,boolean,permission_level,text) IS 'Frozen oracle (accesssetup_store_a, 2026-10-10): the column answer exactly as it was before Store Tables parts; compared by scripts/db-proofs/access-setup-store-equivalence.py; dropped after the swap is re-proven (PLAN §12 order 8). Not client-callable.';
