-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- LANE CAPTURE — PRODUCTS row 15, *"Let my crew photograph each bin and log the weight on
-- site."* The primitive is P13, the offline capture queue. Fulcrum and Airtable mobile are
-- the bar: a photo, a voice note and a reading become Values with their provenance in ONE
-- take, and a phone with no bars loses nothing.
--
-- WHAT WAS ALREADY THERE, AND WHY THIS FILE IS SMALL BECAUSE OF IT
-- ----------------------------------------------------------------
-- W4-ANON built `custom.anon_capture` and the replay ledger `custom.anon_replay` (unique on
-- `(organization_id, client_key)`, a `replays` counter, `device`, `captured_at`): the
-- idempotency mechanism for a signed-in offline write already exists and is NOT rebuilt.
-- FORMS built the ONE Form object — `custom.anon_form` with `presentation.questions`,
-- `exposed_field_keys`, `required_field_keys`, `notify_rule_id` — and it is NOT forked.
-- REC-31's file pattern is live in `custom.inbound_mail_land` and is followed exactly.
--
-- THE HOLE THIS FILE FILLS, IN ONE SENTENCE: **a capture had no sheet and no provenance.**
-- `custom.anon_capture` writes the record and stamps `_actor: 'user'` and nothing else — no
-- `_source.via`, no device, no moment, no place. The ledger knew where the capture came
-- from and the record did not, so the one question a foreman asks of a weight — *who
-- photographed this bin, where, and when* — had no answer on the row. And there was no
-- object saying WHICH fields a crew fills, so every phone would have had to be told by hand.
--
-- SIX DECISIONS, EACH WITH ITS REASON
-- -----------------------------------
-- 1. A CAPTURE SHEET IS A MODE OF THE ONE FORM OBJECT, NOT A SECOND STORE. FORMS-FINISH
--    spent a lane collapsing two form stores into one (`records_ui_form` is gone); a
--    `custom.capture_sheet` table would re-open that seam the same week. So `anon_form`
--    gains `audience` and `capture_opened_at`, `custom.capture_sheet_declare` delegates the
--    whole declaration to `custom.form_declare`, and there is exactly one thing called a
--    form on this platform.
--
-- 2. A CREW SHEET CAN NEVER BECOME AN ANONYMOUS WRITE DOOR, and that is held by a CHECK
--    CONSTRAINT rather than by a habit: `not (audience = 'crew' and published_at is not
--    null)`. `custom.form_public` and `custom.form_submit` are NOT replaced and NOT touched
--    — they refuse an unpublished form with the sentence they already say. The crew's own
--    on-switch is `capture_opened_at`, a different column, read by different doors. A crew
--    sheet opened to the public would be a silent leak of a write path into a table; the
--    database now refuses to store that row at all.
--
-- 3. THE PROVENANCE IS ON THE RECORD, not only in the ledger. `_source` carries
--    `via: 'capture'`, the sheet, the device, the moment the phone took it (NOT the moment
--    the network came back) and the place, if the phone offered one. VAL-1/VAL-7: a Value
--    carries its source and every write stamps an actor. A row whose provenance lives in a
--    side table is a row that cannot answer for itself once the side table is pruned.
--
-- 4. THE IDEMPOTENCY KEY IS MINTED BY THE PHONE, BEFORE THE FIRST ATTEMPT, and it is
--    required. `custom.anon_replay` is shared with the form path on purpose: one client key
--    namespace per organization means a capture and a form answer can never collide into
--    each other's record, and a reconnect that replays thirty queued captures writes thirty
--    records or none of them twice. The second attempt returns the FIRST record's id and
--    says `replay`, so the phone can retire the queue item honestly rather than guess.
--
-- 5. A FILE IS A RECORD (REC-31), and the bytes are not this lane's business. The photo and
--    the voice note are uploaded by the app through the platform's ONE byte store
--    (`files.files`, `features/media-capture/upload/capture-uploader.ts`) before this door is
--    called; what arrives here is a reference, and each reference becomes a File record
--    under the File kernel exactly as `custom.inbound_mail_land` writes an attachment.
--    Inventing a capture table or a second byte path is that feature's named failure class.
--
-- 6. A VIEWER IS TOLD, NOT SHOWN A DEAD BUTTON. `custom.capture_open` answers every member
--    of the organization, with `may_capture` and a sentence in plain words, so the screen
--    can be honest instead of rendering a camera that refuses at the end. The WALL is in
--    `custom.capture_submit`, which asks `custom.has_visibility(..., 'editor')` BEFORE it
--    asks whether the sheet exists — the order `custom.anon_capture` already uses, so a
--    table you may not reach and a table that is not there answer identically.
--
-- THE INVERSE: `migrations/inverse/capture_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ─────────────────────────────────────────────────────────────────────────────
-- THE TWO COLUMNS A CREW SHEET NEEDED, AND THE CONSTRAINT THAT KEEPS IT PRIVATE
-- ─────────────────────────────────────────────────────────────────────────────

alter table custom.anon_form add column if not exists audience text not null default 'public';
alter table custom.anon_form add column if not exists capture_opened_at timestamptz;
alter table custom.anon_form add column if not exists capture_opened_by uuid;

comment on column custom.anon_form.audience is
  'CAPTURE / SCR-30: who this form is for — `public` (a stranger with the link, opened by published_at) or `crew` (a signed-in member of this organization holding editor on the subject Table, opened by capture_opened_at). ONE form object, two audiences; never two form stores.';
comment on column custom.anon_form.capture_opened_at is
  'CAPTURE: the crew sheet''s own publish act. Deliberately NOT published_at: published_at opens the ANONYMOUS doors, and a check constraint on this table refuses any row that is both crew and published, so a crew sheet cannot be turned into an anonymous write door by setting one column.';
comment on column custom.anon_form.capture_opened_by is
  'CAPTURE: the person who opened this sheet to the crew. Kept for the audit trail beside created_by, because opening a write path into a Table is an act, not a property.';

-- NOT VALID is not a softening here: every existing row of custom.anon_form has audience
-- `public` by the default above, so there is nothing to validate, and the constraint is
-- enforced on every INSERT and UPDATE from this statement onward — which is the only place
-- a crew sheet could ever be published.
alter table custom.anon_form
  add constraint anon_form_crew_is_never_public
  check (not (audience = 'crew' and published_at is not null)) not valid;

alter table custom.anon_form
  add constraint anon_form_audience_is_a_closed_set
  check (audience in ('public', 'crew')) not valid;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.capture_sheet_declare — the crew's view on a Table, declared by its admin
--
-- It is a thin act on purpose: `custom.form_declare` already checks that the subject is a
-- Table of this organization, that every question names a real Field BY NAME, that the
-- caller holds `admin` on that Table, and it already computes the exposed and required key
-- lists that both doors enforce. This function adds exactly one thing — the audience — and
-- then refuses the one combination the constraint forbids, so a person gets a sentence
-- rather than a constraint violation.
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.capture_sheet_declare(p_organization_id uuid,
                                                        p_table_id uuid,
                                                        p_title text,
                                                        p_questions jsonb,
                                                        p_presentation jsonb default '{}'::jsonb,
                                                        p_sheet_id uuid default null,
                                                        p_notify_rule_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_id      uuid;
  v_pub     timestamptz;
  v_present jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.capture_sheet_declare');

  if p_sheet_id is not null then
    select published_at into v_pub from custom.anon_form
     where organization_id = p_organization_id and id = p_sheet_id and deleted_at is null;
    if v_pub is not null then
      raise exception 'That form is published to the public, so it cannot also be a crew capture sheet.'
        using errcode = '23514',
              hint = 'A public form takes answers from strangers with the link; a capture sheet takes them from members of this organization who hold editor on the table. Close the public form first, or make the capture sheet as a new one.';
    end if;
  end if;

  -- A capture sheet is filled standing up, in the rain, on a phone. One question at a time
  -- is the default because it is the only flow that fits, not because it is fashionable.
  v_present := jsonb_build_object('flow', 'one-at-a-time') || coalesce(p_presentation, '{}'::jsonb);

  v_id := custom.form_declare(p_organization_id, p_table_id, p_title, p_questions,
                              v_present, null, null, p_notify_rule_id, p_sheet_id, null);

  update custom.anon_form set audience = 'crew'
   where organization_id = p_organization_id and id = v_id;

  return v_id;
end;
$fn$;

comment on function custom.capture_sheet_declare(uuid, uuid, text, jsonb, jsonb, uuid, uuid) is
  'CAPTURE / SCR-30: declare or re-state a crew capture sheet over a Table. Delegates every check and both key lists to custom.form_declare (admin on the Table, every question names a real Field) and adds only the audience. Closed to the crew until custom.capture_publish opens it.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'capture_sheet_declare',
        'p_organization_id uuid, p_table_id uuid, p_title text, p_questions jsonb, p_presentation jsonb, p_sheet_id uuid, p_notify_rule_id uuid',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype, 'jsonb'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
        'It declares nothing itself: custom.form_declare makes the access decision (admin on the subject Table, through custom.assert_client_may_change) and refuses any question that does not name a Field of that Table by name. This function adds the audience and refuses to convert a PUBLISHED form into a crew sheet, so the check constraint anon_form_crew_is_never_public is never reached by an ordinary act.',
        'capture_a_sheet_a_crew_fills_on_a_phone.sql',
        null, true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.capture_publish — the one act that lets a crew start capturing
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.capture_publish(p_organization_id uuid,
                                                   p_sheet_id uuid,
                                                   p_open boolean default true)
returns timestamptz
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f custom.anon_form;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.capture_publish');

  select * into v_f from custom.anon_form
   where organization_id = p_organization_id and id = p_sheet_id and deleted_at is null;
  if not found then
    raise exception 'There is no capture sheet % in this organization.', p_sheet_id
      using errcode = '23503';
  end if;
  if v_f.audience <> 'crew' then
    raise exception 'That is a public form, not a capture sheet.'
      using errcode = '23514',
            hint = 'A public form is opened with custom.anon_publish and answered by strangers with the link. A capture sheet is opened here and answered by members of this organization on their phones.';
  end if;

  -- OPENING A WRITE PATH INTO A TABLE IS AN ADMIN ACT, the same rung declaring it asks for.
  perform custom.assert_client_may_change(p_organization_id, v_f.table_id, 'custom.capture_publish',
                                          'admin'::public.permission_level, 'table');

  update custom.anon_form
     set capture_opened_at = case when p_open then coalesce(capture_opened_at, now()) else null end,
         capture_opened_by = case when p_open then coalesce(capture_opened_by, custom.query_principal()) else null end
   where organization_id = p_organization_id and id = p_sheet_id
  returning capture_opened_at into v_f.capture_opened_at;

  return v_f.capture_opened_at;
end;
$fn$;

comment on function custom.capture_publish(uuid, uuid, boolean) is
  'CAPTURE / SCR-30: open (or close) a crew capture sheet. Closed by default, like every other publishing act in this store. Admin on the subject Table, because opening a sheet opens a write path into it.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'capture_publish',
        'p_organization_id uuid, p_sheet_id uuid, p_open boolean',
        array['uuid'::regtype, 'uuid'::regtype, 'boolean'::regtype]::oid[],
        'The sheet is matched together with the organization, so a sheet id from another tenant reads as absent. It refuses a public form outright and then asks custom.assert_client_may_change for admin on the subject Table before it changes anything. It grants nothing: it sets one timestamp that the capture doors read.',
        'capture_a_sheet_a_crew_fills_on_a_phone.sql',
        null, true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.capture_sheets — what a foreman sees: the sheets and what came in through them
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.capture_sheets(p_organization_id uuid,
                                                  p_table_id uuid default null)
returns table (sheet_id uuid, table_id uuid, title text, slug text, state text,
               opened_at timestamptz, captures bigint, replays bigint,
               last_capture_at timestamptz, presentation jsonb)
language plpgsql
security definer
stable
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.capture_sheets');
  if not custom.store_is_open(p_organization_id) then return; end if;

  return query
  select f.id,
         f.table_id,
         coalesce(f.title, 'Capture'),
         f.slug,
         case when f.closed_at is not null then 'closed'
              when f.capture_opened_at is null then 'not open yet'
              else 'open' end,
         f.capture_opened_at,
         coalesce(c.captures, 0),
         coalesce(c.replays, 0),
         c.last_capture_at,
         f.presentation
    from custom.anon_form f
    left join lateral (
      select count(*) filter (where r.record_id is not null) as captures,
             coalesce(sum(r.replays), 0)                     as replays,
             max(r.captured_at)                              as last_capture_at
        from custom.anon_replay r
       where r.organization_id = f.organization_id
         and r.table_id = f.table_id
         and r.deleted_at is null
         and r.metadata ->> 'sheet_id' = f.id::text
    ) c on true
   where f.organization_id = p_organization_id
     and f.audience = 'crew'
     and f.deleted_at is null
     and (p_table_id is null or f.table_id = p_table_id)
     -- A SHEET IS ONLY LISTED IF ITS TABLE IS ONE THE CALLER CAN ALREADY OPEN, so the list
     -- never reveals the existence of a Table somebody was not shared.
     and custom.has_visibility(custom.query_principal(), 'record', f.table_id,
                               'viewer'::public.permission_level)
   order by f.capture_opened_at desc nulls last, f.created_at desc;
end;
$fn$;

comment on function custom.capture_sheets(uuid, uuid) is
  'CAPTURE / SCR-30: the crew capture sheets of one organization, with what has come in through each. Narrowed to Tables the caller can already open, so the list never reveals a Table.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'capture_sheets',
        'p_organization_id uuid, p_table_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'Read-only. custom.assert_client_may_reach for the organization wall, then every row is filtered by custom.has_visibility at viewer on the sheet''s own Table, so a member sees only sheets over Tables they could already open. The counts come from the replay ledger, which holds no record data.',
        'capture_a_sheet_a_crew_fills_on_a_phone.sql',
        null, true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.capture_open — what the phone loads, once, and can then run with no network
--
-- It answers every member of the organization, including one who may only look, because a
-- screen that refuses at the END of a capture has already wasted the walk to the bin. The
-- refusal is in `may_capture` and in words; the WALL is in custom.capture_submit.
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.capture_open(p_organization_id uuid, p_sheet_id uuid)
returns table (sheet_id uuid, organization_id uuid, table_id uuid, title text,
               presentation jsonb, fields jsonb, state text, may_capture boolean,
               message text)
language plpgsql
security definer
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_f      custom.anon_form;
  v_me     uuid := custom.query_principal();
  v_fields jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.capture_open');
  if not custom.store_is_open(p_organization_id) then return; end if;

  select * into v_f from custom.anon_form
   where anon_form.organization_id = p_organization_id
     and anon_form.id = p_sheet_id
     and anon_form.audience = 'crew'
     and anon_form.deleted_at is null;
  if not found then return; end if;

  -- The sheet itself is visible to anyone who can open the Table; below viewer it is not
  -- there at all, which is the same answer they get for the Table.
  if not custom.has_visibility(v_me, 'record', v_f.table_id, 'viewer'::public.permission_level) then
    return;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id)
                            || r.data
                            || jsonb_build_object(
                                 'required', (k.key = any (array(select jsonb_array_elements_text(v_f.required_field_keys)))),
                                 'parity_type', custom.parity_type(r.data))
                            order by k.ord), '[]'::jsonb)
    into v_fields
    from jsonb_array_elements_text(v_f.exposed_field_keys) with ordinality k(key, ord)
    join custom.record r
      on r.organization_id = v_f.organization_id
     and r.table_id = custom.field_kernel_id()
     and r.deleted_at is null
     and (r.data ->> 'entity_definition_id')::uuid = v_f.table_id
     and r.data ->> 'key' = k.key;

  sheet_id := v_f.id;
  organization_id := v_f.organization_id;
  table_id := v_f.table_id;
  title := coalesce(v_f.title, 'Capture');
  presentation := v_f.presentation;
  fields := v_fields;

  if v_f.closed_at is not null then
    state := 'closed'; may_capture := false;
    message := 'This capture sheet is closed, so it is not taking anything new.';
  elsif v_f.capture_opened_at is null then
    state := 'not open yet'; may_capture := false;
    message := 'Whoever set this sheet up has not opened it to the crew yet.';
  elsif not custom.has_visibility(v_me, 'record', v_f.table_id, 'editor'::public.permission_level) then
    state := 'read only'; may_capture := false;
    message := 'You can see this table but not add to it, so you cannot capture here. Ask an owner of this organization to give you editor on it.';
  else
    state := 'open'; may_capture := true; message := null;
  end if;
  return next;
end;
$fn$;

comment on function custom.capture_open(uuid, uuid) is
  'CAPTURE / SCR-30: everything a phone needs to run a capture sheet offline — the questions, the Fields with their ids and parity types, and an honest may_capture with a sentence. Read-only; the wall is custom.capture_submit.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'capture_open',
        'p_organization_id uuid, p_sheet_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'Read-only and matched together with the organization, so a sheet id from another tenant reads as absent. Below viewer on the subject Table it returns NO ROW — the same answer the Table itself gives — and it exposes only the Fields the sheet already declared. may_capture is an honest label for the screen, never the access decision: custom.capture_submit asks custom.has_visibility for editor itself, before existence.',
        'capture_a_sheet_a_crew_fills_on_a_phone.sql',
        null, true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.capture_submit — one take: the answers, the files, and where they came from
--
-- THE ORDER MATTERS AND IS DELIBERATE:
--   1. the switch, 2. the access decision, 3. the client key, 4. the sheet's state,
--   5. the keys this sheet asks for, 6. the required ones, 7. the ledger, 8. the files,
--   9. the record.
-- Steps 1 and 2 happen before the sheet's existence is admitted: a sheet you may not reach
-- and a sheet that is not there raise the IDENTICAL sentence, because the opposite order is
-- how a door becomes an existence oracle (custom.anon_capture's own comment, followed here).
--
-- THE RACE `custom.anon_capture` LEAVES OPEN IS CLOSED HERE. Insert-then-read on the ledger
-- lets two simultaneous replays of the same key both read `record_id is null` and both
-- write a record. This door takes the ledger row FOR UPDATE after the insert, so the second
-- one waits and then sees the first one's record. Thirty queued captures arriving twice
-- write thirty records, not sixty, even if the phone retries while the first attempt is
-- still in flight.
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.capture_submit(p_organization_id uuid,
                                                  p_sheet_id uuid,
                                                  p_client_key text,
                                                  p_payload jsonb,
                                                  p_files jsonb default '[]'::jsonb,
                                                  p_device text default null,
                                                  p_captured_at timestamptz default null,
                                                  p_location jsonb default null)
returns table (record_id uuid, state text, message text, replay boolean, file_ids uuid[])
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f        custom.anon_form;
  v_me       uuid := custom.query_principal();
  v_exposed  text[];
  v_required text[];
  v_answered text[] := array[]::text[];
  v_missing  text[];
  v_key      text;
  v_doc      jsonb := '{}'::jsonb;
  v_att      jsonb;
  v_files    uuid[] := array[]::uuid[];
  v_of_key   uuid[];
  v_file     uuid;
  v_at       timestamptz := coalesce(p_captured_at, now());
  v_existing uuid;
  v_rec      uuid;
  v_source   jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.capture_submit');

  select * into v_f from custom.anon_form
   where anon_form.organization_id = p_organization_id
     and anon_form.id = p_sheet_id
     and anon_form.audience = 'crew'
     and anon_form.deleted_at is null;

  -- THE ACCESS DECISION, BEFORE EXISTENCE. Both arms raise the same sentence on purpose.
  if not found
     or not custom.has_visibility(v_me, 'record', v_f.table_id,
                                  'editor'::public.permission_level) then
    raise exception 'You cannot capture into this sheet.'
      using errcode = '42501',
            hint = 'A capture writes a record, so it needs the same editor level on the table that adding a record by hand needs. If you were given this link by mistake, ask whoever sent it; if you should have it, ask an owner of this organization for editor on that table.';
  end if;

  if coalesce(btrim(coalesce(p_client_key, '')), '') = '' then
    raise exception 'This capture has no key of its own, so a retry could not be told from a second capture.'
      using errcode = '22004',
            hint = 'The phone mints the key when the capture is taken, offline, before the first attempt — never when it reconnects. Without it a lost acknowledgement would write the same bin twice.';
  end if;

  if v_f.closed_at is not null then
    record_id := null; state := 'closed'; replay := false; file_ids := null;
    message := 'This capture sheet is closed, so it is not taking anything new. Nothing was lost — what is on the phone stays there.';
    return next; return;
  end if;
  if v_f.capture_opened_at is null then
    record_id := null; state := 'not open yet'; replay := false; file_ids := null;
    message := 'Whoever set this sheet up has not opened it to the crew yet. Nothing was lost — what is on the phone stays there.';
    return next; return;
  end if;

  -- SCOPE. A key this sheet does not ask for is refused BY NAME, never trimmed in silence.
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_f.exposed_field_keys);
  for v_key in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if not (v_key = any (v_exposed)) then
      raise exception 'This capture sheet does not have a field called "%".', v_key
        using errcode = '42501',
              hint = format('It takes: %s.', coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
    end if;
    v_doc := v_doc || jsonb_build_object(v_key, p_payload -> v_key);
    if coalesce(p_payload -> v_key, 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb) then
      v_answered := v_answered || v_key;
    end if;
  end loop;

  -- THE FILES. A photo and a voice note are answers like any other, so a field answered by
  -- a file counts as answered — checked BEFORE the required list, or a sheet whose only
  -- required question is the photograph would refuse every capture that had one.
  if jsonb_typeof(p_files) = 'array' then
    for v_att in select value from jsonb_array_elements(p_files) loop
      v_key := nullif(btrim(coalesce(v_att ->> 'field', '')), '');
      if v_key is null or not (v_key = any (v_exposed)) then
        raise exception 'This capture sheet does not have a field called "%" for a file.',
                        coalesce(v_key, '(unnamed)')
          using errcode = '42501',
                hint = format('It takes: %s.', coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
      end if;
      if not (v_key = any (v_answered)) then
        v_answered := v_answered || v_key;
      end if;
    end loop;
  end if;

  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_required
    from jsonb_array_elements(v_f.required_field_keys);
  select coalesce(array_agg(k), array[]::text[]) into v_missing
    from unnest(v_required) k where not (k = any (v_answered));
  if array_length(v_missing, 1) > 0 then
    raise exception 'This capture still needs %.', array_to_string(v_missing, ', ')
      using errcode = '22004',
            hint = 'Each one is named so the phone can point at it and keep the capture in its queue. Nothing was written and nothing was lost.';
  end if;

  -- THE LEDGER IS THE MECHANISM, and it is taken FOR UPDATE so two replays of one key
  -- cannot both believe they are the first.
  insert into custom.anon_replay (organization_id, client_key, table_id, device, captured_at,
                                  metadata)
  values (p_organization_id, p_client_key, v_f.table_id, p_device, v_at,
          jsonb_build_object('sheet_id', p_sheet_id::text, 'via', 'capture'))
  on conflict (organization_id, client_key) where deleted_at is null do nothing;

  select r.record_id into v_existing from custom.anon_replay r
   where r.organization_id = p_organization_id and r.client_key = p_client_key
     for update;

  if v_existing is not null then
    update custom.anon_replay set replays = replays + 1
     where organization_id = p_organization_id and client_key = p_client_key;
    record_id := v_existing; state := 'captured'; replay := true; file_ids := null;
    message := 'This capture had already arrived, so it was not written twice.';
    return next; return;
  end if;

  -- REC-31: a picture is a File record reached through a relation. The bytes were put in
  -- the platform's ONE byte store by the app before this call; what lands here is the
  -- reference, and it becomes a File record exactly as custom.inbound_mail_land writes an
  -- attachment. A File record carries its own provenance, because a photograph separated
  -- from when and where it was taken is not evidence of anything.
  if jsonb_typeof(p_files) = 'array' then
    for v_key in select distinct nullif(btrim(coalesce(value ->> 'field', '')), '')
                   from jsonb_array_elements(p_files) loop
      v_of_key := array[]::uuid[];
      for v_att in select value from jsonb_array_elements(p_files)
                    where nullif(btrim(coalesce(value ->> 'field', '')), '') = v_key loop
        v_file := custom.record_write(p_organization_id, custom.file_kernel_id(),
                    jsonb_strip_nulls(jsonb_build_object(
                      'name',       coalesce(nullif(v_att ->> 'name', ''), 'capture'),
                      'mime_type',  nullif(v_att ->> 'mime_type', ''),
                      'size_bytes', nullif(v_att ->> 'size_bytes', '')::bigint,
                      'url',        nullif(v_att ->> 'url', ''),
                      'file_id',    nullif(v_att ->> 'file_id', ''),
                      'duration_ms', nullif(v_att ->> 'duration_ms', '')::bigint,
                      '_actor',     'user',
                      '_source',    jsonb_build_object('via', 'capture',
                                                       'sheet_id', p_sheet_id::text,
                                                       'client_key', p_client_key,
                                                       'device', p_device,
                                                       'captured_at', v_at,
                                                       'at_place', p_location))));
        v_of_key := v_of_key || v_file;
        v_files  := v_files || v_file;
      end loop;
      v_doc := v_doc || jsonb_build_object(v_key,
                 to_jsonb(array(select x::text from unnest(v_of_key) x)));
    end loop;
  end if;

  -- THE PROVENANCE IS ON THE RECORD (VAL-1, VAL-7). `captured_at` is the moment the phone
  -- took it; `arrived_at` is the moment the network came back. A queue that collapsed the
  -- two would make every capture in a day look like it happened at five o'clock.
  v_source := jsonb_strip_nulls(jsonb_build_object(
                'via',         'capture',
                'sheet_id',    p_sheet_id::text,
                'sheet_title', v_f.title,
                'client_key',  p_client_key,
                'device',      p_device,
                'captured_at', v_at,
                'arrived_at',  now(),
                'at_place',    p_location));

  v_rec := custom.record_write(p_organization_id, v_f.table_id,
             v_doc || jsonb_build_object('_actor', 'user', '_source', v_source));

  update custom.anon_replay set record_id = v_rec
   where organization_id = p_organization_id and client_key = p_client_key
     and record_id is null;

  if v_f.notify_rule_id is not null then
    perform custom.form_notify(p_organization_id, v_f.id, v_rec, null);
  end if;

  record_id := v_rec; state := 'captured'; replay := false;
  file_ids := case when cardinality(v_files) > 0 then v_files else null end;
  message := null;
  return next;
end;
$fn$;

comment on function custom.capture_submit(uuid, uuid, text, jsonb, jsonb, text, timestamptz, jsonb) is
  'CAPTURE / SCR-30: one capture from a phone — the answers, the file references, the device, the moment it was taken and the place — written as one record with its provenance on it. Idempotent on the client key the phone minted before its first attempt; the ledger row is taken FOR UPDATE so concurrent replays cannot both write.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'capture_submit',
        'p_organization_id uuid, p_sheet_id uuid, p_client_key text, p_payload jsonb, p_files jsonb, p_device text, p_captured_at timestamp with time zone, p_location jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype, 'jsonb'::regtype, 'text'::regtype, 'timestamptz'::regtype, 'jsonb'::regtype]::oid[],
        'This is the SIGNED-IN offline path, so there is a principal and it must hold editor on the sheet''s subject Table — asked of custom.has_visibility BEFORE the sheet''s existence is admitted, so an unreachable sheet and an absent sheet raise the identical sentence. The client key is required and the replay ledger row is taken FOR UPDATE, so a reconnect that replays a queue writes each capture once. Every payload key is checked against the sheet''s exposed keys and refused by name; every required key is checked and named, counting a field answered by a file as answered. The record and each File record are written through custom.record_write, which makes its own access decision again.',
        'capture_a_sheet_a_crew_fills_on_a_phone.sql',
        null, true, false)
on conflict do nothing;
