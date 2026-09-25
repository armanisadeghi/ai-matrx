-- LANE MOVE-AND-OUTSIDER — A MOVE FINDS THE DESTINATION'S HOME (VERIFIER-19 finding 1).
--
-- THE USE CASE. Mesa Verde Landscape Design runs its design studio and its install crew as two
-- organizations, and admin@admin.com (the principal) owns both. She made "Irrigation zones" in
-- the Studio from the Tables screen, the way every person makes a table: the app writes the
-- table's own Home record ("Irrigation zones Home", a Person-kernel record) and declares the
-- table inside it. The install crew is taking the zones over, so she moves the table to the
-- Install Crew organization, which has never had its own Organization record in the store (it
-- was created after the mover ran). Then the crew hands it back.
-- Every name and value below is synthesized. Everything is rolled back.
--
-- WHAT MAKES IT FAIL (RED before moveout_a_move_finds_the_destination_s_home.sql, GREEN after):
--   H1  the owner's move of a table whose home is its own Home record (not the organization's
--       record) lands — before the file the door took the home away and the shape guard
--       refused 23514 "a table has to live somewhere - give it a home", 3 of 3 on production
--   H2  the destination had no Organization record: the store made one, named after the
--       organization, and the moved table lives in it; the answer says the home was made
--   H3  moving it back lands under the Studio's existing Organization record (none is made)
--   H4  its rows travel both ways and read back in the organization they are in

\set ON_ERROR_STOP on
\timing off
\set suite 'moveout_a_move_finds_the_destination_s_home_red_green.sql'
\set requires ''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

create temp table mv (k text primary key, v uuid) on commit drop;
grant select on mv to authenticated;

do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_studio uuid := gen_random_uuid();
  v_crew   uuid := gen_random_uuid();
  v_home_studio uuid; v_own_home uuid; v_t uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/moveout-home', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_studio, 'Mesa Verde Landscape Design - Studio ' || substr(v_studio::text, 1, 6), 'mvld-studio-' || substr(v_studio::text, 1, 8), 'MVS', c_admin),
    (v_crew,   'Mesa Verde Landscape Design - Install Crew ' || substr(v_crew::text, 1, 6), 'mvld-crew-' || substr(v_crew::text, 1, 8), 'MVC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_studio, 'organization', v_studio, c_admin, 'owner', 'active'),
    (v_crew,   'organization', v_crew,   c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled', 'organization', v_studio, v_studio, 'true'::jsonb, 'moveout home suite'),
    ('custom', 'system_enabled', 'organization', v_crew,   v_crew,   'true'::jsonb, 'moveout home suite');

  -- The Studio has its Organization record; the Install Crew has none.
  insert into custom.record (organization_id, table_id, data) values
    (v_studio, custom.organization_kernel_id(), jsonb_build_object('name', 'Mesa Verde Landscape Design - Studio'))
    returning id into v_home_studio;

  -- The table, made the way the app makes one (records declareTable): its own Home, then the table in it.
  insert into custom.record (organization_id, table_id, data) values
    (v_studio, custom.person_kernel_id(), jsonb_build_object('name', 'Irrigation zones Home'))
    returning id into v_own_home;
  v_t := custom.table_declare(v_studio, jsonb_build_object(
    'name', 'Irrigation zones', 'slug', 'irrigation_zones', 'type', 'entity',
    'label_singular', 'Irrigation zone', 'label_plural', 'Irrigation zones', 'title_field', 'zone',
    'display', 'list', 'weight', 'light', 'ordered', false, 'row_order', 'manual',
    'agent_writable', true, 'retention_days', 365,
    'default_sort', '[]'::jsonb, 'parent_id', v_own_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'zone'))));
  perform custom.field_declare(v_studio, v_t, jsonb_build_object('key', 'zone', 'label', 'Zone', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_studio, v_t, jsonb_build_object('key', 'minutes', 'label', 'Run time (min)', 'type', 'number', 'sort', 20));
  perform custom.record_write(v_studio, v_t, jsonb_build_object('zone', 'Front lawn - rotors', 'minutes', 22));
  perform custom.record_write(v_studio, v_t, jsonb_build_object('zone', 'Side yard - drip', 'minutes', 45));

  insert into mv values ('studio', v_studio), ('crew', v_crew), ('home_studio', v_home_studio), ('t', v_t);
end
$fixture$;

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_studio uuid; v_crew uuid; v_home_studio uuid; v_t uuid;
  v_home jsonb; v_moved jsonb; v_msg text; v_parent uuid; v_n bigint; v_homes bigint;
begin
  select v into v_studio from mv where k = 'studio'; select v into v_crew from mv where k = 'crew';
  select v into v_home_studio from mv where k = 'home_studio'; select v into v_t from mv where k = 't';

  -- ══ the owner's seat ══
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  v_home := custom.table_home(v_t);
  begin
    v_moved := custom.table_move(v_t, v_crew, (v_home #>> '{table,version}')::int);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise exception 'H1: the owner''s move to the Install Crew was refused: %', v_msg;
  end;
  if not coalesce((v_moved ->> 'moved')::boolean, false) then
    raise exception 'H1: the move did not say it landed: %', v_moved;
  end if;

  perform set_config('role', 'postgres', true);
  select custom.containment_parent(t.data) into v_parent
    from custom.record t where t.organization_id = v_crew and t.id = v_t;
  select count(*) into v_homes from custom.record h
   where h.organization_id = v_crew and h.table_id = custom.organization_kernel_id() and h.deleted_at is null;
  if v_parent is null or v_homes <> 1
     or v_parent <> (select h.id from custom.record h where h.organization_id = v_crew
                        and h.table_id = custom.organization_kernel_id() and h.deleted_at is null)
     or (select h.data ->> 'name' from custom.record h where h.organization_id = v_crew and h.id = v_parent)
        not like 'Mesa Verde Landscape Design - Install Crew%' then
    raise exception 'H2: the table does not live in the Install Crew''s own record (parent %, % homes)', v_parent, v_homes;
  end if;
  if coalesce((v_moved #>> '{carried,home,made}')::boolean, false) is not true then
    raise exception 'H2: the answer does not say the destination''s home was made: %', v_moved -> 'carried';
  end if;
  select count(*) into v_n from custom.record x where x.organization_id = v_crew and x.table_id = v_t and x.deleted_at is null;
  if v_n <> 2 then raise exception 'H4: % of 2 rows reached the Install Crew', v_n; end if;
  raise notice 'moveout home suite: H1 H2 GREEN (home made, table inside it, 2 rows)';

  -- ══ back to the Studio ══
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_home := custom.table_home(v_t);
  v_moved := custom.table_move(v_t, v_studio, (v_home #>> '{table,version}')::int);
  perform set_config('role', 'postgres', true);
  select custom.containment_parent(t.data) into v_parent
    from custom.record t where t.organization_id = v_studio and t.id = v_t;
  if v_parent is distinct from v_home_studio then
    raise exception 'H3: back in the Studio the table lives in % rather than the Studio''s record %', v_parent, v_home_studio;
  end if;
  if coalesce((v_moved #>> '{carried,home,made}')::boolean, true) then
    raise exception 'H3: a home was made although the Studio has one: %', v_moved -> 'carried';
  end if;
  select count(*) into v_homes from custom.record h
   where h.organization_id = v_studio and h.table_id = custom.organization_kernel_id() and h.deleted_at is null;
  if v_homes <> 1 then raise exception 'H3: the Studio now has % Organization records', v_homes; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  select count(*) into v_n from custom.read_records(v_studio, v_t, false, 50, 0);
  if v_n <> 2 then raise exception 'H4: the owner reads % of 2 rows back in the Studio', v_n; end if;
  raise notice 'moveout home suite: H1 H2 H3 H4 GREEN';
end
$t$;

rollback;
