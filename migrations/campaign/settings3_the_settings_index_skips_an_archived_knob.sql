-- additive: no
-- based-on: platform.knob_index(uuid, text, uuid, boolean, jsonb, uuid) 1dbd1dd8a979d2ceb189678bb073df8e122445f84f5fe037547659d98732bfa6
-- chair-step: it REPLACES the live body of platform.knob_index, the function every settings
--   screen calls to list the knobs it may offer. ONE line is added to its final WHERE:
--   `and k.archived_at is null`. Nothing is created, dropped, granted or revoked, and no row
--   of anybody's data is touched. The inverse is
--   migrations/inverse/settings3_the_settings_index_skips_an_archived_knob_down.sql, which
--   restores the body this file replaces, byte for byte.
--
-- SETTINGS-3 — AN ARCHIVED KNOB IS NOT OFFERED.
--
-- `platform.knob_archive` (migrations/campaign/settings3_a_retired_knob_is_archived_not_deleted.sql)
-- retires a registration that decides nothing. Retiring it in the table and still listing it
-- on the organization's settings screen would be the original defect wearing a timestamp: the
-- person still sees the control, still turns it, and still changes nothing. `knob_index` is
-- the ONE list every settings surface reads, so the skip belongs here and nowhere else — a
-- filter in the client would leave every other caller offering the row.
--
-- RESOLUTION IS DELIBERATELY UNTOUCHED. `knob_resolve`, `knob_resolve_uncached` and
-- `knob_snapshot` still answer for an archived row. Archiving is soft: if a reader turns up
-- tomorrow it gets the value it always got, and `platform.knob_unarchive` puts the row back
-- on the screens. Only the OFFER goes away.

CREATE OR REPLACE FUNCTION platform.knob_index(p_organization_id uuid, p_feature_prefix text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_overridden_only boolean DEFAULT false, p_scopes jsonb DEFAULT NULL::jsonb, p_device_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'platform', 'public'
AS $function$
declare
  v_uid          uuid := auth.uid();
  v_is_admin     boolean;
  v_is_org_admin boolean;
  v_scope        jsonb;
  v_kind         text;
  v_id           uuid;
  v_owner        uuid;
  s              platform.knob_scope_kind%rowtype;
  v_req          jsonb;
begin
  if v_uid is null then
    raise exception 'platform.knob_index: no authenticated caller' using errcode = '42501';
  end if;

  v_is_admin := public.is_admin();

  if not v_is_admin and not exists (
      select 1 from iam.organization_member m
       where m.organization_id = p_organization_id and m.user_id = v_uid) then
    raise exception 'platform.knob_index: not a member of that organization' using errcode = '42501';
  end if;

  if p_user_id is not null and p_user_id is distinct from v_uid and not v_is_admin then
    raise exception 'platform.knob_index: user rung is self-only' using errcode = '42501';
  end if;

  v_is_org_admin := v_is_admin or exists (
      select 1 from iam.organization_member m
       where m.organization_id = p_organization_id
         and m.user_id = v_uid
         and m.role in ('owner', 'admin'));

  v_req := jsonb_build_object('organization', p_organization_id);
  if p_user_id is not null then
    v_req := v_req || jsonb_build_object('user', p_user_id);
  end if;
  if p_device_id is not null then
    v_req := v_req || jsonb_build_object('device', p_device_id);
  end if;

  if p_scopes is not null and jsonb_typeof(p_scopes) <> 'null' then
    if jsonb_typeof(p_scopes) <> 'array' then
      raise exception 'platform.knob_index: p_scopes must be an array of {kind,id}'
        using errcode = '22023';
    end if;
    for v_scope in select value from jsonb_array_elements(p_scopes) loop
      v_kind := v_scope ->> 'kind';
      begin
        v_id := nullif(v_scope ->> 'id', '')::uuid;
      exception when invalid_text_representation then
        raise exception 'platform.knob_index: scope id for kind % is not a uuid', v_kind
          using errcode = '22023';
      end;

      select * into s from platform.knob_scope_kind where kind = v_kind;
      if s.kind is null then
        raise exception 'platform.knob_index: unknown scope kind %', coalesce(v_kind, '(null)')
          using errcode = '22023';
      end if;
      if v_kind in ('organization', 'user', 'device') then
        raise exception 'platform.knob_index: the % rung is passed through its own parameter, not p_scopes', v_kind
          using errcode = '22023';
      end if;
      if v_id is null then
        raise exception 'platform.knob_index: scope kind % needs the row it applies to', v_kind
          using errcode = '22023';
      end if;
      if s.scope_table is not null then
        if s.scope_row_identity = 'tenant_row' then
          execute format('select organization_id from %I.%I where id = $1 and deleted_at is null',
                         s.scope_schema, s.scope_table)
            into v_owner using v_id;
        elsif s.scope_row_identity = 'platform_taxonomy'
              and s.scope_schema = 'platform' and s.scope_table = 'entity_types' then
          select p_organization_id into v_owner
           where exists (select 1 from platform.entity_types where id = v_id and is_active);
        else
          raise exception 'platform settings: unsupported row identity contract for scope kind %', v_kind
            using errcode = '22023';
        end if;
        if v_owner is distinct from p_organization_id then
          raise exception 'platform.knob_index: that % scope row belongs to a different organization', v_kind
            using errcode = '42501';
        end if;
      end if;

      v_req := v_req || jsonb_build_object(v_kind, v_id);
    end loop;
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'user_id',         p_user_id,
    'device_id',       p_device_id,
    'scopes',          coalesce(p_scopes, '[]'::jsonb),
    'keys', coalesce((
      select jsonb_agg(x order by x ->> 'feature', x ->> 'key')
      from (
        select jsonb_build_object(
          'feature', k.feature,
          'key', k.key,
          'full_key', k.feature || '.' || k.key,
          'label', k.label,
          'description', k.description,
          'value_type', k.value_type,
          'unit', k.unit,
          'allowed_values', k.allowed_values,
          'min_value', k.min_value,
          'max_value', k.max_value,
          'basis', k.basis,
          'set_by', k.set_by,
          'review_due', k.review_due,
          'overridable_by', to_jsonb(k.overridable_by),
          'override_direction', k.override_direction,
          'bound_value', case when k.value_type = 'secret' then null else k.bound_value end,
          'platform_locked', (k.overridable_by = '{}'::text[]),
          'org_locked_kinds', coalesce(to_jsonb(l.locked_kinds), '[]'::jsonb),
          'user_override_locked', ('user' = any (coalesce(l.locked_kinds, '{}'::text[]))),
          'ui', coalesce(k.ui, '{}'::jsonb),
          'propagation', k.propagation,
          'taxonomy', case when t.id is null then null else jsonb_build_object(
              'node_id',      t.id,
              'node_level',   t.level,
              'node_slug',    t.slug,
              'node_name',    t.name,
              'domain_slug',  case t.level when 'domain' then t.slug
                                           when 'feature' then tp.slug
                                           else tg.slug end,
              'domain_name',  case t.level when 'domain' then t.name
                                           when 'feature' then tp.name
                                           else tg.name end,
              'feature_slug', case t.level when 'domain' then null
                                           when 'feature' then t.slug
                                           else tp.slug end,
              'feature_name', case t.level when 'domain' then null
                                           when 'feature' then t.name
                                           else tp.name end) end,
          'platform_default', case when k.value_type = 'secret' then null
                                   else coalesce(k.value, k.default_value) end,
          'shipped_default',  case when k.value_type = 'secret' then null
                                   else k.default_value end,
          'org_override',     case when k.value_type = 'secret' then null
                                   else ch.org_value end,
          'user_override',    case when k.value_type = 'secret' then null
                                   else ch.user_value end,
          'effective_value',  case when k.value_type = 'secret' then null
                                   else coalesce(ch.win_value, k.value, k.default_value) end,
          'secret', case when k.value_type <> 'secret' then null else jsonb_build_object(
              'state', case when coalesce(ch.win_value, k.value) ? 'vault_key'
                            then 'set' else 'not_set' end,
              'vault_key', coalesce(ch.win_value ->> 'vault_key',
                                    k.value ->> 'vault_key',
                                    k.default_value ->> 'vault_key')) end,
          'origin', case
             when ch.win_kind is not null then ch.win_kind
             when k.value_type = 'secret' then 'platform_default'
             when coalesce(k.value, k.default_value) is not null then 'platform_default'
             else 'missing' end,
          'origin_scope_id', ch.win_scope_id,
          'origin_precedence', ch.win_precedence,
          'is_overridden', coalesce(ch.any_set, false),
          'scope_chain', ch.chain,
          'write_rung', case
             when ch.write_kind is not null
               then jsonb_build_object('kind', ch.write_kind, 'scope_id', ch.write_scope_id)
             when v_is_admin
               then jsonb_build_object('kind', 'platform', 'scope_id', null)
             else null end,
          'can_write', case
             when ch.write_kind is null then v_is_admin
             when ch.write_kind = 'user' then (ch.write_scope_id = v_uid or v_is_admin)
             when ch.write_kind = 'device' then true
             else v_is_org_admin end,
          'can_write_reason', case
             when (case when ch.write_kind is null then v_is_admin
                        when ch.write_kind = 'user' then (ch.write_scope_id = v_uid or v_is_admin)
                        when ch.write_kind = 'device' then true
                        else v_is_org_admin end) then null
             when k.overridable_by = '{}'::text[] then 'platform_locked'
             when ch.write_kind is null and coalesce(ch.any_locked, false) then 'org_locked'
             when ch.write_kind is null then 'no_addressable_scope'
             when ch.write_kind = 'user' then 'not_self'
             else 'not_org_admin' end,
          'locked', case
             when k.overridable_by = '{}'::text[] then jsonb_build_object(
                 'by_kind', 'platform',
                 'locked_by', 'platform',
                 'reason', 'platform_locked',
                 'detail', 'This is a platform-controlled setting.')
             when ch.locked_kind is not null then jsonb_build_object(
                 'by_kind', ch.locked_kind,
                 'locked_by', 'organization',
                 'reason', 'org_locked',
                 'detail', 'This organization has turned off ' || ch.locked_kind
                           || '-level control of this setting.')
             else null end,
          'out_of_range', (
            k.value_type in ('number','integer')
            and ch.win_value is not null
            and jsonb_typeof(ch.win_value) = 'number'
            and (   (k.min_value is not null and (ch.win_value #>> '{}')::numeric < k.min_value)
                 or (k.max_value is not null and (ch.win_value #>> '{}')::numeric > k.max_value)))
        ) as x
        from platform.feature_knob k
        left join platform.knob_rung_lock l
          on l.feature = k.feature and l.key = k.key
         and l.organization_id = p_organization_id
        left join platform.taxonomy_node t  on t.id  = k.taxonomy_node_id
        left join platform.taxonomy_node tp on tp.id = t.parent_id
        left join platform.taxonomy_node tg on tg.id = tp.parent_id
        cross join lateral (
          select
            coalesce(jsonb_agg(jsonb_build_object(
                       'kind', r.kind,
                       'precedence', r.precedence,
                       'scope_id', r.scope_id,
                       'value', case when k.value_type = 'secret' then null else r.value end,
                       'is_set', r.is_set,
                       'locked', r.locked,
                       'is_effective', (r.is_set and not r.locked and r.precedence = (
                          select max(r2.precedence) from platform.knob_scope_kind r2
                           where r2.kind = any (k.overridable_by)
                             and not (r2.kind = any (coalesce(l.locked_kinds, '{}'::text[])))
                             and exists (select 1 from platform.knob_override ov2
                                          where ov2.feature = k.feature and ov2.key = k.key
                                            and ov2.organization_id = p_organization_id
                                            and ov2.scope_kind = r2.kind
                                            and ov2.scope_id = (v_req ->> r2.kind)::uuid)))
                     ) order by r.precedence), '[]'::jsonb) as chain,
            (array_agg(r.kind       order by r.precedence desc)
               filter (where r.is_set and not r.locked))[1] as win_kind,
            (array_agg(r.value      order by r.precedence desc)
               filter (where r.is_set and not r.locked))[1] as win_value,
            (array_agg(r.scope_id   order by r.precedence desc)
               filter (where r.is_set and not r.locked))[1] as win_scope_id,
            (array_agg(r.precedence order by r.precedence desc)
               filter (where r.is_set and not r.locked))[1] as win_precedence,
            (array_agg(r.kind       order by r.precedence desc)
               filter (where r.scope_id is not null and not r.locked))[1] as write_kind,
            (array_agg(r.scope_id   order by r.precedence desc)
               filter (where r.scope_id is not null and not r.locked))[1] as write_scope_id,
            (array_agg(r.kind       order by r.precedence desc)
               filter (where r.locked and r.scope_id is not null))[1] as locked_kind,
            bool_or(r.is_set and not r.locked)                as any_set,
            bool_or(r.locked)                                 as any_locked,
            (array_agg(r.value) filter (where r.kind = 'organization'))[1] as org_value,
            (array_agg(r.value) filter (where r.kind = 'user' and not r.locked))[1] as user_value
          from (
            select sk.kind,
                   sk.precedence,
                   (v_req ->> sk.kind)::uuid                              as scope_id,
                   ov.value                                               as value,
                   (ov.value is not null)                                 as is_set,
                   (sk.kind = any (coalesce(l.locked_kinds, '{}'::text[]))) as locked
              from platform.knob_scope_kind sk
              left join platform.knob_override ov
                on ov.feature = k.feature and ov.key = k.key
               and ov.organization_id = p_organization_id
               and ov.scope_kind = sk.kind
               and ov.scope_id = (v_req ->> sk.kind)::uuid
             where sk.kind = any (k.overridable_by)
          ) r
        ) ch
        where (p_feature_prefix is null
               or k.feature = p_feature_prefix
               or k.feature like p_feature_prefix || '.%')
          and (p_feature_prefix is not null or k.overridable_by <> '{}'::text[])
          and k.archived_at is null
      ) rows
      where not p_overridden_only or (x ->> 'is_overridden')::boolean
    ), '[]'::jsonb));
end;
$function$
;
