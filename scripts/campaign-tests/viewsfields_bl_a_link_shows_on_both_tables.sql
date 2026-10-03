-- VIEWS-AND-FIELDS BL — A LINK SHOWS ON BOTH TABLES (REL-9, Airtable's reverse column).
--
-- THE BREAK THIS CATCHES (measured on the nightly clone, 2026-10-02): a column on "Patient Visits"
-- linking to "Referring Physicians" left the physicians' table blind — no inverse_key, no reverse
-- column, and no door that reads a page of a table's inbound links.
--
-- WHAT IT ASSERTS, from the seat (`role authenticated`; admin@admin.com owns a fresh disposable
-- organization; test@test.com is a member under shared_only who is shown the physicians' table
-- and nothing of the visits' table):
--   1  a NEW relation Field with no inverse_key is given one from its table's name ("patient_visits")
--   2  an inverse_key the caller named is kept as named
--   3  custom.reverse_columns(physicians) lists the reverse column — key, label "Patient Visits",
--      source field and table, read-only — and custom.applicable_fields(physicians) is unchanged
--      (REL-9: the reverse is NOT a second Field)
--   4  two columns of one table linking here are told apart by the column's name
--   5  custom.reverse_links_many answers a page of records at once: total + links (id, title)
--   6  it PAGES: limit and offset walk one record's links; a limit over 50 is held at 50; more
--      than 200 records a call is refused by name (54000)
--   7  a member who may read the physicians but not the visits sees NO reverse column, and asking
--      for its links is refused 42501 (no leak of the table's name or its records)
--   8  with custom.back_links off a new relation gets no inverse_key, and reverse_columns lists
--      only the relations whose author named one
--   9  a Person (member) column is never given an inverse_key (the control)
--
-- RUN IT (clone or main; one transaction ending in ROLLBACK — nothing persists):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/viewsfields_bl_a_link_shows_on_both_tables.sql
-- RED: before migrations/campaign/viewsfields_bl_a_link_shows_on_both_tables.sql it fails naming
-- 1, 3, 4, 5, 6, 7 and 8; GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'viewsfields_bl_a_link_shows_on_both_tables.sql'
\set requires 'grant:authenticated:custom.field_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '14s';
set local lock_timeout = '5s';
-- The suite runs as FOUR statements (each under the shared clone's 15 s), handing ids and findings
-- to the next through two temporary tables. Everything still ends in ROLLBACK.
create temp table bl_ctx (k text primary key, v uuid) on commit drop;
create temp table bl_fail (m text) on commit drop;

-- A: the organization, the tables, the Fields; checks 1, 2, 9, 3, 4
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_phys uuid; v_visits uuid; v_notes uuid;
  v_f_ref uuid; v_f_sec uuid; v_f_named uuid; v_f_member uuid; v_f_off uuid;
  v_gut uuid; v_oka uuid;
  v_ids uuid[];
  v_n integer; v_txt text; v_j jsonb;
  v_before integer; v_after integer;
  v_fail text[] := '{}';
  v_state text; v_msg text;
  i integer;
begin
  perform set_config('app.actor_system', 'campaign-test/viewsfields_bl', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy', 'cedar-ridge-pt-'||substr(v_org::text,1,8), 'CRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/viewsfields_bl'),
    ('custom','member_default_visibility','organization',v_org,v_org,'"shared_only"'::jsonb,
     'campaign-test/viewsfields_bl');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Cedar Ridge Physical Therapy — Front Desk')) returning id into v_home;

  -- THE SEAT.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;

  v_phys := custom.table_declare(v_org, jsonb_build_object(
    'name','Referring Physicians','slug','physicians_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Physician','label_plural','Physicians','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  v_visits := custom.table_declare(v_org, jsonb_build_object(
    'name','Patient Visits','slug','visits_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Patient Visit','label_plural','Patient Visits','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  v_notes := custom.table_declare(v_org, jsonb_build_object(
    'name','Referral Letters','slug','letters_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Referral Letter','label_plural','Referral Letters','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));

  select count(*) into v_before from custom.applicable_fields(v_org, v_phys);

  v_f_ref := custom.field_declare(v_org, v_visits, jsonb_build_object(
    'key','referring_physician','label','Referring physician','type','relation','relation_target', v_phys));
  v_f_sec := custom.field_declare(v_org, v_visits, jsonb_build_object(
    'key','covering_physician','label','Covering physician','type','relation','relation_target', v_phys));
  v_f_named := custom.field_declare(v_org, v_notes, jsonb_build_object(
    'key','addressed_to','label','Addressed to','type','relation','relation_target', v_phys,
    'inverse_key','letters_received'));
  v_f_member := custom.field_declare(v_org, v_visits, jsonb_build_object(
    'key','therapist','label','Therapist','type','member'));

  -- 1. A new relation is given a reverse key from its table's name.
  perform set_config('role', 'postgres', true);   -- read the stored Field as the store, then back to the seat
  select f.data ->> 'inverse_key' into v_txt from custom.record f where f.id = v_f_ref;
  perform set_config('role', 'authenticated', true);
  if v_txt is distinct from 'patient_visits' then
    v_fail := v_fail || ('1 a new relation on Patient Visits got inverse_key ' || coalesce(v_txt,'null') || ', not patient_visits');
  end if;
  -- 2. A named key is kept.
  perform set_config('role', 'postgres', true);   -- read the stored Field as the store, then back to the seat
  select f.data ->> 'inverse_key' into v_txt from custom.record f where f.id = v_f_named;
  perform set_config('role', 'authenticated', true);
  if v_txt is distinct from 'letters_received' then
    v_fail := v_fail || ('2 the inverse_key the caller named came back as ' || coalesce(v_txt,'null'));
  end if;
  -- 9. A Person column is never given one.
  perform set_config('role', 'postgres', true);   -- read the stored Field as the store, then back to the seat
  select f.data ->> 'inverse_key' into v_txt from custom.record f where f.id = v_f_member;
  perform set_config('role', 'authenticated', true);
  if v_txt is not null then
    v_fail := v_fail || ('9 a Person column was given inverse_key ' || v_txt);
  end if;

  -- 3 / 4. The reverse columns of the physicians' table, and no second Field.
  begin
    select count(*) into v_after from custom.applicable_fields(v_org, v_phys);
    if v_after <> v_before then
      v_fail := v_fail || format('3a applicable_fields(physicians) went from %s to %s: a reverse column became a Field', v_before, v_after);
    end if;
    execute 'select coalesce(jsonb_agg(to_jsonb(c) order by c.label), ''[]''::jsonb) from custom.reverse_columns($1, $2) c'
      into v_j using v_org, v_phys;
    if jsonb_array_length(v_j) <> 3 then
      v_fail := v_fail || ('3b reverse_columns(physicians) is not three columns: ' || v_j::text);
    end if;
    if not exists (select 1 from jsonb_array_elements(v_j) c
                    where c ->> 'source_field_id' = v_f_ref::text
                      and c ->> 'key' = 'patient_visits'
                      and c ->> 'label' = 'Patient Visits (Referring physician)'
                      and c ->> 'source_table_name' = 'Patient Visits'
                      and (c ->> 'read_only')::boolean) then
      v_fail := v_fail || ('4a the referring-physician reverse column is missing or misnamed: ' || v_j::text);
    end if;
    if not exists (select 1 from jsonb_array_elements(v_j) c
                    where c ->> 'source_field_id' = v_f_named::text
                      and c ->> 'key' = 'letters_received' and c ->> 'label' = 'Referral Letters') then
      v_fail := v_fail || ('3c the named reverse column is missing or misnamed: ' || v_j::text);
    end if;
    if exists (select 1 from jsonb_array_elements(v_j) c where c ->> 'source_field_id' = v_f_member::text) then
      v_fail := v_fail || '3d a Person column showed up as a reverse column'::text;
    end if;
  exception when others then
    v_fail := v_fail || ('3 reverse_columns failed: ' || sqlerrm);
  end;
  perform set_config('role', 'postgres', true);
  insert into pg_temp.bl_ctx values ('v_org', v_org) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_home', v_home) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_phys', v_phys) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_visits', v_visits) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_notes', v_notes) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_f_ref', v_f_ref) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_f_sec', v_f_sec) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_f_named', v_f_named) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_f_member', v_f_member) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_gut', v_gut) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_oka', v_oka) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_fail select unnest(v_fail);
end
$t$;

-- B: a page of records and paging; checks 5, 6
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_phys uuid; v_visits uuid; v_notes uuid;
  v_f_ref uuid; v_f_sec uuid; v_f_named uuid; v_f_member uuid; v_f_off uuid;
  v_gut uuid; v_oka uuid;
  v_ids uuid[];
  v_n integer; v_txt text; v_j jsonb;
  v_before integer; v_after integer;
  v_fail text[] := '{}';
  v_state text; v_msg text;
  i integer;
begin
  perform set_config('role', 'postgres', true);
  select v into v_org from pg_temp.bl_ctx where k = 'v_org';
  select v into v_home from pg_temp.bl_ctx where k = 'v_home';
  select v into v_phys from pg_temp.bl_ctx where k = 'v_phys';
  select v into v_visits from pg_temp.bl_ctx where k = 'v_visits';
  select v into v_notes from pg_temp.bl_ctx where k = 'v_notes';
  select v into v_f_ref from pg_temp.bl_ctx where k = 'v_f_ref';
  select v into v_f_sec from pg_temp.bl_ctx where k = 'v_f_sec';
  select v into v_f_named from pg_temp.bl_ctx where k = 'v_f_named';
  select v into v_f_member from pg_temp.bl_ctx where k = 'v_f_member';
  select v into v_gut from pg_temp.bl_ctx where k = 'v_gut';
  select v into v_oka from pg_temp.bl_ctx where k = 'v_oka';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  -- 5 / 6. A page of records, and paging.
  v_gut := custom.record_write(v_org, v_phys, jsonb_build_object('name','Dr. Marisol Gutierrez','parent_id',v_home::text));
  v_oka := custom.record_write(v_org, v_phys, jsonb_build_object('name','Dr. Samuel Okafor','parent_id',v_home::text));
  for i in 1..60 loop
    perform custom.record_write(v_org, v_visits, jsonb_build_object(
      'name', format('Visit %s — knee follow-up', lpad(i::text, 2, '0')),
      'referring_physician', v_gut::text, 'parent_id', v_home::text));
  end loop;
  perform custom.record_write(v_org, v_visits, jsonb_build_object(
    'name','Visit 61 — shoulder intake','referring_physician', v_oka::text,'parent_id',v_home::text));
  begin
    execute 'select coalesce(jsonb_object_agg(r.record_id, jsonb_build_object(''total'', r.total, ''links'', r.links)), ''{}''::jsonb)
               from custom.reverse_links_many($1, $2, $3, $4, 5, 0) r'
      into v_j using v_org, v_phys, v_f_ref, array[v_gut, v_oka];
    if (v_j -> v_gut::text ->> 'total')::int is distinct from 60
       or jsonb_array_length(v_j -> v_gut::text -> 'links') <> 5
       or (v_j -> v_oka::text ->> 'total')::int is distinct from 1
       or v_j -> v_oka::text -> 'links' -> 0 ->> 'words' is distinct from 'Visit 61 — shoulder intake' then
      v_fail := v_fail || ('5 a page of two physicians did not answer 60/5 and 1/1 with titles: ' || left(v_j::text, 600));
    end if;
    -- Two pages walk all 60 links once each: 50 from offset 0, then the last 10 from offset 50.
    execute 'select (select jsonb_agg(l -> ''id'') from custom.reverse_links_many($1, $2, $3, $4, 50, 0) r, jsonb_array_elements(r.links) l)
                 || (select jsonb_agg(l -> ''id'') from custom.reverse_links_many($1, $2, $3, $4, 50, 50) r, jsonb_array_elements(r.links) l)'
      into v_j using v_org, v_phys, v_f_ref, array[v_gut];
    select count(*), count(distinct x) into v_n, i from jsonb_array_elements_text(v_j) x;
    if v_n <> 60 or i <> 60 then
      v_fail := v_fail || format('6a two pages of 50 walked %s links (%s distinct), not all 60 once', v_n, i);
    end if;
    execute 'select jsonb_array_length(r.links) from custom.reverse_links_many($1, $2, $3, $4, 1000, 0) r'
      into v_n using v_org, v_phys, v_f_ref, array[v_gut];
    if v_n <> 50 then
      v_fail := v_fail || ('6b a limit of 1000 answered ' || v_n || ' links, not the ceiling of 50');
    end if;
  exception when others then
    v_fail := v_fail || ('5 reverse_links_many failed: ' || sqlerrm);
  end;
  begin
    v_ids := array(select gen_random_uuid() from generate_series(1, 201));
    execute 'select count(*) from custom.reverse_links_many($1, $2, $3, $4) r' into v_n
      using v_org, v_phys, v_f_ref, v_ids;
    v_fail := v_fail || '6c 201 records in one call were answered, not refused'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '54000' then
      v_fail := v_fail || ('6c 201 records were refused with ' || v_state || ': ' || sqlerrm);
    end if;
  end;
  perform set_config('role', 'postgres', true);
  insert into pg_temp.bl_ctx values ('v_org', v_org) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_home', v_home) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_phys', v_phys) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_visits', v_visits) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_notes', v_notes) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_f_ref', v_f_ref) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_f_sec', v_f_sec) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_f_named', v_f_named) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_f_member', v_f_member) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_gut', v_gut) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_ctx values ('v_oka', v_oka) on conflict (k) do update set v = excluded.v;
  insert into pg_temp.bl_fail select unnest(v_fail);
end
$t$;

-- C: a member who may read the physicians but not the visits; check 7
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_phys uuid; v_visits uuid; v_notes uuid;
  v_f_ref uuid; v_f_sec uuid; v_f_named uuid; v_f_member uuid; v_f_off uuid;
  v_gut uuid; v_oka uuid;
  v_ids uuid[];
  v_n integer; v_txt text; v_j jsonb;
  v_before integer; v_after integer;
  v_fail text[] := '{}';
  v_state text; v_msg text;
  i integer;
begin
  perform set_config('role', 'postgres', true);
  select v into v_org from pg_temp.bl_ctx where k = 'v_org';
  select v into v_home from pg_temp.bl_ctx where k = 'v_home';
  select v into v_phys from pg_temp.bl_ctx where k = 'v_phys';
  select v into v_visits from pg_temp.bl_ctx where k = 'v_visits';
  select v into v_notes from pg_temp.bl_ctx where k = 'v_notes';
  select v into v_f_ref from pg_temp.bl_ctx where k = 'v_f_ref';
  select v into v_f_sec from pg_temp.bl_ctx where k = 'v_f_sec';
  select v into v_f_named from pg_temp.bl_ctx where k = 'v_f_named';
  select v into v_f_member from pg_temp.bl_ctx where k = 'v_f_member';
  select v into v_gut from pg_temp.bl_ctx where k = 'v_gut';
  select v into v_oka from pg_temp.bl_ctx where k = 'v_oka';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  -- 7. A member who may read the physicians but not the visits.
  perform custom.share_grant(v_org, v_phys, 'person', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    execute 'select coalesce(jsonb_agg(to_jsonb(c)), ''[]''::jsonb) from custom.reverse_columns($1, $2) c'
      into v_j using v_org, v_phys;
    if exists (select 1 from jsonb_array_elements(v_j) c where c ->> 'source_table_id' = v_visits::text) then
      v_fail := v_fail || ('7a a member who may not read Patient Visits was shown its reverse column: ' || v_j::text);
    end if;
  exception when others then
    v_fail := v_fail || ('7a reverse_columns refused a member who may read the physicians: ' || sqlerrm);
  end;
  begin
    execute 'select count(*) from custom.reverse_links_many($1, $2, $3, $4) r' into v_n
      using v_org, v_phys, v_f_ref, array[v_gut];
    v_fail := v_fail || '7b a member who may not read Patient Visits was answered its links'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '42501' then
      v_fail := v_fail || ('7b the member''s ask for the visits'' links was refused with ' || v_state || ': ' || sqlerrm);
    end if;
  end;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'postgres', true);
  insert into pg_temp.bl_fail select unnest(v_fail);
end
$t$;

-- D: the knob off; check 8
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_phys uuid; v_visits uuid; v_notes uuid;
  v_f_ref uuid; v_f_sec uuid; v_f_named uuid; v_f_member uuid; v_f_off uuid;
  v_gut uuid; v_oka uuid;
  v_ids uuid[];
  v_n integer; v_txt text; v_j jsonb;
  v_before integer; v_after integer;
  v_fail text[] := '{}';
  v_state text; v_msg text;
  i integer;
begin
  perform set_config('role', 'postgres', true);
  select v into v_org from pg_temp.bl_ctx where k = 'v_org';
  select v into v_home from pg_temp.bl_ctx where k = 'v_home';
  select v into v_phys from pg_temp.bl_ctx where k = 'v_phys';
  select v into v_visits from pg_temp.bl_ctx where k = 'v_visits';
  select v into v_notes from pg_temp.bl_ctx where k = 'v_notes';
  select v into v_f_ref from pg_temp.bl_ctx where k = 'v_f_ref';
  select v into v_f_sec from pg_temp.bl_ctx where k = 'v_f_sec';
  select v into v_f_named from pg_temp.bl_ctx where k = 'v_f_named';
  select v into v_f_member from pg_temp.bl_ctx where k = 'v_f_member';
  select v into v_gut from pg_temp.bl_ctx where k = 'v_gut';
  select v into v_oka from pg_temp.bl_ctx where k = 'v_oka';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  -- 8. The knob off.
  begin
    perform set_config('role', 'postgres', true);
    insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
      ('custom','back_links','organization',v_org,v_org,'false'::jsonb,'campaign-test/viewsfields_bl');
    perform set_config('role', 'authenticated', true);
    v_f_off := custom.field_declare(v_org, v_notes, jsonb_build_object(
      'key','copied_to','label','Copied to','type','relation','relation_target', v_phys));
    perform set_config('role', 'postgres', true);   -- read the stored Field as the store, then back to the seat
    select f.data ->> 'inverse_key' into v_txt from custom.record f where f.id = v_f_off;
    perform set_config('role', 'authenticated', true);
    if v_txt is not null then
      v_fail := v_fail || ('8a with back_links off a new relation was given inverse_key ' || v_txt);
    end if;
    execute 'select coalesce(jsonb_agg(c.key order by c.key), ''[]''::jsonb) from custom.reverse_columns($1, $2) c'
      into v_j using v_org, v_phys;
    if v_j is distinct from '["letters_received", "patient_visits", "patient_visits_2"]'::jsonb then
      v_fail := v_fail || ('8b with back_links off reverse_columns listed ' || v_j::text);
    end if;
  exception when others then
    v_fail := v_fail || ('8 the knob-off checks failed: ' || sqlerrm);
  end;
  perform set_config('role', 'postgres', true);
  insert into pg_temp.bl_fail select unnest(v_fail);
end
$t$;

do $t$
declare v_fail text[];
begin
  perform set_config('role', 'postgres', true);
  select coalesce(array_agg(m), '{}') into v_fail from pg_temp.bl_fail;
  if cardinality(v_fail) > 0 then
    raise exception E'RED — % reverse-column check(s) failed:\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — a new link is named on the table it links to; that table lists it as a read-only reverse column (no second Field); a page of records reads its links in one paged call; a member never learns of a table she may not read; the knob turns the default off.';
end
$t$;

rollback;
