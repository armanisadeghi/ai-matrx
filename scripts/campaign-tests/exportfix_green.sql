-- EXPORT-FIX — THE GREEN SUITE. THE EXPORT IS THE READ DOOR'S ANSWER, ROW FOR ROW AND FIELD
-- FOR FIELD.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/exportfix_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`.
--
-- WHAT IT PROVES. `custom.io_export` built the page and the withheld-column map in ONE select,
-- by LEFT JOIN LATERAL `jsonb_each(_hidden)` onto the page. Measured on this database on
-- 2026-09-20, census 13 named 256 (member, Table) pairs, all of them this door:
--
--   * with N columns withheld from the reader the join multiplied every exported row N times —
--     20 rows where `custom.read_record` opens 10 — so the export handed a person more rows
--     than the read door opens, which is the one thing census 13 exists to refuse;
--   * with NO column withheld the join produced a null key and `jsonb_object_agg` raised
--     22023, so the export door was simply dead for 250 of the 256 pairs.
--
-- EVERY ASSERTED CLAUSE RUNS FROM THE SEAT `authenticated`, through the doors a signed-in
-- person's browser reaches, carrying that person's own claims. `admin@admin.com` owns the
-- throwaway organization; `test@test.com` (Dana) is a plain MEMBER of it and is shared exactly
-- one record. Nobody's own records are touched and the whole thing ends in ROLLBACK.
--
-- PARTS: 0 the seat · 1 the owner, nothing withheld (the 22023 class) · 2 Dana, one row and two
-- withheld columns (the multiplication class) · 3 field for field against `custom.read_record` ·
-- 4 a Choice exports as its label with its vocabulary · 5 `p_required` no longer lies ·
-- 6 census 13 over this organization.
--
-- ITS RED TWIN is `exportfix_red.sql`, which executes the REAL BYTES of this lane's inverse
-- inside a rolled-back transaction and requires these clauses to fail.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'exportfix_green.sql'
\set requires 'row:platform.feature_knob:feature = \'custom\' and key = \'member_default_visibility\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\set ORG   '\'e5f00000-0000-4a00-8a00-000000000001\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'campaign-test/exportfix_green', true);

delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'Rincon Plumbing Co', 'rincon-plumbing-exportfix-green', 'RPC', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner',  'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled',            'organization', :ORG, :ORG, 'true'::jsonb,          'EXPORT-FIX green suite'),
       ('custom', 'member_default_visibility', 'organization', :ORG, :ORG, '"shared_only"'::jsonb, 'EXPORT-FIX green suite');

do $t$
declare
  v_org   constant uuid := 'e5f00000-0000-4a00-8a00-000000000001';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j text; c_dana_j text; v_boss text := current_user;
  v_home uuid; v_tbl uuid; v_r1 uuid; v_r2 uuid; v_r3 uuid;
  v_exp jsonb; v_doc jsonb; v_cols text[]; v_e text[]; v_r text[];
  v_id uuid; n int; v_msg text; v_hidden int;
begin
  c_admin_j := json_build_object('sub', v_admin::text, 'role', 'authenticated', 'email', 'admin@admin.com')::text;
  c_dana_j  := json_build_object('sub', v_dana::text,  'role', 'authenticated', 'email', 'test@test.com')::text;

  -- ══════════════════════════════ PART 0 — take the seat and PROVE it
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — seated as %, and custom.record refuses it directly', current_user;

  -- ══════════════════════════════ the fixture, through the product's own doors
  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
                                jsonb_build_object('name', 'export-fix home'));
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','efg_deals','slug','efg_deals','label_singular','Deal','label_plural','Deals',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Title','type','text'));
  -- TWO COLUMNS THE STORE WITHHOLDS FROM A PLAIN VIEWER — `confidential` needs editor on
  -- the record and `restricted` needs admin (custom/field_sensitivity_levels), and she holds
  -- viewer. Two, not one, because the defect
  -- multiplied the page by the NUMBER of withheld columns: with one, a doubling and a
  -- tripling are the same arithmetic and the suite could not tell them apart.
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
  -- SHE IS GIVEN THE FIRST DEAL AND NOTHING ELSE.
  perform custom.share_grant(v_org, v_r1, 'user', v_dana, 'viewer'::public.permission_level);

  -- ══════════════════════════════ PART 1 — the owner: nothing is withheld, and the door LIVES
  -- This is the 22023 class. For a reader the store withholds nothing from, the old door did
  -- not export fewer rows — it raised, and the export feature did not exist.
  v_exp := custom.io_export(v_org, v_tbl, null, 200, 'viewer');
  select count(*) into n from custom.read_records(v_org, v_tbl, false, 200, 0);
  if n <> 3 then
    raise exception '1a: the read door opens % of the owner''s three rows', n;
  end if;
  if jsonb_array_length(v_exp -> 'rows') <> n then
    raise exception '1a: the export hands the owner % row(s) where the read door opens %',
      jsonb_array_length(v_exp -> 'rows'), n;
  end if;
  if v_exp -> 'withheld' <> '{}'::jsonb then
    raise exception '1b: nothing is withheld from the owner and the export named %',
      v_exp -> 'withheld';
  end if;
  raise notice 'PART 1 PASSED — the owner: % exported row(s) = % opened by the read door, nothing withheld',
    jsonb_array_length(v_exp -> 'rows'), n;

  -- ══════════════════════════════ PART 2 — Dana: one row, TWO withheld columns, ONE copy
  perform set_config('request.jwt.claims', c_dana_j, true);
  -- 2a. the control — the mask really is on, and it is on TWO columns.
  select count(*) into v_hidden
    from custom.read_records(v_org, v_tbl, false, 200, 0) rr,
         lateral jsonb_object_keys(rr.document -> '_hidden') k;
  if v_hidden <> 2 then
    raise exception '2a: the store withholds % column(s) from her, and this clause needs two',
      v_hidden;
  end if;
  -- 2b. the read door opens exactly the one record she was given …
  select count(*) into n from custom.read_records(v_org, v_tbl, false, 200, 0);
  if n <> 1 then
    raise exception '2b: the read door opens % row(s) for somebody shared exactly one', n;
  end if;
  -- 2c. … AND THE EXPORT HANDS HER ONE COPY OF IT, not one per withheld column.
  v_exp := custom.io_export(v_org, v_tbl, null, 200, 'viewer');
  if jsonb_array_length(v_exp -> 'rows') <> n then
    raise exception '2c: the export hands her % row(s) where the read door opens % — the page '
      'is multiplied by the % column(s) withheld from her',
      jsonb_array_length(v_exp -> 'rows'), n, v_hidden;
  end if;
  -- 2d. every withheld cell reads null, and the store SAYS WHICH and WHY.
  if exists (select 1 from jsonb_array_elements(v_exp -> 'rows') x
              where x -> 'client' <> 'null'::jsonb
                 or x -> 'internal_margin' <> 'null'::jsonb) then
    raise exception '2d: a column the store withheld from her carries a value in her export: %',
      v_exp -> 'rows';
  end if;
  if (v_exp -> 'withheld' -> 'client') is null
     or (v_exp -> 'withheld' -> 'internal_margin') is null then
    raise exception '2d: the export does not name both withheld columns: %', v_exp -> 'withheld';
  end if;
  if coalesce(v_exp -> 'withheld' -> 'client' ->> 'needs', '') = '' then
    raise exception '2d: the withheld column carries no reason: %', v_exp -> 'withheld' -> 'client';
  end if;
  raise notice 'PART 2 PASSED — Dana: one row, one copy, both withheld columns null and named ("%")',
    v_exp -> 'withheld' -> 'client' ->> 'needs';

  -- ══════════════════════════════ PART 3 — field for field against the record door
  -- The multiset of documents the export hands her, against the multiset `custom.read_record`
  -- hands her for the SAME records projected onto the SAME columns. Two hashes, one answer.
  select array_agg(c order by ord) into v_cols
    from jsonb_array_elements_text(v_exp -> 'columns') with ordinality x(c, ord);
  v_cols := coalesce(v_cols, array[]::text[]);
  if coalesce(array_length(v_cols, 1), 0) < 4 then
    raise exception '3: the export names % column(s) and the Table has four', coalesce(array_length(v_cols, 1), 0);
  end if;
  select coalesce(array_agg(md5(d::text) order by md5(d::text)), array[]::text[]) into v_e
    from jsonb_array_elements(v_exp -> 'rows') d;
  v_r := array[]::text[];
  for v_id in select rr.id from custom.read_records(v_org, v_tbl, false, 200, 0) rr loop
    v_doc := custom.read_record(v_org, v_id, false);
    v_r := v_r || md5((select coalesce(jsonb_object_agg(c, coalesce(v_doc -> c, 'null'::jsonb)), '{}'::jsonb)
                         from unnest(v_cols) c)::text);
  end loop;
  select coalesce(array_agg(x order by x), array[]::text[]) into v_r from unnest(v_r) x;
  if v_e is distinct from v_r then
    raise exception '3: the export is not custom.read_record''s answer field for field — export % / record door %',
      array_to_string(v_e, ','), array_to_string(v_r, ',');
  end if;
  raise notice 'PART 3 PASSED — field for field: the export and custom.read_record hash to the same % document(s)',
    coalesce(array_length(v_e, 1), 0);

  -- ══════════════════════════════ PART 4 — a Choice exports as the word a person reads
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_exp := custom.io_export(v_org, v_tbl, null, 200, 'viewer');
  if not exists (select 1 from jsonb_array_elements(v_exp -> 'rows') x where x ->> 'stage' = 'Won') then
    raise exception '4a: no exported row''s Stage reads "Won": %',
      (select coalesce(string_agg(x ->> 'stage', ', '), 'nothing')
         from jsonb_array_elements(v_exp -> 'rows') x);
  end if;
  if (v_exp -> 'choices' -> 'stage' -> 'options' -> 'won' ->> 'label') is distinct from 'Won' then
    raise exception '4b: the export carries no vocabulary behind the label: %', v_exp -> 'choices';
  end if;
  raise notice 'PART 4 PASSED — the Choice exports as "Won", with the key `won` beside it';

  -- ══════════════════════════════ PART 5 — `p_required` no longer answers a question nobody asked
  -- NOTHING FAILS SILENTLY: this door's rows come from the read door, which answers at viewer.
  v_msg := null;
  begin
    perform custom.io_export(v_org, v_tbl, null, 200, 'editor');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception '5a: the export was asked for the rows this person may EDIT and silently handed back the rows she may VIEW';
  end if;
  if position('viewer' in v_msg) = 0 then
    raise exception '5a: the refusal does not say what the door can serve — "%"', v_msg;
  end if;
  -- 5b. the control: viewer, and the default, both work.
  if jsonb_array_length(custom.io_export(v_org, v_tbl, null, 200, 'viewer') -> 'rows') <> 3
     or jsonb_array_length(custom.io_export(v_org, v_tbl) -> 'rows') <> 3 then
    raise exception '5b: the door refuses the level it does serve';
  end if;
  raise notice 'PART 5 PASSED — "%"', v_msg;

  -- ══════════════════════════════ PART 6 — census 13 over this organization
  -- NO CLIENT DOOR COVERS A CENSUS: `custom.list_door_disagreements` is server-only by
  -- declaration (platform.client_callable_door). The seat steps OUT to run it and asserts no
  -- product clause while out.
  perform set_config('role', v_boss, true);
  select count(*) into n from custom.list_door_disagreements(null, v_org, 200, true);
  if n <> 0 then
    raise exception '6: census 13 names % row(s) in this organization: %', n,
      (select string_agg(d.door || ' — ' || d.why, ' | ')
         from custom.list_door_disagreements(null, v_org, 200, true) d);
  end if;
  raise notice 'PART 6 PASSED — census 13 names nothing in this organization, calling every door for every row';

  raise notice 'ALL PARTS PASSED (0 seat, 1 the owner, 2 Dana a-d, 3 field for field, 4 the Choice, 5 p_required, 6 census 13)';
end $t$;

rollback;
