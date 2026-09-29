-- based-on: public.get_share_capabilities(text) 97047ff50a2b5a3bdbd94baa6bee1857061ebe399cf290f16aed14736e181a25
--
-- ACCESS LADDER T-13 PHASE 5, matrx-frontend lane 1 (sharing UI): the Share dialog's controls become
-- exactly the Words table's (common-docs/policies/access-ladder.md): "Shown to", "Publish to the web"
-- (+ "Indexed by search engines"), "Anyone with the link" — and none of the row controls on a Private,
-- Confidential or child record. The dialog learns which of them a TYPE carries from this one door.
--
-- ADDITIVE: every key this function already returned is returned unchanged (other callers still read
-- them until their own phase-5 lanes convert). New keys:
--   table_level      the type's level (platform.entity_types.data_class), null when unregistered
--   row_controls     the table carries `published_to_web` — Organization and Public tables only
--                    (guard 2.5a refuses the column anywhere else), never a child
--   shown_to_offered row_controls and the table carries `shown_to`
--   publish_lane     what "Publish to the web" writes for this type:
--                      'published_to_web' — the row's own switch
--                      'card'             — the card's own publish (agent, workflow: the body may
--                                           never be published; owner-session ruling 2026-09-28,
--                                           the card lane is the card's "Published to the web")
--                      'boolean'          — a legacy is_public-style boolean on a table with no row
--                                           controls
--                      null               — this type is never published to the web
create or replace function public.get_share_capabilities(p_resource_type text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_r record;
  v_visibility_column text;
  v_boolean_column text;
  v_org_column text;
  v_oid oid;
  v_body_not_public boolean := false;
  v_level text;
  v_is_component boolean := false;
  v_has_published boolean := false;
  v_has_shown_to boolean := false;
  v_has_card boolean := false;
  v_row_controls boolean;
begin
  select *
  into v_r
  from platform.shareable_resource_registry
  where resource_type = p_resource_type
    and is_active;

  if not found then
    raise exception 'Unknown shareable resource token: %. Pass platform.entity_types.token; bare table names are not accepted.', p_resource_type
      using errcode = 'P0001';
  end if;

  v_oid := to_regclass(format('%I.%I', v_r.schema_name, v_r.table_name));
  if v_oid is not null then
    select exists (
      select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = any (c.conkey)
      where c.conrelid = v_oid
        and c.contype = 'c'
        and a.attname = 'visibility'
        and pg_get_constraintdef(c.oid) ilike '%public%'
    ) into v_body_not_public;
  end if;

  select c.column_name
  into v_visibility_column
  from information_schema.columns as c
  where c.table_schema = v_r.schema_name
    and c.table_name = v_r.table_name
    and c.column_name in ('visibility', 'card_visibility')
    and not (v_body_not_public and c.column_name = 'visibility')
  order by case c.column_name
    when 'visibility' then 0
    when 'card_visibility' then 1
    else 2
  end
  limit 1;

  select c.column_name
  into v_boolean_column
  from information_schema.columns as c
  where c.table_schema = v_r.schema_name
    and c.table_name = v_r.table_name
    and c.column_name = v_r.is_public_column
    and c.data_type = 'boolean'
  limit 1;

  -- THE THING'S OWN HOME (2026-09-26): the Share dialog compares it with the viewer's personal
  -- workspace, so "My organization" / "Add everyone in …" are never offered for a thing whose
  -- only organization is its owner's own — for every kind, not only mandates.
  select c.column_name
  into v_org_column
  from information_schema.columns as c
  where c.table_schema = v_r.schema_name
    and c.table_name = v_r.table_name
    and c.column_name = 'organization_id'
  limit 1;

  -- THE WORDS TABLE'S ROW CONTROLS (T-13 phase 5).
  select et.data_class::text, coalesce(et.is_component, false)
  into v_level, v_is_component
  from platform.entity_types as et
  where et.schema_name = v_r.schema_name
    and et.table_name = v_r.table_name
  limit 1;

  select
    bool_or(c.column_name = 'published_to_web'),
    bool_or(c.column_name = 'shown_to'),
    bool_or(c.column_name = 'card_visibility')
  into v_has_published, v_has_shown_to, v_has_card
  from information_schema.columns as c
  where c.table_schema = v_r.schema_name
    and c.table_name = v_r.table_name
    and c.column_name in ('published_to_web', 'shown_to', 'card_visibility');

  v_row_controls := coalesce(v_has_published, false)
    and not coalesce(v_is_component, false)
    and coalesce(v_level, 'organization') in ('organization', 'public');

  return jsonb_build_object(
    'organization_column', v_org_column,
    'supports_public',
      v_visibility_column is not null or v_boolean_column is not null,
    'is_link_shareable', coalesce(v_r.is_link_shareable, false),
    'public_state_column', coalesce(v_visibility_column, v_boolean_column),
    'public_state_kind', case
      when v_visibility_column is not null then 'enum'
      when v_boolean_column is not null then 'boolean'
      else null
    end,
    'table_level', v_level,
    'row_controls', v_row_controls,
    'shown_to_offered', v_row_controls and coalesce(v_has_shown_to, false),
    'publish_lane', case
      when v_body_not_public and coalesce(v_has_card, false) then 'card'
      when v_body_not_public then null
      when v_row_controls then 'published_to_web'
      when v_boolean_column is not null
        and coalesce(v_level, 'organization') in ('organization', 'public') then 'boolean'
      else null
    end
  );
end;
$function$;
