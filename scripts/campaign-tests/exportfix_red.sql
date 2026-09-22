-- EXPORT-FIX — THE RED TWIN. IT PUTS THE DEFECT BACK AND REQUIRES EVERY GREEN CLAUSE TO FAIL.
--
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/exportfix_red.sql
--
-- It executes the REAL BYTES of this lane's two inverse migrations —
-- `migrations/inverse/exportfix_the_export_pages_the_read_door_down.sql` and
-- `migrations/inverse/exportfix_the_export_is_the_read_doors_answer_down.sql`, in that order,
-- so the door ends up exactly as it stood before this lane touched it — inside a transaction
-- that always rolls back. That is two things at once: it proves those inverses are valid SQL
-- that actually executes, and it proves `exportfix_green.sql` is green about something. A green
-- suite nobody has seen fail is a green suite that may be asserting nothing.
--
-- Every block below is RED when the defect it asserts is BACK. If a block comes out green, the
-- fix is not what made the difference and the green suite's corresponding clause is worthless.
--
-- NOTHING IS COMMITTED. The DDL, the fixture and the organization all disappear at ROLLBACK.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'exportfix_red.sql'
\set requires 'row:platform.feature_knob:feature = \'custom\' and key = \'member_default_visibility\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\set ORG   '\'e5f00000-0000-4a00-8a00-000000000002\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'campaign-test/exportfix_red', true);

-- ══════════════════════════ THE DEFECT, PUT BACK, FROM THE INVERSES' OWN BYTES ═══════════════
-- (1) the paging inverse, then (2) the one-select inverse — the second wins, which is the door
-- exactly as it stood before this lane.


CREATE OR REPLACE FUNCTION custom.io_export(p_organization_id uuid, p_table_id uuid, p_columns text[] DEFAULT NULL::text[], p_limit integer DEFAULT 10000, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cols    text[];
  v_named   integer;
  v_token   text;
  v_rows    jsonb;
  v_held    jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_export');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_export');
  perform custom.assert_store_door(p_organization_id, 'custom.io_export');

  -- NOTHING FAILS SILENTLY. This door's rows come from `custom.read_records`, which is the
  -- read door and answers at `viewer`; there is no list door in this store that answers "the
  -- rows I may edit". A caller asking for one used to be handed the viewer rows with no word
  -- said, which is the export path answering a question nobody asked.
  if coalesce(p_required, 'viewer') <> 'viewer' then
    raise exception 'custom.io_export answers at viewer and cannot export a higher level.'
      using errcode = '22023',
            hint = 'The export is the read door''s answer: it is built from custom.read_records, '
                   'which resolves the reader from the session and answers at viewer. Call it '
                   'with p_required => ''viewer'' (its default) and decide what may be CHANGED '
                   'with custom.my_level or custom.assert_client_may_change.';
  end if;

  select t.data ->> 'token' into v_token from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

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

  -- A Field with no `key` is a data defect, not a reason to refuse the whole export. It is
  -- dropped and NAMED, with the remedy, exactly as `custom.derived_value` names a malformed
  -- worked-out column instead of taking the Table down with it.
  v_named := coalesce(pg_catalog.array_length(v_cols, 1), 0);
  v_cols  := coalesce(pg_catalog.array_remove(v_cols, null), array[]::text[]);
  if v_named > coalesce(pg_catalog.array_length(v_cols, 1), 0) then
    raise warning 'custom.io_export: % column(s) of table % carry no key and were left out of '
      'this export. Every other column and every row are unaffected. REMEDY: give the Field a '
      'key through custom.field_update, or retire it with custom.field_retire.',
      v_named - coalesce(pg_catalog.array_length(v_cols, 1), 0), p_table_id;
  end if;

  -- THE READ DOOR DECIDES BOTH QUESTIONS: which rows, and which cells of them.
  -- `custom.read_records` already choice-renders and already carries `_hidden`.
  --
  -- THE PAGE AND THE WITHHELD MAP ARE TWO AGGREGATES OVER THE SAME CTE, never one join.
  -- Joining `jsonb_each(_hidden)` onto the page multiplied every exported row by the number
  -- of columns withheld from the reader, and produced a null key — 22023 — when none were.
  with page as (
    select row_number() over () as ord, rr.document as document
      from custom.read_records(p_organization_id, p_table_id, false,
                               custom.page_size(p_organization_id, 'custom.io_export', p_limit, 10000, custom.export_ceiling(p_organization_id)), 0) rr
  ),
  cells as (
    select p.ord,
           (select coalesce(jsonb_object_agg(c, coalesce(p.document -> c, 'null'::jsonb)),
                            '{}'::jsonb)
              from unnest(v_cols) c) as doc
      from page p
  ),
  held as (
    select distinct on (h.key) h.key, h.value
      from page p
      cross join lateral jsonb_each(coalesce(p.document -> '_hidden', '{}'::jsonb)) h
  )
  select coalesce((select jsonb_agg(c.doc order by c.ord) from cells c), '[]'::jsonb),
         coalesce((select jsonb_object_agg(h.key, h.value) from held h), '{}'::jsonb)
    into v_rows, v_held;

  -- NOTHING FAILS SILENTLY: a column the store withheld from this reader is named with the
  -- store's own reason, beside an export whose cells for it read `null`.
  return jsonb_build_object('table_id', p_table_id, 'token', v_token,
                            'columns', to_jsonb(v_cols), 'rows', v_rows,
                            'withheld', v_held,
                            -- PAGE-1. An export is one page of its own declared ceiling, and it
                            -- says what it was asked for, what came back, and where to carry on.
                            'page', jsonb_build_object(
                              'requested', custom.page_size(p_organization_id, 'custom.io_export', p_limit, 10000, custom.export_ceiling(p_organization_id)),
                              'returned',  jsonb_array_length(coalesce(v_rows, '[]'::jsonb)),
                              'ceiling',   custom.export_ceiling(p_organization_id),
                              'next',      case when jsonb_array_length(coalesce(v_rows, '[]'::jsonb))
                                                   = custom.page_size(p_organization_id, 'custom.io_export', p_limit, 10000, custom.export_ceiling(p_organization_id))
                                                then jsonb_array_length(coalesce(v_rows, '[]'::jsonb)) else null end),
                            'choices', custom.choice_field_map(p_organization_id, p_table_id));
end;
$function$

;

-- `scripts/campaign-tests/exportfix_red.sql` executes these bytes inside a rolled-back
-- transaction and requires the census to name the same rows again.

CREATE OR REPLACE FUNCTION custom.io_export(p_organization_id uuid, p_table_id uuid, p_columns text[] DEFAULT NULL::text[], p_limit integer DEFAULT 10000, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cols   text[];
  v_token  text;
  v_rows   jsonb;
  v_held   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_export');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_export');
  perform custom.assert_store_door(p_organization_id, 'custom.io_export');

  select t.data ->> 'token' into v_token from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

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

  -- THE READ DOOR DECIDES BOTH QUESTIONS NOW: which rows, and which cells of them.
  -- `custom.read_records` already choice-renders and already carries `_hidden`.
  select coalesce(jsonb_agg(x.doc order by x.ord), '[]'::jsonb),
         coalesce(jsonb_object_agg(h.key, h.value), '{}'::jsonb)
    into v_rows, v_held
    from (select row_number() over () as ord,
                 (select coalesce(jsonb_object_agg(c, coalesce(rr.document -> c, 'null'::jsonb)),
                                  '{}'::jsonb)
                    from unnest(v_cols) c) as doc,
                 rr.document -> '_hidden' as hidden
            from custom.read_records(p_organization_id, p_table_id, false,
                                     greatest(1, least(coalesce(p_limit, 10000), 100000)), 0) rr) x
    left join lateral jsonb_each(coalesce(x.hidden, '{}'::jsonb)) h on true;

  -- NOTHING FAILS SILENTLY: a column the store withheld from this reader is named with the
  -- store's own reason, beside an export whose cells for it read `null`.
  return jsonb_build_object('table_id', p_table_id, 'token', v_token,
                            'columns', to_jsonb(v_cols), 'rows', v_rows,
                            'withheld', v_held,
                            'choices', custom.choice_field_map(p_organization_id, p_table_id));
end;
$function$

;

-- ══════════════════════════ THE FIXTURE, identical to the green suite's ══════════════════════
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'EXPORT-FIX Red Throwaway', 'exportfix-red-throwaway', 'EFR', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner',  'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled',            'organization', :ORG, :ORG, 'true'::jsonb,          'EXPORT-FIX red twin'),
       ('custom', 'member_default_visibility', 'organization', :ORG, :ORG, '"shared_only"'::jsonb, 'EXPORT-FIX red twin');

do $t$
declare
  v_org   constant uuid := 'e5f00000-0000-4a00-8a00-000000000002';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j text; c_dana_j text; v_boss text := current_user;
  v_home uuid; v_tbl uuid; v_r1 uuid; v_r2 uuid; v_r3 uuid;
  v_exp jsonb; n int; v_red int := 0; v_msg text; v_ok boolean;
begin
  c_admin_j := json_build_object('sub', v_admin::text, 'role', 'authenticated', 'email', 'admin@admin.com')::text;
  c_dana_j  := json_build_object('sub', v_dana::text,  'role', 'authenticated', 'email', 'test@test.com')::text;

  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'the red twin did not take the seat — current_user is %', current_user;
  end if;

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
                                jsonb_build_object('name', 'export-fix red home'));
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','efr_deals','slug','efr_deals','label_singular','Deal','label_plural','Deals',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Title','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'label','Client','plain','text','sensitivity','confidential'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'label','Internal margin','plain','number','sensitivity','restricted'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'label','Stage','parity_type','select','options', jsonb_build_array('Open','Won','Lost')));
  v_r1 := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'title','first deal',  'client','Thistledown Wine Merchants',   'internal_margin', 11, 'stage','Won'));
  v_r2 := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'title','second deal', 'client','Globex', 'internal_margin', 22, 'stage','Open'));
  v_r3 := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'title','third deal',  'client','Initech','internal_margin', 33, 'stage','Lost'));
  perform custom.share_grant(v_org, v_r1, 'user', v_dana, 'viewer'::public.permission_level);

  -- ══ RED 1 — the owner, nothing withheld: the export door does not answer at all, it RAISES.
  v_msg := null;
  begin
    perform custom.io_export(v_org, v_tbl, null, 200, 'viewer');
  exception when others then v_msg := sqlstate || ' ' || sqlerrm;
  end;
  if v_msg is null then
    raise exception 'RED 1 CAME OUT GREEN — the old door exported for a reader nothing is withheld from, so green PART 1 proves nothing';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 1 — the owner''s export raised "%" (green PART 1 asserts three rows and nothing withheld)', v_msg;

  -- ══ RED 2 — Dana: the page is multiplied by the number of withheld columns.
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into n from custom.read_records(v_org, v_tbl, false, 200, 0);
  v_exp := custom.io_export(v_org, v_tbl, null, 200, 'viewer');
  if jsonb_array_length(v_exp -> 'rows') = n then
    raise exception 'RED 2 CAME OUT GREEN — the old door handed her % row(s) for % opened, so green PART 2c proves nothing',
      jsonb_array_length(v_exp -> 'rows'), n;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 2 — the export hands her % row(s) where custom.read_records opens % (one copy per withheld column)',
    jsonb_array_length(v_exp -> 'rows'), n;

  -- ══ RED 3 — and that is a DISAGREEMENT with the record door, not merely a duplicate.
  select count(*) into n
    from jsonb_array_elements(v_exp -> 'rows') x
   where x ->> 'title' = 'first deal';
  if n < 2 then
    raise exception 'RED 3 CAME OUT GREEN — the one record she holds appears % time(s) in her export', n;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 3 — the ONE record custom.read_record opens for her is in her export % times', n;

  -- ══ RED 4 — field for field: the export is not the record door's answer.
  if md5((select coalesce(jsonb_agg(x order by x::text), '[]'::jsonb)
            from jsonb_array_elements(v_exp -> 'rows') x)::text)
     = md5((select coalesce(jsonb_agg(d order by d::text), '[]'::jsonb) from (
              select (select coalesce(jsonb_object_agg(c, coalesce(custom.read_record(v_org, rr.id, false) -> c, 'null'::jsonb)), '{}'::jsonb)
                        from jsonb_array_elements_text(v_exp -> 'columns') c) as d
                from custom.read_records(v_org, v_tbl, false, 200, 0) rr) q)::text) then
    raise exception 'RED 4 CAME OUT GREEN — the old export already hashed the same as custom.read_record, so green PART 3 proves nothing';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 4 — the export and custom.read_record hash differently';

  -- ══ RED 5 — `p_required` is accepted and silently ignored.
  v_ok := false;
  begin
    perform custom.io_export(v_org, v_tbl, null, 200, 'editor');
    v_ok := true;
  exception when others then null;
  end;
  if not v_ok then
    raise exception 'RED 5 CAME OUT GREEN — the old door already refused p_required => editor, so green PART 5a proves nothing';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 5 — the old door took p_required => editor and answered at viewer without a word';

  -- ══ RED 6 — census 13 names the door again. Server-only: the seat steps OUT and says so.
  perform set_config('role', v_boss, true);
  select count(*) into n from custom.list_door_disagreements(null, v_org, 200, true);
  if n = 0 then
    raise exception 'RED 6 CAME OUT GREEN — census 13 reads zero with the defect back, so green PART 6 proves nothing';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 6 — census 13 names % row(s) in this organization: %', n,
    (select string_agg(d.door || ' — ' || d.why, ' | ')
       from custom.list_door_disagreements(null, v_org, 200, true) d);

  -- ══ RED 7 — the default call, which is how the door's own signature invites it.
  v_ok := false;
  begin
    perform custom.io_export(v_org, v_tbl);
    v_ok := true;
  exception when others then v_msg := sqlerrm;
  end;
  if v_ok then
    raise exception 'RED 7 CAME OUT GREEN — the old door answered its own default call, so green PART 5b proves nothing';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 7 — select custom.io_export(org, table) raised "%"', v_msg;

  raise notice '% of 7 blocks are RED', v_red;
  if v_red <> 7 then
    raise exception 'THE RED TWIN IS NOT RED — only % of 7 blocks failed as they must', v_red;
  end if;
end $t$;

rollback;

-- ══════════════════════════ AND THE LANDED DOOR IS BACK ══════════════════════════════════════
do $v$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'io_export';
  if v_src !~ 'generate_series' or v_src !~ 'cannot export a higher level' then
    raise exception 'ROLLBACK DID NOT RESTORE THE LANDED DOOR — custom.io_export is the old body';
  end if;
  raise notice 'ROLLBACK VERIFIED — custom.io_export is the landed body again';
end $v$;
