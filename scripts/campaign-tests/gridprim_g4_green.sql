-- LANE GRID-PRIMITIVES, G4 — THE GREEN SUITE. Every add, change, archive and restore of a record
-- in a table that has a webhook becomes ONE signed-delivery event, and nothing else does.
--
-- THE USE CASE (scripts/campaign-tests/_gridprim_clinic.sql): Dr. Ana Whitfield
-- (admin@admin.com), practice manager at Cedar Ridge Veterinary Clinic, points the Appointments
-- table at the clinic's reminder service so a booked, moved, cancelled or re-booked visit
-- reaches it; Marisol Vega (test@test.com) books and changes visits all day.
--
-- The DELIVERY itself — files.webhook_dispatch posting a signed body and pg_net answering — can
-- only happen after a COMMIT and needs pg_net, so it is proved by
-- scripts/campaign-tests/gridprim_g4_delivery.ts on the rehearsal branch. This suite proves,
-- in one rolled-back transaction, the door and the event that the dispatcher delivers.
--
-- WHAT MAKES IT FAIL — one production change per part:
--   1  a webhook to http://, to localhost, with an invented event, or declared by a non-admin.
--   2  a record add / change / archive / restore that writes no activity event (the RED state:
--      before gridprim_every_row_change_reaches_the_webhook.sql, all four write nothing).
--   3  events for a table nobody listens to (the activity log would grow for every table).
--   4  the secret shown again, or a switched-off webhook still collecting events.
--   5  a stranger reaching the doors.

\set ON_ERROR_STOP on
\timing off

\set suite 'gridprim_g4_green.sql'
\set requires 'relation:files.webhooks|relation:platform.activity_log|function:custom.record_restore'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

\i scripts/campaign-tests/_gridprim_clinic.sql

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  c_hook constant text := 'https://reminders.cedarridgevet.com/hooks/matrx-appointments';
  v_org uuid; v_appts uuid; v_sup uuid; v_hook jsonb; v_hook_id uuid; v_rec uuid;
  v_caught text; v_actions text[]; v_n integer; v_row record; v_meta jsonb;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  select v into v_sup from gp where k = 'other_table';

  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;

  -- ══ PART 1 — THE DOOR. ═══════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform custom.table_webhook_declare(v_org, v_appts, c_hook, null, 'Reminder service');
    raise exception '1a: the front desk (an editor, not an admin) sent the day sheet to a webhook';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', c_admin_j, true);
  begin
    perform custom.table_webhook_declare(v_org, v_appts, 'http://reminders.cedarridgevet.com/hooks', null, null);
    raise exception '1b: a webhook over plain http was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform custom.table_webhook_declare(v_org, v_appts, 'https://localhost:8443/hooks', null, null);
    raise exception '1c: a webhook to localhost was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform custom.table_webhook_declare(v_org, v_appts, c_hook, array['record.created', 'record.exploded'], null);
    raise exception '1d: an event nobody sends was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_caught = message_text;
    if v_caught not like '%record.exploded%' then raise exception '1d: %', v_caught; end if;
  end;
  v_hook := custom.table_webhook_declare(v_org, v_appts, c_hook, null, 'Reminder service — Cedar Ridge');
  v_hook_id := (v_hook ->> 'webhook_id')::uuid;
  if v_hook_id is null or length(v_hook ->> 'secret') <> 64 or jsonb_array_length(v_hook -> 'events') <> 5 then
    raise exception '1e: the webhook did not come back with its id, a 256-bit secret and every event: %', v_hook;
  end if;
  raise notice '1 PASS — the front desk, http://, localhost and "record.exploded" refused; Dr. Whitfield''s reminder-service webhook hears all five events.';

  -- ══ PART 2 — ADD, CHANGE, ARCHIVE, RESTORE: FOUR EVENTS, IN ORDER. ════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_rec := custom.record_write(v_org, v_appts, jsonb_build_object('patient', 'Clementine (Osei)', 'species', 'Cat',
             'visit_status', 'Scheduled', 'visit_on', '2026-09-24', 'visit_fee', 142.5, 'owner_phone', '(541) 290-5518'));
  perform custom.record_update(v_org, v_rec, jsonb_build_object('visit_on', '2026-09-25', 'desk_notes', 'Owner asked to move to Thursday'));
  perform custom.record_delete(v_org, v_rec);
  perform custom.record_restore(v_org, v_rec);
  perform set_config('role', 'postgres', true);
  select array_agg(a.action order by a.id) into v_actions
    from platform.activity_log a
   where a.organization_id = v_org and a.entity_id = v_rec and a.entity_type = 'custom_record:' || v_appts::text;
  select a.metadata into v_meta from platform.activity_log a
   where a.organization_id = v_org and a.entity_id = v_rec and a.action = 'record.updated' limit 1;
  perform set_config('role', 'authenticated', true);
  if v_actions is distinct from array['record.created', 'record.updated', 'record.archived', 'record.restored'] then
    raise exception '2a: add / change / archive / restore wrote %, not the four events in order', v_actions;
  end if;
  if (v_meta ->> 'table_id')::uuid is distinct from v_appts or jsonb_array_length(v_meta -> 'changed_field_ids') <> 2
     or v_meta ? 'visit_on' or v_meta::text like '%Thursday%' then
    raise exception '2b: the change event does not carry the table, the version and the two changed Field ids — and only those: %', v_meta;
  end if;
  raise notice '2 PASS — Clementine booked, moved to Thursday, cancelled and re-booked: % — the change names its two Field ids and carries no value.', v_actions;

  -- ══ PART 3 — A TABLE NOBODY LISTENS TO WRITES NO EVENT. ════════════════════════════════
  perform custom.record_write(v_org, v_sup, jsonb_build_object('supplier', 'High Desert Pet Pharmacy'));
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from platform.activity_log a
   where a.organization_id = v_org and a.entity_type = 'custom_record:' || v_sup::text;
  perform set_config('role', 'authenticated', true);
  if v_n <> 0 then raise exception '3: the Suppliers table has no webhook and still wrote % event(s)', v_n; end if;
  raise notice '3 PASS — a new supplier writes nothing: only a table somebody listens to grows the log.';

  -- ══ PART 4 — THE LIST NEVER SHOWS THE SECRET; A SWITCHED-OFF WEBHOOK HEARS NOTHING. ═══
  perform set_config('request.jwt.claims', c_admin_j, true);
  select * into v_row from custom.table_webhooks(v_org, v_appts) w where w.webhook_id = v_hook_id;
  if v_row.webhook_id is null or not v_row.is_active or v_row.target_url is distinct from c_hook then
    raise exception '4a: the list does not show the live webhook';
  end if;
  if exists (select 1 from information_schema.routines r
              where r.routine_schema = 'custom' and r.routine_name = 'table_webhooks'
                and pg_get_function_result(('custom.table_webhooks(uuid,uuid)')::regprocedure) like '%secret%') then
    raise exception '4b: the list door returns the secret';
  end if;
  perform custom.table_webhook_archive(v_org, v_hook_id);
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform custom.record_update(v_org, v_rec, jsonb_build_object('visit_status', 'Checked in'));
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from platform.activity_log a
   where a.organization_id = v_org and a.entity_id = v_rec;
  perform set_config('role', 'authenticated', true);
  if v_n <> 4 then raise exception '4c: a switched-off webhook still collected an event (% rows)', v_n; end if;
  raise notice '4 PASS — the list shows the webhook without its secret; switched off, Clementine''s check-in writes no fifth event.';

  -- ══ PART 5 — NOBODY OUTSIDE THE CLINIC. ════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.table_webhook_declare(v_org, v_appts, 'https://collector.offsite-mirror.net/x', null, null);
    raise exception '5a: a stranger subscribed to the clinic''s changes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from custom.table_webhooks(v_org, v_appts);
    raise exception '5b: a stranger listed the clinic''s webhooks';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.table_webhook_archive(v_org, v_hook_id);
    raise exception '5c: a stranger switched the clinic''s webhook off';
  exception when insufficient_privilege then null;
  end;
  raise notice '5 PASS — a person in no organization with the clinic is refused all three doors (42501).';

  raise notice 'GRIDPRIM G4 GREEN — every part passed.';
end
$t$;

rollback;
