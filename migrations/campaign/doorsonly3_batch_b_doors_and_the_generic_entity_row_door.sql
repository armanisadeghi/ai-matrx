-- lane: DOORS-ONLY-3
-- `platform` AND `iam` ARE NOT CLIENT-WRITABLE THROUGH PostgREST. (Chair ruling; VERIFIER-8
-- HIGH-3.) Batch B: `iam.organizations`, `iam.organization_preferences`,
-- `platform.flexible_data` -- and THE GENERIC WRITER that has been quietly broken on every
-- table this campaign has already closed.
--
-- ══ 1. THE FINDING THAT IS BIGGER THAN THESE THREE TABLES ══════════════════════════════════
--
-- `@ai-matrx/associations`' `entityRows.ts` writes ANY registered entity table by token:
-- `dataSource.schema(info.schema).from(info.table).insert({ [titleColumn]: title, created_by,
-- organization_id })`, with `info` coming from the generated registry. One call site reaches it
-- -- the reference picker's "create a new one" -- and it is generic over all 650 tokens.
--
-- So EVERY table DOORS-ONLY and DOORS-ONLY-2 closed also closed that generic path, silently,
-- for its token. Nobody noticed because the call site is a picker affordance and the failure is
-- a 42501 in a toast. Closing three more tables one at a time would have added three more.
--
-- THE CLASS FIX IS A GENERIC DOOR, not three specific ones: `public.entity_row_create` and
-- `public.entity_row_rename` resolve the table from `platform.entity_types` -- the same registry
-- the package's generated file is emitted from -- and decide on the one ladder. The frontend's
-- seam (`features/scopes/service/entityRows.ts`) routes every token through them, so the fix
-- lands for all 44 tables already closed as well as for these three, with no package release in
-- between.
--
-- AND IT REFUSES TWO THINGS THE DIRECT PATH DID NOT, by name rather than by accident:
--   · a token whose table has no `organization_id` column. `iam.organizations` is exactly that
--     table, and the generic path has been sending it `organization_id` and getting
--     `42703 column does not exist` for as long as the picker has passed an org -- a dead path
--     that read as a working feature. A door that cannot express "create an organization"
--     should say so; creating one is `public.org_create`, which exists.
--   · a token whose `audit_class` is `machinery`. Access machinery owns the inputs the access
--     resolver consumes; a generic "make me a row" affordance must never reach it.
--
-- ══ 2. THE THREE TABLES ════════════════════════════════════════════════════════════════════
--
--   iam.organizations             `public.org_update`, plus the archive door that ALREADY
--     EXISTS. Four client writers: `features/organizations/service.ts` (update + a HARD
--     `delete()`), `features/agent-context/service/hierarchyService.ts` and
--     `redux/organizationsSlice.ts` (both passing a patch through UNFILTERED). The door takes a
--     patch and reads SEVEN keys out of it -- name, abbreviation, description, logo_url,
--     logo_file_id, website, settings -- so `is_personal`, `created_by`, `slug` and every other
--     column stop being reachable from a browser whatever a caller puts in the object.
--     🚨 THE HARD DELETE IS NOT REPLACED BY A DELETE. `iam.organization_archive(p_org,
--     p_confirm_name, p_reason)` already existed and is what the delete becomes: archive
--     everything important, never destroy it. A `DELETE` on an organization takes its
--     memberships, its data and its audit trail with it, and there is no way back.
--
--   iam.organization_preferences  `public.org_preferences_set`. Four upserts in ONE file,
--     `features/organizations/hooks/useOrgAutoRagPreference.ts`, each writing one flag. The
--     door takes a patch of the five preference columns and NOTHING else -- which matters
--     because three of this table's columns are a live SPEND LEDGER
--     (`daily_auto_rag_cost_used_usd`, `daily_auto_rag_window_start`, and the budget it is
--     compared against), written by aidream's `services/auto_ingest/budget.py` and
--     `cost_recording.py`. The base-table UPDATE grant let a browser zero its own consumed
--     cost and roll its own window, which is the whole budget. The door writes the budget
--     CEILING and the flags; the consumed-cost columns are unreachable from a client.
--
--   platform.flexible_data        `public.flexible_data_write` and `flexible_data_archive`.
--     One writer file, `features/content-ir/registry/schema-source-flexible-data.ts`: an
--     insert, an update, and a third "update" that is a soft delete setting `deleted_at`. The
--     third gets its own door arm, because an archive is a different act from an edit and a
--     door that lets a caller set `deleted_at` in a patch is a delete wearing an edit's name.
--
-- ══ 3. THE LADDER, PER DOOR ════════════════════════════════════════════════════════════════
-- Read from `pg_policy` on the live database 2026-09-21, and reproduced with the same
-- functions:
--   iam.organizations             update  platform admin OR iam.is_org_manager(id, auth.uid())
--   iam.organization_preferences  all     platform admin OR public.is_org_admin(organization_id)
--   platform.flexible_data        insert  created_by = auth.uid() AND has_org_access(org)
--                                 update  created_by = auth.uid() OR has_access(token,id,editor)
-- `created_by` is stamped from `auth.uid()` inside every door, never taken from the caller.
--
-- 🚨 EVERY NAME THAT IS NOT IN `pg_catalog` IS SCHEMA-QUALIFIED. These bodies pin
-- `search_path = pg_catalog`, and plpgsql resolves type and function names LAZILY, at first
-- execution -- so an unqualified `permission_level` or `is_platform_admin` compiles, applies,
-- ledgers, passes every static check in both repos, and then answers 400/404 to the first real
-- caller. Batch A shipped that defect twice in twenty minutes and the seated probe is the only
-- thing that caught it. Hence `public.permission_level`, `public.is_platform_admin()`,
-- `public.is_org_admin()` written out in full.
--
-- ADDITIVE. Nothing dropped, renamed or revoked; the refusal policies are separate files.
-- Inverse: migrations/inverse/doorsonly3_batch_b_doors_and_the_generic_entity_row_door.inverse.sql
-- Guard: scripts/access-matrix/check-doorsonly3-batch-b.ts -- every door called from a seat.

set local lock_timeout = '2s';

-- ── the generic entity-row door ────────────────────────────────────────────────

create or replace function public.entity_row_create(
  p_token text,
  p_title text,
  p_organization_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_et    record;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'entity_row_create: nobody is signed in.' using errcode = '42501';
  end if;
  if v_title is null then
    raise exception 'entity_row_create: a new % needs a name.', coalesce(p_token, 'record')
      using errcode = '22004';
  end if;
  if p_organization_id is null then
    raise exception 'entity_row_create: name the organization this belongs to.'
      using errcode = '22004';
  end if;
  if not iam.has_org_access(p_organization_id) then
    raise exception 'entity_row_create: % is not an organization you can act in.', p_organization_id
      using errcode = '42501';
  end if;

  select et.schema_name, et.table_name, et.title_column, et.audit_class, et.label
    into v_et
    from platform.entity_types et
   where et.token = p_token and et.is_active and et.reference_pickable;
  if not found then
    raise exception 'entity_row_create: % is not a reference-pickable entity.', p_token
      using errcode = '22023',
            hint = 'Only an active, reference-pickable token in platform.entity_types can be created from a picker.';
  end if;
  if v_et.title_column is null then
    raise exception 'entity_row_create: a % has no single name column, so it cannot be created from a name alone.', coalesce(v_et.label, p_token)
      using errcode = '22023';
  end if;
  -- ACCESS MACHINERY IS NEVER REACHED BY A GENERIC "MAKE ME A ROW".
  if coalesce(v_et.audit_class, 'entity') = 'machinery' then
    raise exception 'entity_row_create: % is access machinery and is never created from a picker.', coalesce(v_et.label, p_token)
      using errcode = '42501';
  end if;
  -- 🚨 A TABLE WITH NO `organization_id` CANNOT CARRY ONE, and the direct path has been
  -- sending it anyway and getting 42703. `iam.organizations` is that table: creating an
  -- organization is `public.org_create`, which asks a different set of questions.
  if not exists (select 1 from information_schema.columns c
                  where c.table_schema = v_et.schema_name
                    and c.table_name = v_et.table_name
                    and c.column_name = 'organization_id') then
    raise exception 'entity_row_create: a % is not something that lives inside an organization, so it cannot be created here.', coalesce(v_et.label, p_token)
      using errcode = '22023',
            hint = 'An organization itself is created with public.org_create.';
  end if;

  execute format(
    'insert into %I.%I (%I, created_by, organization_id) values ($1, $2, $3) returning id',
    v_et.schema_name, v_et.table_name, v_et.title_column)
    into v_id using v_title, v_actor, p_organization_id;

  return jsonb_build_object('id', v_id, 'title', v_title, 'token', p_token);
end;
$fn$;

comment on function public.entity_row_create(text, text, uuid) is
  'DOORS-ONLY-3: THE generic door for "create a new one" from a reference picker, over any active reference-pickable token in platform.entity_types. It replaces the direct base-table insert in @ai-matrx/associations'' entityRows.ts, which every table this campaign closed had silently broken. It decides on the one ladder (iam.has_org_access), stamps created_by from auth.uid(), and refuses by name a token that is access machinery or whose table has no organization_id column -- the second of which is iam.organizations, where the direct path had been returning 42703 for as long as the picker passed an org.';

create or replace function public.entity_row_rename(
  p_token text,
  p_id uuid,
  p_title text
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_et    record;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_org   uuid;
  v_owner uuid;
begin
  if v_actor is null then
    raise exception 'entity_row_rename: nobody is signed in.' using errcode = '42501';
  end if;
  if v_title is null or p_id is null then
    raise exception 'entity_row_rename: name the row and the new name.' using errcode = '22004';
  end if;

  select et.schema_name, et.table_name, et.title_column, et.audit_class, et.label
    into v_et
    from platform.entity_types et
   where et.token = p_token and et.is_active and et.reference_pickable;
  if not found or v_et.title_column is null
     or coalesce(v_et.audit_class, 'entity') = 'machinery' then
    raise exception 'entity_row_rename: % cannot be renamed through this door.', p_token
      using errcode = '22023';
  end if;
  if not exists (select 1 from information_schema.columns c
                  where c.table_schema = v_et.schema_name
                    and c.table_name = v_et.table_name
                    and c.column_name = 'organization_id') then
    raise exception 'entity_row_rename: a % is not something that lives inside an organization.', coalesce(v_et.label, p_token)
      using errcode = '22023';
  end if;

  execute format('select organization_id, created_by from %I.%I where id = $1',
                 v_et.schema_name, v_et.table_name)
    into v_org, v_owner using p_id;
  if v_org is null then
    -- Absent, or in an organization this caller cannot see: a door never tells a caller
    -- that somebody else's row exists.
    raise exception 'entity_row_rename: there is no such % here.', coalesce(v_et.label, p_token)
      using errcode = '23503';
  end if;
  if not iam.has_org_access(v_org) then
    raise exception 'entity_row_rename: there is no such % here.', coalesce(v_et.label, p_token)
      using errcode = '23503';
  end if;
  if not (v_owner = v_actor
          or iam.has_access(p_token, p_id, 'editor'::public.permission_level)
          or public.is_platform_admin()) then
    raise exception 'entity_row_rename: this % is not yours to rename.', coalesce(v_et.label, p_token)
      using errcode = '42501';
  end if;

  execute format('update %I.%I set %I = $1, updated_by = $2 where id = $3',
                 v_et.schema_name, v_et.table_name, v_et.title_column)
    using v_title, v_actor, p_id;

  return jsonb_build_object('id', p_id, 'title', v_title, 'token', p_token);
end;
$fn$;

comment on function public.entity_row_rename(text, uuid, text) is
  'DOORS-ONLY-3: the rename half of the generic reference-picker door. Resolves the table and its title column from platform.entity_types, reads the row''s own organization as the definer, refuses an unreachable row as ABSENT rather than as forbidden, and then asks the same question std_update asked: created_by, editor on the row, or a platform admin.';

-- ── iam.organizations ──────────────────────────────────────────────────────────

create or replace function public.org_update(
  p_org_id uuid,
  p_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row iam.organizations;
begin
  if v_actor is null then
    raise exception 'org_update: nobody is signed in.' using errcode = '42501';
  end if;
  if p_org_id is null or jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'org_update: name the organization and pass an object of changes.'
      using errcode = '22004';
  end if;

  -- THE LADDER. The predicate `org_update_policy` carried.
  if not (public.is_platform_admin() or iam.is_org_manager(p_org_id, v_actor)) then
    raise exception 'org_update: you are not a manager of this organization.'
      using errcode = '42501';
  end if;

  -- SEVEN KEYS, READ OUT OF THE PATCH. Everything else a caller puts in the object is
  -- ignored: `is_personal`, `created_by`, `slug` and the rest are not reachable from a
  -- browser at all. Two of the three callers passed their patch through UNFILTERED.
  update iam.organizations o
     set name          = coalesce(nullif(btrim(coalesce(p_patch ->> 'name', '')), ''), o.name),
         abbreviation  = case when p_patch ? 'abbreviation' then nullif(btrim(coalesce(p_patch ->> 'abbreviation', '')), '') else o.abbreviation end,
         description   = case when p_patch ? 'description'  then p_patch ->> 'description'  else o.description end,
         logo_url      = case when p_patch ? 'logo_url'     then p_patch ->> 'logo_url'     else o.logo_url end,
         logo_file_id  = case when p_patch ? 'logo_file_id' then nullif(p_patch ->> 'logo_file_id', '')::uuid else o.logo_file_id end,
         website       = case when p_patch ? 'website'      then p_patch ->> 'website'      else o.website end,
         settings      = case when jsonb_typeof(p_patch -> 'settings') = 'object' then p_patch -> 'settings' else o.settings end
   where o.id = p_org_id
  returning * into v_row;

  if not found then
    raise exception 'org_update: there is no such organization here.' using errcode = '23503';
  end if;
  return jsonb_build_object('id', v_row.id, 'name', v_row.name, 'slug', v_row.slug);
end;
$fn$;

comment on function public.org_update(uuid, jsonb) is
  'DOORS-ONLY-3: the door onto iam.organizations for editing one. It reads SEVEN keys out of the patch -- name, abbreviation, description, logo_url, logo_file_id, website, settings -- and ignores everything else, so is_personal, created_by and slug stop being reachable from a browser whatever a caller puts in the object; two of the three callers passed their patch through unfiltered. The ladder is the predicate org_update_policy carried: platform admin, or iam.is_org_manager. Deleting an organization is iam.organization_archive, never a DELETE.';

-- ── iam.organization_preferences ───────────────────────────────────────────────

create or replace function public.org_preferences_set(
  p_organization_id uuid,
  p_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row iam.organization_preferences;
  v_budget numeric;
begin
  if v_actor is null then
    raise exception 'org_preferences_set: nobody is signed in.' using errcode = '42501';
  end if;
  if p_organization_id is null or jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'org_preferences_set: name the organization and pass an object of changes.'
      using errcode = '22004';
  end if;

  -- THE LADDER. The predicate `admin_insert` / `admin_update` carried.
  if not (public.is_platform_admin() or public.is_org_admin(p_organization_id)) then
    raise exception 'org_preferences_set: only an organization admin sets these.'
      using errcode = '42501';
  end if;

  if p_patch ? 'daily_auto_rag_budget_usd' then
    v_budget := nullif(p_patch ->> 'daily_auto_rag_budget_usd', '')::numeric;
    if v_budget is null or v_budget < 0 then
      raise exception 'org_preferences_set: a daily budget is a number of dollars, zero or more.'
        using errcode = '22023';
    end if;
  end if;

  -- 🚨 THE CEILING, NEVER THE METER. `daily_auto_rag_cost_used_usd` and
  -- `daily_auto_rag_window_start` are a live spend ledger written by aidream's auto-ingest
  -- budget code; the base-table UPDATE grant let a browser zero its own consumed cost and roll
  -- its own window, which is the entire budget. They are unreachable here.
  insert into iam.organization_preferences as p (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  update iam.organization_preferences p
     set auto_rag_enabled = case when p_patch ? 'auto_rag_enabled' then (p_patch ->> 'auto_rag_enabled')::boolean else p.auto_rag_enabled end,
         auto_index_non_pdf = case when p_patch ? 'auto_index_non_pdf' then (p_patch ->> 'auto_index_non_pdf')::boolean else p.auto_index_non_pdf end,
         suggestion_sweeps_enabled = case when p_patch ? 'suggestion_sweeps_enabled' then (p_patch ->> 'suggestion_sweeps_enabled')::boolean else p.suggestion_sweeps_enabled end,
         coding_session_provider_pin_wins = case when p_patch ? 'coding_session_provider_pin_wins' then (p_patch ->> 'coding_session_provider_pin_wins')::boolean else p.coding_session_provider_pin_wins end,
         daily_auto_rag_budget_usd = coalesce(v_budget, p.daily_auto_rag_budget_usd),
         updated_at = now()
   where p.organization_id = p_organization_id
  returning * into v_row;

  return jsonb_build_object(
    'organization_id', v_row.organization_id,
    'auto_rag_enabled', v_row.auto_rag_enabled,
    'auto_index_non_pdf', v_row.auto_index_non_pdf,
    'suggestion_sweeps_enabled', v_row.suggestion_sweeps_enabled,
    'coding_session_provider_pin_wins', v_row.coding_session_provider_pin_wins,
    'daily_auto_rag_budget_usd', v_row.daily_auto_rag_budget_usd);
end;
$fn$;

comment on function public.org_preferences_set(uuid, jsonb) is
  'DOORS-ONLY-3: the door onto iam.organization_preferences. It writes the four preference flags and the daily auto-RAG budget CEILING, and cannot touch daily_auto_rag_cost_used_usd or daily_auto_rag_window_start -- the live spend meter aidream writes, which the base-table UPDATE grant let a browser reset for itself. The ladder is the predicate admin_update carried: platform admin, or public.is_org_admin.';

-- ── platform.flexible_data ─────────────────────────────────────────────────────

create or replace function public.flexible_data_write(
  p_organization_id uuid,
  p_patch jsonb,
  p_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.flexible_data;
begin
  if v_actor is null then
    raise exception 'flexible_data_write: nobody is signed in.' using errcode = '42501';
  end if;
  if p_organization_id is null or jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'flexible_data_write: name the organization and pass an object.'
      using errcode = '22004';
  end if;
  if not iam.has_org_access(p_organization_id) then
    raise exception 'flexible_data_write: % is not an organization you can act in.', p_organization_id
      using errcode = '42501';
  end if;

  if p_id is null then
    insert into platform.flexible_data
      (label, slug, data, category_id, organization_id, created_by, visibility)
    values (
      coalesce(nullif(btrim(coalesce(p_patch ->> 'label', '')), ''), 'Untitled'),
      nullif(btrim(coalesce(p_patch ->> 'slug', '')), ''),
      case when jsonb_typeof(p_patch -> 'data') = 'object' then p_patch -> 'data' else '{}'::jsonb end,
      nullif(p_patch ->> 'category_id', '')::uuid,
      p_organization_id,
      v_actor,
      coalesce(nullif(p_patch ->> 'visibility', '')::platform.visibility, 'personal'::platform.visibility))
    returning * into v_row;
    return jsonb_build_object('id', v_row.id, 'label', v_row.label, 'version', v_row.version);
  end if;

  select * into v_row from platform.flexible_data f
   where f.id = p_id and f.organization_id = p_organization_id and f.deleted_at is null;
  if not found then
    raise exception 'flexible_data_write: there is no such record here.' using errcode = '23503';
  end if;
  -- THE LADDER. The predicate `std_update` carried.
  if not (v_row.created_by = v_actor
          or iam.has_access('flexible_data', v_row.id, 'editor'::public.permission_level)
          or (v_row.visibility >= 'internal'::platform.visibility and public.is_platform_admin())) then
    raise exception 'flexible_data_write: this record is not yours to change.' using errcode = '42501';
  end if;

  -- `deleted_at` IS NOT A KEY OF THIS PATCH. Archiving is flexible_data_archive: an archive is
  -- a different act from an edit, and a door that lets a caller set deleted_at in a patch is a
  -- delete wearing an edit''s name.
  update platform.flexible_data f
     set label      = case when p_patch ? 'label'      then coalesce(nullif(btrim(p_patch ->> 'label'), ''), f.label) else f.label end,
         slug       = case when p_patch ? 'slug'       then nullif(btrim(coalesce(p_patch ->> 'slug', '')), '') else f.slug end,
         data       = case when jsonb_typeof(p_patch -> 'data') = 'object' then p_patch -> 'data' else f.data end,
         visibility = case when p_patch ? 'visibility' then coalesce(nullif(p_patch ->> 'visibility', '')::platform.visibility, f.visibility) else f.visibility end,
         updated_by = v_actor
   where f.id = p_id
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'label', v_row.label, 'version', v_row.version);
end;
$fn$;

comment on function public.flexible_data_write(uuid, jsonb, uuid) is
  'DOORS-ONLY-3: the door onto platform.flexible_data for creating and editing. It reads label, slug, data, category_id and visibility out of the patch and NOTHING else -- deleted_at in particular is not a key here, because an archive is a different act from an edit. The ladder is the predicate std_insert / std_update carried, and created_by is stamped from auth.uid().';

create or replace function public.flexible_data_archive(
  p_organization_id uuid,
  p_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.flexible_data;
begin
  if v_actor is null then
    raise exception 'flexible_data_archive: nobody is signed in.' using errcode = '42501';
  end if;
  select * into v_row from platform.flexible_data f
   where f.id = p_id and f.organization_id = p_organization_id and f.deleted_at is null;
  if not found then
    raise exception 'flexible_data_archive: there is no such record here.' using errcode = '23503';
  end if;
  -- ARCHIVING IS THE ADMIN RUNG, which is what `std_delete` asked for -- one rung above an
  -- edit, because putting something away is not the same as changing it.
  if not (v_row.created_by = v_actor
          or iam.has_access('flexible_data', v_row.id, 'admin'::public.permission_level)
          or (v_row.visibility >= 'internal'::platform.visibility and public.is_platform_admin())) then
    raise exception 'flexible_data_archive: this record is not yours to archive.' using errcode = '42501';
  end if;

  update platform.flexible_data f
     set deleted_at = now(), updated_by = v_actor
   where f.id = p_id
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'deleted_at', v_row.deleted_at);
end;
$fn$;

comment on function public.flexible_data_archive(uuid, uuid) is
  'DOORS-ONLY-3: the archive arm for platform.flexible_data -- soft delete only, never a destroy, at the ADMIN rung that std_delete asked for. Separate from flexible_data_write on purpose: putting something away is not the same act as changing it.';

-- ── the register, in the same transaction, then the client grant ───────────────

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'public', p.proname, pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes), true, false,
       'migrations/campaign/doorsonly3_batch_b_doors_and_the_generic_entity_row_door.sql (lane DOORS-ONLY-3)',
       case p.proname
         when 'entity_row_create' then
           'p_organization_id is put to iam.has_org_access on entry and NULL is refused. p_token is resolved against platform.entity_types and must be ACTIVE and REFERENCE-PICKABLE; a token that is access machinery, has no title column, or whose table has no organization_id column is refused BY NAME rather than attempted. p_title is trimmed and is the only value written besides created_by (from auth.uid()) and the organization. It writes ONE row in the caller''s own organization and reads no record.'
         when 'entity_row_rename' then
           'p_token is resolved the same way and the same three refusals apply. The row''s OWN organization is read as the definer and put to iam.has_org_access, so a row in another tenant is reported ABSENT, never forbidden. The ladder is then created_by, editor on the row, or a platform admin. It writes exactly the title column and updated_by.'
         when 'org_update' then
           'p_org_id is decided by the predicate org_update_policy carried -- platform admin or iam.is_org_manager -- before anything is read or written. p_patch is NOT applied as given: seven keys are read out of it (name, abbreviation, description, logo_url, logo_file_id, website, settings) and everything else is ignored, so is_personal, created_by and slug are unreachable. It writes ONE iam.organizations row and returns its id, name and slug.'
         when 'org_preferences_set' then
           'p_organization_id is decided by the predicate admin_update carried -- platform admin or public.is_org_admin. p_patch is read for four boolean preference flags and the daily auto-RAG budget CEILING, validated as a non-negative number; every other key is ignored. daily_auto_rag_cost_used_usd and daily_auto_rag_window_start -- the live spend meter aidream writes -- are unreachable through this door by construction.'
         when 'flexible_data_write' then
           'p_organization_id is put to iam.has_org_access on entry. With p_id NULL it inserts one row stamped created_by = auth.uid(); with p_id it resolves the row together with the organization, so a record in another tenant is refused as absent, and then asks the exact predicate std_update carried. p_patch is read for label, slug, data, category_id and visibility only -- deleted_at is not a key, because archiving is flexible_data_archive.'
         else
           'p_id is resolved together with p_organization_id, so a record in another tenant is refused as absent. The ladder is the ADMIN rung the std_delete policy asked for: created_by, admin on the record, or a platform admin at visibility >= internal. It sets deleted_at and updated_by and destroys nothing.'
       end
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('entity_row_create', 'entity_row_rename', 'org_update',
                     'org_preferences_set', 'flexible_data_write', 'flexible_data_archive')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function public.entity_row_create(text, text, uuid) to authenticated;
grant execute on function public.entity_row_rename(text, uuid, text) to authenticated;
grant execute on function public.org_update(uuid, jsonb) to authenticated;
grant execute on function public.org_preferences_set(uuid, jsonb) to authenticated;
grant execute on function public.flexible_data_write(uuid, jsonb, uuid) to authenticated;
grant execute on function public.flexible_data_archive(uuid, uuid) to authenticated;
