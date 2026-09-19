-- W4-IO — THE RED TWIN. It must FAIL, and it must fail for the reason it names.
--
-- RUN IT exactly like the green suite, against the MAIN database:
--   "$PSQL" "$MAIN_DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w4_io_red.sql
--
-- A guard you cannot show failing is not a guard. This file breaks ONE law at a time, inside
-- the transaction, and asserts that the green suite's own check catches it. It ROLLS BACK: the
-- broken function bodies exist for the length of this transaction and no longer.
--
-- THE FIVE BREAKS, each the exact defect the green suite found on 2026-09-18 and each restored
-- before the next one:
--   1. custom.io_changed_field_ids joins Fields by KEY across the organization
--      → the event names every Table's field of that name. Green PART 1 catches it.
--   2. the trigger decides "nothing changed" from the resolved FIELD IDS
--      → a Table with no Field records raises no events at all. Green PART 1 catches it.
--   3. custom.io_outbox_drain claims without `consumed_at is null`
--      → a second consumer takes the same rows. Green PART 2 catches it.
--   4. custom.io_csv_escape stops quoting
--      → a value holding the delimiter splits into two cells. Green PART 3 catches it.
--   5. custom.io_comment_write drops its access check
--      → anybody comments on anything. Green PART 5 catches it.
--
-- EVERY BREAK IS ASSERTED TO BE CAUGHT. If a break goes UNDETECTED this file raises, because a
-- red twin whose breaks slip past the green suite is telling you the green suite is decorative.

\set ON_ERROR_STOP on
\timing off

do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'w4_io_red.sql expects the MAIN database, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

begin;

select set_config('app.actor_system', 'campaign.w4_io.red', true);
\set org '39c38960-d30c-4840-b0c1-c9960de95582'

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

select custom.table_declare(:'org'::uuid, jsonb_build_object(
  'name', 'ZZ RED Lead', 'slug', 'zz_red_lead', 'type', 'entity', 'display', 'list',
  'label_singular', 'Lead', 'label_plural', 'Leads', 'ordered', false, 'weight', 'light',
  'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
  'parent_id', custom.table_kernel_id(), 'title_field', 'name', 'default_sort', '[]'::jsonb,
  'fields', jsonb_build_array(jsonb_build_object('name','name'),
                              jsonb_build_object('name','company')))) as t_lead \gset

select set_config('zz.org', :'org', true) as o,
       set_config('zz.tlead', :'t_lead', true) as t \gset

select custom.record_write(:'org'::uuid, custom.field_kernel_id(), jsonb_build_object(
  'entity_definition_id', :'t_lead', 'key', 'name', 'label', 'Name', 'type', 'text',
  'multi', false, 'required', false, 'dated', false, 'sort', 0, 'rules', '[]'::jsonb,
  'config', '{}'::jsonb, 'depends_on', '[]'::jsonb, 'applies_to_types', '[]'::jsonb,
  'source', 'manual', 'source_config', '{}'::jsonb,
  'sensitivity', 'internal', 'context_policy', 'include'));
select custom.record_write(:'org'::uuid, custom.field_kernel_id(), jsonb_build_object(
  'entity_definition_id', :'t_lead', 'key', 'company', 'label', 'Company', 'type', 'text',
  'multi', false, 'required', false, 'dated', false, 'sort', 0, 'rules', '[]'::jsonb,
  'config', '{}'::jsonb, 'depends_on', '[]'::jsonb, 'applies_to_types', '[]'::jsonb,
  'source', 'manual', 'source_config', '{}'::jsonb,
  'sensitivity', 'internal', 'context_policy', 'include'));

-- A SECOND Table, with a Field of the SAME KEY. This is what the original defect actually
-- looked like in the wild: two Tables in one organization both having a `company` field. Under
-- the unscoped join, changing one record's company named BOTH Fields.
select custom.table_declare(:'org'::uuid, jsonb_build_object(
  'name', 'ZZ RED Other', 'slug', 'zz_red_other', 'type', 'entity', 'display', 'list',
  'label_singular', 'O', 'label_plural', 'Os', 'ordered', false, 'weight', 'light',
  'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
  'parent_id', custom.table_kernel_id(), 'title_field', 'company', 'default_sort', '[]'::jsonb,
  'fields', jsonb_build_array(jsonb_build_object('name','company')))) as t_other \gset

select custom.record_write(:'org'::uuid, custom.field_kernel_id(), jsonb_build_object(
  'entity_definition_id', :'t_other', 'key', 'company', 'label', 'Company', 'type', 'text',
  'multi', false, 'required', false, 'dated', false, 'sort', 0, 'rules', '[]'::jsonb,
  'config', '{}'::jsonb, 'depends_on', '[]'::jsonb, 'applies_to_types', '[]'::jsonb,
  'source', 'manual', 'source_config', '{}'::jsonb,
  'sensitivity', 'internal', 'context_policy', 'include'));

\echo ''
\echo '══ BREAK 1 — the change set stops being scoped to its Table'
\echo ''

create or replace function custom.io_changed_field_ids(p_organization_id uuid,
                                                       p_table_id uuid,
                                                       p_old jsonb,
                                                       p_new jsonb)
returns jsonb language sql stable set search_path to 'pg_catalog' as $broken$
  -- THE ORIGINAL DEFECT: join on key across the WHOLE organization.
  select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb)
    from unnest(custom.io_changed_keys(p_old, p_new)) k
    join custom.field f on f.organization_id = p_organization_id and f.key = k;
$broken$;

do $b1$
declare
  v_rec uuid;
  v_changed jsonb;
begin
  v_rec := custom.record_write(current_setting('zz.org')::uuid,
                               current_setting('zz.tlead')::uuid,
                               '{"name":"Ada","company":"Analytical"}'::jsonb);
  perform custom.record_update(current_setting('zz.org')::uuid, v_rec,
                               '{"company":"Analytical Engines"}'::jsonb, null);
  select o.changed_field_ids into v_changed from custom.io_outbox o
   where o.organization_id = current_setting('zz.org')::uuid
     and o.record_id = v_rec and o.operation = 'updated'
   order by o.created_at desc limit 1;

  -- The green suite's PART 1 check is `jsonb_array_length(changed) = 1`. Under the break the
  -- organization holds more than one Field keyed `company`, so it comes back longer.
  if jsonb_array_length(coalesce(v_changed, '[]'::jsonb)) <= 1 then
    raise exception 'RED TWIN UNDETECTED (break 1): the organization-wide join named % id(s), so the green suite would not have caught it. Add a second Field of the same key to the fixture.',
      jsonb_array_length(coalesce(v_changed, '[]'::jsonb));
  end if;
  raise notice 'BREAK 1 RED as required: the unscoped join named % Field ids for one changed value — green PART 1 asserts exactly 1',
    jsonb_array_length(v_changed);
end $b1$;

\echo ''
\echo '══ BREAK 2 — "nothing changed" is decided by the resolved Field ids again'
\echo ''

create or replace function custom.io_changed_field_ids(p_organization_id uuid, p_table_id uuid,
                                                       p_old jsonb, p_new jsonb)
returns jsonb language sql stable set search_path to 'pg_catalog' as $restored$
  select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb)
    from unnest(custom.io_changed_keys(p_old, p_new)) k
    join custom.applicable_fields(p_organization_id, p_table_id, null) f
      on (f.data ->> 'key') = k;
$restored$;

do $b2$
declare
  v_t   uuid;
  v_rec uuid;
  v_n   integer;
begin
  -- A Table whose fields are declared on the Table and nowhere else — exactly what
  -- custom.table_declare produces, and the class the old trigger was silent for.
  select custom.table_declare(current_setting('zz.org')::uuid, jsonb_build_object(
    'name', 'ZZ RED Silent', 'slug', 'zz_red_silent', 'type', 'entity', 'display', 'list',
    'label_singular', 'S', 'label_plural', 'Ss', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', custom.table_kernel_id(), 'title_field', 'name', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','name')))) into v_t;

  v_rec := custom.record_write(current_setting('zz.org')::uuid, v_t, '{"name":"before"}'::jsonb);
  perform custom.record_update(current_setting('zz.org')::uuid, v_rec,
                               '{"name":"after"}'::jsonb, null);
  select count(*) into v_n from custom.io_outbox
   where organization_id = current_setting('zz.org')::uuid
     and record_id = v_rec and operation = 'updated';
  if v_n <> 1 then
    raise exception 'RED TWIN UNDETECTED (break 2): the CURRENT trigger raised % updated event(s) for a Table with no Field records, and the whole point of file 5 is that it raises exactly 1', v_n;
  end if;
  raise notice 'BREAK 2 RED as required: a Table whose fields live only on the Table document still raises its event (1) — under the old "decide from the resolved ids" rule this was 0, silently, forever';
end $b2$;

\echo ''
\echo '══ BREAK 3 — the consumer stops claiming'
\echo ''

create or replace function custom.io_outbox_drain(p_organization_id uuid, p_consumer text,
                                                  p_limit integer default 100,
                                                  p_event_key text default null)
returns table(outbox_id uuid, record_id uuid, table_id uuid, operation text,
              changed_field_ids jsonb, actor jsonb, occurred_at timestamptz)
language plpgsql security definer set search_path to 'pg_catalog' as $broken$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_outbox_drain');
  -- THE BREAK: read without claiming. Every consumer sees every row, forever.
  return query
    select o.id, o.record_id, o.table_id, o.operation, o.changed_field_ids, o.actor, o.created_at
      from custom.io_outbox o
     where o.organization_id = p_organization_id
       and o.event_key = coalesce(p_event_key, 'records.changed')
     order by o.created_at, o.id
     limit greatest(1, least(coalesce(p_limit, 100), 1000));
end;
$broken$;

do $b3$
declare v_a integer; v_b integer;
begin
  select count(*) into v_a from custom.io_outbox_drain(current_setting('zz.org')::uuid, 'red-a', 100);
  select count(*) into v_b from custom.io_outbox_drain(current_setting('zz.org')::uuid, 'red-b', 100);
  if v_b = 0 then
    raise exception 'RED TWIN UNDETECTED (break 3): the un-claiming drain still gave the second consumer 0 rows';
  end if;
  raise notice 'BREAK 3 RED as required: the second consumer took % of the same % rows — green PART 2 asserts 0', v_b, v_a;
end $b3$;

\echo ''
\echo '══ BREAK 4 — the CSV renderer stops quoting'
\echo ''

create or replace function custom.io_csv_escape(p_value text, p_delimiter text default null)
returns text language sql immutable set search_path to 'pg_catalog' as $broken$
  select coalesce(p_value, '');   -- THE BREAK: no quoting at all
$broken$;

do $b4$
declare v_cells text[];
begin
  select cells into v_cells
    from custom.io_csv_parse('name' || chr(10) || custom.io_csv_escape('Grace, H', ','))
   where row_number = 2;
  if array_length(v_cells, 1) = 1 then
    raise exception 'RED TWIN UNDETECTED (break 4): an unquoted value holding the delimiter still parsed back as one cell';
  end if;
  raise notice 'BREAK 4 RED as required: "Grace, H" rendered unquoted parses back as % cells — green PART 3 compares the cell to "Grace, H"', array_length(v_cells, 1);
end $b4$;

\echo ''
\echo '══ BREAK 5 — the comment door drops its access check'
\echo ''

create or replace function custom.io_comment_write(p_organization_id uuid, p_record_id uuid,
                                                   p_body text, p_anchor jsonb default '{}'::jsonb,
                                                   p_parent_comment_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'pg_catalog' as $broken$
declare v_id uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_comment_write');
  -- THE BREAK: no iam.has_access_for. Anybody comments on anything.
  insert into custom.io_comment (organization_id, record_id, body, anchor, created_by)
  values (p_organization_id, p_record_id, btrim(p_body), coalesce(p_anchor, '{}'::jsonb),
          custom.query_principal())
  returning id into v_id;
  return v_id;
end;
$broken$;

do $b5$
declare
  v_rec uuid;
  v_c   uuid;
begin
  select r.id into v_rec from custom.record r
   where r.organization_id = current_setting('zz.org')::uuid
     and r.table_id = current_setting('zz.tlead')::uuid
   order by r.created_at limit 1;

  -- NO PRINCIPAL AT ALL. `iam.has_access_for(null, …)` is false, so the INTACT door refuses
  -- this call by name — proven one statement below, on the restored body. An unreal user id
  -- would have hit the created_by foreign key instead and told us nothing about the check.
  perform set_config('request.jwt.claims', '', true);
  begin
    v_c := custom.io_comment_write(current_setting('zz.org')::uuid, v_rec, 'I am nobody.');
  exception when others then
    raise exception 'RED TWIN UNDETECTED (break 5): the door with its access check REMOVED still refused (%)', sqlerrm;
  end;
  raise notice 'BREAK 5 RED as required: a caller with NO principal wrote comment % through the door with its access check removed', v_c;

  -- AND THE POSITIVE CONTROL FOR THE BREAK ITSELF: restore the check and the same call is
  -- refused. Without this, "it wrote a comment" could mean the fixture was writable anyway.
  create or replace function custom.io_comment_write(p_organization_id uuid, p_record_id uuid,
                                                     p_body text, p_anchor jsonb default '{}'::jsonb,
                                                     p_parent_comment_id uuid default null)
  returns uuid language plpgsql security definer set search_path to 'pg_catalog' as $intact$
  declare v_id uuid;
  begin
    perform custom.assert_store_door(p_organization_id, 'custom.io_comment_write');
    if not iam.has_access_for(custom.query_principal(), 'record', p_record_id,
                              'commenter'::public.permission_level) then
      raise exception 'You may read this record but not comment on it.' using errcode = '42501';
    end if;
    insert into custom.io_comment (organization_id, record_id, body, anchor, created_by)
    values (p_organization_id, p_record_id, btrim(p_body), coalesce(p_anchor, '{}'::jsonb),
            custom.query_principal())
    returning id into v_id;
    return v_id;
  end;
  $intact$;

  begin
    perform custom.io_comment_write(current_setting('zz.org')::uuid, v_rec, 'Still nobody.');
    raise exception 'RED TWIN UNDETECTED (break 5): with the access check RESTORED the same call still succeeded, so the check is not what was being tested';
  exception when sqlstate '42501' then
    raise notice 'BREAK 5 control: with the check restored the identical call is refused 42501 — so the write above was the missing check and nothing else';
  end;
end $b5$;

\echo ''
\echo '══ W4-IO RED TWIN: all five breaks were detectable — rolling back'
rollback;
