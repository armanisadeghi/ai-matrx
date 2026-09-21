-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom._realtime_notice(uuid, uuid, text, text, jsonb, boolean) c782854213bcce61403d082e38fc7db1c290d029082e7083890018e51717a62a
--
-- REALTIME, file 3b — THE READ-BACK WAS LOOKING FOR THE WRONG ROW, AND THE ALARM IS WHAT
-- FOUND IT.
--
-- `realtime.send` swallows every failure into a `raise warning`, so file 3 generated the
-- message id itself, handed it over — the function's own comment says it honours a payload
-- `id` — and then looked for that row. Read `realtime.send`'s body to the end and the catch
-- is plain:
--
--     generated_id := gen_random_uuid();
--     IF payload ? 'id' THEN final_payload := payload; ELSE final_payload := jsonb_set(…); END IF;
--     INSERT INTO realtime.messages (id, payload, …) VALUES (generated_id, final_payload, …);
--
-- It honours a payload `id` IN THE PAYLOAD and inserts `generated_id` as the ROW's id
-- regardless. So the read-back asked for an id that was never written and answered "not
-- delivered" every single time — 433 rows in `ops.system_error` in one hour, while two
-- headless browsers were watching the notices arrive perfectly.
--
-- THIS IS THE ALARM WORKING, and it is worth saying so rather than quietly correcting it: a
-- store can go un-live for a day behind a `raise warning` nobody reads, and the whole reason
-- to look for the row is that the send will not tell you. A read-back that cries wolf is a
-- defect; a send with no read-back at all is the defect this one exists to prevent. So the
-- read-back stays, and it looks for what is actually there: the topic, today's partition, and
-- the notice's own `id` INSIDE the payload, which is the one part `realtime.send` does keep.
--
-- The 433 rows are RESOLVED rather than deleted, with a note saying they were the guard's own
-- false alarm, because a row somebody may read tomorrow is not ours to make disappear.

create or replace function custom._realtime_notice(
  p_organization_id uuid,
  p_table_id        uuid,
  p_kind            text,
  p_op              text,
  p_record_ids      jsonb,
  p_fields_changed  boolean
) returns void
language plpgsql
volatile
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_topic text := 'custom:table:' || p_table_id::text;
  v_land  boolean;
begin
  perform realtime.send(
    jsonb_build_object(
      'id',             v_id,
      'table_id',       p_table_id,
      'kind',           p_kind,
      'op',             p_op,
      'record_ids',     p_record_ids,      -- null MEANS "re-read the page"
      'fields_changed', p_fields_changed,
      'at',             to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'records.changed',
    v_topic,
    true);

  -- THE READ-BACK. `realtime.send` returns void whether it worked or not, and it does NOT use
  -- a payload `id` as the row's id — so the notice is found by its topic, today's partition
  -- (`realtime.messages` is RANGE-partitioned on `inserted_at`, and naming the day keeps this
  -- to one partition instead of seven) and the id inside the payload, which survives.
  select exists (
    select 1
      from realtime.messages m
     where m.topic = v_topic
       and m.inserted_at >= (now() at time zone 'utc')::date
       and m.payload ->> 'id' = v_id::text
  ) into v_land;

  if not v_land then
    insert into ops.system_error (kind, error_type, error_text, source_feature, route,
                                  organization_id, payload)
    values ('realtime_notice_not_delivered', 'realtime.send',
            'The record store announced a change and the message did not land in realtime.messages, so screens watching this table will not update until they are reloaded.',
            'custom.realtime', v_topic, p_organization_id,
            jsonb_build_object('topic', v_topic, 'kind', p_kind, 'op', p_op,
                               'notice_id', v_id));
  end if;
exception when others then
  -- A person's write must never fail because the announcement of it did.
  begin
    insert into ops.system_error (kind, error_type, error_text, source_feature, route,
                                  organization_id, payload)
    values ('realtime_notice_failed', sqlstate, sqlerrm, 'custom.realtime', v_topic,
            p_organization_id, jsonb_build_object('topic', v_topic, 'kind', p_kind, 'op', p_op));
  exception when others then
    raise warning 'custom._realtime_notice could not record its own failure on %: %', v_topic, sqlerrm;
  end;
end;
$$;

comment on function custom._realtime_notice(uuid, uuid, text, text, jsonb, boolean) is
  'Sends ONE notice on custom:table:<table_id> and then looks for the row, because realtime.send swallows its own failures. It finds it by topic + day + the payload''s own id: realtime.send keeps a payload id in the PAYLOAD but always writes a fresh uuid as the ROW id. Records a genuine miss in ops.system_error against the real organization; never raises, so a write is never lost to a failed announcement.';
