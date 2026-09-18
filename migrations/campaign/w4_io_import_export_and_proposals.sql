-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
--
-- W4-IO, file 3 — IMPORT AND EXPORT THROUGH THE DOORS, AND THE FIELD PROPOSAL.
--
-- DOOR-11 (CSV and XLSX import and export) · DOOR-14 (an unmapped column becomes a field
-- proposal a table admin approves).
--
-- THE ROUND TRIP IS THE POINT, AND IT IS A COMPARISON, NOT A SMOKE TEST. Export writes bytes;
-- import parses bytes; the suite parses what export produced and compares it to the source
-- rows FIELD BY FIELD. An import/export pair that agrees only on row count passes while
-- silently dropping every value in a column whose header had a space in it.
--
-- WHERE CSV IS PARSED AND WHERE XLSX IS, SAID PLAINLY RATHER THAN FUDGED. CSV is text, so it
-- is parsed and rendered HERE, in `custom.io_csv_parse` / `custom.io_csv_render`, to RFC 4180:
-- quoted fields, embedded commas, embedded newlines, and `""` as a literal quote. XLSX is a
-- ZIP container of XML parts; Postgres cannot unzip, and a function claiming to read XLSX by
-- pattern-matching bytes would be a lie that passes a test written by the same author. So the
-- XLSX half of the door takes ROWS — the workbook's cells, already parsed by the records
-- package that owns file bytes — and everything after the parse is the same code on the same
-- path, with `format` recorded so a run says which it was. That is the honest split, and it is
-- also the right one: Airtable, Notion and Smartsheet all parse the workbook in the
-- application and write rows through one import pipeline.
--
-- EVERY ROW GOES THROUGH `custom.record_write`. Not one INSERT in this file touches
-- `custom.record`. An importer that wrote rows directly would skip validation, the value
-- envelope, the provenance stamp, the rule pass and — since file 2 — the outbox, so a
-- ten-thousand-row import would land ten thousand records and raise no automation at all.
--
-- DOOR-14, AND WHY A PROPOSAL IS A ROW. A column the file carries and the Table has no Field
-- for is not an error and not something to silently drop: it is an offer. The run records it
-- with a sample of its values and the type inferred from them, and it sits there until a table
-- admin accepts or rejects it. Accepting MINTS THE FIELD through the same door a hand-made
-- Field goes through — `custom.record_write` onto the Field kernel — so an accepted proposal
-- and a hand-made Field are the same object, not two kinds of Field.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── RFC 4180, in one function, because "split on comma" is wrong ──────────────
create function custom.io_csv_parse(p_text text, p_delimiter text default ',')
returns table(row_number integer, cells text[])
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_delim char := coalesce(nullif(p_delimiter, ''), ',');
  v_i     integer := 1;
  v_len   integer := length(coalesce(p_text, ''));
  v_ch    char;
  v_cell  text := '';
  v_row   text[] := array[]::text[];
  v_q     boolean := false;
  v_n     integer := 0;
  v_any   boolean := false;
begin
  while v_i <= v_len loop
    v_ch := substr(p_text, v_i, 1);
    if v_q then
      if v_ch = '"' then
        -- "" inside a quoted field is ONE literal quote. Getting this wrong is how a CSV
        -- containing 6" pipe silently becomes a CSV containing 6 pipe.
        if substr(p_text, v_i + 1, 1) = '"' then
          v_cell := v_cell || '"'; v_i := v_i + 1;
        else
          v_q := false;
        end if;
      else
        v_cell := v_cell || v_ch;
      end if;
    elsif v_ch = '"' then
      v_q := true; v_any := true;
    elsif v_ch = v_delim then
      v_row := v_row || v_cell; v_cell := ''; v_any := true;
    elsif v_ch = chr(13) then
      null;  -- CRLF: the CR belongs to the line ending, never to the value.
    elsif v_ch = chr(10) then
      v_row := v_row || v_cell;
      if v_any or array_length(v_row, 1) > 1 or v_row[1] <> '' then
        v_n := v_n + 1; row_number := v_n; cells := v_row; return next;
      end if;
      v_row := array[]::text[]; v_cell := ''; v_any := false;
    else
      v_cell := v_cell || v_ch; v_any := true;
    end if;
    v_i := v_i + 1;
  end loop;
  -- A last line with no trailing newline is still a line.
  if v_any or v_cell <> '' or array_length(v_row, 1) > 0 then
    v_row := v_row || v_cell;
    v_n := v_n + 1; row_number := v_n; cells := v_row; return next;
  end if;
  return;
end;
$fn$;

comment on function custom.io_csv_parse(text, text) is
  'DOOR-11: RFC 4180 CSV parse — quoted fields, embedded delimiters, embedded newlines, "" as a literal quote, CRLF or LF. "split on comma" is wrong on the first real file.';

create function custom.io_csv_escape(p_value text, p_delimiter text default ',')
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select case
           when p_value is null then ''
           when p_value ~ ('[' || '"' || chr(10) || chr(13) || ']')
                or position(coalesce(nullif(p_delimiter, ''), ',') in p_value) > 0
             then '"' || replace(p_value, '"', '""') || '"'
           else p_value
         end;
$fn$;

comment on function custom.io_csv_escape(text, text) is
  'DOOR-11: the render half of RFC 4180 — a value carrying a quote, a delimiter or a newline is quoted and its quotes doubled, so what export writes is what import reads back.';

-- ── the import run ───────────────────────────────────────────────────────────
create function custom.io_import_open(p_organization_id uuid,
                                      p_table_id uuid,
                                      p_format text default 'csv',
                                      p_source_name text default null,
                                      p_source_columns jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_id uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_open');
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.io_import_open: an import belongs to one organization and one Table; both are required'
      using errcode = '22004';
  end if;
  if coalesce(p_format, '') not in ('csv', 'xlsx') then
    raise exception 'custom.io_import_open: format is csv or xlsx, not "%". The parse differs; nothing after it does.', p_format
      using errcode = '22023';
  end if;
  insert into custom.io_import (organization_id, table_id, format, source_name, source_columns, state)
  values (p_organization_id, p_table_id, p_format, p_source_name,
          coalesce(p_source_columns, '[]'::jsonb), 'open')
  returning id into v_id;
  return v_id;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_import_open',
        'p_organization_id uuid, p_table_id uuid, p_format text, p_source_name text, p_source_columns jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id is the tenant the run belongs to and is checked by custom.assert_store_door on entry; NULL is refused by name. p_table_id is the Table the rows will be written into; NULL is refused, and it is not trusted for access — every row written later goes through custom.record_write, which makes its own access decision per row.',
        'w4_io_import_export_and_proposals.sql',
        'server_only: file bytes are parsed by the records package on the server (a browser does not hand SQL a workbook), so the run is opened by the same lane that will feed it rows.',
        false, false)
on conflict do nothing;

-- ── the rows, written through the ONE write door ─────────────────────────────
create function custom.io_import_rows(p_organization_id uuid,
                                      p_import_id uuid,
                                      p_rows jsonb,
                                      p_mapping jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_run       custom.io_import;
  v_row       jsonb;
  v_doc       jsonb;
  v_key       text;
  v_val       jsonb;
  v_mapped    text;
  v_seen      integer := 0;
  v_written   integer := 0;
  v_refusals  jsonb := '[]'::jsonb;
  v_unmapped  jsonb := '{}'::jsonb;
  v_proposals jsonb := '[]'::jsonb;
  v_fields    text[];
  v_id        uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_rows');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'custom.io_import_rows: no open import run % for this organization', p_import_id
      using errcode = '23503';
  end if;

  select coalesce(array_agg(f.key), array[]::text[]) into v_fields
    from custom.field f where f.organization_id = p_organization_id;

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_seen := v_seen + 1;
    v_doc := '{}'::jsonb;
    for v_key, v_val in select key, value from jsonb_each(v_row) loop
      -- The mapping is authored (a person chose), or it is the identity (the header already
      -- spells a Field key). Both are the same row here: a mapped column is a mapped column.
      v_mapped := coalesce(p_mapping ->> v_key, v_run.mapping ->> v_key,
                           case when v_key = any (v_fields) then v_key else null end);
      if v_mapped is null then
        -- DOOR-14: not an error, an OFFER. Remember it with a sample so the proposal can say
        -- what the column actually looked like rather than merely that it existed.
        v_unmapped := v_unmapped || jsonb_build_object(
          v_key, coalesce(v_unmapped -> v_key, '[]'::jsonb) ||
                 case when jsonb_array_length(coalesce(v_unmapped -> v_key, '[]'::jsonb)) < 5
                      then jsonb_build_array(v_val) else '[]'::jsonb end);
      else
        v_doc := v_doc || jsonb_build_object(v_mapped, v_val);
      end if;
    end loop;

    begin
      -- THE ONE WRITE DOOR. Validation, the value envelope, provenance, the rules and the
      -- outbox all hang off this call; an INSERT here would skip every one of them.
      v_id := custom.record_write(p_organization_id, v_run.table_id,
                                  v_doc || jsonb_build_object('_actor', 'import'));
      v_written := v_written + 1;
    exception when others then
      -- A refusal is RECORDED, never swallowed and never fatal to the run. An import that
      -- half worked must be able to say which half, by row number and by reason.
      v_refusals := v_refusals || jsonb_build_array(
        jsonb_build_object('row', v_seen, 'sqlstate', sqlstate, 'reason', sqlerrm));
    end;
  end loop;

  -- The proposals, built once at the end from everything the run saw.
  select coalesce(jsonb_agg(jsonb_build_object(
           'column', u.key,
           'samples', u.value,
           'inferred_type', custom.io_infer_type(u.value),
           'state', 'proposed')), '[]'::jsonb)
    into v_proposals
    from jsonb_each(v_unmapped) u;

  update custom.io_import
     set rows_seen    = rows_seen + v_seen,
         rows_written = rows_written + v_written,
         refusals     = refusals || v_refusals,
         proposals    = case when v_proposals = '[]'::jsonb then proposals else v_proposals end,
         mapping      = mapping || coalesce(p_mapping, '{}'::jsonb),
         state        = 'written'
   where organization_id = p_organization_id and id = p_import_id;

  return jsonb_build_object('import_id', p_import_id, 'rows_seen', v_seen,
                            'rows_written', v_written, 'refusals', v_refusals,
                            'proposals', v_proposals);
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_import_rows',
        'p_organization_id uuid, p_import_id uuid, p_rows jsonb, p_mapping jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. p_import_id must name a run of THAT organization — the SELECT is keyed on both columns, so an id from another tenant is "no open import run" rather than a cross-tenant write. Every row is then written through custom.record_write, which makes its own per-row access decision; this function grants nothing.',
        'w4_io_import_export_and_proposals.sql',
        'server_only: the caller hands over already-parsed rows from a file the server read; a browser uploads the file, it does not hand SQL ten thousand rows.',
        false, false)
on conflict do nothing;

-- ── the type a column looks like, from what is actually in it ────────────────
create function custom.io_infer_type(p_samples jsonb)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- Deliberately conservative, and it answers `text` when it is not sure. A proposal that
  -- guesses "number" off three rows and is wrong makes a person fix data later; a proposal
  -- that says "text" makes them change a dropdown now.
  with s as (select value #>> '{}' as v from jsonb_array_elements(coalesce(p_samples, '[]'::jsonb))
              where value #>> '{}' is not null and btrim(value #>> '{}') <> '')
  select case
           when not exists (select 1 from s) then 'text'
           when not exists (select 1 from s where v !~ '^[+-]?[0-9]+$') then 'number'
           when not exists (select 1 from s where v !~ '^[+-]?[0-9]*[.][0-9]+$' and v !~ '^[+-]?[0-9]+$') then 'number'
           when not exists (select 1 from s where lower(v) not in ('true','false','yes','no','y','n')) then 'checkbox'
           when not exists (select 1 from s where v !~ '^\d{4}-\d{2}-\d{2}$') then 'date'
           when not exists (select 1 from s where v !~ '^[^@\s]+@[^@\s]+[.][^@\s]+$') then 'email'
           else 'text'
         end;
$fn$;

comment on function custom.io_infer_type(jsonb) is
  'DOOR-14: the type a proposed column looks like, from its own values. Conservative on purpose — it answers text when unsure, because a wrong "number" costs a data repair and a wrong "text" costs one dropdown.';

-- ── DOOR-14: accepting a proposal MINTS a Field through the same door ────────
create function custom.io_proposal_accept(p_organization_id uuid,
                                          p_import_id uuid,
                                          p_column text,
                                          p_type text default null,
                                          p_label text default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_run      custom.io_import;
  v_proposal jsonb;
  v_type     text;
  v_key      text;
  v_field_id uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_proposal_accept');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'custom.io_proposal_accept: no import run % for this organization', p_import_id
      using errcode = '23503';
  end if;

  select p into v_proposal
    from jsonb_array_elements(v_run.proposals) p
   where p ->> 'column' = p_column
   limit 1;
  if v_proposal is null then
    raise exception 'custom.io_proposal_accept: import run % proposed no column "%". Its proposals are %.',
      p_import_id, p_column, coalesce((select string_agg(p ->> 'column', ', ')
                                         from jsonb_array_elements(v_run.proposals) p), '(none)')
      using errcode = '23503';
  end if;
  if v_proposal ->> 'state' = 'accepted' then
    raise exception 'custom.io_proposal_accept: "%" was already accepted on this run. Accepting twice would mint a second Field with the same key.', p_column
      using errcode = '23505';
  end if;

  v_type := coalesce(nullif(btrim(coalesce(p_type, '')), ''), v_proposal ->> 'inferred_type', 'text');
  -- The key is the column's own name, lowered and de-spaced, because that is what the next
  -- import of the same file will match on without anyone authoring a mapping.
  v_key := regexp_replace(lower(btrim(p_column)), '[^a-z0-9]+', '_', 'g');
  v_key := btrim(v_key, '_');
  if v_key = '' then
    raise exception 'custom.io_proposal_accept: column "%" leaves no usable Field key', p_column
      using errcode = '22023';
  end if;

  -- THE SAME DOOR A HAND-MADE FIELD GOES THROUGH. An accepted proposal is a Field, not a
  -- second kind of Field, so nothing downstream ever has to ask where a Field came from.
  v_field_id := custom.record_write(
    p_organization_id, custom.field_kernel_id(),
    jsonb_build_object('key', v_key,
                       'label', coalesce(nullif(btrim(coalesce(p_label, '')), ''), btrim(p_column)),
                       'type', v_type,
                       'table_token', (select t.data ->> 'token' from custom.record t
                                        where t.organization_id = p_organization_id
                                          and t.id = v_run.table_id),
                       'source', 'import_proposal',
                       'source_config', jsonb_build_object('import_id', p_import_id,
                                                           'source_column', p_column),
                       '_actor', 'import'));

  update custom.io_import
     set proposals = (select jsonb_agg(case when p ->> 'column' = p_column
                                            then p || jsonb_build_object('state', 'accepted',
                                                                         'field_id', v_field_id)
                                            else p end)
                        from jsonb_array_elements(proposals) p),
         mapping   = mapping || jsonb_build_object(p_column, v_key)
   where organization_id = p_organization_id and id = p_import_id;

  return v_field_id;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_proposal_accept',
        'p_organization_id uuid, p_import_id uuid, p_column text, p_type text, p_label text',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. p_import_id must name a run of THAT organization (the SELECT is keyed on both), so a proposal from another tenant reads as absent. The Field itself is minted through custom.record_write onto the Field kernel, which makes its own access decision — this function creates no privilege.',
        'w4_io_import_export_and_proposals.sql',
        'server_only until the grid ships the accept control: the records package offers the proposal in the import review screen and calls this from the server lane. When the UI calls it directly this row becomes signed_in_callers = true in the migration that makes that true, not before.',
        false, false)
on conflict do nothing;

create function custom.io_proposal_reject(p_organization_id uuid, p_import_id uuid, p_column text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_proposal_reject');
  update custom.io_import
     set proposals = (select jsonb_agg(case when p ->> 'column' = p_column
                                            then p || jsonb_build_object('state', 'rejected')
                                            else p end)
                        from jsonb_array_elements(proposals) p)
   where organization_id = p_organization_id and id = p_import_id;
  -- A rejected proposal STAYS on the run. Deleting it would make the same column come back as
  -- a fresh offer on every future import of the same file, which is how people learn to ignore
  -- a prompt.
  return found;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_proposal_reject',
        'p_organization_id uuid, p_import_id uuid, p_column text',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. p_import_id is keyed with the organization in the UPDATE, so another tenant''s run matches no row and nothing is written.',
        'w4_io_import_export_and_proposals.sql',
        'server_only until the grid ships the reject control, for the same reason as io_proposal_accept: the review screen calls it from the server lane today.',
        false, false)
on conflict do nothing;

-- ── export, through the READ door ────────────────────────────────────────────
create function custom.io_export(p_organization_id uuid,
                                 p_table_id uuid,
                                 p_columns text[] default null,
                                 p_limit integer default 10000,
                                 p_required text default 'viewer')
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_cols text[];
  v_rows jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_export');
  -- The column list is the TABLE's Fields unless the caller named one. Exporting keys that
  -- happen to be in the documents would leak whatever an older shape left behind.
  v_cols := coalesce(p_columns,
    (select array_agg(f.key order by f.sort, f.key)
       from custom.field f
      where f.organization_id = p_organization_id
        and f.table_token = (select t.data ->> 'token' from custom.record t
                              where t.organization_id = p_organization_id and t.id = p_table_id)));
  v_cols := coalesce(v_cols, array[]::text[]);

  -- THE READ DOOR DECIDES WHICH ROWS. `custom.query_visible_ids` is the one visibility helper;
  -- an export that selected from custom.record directly would hand a viewer every row in the
  -- organization, which is the single worst bug an export can have.
  select coalesce(jsonb_agg(r.doc order by r.created_at, r.id), '[]'::jsonb) into v_rows
    from (select rec.id, rec.created_at,
                 (select coalesce(jsonb_object_agg(c, coalesce(vals -> c, 'null'::jsonb)), '{}'::jsonb)
                    from unnest(v_cols) c) as doc
            from custom.query_visible_ids(p_organization_id, p_table_id, p_required) v
            join custom.record rec
              on rec.organization_id = p_organization_id and rec.id = v.id
     cross join lateral (select custom.record_values(p_organization_id, rec.id) as vals) lv
           where rec.deleted_at is null
           limit greatest(1, least(coalesce(p_limit, 10000), 100000))) r;

  return jsonb_build_object('table_id', p_table_id, 'columns', to_jsonb(v_cols), 'rows', v_rows);
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_export',
        'p_organization_id uuid, p_table_id uuid, p_columns text[], p_limit integer, p_required text',
        array['uuid'::regtype, 'uuid'::regtype, 'text[]'::regtype, 'integer'::regtype, 'text'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. p_table_id selects the Table but decides NO access: which rows come back is custom.query_visible_ids(p_organization_id, p_table_id, p_required), the one read door, evaluated for the calling principal — so a caller who may see half the Table exports half the Table.',
        'w4_io_import_export_and_proposals.sql',
        'server_only: the server renders the file the browser downloads, because a CSV or a workbook is bytes with a content type and a filename, not a JSON response.',
        false, false)
on conflict do nothing;

create function custom.io_export_csv(p_organization_id uuid,
                                     p_table_id uuid,
                                     p_columns text[] default null,
                                     p_limit integer default 10000,
                                     p_delimiter text default ',',
                                     p_required text default 'viewer')
returns text
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_export jsonb := custom.io_export(p_organization_id, p_table_id, p_columns, p_limit, p_required);
  v_cols   text[];
  v_out    text;
begin
  select array_agg(value #>> '{}') into v_cols from jsonb_array_elements(v_export -> 'columns');
  v_cols := coalesce(v_cols, array[]::text[]);
  select string_agg(custom.io_csv_escape(c, p_delimiter), p_delimiter) into v_out from unnest(v_cols) c;
  v_out := coalesce(v_out, '');
  -- One pass, header then rows, every value escaped by the same function the parser reads back.
  select v_out || coalesce(string_agg(chr(10) || line, ''), '')
    into v_out
    from (select (select string_agg(custom.io_csv_escape(
                           case when jsonb_typeof(row -> c) in ('null') or row -> c is null then null
                                when jsonb_typeof(row -> c) = 'string' then row ->> c
                                else row -> c #>> '{}' end, p_delimiter), p_delimiter)
                    from unnest(v_cols) c) as line
            from jsonb_array_elements(v_export -> 'rows') row) lines;
  return v_out;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_export_csv',
        'p_organization_id uuid, p_table_id uuid, p_columns text[], p_limit integer, p_delimiter text, p_required text',
        array['uuid'::regtype, 'uuid'::regtype, 'text[]'::regtype, 'integer'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'It calls custom.io_export and renders its answer, so every access decision is that function''s: p_organization_id through custom.assert_store_door, and the row set through custom.query_visible_ids for the calling principal. This function adds no access of its own.',
        'w4_io_import_export_and_proposals.sql',
        'server_only: same reason as io_export — the server hands the browser a file, and a download is bytes with a content type rather than a JSON body.',
        false, false)
on conflict do nothing;

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
