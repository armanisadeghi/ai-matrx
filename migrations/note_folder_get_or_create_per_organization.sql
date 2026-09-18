-- note_folder_get_or_create_per_organization — ONE ATOMIC DOOR FOR "THE FOLDER NAMED X IN THIS ORG"
-- (Notes. ADDITIVE: creates one SECURITY INVOKER function and one EXECUTE grant. Changes no row,
--  table, index, policy or trigger. Its removal half is the chair step
--  `chair_step_2026_09_18_note_folders_org_blind_name_key.sql`.)
--
-- WHAT WAS MEASURED, ON THIS DATABASE, 2026-09-18
-- `workbench.note_folders` carries TWO unique name keys:
--   note_folders_created_by_name_unique                (created_by, name)                 2026-07-04
--   note_folders_organization_created_by_name_unique   (organization_id, created_by, name) WHERE deleted_at IS NULL
-- The first ignores the organization, so one person may own ONE folder called "Draft" across every
-- organization they belong to. The browser's `createFolder` upserted against that first key; every
-- "+" on /notes files the new note under "Draft" in the ACTIVE organization; so for a person whose
-- "Draft" lives in another organization the "+" could never succeed (31 people belong to more than
-- one organization; Arman's "Draft" is in his personal organization, his tab was on AI Matrx).
-- Before 2026-09-12 the same collision silently reused the OTHER organization's folder — 130 live
-- notes sit in a folder that belongs to a different organization than the note.
--
-- WHY A FUNCTION AND NOT A CLIENT UPSERT
-- The organization-qualified key is PARTIAL (a removed folder must stop holding its name,
-- db-rules §8). PostgREST's `on_conflict` cannot name a partial index as the arbiter, so a plain
-- client upsert against it fails with 42P10. The get-or-create therefore lives here, where
-- `ON CONFLICT (...) WHERE deleted_at IS NULL` can be written — one round trip, atomic, and no 409
-- for the error capture to file on every ordinary "folder already exists".
--
-- SECURITY INVOKER ON PURPOSE. The caller's own RLS decides everything: `std_insert` admits the row
-- only when `created_by = auth.uid()` and the caller has access to the organization. The function
-- adds no authority, so it is not a §6d-4 door and needs no `platform.client_callable_door` row.
--
-- BEFORE AND AFTER THE CHAIR STEP. While the org-blind key is still live, an insert that collides
-- with it raises 23505 from THAT index; this function turns it into one named, translatable refusal
-- (`notes_folder_cross_org_legacy_key`) instead of a raw constraint name. Once the chair step drops
-- the key the branch is unreachable and the same call simply creates the folder — no second deploy.

create function workbench.note_folder_get_or_create(p_organization_id uuid, p_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_actor uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_id    uuid;
begin
  if v_actor is null then
    raise exception using errcode = '28000',
      message = 'notes_folder_unauthenticated: sign in before creating a folder.';
  end if;
  if p_organization_id is null then
    raise exception using errcode = '22004',
      message = 'notes_folder_organization_required: a folder is created in an explicit organization.';
  end if;
  if v_name = '' then
    raise exception using errcode = '22023',
      message = 'notes_folder_name_required: a folder needs a name.';
  end if;

  select f.id into v_id
    from workbench.note_folders f
   where f.organization_id = p_organization_id
     and f.created_by = v_actor
     and f.name = v_name
     and f.deleted_at is null;
  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into workbench.note_folders (created_by, name, path, position, organization_id)
    values (v_actor, v_name, v_name, 0, p_organization_id)
    on conflict (organization_id, created_by, name) where deleted_at is null do nothing
    returning id into v_id;
  exception when unique_violation then
    -- The arbiter above absorbs a same-organization race. Anything that still collides is another
    -- key; the only other name key is the retired org-blind one.
    if exists (
      select 1 from workbench.note_folders f
       where f.created_by = v_actor and f.name = v_name
         and f.organization_id is distinct from p_organization_id
    ) then
      raise exception using errcode = '23505',
        message = 'notes_folder_cross_org_legacy_key: this person already owns a folder with this name in another organization, and the retired (created_by, name) key is still live.',
        hint = 'Apply chair_step_2026_09_18_note_folders_org_blind_name_key.sql.';
    end if;
    raise;
  end;

  if v_id is null then
    -- DO NOTHING fired: a concurrent call created it between the read and the insert.
    select f.id into v_id
      from workbench.note_folders f
     where f.organization_id = p_organization_id
       and f.created_by = v_actor
       and f.name = v_name
       and f.deleted_at is null;
  end if;
  if v_id is null then
    raise exception using errcode = 'P0002',
      message = 'notes_folder_not_visible: the folder exists but this caller cannot read it.';
  end if;
  return v_id;
end
$fn$;

comment on function workbench.note_folder_get_or_create(uuid, text) is
  'Atomic get-or-create of the caller''s own note folder named p_name in p_organization_id. SECURITY INVOKER: RLS decides. The one writer of new note_folders rows from the browser.';

-- PUBLIC/anon EXECUTE is taken back by the `close_new_functions_to_anon` event trigger (DD-202);
-- the proof below asserts it, so this file carries no removal statement of its own.
grant execute on function workbench.note_folder_get_or_create(uuid, text) to authenticated, service_role;

do $proof$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'workbench' and p.proname = 'note_folder_get_or_create' and not p.prosecdef
  ) then
    raise exception 'note_folder_get_or_create: function is absent or is SECURITY DEFINER';
  end if;
  if not has_function_privilege('authenticated', 'workbench.note_folder_get_or_create(uuid, text)', 'execute') then
    raise exception 'note_folder_get_or_create: authenticated cannot execute it';
  end if;
  if has_function_privilege('anon', 'workbench.note_folder_get_or_create(uuid, text)', 'execute') then
    raise exception 'note_folder_get_or_create: anon can execute it';
  end if;
end
$proof$;

notify pgrst, 'reload schema';
