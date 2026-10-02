-- LANE 10 VIEWS-AND-FIELDS, sublane P4 — NINE MORE KINDS OF COLUMN, ASKED FROM THE OWNER'S SEAT.
-- Guard for migrations/campaign/viewsfields_p4_a_column_can_be_a_rating_a_duration_a_status_an_address_and_five_more.sql
--
-- Every check runs as `authenticated` with admin@admin.com's claims (the owner of Cedar Ridge Physical Therapy; a member holds viewer on its tables and may not add a column) (set local role — the grants are part
-- of what is proven), writing as a declared person (app.actor_tier = user), on Cedar Ridge Physical
-- Therapy's Patient Visit Tracker. One transaction, rolled back; nothing is left behind.
--   K. custom.field_kinds() publishes the nine; every one is declared through custom.field_declare (the
--      real door) and custom.field_kind_of reads each back as itself; custom.parity_type still answers
--      the machinery's word for the three that ride an older type (status → select, count → rollup,
--      created by → formula).
--   G. Good values land: a pain rating of 3 out of 5, a 45-minute session (2700 s), the clinic's
--      address in parts, a wristband barcode, Markdown notes, a status in progress; the record reads
--      back who made it ({id, name}) and how many visits it links.
--   B. Bad values are refused, each in a plain sentence naming the column: 3.5 stars, 6 of 5 stars,
--      minus a minute, an address as one line, an address with an unknown part, a barcode with a line
--      break, an EAN-13 whose check digit is wrong, HTML in rich text, a script link, typing into
--      Created by; and at declare time a rating out of 11, a status group nobody knows.
-- THE VERDICT IS THE EXIT CODE: RED raises (psql exits 3 under ON_ERROR_STOP), GREEN exits 0.
--
-- RUN IT (dev clone only; rolled back), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/viewsfields_p4_nine_kinds_from_the_owners_seat.sql
\set ON_ERROR_STOP on
\set suite 'viewsfields_p4_nine_kinds_from_the_owners_seat.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\set QUIET on
begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';

create temp table res (check_name text, ok boolean, detail text) on commit drop;
grant all on res to authenticated, service_role;

select set_config('t.me', '87a6e699-3622-4869-8843-d0867456c0dd', true),     -- admin@admin.com
       set_config('t.org', '0a54df90-eab8-4d07-ab29-81a45fb41e04', true),    -- Cedar Ridge Physical Therapy
       set_config('t.tracker', '031d3690-4a02-4cee-a575-454ffd96c992', true), -- its Patient Visit Tracker
       set_config('t.visits', 'b79ba573-fb65-46f9-be54-e37d11ee4206', true)   -- its Visits
\g /dev/null

-- ── the owner's seat, writing as a person ───────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.me'), 'role', 'authenticated')::text, true),
       set_config('app.actor_tier', 'user', true) \g /dev/null

-- K
do $$
declare
  o uuid := current_setting('t.org')::uuid;
  t uuid := current_setting('t.tracker')::uuid;
  v_ids jsonb := '{}'::jsonb;
  k text;
  d jsonb;
  v_kinds text[] := array['rating','duration','created_by','modified_by','status','address','barcode','rich_text','count'];
begin
  insert into res values ('K field_kinds publishes the nine',
    (select count(*) from custom.field_kinds() f where f.kind = any (v_kinds)) = 9,
    (select string_agg(kind, ',' order by kind) from custom.field_kinds() f where f.kind = any (v_kinds)));

  -- the many-relation a count counts along
  perform custom.field_declare(o, t, jsonb_build_object('label', 'Visits booked', 'type', 'relation',
            'relation_target', current_setting('t.visits'), 'multi', true));

  v_ids := v_ids
    || jsonb_build_object('rating',      custom.field_declare(o, t, jsonb_build_object('label', 'Pain rating', 'type', 'rating', 'max', 5)))
    || jsonb_build_object('duration',    custom.field_declare(o, t, jsonb_build_object('label', 'Session length', 'type', 'duration')))
    || jsonb_build_object('created_by',  custom.field_declare(o, t, jsonb_build_object('label', 'Booked by', 'type', 'created_by')))
    || jsonb_build_object('modified_by', custom.field_declare(o, t, jsonb_build_object('label', 'Last updated by', 'type', 'modified_by')))
    || jsonb_build_object('status',      custom.field_declare(o, t, jsonb_build_object('label', 'Plan status', 'type', 'status',
                                            'options', jsonb_build_array('Not started', 'In progress', 'Discharged'),
                                            'status_groups', jsonb_build_object('Not started', 'To do', 'In progress', 'in_progress', 'Discharged', 'done'))))
    || jsonb_build_object('address',     custom.field_declare(o, t, jsonb_build_object('label', 'Clinic address', 'type', 'address')))
    || jsonb_build_object('barcode',     custom.field_declare(o, t, jsonb_build_object('label', 'Wristband', 'type', 'barcode', 'symbology', 'EAN13')))
    || jsonb_build_object('rich_text',   custom.field_declare(o, t, jsonb_build_object('label', 'Treatment notes', 'type', 'rich_text')))
    || jsonb_build_object('count',       custom.field_declare(o, t, jsonb_build_object('label', 'Visits so far', 'type', 'count', 'via', 'visits_booked')));
  perform set_config('t.ids', v_ids::text, true);
end $$;

-- K, read back as the store's owner: the documents the door wrote (the seat cannot read custom.record).
reset role;
select set_config('t.visit', coalesce((select v.id::text from custom.record v where v.organization_id = current_setting('t.org')::uuid
         and v.table_id = current_setting('t.visits')::uuid and v.deleted_at is null order by v.created_at limit 1), ''), true) \g /dev/null
do $$
declare
  o uuid := current_setting('t.org')::uuid;
  v_ids jsonb := current_setting('t.ids')::jsonb;
  k text;
  d jsonb;
  v_kinds text[] := array['rating','duration','created_by','modified_by','status','address','barcode','rich_text','count'];
begin
  foreach k in array v_kinds loop
    select f.data into d from custom.record f where f.organization_id = o and f.id = (v_ids ->> k)::uuid;
    insert into res values ('K ' || k || ' reads back as itself', custom.field_kind_of(d) = k,
                            format('%s: %s', custom.field_kind_of(d), d - 'rules' - 'source_config' - 'applies_to_types' - 'depends_on'));
  end loop;
  select f.data into d from custom.record f where f.organization_id = o and f.id = (v_ids ->> 'status')::uuid;
  insert into res values ('K status is still a select to the machinery', custom.parity_type(d) = 'select', custom.parity_type(d));
  insert into res values ('K status keeps its groups by choice key',
    d -> 'config' -> 'status_groups' = '{"not_started":"todo","in_progress":"in_progress","discharged":"done"}'::jsonb,
    (d -> 'config' -> 'status_groups')::text);
  select f.data into d from custom.record f where f.organization_id = o and f.id = (v_ids ->> 'count')::uuid;
  insert into res values ('K count is still a rollup to the machinery', custom.parity_type(d) = 'rollup' and d -> 'config' ->> 'agg' = 'count', d::text);
  select f.data into d from custom.record f where f.organization_id = o and f.id = (v_ids ->> 'rating')::uuid;
  insert into res values ('K rating shows as five stars', d -> 'display_format' = '{"id":"rating","options":{"ratingMax":5}}'::jsonb
                          and d -> 'rules' @> '[{"kind":"min","value":0},{"kind":"max","value":5}]'::jsonb, d::text);
  select f.data into d from custom.record f where f.organization_id = o and f.id = (v_ids ->> 'barcode')::uuid;
  insert into res values ('K barcode keeps its symbology', d -> 'config' ->> 'symbology' = 'ean13', d::text);
  select f.data into d from custom.record f where f.organization_id = o and f.id = (v_ids ->> 'created_by')::uuid;
  insert into res values ('K created by is worked out on read', d ->> 'compute_on' = 'read' and custom.parity_type(d) = 'formula'
                          and d -> 'display_format' ->> 'id' = 'person', d::text);
end $$;

-- G, back in the owner's seat
set local role authenticated;
-- G
do $$
declare
  o uuid := current_setting('t.org')::uuid;
  t uuid := current_setting('t.tracker')::uuid;
  v_visit uuid;
  r uuid;
  v jsonb;
begin
  v_visit := nullif(current_setting('t.visit'), '')::uuid;
  r := custom.record_write(o, t, jsonb_build_object(
         'title', 'Maya Okafor — knee rehab, week 3',
         'pain_rating', 3,
         'session_length', 2700,
         'clinic_address', jsonb_build_object('street', '1420 Cedar Ridge Pkwy, Suite 200', 'city', 'Boulder', 'region', 'CO',
                                              'postal_code', '80301', 'country', 'US'),
         'wristband', '4006381333931',
         'treatment_notes', E'**Quad sets** 3×10, _heel slides_ to 95°.\n- ice 15 min\n- see [home program](https://cedarridgept.example/hep)',
         'plan_status', 'in_progress',
         'visits_booked', case when v_visit is null then '[]'::jsonb else jsonb_build_array(v_visit) end));
  perform set_config('t.rec', r::text, true);
  v := custom.read_record(o, r);
  insert into res values ('G a good row lands and reads back', v ->> 'pain_rating' = '3' and v ->> 'session_length' = '2700'
                          and v -> 'clinic_address' ->> 'city' = 'Boulder' and v -> '_choices' -> 'plan_status' ->> 'key' = 'in_progress' and v ->> 'wristband' = '4006381333931'
                          and v ->> 'treatment_notes' like '**Quad sets**%', left(v::text, 600));
  insert into res values ('G created by is the writer, named', v -> 'booked_by' ->> 'id' = current_setting('t.me')
                          and coalesce(v -> 'booked_by' ->> 'name', '') <> '', (v -> 'booked_by')::text);
  insert into res values ('G last updated by is the writer', v -> 'last_updated_by' ->> 'id' = current_setting('t.me'), (v -> 'last_updated_by')::text);
  insert into res values ('G count counts the linked visits', (v ->> 'visits_so_far')::numeric = case when v_visit is null then 0 else 1 end,
                          coalesce(v ->> 'visits_so_far', 'null'));
end $$;

-- B: every refusal, said in words naming the column
create temp table bad (label text, data jsonb, want text) on commit drop;
grant all on bad to authenticated;
insert into bad values
  ('half a star',        '{"pain_rating": 3.5}',                         'Pain rating is a whole number of stars from 0 to 5'),
  ('six of five stars',  '{"pain_rating": 6}',                           'Pain rating is a whole number of stars from 0 to 5'),
  ('minus a minute',     '{"session_length": -60}',                      'Session length is a length of time, and a length of time is never below zero'),
  ('address as a line',  '{"clinic_address": "1420 Cedar Ridge Pkwy"}',  'Clinic address takes an address in parts'),
  ('address bad part',   '{"clinic_address": {"zip": "80301"}}',         'Clinic address is an address, and an address has no part called zip'),
  ('barcode line break', E'{"wristband": "4006381\\n333931"}',           'Wristband is a barcode'),
  ('ean check digit',    '{"wristband": "4006381333932"}',               'does not check out'),
  ('ean too short',      '{"wristband": "40063813"}',                    'Wristband is a EAN-13 barcode, which is 13 digits'),
  ('html in rich text',  '{"treatment_notes": "<script>alert(1)</script>"}', 'Treatment notes keeps formatted text as Markdown, and it was given HTML'),
  ('script link',        '{"treatment_notes": "[x](javascript:alert(1))"}', 'Treatment notes has a link that runs a script'),
  ('typed created by',   '{"booked_by": "someone"}',                     'Booked by is worked out by the system, so it cannot be typed in'),
  ('unknown status',     '{"plan_status": "on_hold"}',                   'Plan status does not have a choice called "on_hold"');
grant all on bad to authenticated;

do $$
declare
  b record;
  m text;
begin
  for b in select * from bad loop
    begin
      perform custom.record_update(current_setting('t.org')::uuid, current_setting('t.rec')::uuid, b.data, null);
      insert into res values ('B refused: ' || b.label, false, 'it was accepted');
    exception when others then
      get stacked diagnostics m = message_text;
      insert into res values ('B refused: ' || b.label, position(b.want in m) > 0 and m !~ '[0-9a-f]{8}-[0-9a-f]{4}-', m);
    end;
  end loop;
end $$;

do $$
declare m text;
begin
  begin
    perform custom.field_declare(current_setting('t.org')::uuid, current_setting('t.tracker')::uuid,
                                 jsonb_build_object('label', 'Mobility score', 'type', 'rating', 'max', 11));
    insert into res values ('B refused: a rating out of 11', false, 'declared');
  exception when others then
    get stacked diagnostics m = message_text;
    insert into res values ('B refused: a rating out of 11', m like 'A rating goes up to a whole number of stars from 1 to 10%', m);
  end;
  begin
    perform custom.field_declare(current_setting('t.org')::uuid, current_setting('t.tracker')::uuid,
                                 jsonb_build_object('label', 'Referral status', 'type', 'status', 'options', jsonb_build_array('Waiting'),
                                                    'status_groups', jsonb_build_object('Waiting', 'someday')));
    insert into res values ('B refused: a status group nobody knows', false, 'declared');
  exception when others then
    get stacked diagnostics m = message_text;
    insert into res values ('B refused: a status group nobody knows', m like 'A status choice is to do, in progress or done, and "Waiting" is put in "someday"%', m);
  end;
end $$;

reset role;

-- L: THE COLUMNS THAT ALREADY SAID rating OR duration KEEP WORKING. The older grid's importer wrote five
-- (no max Rule, unit "seconds"), measured on the main database 2026-10-02: each one's document is
-- written again unchanged through every Field guard, and every value it holds is judged again.
do $$
declare f custom.record; r custom.record; n int := 0; m text;
begin
  for f in select * from custom.record x where x.table_id = custom.field_kernel_id() and x.deleted_at is null
              and x.data ->> 'format' in ('rating', 'duration') and x.data ->> 'key' not in ('pain_rating', 'session_length') loop
    begin
      update custom.record set data = data || '{}'::jsonb, version = version where id = f.id and organization_id = f.organization_id;
      for r in select * from custom.record v where v.organization_id = f.organization_id and v.deleted_at is null
                  and v.table_id = (f.data ->> 'entity_definition_id')::uuid and v.data ? (f.data ->> 'key') loop
        perform custom.validate_values(f.organization_id, array[f], r.data);
      end loop;
      n := n + 1;
    exception when others then
      get stacked diagnostics m = message_text;
      insert into res values ('L older column ' || (f.data ->> 'label') || ' still saves and its values still pass', false, m);
    end;
  end loop;
  insert into res values ('L every older rating and duration column still works', n > 0, n || ' columns');
end $$;
\set QUIET off
select ok, check_name, left(detail, 300) as detail from res order by ok, check_name;
do $$
declare n int; f text;
begin
  select count(*) filter (where not ok), string_agg(check_name, '; ') filter (where not ok) into n, f from res;
  if n > 0 then
    raise exception 'RED: % check(s) failed: %', n, f;
  end if;
  raise notice 'GREEN: % checks', (select count(*) from res);
end $$;
rollback;
