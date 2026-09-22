-- based-on: public.rulebook_create(uuid, text, text, text, jsonb, jsonb, text, jsonb) 887c30acf2a0a0b33ac912ed1fd3a0816f277e20145c911811aa399696939faa
--
-- THE DUPLICATE RULEBOOK NOBODY MENTIONED (cold walk 20, defect C).
-- common-docs/projects/masterwork-methods-census/jobs-bar-2026-09-16/cold-walk-20/README.md
--
-- WHAT THE WALK SAW. Type a Rulebook name that already exists -> `POST /rest/v1/rpc/rulebook_create`
-- answers 409 -> the client retries -> the retry answers 200 -> a THIRD Rulebook with the identical
-- name appears in her list and the screen says nothing at all.
--
-- ROOT CAUSE, AND IT IS NEITHER OF THE TWO THE BRIEF GUESSED: nothing raced, and nothing was
-- written before the 409.
--   1. `rulebook_slug_live_unique` is a plain UNIQUE index on `platform.rulebook (slug)` -- despite
--      its name it has NO partial predicate, no organization in the key, and soft-deleted rows go
--      on holding their slug forever.
--   2. `createDraftRulebook` slugifies the NAME the Expert typed. The same name produces the same
--      slug, so the insert raises 23505, which PostgREST renders as HTTP 409.
--   3. The client's own loop caught that 23505, appended four random characters to the slug and
--      sent the create again. The retry could not collide, so it answered 200 -- and the refusal
--      that had already reached the browser was never said out loud to anybody.
-- So the 409 was a SLUG collision the client was deliberately papering over, and the NAME -- the
-- only part of it an Expert can see -- was never the thing the database objected to.
--
-- THE RULING. A duplicate name is not an error a person has to solve. Notion and Linear both let
-- two pages carry one title; the machine's uniqueness requirement is the slug, and a machine
-- requirement is the machine's problem. So:
--   * names stay free -- nothing here refuses one, and nothing auto-suffixes the Expert's words;
--   * the SLUG is resolved INSIDE this door, deterministically (`-2`, `-3`, ... then a random tail),
--     inside the insert's own exception handler, so an ordinary duplicate name can no longer
--     produce an HTTP 409 at a browser at all and the client has no reason left to retry;
--   * the door ANSWERS whether that name was already in use (`name_already_in_use`), so the screen
--     can say the one sentence the walk found missing instead of staying silent;
--   * the door is IDEMPOTENT on a caller-minted token: two creates carrying one token yield ONE
--     row, enforced by a unique INDEX rather than by a lookup that could race, and the second call
--     gets the first call's Rulebook back with `created: false`.
--
-- WHY THE TOKEN ARRIVES INSIDE `p_metadata` AND NOT AS A NINTH ARGUMENT. A ninth argument is a new
-- signature, and PostgREST resolves an RPC by the argument NAMES in the body: an 8-key body would
-- match both overloads (PGRST203), so the old one would have to be DROPped and the new one
-- GRANTed and re-registered -- a re-signature of a live door, in the release path, for one field.
-- The door reads `client_token` out of `p_metadata`, STRIPS it before the declared-client-key check
-- and before the write, and stores it in its own column. `metadata` never carries it, so
-- `public._rulebook_client_metadata_keys()` is untouched and no client can author it onto a stored
-- row. Forging is uninteresting anyway: the index is keyed on `created_by` too, so a forged token
-- can at worst collapse two of the forger's own creates.
--
-- Nothing fails silently (law 4): a refusal now reaches the person as the server's own sentence,
-- because the client no longer swallows one. Fix the class, never the instance (law 3): the
-- collision is resolved where the constraint lives, not in every caller that might ever meet it.
--
-- ADDITIVE. Nothing is dropped, renamed or revoked: one nullable column, one partial unique index,
-- one CREATE OR REPLACE of an existing signature. No GRANT and no new
-- `platform.client_callable_door` row are needed, because the door's identity arguments do not move.
-- Inverse: migrations/inverse/walk20_rulebook_create_is_idempotent_and_owns_its_slug.inverse.sql
-- Guard: migrations/tests/walk20_rulebook_create_is_idempotent.sql -- run it BEFORE this file to
--        watch it fail on all three clauses, and after to watch it pass.

set local lock_timeout = '2s';

-- == the idempotency key, stored ===============================================
-- Nullable with no default, so the ALTER is a catalog-only change on a 278-row table. It is
-- written by this door and by nothing else.

alter table platform.rulebook
  add column if not exists client_token uuid;

comment on column platform.rulebook.client_token is
  'The browser''s own id for ONE intent to create this Rulebook (cold walk 20, defect C). Written only by public.rulebook_create, which reads it out of p_metadata and strips it before storing anything. A second create carrying the same token returns THIS row instead of minting another, so a retry -- a second press of Start, a lost acknowledgement, a remounted component -- can never produce a second identically-named Rulebook.';

create unique index if not exists rulebook_client_token_unique
  on platform.rulebook (created_by, client_token)
  where client_token is not null;

-- == the door ==================================================================

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
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_token uuid;
  v_token_text text;
  v_base text;
  v_slug text;
  v_constraint text;
  v_name_in_use boolean := false;
  v_attempt integer;
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
              and is_super_admin())) then
    raise exception 'rulebook_create: % is not an organization you can start a Rulebook in.', p_organization_id
      using errcode = '42501';
  end if;

  if jsonb_typeof(v_meta) is distinct from 'object' then
    raise exception 'rulebook_create: metadata is an object.' using errcode = '22023';
  end if;

  -- THE TOKEN IS TRANSPORT, NOT METADATA. Taken out before the declared-key check and before the
  -- write, so a stored `metadata` can never carry it and the declared client set stays as it was.
  v_token_text := v_meta ->> 'client_token';
  v_meta := v_meta - 'client_token';
  if v_token_text is not null then
    begin
      v_token := v_token_text::uuid;
    exception when others then
      raise exception 'rulebook_create: client_token must be a uuid.' using errcode = '22023';
    end;
  end if;

  select string_agg(k, ', ') into v_bad
    from jsonb_object_keys(v_meta) k
   where not (k = any (public._rulebook_client_metadata_keys()));
  if v_bad is not null then
    raise exception 'rulebook_create: metadata key(s) % are not written by a client. The client set is %.',
      v_bad, array_to_string(public._rulebook_client_metadata_keys(), ', ')
      using errcode = '42501';
  end if;

  -- THE REPLAY, ANSWERED BEFORE ANYTHING IS WRITTEN. A create is an intent, and one intent is one
  -- Rulebook however many times a browser says it.
  if v_token is not null then
    select r.* into v_row
      from platform.rulebook r
     where r.created_by = v_actor
       and r.client_token = v_token;
    if found then
      return public._rulebook_json(v_row)
             || jsonb_build_object('created', false, 'name_already_in_use', false);
    end if;
  end if;

  -- WHAT THE SCREEN NEEDS IN ORDER TO SAY SOMETHING. Measured, never enforced: a name already in
  -- use is a fact about her own library, not a refusal.
  select exists (
    select 1 from platform.rulebook r
     where r.organization_id = p_organization_id
       and r.deleted_at is null
       and lower(btrim(r.name)) = lower(btrim(p_name))
  ) into v_name_in_use;

  -- THE SLUG IS THIS DOOR'S PROBLEM. The unique index is global and the client hands us a slug
  -- derived from words a person typed, so a collision is ordinary, not exceptional. Resolved
  -- against the INSERT itself rather than against a prior SELECT, because a SELECT would be a
  -- check that races.
  v_base := btrim(p_slug);
  v_slug := v_base;
  for v_attempt in 1..25 loop
    begin
      insert into platform.rulebook
        (name, slug, description, source, sections, rules, status, organization_id, visibility,
         metadata, created_by, client_token)
      values
        (btrim(p_name), v_slug, coalesce(p_description, ''),
         coalesce(p_source, '{}'::jsonb), coalesce(p_sections, '{}'::jsonb), '[]'::jsonb,
         'draft', p_organization_id, v_vis, v_meta, v_actor, v_token)
      returning * into v_row;
      return public._rulebook_json(v_row)
             || jsonb_build_object('created', true, 'name_already_in_use', v_name_in_use);
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'rulebook_client_token_unique' then
        -- Two presses landed at once. The INDEX, not a lookup, is what made one of them lose;
        -- the loser reads the winner's row and answers with it.
        select r.* into v_row
          from platform.rulebook r
         where r.created_by = v_actor
           and r.client_token = v_token;
        if found then
          return public._rulebook_json(v_row)
                 || jsonb_build_object('created', false, 'name_already_in_use', false);
        end if;
        raise;
      end if;
      if v_constraint is distinct from 'rulebook_slug_live_unique' then
        raise;
      end if;
      -- `-2`, `-3`, ... reads as a second book of the same name. Past the tenth the counting is
      -- noise and the only job left is to land, so a random tail takes over.
      if v_attempt < 10 then
        v_slug := left(v_base, 250) || '-' || (v_attempt + 1)::text;
      else
        v_slug := left(v_base, 240) || '-' || substr(md5(gen_random_uuid()::text), 1, 8);
      end if;
    end;
  end loop;

  raise exception 'rulebook_create: could not find a free address for a Rulebook named "%" after 25 tries. Nothing was saved -- try a different name.', btrim(p_name)
    using errcode = '23505';
end;
$fn$;

comment on function public.rulebook_create(uuid, text, text, text, jsonb, jsonb, text, jsonb) is
  'DOORS-ONLY-5, amended by cold walk 20 defect C. The door that starts a platform.rulebook. p_organization_id is put to iam.has_org_access (or the system-org + super-admin arm std_insert carried) and NULL is refused; created_by is stamped from auth.uid(), never taken from the caller. A Rulebook is born `draft` with no rules -- status, rules, version, deleted_at and every source_* column are unreachable from this door. metadata keys outside public._rulebook_client_metadata_keys() are refused BY NAME. THREE THINGS ARE NEW. (1) `p_metadata.client_token` is an idempotency key, read and STRIPPED before the key check and before the write and stored in platform.rulebook.client_token: two creates carrying one token yield ONE row, enforced by the unique index on (created_by, client_token), and the second answers with the first''s Rulebook and `created: false`, so a retried or double-pressed create can no longer mint a second Rulebook. (2) The slug collision this door used to hand back as 23505/HTTP 409 is resolved HERE, deterministically, inside the insert''s own exception handler -- the slug is derived from words a person typed, and a machine''s uniqueness requirement is the machine''s problem. Names themselves are never refused and never rewritten. (3) The answer carries two keys that are not columns, `created` and `name_already_in_use`, the second so the screen can say in one sentence that another Rulebook already has this name instead of staying silent about it.';
