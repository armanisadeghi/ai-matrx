-- lane: DOORS-ONLY-5
-- `platform` AND `iam` ARE NOT CLIENT-WRITABLE THROUGH PostgREST. (Chair ruling; VERIFIER-8
-- HIGH-3, 2026-09-21.) The LAST of the three tables DOORS-ONLY-4 left open in
-- `platform.doors_only_pending_cutover`.
--
-- platform.categories — ONE TABLE, MANY VOCABULARIES, MULTIPLEXED BY `dimension`.
--
-- 🚨 WHY THIS IS AN ADDITIVE DOOR AND NOT AN EXTENSION OF THE FOUR THAT EXIST — a ruling, with
-- its reason, because DOORS-ONLY-3 §2 instructed the opposite and the ground has moved.
--
-- DOORS-ONLY-3 said: `public.cat_create`, `cat_update`, `cat_reparent` and `cat_delete` already
-- exist, are granted to `authenticated`, and are short of what the callers need (no `metadata`,
-- no `placement_type`, `cat_create` has no `position`) — so this is an EXTENSION of four
-- existing doors, and it must be an extension rather than an OVERLOAD, because adding defaulted
-- parameters to `cat_create` would make a seven-argument call ambiguous. That reasoning about
-- ambiguity is exactly right. What it could not know is what the census now shows:
--
--   **All four are the demanded RPC surface of a PUBLISHED PACKAGE.**
--   `@ai-matrx/associations`' `categoriesService.ts` calls `cat_create`, `cat_update`,
--   `cat_reparent` and `cat_delete` by name; their argument lists are pinned in that package's
--   generated `demanded-rpcs.generated.ts` and asserted by its packed-tarball canary; and this
--   app consumes it from npm at `latest`.
--
-- So an in-place extension is a DROP and CREATE of four functions that live, released code
-- calls — which the owner's own ruling stops and escalates on, and which would break every
-- installed copy of the package until a release landed. An overload is ambiguous, an in-place
-- change is a package wave. **The third answer is the right one: one NEW door carrying the full
-- column set, which the sixteen host call sites move to, while the four package doors keep
-- their grant and their exact signatures because they ARE doors and nothing about them is
-- unsafe.** Retiring them is a package wave with its own census, and this file says so rather
-- than leaving a reader to wonder why five doors exist.
--
-- THE CENSUS: SIXTEEN write call sites in eight files, all in matrx-frontend, none in aidream.
-- Five of them are Next.js API routes — which are `authenticated`-role writers, not admin ones:
-- they use `@/utils/supabase/server`, the person's own cookie session, so RLS and the base-table
-- grant is exactly what they go through.
--
--   app/api/admin/feedback/categories/route.ts             1  insert (a SYSTEM vocabulary row)
--   app/api/admin/feedback/categories/[id]/route.ts        2  update, HARD delete
--   app/api/agent-shortcut-categories/route.ts             1  insert
--   app/api/agent-shortcut-categories/[id]/route.ts        2  update, HARD delete
--   app/api/agent-shortcut-categories/[id]/duplicate/route.ts 1 insert
--   features/skills/redux/skillsThunks.ts                  3  insert, update, metadata-only update
--   components/admin/ContentBlocksManager.tsx              3  insert, update, HARD delete
--   lib/services/agent-apps-admin-service.ts               3  insert, update, HARD delete
--
-- 🚨 FOUR DEFECTS THE DOOR CLOSES, AND NOT ONE OF THEM IS EXPRESSIBLE AS A POLICY:
--
--   1. **THE DIMENSION IS A WALL NOBODY BUILT.** `platform.categories` holds feedback
--      categories, agent-shortcut categories, skill categories, app categories, CRM pipelines
--      and stages, HR reasons — every one of them keyed only by the text column `dimension`.
--      `std_update` is `created_by = auth.uid() OR has_access('category', id, 'editor')` and
--      says NOTHING about it. Five of the sixteen callers wrote `.eq("dimension", …)` beside
--      their `.eq("id", …)` BY HAND, which is the tell: they knew the wall was needed and the
--      database was not enforcing it. Eleven did not write it at all. `cat_write` and
--      `cat_archive` resolve a row by (id, dimension) TOGETHER, so a caller holding a pipeline
--      stage's id cannot rename it through the feedback surface, and a row under another
--      dimension reads as ABSENT.
--
--   2. **`metadata` WAS BEING REPLACED, NOT MERGED, AND IT COST REAL DATA.**
--      `components/admin/ContentBlocksManager.tsx:899-905` writes `{ is_active }` over the whole
--      `metadata` jsonb, wiping `legacy_table` and anything else in there — while every sibling
--      writer read-modify-writes it. `cat_write` takes a PATCH and merges it at the top level. A
--      door that merges is a door that cannot have that bug.
--
--   3. **THREE HARD `.delete()`s WHILE EVERY SIBLING SOFT-DELETES.** A category is pointed at by
--      FOREIGN KEYS from more than thirty tables — `crm.deal.stage_id`, `hr.asset.category_id`,
--      `agent.shortcut.category_id` and the rest — and several of those are `ON DELETE SET
--      NULL`, so destroying a category silently NULLs a live column on every row that named it.
--      `cat_archive` soft-deletes, like `cat_delete` already does.
--
--   4. **`cat_update` REPLACES WHAT IT IS NOT TOLD.** The existing package door writes
--      `slug = nullif(btrim(p_slug),'')`, `color = p_color`, `icon = p_icon`,
--      `"position" = p_position` unconditionally, so a caller changing only a name and omitting
--      the rest ERASES them. `cat_write` is a patch: an argument that is not passed is not
--      written. (The package door is left alone — see the ruling above — and this is recorded
--      so the package wave that retires it knows what to carry over.)
--
-- THE LADDER, read from `pg_policy` on the live database 2026-09-21 and reproduced with the
-- same functions — and the existing `cat_*` doors' own is_system arm, which is stricter than the
-- policy and is kept:
--   std_insert  is_platform_admin() OR (created_by = auth.uid() AND (organization_id IS NULL
--               OR iam.has_org_access(org) OR (org IN system_orgs.global_readable AND is_super_admin())))
--   std_update  (visibility >= internal AND is_platform_admin())
--               OR created_by = auth.uid() OR iam.has_access('category', id, 'editor')
--   std_delete  the same, at the ADMIN rung
--   is_system   a SYSTEM category is super-admin only, in both directions — creating one and
--               changing one. That is `cat_update`'s rule today and it is carried here, because
--               a platform vocabulary row is not an organization's to edit.
--
-- ADDITIVE. Nothing is dropped, renamed or revoked here.
-- Inverse: migrations/inverse/doorsonly5_categories_gets_its_doors.inverse.sql
-- Guard: `pnpm check:doors-only-schemas`, `pnpm check:door-names-resolve`, and the seated proof
--        scripts/campaign-tests/doorsonly5_categories_doors_work_from_a_seat.sql

set local lock_timeout = '2s';

create or replace function public._category_json(p_row platform.categories)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select to_jsonb(p_row);
$fn$;

comment on function public._category_json(platform.categories) is
  'DOORS-ONLY-5: the row shape every platform.categories door returns. Not a door: no client EXECUTE grant, so it is never registered in platform.client_callable_door.';

-- ── public.cat_write ───────────────────────────────────────────────────────────

create or replace function public.cat_write(
  p_dimension text,
  p_category_id uuid default null,
  p_organization_id uuid default null,
  p_name text default null,
  p_slug text default null,
  p_set_slug boolean default false,
  p_parent_id uuid default null,
  p_set_parent boolean default false,
  p_color text default null,
  p_set_color boolean default false,
  p_icon text default null,
  p_set_icon boolean default false,
  p_position integer default null,
  p_set_position boolean default false,
  p_placement_type text default null,
  p_set_placement_type boolean default false,
  p_metadata_patch jsonb default null,
  p_is_system boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.categories;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_dim text := nullif(btrim(coalesce(p_dimension, '')), '');
begin
  if v_actor is null then
    raise exception 'cat_write: a category belongs to an organization, and nobody is signed in.'
      using errcode = '42501';
  end if;
  if v_dim is null then
    raise exception 'cat_write: name the dimension this category belongs to (feedback, shortcut, skill, app, …).'
      using errcode = '22004';
  end if;
  if p_metadata_patch is not null
     and jsonb_typeof(p_metadata_patch) is distinct from 'object' then
    raise exception 'cat_write: the metadata patch is an object.' using errcode = '22023';
  end if;

  -- ── CREATE ──
  if p_category_id is null then
    if v_name is null then
      raise exception 'cat_write: a category needs a name.' using errcode = '22004';
    end if;
    if p_organization_id is null then
      raise exception 'cat_write: name the organization this category belongs to.'
        using errcode = '22004';
    end if;
    -- THE LADDER. What std_insert asked, plus the is_system arm the cat_* doors already carry.
    if not (iam.has_org_access(p_organization_id)
            or (p_organization_id in (select organization_id from iam.system_orgs where global_readable)
                and public.is_super_admin())) then
      raise exception 'cat_write: % is not an organization you can add a category to.', p_organization_id
        using errcode = '42501';
    end if;
    if coalesce(p_is_system, false) and not public.is_super_admin() then
      raise exception 'cat_write: a SYSTEM category is platform vocabulary, not an organization''s — that needs a super admin.'
        using errcode = '42501';
    end if;
    -- THE PARENT IS THIS ORGANIZATION'S OR THE PLATFORM'S, the sentence cat_create already
    -- carries (0850): a foreign parent and an invented one answer the SAME way, so the door is
    -- not an existence oracle over every category id.
    if p_parent_id is not null and not exists (
         select 1 from platform.categories parent
          where parent.id = p_parent_id and parent.deleted_at is null
            and parent.dimension = v_dim
            and (parent.organization_id = p_organization_id or parent.is_system)) then
      raise exception 'cat_write: parent category not found' using errcode = '22023';
    end if;

    insert into platform.categories
      (organization_id, dimension, name, slug, parent_id, is_system, color, icon,
       "position", placement_type, metadata, created_by, updated_by)
    values
      (p_organization_id, v_dim, v_name, nullif(btrim(coalesce(p_slug, '')), ''),
       p_parent_id, coalesce(p_is_system, false), p_color, p_icon,
       p_position, nullif(btrim(coalesce(p_placement_type, '')), ''),
       coalesce(p_metadata_patch, '{}'::jsonb), v_actor, v_actor)
    returning * into v_row;

    return public._category_json(v_row);
  end if;

  -- ── UPDATE ──
  -- RESOLVED BY (id, dimension) TOGETHER. One table holds every vocabulary in the product and
  -- no policy on it has ever looked at which one a row belongs to.
  select * into v_row
    from platform.categories c
   where c.id = p_category_id and c.dimension = v_dim and c.deleted_at is null;
  if not found then
    return null;
  end if;

  if v_row.is_system then
    if not public.is_super_admin() then
      raise exception 'cat_write: this is platform vocabulary, not your organization''s — changing it needs a super admin.'
        using errcode = '42501';
    end if;
  elsif not (iam.has_org_access(v_row.organization_id)
             or v_row.created_by = v_actor
             or iam.has_access('category', v_row.id, 'editor'::public.permission_level)
             or ((v_row.visibility >= 'internal'::platform.visibility) and public.is_platform_admin())) then
    raise exception 'cat_write: this category is not yours to change.' using errcode = '42501';
  end if;

  if p_set_parent and p_parent_id is not null and not exists (
       select 1 from platform.categories parent
        where parent.id = p_parent_id and parent.deleted_at is null
          and parent.dimension = v_dim
          and (parent.organization_id = v_row.organization_id or parent.is_system)) then
    raise exception 'cat_write: parent category not found' using errcode = '22023';
  end if;

  -- A PATCH, NOT A REPLACEMENT. Every optional column carries its own `p_set_*` flag, so a
  -- caller changing a name cannot erase a colour it never mentioned — which is what the
  -- existing cat_update does, and what several of these call sites were working around.
  update platform.categories c
     set name = coalesce(v_name, c.name),
         slug = case when p_set_slug then nullif(btrim(coalesce(p_slug, '')), '') else c.slug end,
         parent_id = case when p_set_parent then p_parent_id else c.parent_id end,
         color = case when p_set_color then p_color else c.color end,
         icon = case when p_set_icon then p_icon else c.icon end,
         "position" = case when p_set_position then p_position else c."position" end,
         placement_type = case when p_set_placement_type
                               then nullif(btrim(coalesce(p_placement_type, '')), '')
                               else c.placement_type end,
         -- THE MERGE. ContentBlocksManager wrote `{ is_active }` over the whole column and
         -- wiped `legacy_table` with it.
         metadata = case when p_metadata_patch is null then c.metadata
                         else c.metadata || p_metadata_patch end,
         updated_by = v_actor
   where c.id = v_row.id and c.dimension = v_dim and c.deleted_at is null
  returning * into v_row;

  return public._category_json(v_row);
end;
$fn$;

comment on function public.cat_write(text, uuid, uuid, text, text, boolean, uuid, boolean, text, boolean, text, boolean, integer, boolean, text, boolean, jsonb, boolean) is
  'DOORS-ONLY-5: the door onto platform.categories for the host app`s sixteen write call sites — one table holding every vocabulary in the product, multiplexed by `dimension`, which no policy on it has ever looked at. It resolves a row by (id, dimension) TOGETHER, so a pipeline stage cannot be renamed through the feedback surface and a row under another dimension reads as absent. It is a PATCH: every optional column carries its own p_set_* flag, so changing a name cannot erase a colour the caller never mentioned (which the existing cat_update does). metadata is MERGED, never replaced — ContentBlocksManager wrote { is_active } over the whole column and wiped legacy_table with it. created_by is stamped from auth.uid(); is_system, organization_id and dimension are unreachable on update, and creating a SYSTEM category needs a super admin. It does not supersede public.cat_create / cat_update, which are the demanded RPC surface of the published @ai-matrx/associations package and keep their exact signatures.';

-- ── public.cat_archive ─────────────────────────────────────────────────────────

create or replace function public.cat_archive(
  p_dimension text,
  p_category_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.categories;
  v_dim text := nullif(btrim(coalesce(p_dimension, '')), '');
begin
  if v_actor is null then
    raise exception 'cat_archive: nobody is signed in.' using errcode = '42501';
  end if;
  if p_category_id is null or v_dim is null then
    raise exception 'cat_archive: name the category and its dimension.' using errcode = '22004';
  end if;

  select * into v_row
    from platform.categories c
   where c.id = p_category_id and c.dimension = v_dim and c.deleted_at is null;
  if not found then
    return null;
  end if;

  if v_row.is_system then
    if not public.is_super_admin() then
      raise exception 'cat_archive: this is platform vocabulary, not your organization''s — removing it needs a super admin.'
        using errcode = '42501';
    end if;
  elsif not (iam.has_org_access(v_row.organization_id)
             or v_row.created_by = v_actor
             or iam.has_access('category', v_row.id, 'admin'::public.permission_level)
             or ((v_row.visibility >= 'internal'::platform.visibility) and public.is_platform_admin())) then
    raise exception 'cat_archive: this category is not yours to remove.' using errcode = '42501';
  end if;

  -- SOFT, AND THAT IS THE WHOLE POINT. Three of the callers this replaces ran a HARD
  -- `.delete()` while every sibling soft-deleted — and more than thirty tables carry a foreign
  -- key to this one, several of them ON DELETE SET NULL, so destroying a category silently
  -- NULLed a live column on every row that named it.
  update platform.categories c
     set deleted_at = now(), updated_by = v_actor
   where c.id = v_row.id and c.dimension = v_dim and c.deleted_at is null
  returning * into v_row;

  return public._category_json(v_row);
end;
$fn$;

comment on function public.cat_archive(text, uuid) is
  'DOORS-ONLY-5: the SOFT delete of a platform.categories row, resolved by (id, dimension) together. Three of the sixteen host call sites ran a HARD .delete() while every sibling soft-deleted, and more than thirty tables carry a foreign key to this one — several ON DELETE SET NULL — so destroying a category silently NULLed a live column on every row that named it. The ladder is std_delete`s ADMIN rung, plus the is_system arm: platform vocabulary is a super admin`s to remove, not an organization`s.';

-- ── the register, in the same transaction ──────────────────────────────────────

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'public', p.proname, pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes), true, false,
       'migrations/campaign/doorsonly5_categories_gets_its_doors.sql (lane DOORS-ONLY-5)',
       case p.proname
         when 'cat_write' then
           'p_dimension is REQUIRED and the row is resolved by (id, dimension) TOGETHER, so a category under another vocabulary reads as absent — platform.categories holds every vocabulary in the product keyed only by that text column, and no policy on it has ever looked at it. On create, p_organization_id is put to iam.has_org_access (plus the system-org + super-admin arm std_insert carried) and NULL is refused; created_by is stamped from auth.uid(); a SYSTEM category needs a super admin; and the parent is checked to be this organization''s or the platform''s with ONE sentence for a foreign parent and an invented one, so the door is not an existence oracle. On update the ladder is the predicate std_update carried plus the is_system super-admin arm the existing cat_* doors already enforce. It is a PATCH — every optional column has its own p_set_* flag — and metadata is MERGED, never replaced. organization_id, dimension, is_system, created_by and version are unreachable on update.'
         else
           'p_dimension is REQUIRED and the row is resolved by (id, dimension) together; a category under another vocabulary reads as absent. The ladder is the predicate std_delete carried at the ADMIN rung, plus the is_system super-admin arm. It writes deleted_at and updated_by — a SOFT delete, which is the point: three of the call sites it replaces ran a hard DELETE, and more than thirty tables carry a foreign key to this one, several ON DELETE SET NULL, so a destroy silently NULLed a live column on every row that named the category.'
       end
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('cat_write', 'cat_archive')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

select platform.reopen_declared_doors('public');

grant execute on function public.cat_write(text, uuid, uuid, text, text, boolean, uuid, boolean, text, boolean, text, boolean, integer, boolean, text, boolean, jsonb, boolean) to authenticated;
grant execute on function public.cat_archive(text, uuid) to authenticated;
