-- lane: DOORS-ONLY-5
-- `platform` AND `iam` ARE NOT CLIENT-WRITABLE THROUGH PostgREST. (Chair ruling; VERIFIER-8
-- HIGH-3, 2026-09-21.) The second of the three tables DOORS-ONLY-4 left open in
-- `platform.doors_only_pending_cutover`.
--
-- platform.rulebook — AN EXPERT'S BOOK, WRITTEN BY NINE CALL SITES THAT ALL REACH IT THROUGH
-- THE SAME THREE-LINE HELPER.
--
-- THE CENSUS. Every file naming this table across matrx-frontend and aidream was listed, then
-- each file checked for ANY write verb anywhere in it. NINE write call sites, every one of them
-- going through `const rulebookTable = () => supabase.schema("platform").from("rulebook")`
-- declared thirty lines above the write — the shape DOORS-ONLY-2 recorded as the trap a
-- `.from()`-plus-context grep misses:
--
--   features/masterwork/service.ts            5  (create draft, saveRules CAS, updateRulebookMeta,
--                                                 writeDumpUrlSources CAS, softDelete)
--   features/masterwork/drip/service.ts       1  (metadata.daily_drip CAS)
--   features/masterwork/prediction/service.ts 1  (metadata.prediction_ledger CAS)
--   features/masterwork/coherence/service.ts  1  (metadata.coherence tensions CAS)
--   features/masterwork/capture-plan/service.ts 1 (metadata.capture_plan CAS)
--
-- `platform.materialize_library_rulebook`, reached by `library_subscribe`, is a SECURITY
-- DEFINER path that is already a door and needs nothing.
--
-- 🚨 THE METADATA COLUMN IS SIX FEATURES SHARING ONE JSONB, AND EVERY CLIENT WRITER WAS DOING
-- ITS OWN READ-MODIFY-WRITE. Six of the nine write nothing but a sub-object of `metadata` —
-- `daily_drip`, `prediction_ledger`, `capture_plan`, `dump_url_sources`, `checkup`, `intake` —
-- and each one read the whole column, spread it, replaced its own key and wrote the WHOLE
-- column back. Two consequences a table grant cannot express and this door removes:
--
--   1. A stale read clobbers a sibling feature's key. The CAS on `version` catches the common
--      case, but `platform._touch_rulebook` deliberately does NOT bump `version` for a
--      background-only metadata write (the `coherence` key), precisely so the Coherence Partner
--      does not age out the save an Expert is in the middle of — which means a client's
--      whole-column write CAN land on top of a coherence write the CAS never saw.
--   2. `metadata.coherence` is written by aidream's server lane about the Expert's work, and a
--      browser could overwrite it, because it was just another key in the object being replaced.
--
-- `rulebook_save` takes a PATCH and merges it — `metadata || p_metadata_patch`, top level — and
-- REFUSES BY NAME any key outside the declared client set. `coherence` is not in that set, so a
-- client cannot reach it at all, and no sibling key can be lost by a caller that did not know
-- it existed. That is the "a door that merges is a door that cannot have that bug" shape
-- DOORS-ONLY-3 §4 named for platform.categories, applied to the table where it matters most.
--
-- 🚨 THE VERSION COLUMN HAS ONE AUTHOR AND THE CLIENT WAS A SECOND. Three of the nine passed
-- `version: nextVersion` in the patch while `platform._touch_rulebook` sets it unconditionally
-- on every UPDATE. Harmless while both produced the same number, and a second author for a
-- column the trigger owns — the same finding DOORS-ONLY-3 §3 made on `checklist_run_save`.
-- These doors never write `version`; they only CAS on it.
--
-- THE LADDER, read from `pg_policy` on the live database 2026-09-21 and reproduced with the
-- same functions:
--   std_insert  is_platform_admin() OR (created_by = auth.uid() AND (organization_id IS NULL
--               OR iam.has_org_access(org) OR (org IN system_orgs.global_readable AND is_super_admin())))
--   std_update  (visibility >= internal AND is_platform_admin())
--               OR created_by = auth.uid() OR iam.has_access('rulebook', id, 'editor')
--   std_delete  the same, at the ADMIN rung
--
-- THE SEARCH-PATH RULE, paid for twice (DOORS-ONLY-3 §3 and this lane's own saved_view doors):
-- every name that is not in `pg_catalog` is schema-qualified. `pnpm check:door-names-resolve`
-- is the guard that now asks Postgres, per door, under the path that door pins.
--
-- ADDITIVE. Nothing is dropped, renamed or revoked here.
-- Inverse: migrations/inverse/doorsonly5_rulebook_gets_its_doors.inverse.sql
-- Guard: `pnpm check:doors-only-schemas`, `pnpm check:door-names-resolve`, and the seated proof
--        scripts/campaign-tests/doorsonly5_rulebook_doors_work_from_a_seat.sql

set local lock_timeout = '2s';

-- ── the shape a caller reads back ──────────────────────────────────────────────

create or replace function public._rulebook_json(p_row platform.rulebook)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select to_jsonb(p_row);
$fn$;

comment on function public._rulebook_json(platform.rulebook) is
  'DOORS-ONLY-5: the row shape every platform.rulebook door returns — the whole row, because every caller here parses it through parseRulebook and a narrower projection would silently drop a column the parser needs. Not a door: no client EXECUTE grant, so it is never registered in platform.client_callable_door.';

-- ── the declared client metadata keys ──────────────────────────────────────────

create or replace function public._rulebook_client_metadata_keys()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- THE DECLARED CLIENT SET. `coherence` is deliberately absent: it is written by aidream's
  -- Coherence Partner ABOUT the Expert's work, it is the one key platform._touch_rulebook
  -- treats as background (so it does not bump `version`), and a browser must not be able to
  -- rewrite the machine's reading of the book. Mirrored by BACKGROUND_METADATA_KEYS in
  -- aidream/services/distillation/rulebook_writes.py, from the other direction.
  select array['intake', 'capture_plan', 'daily_drip', 'prediction_ledger',
               'dump_url_sources', 'checkup']::text[];
$fn$;

comment on function public._rulebook_client_metadata_keys() is
  'DOORS-ONLY-5: the top-level platform.rulebook.metadata keys a CLIENT may write, named rather than inferred. `coherence` is absent on purpose — it is the server lane''s reading of the Expert''s work and the one key the touch trigger treats as background.';

-- ── public.rulebook_create ─────────────────────────────────────────────────────

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
              and is_super_admin())) then
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

comment on function public.rulebook_create(uuid, text, text, text, jsonb, jsonb, text, jsonb) is
  'DOORS-ONLY-5: the door that starts a platform.rulebook. p_organization_id is put to iam.has_org_access (or the system-org + super-admin arm std_insert carried) and NULL is refused; created_by is stamped from auth.uid(), never taken from the caller. A Rulebook is born `draft` with no rules — status, rules, version, deleted_at and every source_* column are unreachable from this door. metadata keys outside public._rulebook_client_metadata_keys() are refused BY NAME, so a client cannot author the `coherence` key the server lane owns. The slug collision a caller retries on surfaces as 23505 exactly as before.';

-- ── public.rulebook_save ───────────────────────────────────────────────────────

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
  if not ((v_row.visibility >= 'internal'::platform.visibility and is_platform_admin())
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

comment on function public.rulebook_save(uuid, integer, jsonb, jsonb, jsonb) is
  'DOORS-ONLY-5: the ONE door onto platform.rulebook for saving an Expert`s work — rules, sections and a metadata PATCH, under a compare-and-swap on `version` whose miss returns NULL so the caller re-reads and replays. The patch MERGES (metadata || patch, top level) instead of replacing the column, so six features sharing one jsonb can no longer clobber each other, and keys outside public._rulebook_client_metadata_keys() are refused BY NAME — which is how `coherence`, the server lane`s reading of the book, becomes unreachable from a browser. It never writes `version`: platform._touch_rulebook owns that column and carries it forward for a background-only write. status, visibility, slug, organization_id, deleted_at and every source_* column are unreachable from this door. The ladder is the exact predicate std_update carried.';

-- ── public.rulebook_meta_set ───────────────────────────────────────────────────

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
  if not ((v_row.visibility >= 'internal'::platform.visibility and is_platform_admin())
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

comment on function public.rulebook_meta_set(uuid, text, text, boolean, jsonb, text, text) is
  'DOORS-ONLY-5: the door onto a platform.rulebook`s FACTS — name, description, the dump source, status and sharing level. It writes exactly those five columns and updated_by; rules, sections, metadata, slug, organization_id, created_by, version and every source_* column belonging to the library-subscription path are unreachable. The caller used to pass its whole patch object straight through to an UPDATE, so any key it happened to carry was written. The status vocabulary is validated here by name rather than surfacing as a CHECK violation the person cannot read. The ladder is the exact predicate std_update carried.';

-- ── public.rulebook_archive ────────────────────────────────────────────────────

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
  if not ((v_row.visibility >= 'internal'::platform.visibility and is_platform_admin())
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

comment on function public.rulebook_archive(uuid) is
  'DOORS-ONLY-5: the SOFT delete of a platform.rulebook — the book leaves the shelf, every rule, run, source and corpus item under it is untouched. It is its own door at std_delete`s ADMIN rung rather than a `deleted_at` key inside the edit patch, so nobody at the editor rung can archive an Expert`s book by putting a timestamp in an object. A Rulebook already archived reads as absent.';

-- ── public.rulebook_tension_settle ─────────────────────────────────────────────
-- 🚨 THE ONE LEGITIMATE CLIENT WRITE INTO `metadata.coherence`, AND IT IS A SURGICAL ONE.
-- The Expert settling a Coherence question IS a client write into the block the server lane
-- otherwise owns — which is why `coherence` cannot simply be excluded from the client set and
-- why a generic metadata patch is the wrong shape for it. The client was replacing the WHOLE
-- coherence block (`{ ...block, tensions: next }`) from a row it had read, so anything the
-- Coherence Partner wrote between that read and the write was lost — and
-- `platform._touch_rulebook` deliberately does NOT bump `version` for a coherence-only write,
-- so the CAS could not see it either. This door changes ONE tension, in place, inside the block
-- as it stands at write time.

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
  if not ((v_row.visibility >= 'internal'::platform.visibility and is_platform_admin())
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

comment on function public.rulebook_tension_settle(uuid, integer, text, text, text, jsonb) is
  'DOORS-ONLY-5: the door that records how an Expert settled ONE Coherence question. It rewrites exactly that tension inside metadata.coherence.tensions, in place, against the block AS IT STANDS AT WRITE TIME -- the client replaced the whole coherence block from a row it had read, and platform._touch_rulebook deliberately does not bump `version` for a coherence-only write, so anything the Coherence Partner wrote in between was lost and the CAS could not see it. Every other key of the block, and every other metadata key, is untouched and unreachable. `moot` is the machine`s own state for a question whose rules were removed and this door cannot produce it. A question that is gone reads as absent rather than as a silent success.';

-- ── the register, in the same transaction ──────────────────────────────────────

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'public', p.proname, pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes), true, false,
       'migrations/campaign/doorsonly5_rulebook_gets_its_doors.sql (lane DOORS-ONLY-5)',
       case p.proname
         when 'rulebook_create' then
           'p_organization_id is put to iam.has_org_access (plus the system-org + super-admin arm std_insert carried) and NULL is refused, so a caller can only start a Rulebook in an organization they may act in. created_by is stamped from auth.uid(). The row is born `draft` with no rules: status, rules, version, deleted_at and every source_* column are unreachable. metadata keys outside the declared client set are refused BY NAME, so the server lane''s `coherence` key cannot be authored from a browser. It writes at most ONE platform.rulebook row.'
         when 'rulebook_save' then
           'p_rulebook_id is resolved first and an absent or archived Rulebook reads as absent rather than as refused. The ladder is then the exact predicate std_update carried — platform admin at visibility >= internal, created_by, or editor on the Rulebook. p_expected_version is a CAS: a miss returns NULL and writes nothing. It writes rules, sections, metadata and updated_by and NOTHING else, and the metadata write is a top-level MERGE whose keys are checked against the declared client set, so six features sharing one jsonb cannot clobber each other and `coherence` is unreachable. It never writes `version`, which platform._touch_rulebook owns.'
         when 'rulebook_tension_settle' then
           'p_rulebook_id is resolved first and an absent or archived Rulebook reads as absent. The ladder is the exact predicate std_update carried. p_expected_version is a CAS whose miss returns NULL. It rewrites exactly ONE tension inside metadata.coherence.tensions, matched by id against the block as it stands at write time, and optionally the rules column -- every other key of the coherence block and every other metadata key is untouched and unreachable, which is what the client''s whole-block replacement could not promise. The outcome vocabulary is checked by name and excludes moot, which is the machine''s own bookkeeping.'
         when 'rulebook_meta_set' then
           'p_rulebook_id is resolved first; an absent or archived Rulebook reads as absent. The ladder is the exact predicate std_update carried. It writes exactly name, description, source, status, visibility and updated_by — the caller previously passed a whole patch object straight into an UPDATE, so anything it carried was written. The status vocabulary is validated by name.'
         else
           'p_rulebook_id is resolved first; an already-archived Rulebook reads as absent. The ladder is the predicate std_delete carried — platform admin at visibility >= internal, created_by, or ADMIN on the Rulebook — deliberately a higher rung than the edit door. It writes deleted_at and updated_by, and nothing under the Rulebook is destroyed.'
       end
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('rulebook_create', 'rulebook_save', 'rulebook_meta_set', 'rulebook_archive',
                     'rulebook_tension_settle')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

select platform.reopen_declared_doors('public');

grant execute on function public.rulebook_create(uuid, text, text, text, jsonb, jsonb, text, jsonb) to authenticated;
grant execute on function public.rulebook_save(uuid, integer, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.rulebook_meta_set(uuid, text, text, boolean, jsonb, text, text) to authenticated;
grant execute on function public.rulebook_archive(uuid) to authenticated;
grant execute on function public.rulebook_tension_settle(uuid, integer, text, text, text, jsonb) to authenticated;
