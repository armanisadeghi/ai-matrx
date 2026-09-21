-- lane: DOORS-ONLY-5
-- based-on: public.saved_view_save(text, uuid, uuid, uuid, text, text, boolean, jsonb, integer, text, boolean, numeric, boolean, integer) 9608fcfa3cc63fd2bb59c92e52354d49c09464a0ecc16d0b93ae88da41f77f5d
-- based-on: public.saved_view_set_default(text, uuid, uuid) 06d372f7a049280dc2277d06c9d4417352c833cad0fe17e4a52907dc85fbdf96
-- based-on: public.saved_view_archive(text, uuid, integer) 55b4ce6c66dc24487729ef9086afe527d5493f0eef7229335ed2d63f4504b3bd
-- 🚨 THE SAME DEFECT DOORS-ONLY-3 WROTE IN CAPITAL LETTERS, ONE LANE LATER.
--
-- The three platform.saved_view doors this lane landed minutes ago cast to
-- `'editor'::permission_level` and `'admin'::permission_level`. That enum lives in `public`,
-- the bodies pin `search_path` to `pg_catalog` (which is right — a SECURITY DEFINER function
-- that inherits the caller's search_path is the classic definer hijack), and plpgsql resolves
-- a type name LAZILY, at first execution. So all three compiled, applied, ledgered, registered
-- their door rows and took their client grants — and then answered
-- `type "permission_level" does not exist` to the first real signed-in caller, in the seated
-- proof, on the CREATE arm's very first update.
--
-- DOORS-ONLY-3 §3 recorded this exact failure on four doors and left the rule in capitals.
-- A lane that had read that rule an hour earlier reproduced it. **So the instance fix is here
-- and the CLASS fix is `scripts/check-door-names-resolve.ts`**, which reads the LIVE body of
-- every function declared in `platform.client_callable_door`, takes the `search_path` each one
-- actually pins, and asks Postgres to resolve every type and function name that body uses
-- under exactly that path. Run against this database before this file, it reported THREE names
-- across 1,618 pinned doors — these three, and nothing else. A rule nobody can execute is not
-- a guard.
--
-- THE FIX IS THE SCHEMA-QUALIFIED TYPE, `public.permission_level`, in all three. The
-- `search_path` pin is unchanged, deliberately. The ladder, the column sets, the surface-key
-- wall and the CAS are byte-identical otherwise.
--
-- ADDITIVE: three CREATE OR REPLACE of functions this lane created minutes ago.
-- Inverse: migrations/inverse/doorsonly5_the_saved_view_doors_qualify_their_types.inverse.sql
-- Guard: `pnpm check:door-names-resolve` (RED before this file, GREEN after), and the seated
--        proof scripts/campaign-tests/doorsonly5_saved_view_doors_work_from_a_seat.sql.

set local lock_timeout = '2s';

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
          or iam.has_access('platform_saved_view', v_row.id, 'editor'::public.permission_level)) then
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
          or iam.has_access('platform_saved_view', v_row.id, 'editor'::public.permission_level)) then
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
          or iam.has_access('platform_saved_view', v_row.id, 'admin'::public.permission_level)) then
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
