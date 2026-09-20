-- W4-IO — THE RED TWIN. It must FAIL, and it must fail for the reason it names.
--
-- RUN IT exactly like the green suite, against the MAIN database:
--   "$PSQL" "$MAIN_DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w4_io_red.sql
--
-- A guard you cannot show failing is not a guard. This file breaks ONE law at a time, inside
-- the transaction, and asserts that the green suite's own check catches it. It ROLLS BACK: the
-- broken function bodies, the disposable organization and every row exist for the length of
-- this transaction and no longer.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). Every OBSERVATION below is made from the seat a
-- signed-in person has — `authenticated`, proved in PART 0 — and through the doors that person
-- reaches: the outbox is read through `custom.io_outbox_drain` (the only client door over it),
-- comments through `custom.io_comment_write` / `custom.io_comments`. Replacing a function body
-- is DDL and belongs to nobody but the operator, so each BREAK steps out of the seat for
-- exactly the `create or replace` and steps straight back in; nothing is asserted while out.
-- BREAK 4 stays out for its whole length and says why: `custom.io_csv_escape` and
-- `custom.io_csv_parse` are the importer's own renderer and reader and hold no client grant —
-- they are the measuring instrument, not a door.
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
--      → anybody comments on anything, including a member who was shared nothing.
--        Green PART 5 catches it.
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

select set_config('zz.boss', current_user, true);
select set_config('app.actor_system', 'campaign.w4_io.red', true);

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- FIXTURES, as the connected role. A seat is a PERSON: an organization, a membership for each
-- of the two test accounts, the switch this organization's store answers on, and a Home.
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'ZZ W4-IO Red', 'zz-w4-io-red-' || substr(v_org::text, 1, 8), 'ZIR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w4_io_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  perform set_config('zz.org', v_org::text, true);
  perform set_config('zz.home', v_home::text, true);
end $fixture$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PART 0 — THE SEAT. Everything after this line runs as a signed-in person unless it says so.
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $part0$
begin
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
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';
end $part0$;

-- THE TABLES AND THEIR FIELDS, THROUGH THE DOORS a signed-in admin of the Home reaches.
do $tables$
declare
  v_org    uuid := current_setting('zz.org')::uuid;
  v_home   uuid := current_setting('zz.home')::uuid;
  v_lead   uuid;
  v_other  uuid;
begin
  v_lead := custom.table_declare(v_org, jsonb_build_object(
    'name', 'ZZ RED Lead', 'slug', 'zz_red_lead', 'type', 'entity', 'display', 'list',
    'label_singular', 'Lead', 'label_plural', 'Leads', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'name', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','name'),
                                jsonb_build_object('name','company'))));
  perform custom.field_declare(v_org, v_lead, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_lead, jsonb_build_object('key','company','label','Company','plain','text','sort',20));

  -- A SECOND Table, with a Field of the SAME KEY. This is what the original defect actually
  -- looked like in the wild: two Tables in one organization both having a `company` field.
  -- Under the unscoped join, changing one record's company named BOTH Fields.
  v_other := custom.table_declare(v_org, jsonb_build_object(
    'name', 'ZZ RED Other', 'slug', 'zz_red_other', 'type', 'entity', 'display', 'list',
    'label_singular', 'O', 'label_plural', 'Os', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'company', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','company'))));
  perform custom.field_declare(v_org, v_other, jsonb_build_object('key','company','label','Company','plain','text','sort',10));

  perform set_config('zz.tlead', v_lead::text, true);
  perform set_config('zz.tother', v_other::text, true);
end $tables$;

\echo ''
\echo '══ BREAK 1 — the change set stops being scoped to its Table'
\echo ''

-- Replacing a function body is DDL. No client door does it and none ever will, so this steps
-- out of the seat for exactly the statement and asserts nothing while out.
select set_config('role', current_setting('zz.boss'), true);
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
select set_config('role', 'authenticated', true);

do $b1$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_rec uuid;
  v_changed jsonb;
begin
  v_rec := custom.record_write(v_org, current_setting('zz.tlead')::uuid,
                               '{"name":"Ada","company":"Analytical"}'::jsonb);
  perform custom.record_update(v_org, v_rec, '{"company":"Analytical Engines"}'::jsonb, null);

  -- READ THROUGH THE DOOR. `custom.io_outbox` holds no client grant; the drain is what a
  -- signed-in person has, and it is what the green suite reads too.
  select (array_agg(d.changed_field_ids) filter (where d.operation = 'updated'))[1]
    into v_changed
    from custom.io_outbox_drain(v_org, 'zz-red-b1', 1000) d
   where d.record_id = v_rec;

  -- The green suite's PART 1 check is `jsonb_array_length(changed) = 1`. Under the break the
  -- organization holds more than one Field keyed `company`, so it comes back longer.
  if jsonb_array_length(coalesce(v_changed, '[]'::jsonb)) <= 1 then
    raise exception 'RED TWIN UNDETECTED (break 1): the organization-wide join named % id(s), so the green suite would not have caught it. Add a second Field of the same key to the fixture.',
      jsonb_array_length(coalesce(v_changed, '[]'::jsonb));
  end if;
  raise notice 'BREAK 1 RED as required: the unscoped join named % Field ids for one changed value, read off the drain door — green PART 1 asserts exactly 1',
    jsonb_array_length(v_changed);
end $b1$;

\echo ''
\echo '══ BREAK 2 — "nothing changed" is decided by the resolved Field ids again'
\echo ''

select set_config('role', current_setting('zz.boss'), true);
create or replace function custom.io_changed_field_ids(p_organization_id uuid, p_table_id uuid,
                                                       p_old jsonb, p_new jsonb)
returns jsonb language sql stable set search_path to 'pg_catalog' as $restored$
  select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb)
    from unnest(custom.io_changed_keys(p_old, p_new)) k
    join custom.applicable_fields(p_organization_id, p_table_id, null) f
      on (f.data ->> 'key') = k;
$restored$;
select set_config('role', 'authenticated', true);

do $b2$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_t   uuid;
  v_rec uuid;
  v_n   integer;
begin
  -- A Table whose fields are declared on the Table and nowhere else — exactly what
  -- custom.table_declare produces, and the class the old trigger was silent for.
  v_t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'ZZ RED Silent', 'slug', 'zz_red_silent', 'type', 'entity', 'display', 'list',
    'label_singular', 'S', 'label_plural', 'Ss', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', current_setting('zz.home'), 'title_field', 'name', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','name'))));

  v_rec := custom.record_write(v_org, v_t, '{"name":"before"}'::jsonb);
  perform custom.record_update(v_org, v_rec, '{"name":"after"}'::jsonb, null);
  select count(*) into v_n
    from custom.io_outbox_drain(v_org, 'zz-red-b2', 1000) d
   where d.record_id = v_rec and d.operation = 'updated';
  if v_n <> 1 then
    raise exception 'RED TWIN UNDETECTED (break 2): the CURRENT trigger raised % updated event(s) for a Table with no Field records, and the whole point of file 5 is that it raises exactly 1', v_n;
  end if;
  raise notice 'BREAK 2 RED as required: a Table whose fields live only on the Table document still raises its event (1) on the drain door — under the old "decide from the resolved ids" rule this was 0, silently, forever';
end $b2$;

\echo ''
\echo '══ BREAK 3 — the consumer stops claiming'
\echo ''

select set_config('role', current_setting('zz.boss'), true);
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
select set_config('role', 'authenticated', true);

do $b3$
declare
  v_org uuid := current_setting('zz.org')::uuid;
  v_a integer; v_b integer;
begin
  -- The door itself, from the seat, twice — exactly as the green suite asks it.
  select count(*) into v_a from custom.io_outbox_drain(v_org, 'red-a', 100);
  select count(*) into v_b from custom.io_outbox_drain(v_org, 'red-b', 100);
  if v_b = 0 then
    raise exception 'RED TWIN UNDETECTED (break 3): the un-claiming drain still gave the second consumer 0 rows';
  end if;
  raise notice 'BREAK 3 RED as required: the second consumer took % of the same % rows — green PART 2 asserts 0', v_b, v_a;
end $b3$;

\echo ''
\echo '══ BREAK 4 — the CSV renderer stops quoting'
\echo ''

-- THIS WHOLE BREAK IS OUT OF THE SEAT AND SAYS SO. `custom.io_csv_escape` and
-- `custom.io_csv_parse` are the importer's own renderer and reader: neither holds a client
-- grant and neither is a door. They are the measuring instrument this break points at, and the
-- product clause they serve — that a value holding the delimiter survives the EXPORT DOOR
-- unchanged — is asserted from the seat in the green suite's PART 3.
select set_config('role', current_setting('zz.boss'), true);
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
select set_config('role', 'authenticated', true);

\echo ''
\echo '══ BREAK 5 — the comment door drops its access check'
\echo ''

select set_config('role', current_setting('zz.boss'), true);
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
select set_config('role', 'authenticated', true);

do $b5$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid := current_setting('zz.org')::uuid;
  v_rec uuid;
  v_c   uuid;
begin
  -- The record is chosen through the read door, by the value a person sees.
  perform set_config('request.jwt.claims', c_admin_j, true);
  select rr.id into v_rec from custom.read_records(v_org, current_setting('zz.tlead')::uuid,
                                                   false, 500, 0) rr
   where rr.document ->> 'name' = 'Ada' limit 1;
  if v_rec is null then
    raise exception 'RED TWIN SETUP FAIL (break 5): the read door does not show admin the record the fixture wrote';
  end if;

  -- A REAL SECOND PERSON. `test@test.com` is a member of this organization who was shared
  -- NOTHING — the question the old seat could not ask at all, because as the owner of
  -- custom.record `custom.assert_client_may_reach` returned true on its first line for every
  -- organization on the database. With the access check REMOVED she comments anyway.
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    v_c := custom.io_comment_write(v_org, v_rec, 'I was never given this record.');
  exception when others then
    raise exception 'RED TWIN UNDETECTED (break 5): the door with its access check REMOVED still refused (%)', sqlerrm;
  end;
  raise notice 'BREAK 5 RED as required: test@test.com, a member who was shared nothing, wrote comment % through the door with its access check removed', v_c;

  -- AND THE POSITIVE CONTROL FOR THE BREAK ITSELF: restore the check and the same call is
  -- refused. Without this, "she wrote a comment" could mean the fixture was writable anyway.
  perform set_config('role', current_setting('zz.boss'), true);
  execute $intact$
  create or replace function custom.io_comment_write(p_organization_id uuid, p_record_id uuid,
                                                     p_body text, p_anchor jsonb default '{}'::jsonb,
                                                     p_parent_comment_id uuid default null)
  returns uuid language plpgsql security definer set search_path to 'pg_catalog' as $body$
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
  $body$;
  $intact$;
  perform set_config('role', 'authenticated', true);

  begin
    perform custom.io_comment_write(v_org, v_rec, 'Still not mine.');
    raise exception 'RED TWIN UNDETECTED (break 5): with the access check RESTORED test@test.com still commented, so the check is not what was being tested';
  exception when sqlstate '42501' then
    raise notice 'BREAK 5 control: with the check restored the identical call from test@test.com is refused 42501 — so the write above was the missing check and nothing else';
  end;

  -- AND THE CONTROL FOR HER, so "she is refused" is not a door that refuses her everything:
  -- shared the record at viewer, she reads it and the conversation on it.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_rec, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_rec, true) ->> 'name') <> 'Ada' then
    raise exception 'RED TWIN CONTROL FAILED (break 5): the record shared with test@test.com at viewer does not read back for her';
  end if;
  if (select count(*) from custom.io_comments(v_org, v_rec, true)) < 1 then
    raise exception 'RED TWIN CONTROL FAILED (break 5): a viewer cannot read the conversation on a record she holds';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'BREAK 5 control 2: the same person, shared the record at viewer, reads it and its comments — so the two refusals above are the ladder and not a door that says no to her about everything';
end $b5$;

\echo ''
\echo '══ W4-IO RED TWIN: all five breaks were detectable — rolling back'
rollback;
