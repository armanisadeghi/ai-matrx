-- LANE FOLLOW-BATCH-3 (D357) — SAVING A BOOKING PAGE NEVER PAUSES THE STORE, measured RED then GREEN on
-- the dev clone. Plain SQL, one transaction, rolled back: nothing stays.
--
-- THE USE CASE. Sunrise Yoga Studio's owner (admin@admin.com, seated as `authenticated`, the same seat and
-- setup as booking_green.sql) publishes "Book a 30-minute consult". Every other person's save in the store
-- must go on while she does.
--
--   T1  after custom.booking_declare, the saving transaction holds NO lock on custom.record or any of its
--       partitions stronger than RowExclusive (a ShareLock there is CREATE INDEX: every insert and update in
--       the store waits for it)        RED before followbatch3_saving_a_booking_page_never_pauses_the_store.sql
--   T2  the slots Table's slot_key Field carries the store's unique rule, so one slot has one live hold
--   T3  (two sessions, not here) a second hold on one slot is refused with the booking door's sentence
--
-- Run: the clone suite runner (quarantine proven first). Needs the `authenticated` seat as booking_green.sql.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $suite$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_table   uuid;
  v_f1 uuid; v_f2 uuid;
  v_accept uuid; v_notify uuid;
  v_made   jsonb;
  v_form   uuid;
  v_slots  uuid;
  v_key    text;
  v_key2   text;
  v_hold   uuid;
  v_ref    text;
  v_rec    uuid;
  v_txt    text;
  v_n      bigint;
  v_row    record;
  v_doc    jsonb;
begin
  -- ── fixtures, as the connected role (a seat is a PERSON; these make one) ───────
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Sunrise Yoga Studio ' || left(v_org::text, 8),
          'sunrise-yoga-studio-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin),
         (v_org, 'organization', v_org, c_dana, 'member', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'booking_green.sql', c_admin);

  perform set_config('app.actor_system', 'campaign-test/booking_green.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ═══════════════════════════════════════
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
  raise notice 'PART 0 PASSED — seated as %, which cannot read custom.record directly', current_user;

  -- ══ PART 1 — a Table, its Fields, and the two Rules ════════════════════════════
  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Clinic', 'description', 'the suite''s home', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Consults', 'slug', 'consults', 'description', 'the suite''s table',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'full_name', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Consult', 'label_plural', 'Consults',
      'title_field', 'full_name',
      'fields', jsonb_build_array(jsonb_build_object('name', 'full_name'),
                                  jsonb_build_object('name', 'email')),
      'parent_id', v_home));
  v_f1 := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'full name', 'key', 'full_name', 'type', 'text', 'required', true));
  v_f2 := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'email', 'key', 'email', 'type', 'text', 'required', true));
  v_accept := custom.rule_declare(v_org, jsonb_build_object(
      'name', 'consult: every answer it asks for is there', 'kind', 'predicate',
      'uses', jsonb_build_array('validate'), 'scope_table_id', v_table, 'applies_to_types', '[]'::jsonb,
      'expr', jsonb_build_object('op', 'and', 'args', jsonb_build_array(
                jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', v_f1))),
                jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', v_f2))))),
      'description', 'DOOR-17: a booking becomes a record only when this Rule admits it.'), null);
  v_notify := custom.rule_declare(v_org, jsonb_build_object(
      'name', 'consult: tell someone', 'kind', 'predicate',
      'uses', jsonb_build_array('membership'), 'scope_table_id', v_table, 'applies_to_types', '[]'::jsonb,
      'expr', jsonb_build_object('const', true),
      'description', 'DOOR-18: an ordinary subscription Rule.',
      'subscription', jsonb_build_object('saved_view_id', null, 'cadence', 'immediate',
                                         'channel', 'in_app', 'recipient_user_id', c_admin,
                                         'event_key', 'custom.booking.made')), null);
  raise notice 'PART 1 PASSED — a Table, two Fields, an accept Rule and a subscription Rule';

  v_made := custom.booking_declare(v_org, v_table, 'Book a 30-minute consult',
      jsonb_build_array(
        jsonb_build_object('field', 'full_name', 'ask', 'What is your name?', 'required', true),
        jsonb_build_object('field', 'email', 'ask', 'Where should we send the confirmation?', 'required', true)),
      jsonb_build_object('timezone', 'UTC', 'slot_minutes', 30, 'lead_minutes', 0,
                         'max_per_day', 20, 'days', 2,
                         'windows', jsonb_build_array(
                           jsonb_build_object('weekday', 0, 'from', '00:00', 'to', '23:30'),
                           jsonb_build_object('weekday', 1, 'from', '00:00', 'to', '23:30'),
                           jsonb_build_object('weekday', 2, 'from', '00:00', 'to', '23:30'),
                           jsonb_build_object('weekday', 3, 'from', '00:00', 'to', '23:30'),
                           jsonb_build_object('weekday', 4, 'from', '00:00', 'to', '23:30'),
                           jsonb_build_object('weekday', 5, 'from', '00:00', 'to', '23:30'),
                           jsonb_build_object('weekday', 6, 'from', '00:00', 'to', '23:30'))),
      jsonb_build_object('intro', 'A half hour with one of our consultants.'),
      null, v_accept, v_notify, null, null, v_home);
  v_form := (v_made ->> 'form_id')::uuid;
  v_slots := (v_made ->> 'slot_table_id')::uuid;

  -- ══ T1 — the save took no lock that stops other people's writes ═══════════════════════
  select count(*), string_agg(distinct l.mode || ' on ' || l.relation::regclass::text, ', ')
    into v_n, v_txt
    from pg_locks l
   where l.pid = pg_backend_pid() and l.granted and l.locktype = 'relation'
     and l.mode in ('ShareLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock')
     and (l.relation = 'custom.record'::regclass
          or l.relation in (select inhrelid from pg_inherits where inhparent = 'custom.record'::regclass));
  if v_n > 0 then
    raise exception 'T1 RED: saving the booking page took % lock(s) that pause every write to the store: %', v_n, v_txt;
  end if;

  -- ══ T2 — one hold per slot is the store's own unique rule ═════════════════════════════
  perform set_config('role', 'none', true);
  if not exists (select 1 from custom.record f
                  where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
                    and f.deleted_at is null and f.data ->> 'key' = 'slot_key'
                    and (f.data ->> 'entity_definition_id')::uuid = v_slots
                    and f.data -> 'rules' @> '[{"kind": "unique"}]') then
    raise exception 'T2 RED: the slots Table''s slot_key Field carries no unique rule, so nothing stops a double booking';
  end if;
  perform set_config('role', 'authenticated', true);

  raise notice 'GREEN T1 T2 — slots table %; the two-session race (T3) is booking_race / the lane''s race run', v_slots;
end $suite$;
rollback;
select 'GREEN' as result;
