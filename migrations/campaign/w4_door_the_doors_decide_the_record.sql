-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
-- based-on: custom.record_write(uuid, uuid, jsonb) 849a96b1b82d7e5cd8db6c0e15d7b58726a89654adb8b4c094db3ee6fff64afe
-- based-on: custom.record_update(uuid, uuid, jsonb, integer) 6c01ffc765205b0916bff4e38621c4f022c11fb584592b1fc2840f7f3b46ae5b
-- based-on: custom.record_delete(uuid, uuid) 6c8d2310f537c171dc25ba2bfb730b0ff800378301cd5ab3a0540cb1f35ce932
-- based-on: custom.record_restore(uuid, uuid) 6502944c1086d4ac4b1c6d5548b410af354593250580d41c8bb14753592dd1af
--
-- W4-DOOR-RECORD — THE FOUR RECORD WRITE DOORS DECIDE THE RECORD, NOT ONLY THE ORGANIZATION.
--
-- WHAT WAS ACTUALLY WRONG, MEASURED ON THE MAIN DATABASE 2026-09-19.
-- `w4_door_the_write_doors_are_client_callable.sql` gave every write door
-- `custom.assert_client_may_reach`, which asks ONE question: are you a member of this
-- organization. That question holds — proven live: as role `authenticated` carrying
-- test@test.com's real claims, all seven client doors into an organization that person is
-- NOT a member of answer *"You are not a member of that organization, so custom.<door> has
-- nothing to do there."*
--
-- But membership was the ONLY question any of the four record doors asked. The platform's
-- own access kernel (`iam.has_access_for` -> `iam.has_access_for_base`) asks a second one,
-- and the store's READ door has always asked it too: may this person reach THIS record.
-- The two halves disagreed, and the disagreement is a hole:
--
--     a record marked visibility='personal' is refused by custom.read_record
--     ("You do not have access to this record", DOOR-1)
--     and custom.record_update on the SAME record returned the next version number.
--
-- Measured inside a rolled-back transaction: `iam.has_access_for(test, 'record', rec,
-- 'editor')` answered **false**, `custom.read_record` refused, and `custom.record_update`
-- answered **3**. Somebody who may not open a record could rewrite it and delete it.
-- It is not reachable across an organization (the wall above holds) and it is latent today
-- only because every one of the 1,455 rows in `custom.record` still carries the column
-- default `internal`, which the kernel's org-member lane grants editor on. The day one row
-- is marked `personal` — which is the whole point of the column — the hole is live.
--
-- THE FIX IS ONE PREDICATE, AND IT IS THE ONE THE REST OF THE PLATFORM ALREADY USES.
-- `custom.assert_client_may_change` asks the organization question FIRST (by calling
-- `custom.assert_client_may_reach`, unchanged, so there is still exactly one place that
-- knows what a membership is) and then asks `iam.has_access_for` about the subject row —
-- the same call `custom.io_restore` and `custom.io_comment_write` have always made, and the
-- runtime half of the same rules `iam.entity_read_expr` emits into RLS. A door cannot now
-- decide the record a different way, because there is only one way to decide it.
--
-- WHAT IT CHANGES ON TODAY'S DATA: NOTHING. Every record is `internal`; `iam.class_lanes
-- ('record')` carries the org_member lane; so every organization member keeps `editor` on
-- every record they can write today, and every non-member is refused exactly where they
-- were refused before. The change is entirely about the rows that do not exist yet.
--
-- THE THREE WAYS THROUGH, EACH NAMED RATHER THAN IMPLIED.
--   1. The store owner. Every campaign and server lane runs as the role that owns
--      `custom.record`; `assert_client_may_reach` already returns for it and the record
--      question is not the owner's to answer either.
--   2. No principal at all. `custom.anon_capture` — and only it — reaches
--      `custom.record_write` with nobody signed in, and `custom.anon_token_verify` has
--      already decided that write against the form's own token. `anon` holds EXECUTE on
--      none of these four doors, so "no principal" is only ever reachable from a door that
--      has already decided.
--   3. A subject that is not in this organization. The kernel Tables (Table, Field, Rule,
--      Person, File, ...) live in the system organization and carry no grant any tenant
--      could hold, so `custom.record_write(org, custom.table_kernel_id(), ...)` — which is
--      how `custom.table_declare` writes a Table — is decided by the organization wall and
--      nothing else. A subject that is not found at all falls here too, on purpose: the
--      door raises its own `02000` a line later, and this predicate must not turn a
--      missing record into a different sentence and leak which ids exist.
--
-- THE CENSUS IS A FUNCTION, SO THE NEXT DOOR CANNOT BE ADDED WITHOUT IT.
-- `custom.doors_not_deciding_the_record()` names every SECURITY DEFINER function in schema
-- `custom` that a signed-in caller may execute, that takes a `p_record_id` or `p_table_id`,
-- that writes a record, and whose body decides none of the three questions. It answered
-- exactly these four rows before this file and answers zero after it. matrx-frontend
-- `scripts/check-doors-decide-the-record.ts` is the guard that fails on a non-empty answer.

create or replace function custom.assert_client_may_change(
  p_organization_id uuid,
  p_subject_id      uuid,
  p_door            text,
  p_required        public.permission_level default 'editor'::public.permission_level,
  p_subject_word    text default 'record'
) returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_me          uuid;
  v_subject_org uuid;
begin
  -- ONE order, always: the organization wall first, then the row. A door that asked about
  -- the row first would answer "you may not touch this record" to somebody who should have
  -- been told they are in the wrong organization entirely.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- Way through 1: the role that owns the store (every campaign and server lane).
  if custom.query_is_store_owner() then
    return;
  end if;

  if p_subject_id is null then
    return;
  end if;

  -- Way through 2: no signed-in person at all — the anonymous capture door, which has
  -- already decided this write against the form's own token.
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;

  -- Way through 3: a subject that does not live in this organization (the kernel Tables),
  -- or that is not there at all (the door raises its own 02000 a line later).
  select r.organization_id into v_subject_org
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_subject_id;
  if v_subject_org is null then
    return;
  end if;

  if iam.has_access_for(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  raise exception 'You do not have access to this %, so % may not write to it.',
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization. Being a member of the organization is not by itself permission to rewrite somebody else''s row.',
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            p_required);
end
$function$;

revoke all on function custom.assert_client_may_change(uuid, uuid, text, public.permission_level, text) from public;

-- ── The four doors. Bodies otherwise byte-identical to the `-- based-on:` versions. ──────

create or replace function custom.record_write(p_organization_id uuid, p_table_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_id uuid;
begin
  -- The switch, then the organization, then the Table this record is being added to.
  -- `current_user` in here is already the definer; both predicates read the caller.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_write',
                                          'editor'::public.permission_level, 'table');

  if p_organization_id is null then
    raise exception 'custom.record_write: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, p_table_id, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end
$function$;

create or replace function custom.record_update(p_organization_id uuid, p_record_id uuid, p_patch jsonb, p_expected_version integer default null::integer)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_new       integer;
  v_current   integer;
  v_contested jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_update');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_update');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_update: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'custom.record_update: the patch must be an object of field key -> value, and it is a %', coalesce(jsonb_typeof(p_patch), 'nothing')
      using errcode = '22023';
  end if;

  -- THE OPT-IN POSTURE, KEPT. A write that declares no base revision behaves exactly as a
  -- direct UPDATE always has: last-write-wins.
  if p_expected_version is null then
    update custom.record
       set data = data || p_patch
     where organization_id = p_organization_id and id = p_record_id and deleted_at is null
    returning version into v_new;
    if v_new is null then
      raise exception 'There is no record % in this organization any more.', p_record_id
        using errcode = '02000',
              hint = 'It was deleted, or it never existed here. The store is keyed (organization_id, id), so a record from another organization is not found by this one.';
    end if;
    return v_new;
  end if;

  -- THE COMPARE-AND-SWAP.
  update custom.record
     set data = data || p_patch
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
     and version = p_expected_version
  returning version into v_new;
  if v_new is not null then
    return v_new;
  end if;

  select r.version into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_current is null then
    raise exception 'There is no record % in this organization any more - somebody deleted it while you were working on it.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was written. The record is gone, so there is nothing to merge into: keep your work somewhere else, or write it as a new record.';
  end if;

  select jsonb_object_agg(k.key, r.data -> k.key) into v_contested
    from custom.record r, lateral jsonb_object_keys(p_patch) k(key)
   where r.organization_id = p_organization_id and r.id = p_record_id;

  raise exception 'Someone else changed this record while you were working on it. You wrote against version %, and version % is the one that won.',
                  p_expected_version, v_current
    using errcode = 'PT409',
          detail = jsonb_build_object('expected_version', p_expected_version,
                                      'current_version',  v_current,
                                      'contested_fields', coalesce(v_contested, '{}'::jsonb))::text,
          hint = format('Nothing was overwritten and nothing was lost - their work is still there and yours is still in your hands. Look at what changed (it is in this error, field by field), decide keep-mine, keep-theirs or merged, and write it again against version %s. Resolution is just another write.', v_current);
end
$function$;

create or replace function custom.record_delete(p_organization_id uuid, p_record_id uuid)
returns timestamp with time zone
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_at timestamptz;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_delete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_delete');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_delete: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
  returning deleted_at into v_at;

  if v_at is null then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was already deleted, so nothing changed.'
        using errcode = '02000',
              hint = 'REC-23: it is still here and still reversible - custom.record_restore(organization, record) brings it back.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was deleted. The store is keyed (organization_id, id), so a record of another organization is not found by this one.';
  end if;
  return v_at;
end
$function$;

create or replace function custom.record_restore(p_organization_id uuid, p_record_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_rows bigint;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_restore');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_restore');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_restore: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  update custom.record
     set deleted_at = null
   where organization_id = p_organization_id and id = p_record_id and deleted_at is not null;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was not deleted, so there was nothing to bring back.'
        using errcode = '02000', hint = 'REC-23: it is already here.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'REC-23: a record is reversible while its table still keeps its history, and this one is not in this organization at all.';
  end if;
end
$function$;

-- ── The census, as a function, so a later door cannot be added without the question. ─────

create or replace function custom.doors_not_deciding_the_record()
returns table(function_name text, identity_args text, why text)
language sql
stable
set search_path to 'pg_catalog'
as $function$
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid),
         'takes a record or table id and writes a record, and its body decides neither the row nor an anonymous token'::text
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and pg_get_function_identity_arguments(p.oid) ~ '(p_record_id uuid|p_table_id uuid)'
     and pg_get_functiondef(p.oid) ~* '(insert into custom\.record|update custom\.record|custom\.record_write|custom\.record_update|custom\.record_delete|custom\.record_restore|snapshot_restore)'
     and pg_get_functiondef(p.oid) !~* '(assert_client_may_change|has_access_for|has_visibility|anon_token_verify)'
   order by 1;
$function$;

revoke all on function custom.doors_not_deciding_the_record() from public;
