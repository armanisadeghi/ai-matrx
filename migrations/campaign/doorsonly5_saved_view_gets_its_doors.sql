-- lane: DOORS-ONLY-5
-- `platform` AND `iam` ARE NOT CLIENT-WRITABLE THROUGH PostgREST. (Chair ruling; VERIFIER-8
-- HIGH-3, 2026-09-21.) DOORS-ONLY closed twenty tables, DOORS-ONLY-2 forty-three more,
-- DOORS-ONLY-3 six, and DOORS-ONLY-4 taught the GENERATOR to stop emitting client write lanes
-- in a doors-only schema. Three tables were left deliberately open, recorded as rows in
-- `platform.doors_only_pending_cutover` so the generator announces them instead of closing
-- them by accident. This is the first of those three.
--
-- platform.saved_view -- ONE TABLE, EVERY LIST SURFACE IN TWO APPS, AND A SURFACE KEY NOBODY
-- CHECKED.
--
-- THE CENSUS, taken the way DOORS-ONLY-2 learned to take it: every file naming this table
-- across matrx-frontend (app, features, lib, components, hooks, scripts) and aidream
-- (apps/dashboard/src, apps/shared) was listed, and then each file was checked for ANY write
-- verb ANYWHERE in it -- not only beside the `.from(`. SEVENTEEN write call sites in five
-- files across two repos:
--
--   matrx-frontend features/crm/saved-views/service.ts            4  (create, update, touch, archive)
--   matrx-frontend features/data-tables/saved-views/service.ts    6  (create, re-define, rename,
--                                                                     clear default, set default, archive)
--   matrx-frontend components/official/table-saved-views-service.ts 2 (create, CAS re-define)
--   aidream        apps/dashboard/src/hooks/use-saved-views.ts    3  (create, CAS update, CAS archive)
--   aidream        apps/dashboard/src/components/data-table/table-saved-views-service.ts 2
--
-- (The register row DOORS-ONLY-4 wrote says "twelve"; that was the matrx-frontend count, and
-- its own parenthetical lists the five aidream sites separately. The real number is 17 and all
-- 17 move in the same commit as this file's refusal policy.)
--
-- 🚨 THE DEFECT A DOOR FIXES AND A GRANT CANNOT. `platform.saved_view` is MULTIPLEXED by
-- `surface_key`: one table holds CRM smart views, data-table views, canonical-table snapshots
-- and the aidream table browser's views. Every policy on it is blind to `surface_key` -- the
-- std_update predicate is `created_by = auth.uid() OR has_access(..., 'editor')` and says
-- nothing at all about which SURFACE a row belongs to. So an editor on one view could move it
-- under another surface's key, or overwrite a row belonging to a surface they have never
-- opened, and every reader of that surface would then parse a definition written for a
-- different one. Each door here takes `p_surface_key` and RESOLVES the row by (id, surface_key)
-- together, so a row under another surface key reads as absent. A table grant cannot express
-- that, and no policy on this table ever has.
--
-- The doors also narrow the writable column set to what the callers actually write:
-- `name`, `description`, `definition`, `definition_version`, `visibility`, `is_default`,
-- `sort_order`, `last_used_at`, and `deleted_at` through its own archive arm. `created_by` is
-- stamped from `auth.uid()` inside the door (the INSERT grant let a browser author a row in
-- somebody else's name as long as the WITH CHECK was the only thing looking), `updated_by` is
-- stamped, and `version`, `metadata`, `custom_fields`, `created_at`, `updated_at` and
-- `organization_id`-on-update are unreachable from a client by construction.
--
-- THE LADDER, read from `pg_policy` on the live database 2026-09-21 and reproduced with the
-- same functions, never paraphrased:
--   std_insert  created_by = auth.uid() AND (organization_id IS NULL OR iam.has_org_access(organization_id))
--   std_update  created_by = auth.uid() OR iam.has_access('platform_saved_view', id, 'editor')
--   std_delete  created_by = auth.uid() OR iam.has_access('platform_saved_view', id, 'admin')
-- (There is no `platform_admin_all` on this table -- checked, not assumed.)
--
-- THE SEARCH-PATH RULE DOORS-ONLY-3 PAID FOR: in a door with a pinned `search_path`, every
-- name that is not in `pg_catalog` is schema-qualified -- types, functions, tables. plpgsql
-- resolves them lazily, so an unqualified `permission_level` compiles, applies and then answers
-- `400 type does not exist` to the first real signed-in caller.
--
-- ADDITIVE. Nothing is dropped, renamed or revoked here.
-- Inverse: migrations/inverse/doorsonly5_saved_view_gets_its_doors.inverse.sql
-- Guard: `pnpm check:doors-only-schemas`, and the seated proof
--        scripts/campaign-tests/doorsonly5_saved_view_doors_work_from_a_seat.sql

set local lock_timeout = '2s';

-- ── the shared shape a caller reads back ───────────────────────────────────────

create or replace function public._saved_view_json(p_row platform.saved_view)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select jsonb_build_object(
    'id', p_row.id, 'name', p_row.name, 'description', p_row.description,
    'surface_key', p_row.surface_key, 'subject_id', p_row.subject_id,
    'definition', p_row.definition, 'definition_version', p_row.definition_version,
    'is_default', p_row.is_default, 'sort_order', p_row.sort_order,
    'organization_id', p_row.organization_id, 'created_by', p_row.created_by,
    'updated_by', p_row.updated_by, 'created_at', p_row.created_at,
    'updated_at', p_row.updated_at, 'deleted_at', p_row.deleted_at,
    'version', p_row.version, 'visibility', p_row.visibility,
    'last_used_at', p_row.last_used_at, 'metadata', p_row.metadata,
    'custom_fields', p_row.custom_fields);
$fn$;

comment on function public._saved_view_json(platform.saved_view) is
  'DOORS-ONLY-5: the row shape every platform.saved_view door returns. Not a door: it is a pure projection with no client EXECUTE grant, so it is never registered in platform.client_callable_door.';

-- ── public.saved_view_save ─────────────────────────────────────────────────────

create or replace function public.saved_view_save(
  p_surface_key text,
  p_id uuid default null,
  p_subject_id uuid default null,
  p_organization_id uuid default null,
  p_name text default null,
  p_description text default null,
  p_set_description boolean default false,
  p_definition jsonb default null,
  p_definition_version integer default null,
  p_visibility text default null,
  p_is_default boolean default null,
  p_sort_order numeric default null,
  p_touch boolean default false,
  p_expected_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.saved_view;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_vis platform.visibility;
begin
  if v_actor is null then
    raise exception 'saved_view_save: a saved view belongs to the person who saved it, and nobody is signed in.'
      using errcode = '42501';
  end if;
  if coalesce(btrim(p_surface_key), '') = '' then
    raise exception 'saved_view_save: name the surface this view belongs to.' using errcode = '22004';
  end if;
  if p_visibility is not null then
    -- Qualified, and validated here rather than by a cast error the caller cannot read.
    begin
      v_vis := p_visibility::platform.visibility;
    exception when others then
      raise exception 'saved_view_save: % is not a sharing level. Use personal, internal, link or public.', p_visibility
        using errcode = '22023';
    end;
  end if;
  if p_definition is not null and jsonb_typeof(p_definition) is distinct from 'object' then
    raise exception 'saved_view_save: the definition of a view is an object.' using errcode = '22023';
  end if;

  -- ── CREATE ──
  if p_id is null then
    if v_name is null then
      raise exception 'saved_view_save: name the view so the team can find it again.' using errcode = '22004';
    end if;
    if p_organization_id is null then
      raise exception 'saved_view_save: name the organization this view belongs to.' using errcode = '22004';
    end if;
    -- THE LADDER. The question std_insert asked: this person may act in this organization.
    if not iam.has_org_access(p_organization_id) then
      raise exception 'saved_view_save: % is not an organization you can save a view in.', p_organization_id
        using errcode = '42501';
    end if;

    if coalesce(p_is_default, false) then
      -- One default per person per surface per subject is a PARTIAL UNIQUE INDEX, so the
      -- clear has to happen first or the database refuses the insert. Doing both inside the
      -- door makes that ordering impossible to get wrong, which is the bug the two-statement
      -- client version could always have.
      update platform.saved_view s
         set is_default = false, updated_by = v_actor
       where s.created_by = v_actor
         and s.surface_key = p_surface_key
         and s.subject_id is not distinct from p_subject_id
         and s.is_default
         and s.deleted_at is null;
    end if;

    insert into platform.saved_view
      (name, description, surface_key, subject_id, organization_id, definition,
       definition_version, visibility, is_default, sort_order, last_used_at, created_by)
    values
      (v_name,
       case when p_set_description then nullif(btrim(coalesce(p_description, '')), '') else null end,
       p_surface_key, p_subject_id, p_organization_id,
       coalesce(p_definition, '{}'::jsonb),
       coalesce(p_definition_version, 1),
       coalesce(v_vis, 'personal'::platform.visibility),
       coalesce(p_is_default, false),
       p_sort_order,
       case when p_touch then now() else null end,
       v_actor)
    returning * into v_row;

    return public._saved_view_json(v_row);
  end if;

  -- ── UPDATE ──
  -- RESOLVED BY (id, surface_key) TOGETHER. A row under another surface key reads as absent:
  -- a door never tells a caller that somebody else's row exists, and a view saved for one
  -- list surface must never be writable from another.
  select * into v_row
    from platform.saved_view s
   where s.id = p_id and s.surface_key = p_surface_key and s.deleted_at is null;
  if not found then
    return null;
  end if;

  -- THE LADDER. The exact predicate std_update carried.
  if not (v_row.created_by = v_actor
          or iam.has_access('platform_saved_view', v_row.id, 'editor'::permission_level)) then
    raise exception 'saved_view_save: this view is not yours to change.' using errcode = '42501';
  end if;

  if p_expected_version is not null and v_row.version <> p_expected_version then
    -- A version miss is NULL, not an error: the caller re-reads and replays, exactly as the
    -- client's guardedUpdate already does.
    return null;
  end if;

  if coalesce(p_is_default, false) and not v_row.is_default then
    update platform.saved_view s
       set is_default = false, updated_by = v_actor
     where s.created_by = v_row.created_by
       and s.surface_key = v_row.surface_key
       and s.subject_id is not distinct from v_row.subject_id
       and s.id <> v_row.id
       and s.is_default
       and s.deleted_at is null;
  end if;

  update platform.saved_view s
     set name = coalesce(v_name, s.name),
         description = case when p_set_description
                            then nullif(btrim(coalesce(p_description, '')), '')
                            else s.description end,
         definition = coalesce(p_definition, s.definition),
         definition_version = coalesce(p_definition_version, s.definition_version),
         visibility = coalesce(v_vis, s.visibility),
         is_default = coalesce(p_is_default, s.is_default),
         sort_order = coalesce(p_sort_order, s.sort_order),
         last_used_at = case when p_touch then now() else s.last_used_at end,
         updated_by = v_actor
   where s.id = v_row.id
     and s.surface_key = p_surface_key
     and s.deleted_at is null
     and (p_expected_version is null or s.version = p_expected_version)
  returning * into v_row;

  if not found then
    return null;
  end if;
  return public._saved_view_json(v_row);
end;
$fn$;

comment on function public.saved_view_save(text, uuid, uuid, uuid, text, text, boolean, jsonb, integer, text, boolean, numeric, boolean, integer) is
  'DOORS-ONLY-5: the ONE door onto platform.saved_view for creating and changing a view, for every list surface in both apps. It resolves the row by (id, surface_key) TOGETHER, so a view saved under another surface key reads as absent -- the multiplexing this table has always had and no policy on it has ever looked at. created_by is stamped from auth.uid(); version, metadata, custom_fields and organization_id-on-update are unreachable. p_expected_version is an optional CAS whose miss returns NULL so the caller re-reads and replays. Setting is_default clears the caller`s previous default in the same statement pair, in the order the partial unique index requires. The ladder is the exact predicate std_insert / std_update carried.';

-- ── public.saved_view_set_default ──────────────────────────────────────────────

create or replace function public.saved_view_set_default(
  p_surface_key text,
  p_subject_id uuid default null,
  p_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.saved_view;
  v_cleared integer;
begin
  if v_actor is null then
    raise exception 'saved_view_set_default: nobody is signed in.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_surface_key), '') = '' then
    raise exception 'saved_view_set_default: name the surface.' using errcode = '22004';
  end if;

  -- CLEAR FIRST, ALWAYS. The partial unique index is per (created_by, surface_key, subject),
  -- so the clear is scoped to the caller's own rows -- which is also narrower than what the
  -- client's two statements did, where an org editor cleared other people's defaults.
  update platform.saved_view s
     set is_default = false, updated_by = v_actor
   where s.created_by = v_actor
     and s.surface_key = p_surface_key
     and s.subject_id is not distinct from p_subject_id
     and s.is_default
     and s.deleted_at is null;
  get diagnostics v_cleared = row_count;

  if p_id is null then
    return jsonb_build_object('cleared', v_cleared, 'default_id', null);
  end if;

  select * into v_row
    from platform.saved_view s
   where s.id = p_id and s.surface_key = p_surface_key and s.deleted_at is null;
  if not found then
    return null;
  end if;

  if not (v_row.created_by = v_actor
          or iam.has_access('platform_saved_view', v_row.id, 'editor'::permission_level)) then
    raise exception 'saved_view_set_default: this view is not yours to change.' using errcode = '42501';
  end if;

  update platform.saved_view s
     set is_default = true, updated_by = v_actor
   where s.id = v_row.id and s.surface_key = p_surface_key and s.deleted_at is null
  returning * into v_row;

  return jsonb_build_object('cleared', v_cleared, 'default_id', v_row.id,
                            'view', public._saved_view_json(v_row));
end;
$fn$;

comment on function public.saved_view_set_default(text, uuid, uuid) is
  'DOORS-ONLY-5: the door that makes one platform.saved_view the default for a surface and subject. Clearing the previous default and setting the new one are ONE statement pair inside the database, in the order the partial unique index requires -- the client did it in two round trips and could leave no default at all if the second failed. p_id NULL clears without setting. The clear is scoped to the caller`s own rows, which the index is keyed on.';

-- ── public.saved_view_archive ──────────────────────────────────────────────────

create or replace function public.saved_view_archive(
  p_surface_key text,
  p_id uuid,
  p_expected_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.saved_view;
begin
  if v_actor is null then
    raise exception 'saved_view_archive: nobody is signed in.' using errcode = '42501';
  end if;
  if p_id is null or coalesce(btrim(p_surface_key), '') = '' then
    raise exception 'saved_view_archive: name the view and its surface.' using errcode = '22004';
  end if;

  select * into v_row
    from platform.saved_view s
   where s.id = p_id and s.surface_key = p_surface_key and s.deleted_at is null;
  if not found then
    return null;
  end if;

  -- THE LADDER. std_delete's predicate -- the ADMIN rung, not the editor one. Archiving is
  -- its own arm at its own rung: it is not a key of the edit patch, which is the defect
  -- DOORS-ONLY-3 closed on platform.flexible_data.
  if not (v_row.created_by = v_actor
          or iam.has_access('platform_saved_view', v_row.id, 'admin'::permission_level)) then
    raise exception 'saved_view_archive: this view is not yours to remove.' using errcode = '42501';
  end if;

  if p_expected_version is not null and v_row.version <> p_expected_version then
    return null;
  end if;

  update platform.saved_view s
     set deleted_at = now(), is_default = false, updated_by = v_actor
   where s.id = v_row.id
     and s.surface_key = p_surface_key
     and s.deleted_at is null
     and (p_expected_version is null or s.version = p_expected_version)
  returning * into v_row;

  if not found then
    return null;
  end if;
  return public._saved_view_json(v_row);
end;
$fn$;

comment on function public.saved_view_archive(text, uuid, integer) is
  'DOORS-ONLY-5: the SOFT delete of a platform.saved_view -- the query leaves the bar, the records are untouched. It is its own door at std_delete`s ADMIN rung rather than a `deleted_at` key inside the edit patch, so nobody at the editor rung can archive a view by putting a timestamp in an object. It also clears is_default, so archiving the default never leaves a surface pointing at a trashed row. Resolved by (id, surface_key) together; an optional CAS returns NULL on a miss.';

-- ── the register, in the same transaction ──────────────────────────────────────
-- A SECURITY DEFINER function reaching COMMIT without a platform.client_callable_door row is
-- refused by the `provision_shape_guard` event trigger (23514).

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'public', p.proname, pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes), true, false,
       'migrations/campaign/doorsonly5_saved_view_gets_its_doors.sql (lane DOORS-ONLY-5)',
       case p.proname
         when 'saved_view_save' then
           'p_surface_key is required and the row is resolved by (id, surface_key) TOGETHER, so a view saved under another surface key reads as absent -- platform.saved_view is multiplexed by surface_key and no policy on it has ever looked at that. On create, p_organization_id is put to iam.has_org_access and NULL is refused; created_by is stamped from auth.uid(), never taken from the caller. On update the ladder is the exact predicate std_update carried: created_by, or editor on the view. It writes name, description, definition, definition_version, visibility, is_default, sort_order, last_used_at and updated_by, and NOTHING else -- version, metadata, custom_fields, created_by, created_at and organization_id are unreachable. p_expected_version is a CAS whose miss returns NULL and writes nothing.'
         when 'saved_view_set_default' then
           'p_surface_key is required. The clear is scoped to the caller''s OWN rows, which is what the partial unique index is keyed on, and runs before the set in the same transaction -- the client did it in two round trips and could leave a surface with no default when the second failed. The row being set is resolved by (id, surface_key) and then put to the same ladder std_update carried. It writes is_default and updated_by and nothing else.'
         else
           'p_surface_key is required and the row is resolved by (id, surface_key) together. The ladder is the predicate std_delete carried -- created_by, or ADMIN on the view -- deliberately a higher rung than the edit door, so nobody at the editor rung can archive a view. It writes deleted_at, is_default (cleared, so a surface never points at a trashed default) and updated_by. p_expected_version is a CAS whose miss returns NULL.'
       end
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('saved_view_save', 'saved_view_set_default', 'saved_view_archive')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

select platform.reopen_declared_doors('public');

-- The client EXECUTE grants. `public` is an OPEN schema, so the grant is the migration's own
-- job, issued AFTER the door row exists: the `enforce_definer_client_grants` event trigger
-- then reads the row, sees `signed_in_callers`, and KEEPS the grant instead of taking it back.
grant execute on function public.saved_view_save(text, uuid, uuid, uuid, text, text, boolean, jsonb, integer, text, boolean, numeric, boolean, integer) to authenticated;
grant execute on function public.saved_view_set_default(text, uuid, uuid) to authenticated;
grant execute on function public.saved_view_archive(text, uuid, integer) to authenticated;
