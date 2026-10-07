-- SCHEDULED NOTICE — THE GREEN SUITE for communication.schedule_notice and its doors.
-- "Tell this person at time T about this thing", one shot, replaceable and cancellable by a source key,
-- delivered by the EXISTING notification dispatcher (no schedule of its own). One DO block that ends in
-- an unconditional TEARDOWN raise, so everything it wrote rolls back.
--
-- THE REAL USE CASE: the front-desk lead (test@test.com) writes "@Thursday 3 PM — call Pepper's owner
-- about the rabies certificate" on her clinic's follow-up page and asks to be reminded 1 hour before.
-- She moves it to Friday (the reminder moves with it, never two), changes nothing and saves again (no
-- new row), then deletes the line (the reminder is cancelled), and a reminder whose time already passed
-- is not sent late as news.
--
-- RUN IT (live or clone; it writes nothing that survives):
--   psql "<DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/scheduled_notice_green.sql
-- or paste the DO block into the Supabase MCP execute_sql. GREEN = the error text starts
-- "TEARDOWN scheduled_notice GREEN"; anything else is RED and names the failed step.
--
-- ITS RED: before the migration it fails at step 0 (function communication.schedule_notice does not exist).

do $$
declare
  v_uid   uuid := (select id from auth.users where email = 'test@test.com');
  v_scope text := 'test:scheduled-notice:' || gen_random_uuid()::text || ':';
  v_key   text;
  r       jsonb;
  r2      jsonb;
  v_n     integer;
  v_row   record;
  v_org   uuid;
begin
  if v_uid is null then raise exception 'RED setup: test@test.com not found'; end if;
  select o.id into v_org from iam.organizations o where iam.has_org_access_for(v_uid, o.id) order by o.created_at limit 1;
  if v_org is null then raise exception 'RED setup: test@test.com belongs to no organization'; end if;
  v_key := v_scope || 'block-1';

  -- 0. the doors exist with the right callers: clients reach only the self-only doors.
  if not has_function_privilege('authenticated', 'communication.reconcile_my_notices(text,jsonb,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'communication.cancel_my_notice(text,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'communication.schedule_my_notice(timestamptz,jsonb,text,text,uuid)', 'execute') then
    raise exception 'RED 0: a client door is not executable by authenticated';
  end if;
  if has_function_privilege('authenticated', 'communication.schedule_notice(uuid,timestamptz,jsonb,text,text,uuid,text,uuid,text)', 'execute')
     or has_function_privilege('anon', 'communication.schedule_my_notice(timestamptz,jsonb,text,text,uuid)', 'execute') then
    raise exception 'RED 0: the person-naming primitive (or a door for anon) is client-callable';
  end if;

  -- 1. schedule: one pending in-app row, due at T, carrying words and the deep link.
  r := communication.schedule_notice(v_uid, now() + interval '2 days',
         '{"title": "Reminder: call Pepper''s owner", "body": "Thursday 3:00 PM"}', '/spaces/abc#block-1', v_key, v_org);
  select * into v_row from communication.notification where id = (r ->> 'id')::uuid;
  if v_row.status <> 'pending' or v_row.channel <> 'in_app' or v_row.recipient_user_id <> v_uid
     or abs(extract(epoch from v_row.next_attempt_at - (now() + interval '2 days'))) > 1
     or v_row.subject <> 'Reminder: call Pepper''s owner' or v_row.deep_link not like '/spaces/abc%#block-1' then
    raise exception 'RED 1: schedule wrote %', to_jsonb(v_row);
  end if;

  -- 2. same input again: no new row (a save that changed nothing is not a new reminder).
  r2 := communication.schedule_notice(v_uid, now() + interval '2 days',
         '{"title": "Reminder: call Pepper''s owner", "body": "Thursday 3:00 PM"}', '/spaces/abc#block-1', v_key, v_org);
  if (r2 ->> 'unchanged')::boolean is not true or r2 ->> 'id' <> r ->> 'id' then
    raise exception 'RED 2: unchanged input answered %', r2;
  end if;

  -- 3. REPLACE: a new time cancels the waiting one by name and leaves exactly one pending.
  r2 := communication.schedule_notice(v_uid, now() + interval '3 days',
         '{"title": "Reminder: call Pepper''s owner", "body": "Friday 3:00 PM"}', '/spaces/abc#block-1', v_key, v_org);
  select status, error_code into v_row from communication.notification where id = (r ->> 'id')::uuid;
  if v_row.status <> 'cancelled' or v_row.error_code <> 'replaced' or (r2 ->> 'replaced')::int <> 1 then
    raise exception 'RED 3: the replaced row is % / % (replaced=%)', v_row.status, v_row.error_code, r2 ->> 'replaced';
  end if;
  select count(*) into v_n from communication.notification
   where recipient_user_id = v_uid and status = 'pending' and metadata ->> 'scheduled_notice_key' = v_key;
  if v_n <> 1 then raise exception 'RED 3: % pending after replace, want 1', v_n; end if;

  -- 4. CANCEL by key.
  v_n := communication.cancel_scheduled_notice(v_uid, v_key);
  select status, error_code into v_row from communication.notification where id = (r2 ->> 'id')::uuid;
  if v_n <> 1 or v_row.status <> 'cancelled' or v_row.error_code <> 'cancelled_by_source' then
    raise exception 'RED 4: cancel answered % and left % / %', v_n, v_row.status, v_row.error_code;
  end if;

  -- 5. a time already gone is not sent late.
  r := communication.schedule_notice(v_uid, now() - interval '2 hours', '{"title": "Late"}', null, v_scope || 'late', v_org);
  if (r ->> 'scheduled')::boolean or r ->> 'why' <> 'past' then raise exception 'RED 5: past answered %', r; end if;

  -- 5b. a notice belongs to an organization: none is refused by name, never guessed.
  begin
    perform communication.schedule_notice(v_uid, now() + interval '1 day', '{"title": "No org"}', null, v_scope || 'noorg');
    raise exception 'RED 5b: a notice with no organization was accepted';
  exception when sqlstate '22004' then null;
  end;

  -- 6. THE CLIENT DOOR, as the person (auth.uid() from her claims): reconcile a page's set, then delete
  --    one mention — the reminder for the deleted one is cancelled, the kept one is unchanged.
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  r := communication.reconcile_my_notices(v_scope, jsonb_build_array(
         jsonb_build_object('source_key', v_scope || 'a', 'deliver_at', now() + interval '1 day', 'subject', '{"title": "A"}'::jsonb, 'deep_link', '/spaces/abc#block-a'),
         jsonb_build_object('source_key', v_scope || 'b', 'deliver_at', now() + interval '1 day', 'subject', '{"title": "B"}'::jsonb, 'deep_link', '/spaces/abc#block-b')), v_org);
  select count(*) into v_n from communication.notification
   where recipient_user_id = v_uid and status = 'pending' and left(metadata ->> 'scheduled_notice_key', length(v_scope)) = v_scope;
  if v_n <> 2 then raise exception 'RED 6a: % pending after reconcile, want 2 (%)', v_n, r; end if;
  r := communication.reconcile_my_notices(v_scope, jsonb_build_array(
         jsonb_build_object('source_key', v_scope || 'a', 'deliver_at', (select (metadata ->> 'scheduled_for')::timestamptz from communication.notification
                                                                          where status = 'pending' and metadata ->> 'scheduled_notice_key' = v_scope || 'a'),
                            'subject', '{"title": "A"}'::jsonb, 'deep_link', '/spaces/abc#block-a')), v_org);
  if (r ->> 'cancelled')::int <> 1 or (r -> 'notices' -> 0 ->> 'unchanged')::boolean is not true then
    raise exception 'RED 6b: deleting one mention answered %', r;
  end if;
  -- an empty set cancels the rest of the scope; the door refuses a key outside its scope.
  r := communication.reconcile_my_notices(v_scope, '[]'::jsonb, v_org);
  if (r ->> 'cancelled')::int <> 1 then raise exception 'RED 6c: empty set answered %', r; end if;
  begin
    perform communication.reconcile_my_notices(v_scope, jsonb_build_array(jsonb_build_object(
      'source_key', 'elsewhere:x', 'deliver_at', now() + interval '1 day', 'subject', '{"title": "X"}'::jsonb)), v_org);
    raise exception 'RED 6d: a key outside the scope was accepted';
  exception when sqlstate '22023' then null;
  end;
  v_n := communication.cancel_my_notice(v_scope, true);

  raise exception 'TEARDOWN scheduled_notice GREEN: schedule, unchanged no-op, replace, cancel, past, reconcile + delete-cancels, scope refusal (everything rolled back)';
end $$;
