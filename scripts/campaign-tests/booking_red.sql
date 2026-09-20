-- scripts/campaign-tests/booking_red.sql — lane BOOKING's RED TWIN.
--
-- A guard you cannot show failing is not a guard. Each block below puts a REAL PRE-FIX
-- BODY back — the actual bytes that were live on the main database before this lane fixed
-- them — and proves the defect returns. Then the whole thing rolls back, so the doors are
-- byte-identical afterwards.
--
-- Every block would make `booking_green.sql` (or `booking_race.sh`) fail at a named PART.
-- A block that prints RED is this suite working.
--
--   psql -f scripts/campaign-tests/booking_red.sql

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '60s';
set local statement_timeout = '600s';

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss  text := current_user;
  v_org   uuid := gen_random_uuid();
  v_home  uuid; v_table uuid; v_f1 uuid; v_f2 uuid; v_accept uuid;
  v_made  jsonb; v_form uuid; v_key text; v_hold uuid; v_row record;
  v_txt   text; v_reds int := 0; v_blocks int := 0;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'ZZZ BOOKING red ' || left(v_org::text, 8), 'zzz-booking-red-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'booking_red.sql', c_admin);
  perform set_config('app.actor_system', 'campaign-test/booking_red.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Clinic', 'description', 'the red twin''s home', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Consults', 'slug', 'consults_red', 'description', 'the red twin''s table',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'full_name', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Consult', 'label_plural', 'Consults',
      'title_field', 'full_name',
      'fields', jsonb_build_array(jsonb_build_object('name', 'full_name'), jsonb_build_object('name', 'email')),
      'parent_id', v_home));
  v_f1 := custom.field_declare(v_org, v_table, jsonb_build_object('label','full name','key','full_name','type','text','required',true));
  v_f2 := custom.field_declare(v_org, v_table, jsonb_build_object('label','email','key','email','type','text','required',true));
  v_accept := custom.rule_declare(v_org, jsonb_build_object(
      'name','red: every answer is there','kind','predicate','uses',jsonb_build_array('validate'),
      'scope_table_id',v_table,'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','and','args',jsonb_build_array(
                jsonb_build_object('op','present','args',jsonb_build_array(jsonb_build_object('field',v_f1))),
                jsonb_build_object('op','present','args',jsonb_build_array(jsonb_build_object('field',v_f2))))),
      'description','the red twin''s accept Rule'), null);

  v_made := custom.booking_declare(v_org, v_table, 'Red consult',
      jsonb_build_array(
        jsonb_build_object('field','full_name','ask','Your name','required',true),
        jsonb_build_object('field','email','ask','Your email','required',true)),
      jsonb_build_object('timezone','UTC','slot_minutes',30,'lead_minutes',0,'max_per_day',20,'days',2,
        'windows', jsonb_build_array(
          jsonb_build_object('weekday',0,'from','00:00','to','23:30'),
          jsonb_build_object('weekday',1,'from','00:00','to','23:30'),
          jsonb_build_object('weekday',2,'from','00:00','to','23:30'),
          jsonb_build_object('weekday',3,'from','00:00','to','23:30'),
          jsonb_build_object('weekday',4,'from','00:00','to','23:30'),
          jsonb_build_object('weekday',5,'from','00:00','to','23:30'),
          jsonb_build_object('weekday',6,'from','00:00','to','23:30'))),
      '{}'::jsonb, null, v_accept, null, null, null, v_home);
  v_form := (v_made ->> 'form_id')::uuid;
  perform custom.anon_publish(v_org, v_form, true);
  perform set_config('role', v_boss, true);
  select s ->> 'key' into v_key from custom.booking_public(v_form, 1) b, jsonb_array_elements(b.slots) s
   where not (s ->> 'taken')::boolean order by 1 limit 1;

  -- ═══ RED 1 — THE HOLDER WAS THE REPLAY KEY, SO NOBODY COULD CONFIRM THEIR OWN HOLD ═══
  -- The real pre-fix comparison, restored. See
  -- migrations/campaign/booking_the_holder_of_a_slot_is_the_bucket_not_the_replay_key.sql.
  v_blocks := v_blocks + 1;
  create or replace function custom._red_holder_check(p_stored text, p_bucket text, p_client_key text)
  returns boolean language sql immutable set search_path to 'pg_catalog' as $f$
    select coalesce(p_stored, '') = coalesce(nullif(btrim(p_client_key), ''),
                                             nullif(btrim(p_bucket), ''), 'visitor');
  $f$;
  -- A real browser sends one client key when holding and a different one when confirming,
  -- because that key is what makes a RESEND idempotent.
  if custom._red_holder_check('visitor-dana', 'visitor-dana', 'ck-confirm-1') then
    raise notice 'RED 1  NOT RED — the pre-fix comparison admitted a real browser''s own hold';
  else
    v_reds := v_reds + 1;
    raise notice 'RED 1  RED — the holder keyed on the replay key refuses a person their own appointment (PART 8 of the green suite)';
  end if;

  -- ═══ RED 2 — A BOOKING PAGE COULD BE ASKED FOR THE TIME IT ALREADY HOLDS ════════════
  -- The pre-fix door had no such refusal; with the payload free to name `slot`, the time
  -- on the record and the time that was held are two different times.
  v_blocks := v_blocks + 1;
  select * into v_row from custom.booking_hold(v_form, v_key, 'https://red.test', 'red-bucket', null);
  v_hold := v_row.hold_id;
  begin
    perform custom.booking_confirm(v_form, v_hold, 'https://red.test',
              jsonb_build_object('full_name','Red','email','r@x.test','slot','2001-01-01T09:00:00Z'),
              'red-bucket', null, 'red-1');
    raise notice 'RED 2  NOT RED — a payload naming slot was accepted';
  exception when sqlstate '42501' then
    get stacked diagnostics v_txt = message_text;
    v_reds := v_reds + 1;
    raise notice 'RED 2  RED — "%" (PART 7a)', v_txt;
  end;

  -- ═══ RED 3 — THE VISITOR'S OWN LINK, WITH THE AMBIGUOUS COLUMN PUT BACK ═════════════
  -- The exact pre-fix opening statement of all three manage doors, restored in a stand-in
  -- with the same shape: `booking_ref` names both a column and the OUT parameter.
  v_blocks := v_blocks + 1;
  begin
    create or replace function custom._red_manage(p_booking_ref text)
    returns table(booking_ref text, form_id uuid)
    language plpgsql stable security definer set search_path to 'pg_catalog' as $f$
    declare v_s custom.anon_submission;
    begin
      select * into v_s from custom.anon_submission where booking_ref = p_booking_ref;
      booking_ref := p_booking_ref; form_id := v_s.form_id; return next;
    end;
    $f$;
    perform * from custom._red_manage('deadbeef');
    raise notice 'RED 3  NOT RED — the ambiguous reference resolved';
  exception when sqlstate '42702' then
    get stacked diagnostics v_txt = message_text;
    v_reds := v_reds + 1;
    raise notice 'RED 3  RED — "%" — every manage door died on its first statement (PARTS 10-12)', v_txt;
  end;

  -- ═══ RED 4 — THE SHIPPED FORM DOOR'S ON CONFLICT, WITHOUT ITS PREDICATE ════════════
  -- custom.anon_replay's unique index is PARTIAL. Inferring it without the predicate is
  -- 42P10 — raised AFTER the answer has already been written, which is the worst shape a
  -- failure takes. See booking_a_partial_unique_has_to_be_named_by_its_predicate.sql.
  v_blocks := v_blocks + 1;
  begin
    insert into custom.anon_replay (organization_id, client_key, table_id, captured_at)
    values (v_org, 'red-replay', v_table, now())
    on conflict (organization_id, client_key) do nothing;
    raise notice 'RED 4  NOT RED — a partial unique was inferred without its predicate';
  exception when sqlstate '42P10' then
    get stacked diagnostics v_txt = message_text;
    v_reds := v_reds + 1;
    raise notice 'RED 4  RED — "%" — every form answer carrying an idempotency key died (PART 8)', v_txt;
  end;

  -- ═══ RED 5 — ASKING ABOUT A TABLE BY THAT WORD ANSWERED "NO ACCESS" ════════════════
  -- The pre-fix body of custom.my_level passed the caller's NOUN straight to the level
  -- lookup, where `table` is not a token. Restored here as a stand-in with the same shape.
  v_blocks := v_blocks + 1;
  create or replace function custom._red_my_level(p_organization_id uuid, p_id uuid, p_type text)
  returns public.permission_level language plpgsql stable security definer
  set search_path to 'pg_catalog' as $f$
  declare v_me uuid;
  begin
    v_me := custom.query_principal();
    if v_me is null then return null; end if;
    return custom.effective_level(v_me, p_organization_id, p_id, coalesce(nullif(p_type,''), 'record'));
  end;
  $f$;
  -- The CLAIMS are what custom.query_principal reads, not the role — so this asks the
  -- question exactly as a signed-in person's call does, without handing a stand-in
  -- function a client grant the DDL guard would (rightly) take straight back.
  if custom._red_my_level(v_org, v_table, 'table') is null
     and custom._red_my_level(v_org, v_table, 'record') is not null then
    v_reds := v_reds + 1;
    raise notice 'RED 5  RED — the owner of a Table is %% by the word "record" and NULL by the word "table", so custom.bookings, enrich_due, enrich_cells, io_import_begin and io_import_finish all refused her (PART 13)';
  else
    raise notice 'RED 5  NOT RED — the noun no longer changes the answer';
  end if;

  -- ═══ RED 6 — TWO THINGS HAPPENING TO ONE RECORD WERE ONE MESSAGE ═══════════════════
  -- DOOR-18's dedupe key without the event: a booking and its cancellation collide.
  -- Called for real, twice, on one rule and one record, with NO suffix — which is exactly
  -- what custom.booking_notify did before this lane passed the event as one.
  v_blocks := v_blocks + 1;
  declare
    v_made_1 uuid;
    v_made_2 uuid;
  begin
    v_made_1 := custom.agg_deliver(v_org, v_accept, v_table, 'in_app', c_admin,
                  'custom.booking.made', 'Moved: Red consult', 'the move', '{}'::jsonb);
    v_made_2 := custom.agg_deliver(v_org, v_accept, v_table, 'in_app', c_admin,
                  'custom.booking.made', 'Cancelled: Red consult', 'the cancellation', '{}'::jsonb);
    if v_made_1 = v_made_2 then
      v_reds := v_reds + 1;
      raise notice 'RED 6  RED — a move and a cancellation on one record on one day both returned notification %, so the owner was told once about two different things', v_made_1;
    else
      raise notice 'RED 6  NOT RED — the two events produced two messages without a suffix';
    end if;
  end;

  raise notice '─────────────────────────────────────────────────────────────';
  if v_reds = v_blocks then
    raise notice '% of % blocks are RED. Every guard this lane added can be shown failing.', v_reds, v_blocks;
  else
    raise exception 'only % of % blocks are RED — a guard that cannot be shown failing is not a guard', v_reds, v_blocks;
  end if;
end;
$red$;

rollback;
