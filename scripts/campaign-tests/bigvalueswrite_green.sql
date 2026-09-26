-- LANE BIG-VALUES-WRITE — A TEXT OF ANY SIZE SIMPLY SAVES, measured RED then GREEN on the dev clone
-- (bigvalueswrite_a_text_of_any_size_simply_saves.sql).
--
-- THE USE CASE (admin@admin.com's own table on the clone, nothing written that survives): the
-- compliance lead of admin's Workspace builds a "Company Policies" table (Title, Policy text) and
-- pastes the company's whole records-retention policy - about 250 KB of numbered sections - into
-- one "Policy text" cell, then adds one sentence at the end and saves again. Before this lane
-- the store refused the paste with "one value in a record holds at most 100000".
--
-- WHAT MAKES IT FAIL (RED before the file, GREEN after):
--   W1  the 250 KB person write succeeds; the cell holds the first 1000 characters; its envelope
--       names a pending whole_value_in_file source (bytes, sha256 of the whole text); the whole
--       text waits in custom.whole_value_parked BYTE-IDENTICAL to what was written
--   W2  a write whose file cannot be made (the upload failed) is refused in words and leaves no
--       record, no pointer and nothing waiting - the Python path's one transaction
--   W3  a file that does not hold the text (SHA-256 differs) is refused in words; the pointer
--       stays pending and nothing is attached
--   W4  the right file completes the pointer: file_id + file_record, no longer pending, the
--       `references` edge, nothing waiting, and the value's version did not move
--   W5  saving the SAME whole text again is not a new version and waits for nothing
--   W6  changing one sentence at the end (same first 1000 characters) IS a new version, with a
--       new pending pointer for the new whole text
--   W7  a 50 KB write stays whole in its cell: no pointer, nothing waiting
--   W8  a JSON (non-text) value over the ceiling is still refused in words
-- Rolled back.

\set ON_ERROR_STOP on
\timing off
\set suite 'bigvalueswrite_green.sql'
\set expect 'clone'
\set requires 'function:custom._value_envelope'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $bvw$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  o_ws      constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace
  c_home    constant text := '19b5970f-b3e5-5d34-b505-d8c44450d42f';   -- admin's Workspace home
  t_heat    uuid;                                                     -- Company Policies (declared here)
  k         constant text := 'policy_text';
  v_policy  text;
  v_edited  text;
  v_mid     text;
  v_id      uuid;
  v_id2     uuid;
  v_doc     jsonb;
  v_src     jsonb;
  v_ptr     text;
  v_p       record;
  v_file    uuid := gen_random_uuid();
  v_bad     uuid := gen_random_uuid();
  v_sha     text;
  v_ver     int;
  v_msg     text;
  v_fails   text[] := '{}';
begin
  -- The policy: 250 KB of numbered sections a real records-retention policy carries.
  select string_agg(format(
           E'Section %s. %s\nRecords covered: %s. Retention period: %s years from the end of the fiscal year in which the record was created, unless a legal hold issued by the General Counsel is in effect. Owner: %s. Disposal: records past their retention period are reviewed quarterly and destroyed by cross-cut shredding or certified electronic erasure, and the disposal is logged with the record series, date range and the name of the person who approved it.\n\n',
           n,
           (array['Accounts payable','Payroll and timekeeping','Customer contracts','Service tickets and warranty claims','Refrigerant handling logs','Vehicle maintenance','Safety training records','Job-site photographs'])[1 + n % 8],
           (array['vendor invoices, credit memos and payment approvals','pay registers, time cards and withholding forms','signed agreements, change orders and renewals','work orders, technician notes and parts used','EPA Section 608 recovery and disposal records','inspection reports and repair invoices','OSHA training rosters and certificates','before-and-after photographs of installed equipment'])[1 + n % 8],
           (array[7, 7, 10, 5, 3, 5, 5, 3])[1 + n % 8],
           (array['Controller','Payroll Manager','Operations Director','Service Manager','Compliance Lead','Fleet Manager','Safety Officer','Project Manager'])[1 + n % 8]),
         '') into v_policy
    from generate_series(1, 470) n;
  if octet_length(v_policy) < 240000 then
    raise exception 'suite setup: the policy text is only % bytes', octet_length(v_policy);
  end if;
  v_sha := encode(sha256(convert_to(v_policy, 'UTF8')), 'hex');

  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  -- The compliance lead's table, built through the doors a person uses.
  t_heat := custom.table_declare(o_ws, jsonb_build_object(
    'name', 'Company Policies', 'slug', 'company_policies', 'type', 'entity',
    'label_singular', 'Policy', 'label_plural', 'Policies', 'title_field', 'title',
    'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
    'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'title', 'direction', 'asc')),
    'parent_id', c_home, 'fields', jsonb_build_array(jsonb_build_object('name', 'title'))));
  perform custom.field_declare(o_ws, t_heat, jsonb_build_object('key', 'title', 'label', 'Title', 'type', 'text', 'sort', 10));
  perform custom.field_declare(o_ws, t_heat, jsonb_build_object('key', k, 'label', 'Policy text', 'type', 'text', 'sort', 20));

  -- W1 — the 250 KB paste simply saves
  begin
    v_id := custom.record_write(o_ws, t_heat, jsonb_build_object('title', 'Records retention policy (2026 revision)', k, v_policy));
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_id is null then
    v_fails := v_fails || format('W1 RED: the 250 KB write was refused: %s', left(v_msg, 200));
  else
    v_doc := custom.read_record(o_ws, v_id, false);
    v_ptr := v_doc -> '_values' -> k ->> 'src';
    v_src := v_doc -> '_sources' -> v_ptr;
    perform set_config('role', 'none', true);
    select * into v_p from custom.whole_value_parked where record_id = v_id and field_key = k;
    perform set_config('role', 'authenticated', true);
    if (v_doc ->> k) is distinct from left(v_policy, 1000) then
      v_fails := v_fails || format('W1: the cell holds %s chars, not the first 1000', length(v_doc ->> k));
    elsif coalesce(v_src ->> 'kind', '') <> 'whole_value_in_file' or (v_src ->> 'pending')::boolean is not true
          or v_src ->> 'sha256' <> v_sha or (v_src ->> 'bytes')::bigint <> octet_length(convert_to(v_policy, 'UTF8')) then
      v_fails := v_fails || format('W1: the envelope does not name the pending whole text (%s)', coalesce(v_src, 'null'));
    elsif v_p.id is null or v_p.whole_text is distinct from v_policy or v_p.pointer <> v_ptr then
      v_fails := v_fails || 'W1: the whole text is not waiting byte-identical beside the record'::text;
    else
      raise notice 'W1 GREEN: % bytes saved; cell 1000 chars; source % pending, sha %…; the whole text waits byte-identical',
        octet_length(v_policy), v_ptr, left(v_sha, 12);
    end if;
  end if;

  if to_regclass('custom.whole_value_parked') is null then
    raise exception E'bigvalueswrite_green RED (the store has no carry at all):\n  %', array_to_string(v_fails, E'\n  ');
  end if;

  -- W2 — the upload failed: the Python path's ONE transaction refuses and leaves nothing
  begin
    v_id2 := custom.record_write(o_ws, t_heat, jsonb_build_object('title', 'Records retention policy (draft that never uploaded)', k, v_policy || ' Draft.'));
    perform custom.whole_value_complete(o_ws, v_id2, k, v_bad);   -- no such file: the upload never happened
    v_fails := v_fails || 'W2: completing against a file that does not exist was not refused'::text;
  exception when others then
    v_msg := sqlerrm;
  end;
  perform set_config('role', 'none', true);
  if v_id2 is not null and exists (select 1 from custom.record where id = v_id2) then
    v_fails := v_fails || 'W2: the refused write left its record behind'::text;
  elsif exists (select 1 from custom.whole_value_parked where whole_text = v_policy || ' Draft.') then
    v_fails := v_fails || 'W2: the refused write left its whole text waiting'::text;
  elsif position('is not there' in coalesce(v_msg, '')) = 0 then
    v_fails := v_fails || format('W2: the refusal does not say why in words: %s', coalesce(v_msg, 'null'));
  else
    raise notice 'W2 GREEN: refused in words ("%"); no record, no pointer, nothing waiting', left(v_msg, 90);
  end if;

  -- The file the server writes (bytes live in object storage; the row is what the door checks).
  insert into files.files (id, created_by, file_path, file_name, mime_type, size_bytes, checksum,
                           visibility, organization_id, storage_uri)
  values (v_file, c_admin, 'record-store-' || o_ws || '/' || t_heat || '/research_findings_summary — suite (v1).txt',
          'research_findings_summary — suite (v1).txt', 'text/plain; charset=utf-8',
          octet_length(convert_to(v_policy, 'UTF8')), v_sha, 'internal', o_ws, 's3://suite-rolled-back/whole-value');
  insert into files.files (id, created_by, file_path, file_name, mime_type, size_bytes, checksum,
                           visibility, organization_id, storage_uri)
  values (v_bad, c_admin, 'record-store-' || o_ws || '/' || t_heat || '/wrong text.txt',
          'wrong text.txt', 'text/plain; charset=utf-8', 10, repeat('0', 64), 'internal', o_ws, 's3://suite-rolled-back/wrong');
  perform set_config('role', 'authenticated', true);

  if v_id is not null then
    -- W3 — a file that does not hold the text
    v_msg := null;
    begin
      perform custom.whole_value_complete(o_ws, v_id, k, v_bad);
    exception when others then
      v_msg := sqlerrm;
    end;
    v_doc := custom.read_record(o_ws, v_id, false);
    if v_msg is null or position('SHA-256 differs' in v_msg) = 0 then
      v_fails := v_fails || format('W3: a file with the wrong text was not refused in words (%s)', coalesce(v_msg, 'accepted'));
    elsif (v_doc -> '_sources' -> v_ptr ->> 'pending')::boolean is not true then
      v_fails := v_fails || 'W3: the refused file still changed the pointer'::text;
    else
      raise notice 'W3 GREEN: refused in words ("%"); pointer still pending', left(v_msg, 90);
    end if;

    -- W4 — the right file completes it
    v_ver := (v_doc -> '_values' -> k ->> 'ver')::int;
    v_src := custom.whole_value_complete(o_ws, v_id, k, v_file);
    v_doc := custom.read_record(o_ws, v_id, false);
    v_src := v_doc -> '_sources' -> (v_doc -> '_values' -> k ->> 'src');
    perform set_config('role', 'none', true);
    if coalesce(v_src ->> 'file_id', '') <> v_file::text or v_src ? 'pending' or v_src ->> 'file_record' is null then
      v_fails := v_fails || format('W4: the pointer was not completed (%s)', coalesce(v_src, 'null'));
    elsif not exists (select 1 from platform.associations a
                       where a.source_type = 'record' and a.source_id = v_id and a.role = 'references'
                         and a.target_id = (v_src ->> 'file_record')::uuid and a.label = k) then
      v_fails := v_fails || 'W4: no references edge from the record to its File record'::text;
    elsif exists (select 1 from custom.whole_value_parked where record_id = v_id) then
      v_fails := v_fails || 'W4: the whole text is still waiting after its file was attached'::text;
    elsif (v_doc -> '_values' -> k ->> 'ver')::int is distinct from v_ver then
      v_fails := v_fails || format('W4: attaching the file moved the value''s version %s -> %s', v_ver, v_doc -> '_values' -> k ->> 'ver');
    elsif (v_doc -> '_values' -> 'title' ->> 'actor') <> 'user' then
      v_fails := v_fails || format('W4: attaching the file re-authored the other values (title actor %s)', v_doc -> '_values' -> 'title' ->> 'actor');
    else
      raise notice 'W4 GREEN: file % attached (File record %), edge written, nothing waiting, version % kept',
        v_file, v_src ->> 'file_record', v_ver;
    end if;
    perform set_config('role', 'authenticated', true);

    -- W5 — the same whole text again
    perform custom.record_update(o_ws, v_id, jsonb_build_object(k, v_policy), null);
    v_doc := custom.read_record(o_ws, v_id, false);
    perform set_config('role', 'none', true);
    if (v_doc -> '_values' -> k ->> 'ver')::int is distinct from v_ver
       or coalesce(v_doc -> '_sources' -> (v_doc -> '_values' -> k ->> 'src') ->> 'file_id', '') <> v_file::text
       or exists (select 1 from custom.whole_value_parked where record_id = v_id) then
      v_fails := v_fails || format('W5: re-saving the same whole text moved something (ver %s, src %s)',
                                   v_doc -> '_values' -> k ->> 'ver', v_doc -> '_sources' -> (v_doc -> '_values' -> k ->> 'src'));
    else
      raise notice 'W5 GREEN: the same whole text again is version % still, same file, nothing waiting', v_ver;
    end if;
    perform set_config('role', 'authenticated', true);

    -- W6 — one sentence changed at the very end
    v_edited := v_policy || E'Section 471. This policy is reviewed every year by the Compliance Lead.\n';
    perform custom.record_update(o_ws, v_id, jsonb_build_object(k, v_edited), null);
    v_doc := custom.read_record(o_ws, v_id, false);
    v_src := v_doc -> '_sources' -> (v_doc -> '_values' -> k ->> 'src');
    perform set_config('role', 'none', true);
    select * into v_p from custom.whole_value_parked where record_id = v_id and field_key = k;
    if (v_doc -> '_values' -> k ->> 'ver')::int is distinct from v_ver + 1 then
      v_fails := v_fails || format('W6: an edit past the first 1000 characters is version %s, not %s',
                                   v_doc -> '_values' -> k ->> 'ver', v_ver + 1);
    elsif (v_src ->> 'pending')::boolean is not true
          or v_src ->> 'sha256' <> encode(sha256(convert_to(v_edited, 'UTF8')), 'hex')
          or v_p.whole_text is distinct from v_edited then
      v_fails := v_fails || format('W6: the edited whole text is not the one waiting (%s)', v_src);
    else
      raise notice 'W6 GREEN: the edit at the end is version %, a new pending pointer, the new whole text waits', v_ver + 1;
    end if;
    perform set_config('role', 'authenticated', true);
  end if;

  -- W7 — 50 KB stays in the cell
  v_mid := left(v_policy, 50000);
  v_id2 := custom.record_write(o_ws, t_heat, jsonb_build_object('title', 'Records retention policy (summary)', k, v_mid));
  v_doc := custom.read_record(o_ws, v_id2, false);
  perform set_config('role', 'none', true);
  if (v_doc ->> k) is distinct from v_mid
     or coalesce(v_doc -> '_sources' -> (v_doc -> '_values' -> k ->> 'src') ->> 'kind', '') = 'whole_value_in_file'
     or exists (select 1 from custom.whole_value_parked where record_id = v_id2) then
    v_fails := v_fails || format('W7: the 50 KB value did not stay whole in its cell (%s chars)', length(v_doc ->> k));
  else
    raise notice 'W7 GREEN: 50,000 characters stay whole in the cell, no pointer, nothing waiting';
  end if;
  perform set_config('role', 'authenticated', true);

  -- W8 — a JSON value over the ceiling is still refused in words
  v_msg := null;
  begin
    perform custom.record_write(o_ws, t_heat, jsonb_build_object('title', 'Retention schedule as a list',
              k, (select jsonb_agg(v_policy) from generate_series(1, 1))));
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null or position('holds at most' in v_msg) = 0 then
    v_fails := v_fails || format('W8: a JSON value over the ceiling was not refused in words (%s)', coalesce(v_msg, 'accepted'));
  else
    raise notice 'W8 GREEN: a JSON value over the ceiling is still refused ("%")', left(v_msg, 80);
  end if;
  perform set_config('role', 'none', true);

  if cardinality(v_fails) > 0 then
    raise exception E'bigvalueswrite_green RED (% failure(s)):\n  %', cardinality(v_fails), array_to_string(v_fails, E'\n  ');
  end if;
end;
$bvw$;
rollback;
\echo 'bigvalueswrite_green: PASS'
