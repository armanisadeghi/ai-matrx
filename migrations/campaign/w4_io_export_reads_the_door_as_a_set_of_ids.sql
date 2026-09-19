-- chair-step: replaces this lane's own custom.io_export body, which joined custom.query_visible_ids as though it returned rows with an `id` column when it returns SETOF uuid; a replacement is judged by the allow-list, so the sanctioned route is a terminal-confirmed step
-- based-on: custom.io_export(uuid, uuid, text[], integer, text) 2a1de28174e5dd1a235d483d73e9258ff5531027bae9b55d23b98b60d4fc4f56
--
-- W4-IO, file 8 — THE EXPORT READS THE DOOR'S ACTUAL SHAPE.
--
-- WHAT THE GREEN SUITE FOUND. `custom.io_export` joined the read door as `… query_visible_ids(…)
-- v join custom.record rec on rec.id = v.id`, which assumes the door answers ROWS carrying an
-- `id` column. It answers `SETOF uuid`. Every export therefore raised `42703 column v.id does
-- not exist` — not sometimes, always. Nothing in the DDL apply catches that: a plpgsql body is
-- syntax-checked at CREATE and its column references resolve only when it runs, which is exactly
-- the class of defect a suite that actually calls the function exists to find.
--
-- THE FIX IS THE SAME ONE SENTENCE. The door still decides which rows come back — `rec.id in
-- (select custom.query_visible_ids(…))` — so an export still returns exactly what the calling
-- principal may read and no export ever selects from `custom.record` unfiltered.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.io_export(p_organization_id uuid,
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
  v_cols  text[];
  v_token text;
  v_rows  jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_export');

  select t.data ->> 'token' into v_token from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

  -- The column list is the TABLE's own Fields unless the caller named one. Exporting whatever
  -- keys happen to be in the documents would ship whatever an older shape left behind.
  v_cols := coalesce(p_columns,
    (select array_agg(f.data ->> 'key' order by coalesce((f.data ->> 'sort')::int, 0),
                                                 f.data ->> 'key')
       from custom.applicable_fields(p_organization_id, p_table_id, null) f),
    (select array_agg(k order by k)
       from (select distinct jsonb_object_keys(r.data) k
               from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = p_table_id
                and r.deleted_at is null) ks
      where left(k, 1) <> '_'),
    array[]::text[]);

  -- THE READ DOOR DECIDES WHICH ROWS. `custom.query_visible_ids` answers SETOF uuid, so it is
  -- an id set and not a joinable row source; an export that selected from custom.record
  -- directly would hand a viewer every row in the organization, which is the single worst bug
  -- an export can have.
  select coalesce(jsonb_agg(r.doc order by r.created_at, r.id), '[]'::jsonb) into v_rows
    from (select rec.id, rec.created_at,
                 (select coalesce(jsonb_object_agg(c, coalesce(lv.vals -> c, 'null'::jsonb)),
                                  '{}'::jsonb)
                    from unnest(v_cols) c) as doc
            from custom.record rec
     cross join lateral (select custom.record_values(p_organization_id, rec.id) as vals) lv
           where rec.organization_id = p_organization_id
             and rec.table_id = p_table_id
             and rec.deleted_at is null
             and rec.id in (select custom.query_visible_ids(p_organization_id, p_table_id, p_required))
           order by rec.created_at, rec.id
           limit greatest(1, least(coalesce(p_limit, 10000), 100000))) r;

  return jsonb_build_object('table_id', p_table_id, 'token', v_token,
                            'columns', to_jsonb(v_cols), 'rows', v_rows);
end;
$fn$;

comment on function custom.io_export(uuid, uuid, text[], integer, text) is
  'DOOR-11: the Table''s rows, through the ONE read door. custom.query_visible_ids answers SETOF uuid and is used as an id set; the columns are the Table''s own Fields unless the caller names them.';

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
