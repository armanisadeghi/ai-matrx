-- LANE FOLLOW-BATCH-3 (the class of D357) — PROMOTING A TABLE NEVER PAUSES THE STORE, measured RED then GREEN
-- on the dev clone. Plain SQL, one transaction, rolled back: nothing stays.
--
-- THE USE CASE. Rincon Plumbing's operations lead (admin@admin.com, seated as `authenticated`, booking_green's
-- setup) moves the Consults table to fast storage; its job number is unique. Every other save in the store must
-- go on meanwhile, and two consults must still never share a job number.
--
--   T1  after custom.promote_table, the saving transaction holds NO lock on custom.record or a partition stronger
--       than RowExclusive (a ShareLock there is CREATE INDEX)   RED before followbatch3_promoting_a_table_never_pauses_the_store.sql
--   T2  the door answers indexes_owed: the non-blocking statements (CONCURRENTLY per partition)
--   T3  the unique promoted Field carries the store's unique rule, and a second record with the same job number
--       is refused (23505)
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
  values (v_org, 'Rincon Plumbing Service Desk ' || left(v_org::text, 8),
          'rincon-plumbing-desk-' || left(v_org::text, 8), c_admin);
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

  v_f1 := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'job number', 'key', 'job_number',
            'type', 'text', 'required', false));
  -- The Field is marked promoted and unique the way the store's own promotion screens mark it (on the Field's
  -- document); field_declare does not take those two words from a client.
  perform set_config('role', v_boss, true);
  update custom.record set data = data || '{"promoted": true, "unique": true}'::jsonb
   where organization_id = v_org and id = v_f1;
  perform set_config('role', 'authenticated', true);
  v_made := custom.promote_table(v_org, v_table);

  -- ══ T1 ══
  select count(*), string_agg(distinct l.mode || ' on ' || l.relation::regclass::text, ', ')
    into v_n, v_txt
    from pg_locks l
   where l.pid = pg_backend_pid() and l.granted and l.locktype = 'relation'
     and l.mode in ('ShareLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock')
     and (l.relation = 'custom.record'::regclass
          or l.relation in (select inhrelid from pg_inherits where inhparent = 'custom.record'::regclass));
  if v_n > 0 then
    raise exception 'T1 RED: promoting the table took % lock(s) that pause every write to the store: %', v_n, v_txt;
  end if;

  -- ══ T2 ══
  if jsonb_array_length(coalesce(v_made -> 'indexes_owed', '[]'::jsonb)) = 0
     or not exists (select 1 from jsonb_array_elements(v_made -> 'indexes_owed') s where s ->> 'statement' ilike '%concurrently%') then
    raise exception 'T2 RED: the door did not answer the non-blocking statements it owes (%)', left(v_made::text, 300);
  end if;

  -- ══ T3 ══
  perform custom.record_write(v_org, v_table, jsonb_build_object('full_name', 'Maria Alvarez', 'email', 'maria@example.com', 'job_number', 'RP-1042', '_actor', 'user'));
  begin
    perform custom.record_write(v_org, v_table, jsonb_build_object('full_name', 'Tom Brooks', 'email', 'tom@example.com', 'job_number', 'RP-1042', '_actor', 'user'));
    raise exception 'T3 RED: a second consult took job number RP-1042 — nothing keeps a unique promoted field apart';
  exception when unique_violation then
    get stacked diagnostics v_txt = message_text;
  end;
  raise notice 'GREEN T1 T2 T3 — % statements owed; the duplicate was refused: %', jsonb_array_length(v_made -> 'indexes_owed'), v_txt;
end $suite$;
rollback;
select 'GREEN' as result;
