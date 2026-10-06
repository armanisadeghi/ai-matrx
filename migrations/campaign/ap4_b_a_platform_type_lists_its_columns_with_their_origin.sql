-- chair-step: it re-writes platform._drill_resolve(uuid,text) in place (two keys added to each custom column) and creates platform.entity_columns(uuid,text).
--   The one describer, platform._drill_resolve, is patched by text inside this file: the live body is
--   read with pg_get_functiondef, ONE anchor (asserted to occur exactly once) gains two keys on each
--   custom-field column of a standard table's API description — `choices` (the live words of a choice
--   field, retired ones left out) and `links_to` (the kinds a link field may point at,
--   config.allowed_types) — and the body is executed back. Nothing else in it changes. It then creates
--   platform.entity_columns(uuid, text), declares its platform.client_callable_door row (signed-in
--   callers) and grants it to `authenticated` (platform is an OPEN schema: the grant is this file's
--   decision, as drill_describe's is). No table, trigger, policy or row of anybody's data is touched.
--   The inverse is migrations/inverse/ap4_b_a_platform_type_lists_its_columns_with_their_origin_down.sql.
-- based-on: platform._drill_resolve(uuid,text) d1f86453fb72feca11b66c8a8b6216892c44c10140be1af8e53cdc7178ee4a72
-- lane: AP-4
-- lock: platform
--
-- LANE AP-4 · A PLATFORM TYPE LISTS ITS COLUMNS, EACH WITH ITS ORIGIN (CONTRACTS.md §0 Column, §5).
--
-- THE GAP. No live door answered CONTRACTS §0's `Column` for an entity:
--   { key, label, type, origin: "platform" | "custom", required, choices?, linksTo?, readOnly }.
-- platform.drill_describe (api: true) lists every column the caller may read plus every custom field
-- of every organization whose rows she reads, but a custom CHOICE field arrived without its words
-- (an enum column carried them; a custom one did not), so the Table API, MCP `tables` and any app
-- had to ask a second door — or show a free-text box for a choice.
--
-- THE CLASS FIX, IN THE ONE DESCRIBER. platform._drill_resolve now puts `choices` and `links_to` on a
-- custom column itself, so drill_describe, drill_rows' `columns`, the aidream Table API
-- (StdColumn.choices) and the new door below all gain them from the same place.
--
-- THE DOOR. platform.entity_columns(p_organization_id, p_token) →
--   { token, label, columns: [ { key, label, type, origin, required, readOnly, choices?, linksTo?,
--                                 field_id?, organization_id?, organization? } ] }
-- A thin renaming of drill_describe's answer — never a second describer:
--   · key — a platform column's name; a custom field's stable store key (custom.record.data.key),
--     EXACTLY the key custom.entity_record_read's `custom` object and custom.entity_row_write's
--     `p_custom` are keyed by, so a client reads row._custom[col.key] and writes p_custom[col.key].
--     It is never derived from the label. Keys are per organization (two organizations may each
--     declare `preferred_channel`), so a custom column also says its organization_id: a row's _custom
--     holds its OWN organization's fields.
--   · origin — "custom" for a custom field, "platform" for a real column.
--   · readOnly — true unless the type's API reach is read_write AND the column is writable for this
--     caller (drill_describe's `writable`: the registry's api_writable_columns plus her UPDATE column
--     privilege for a platform column; the type's reach for a custom field — what entity_row_write
--     refuses by name).
--   · required — a custom field's own `required`; a platform column a write must supply: writable,
--     NOT NULL, no default, not identity or generated.
--   · choices / linksTo — from the describer (enum labels, or a custom choice field's live words; a
--     link field's allowed kinds). Absent when the column has none.
-- READ AS THE CALLER: drill_describe judges the organization wall first (platform._drill_reach →
-- custom.assert_client_may_reach; a null organization is the signed-in caller's own context), and it
-- lists only columns she may SELECT and custom fields of organizations she reads. The organization
-- argument is the call's context, never a filter: custom fields come from every organization whose
-- rows she can read. Refusals are drill_describe's own sentences.
--
-- Seat suite: scripts/campaign-tests/ap4_entity_columns_green.sql; red twin
-- scripts/campaign-tests/ap4_entity_columns_red.sql.

set lock_timeout = '4s';

do $ap4$
declare
  c_old constant text := $o$          'unit', v_f.data ->> 'unit')));$o$;
  c_new constant text := $n$          'unit', v_f.data ->> 'unit',
          -- AP-4 (2026-10-06): a custom CHOICE field says its live words and a LINK field the kinds
          -- it may point at, here in the one describer, so every reader of this description
          -- (drill_describe, drill_rows' columns, the Table API, platform.entity_columns) has them.
          'choices', case when v_ft = 'list'
                           and coalesce(nullif(v_f.data ->> 'options_table_id', ''),
                                        nullif(v_f.data -> 'config' ->> 'options_table_id', '')) is not null
                          then (select jsonb_agg(o.value ->> 'label'
                                                 order by (o.value ->> 'position')::integer nulls last, o.value ->> 'label')
                                  from jsonb_each(custom.choice_options(v_f.organization_id,
                                         coalesce(nullif(v_f.data ->> 'options_table_id', ''),
                                                  nullif(v_f.data -> 'config' ->> 'options_table_id', ''))::uuid)) o
                                 where not coalesce((o.value ->> 'retired')::boolean, false)) end,
          'links_to', case when jsonb_typeof(v_f.data -> 'config' -> 'allowed_types') = 'array'
                            and jsonb_array_length(v_f.data -> 'config' -> 'allowed_types') > 0
                           then v_f.data -> 'config' -> 'allowed_types' end)));$n$;
  v_def text := pg_get_functiondef('platform._drill_resolve(uuid,text)'::regprocedure);
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then
    raise exception 'AP-4: platform._drill_resolve carries the custom-column anchor % times, not once; this file was written against another body.', v_n
      using errcode = '55000';
  end if;
  execute replace(v_def, c_old, c_new);
end
$ap4$;

create or replace function platform.entity_columns(
  p_organization_id uuid,
  p_token text
) returns jsonb
  language plpgsql
  stable
  set search_path to 'pg_catalog'
as $function$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_d     jsonb;
  v_api   jsonb;
  v_rw    boolean;
  v_rel   regclass;
  v_cols  jsonb;
begin
  if v_token = '' then
    raise exception 'Name the kind of record whose columns you want, such as party.'
      using errcode = '22023', hint = 'AP-4: platform.entity_columns(organization, ''party'').';
  end if;

  -- THE ONE DESCRIBER: the wall, the token, and every column and custom field this caller may read.
  v_d   := platform.drill_describe(p_organization_id, jsonb_build_object('kind', 'entity', 'token', v_token, 'api', true));
  v_api := v_d -> 'api';
  if v_api is null or jsonb_typeof(v_api -> 'columns') <> 'array' then
    raise exception '"%" is a summary, not a kind of record, so it has no columns to list.', v_token
      using errcode = '22023', hint = 'AP-4: ask platform.drill_describe for a summary''s dimensions and measures.';
  end if;
  v_rw := coalesce(v_api ->> 'reach', 'none') = 'read_write';
  select to_regclass(format('%I.%I', et.schema_name, et.table_name)) into v_rel
    from platform.entity_types et where et.token = v_token;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'key',      case when x.custom then c ->> 'key' else c ->> 'api_name' end,
           'label',    c ->> 'name',
           'type',     c ->> 'type',
           'origin',   case when x.custom then 'custom' else 'platform' end,
           'required', case when x.custom then coalesce((c ->> 'required')::boolean, false)
                            else x.writable and coalesce(att.attnotnull, false) and not coalesce(att.atthasdef, false)
                                 and coalesce(att.attidentity, '') = '' and coalesce(att.attgenerated, '') = '' end,
           'readOnly', not x.writable,
           'choices',  case when jsonb_typeof(c -> 'choices') = 'array' then c -> 'choices' end,
           'linksTo',  case when jsonb_typeof(c -> 'links_to') = 'array' then c -> 'links_to' end,
           'field_id', case when x.custom then substr(c ->> 'api_name', 4) end,
           'organization_id', case when x.custom then c -> 'organization_id' end,
           'organization',    case when x.custom then c -> 'organization' end))
           order by a.o), '[]'::jsonb)
    into v_cols
    from jsonb_array_elements(v_api -> 'columns') with ordinality a(c, o)
    cross join lateral (select coalesce((c ->> 'custom')::boolean, false) as custom,
                               v_rw and coalesce((c ->> 'writable')::boolean, false) as writable) x
    left join pg_attribute att
      on not x.custom and v_rel is not null
     and att.attrelid = v_rel and att.attname = c ->> 'api_name' and att.attnum > 0 and not att.attisdropped;

  return jsonb_build_object('token', v_token, 'label', v_api ->> 'label', 'columns', v_cols);
end
$function$;

comment on function platform.entity_columns(uuid, text) is
  'AP-4: CONTRACTS §0 Column[] for a platform type — its columns (origin platform) and the custom fields of every organization whose rows the caller reads (origin custom, keyed by the store key that entity_record_read.custom and entity_row_write.p_custom use) — a thin renaming of platform.drill_describe, read as the caller. See migrations/campaign/ap4_b_a_platform_type_lists_its_columns_with_their_origin.sql.';

revoke all on function platform.entity_columns(uuid, text) from public, anon;
grant execute on function platform.entity_columns(uuid, text) to authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('platform', 'entity_columns', 'p_organization_id uuid, p_token text',
   array['uuid'::regtype, 'text'::regtype]::oid[],
   'SECURITY INVOKER. A thin renaming of platform.drill_describe(p_organization_id, {kind: entity, token, api: true}), which judges p_organization_id first (platform._drill_reach → custom.assert_client_may_reach; null is the signed-in caller''s own context) and lists only the columns she may SELECT and the custom fields of organizations whose rows she reads. It reads catalogue facts (pg_attribute) for required; it writes nothing.',
   'ap4_b_a_platform_type_lists_its_columns_with_their_origin.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'ap4_b_a_platform_type_lists_its_columns_with_their_origin.sql',
     'declared_at', '2026-10-06 lane AP-4',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'platform.drill_describe decides it first with platform._drill_reach (custom.assert_client_may_reach) — a non-member is refused before anything is read; it is the call''s context, never a filter.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-10-06 lane AP-4 — written with this body'),
       'p_token', jsonb_build_object('type', 'text', 'position', 2, 'entity', 'entity_type',
         'check', 'resolved by platform.drill_describe (an unknown token is refused there by name); a declared summary with no api columns is refused 22023 here.',
         'verified', '2026-10-06 lane AP-4 — written with this body'))))
on conflict do nothing;
