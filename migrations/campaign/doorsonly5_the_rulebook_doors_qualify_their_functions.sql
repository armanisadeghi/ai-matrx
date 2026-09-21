-- lane: DOORS-ONLY-5
-- based-on: public.rulebook_create(uuid, text, text, text, jsonb, jsonb, text, jsonb) 902eae62ae215739d63fca497e2927286d7abd245605b4be24041a6fc3b212cd
-- based-on: public.rulebook_save(uuid, integer, jsonb, jsonb, jsonb) 7093b9a7a483451c9e578f0dba821ebfa09228437f372fa762bb6c9fa2c9dfe4
-- based-on: public.rulebook_meta_set(uuid, text, text, boolean, jsonb, text, text) 71b676d0bba9a64afedd755b8f148fef728551cdec29aec9e4defba28e9ede07
-- based-on: public.rulebook_archive(uuid) 1e6e90193d688b6f95c8e69516852eb8b31d7b6b5595938a45222b6522321382
-- based-on: public.rulebook_tension_settle(uuid, integer, text, text, text, jsonb) f18d6af0adbf2a9fd52b17f169e216c4d685eaa3065b9343cd7990d1af6bdefb
-- THE GUARD THIS LANE BUILT CAUGHT THE OTHER HALF OF THE SAME CLASS, BEFORE A CALLER MOVED.
--
-- DOORS-ONLY-3 §3 hit this twice in a row and said so: "the first name to fail is the only one
-- you see." Fixing the unqualified `permission_level` in its doors revealed
-- `404 function is_platform_admin() does not exist` behind it, because plpgsql resolves names
-- lazily and stops at the first miss. This lane's saved_view doors reproduced the type half;
-- these five rulebook doors carry the FUNCTION half -- `is_platform_admin()` and
-- `is_super_admin()`, both in `public`, in bodies that pin `search_path` to `pg_catalog`.
--
-- The difference is that nobody had to call them to find out. `pnpm check:door-names-resolve`
-- reported all five the moment they were applied, before a single caller was moved and before
-- the seated proof ran. That is what a class fix buys over a rule in a handoff.
--
-- THE FIX IS THE SCHEMA-QUALIFIED NAME, `public.is_platform_admin()` and
-- `public.is_super_admin()`. The `search_path` pin is unchanged, deliberately -- a SECURITY
-- DEFINER function that inherits the caller's search_path is the classic definer hijack. The
-- ladders, the column sets, the metadata whitelist and the CAS are byte-identical otherwise.
--
-- ADDITIVE: five CREATE OR REPLACE of functions this lane created minutes ago.
-- Inverse: migrations/inverse/doorsonly5_the_rulebook_doors_qualify_their_functions.inverse.sql
-- Guard: `pnpm check:door-names-resolve` (RED before this file, GREEN after).

set local lock_timeout = '2s';

create or replace function public.rulebook_create(
  p_organization_id uuid,
  p_name text,
  p_slug text,
  p_description text default '',
  p_source jsonb default '{}'::jsonb,
  p_sections jsonb default '{}'::jsonb,
  p_visibility text default 'internal',
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.rulebook;
  v_vis platform.visibility;
  v_bad text;
begin
  if v_actor is null then
    raise exception 'rulebook_create: a Rulebook belongs to the person who started it, and nobody is signed in.'
      using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'rulebook_create: name the organization this Rulebook belongs to.' using errcode = '22004';
  end if;
  if coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_slug), '') = '' then
    raise exception 'rulebook_create: a Rulebook needs a name and a slug.' using errcode = '22004';
  end if;
  begin
    v_vis := coalesce(p_visibility, 'internal')::platform.visibility;
  exception when others then
    raise exception 'rulebook_create: % is not a sharing level. Use personal, internal, link or public.', p_visibility
      using errcode = '22023';
  end;

  -- THE LADDER. The question std_insert asked, minus the platform-admin arm: a door that
  -- creates a row in somebody's name decides on the ORGANIZATION, and a platform admin
  -- creating a Rulebook is acting in an organization like anybody else.
  if not (iam.has_org_access(p_organization_id)
          or (p_organization_id in (select organization_id from iam.system_orgs where global_readable)
              and public.is_super_admin())) then
    raise exception 'rulebook_create: % is not an organization you can start a Rulebook in.', p_organization_id
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'rulebook_create: metadata is an object.' using errcode = '22023';
  end if;
  select string_agg(k, ', ') into v_bad
    from jsonb_object_keys(coalesce(p_metadata, '{}'::jsonb)) k
   where not (k = any (public._rulebook_client_metadata_keys()));
  if v_bad is not null then
    raise exception 'rulebook_create: metadata key(s) % are not written by a client. The client set is %.',
      v_bad, array_to_string(public._rulebook_client_metadata_keys(), ', ')
      using errcode = '42501';
  end if;

  insert into platform.rulebook
    (name, slug, description, source, sections, rules, status, organization_id, visibility,
     metadata, created_by)
  values
    (btrim(p_name), btrim(p_slug), coalesce(p_description, ''),
     coalesce(p_source, '{}'::jsonb), coalesce(p_sections, '{}'::jsonb), '[]'::jsonb,
     'draft', p_organization_id, v_vis, coalesce(p_metadata, '{}'::jsonb), v_actor)
  returning * into v_row;

  return public._rulebook_json(v_row);
end;
$fn$;

create or replace function public.rulebook_save(
  p_rulebook_id uuid,
  p_expected_version integer,
  p_rules jsonb default null,
  p_sections jsonb default null,
  p_metadata_patch jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.rulebook;
  v_bad text;
begin
  if v_actor is null then
    raise exception 'rulebook_save: nobody is signed in.' using errcode = '42501';
  end if;
  if p_rulebook_id is null or p_expected_version is null then
    raise exception 'rulebook_save: name the Rulebook and the version you read.' using errcode = '22004';
  end if;
  if p_rules is not null and jsonb_typeof(p_rules) is distinct from 'array' then
    raise exception 'rulebook_save: the rules of a Rulebook are an array.' using errcode = '22023';
  end if;
  if p_sections is not null and jsonb_typeof(p_sections) is distinct from 'object' then
    raise exception 'rulebook_save: sections are an object.' using errcode = '22023';
  end if;
  if p_metadata_patch is not null then
    if jsonb_typeof(p_metadata_patch) is distinct from 'object' then
      raise exception 'rulebook_save: the metadata patch is an object.' using errcode = '22023';
    end if;
    -- REFUSED BY NAME, never silently dropped. A key a client may not write is a mistake the
    -- caller has to see: swallowing it would leave a feature believing it had saved.
    select string_agg(k, ', ') into v_bad
      from jsonb_object_keys(p_metadata_patch) k
     where not (k = any (public._rulebook_client_metadata_keys()));
    if v_bad is not null then
      raise exception 'rulebook_save: metadata key(s) % are not written by a client. The client set is %.',
        v_bad, array_to_string(public._rulebook_client_metadata_keys(), ', ')
        using errcode = '42501';
    end if;
  end if;

  select * into v_row from platform.rulebook r
   where r.id = p_rulebook_id and r.deleted_at is null;
  if not found then
    -- A Rulebook that is not here reads as absent; a door never tells a caller that somebody
    -- else's row exists.
    return null;
  end if;

  -- THE LADDER. The exact predicate std_update carried.
  if not ((v_row.visibility >= 'internal'::platform.visibility and public.is_platform_admin())
          or v_row.created_by = v_actor
          or iam.has_access('rulebook', v_row.id, 'editor'::public.permission_level)) then
    raise exception 'rulebook_save: this Rulebook is not yours to change.' using errcode = '42501';
  end if;

  -- THE CAS, one statement. `version` is NOT set here: platform._touch_rulebook owns it, and
  -- it deliberately carries the version FORWARD when nothing an Expert or a reader can see
  -- moved, which is what stops a background writer ageing out the save somebody is in the
  -- middle of. The client used to supply `nextVersion` as well — a second author for the same
  -- column.
  update platform.rulebook r
     set rules = coalesce(p_rules, r.rules),
         sections = coalesce(p_sections, r.sections),
         -- THE MERGE. `||` is a top-level merge, so a caller writing `daily_drip` cannot lose
         -- `capture_plan`, and the server's `coherence` survives every client save.
         metadata = case when p_metadata_patch is null then r.metadata
                         else r.metadata || p_metadata_patch end,
         updated_by = v_actor
   where r.id = p_rulebook_id
     and r.version = p_expected_version
     and r.deleted_at is null
  returning * into v_row;

  if not found then
    -- A version miss is NULL, not an error: the caller re-reads, classifies the miss (the
    -- phantom-conflict rebase in rulebookRebase.ts) and replays.
    return null;
  end if;
  return public._rulebook_json(v_row);
end;
$fn$;

create or replace function public.rulebook_meta_set(
  p_rulebook_id uuid,
  p_name text default null,
  p_description text default null,
  p_set_description boolean default false,
  p_source jsonb default null,
  p_status text default null,
  p_visibility text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.rulebook;
  v_vis platform.visibility;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if v_actor is null then
    raise exception 'rulebook_meta_set: nobody is signed in.' using errcode = '42501';
  end if;
  if p_rulebook_id is null then
    raise exception 'rulebook_meta_set: name the Rulebook.' using errcode = '22004';
  end if;
  if p_status is not null and p_status not in ('draft', 'active', 'archived') then
    raise exception 'rulebook_meta_set: % is not a Rulebook status. Use draft, active or archived.', p_status
      using errcode = '22023';
  end if;
  if p_visibility is not null then
    begin
      v_vis := p_visibility::platform.visibility;
    exception when others then
      raise exception 'rulebook_meta_set: % is not a sharing level. Use personal, internal, link or public.', p_visibility
        using errcode = '22023';
    end;
  end if;

  select * into v_row from platform.rulebook r
   where r.id = p_rulebook_id and r.deleted_at is null;
  if not found then
    return null;
  end if;

  -- THE LADDER. The exact predicate std_update carried.
  if not ((v_row.visibility >= 'internal'::platform.visibility and public.is_platform_admin())
          or v_row.created_by = v_actor
          or iam.has_access('rulebook', v_row.id, 'editor'::public.permission_level)) then
    raise exception 'rulebook_meta_set: this Rulebook is not yours to change.' using errcode = '42501';
  end if;

  update platform.rulebook r
     set name = coalesce(v_name, r.name),
         description = case when p_set_description then coalesce(p_description, '') else r.description end,
         source = coalesce(p_source, r.source),
         status = coalesce(p_status, r.status),
         visibility = coalesce(v_vis, r.visibility),
         updated_by = v_actor
   where r.id = p_rulebook_id and r.deleted_at is null
  returning * into v_row;

  return public._rulebook_json(v_row);
end;
$fn$;

create or replace function public.rulebook_archive(
  p_rulebook_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.rulebook;
begin
  if v_actor is null then
    raise exception 'rulebook_archive: nobody is signed in.' using errcode = '42501';
  end if;
  if p_rulebook_id is null then
    raise exception 'rulebook_archive: name the Rulebook.' using errcode = '22004';
  end if;

  select * into v_row from platform.rulebook r
   where r.id = p_rulebook_id and r.deleted_at is null;
  if not found then
    return null;
  end if;

  -- THE LADDER. std_delete's predicate — the ADMIN rung. Archiving an Expert's book is its own
  -- arm at its own rung and never a `deleted_at` key inside an edit patch.
  if not ((v_row.visibility >= 'internal'::platform.visibility and public.is_platform_admin())
          or v_row.created_by = v_actor
          or iam.has_access('rulebook', v_row.id, 'admin'::public.permission_level)) then
    raise exception 'rulebook_archive: this Rulebook is not yours to remove.' using errcode = '42501';
  end if;

  update platform.rulebook r
     set deleted_at = now(), updated_by = v_actor
   where r.id = p_rulebook_id and r.deleted_at is null
  returning * into v_row;

  return public._rulebook_json(v_row);
end;
$fn$;

create or replace function public.rulebook_tension_settle(
  p_rulebook_id uuid,
  p_expected_version integer,
  p_tension_id text,
  p_outcome text,
  p_answer text default null,
  p_rules jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row platform.rulebook;
  v_at timestamptz := now();
  v_answer text := nullif(btrim(coalesce(p_answer, '')), '');
  v_found boolean := false;
begin
  if v_actor is null then
    raise exception 'rulebook_tension_settle: a ruling is a person''s, and nobody is signed in.'
      using errcode = '42501';
  end if;
  if p_rulebook_id is null or p_expected_version is null
     or coalesce(btrim(p_tension_id), '') = '' then
    raise exception 'rulebook_tension_settle: name the Rulebook, the question and the version you read.'
      using errcode = '22004';
  end if;
  -- `moot` is the MACHINE's bookkeeping for a question whose rules were removed. It is written
  -- by the server's rule-removing writes and never by a click, so this door cannot produce it.
  if p_outcome not in ('resolved', 'both_right', 'dismissed') then
    raise exception 'rulebook_tension_settle: % is not a way an Expert settles a question.', p_outcome
      using errcode = '22023';
  end if;
  if p_rules is not null and jsonb_typeof(p_rules) is distinct from 'array' then
    raise exception 'rulebook_tension_settle: the rules of a Rulebook are an array.' using errcode = '22023';
  end if;

  select * into v_row from platform.rulebook r
   where r.id = p_rulebook_id and r.deleted_at is null;
  if not found then
    return null;
  end if;

  -- THE LADDER. The exact predicate std_update carried.
  if not ((v_row.visibility >= 'internal'::platform.visibility and public.is_platform_admin())
          or v_row.created_by = v_actor
          or iam.has_access('rulebook', v_row.id, 'editor'::public.permission_level)) then
    raise exception 'rulebook_tension_settle: this Rulebook is not yours to rule on.' using errcode = '42501';
  end if;

  select exists (
    select 1 from jsonb_array_elements(
                    coalesce(v_row.metadata -> 'coherence' -> 'tensions', '[]'::jsonb)) t
     where t ->> 'id' = p_tension_id)
    into v_found;
  if not v_found then
    -- The question is gone (its rules were retired while the panel was open). Absent, not
    -- refused — and never a silent success that would leave the Expert believing they ruled.
    return null;
  end if;

  update platform.rulebook r
     set metadata = jsonb_set(
           r.metadata,
           array['coherence', 'tensions'],
           (select jsonb_agg(
                     case when t ->> 'id' = p_tension_id
                          then t || jsonb_build_object('state', p_outcome, 'answered_at', v_at)
                                 || case when v_answer is null then '{}'::jsonb
                                         else jsonb_build_object('answer', v_answer) end
                          else t end)
              from jsonb_array_elements(
                     coalesce(r.metadata -> 'coherence' -> 'tensions', '[]'::jsonb)) t),
           true),
         rules = coalesce(p_rules, r.rules),
         updated_by = v_actor
   where r.id = p_rulebook_id
     and r.version = p_expected_version
     and r.deleted_at is null
  returning * into v_row;

  if not found then
    return null;
  end if;
  return public._rulebook_json(v_row);
end;
$fn$;
