-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.io_import_open(uuid, uuid, text, text, jsonb) 88ae64f6bd5a717d08fc69c10853c9f377588404a721b36088fae1eb900483da
--
-- chair-step: it GRANTS EXECUTE to `authenticated` on ONE new function of schema `custom`
--   (`custom.io_import_begin`). The grant is the one shape this runner's allow-list refuses by
--   name, and it is the point of the file: without it no screen and no agent can open an
--   import that knows which file it is. It is SECURITY DEFINER, asks the switch, the
--   organization wall and the editor rung by name before it reads or writes anything, and it
--   writes only to `custom.io_import` — never to `custom.record`. Seven columns are ADDED to
--   `custom.io_import`, all nullable or defaulted, plus one partial index. One existing
--   function (`custom.io_import_open`) is REPLACED in place with its exact signature and
--   keeps its existing grant, so nothing that calls it has to change. Nothing is dropped,
--   nothing is revoked, no row of any feature is deleted or rewritten. The inverse is
--   `migrations/inverse/import_a_file_lands_once_down.sql`.
--
-- LANE IMPORT (PRODUCTS row 9) — "PULL MY SPREADSHEET IN."
--
-- DOOR-11 · SCR-10 · SCR-N-7. W4-IO built the pipe: `custom.io_import_open` opens a run,
-- `custom.io_import_rows` maps a batch onto Fields and writes every row through the ONE write
-- door, and an unmapped column becomes a proposal. Measured on the main database 2026-09-20,
-- four things a person doing this for real needs were not there, and each one is a way to
-- lose data quietly:
--
--   1. NOTHING MADE A RE-IMPORT SAFE. `io_import_open` took no file identity at all, so
--      dropping the same spreadsheet in twice wrote every row twice and the second run looked
--      exactly as successful as the first. Airtable and HubSpot both key an import so the
--      second pass is a no-op or an update; this had no key of any kind.
--   2. NOTHING NOTICED A ROW THAT WAS ALREADY THERE. There was no duplicate key, so "landed"
--      and "landed again" were the same outcome with the same green number.
--   3. A ROW THAT LANDED CARRIED NO PROVENANCE. The values went in as `system` with no source,
--      although VAL-1 exists precisely so a value can say where it came from. Six months later
--      nobody could tell an imported cell from a typed one.
--   4. THE OUTCOMES WERE A COUNT AND A LIST OF REFUSALS WITH NO ROW ON THEM. `refusals` held
--      `{row, sqlstate, reason}` — a row NUMBER, into a file the screen no longer has. You
--      could be told row 3,184 was refused and never find out which row that was.
--
-- WHAT THIS FILE MAKES TRUE
--
--   * An import run has an IDENTITY: the sha-256 of the file's bytes. Opening a run for a file
--     whose hash already landed on this Table answers the FIRST run and writes nothing, so a
--     re-import doubles nothing. `force` re-opens deliberately and says so on the run.
--   * A run carries a DUPLICATE KEY (a Field key) and a POLICY. A row whose key value is
--     already in the Table is `duplicate` — skipped, or applied as a patch to the record that
--     is already there, whichever the policy says — never a second record nobody asked for.
--   * Every value a row lands carries its source: `{"kind":"import", ...}` in the record's own
--     provenance block, interned by the store exactly as VAL-1 says, plus a `_source` block
--     naming the run and the file — the same shape lane FORMS writes for a form answer.
--   * Every row has an OUTCOME the screen can click: landed with the record id, refused with
--     the store's own sentence AND the source row that was refused, or duplicate with the id
--     of the record that was already there. The refused and duplicate rows are KEPT on the run
--     (capped, and the cap says so out loud) so a person can come back to them tomorrow.
--
-- WHY THE OUTCOMES ARE CAPPED AND SAID SO. A five-thousand-row file whose every row is refused
-- would put five thousand documents inside one jsonb column. The run keeps the first 500 of
-- each interesting kind and counts the rest, and `custom.io_import_report` states the cap when
-- it has been reached. A number with nothing behind it is the failure this closes; a number
-- that says "and 4,500 more like these, not kept" is honest.
--
-- LANDED ROWS ARE NOT KEPT ON THE RUN, on purpose: they are records of the Table, which is
-- where a person looks for them. The per-row landed outcomes come back in the RETURN of the
-- batch that wrote them, which is where a screen needs them.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE RUN'S IDENTITY, POLICY AND OUTCOMES. All additive; every existing row
--    keeps working because every column is nullable or defaulted.
-- ─────────────────────────────────────────────────────────────────────────────

alter table custom.io_import add column if not exists file_hash       text;
alter table custom.io_import add column if not exists file_bytes      bigint;
alter table custom.io_import add column if not exists dedupe_key      text;
alter table custom.io_import add column if not exists policy          jsonb not null default '{}'::jsonb;
alter table custom.io_import add column if not exists duplicates      jsonb not null default '[]'::jsonb;
alter table custom.io_import add column if not exists rows_duplicate  integer not null default 0;
alter table custom.io_import add column if not exists finished_at     timestamptz;

comment on column custom.io_import.file_hash is
  'The sha-256 of the file''s bytes, lower-case hex. It is the run''s identity: a second run '
  'for the same bytes on the same Table answers the first run and writes nothing, so a '
  're-import doubles nothing. Null for a run opened without one (a pasted paste, an agent '
  'handing over rows it built), which is honest rather than a fabricated hash.';
comment on column custom.io_import.dedupe_key is
  'The Field key a person chose as the duplicate key. A row whose value for this key is '
  'already in the Table is an outcome of its own — never a second record.';
comment on column custom.io_import.policy is
  'What this run does when it meets something: {"on_duplicate":"skip"|"update", '
  '"unmapped":"propose"|"create"|"ignore"}. Defaults are skip and propose — the two that '
  'cannot lose anything.';

create index if not exists io_import_file_hash_idx
  on custom.io_import (organization_id, table_id, file_hash)
  where file_hash is not null and deleted_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. custom.io_import_begin — OPEN A RUN, OR HAND BACK THE ONE THAT ALREADY RAN.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.io_import_begin(
  p_organization_id uuid,
  p_table_id        uuid,
  p_format          text    default 'csv',
  p_source_name     text    default null,
  p_source_columns  jsonb   default '[]'::jsonb,
  p_file_hash       text    default null,
  p_policy          jsonb   default '{}'::jsonb,
  p_dedupe_key      text    default null,
  p_file_bytes      bigint  default null,
  p_force           boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_prior  custom.io_import;
  v_policy jsonb;
  v_dupes  text;
  v_unmap  text;
  v_id     uuid;
begin
  -- THE SWITCH, THE WALL, THE RUNG — all three by name, before anything is read or written.
  -- Opening an import is a change to the Table's contents, so it is the editor rung, exactly
  -- as `custom.io_import_open` has always asked.
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_begin');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_begin');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.io_import_begin',
                                          'editor'::public.permission_level, 'table');

  if p_organization_id is null or p_table_id is null then
    raise exception 'An import belongs to one organization and one table, and this one does not say which.'
      using errcode = '22004';
  end if;
  if coalesce(p_format, '') not in ('csv', 'xlsx') then
    raise exception 'A file is read as a spreadsheet (xlsx) or as a comma-separated file (csv), and "%" is neither.', p_format
      using errcode = '22023',
            hint = 'The parse differs; nothing after it does.';
  end if;

  v_policy := coalesce(p_policy, '{}'::jsonb);
  v_dupes  := lower(coalesce(nullif(btrim(coalesce(v_policy ->> 'on_duplicate', '')), ''), 'skip'));
  v_unmap  := lower(coalesce(nullif(btrim(coalesce(v_policy ->> 'unmapped', '')), ''), 'propose'));
  if v_dupes not in ('skip', 'update') then
    raise exception 'A row that is already here is either left alone ("skip") or brought up to date ("update"), and this import asked for "%".', v_dupes
      using errcode = '22023',
            hint = 'Nothing was opened. Writing a second copy is not one of the choices, which is the whole point of naming a duplicate key.';
  end if;
  if v_unmap not in ('propose', 'create', 'ignore') then
    raise exception 'A column this table does not have is offered as a new column ("propose"), added outright ("create") or left out ("ignore"), and this import asked for "%".', v_unmap
      using errcode = '22023', hint = 'Nothing was opened.';
  end if;
  -- ADDING A COLUMN OUTRIGHT IS AN ADMIN'S ACT, AND IT IS ASKED HERE RATHER THAN AT THE END.
  -- A person who chose "just add them" and is told at the end of a 5,000-row run that they
  -- may not has been made to wait for a refusal the store knew at the start.
  if v_unmap = 'create'
     and custom.my_level(p_organization_id, p_table_id, 'table') <> 'admin'::public.permission_level
     and not custom.query_is_store_owner() then
    raise exception 'Adding columns to this table outright is for its admins. Your columns can still be OFFERED, and whoever admins this table decides.'
      using errcode = '42501',
            hint = 'Open the import with unmapped set to "propose" and every new column goes to the approvals inbox instead. Nothing was opened.';
  end if;
  if nullif(btrim(coalesce(p_dedupe_key, '')), '') is not null
     and not exists (select 1 from custom.applicable_fields(p_organization_id, p_table_id, null) f
                      where f.data ->> 'key' = btrim(p_dedupe_key)) then
    raise exception 'This table has no column called "%", so it cannot be what makes a row the same row.', btrim(p_dedupe_key)
      using errcode = '23503',
            hint = 'The columns are: ' ||
                   coalesce((select string_agg(coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'), ', ' order by f.data ->> 'key')
                               from custom.applicable_fields(p_organization_id, p_table_id, null) f), '(none yet)') ||
                   '. Nothing was opened.';
  end if;

  -- THE SAME FILE, TWICE. This is the whole of "a re-import doubles nothing", and it is
  -- decided here rather than per row: the second run is never opened at all, so there is no
  -- half-run to reconcile and no second set of proposals for the same columns.
  if nullif(btrim(coalesce(p_file_hash, '')), '') is not null and not coalesce(p_force, false) then
    select * into v_prior
      from custom.io_import i
     where i.organization_id = p_organization_id
       and i.table_id = p_table_id
       and i.file_hash = btrim(p_file_hash)
       and i.deleted_at is null
     order by i.created_at
     limit 1;
    if found then
      return jsonb_build_object(
        'import_id',     v_prior.id,
        'state',         v_prior.state,
        'already',       true,
        'opened_at',     v_prior.created_at,
        'rows_seen',     v_prior.rows_seen,
        'rows_written',  v_prior.rows_written,
        'rows_duplicate',v_prior.rows_duplicate,
        'source_name',   v_prior.source_name,
        'message',       format('This file was already imported into this table on %s — %s row%s landed then. Nothing was written again.',
                                to_char(v_prior.created_at at time zone 'utc', 'FMDay FMDD FMMonth, HH24:MI'),
                                v_prior.rows_written,
                                case when v_prior.rows_written = 1 then '' else 's' end));
    end if;
  end if;

  insert into custom.io_import (organization_id, table_id, format, source_name, source_columns,
                                file_hash, file_bytes, dedupe_key, policy, state)
  values (p_organization_id, p_table_id, p_format, p_source_name,
          coalesce(p_source_columns, '[]'::jsonb),
          nullif(btrim(coalesce(p_file_hash, '')), ''),
          p_file_bytes,
          nullif(btrim(coalesce(p_dedupe_key, '')), ''),
          jsonb_build_object('on_duplicate', v_dupes, 'unmapped', v_unmap)
            || (v_policy - 'on_duplicate' - 'unmapped')
            || case when coalesce(p_force, false) then jsonb_build_object('forced', true) else '{}'::jsonb end,
          'open')
  returning id into v_id;

  return jsonb_build_object('import_id', v_id, 'state', 'open', 'already', false,
                            'rows_seen', 0, 'rows_written', 0, 'rows_duplicate', 0,
                            'source_name', p_source_name,
                            'message', 'Ready. Send the rows in batches.');
end;
$function$;

-- The door W4-IO shipped, kept EXACTLY as it was to every caller, and now one line over the
-- new one. Two implementations of "open an import" is how two imports start behaving
-- differently; there is one.
create or replace function custom.io_import_open(
  p_organization_id uuid,
  p_table_id        uuid,
  p_format          text  default 'csv',
  p_source_name     text  default null,
  p_source_columns  jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v jsonb;
begin
  v := custom.io_import_begin(p_organization_id, p_table_id, p_format, p_source_name,
                              p_source_columns, null, '{}'::jsonb, null, null, false);
  return (v ->> 'import_id')::uuid;
end;
$function$;

-- ── DECLARE, THEN GRANT. `platform.enforce_definer_client_grants` fires ON THE GRANT, so a
--    grant issued before its declaration is taken straight back inside the same transaction
--    while the run still reports success (lane WORK-DOORS measured exactly that).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', 'io_import_begin', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false,
       'migrations/campaign/import_a_file_lands_once.sql (lane IMPORT)',
       'Open an import run that knows WHICH FILE it is. The same bytes into the same table a second time answer the first run and write nothing, so a re-import doubles nothing. Carries the duplicate key and the policy the rest of the run obeys.'
  from pg_proc p
 where p.proname = 'io_import_begin' and p.pronamespace = 'custom'::regnamespace
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = 'io_import_begin'
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.io_import_begin(uuid, uuid, text, text, jsonb, text, jsonb, text, bigint, boolean) to authenticated;

