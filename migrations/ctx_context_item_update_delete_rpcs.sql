-- migrations/ctx_context_item_update_delete_rpcs.sql
--
-- Lane F (context-core teardown, W8): the last two mutation doors of the
-- sanctioned context write family. `create_context_item` already exists as a
-- SECURITY DEFINER RPC (org-admin checked inside); the definitional UPDATE and
-- soft-archive DELETE paths, however, only existed as direct RLS table writes
-- in the legacy `features/scope-system/redux/contextItemsSlice.ts`. Per the
-- ratified HYBRID ruling (common-docs npm-package-extraction DECISIONS.md C17,
-- 2026-08-29): reads stay direct RLS-backed table reads; WRITES go through
-- SECURITY DEFINER RPCs of the set_context_value family. These two complete
-- that family for context item definitions.
--
-- Family style (matches update_scope_type / create_context_item):
--   * act on an existing row by id — the org is the row's own scope type's
--     org, resolved inside and access-checked (no caller-chosen org for an
--     update of an existing row; nothing here ever ASSIGNS an org).
--   * authz: service_role OR iam.has_org_admin(row org) — identical bar to
--     create_context_item.
--   * return to_jsonb(row) so the client folds the authoritative row back
--     into its cache.
--
-- §6d-4: both doors are declared in platform.client_callable_door BEFORE the
-- GRANT, in this same migration. Idempotent (CREATE OR REPLACE + door upsert).

-- ── Doors first (the guard revokes undeclared definer grants) ─────────────

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason)
values
  ('public', 'update_context_item',
   'p_item_id uuid, p_display_name text, p_description text, p_category text, p_value_type context_value_type, p_fetch_hint context_fetch_hint, p_sensitivity context_sensitivity, p_tags text[], p_sort_order smallint, p_status context_item_status, p_status_note text',
   'ctx_context_item_update_delete_rpcs',
   'Org admins edit a context item definition (rename, description, type, ordering) on their own org''s scope types; the function resolves the item''s org itself and requires iam.has_org_admin on it.')
on conflict (schema_name, function_name, identity_args) do update
  set declared_by = excluded.declared_by,
      reason = excluded.reason,
      declared_at = now();

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason)
values
  ('public', 'delete_context_item', 'p_item_id uuid',
   'ctx_context_item_update_delete_rpcs',
   'Org admins archive (is_active=false, values retained) a context item on their own org''s scope types; org resolved from the row and checked via iam.has_org_admin.')
on conflict (schema_name, function_name, identity_args) do update
  set declared_by = excluded.declared_by,
      reason = excluded.reason,
      declared_at = now();

-- ── update_context_item ───────────────────────────────────────────────────

create or replace function public.update_context_item(
  p_item_id uuid,
  p_display_name text default null,
  p_description text default null,
  p_category text default null,
  p_value_type public.context_value_type default null,
  p_fetch_hint public.context_fetch_hint default null,
  p_sensitivity public.context_sensitivity default null,
  p_tags text[] default null,
  p_sort_order smallint default null,
  p_status public.context_item_status default null,
  p_status_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
    raise exception 'active context item % not found', p_item_id
      using errcode = 'P0002';
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

-- ── delete_context_item (soft archive — values retained) ──────────────────

create or replace function public.delete_context_item(
  p_item_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
    raise exception 'active context item % not found', p_item_id
      using errcode = 'P0002';
  end if;

  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for %', v_org
      using errcode = '42501';
  end if;

  -- Same semantics the legacy client write used: hide from active catalogs,
  -- retain every stored value for recovery. Not a hard delete, not deleted_at.
  update context.context_items
     set is_active = false,
         updated_at = now()
   where id = p_item_id
  returning jsonb_build_object('id', id, 'is_active', is_active) into v_result;

  return v_result;
end;
$function$;

-- ── Grants (doors are declared above, so these stick) ─────────────────────

revoke all on function public.update_context_item(uuid, text, text, text, public.context_value_type, public.context_fetch_hint, public.context_sensitivity, text[], smallint, public.context_item_status, text) from public;
revoke all on function public.update_context_item(uuid, text, text, text, public.context_value_type, public.context_fetch_hint, public.context_sensitivity, text[], smallint, public.context_item_status, text) from anon;
grant execute on function public.update_context_item(uuid, text, text, text, public.context_value_type, public.context_fetch_hint, public.context_sensitivity, text[], smallint, public.context_item_status, text) to authenticated;
grant execute on function public.update_context_item(uuid, text, text, text, public.context_value_type, public.context_fetch_hint, public.context_sensitivity, text[], smallint, public.context_item_status, text) to service_role;

revoke all on function public.delete_context_item(uuid) from public;
revoke all on function public.delete_context_item(uuid) from anon;
grant execute on function public.delete_context_item(uuid) to authenticated;
grant execute on function public.delete_context_item(uuid) to service_role;
