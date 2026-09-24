-- target: branch,production
-- additive: yes
--   It ADDS two functions, `custom.table_row_counts` and `custom.record_headers`, and their
--   `platform.client_callable_door` rows. Nothing existing is replaced, dropped or revoked; no
--   table, column, trigger, policy or grant is touched; nothing is written by either door. The
--   inverse is `migrations/inverse/gridprim_every_table_counts_its_rows_and_every_row_shows_its_header_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
--
-- LANE GRID-PRIMITIVES, G12 — EVERY TABLE COUNTS ITS ROWS, EVERY ROW SHOWS ITS HEADER.
-- Shapes asked by INTEG-SERVER (PROGRESS-INTEG-SERVER.md, "Missing primitives").
--
-- 1. `custom.table_row_counts(org, table_ids[])` → (table_id, visible_rows): the rows of each
--    Table THIS reader may see — the same set `custom.record_aggregate` counts (live, not
--    quarantined, on the reader's ladder: `custom.query_visible_ids`) — in ONE call, so the
--    `dataset` tool's `list` never answers `row_count: null` for a store table. A Table this
--    reader may not know, another organization's, or an invented id gets NO row, exactly alike.
--
-- 2. `custom.record_headers(org, ids[])` → (id, table_id, created_at, updated_at, version,
--    deleted_at, mine, created_by): the row's own columns, which `custom.read_record` (the
--    document door) does not answer. Only live records this reader may see are answered; any
--    other id gets no row. `created_by` follows `custom.table_facts`' rule — it is the caller's
--    own id on the rows the caller made and null on every other — and `mine` says which.
--
-- THE DEFECT THIS CLOSES (INTEG-SERVER: `record_read` answered `created_at None, version 0` on
-- the Rincon Customers Table). `matrx_records.store.client._header` built the header from
-- `history.record_versions`, which grants EXECUTE to no client role ("permission denied for
-- function record_versions" from the admin@admin.com seat, measured on the clone), and it
-- swallowed that refusal into an empty header. The client now reads this door and says so
-- when it cannot.
--
-- LOCKS. create function / insert / comment on only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create function custom.table_row_counts(p_organization_id uuid, p_table_ids uuid[])
returns table(table_id uuid, visible_rows bigint)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_t uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_row_counts');
  if coalesce(cardinality(p_table_ids), 0) > 500 then
    raise exception 'One call counts at most 500 tables; this one named %.', cardinality(p_table_ids)
      using errcode = '54000', hint = 'Ask for the tables a screen shows, a page at a time. Nothing was counted.';
  end if;

  for v_t in
    select distinct t.id
      from unnest(coalesce(p_table_ids, '{}'::uuid[])) as a(id)
      join custom.record t on t.organization_id = p_organization_id and t.id = a.id
     where t.table_id = custom.table_kernel_id() and t.data_class = 'table' and t.deleted_at is null
  loop
    begin
      perform custom.assert_may_know_table(p_organization_id, v_t, 'custom.table_row_counts');
    exception when insufficient_privilege then
      continue;   -- a Table this reader may not know is answered exactly like an invented id
    end;
    table_id := v_t;
    select count(*) into visible_rows from custom.query_visible_ids(p_organization_id, v_t, 'viewer');
    return next;
  end loop;
end
$fn$;

comment on function custom.table_row_counts(uuid, uuid[]) is
  'GRID-PRIMITIVES G12: the rows of each named Table this reader may see (live, not quarantined, on the ladder — the set custom.record_aggregate counts), in one call. A Table the reader may not know, another organization''s, or an invented id gets no row. At most 500 tables per call.';

create function custom.record_headers(p_organization_id uuid, p_ids uuid[])
returns table(id uuid, table_id uuid, created_at timestamptz, updated_at timestamptz, version integer,
              deleted_at timestamptz, mine boolean, created_by uuid)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me uuid := custom.query_principal();
  v_t  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_headers');
  if coalesce(cardinality(p_ids), 0) > 1000 then
    raise exception 'One call answers at most 1000 records; this one named %.', cardinality(p_ids)
      using errcode = '54000', hint = 'Ask for the rows a page shows. Nothing was read.';
  end if;

  for v_t in
    select distinct r.table_id
      from custom.record r
     where r.organization_id = p_organization_id
       and r.id = any(coalesce(p_ids, '{}'::uuid[]))
       and r.data_class = 'record' and r.deleted_at is null
  loop
    return query
      select r.id, r.table_id, r.created_at, r.updated_at, r.version, r.deleted_at,
             (v_me is not null and r.created_by = v_me),
             case when v_me is not null and r.created_by = v_me then v_me end
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = v_t
         and r.id = any(p_ids)
         and r.id in (select v from custom.query_visible_ids(p_organization_id, v_t, 'viewer') v);
  end loop;
end
$fn$;

comment on function custom.record_headers(uuid, uuid[]) is
  'GRID-PRIMITIVES G12: the row''s own columns — table, created, updated, version — that the document door does not answer, for the live records this reader may see; any other id gets no row. created_by is the caller''s own id on rows the caller made and null otherwise (the table_facts rule); mine says which. At most 1000 ids per call.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'table_row_counts', 'p_organization_id uuid, p_table_ids uuid[]', array['uuid'::regtype, 'uuid[]'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach before anything is read. Each table id is read only as a live Table of that organization and then asked custom.assert_may_know_table; one the caller may not know is skipped exactly as an invented id is. The count is over custom.query_visible_ids, the caller''s own ladder. It returns counts only and writes nothing.',
   'gridprim_every_table_counts_its_rows_and_every_row_shows_its_header.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'gridprim_every_table_counts_its_rows_and_every_row_shows_its_header.sql',
     'declared_at', '2026-09-24 lane GRID-PRIMITIVES',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-24 lane GRID-PRIMITIVES — written with this body'),
       'p_table_ids', jsonb_build_object('type', 'uuid[]', 'position', 2, 'entity', 'custom_record',
         'check', 'each id is joined only to arg1''s own live Tables and then asked custom.assert_may_know_table; a Table the caller may not know is skipped.',
         'foreign', jsonb_build_object('note', 'another organization''s Table, a Table the caller may not know and an invented id all get no row, byte-identically.', 'not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-09-24 lane GRID-PRIMITIVES — written with this body')))),
  ('custom', 'record_headers', 'p_organization_id uuid, p_ids uuid[]', array['uuid'::regtype, 'uuid[]'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach before anything is read. Each id is answered only if it is a live record of that organization inside custom.query_visible_ids for its own Table — the caller''s ladder, the set the read door answers; any other id gets no row. created_by is answered only as the caller''s own id. It writes nothing.',
   'gridprim_every_table_counts_its_rows_and_every_row_shows_its_header.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'gridprim_every_table_counts_its_rows_and_every_row_shows_its_header.sql',
     'declared_at', '2026-09-24 lane GRID-PRIMITIVES',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-24 lane GRID-PRIMITIVES — written with this body'),
       'p_ids', jsonb_build_object('type', 'uuid[]', 'position', 2, 'entity', 'custom_record',
         'check', 'each id is answered only inside custom.query_visible_ids(arg1, its Table) — the caller''s own ladder.',
         'foreign', jsonb_build_object('note', 'another organization''s record, one the caller may not see and an invented id all get no row, byte-identically.', 'not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-09-24 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;
