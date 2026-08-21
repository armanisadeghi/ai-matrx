-- share_capabilities_body_not_public.sql
--
-- A "Make public" control must never write a column the DB refuses.
--
-- get_share_capabilities told the client WHICH column holds public/private
-- state, preferring `visibility` over `card_visibility` unconditionally. But a
-- resource whose BODY is banned from being public (agents since 2026-08-12 via
-- agent_definition_body_not_public_chk; workflows since 2026-08-20 via
-- workflow_definition_body_not_public_chk) cannot use `visibility` for that at
-- all — setting it raises check_violation 23514, so the ShareModal's Public tab
-- surfaced a raw constraint error instead of publishing anything.
--
-- For exactly those types the public face is the CARD, so `card_visibility` is
-- the column the control must write. That is the whole ruling in one line:
-- the body is never public, the card is the public face.
--
-- Detected from the constraint itself rather than an allowlist of tables, so
-- any future entity that adopts the body-not-public invariant is handled the
-- day it adds the constraint — no second place to update.

CREATE OR REPLACE FUNCTION public.get_share_capabilities(p_resource_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_r record;
  v_visibility_column text;
  v_boolean_column text;
  v_oid oid;
  v_body_not_public boolean := false;
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

  -- Does a CHECK constraint on this table ban 'public' on the `visibility`
  -- column? If so, `visibility` is not a usable public/private control.
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
    -- The banned column is not a candidate at all.
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

  return jsonb_build_object(
    'supports_public',
      v_visibility_column is not null or v_boolean_column is not null,
    'is_link_shareable', coalesce(v_r.is_link_shareable, false),
    'public_state_column', coalesce(v_visibility_column, v_boolean_column),
    'public_state_kind', case
      when v_visibility_column is not null then 'enum'
      when v_boolean_column is not null then 'boolean'
      else null
    end
  );
end;
$function$;
