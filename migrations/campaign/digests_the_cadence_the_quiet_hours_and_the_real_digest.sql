-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- LANE DIGESTS — "TEXT ME ON A NEW LEAD; EMAIL ME A MONDAY SUMMARY." (PRODUCTS row 8, DOOR-18)
--
-- WHAT WAS MEASURED ON THE MAIN DATABASE 2026-09-20, BEFORE THIS FILE
-- -------------------------------------------------------------------
--   · The cadence vocabulary was TWO words — `immediate` and `digest`
--     (`custom.agg_subscription_cadences()`). There was no way to say "hourly",
--     no way to say "Monday", and `schedule` was a free-text string nothing read.
--     So the second half of the sentence this product is named after could not be
--     written down, let alone honoured.
--   · There were NO quiet hours anywhere in the store. A subscription that texts
--     on a new lead texted at 03:00.
--   · `custom.agg_digest_run` counted the WHOLE view with `custom.record_aggregate`
--     and put that number in the subject. It never worked out what had ENTERED,
--     what had LEFT or what had CHANGED, and `p_since` reached only the prose of
--     the body. A "Monday summary" therefore said the same number every week until
--     somebody deleted a record.
--   · NOTHING CALLED EITHER RUNNER. `custom.agg_subscription_fire` had exactly one
--     caller in the whole database — `custom.form_notify`, on a form submission —
--     and `custom.agg_digest_run` had NONE. `custom.io_outbox` published
--     `records.changed` for every write and no subscription ever heard it. The
--     product was a data model with no pulse.
--   · A person could not ask "when is my next digest?" and could not ask to see
--     one now.
--
-- WHAT THIS FILE DOES, AND THE FOUR DECISIONS INSIDE IT
-- -----------------------------------------------------
-- 1. ONE CADENCE VOCABULARY, NORMALISED ONCE. `instant`, `hourly`, `daily`,
--    `weekly`. The two words already written into live Rules keep working because
--    `custom.agg_cadence_normalize` maps `immediate` → `instant` and the bare word
--    `digest` → `daily`; every reader, picker and runner calls it, so a Rule written
--    last week and a Rule written by the picker today mean the same thing to the
--    same code. No row is rewritten and nothing is renamed on disk.
--
-- 2. THE DIGEST IS A DELTA, NOT A COUNT. `custom.agg_digest_assemble` asks the view
--    what it admits NOW and — through `custom.record_as_of`, the store's own history
--    door — what it admitted AT THE WATERMARK, and names the difference:
--    ENTERED, LEFT, CHANGED. That is the only way "a lead that leaves the view
--    appears in the next digest as left" can be true, and it is why the assembler
--    replays history rather than reading a feed of events: an event stream says a
--    field changed, it cannot say whether the record crossed the view's boundary.
--
-- 3. THE WATERMARK IS THE LAST SEND, AND THE LAST SEND IS THE NOTIFICATION.
--    There is no second ledger and no new table: `communication.notification` IS
--    the record of every send, and `custom.agg_last_digest_at` reads the last one's
--    own `window_end` out of its payload. A new table here would have been a second
--    sender's bookkeeping beside the one sender's, and the two would drift the first
--    time a delivery failed.
--
-- 4. INSTANT MEANS ENTERING, NOT TOUCHING. `custom.agg_subscription_tick` reads
--    `custom.io_outbox` — the transactional outbox `records.changed` already writes
--    — and fires only where the record was NOT in the view before the change and IS
--    in it after. Editing a lead's phone number fires nothing; a lead becoming a
--    lead fires once. It deliberately does NOT claim the outbox row with
--    `custom.io_outbox_drain`: `consumed_at` is one column and one consumer, so a
--    notifier that claimed would silently starve every import, export and webhook
--    consumer of the same feed. Re-reading is safe because `custom.agg_deliver`'s
--    dedupe key is a UNIQUE constraint, so the second read of the same event sends
--    nothing.
--
-- QUIET HOURS NEVER DROP A MESSAGE. They move it. A send inside quiet hours is
-- written with `next_attempt_at` set to the moment they end, so the platform's own
-- notification worker delivers it then — one sender, one retry policy, one place a
-- message can be. Silently discarding a notification because of the clock is the
-- behaviour this platform calls a screen that lies.
--
-- THE INVERSE: `migrations/inverse/digests_the_cadence_the_quiet_hours_and_the_real_digest_down.sql`.

-- based-on: custom.agg_subscription_cadences() 32549c535d97409db223145322fd5c4961dc1621cf44c1ec6a14cdf0eb012a94
-- based-on: custom.agg_subscription_fire(uuid, uuid, uuid, jsonb) 2d24329fa7610a9a5d0f7842ed5fbfd38599aa2dc985c13841341ce51f2ec872
-- based-on: custom.agg_digest_run(uuid, uuid, timestamp with time zone) bfe22613733ed3a3a43d2be07384aa7e72389978e50c7d46b35bc75d1aae634c

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ═══ 1. THE CADENCE VOCABULARY ════════════════════════════════════════════════

create function custom.agg_cadence_normalize(p_cadence text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- ONE PLACE KNOWS WHAT THE WORDS MEAN. `immediate` is what every Rule written
  -- before 2026-09-20 carries and `digest` is what the old two-word vocabulary
  -- called "a summary, some time"; both are answered here rather than in each
  -- reader, so no caller has to remember the history.
  select case lower(coalesce(nullif(btrim(p_cadence), ''), 'instant'))
           when 'instant'   then 'instant'
           when 'immediate' then 'instant'
           when 'now'       then 'instant'
           when 'hourly'    then 'hourly'
           when 'daily'     then 'daily'
           when 'digest'    then 'daily'
           when 'weekly'    then 'weekly'
           else null
         end;
$fn$;

comment on function custom.agg_cadence_normalize(text) is
  'DOOR-18: the four cadence words a subscription may carry — instant, hourly, daily, weekly — plus the two the store already wrote (immediate, digest). Returns NULL for a word nothing honours, so a writer can refuse it by name.';

create or replace function custom.agg_subscription_cadences()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$ select array['instant', 'hourly', 'daily', 'weekly']::text[] $fn$;

comment on function custom.agg_subscription_cadences() is
  'DOOR-18: the cadences the runners honour. custom.subscription_cadences delegates here, so a picker can never offer a cadence nothing acts on.';

-- ═══ 2. QUIET HOURS ═══════════════════════════════════════════════════════════

create function custom.agg_quiet_until(p_quiet jsonb, p_at timestamptz)
returns timestamptz
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_tz    text;
  v_start time;
  v_end   time;
  v_local timestamp;
  v_now   time;
  v_day   date;
begin
  -- No quiet hours is the common answer and it is NULL, never a moment in the
  -- past that a caller then has to compare against.
  if p_quiet is null or jsonb_typeof(p_quiet) <> 'object' then return null; end if;
  if coalesce(p_quiet ->> 'start', '') = '' or coalesce(p_quiet ->> 'end', '') = '' then
    return null;
  end if;

  v_tz := coalesce(nullif(btrim(p_quiet ->> 'tz'), ''), 'UTC');
  begin
    v_start := (p_quiet ->> 'start')::time;
    v_end   := (p_quiet ->> 'end')::time;
    v_local := p_at at time zone v_tz;
  exception when others then
    -- A quiet-hours block nobody can parse must not stop a notification. It is
    -- treated as "no quiet hours" and the write door below refuses to STORE one
    -- like it, so this arm exists only for rows written before that door did.
    return null;
  end;

  v_now := v_local::time;
  v_day := v_local::date;

  if v_start = v_end then
    return null;                                   -- a zero-length night is no night
  elsif v_start < v_end then
    if v_now >= v_start and v_now < v_end then
      return (v_day + v_end) at time zone v_tz;
    end if;
  else
    -- The ordinary case: quiet hours cross midnight (22:00 → 07:00).
    if v_now >= v_start then
      return ((v_day + 1) + v_end) at time zone v_tz;
    elsif v_now < v_end then
      return (v_day + v_end) at time zone v_tz;
    end if;
  end if;
  return null;
end;
$fn$;

comment on function custom.agg_quiet_until(jsonb, timestamptz) is
  'DOOR-18: NULL when the moment is outside the subscription''s quiet hours, otherwise the moment they end. {"start":"22:00","end":"07:00","tz":"America/Chicago"}; a block that crosses midnight is the ordinary case and is handled.';

-- ═══ 3. WHEN THE NEXT SUMMARY IS DUE ══════════════════════════════════════════

create function custom.agg_digest_due_at(p_cadence text, p_schedule text,
                                                    p_quiet jsonb, p_after timestamptz)
returns timestamptz
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_cadence text := custom.agg_cadence_normalize(p_cadence);
  v_tz      text := coalesce(nullif(btrim(p_quiet ->> 'tz'), ''), 'UTC');
  v_sched   text := lower(coalesce(nullif(btrim(p_schedule), ''), ''));
  v_time    time := '08:00'::time;
  v_dow     integer := 1;                          -- Monday, the week's own start
  v_local   timestamp;
  v_due     timestamptz;
  v_word    text;
  v_quiet   timestamptz;
begin
  if v_cadence is null or v_cadence = 'instant' then
    return null;                                   -- "as it happens" has no due time
  end if;

  if v_cadence = 'hourly' then
    v_due := date_trunc('hour', p_after) + interval '1 hour';
  else
    -- The schedule is read, not decorated. "08:00", "monday 09:30", "mon" and
    -- "" all resolve, and what cannot be read falls back to 08:00 Monday rather
    -- than to silence.
    for v_word in select w from unnest(string_to_array(v_sched, ' ')) w loop
      if v_word ~ '^[0-9]{1,2}:[0-9]{2}$' then
        v_time := v_word::time;
      elsif left(v_word, 3) = 'mon' then v_dow := 1;
      elsif left(v_word, 3) = 'tue' then v_dow := 2;
      elsif left(v_word, 3) = 'wed' then v_dow := 3;
      elsif left(v_word, 3) = 'thu' then v_dow := 4;
      elsif left(v_word, 3) = 'fri' then v_dow := 5;
      elsif left(v_word, 3) = 'sat' then v_dow := 6;
      elsif left(v_word, 3) = 'sun' then v_dow := 0;
      end if;
    end loop;

    v_local := p_after at time zone v_tz;
    if v_cadence = 'daily' then
      v_due := (v_local::date + v_time) at time zone v_tz;
      if v_due <= p_after then
        v_due := ((v_local::date + 1) + v_time) at time zone v_tz;
      end if;
    else                                            -- weekly
      v_due := (v_local::date
                 + ((v_dow - extract(dow from v_local)::integer + 7) % 7)
                 + v_time) at time zone v_tz;
      if v_due <= p_after then
        v_due := v_due + interval '7 days';
      end if;
    end if;
  end if;

  -- QUIET HOURS MOVE IT, THEY DO NOT CANCEL IT.
  v_quiet := custom.agg_quiet_until(p_quiet, v_due);
  if v_quiet is not null then v_due := v_quiet; end if;
  return v_due;
end;
$fn$;

comment on function custom.agg_digest_due_at(text, text, jsonb, timestamptz) is
  'DOOR-18: the next moment a summary is due after p_after, from the cadence and the schedule, pushed past quiet hours. NULL for an instant subscription, which has no due time.';

-- ═══ 4. DOES THIS VIEW ADMIT THIS STATE? ══════════════════════════════════════

create function custom.agg_view_admits_state(p_definition jsonb, p_state jsonb)
returns boolean
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_key text;
begin
  if p_state is null then return false; end if;
  -- The SAME predicate custom.agg_view_admits runs against the live row, lifted
  -- out so the digest can run it against a state the store replayed. Two copies
  -- of "what this view admits" is exactly how a digest comes to disagree with the
  -- grid it links to.
  for v_key in select k from jsonb_object_keys(coalesce(p_definition -> 'filters', '{}'::jsonb)) k loop
    if coalesce(case when jsonb_typeof(p_state -> v_key) = 'object' and (p_state -> v_key) ? 'value'
                     then p_state -> v_key ->> 'value' else p_state ->> v_key end, '')
       is distinct from (p_definition -> 'filters' ->> v_key) then
      return false;
    end if;
  end loop;
  return true;
end;
$fn$;

comment on function custom.agg_view_admits_state(jsonb, jsonb) is
  'DOOR-18: the saved view''s filter predicate, applied to a record state rather than to a live row, so custom.agg_digest_assemble can ask what the view admitted at the watermark through custom.record_as_of.';

-- ═══ 5. THE NOTIFIER'S READER, WIDENED ════════════════════════════════════════
--
-- `custom.agg_subscriptions` is the ONE reader every consumer goes through, and it
-- is the one place that knows a muted subscription fires at nobody. It gained the
-- three things the runners below cannot work without — the Table, the quiet hours,
-- and a cadence that has already been normalised — so no consumer re-derives them
-- and none can disagree. Its return type is a strict superset of the old one; the
-- drop and the create are in one transaction, so no caller ever observes a gap, and
-- it holds no client grant (`custom.subscriptions` is the person's door).



-- ═══ 6. WHAT TO CALL A RECORD IN A SUMMARY ════════════════════════════════════

create function custom.agg_record_name(p_organization_id uuid, p_record_id uuid,
                                                  p_state jsonb default null)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_state jsonb := p_state;
  v_key   text;
  v_val   text;
begin
  -- A SUMMARY NAMES THINGS. "3 records changed" is a number; "Dana Whitfield,
  -- Marcus Reyes and one more arrived" is a notification somebody acts on, which
  -- is the whole difference between this and a dashboard tile.
  if v_state is null then
    select r.data into v_state from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
  end if;
  if v_state is null then return left(p_record_id::text, 8); end if;

  foreach v_key in array array['name', 'title', 'label', 'full_name', 'company', 'email'] loop
    v_val := case when jsonb_typeof(v_state -> v_key) = 'object' and (v_state -> v_key) ? 'value'
                  then v_state -> v_key ->> 'value' else v_state ->> v_key end;
    if coalesce(btrim(v_val), '') <> '' then return left(v_val, 120); end if;
  end loop;

  -- Nothing recognisable: the first non-empty text value the record holds, in key
  -- order, so a Table whose first column is called something else still reads as a
  -- thing rather than as a uuid.
  select case when jsonb_typeof(value) = 'object' and value ? 'value' then value ->> 'value'
              else v_state ->> key end
    into v_val
    from jsonb_each(v_state)
   where key not in ('id', 'table_id', 'organization_id')
     and coalesce(case when jsonb_typeof(value) = 'object' and value ? 'value' then value ->> 'value'
                       else v_state ->> key end, '') <> ''
   order by key
   limit 1;
  return coalesce(left(v_val, 120), left(p_record_id::text, 8));
end;
$fn$;

comment on function custom.agg_record_name(uuid, uuid, jsonb) is
  'DOOR-18: what to call one record inside a summary. Prefers the Table''s own naming columns, then the first value it holds, and only then the id — so a digest names the leads that arrived instead of counting them.';

-- ═══ 7. THE WATERMARK — THE LAST SEND IS THE NOTIFICATION ═════════════════════

create function custom.agg_last_digest_at(p_organization_id uuid, p_rule_id uuid)
returns timestamptz
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- THERE IS NO SECOND LEDGER. communication.notification is the record of every
  -- send this platform makes, and a digest carries the window it covered in its own
  -- payload, so "since the last digest" is read from the last digest itself.
  select max((n.payload ->> 'window_end')::timestamptz)
    from communication.notification n
   where n.organization_id = p_organization_id
     and n.payload ->> 'rule_id' = p_rule_id::text
     and n.payload ->> 'cadence' is distinct from 'instant'
     and n.payload ? 'window_end';
$fn$;

comment on function custom.agg_last_digest_at(uuid, uuid) is
  'DOOR-18: the end of the window the last summary covered, read out of that summary''s own notification row. The watermark for the next one.';

-- ═══ 8. THE DIGEST ITSELF — WHAT ENTERED, WHAT LEFT, WHAT CHANGED ═════════════
--
-- THE CANDIDATE SET IS THE OUTBOX, AND THAT IS NOT AN OPTIMISATION — IT IS THE
-- ARGUMENT. A record can only cross a view's boundary by changing, and every change
-- to `custom.record` writes one `records.changed` row in the same transaction. So
-- the events in the window are exactly the records that could have entered or left,
-- and the digest never walks a whole table to find three leads.
--
-- IT IS COMPUTED UNDER THE SUBSCRIBER'S OWN VISIBILITY. `custom.has_visibility` is
-- asked for the RECIPIENT by name rather than for whoever is connected, because a
-- summary is delivered to a person and a record they may not see is not theirs to
-- be told about — the notification's mere existence would leak it.

create function custom.agg_digest_assemble(p_organization_id uuid, p_rule_id uuid,
                                                      p_since timestamptz default null,
                                                      p_until timestamptz default null)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_rule    custom.record;
  v_sub     jsonb;
  v_who     uuid;
  v_view    uuid;
  v_def     jsonb;
  v_table   uuid;
  v_cadence text;
  v_since   timestamptz;
  v_until   timestamptz := coalesce(p_until, now());
  v_name    text;
  c         record;
  v_then    jsonb;
  v_now     jsonb;
  v_live    boolean;
  v_in_now  boolean;
  v_in_then boolean;
  v_entered jsonb := '[]'::jsonb;
  v_left    jsonb := '[]'::jsonb;
  v_changed jsonb := '[]'::jsonb;
  v_total   bigint := null;
  v_claims  text;
  v_subject text;
  v_body    text;
  v_link    text;
begin
  select * into v_rule from custom.record r
   where r.organization_id = p_organization_id and r.id = p_rule_id
     and r.data_class = 'rule' and r.deleted_at is null;
  if not found or not (v_rule.data ? 'subscription') then
    raise exception 'There is no subscription % here.', p_rule_id
      using errcode = '23503',
            hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).';
  end if;

  v_sub     := v_rule.data -> 'subscription';
  v_who     := nullif(v_sub ->> 'recipient_user_id', '')::uuid;
  v_view    := nullif(v_sub ->> 'saved_view_id', '')::uuid;
  v_cadence := custom.agg_cadence_normalize(v_sub ->> 'cadence');
  v_name    := coalesce(v_rule.data ->> 'name', 'Subscription');

  select sv.definition into v_def from platform.saved_view sv
   where sv.id = v_view and sv.organization_id = p_organization_id and sv.deleted_at is null;

  v_table := coalesce(nullif(v_def ->> 'table_id', '')::uuid,
                      nullif(v_rule.data ->> 'scope_table_id', '')::uuid);

  -- The window starts at the last summary this subscription sent, and on the first
  -- run at one period back — never at "the beginning of time", which would make a
  -- first Monday summary a full export of the table.
  v_since := coalesce(p_since, custom.agg_last_digest_at(p_organization_id, p_rule_id),
                      v_until - case v_cadence when 'hourly' then interval '1 hour'
                                               when 'weekly' then interval '7 days'
                                               else interval '1 day' end);

  if v_def is not null and v_table is not null and v_who is not null then
    for c in
      select distinct o.record_id
        from custom.io_outbox o
       where o.organization_id = p_organization_id
         and o.table_id = v_table
         and o.deleted_at is null
         and o.created_at > v_since
         and o.created_at <= v_until
    loop
      -- THE SUBSCRIBER'S LADDER, asked for the subscriber by name.
      if not custom.has_visibility(v_who, 'record', c.record_id, 'viewer'::public.permission_level) then
        continue;
      end if;

      select r.data, (r.deleted_at is null) into v_now, v_live
        from custom.record r
       where r.organization_id = p_organization_id and r.id = c.record_id;

      v_in_now := coalesce(v_live, false) and custom.agg_view_admits_state(v_def, v_now);

      begin
        select a.state into v_then
          from custom.record_as_of(p_organization_id, c.record_id, v_since) a;
      exception when others then
        v_then := null;              -- history it cannot replay reads as "was not here"
      end;
      v_in_then := custom.agg_view_admits_state(v_def, v_then);

      if v_in_now and not v_in_then then
        v_entered := v_entered || jsonb_build_object(
          'record_id', c.record_id, 'name', custom.agg_record_name(p_organization_id, c.record_id, v_now));
      elsif v_in_then and not v_in_now then
        -- IT LEFT, AND THE SUMMARY SAYS SO. A lead whose stage moved out of the
        -- view is the single most useful line in a Monday summary, and it is the
        -- line a count-based digest can never produce.
        v_left := v_left || jsonb_build_object(
          'record_id', c.record_id, 'name', custom.agg_record_name(p_organization_id, c.record_id, coalesce(v_now, v_then)));
      elsif v_in_now then
        v_changed := v_changed || jsonb_build_object(
          'record_id', c.record_id, 'name', custom.agg_record_name(p_organization_id, c.record_id, v_now));
      end if;
    end loop;

    -- HOW MANY ARE IN THE VIEW ALTOGETHER, from the eighth verb, under the
    -- SUBSCRIBER's seat — so the number in the summary is the number the dashboard
    -- shows, produced by the same code rather than by a second count here.
    v_claims := current_setting('request.jwt.claims', true);
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_who)::text, true);
      select coalesce(sum(a.row_count), 0) into v_total
        from custom.record_aggregate(p_organization_id, v_table, '[]'::jsonb,
               jsonb_build_array(jsonb_build_object('op', 'count'))) a;
    exception when others then
      v_total := null;
    end;
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  end if;

  -- The click-through: the grid, filtered by the very view this subscription is over.
  v_link := case when v_table is not null
                 then format('/data-v2/%s%s', v_table,
                             case when v_view is not null then format('?view=%s', v_view) else '' end)
            end;

  v_subject := case
    when jsonb_array_length(v_entered) > 0
      then format('%s: %s new', v_name, jsonb_array_length(v_entered))
    when jsonb_array_length(v_left) + jsonb_array_length(v_changed) > 0
      then format('%s: %s update(s)', v_name,
                  jsonb_array_length(v_left) + jsonb_array_length(v_changed))
    else format('%s: nothing new', v_name) end;

  v_body := btrim(concat_ws(' ',
    case when jsonb_array_length(v_entered) > 0 then
      format('%s arrived: %s.', jsonb_array_length(v_entered),
             (select string_agg(e ->> 'name', ', ') from jsonb_array_elements(v_entered) e)) end,
    case when jsonb_array_length(v_left) > 0 then
      format('%s left the view: %s.', jsonb_array_length(v_left),
             (select string_agg(e ->> 'name', ', ') from jsonb_array_elements(v_left) e)) end,
    case when jsonb_array_length(v_changed) > 0 then
      format('%s changed: %s.', jsonb_array_length(v_changed),
             (select string_agg(e ->> 'name', ', ') from jsonb_array_elements(v_changed) e)) end,
    case when v_total is not null then format('%s in the view now.', v_total) end,
    format('Since %s.', to_char(v_since at time zone 'utc', 'FMDay DD FMMonth YYYY HH24:MI') || ' UTC')));

  return jsonb_build_object(
    'rule_id', p_rule_id, 'name', v_name, 'cadence', v_cadence,
    'schedule', nullif(v_sub ->> 'schedule', ''),
    'quiet_hours', case when jsonb_typeof(v_sub -> 'quiet_hours') = 'object'
                        then v_sub -> 'quiet_hours' else null end,
    'channel', coalesce(v_sub ->> 'channel', 'in_app'),
    'recipient_user_id', v_who,
    'muted', coalesce((v_sub ->> 'muted')::boolean, false),
    'table_id', v_table, 'saved_view_id', v_view,
    'window_start', v_since, 'window_end', v_until,
    'entered', v_entered, 'left', v_left, 'changed', v_changed,
    'counts', jsonb_build_object('entered', jsonb_array_length(v_entered),
                                 'left', jsonb_array_length(v_left),
                                 'changed', jsonb_array_length(v_changed),
                                 'in_view', v_total),
    'link', v_link, 'subject', v_subject, 'body', v_body,
    -- NOTHING FAILS SILENTLY: a subscription that cannot produce a summary says
    -- which piece is missing, in the words a person reads on the screen.
    'incomplete', case
      when v_who is null then 'This subscription has nobody to tell, so it sends nothing.'
      when v_view is null then 'This subscription names no saved view, so nothing is ever admitted to it.'
      when v_def is null then 'The saved view this subscription watches has been deleted, so it sends nothing.'
      when v_table is null then 'The saved view does not say which table it is over, so nothing can be summarised.'
      else null end);
end;
$fn$;

comment on function custom.agg_digest_assemble(uuid, uuid, timestamptz, timestamptz) is
  'DOOR-18: ONE summary, assembled — what entered the view, what left it and what changed since the watermark, named rather than counted, under the SUBSCRIBER''s own visibility, with the total from custom.record_aggregate and a click-through to the filtered grid. Assembles only; custom.agg_digest_run sends.';

-- ═══ 9. DELIVERY, WITH QUIET HOURS AND THE CLICK-THROUGH ══════════════════════

create function custom.agg_deliver_quietly(p_organization_id uuid, p_rule_id uuid,
        p_subject_id uuid, p_channel text, p_recipient_user_id uuid, p_event_key text,
        p_subject text, p_body text, p_payload jsonb, p_quiet_hours jsonb, p_link text,
        p_dedupe_suffix text default null)
returns uuid
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_id    uuid;
  v_until timestamptz;
begin
  -- ONE SENDER. This adds nothing to delivery: it calls the same
  -- `custom.agg_deliver` everything else calls, then moves the moment and hangs the
  -- link on the row the platform's own worker will pick up.
  v_id := custom.agg_deliver(p_organization_id, p_rule_id, p_subject_id, p_channel,
                             p_recipient_user_id, p_event_key, p_subject, p_body, p_payload,
                             p_dedupe_suffix);
  if v_id is null then return null; end if;

  -- QUIET HOURS MOVE A MESSAGE, THEY NEVER DROP IT. `next_attempt_at` is the
  -- notification system's own word for "not before this", so the one worker holds
  -- it and delivers it at 07:00 — rather than this code deciding, on the clock,
  -- that somebody simply does not get told.
  v_until := custom.agg_quiet_until(p_quiet_hours, now());
  update communication.notification n
     set next_attempt_at = coalesce(v_until, n.next_attempt_at),
         deep_link       = coalesce(n.deep_link, p_link)
   where n.id = v_id
     and n.organization_id = p_organization_id
     and n.status is distinct from 'succeeded';
  return v_id;
end;
$fn$;

comment on function custom.agg_deliver_quietly(uuid, uuid, uuid, text, uuid, text, text, text, jsonb, jsonb, text, text) is
  'DOOR-18: custom.agg_deliver, plus the two things a subscription adds — quiet hours, which move the delivery moment rather than dropping the message, and the click-through to the filtered grid.';

-- ═══ 10. INSTANT — FIRES ON ENTERING, NEVER ON TOUCHING ═══════════════════════

create function custom.agg_subscription_fire_entered(p_organization_id uuid,
        p_record_id uuid, p_table_id uuid default null, p_since timestamptz default null)
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  s       record;
  v_n     integer := 0;
  v_then  jsonb;
  v_def   jsonb;
  v_name  text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_subscription_fire');

  for s in select * from custom.agg_subscriptions(p_organization_id, null, 'instant') loop
    if s.saved_view_id is null or s.recipient_user_id is null then
      continue;                       -- a subscription with no view or no recipient fires at nobody
    end if;
    if not custom.agg_view_admits(p_organization_id, s.saved_view_id, p_record_id) then
      continue;
    end if;

    -- ENTERING, NOT TOUCHING. With a moment to look back to, the record must NOT
    -- have been in the view then: editing a lead's phone number changes a record
    -- that was already a lead and sends nothing. With no moment — a form
    -- submission, where the record did not exist a second ago — admitted now IS
    -- entered.
    if p_since is not null then
      select sv.definition into v_def from platform.saved_view sv
       where sv.id = s.saved_view_id and sv.organization_id = p_organization_id;
      begin
        select a.state into v_then
          from custom.record_as_of(p_organization_id, p_record_id, p_since) a;
      exception when others then
        v_then := null;
      end;
      if custom.agg_view_admits_state(v_def, v_then) then
        continue;
      end if;
    end if;

    v_name := custom.agg_record_name(p_organization_id, p_record_id);
    perform custom.agg_deliver_quietly(p_organization_id, s.rule_id, p_record_id, s.channel,
              s.recipient_user_id, s.event_key,
              format('%s: %s', s.name, v_name),
              format('%s just entered %s.', v_name, s.name),
              jsonb_build_object('cadence', 'instant', 'table_id', coalesce(p_table_id, s.table_id),
                                 'saved_view_id', s.saved_view_id, 'record_name', v_name),
              s.quiet_hours,
              case when coalesce(p_table_id, s.table_id) is not null
                   then format('/data-v2/%s?view=%s', coalesce(p_table_id, s.table_id), s.saved_view_id) end);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;

comment on function custom.agg_subscription_fire_entered(uuid, uuid, uuid, timestamptz) is
  'DOOR-18: tell everyone whose instant subscription this record has just ENTERED. With p_since the record must not have been admitted then, so a field edit on a record already in the view sends nothing; without it — a brand new record — admitted now is entered.';

create or replace function custom.agg_subscription_fire(p_organization_id uuid, p_record_id uuid,
        p_table_id uuid default null, p_changed_field_ids jsonb default '[]'::jsonb)
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $fn$
begin
  -- The contract every existing caller holds — `custom.form_notify` is one — is
  -- "this record has just come into being, tell whoever wants to know". It is the
  -- no-watermark arm of the one implementation, never a second copy of it.
  return custom.agg_subscription_fire_entered(p_organization_id, p_record_id, p_table_id, null);
end;
$fn$;

comment on function custom.agg_subscription_fire(uuid, uuid, uuid, jsonb) is
  'DOOR-18: fire the instant subscriptions this record belongs to, for a record that has just been created. Delegates to custom.agg_subscription_fire_entered with no watermark.';

-- ═══ 11. THE DEDUPE KEY LEARNS ABOUT WINDOWS ══════════════════════════════════
--
-- `custom.agg_deliver`'s key was `rule : record : DATE`, which is exactly right for
-- "one subscription, one record, one day" and exactly wrong for an hourly summary:
-- the second hour of the day would collide with the first, find the UNIQUE index,
-- send nothing and hand back the first hour's message as though it had. The key
-- gains an OPTIONAL suffix — the window a summary covers — and every existing
-- caller keeps the key it has today, because the suffix defaults to none. The old
-- nine-argument function is dropped in the same transaction as the ten-argument one
-- is created, so its five callers in other lanes (form_notify, booking_notify and
-- the three sign_request_* doors) resolve to it on their very next call, unchanged.



-- ═══ 12. THE SUMMARY RUNNER ═══════════════════════════════════════════════════

create or replace function custom.agg_digest_run(p_organization_id uuid, p_rule_id uuid default null,
                                                 p_since timestamptz default null)
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  s        record;
  v_digest jsonb;
  v_n      integer := 0;
  v_id     uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_digest_run');

  for s in select * from custom.agg_subscriptions(p_organization_id, null, null)
            where cadence in ('hourly', 'daily', 'weekly') loop
    if p_rule_id is not null and s.rule_id <> p_rule_id then continue; end if;
    if s.saved_view_id is null or s.recipient_user_id is null then continue; end if;

    v_digest := custom.agg_digest_assemble(p_organization_id, s.rule_id, p_since, now());

    if v_digest ->> 'incomplete' is not null then
      continue;                       -- it says what is missing; it does not send a broken summary
    end if;
    if (v_digest -> 'counts' ->> 'entered')::int
       + (v_digest -> 'counts' ->> 'left')::int
       + (v_digest -> 'counts' ->> 'changed')::int = 0 then
      -- A summary with nothing in it is not sent. Silence is the message, and a
      -- weekly "nothing happened" is how people learn to ignore a channel.
      continue;
    end if;

    v_id := custom.agg_deliver_quietly(p_organization_id, s.rule_id, s.saved_view_id, s.channel,
              s.recipient_user_id, s.event_key,
              v_digest ->> 'subject', v_digest ->> 'body',
              v_digest - 'subject' - 'body',
              s.quiet_hours, v_digest ->> 'link',
              -- The window IS the identity of a summary, so two runs of the same
              -- window send once and two different windows both send.
              to_char((v_digest ->> 'window_end')::timestamptz at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI'));
    if v_id is not null then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$fn$;

comment on function custom.agg_digest_run(uuid, uuid, timestamptz) is
  'DOOR-18: send the summaries that are due — one notification per subscription, naming what entered, left and changed since that subscription''s last summary. An empty summary is not sent and an incomplete one says what is missing instead.';

-- ═══ 13. THE PULSE — WHAT ACTUALLY CALLS THE RUNNERS ══════════════════════════
--
-- Before this file nothing called either runner, in any repository, on any
-- schedule. The two ticks below are what make product #8 a product rather than a
-- data model: one reads the change feed and fires instants, the other sends the
-- summaries that have come due. Both are the notifier's own — server-only, no
-- client grant — and both step over an organization that raises rather than
-- letting one tenant's switched-off store stop every other tenant's notifications.

create function custom.agg_subscription_tick(p_window interval default '15 minutes')
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  o       record;
  e       record;
  v_since timestamptz := now() - greatest(coalesce(p_window, interval '15 minutes'), interval '1 minute');
  v_n     integer := 0;
begin
  for o in
    select distinct ob.organization_id
      from custom.io_outbox ob
     where ob.created_at > v_since
       and ob.deleted_at is null
       and ob.event_key = 'records.changed'
  loop
    begin
      -- IT DOES NOT CLAIM THE OUTBOX. `consumed_at` is ONE column and ONE consumer,
      -- so a notifier that drained it would silently starve every import, export
      -- and webhook consumer of the same feed. Re-reading the same window is free:
      -- custom.agg_deliver's dedupe key is a UNIQUE constraint, so the second read
      -- of an event sends nothing.
      for e in
        select ob.record_id, min(ob.table_id) as table_id
          from custom.io_outbox ob
         where ob.organization_id = o.organization_id
           and ob.created_at > v_since
           and ob.deleted_at is null
           and ob.event_key = 'records.changed'
         group by ob.record_id
      loop
        v_n := v_n + custom.agg_subscription_fire_entered(o.organization_id, e.record_id,
                                                          e.table_id, v_since);
      end loop;
    exception when others then
      -- One organization with the store switched off, or a view somebody deleted
      -- mid-tick, must not stop every other organization being told. It is skipped
      -- and said out loud in the server log rather than swallowed.
      raise warning 'custom.agg_subscription_tick: organization % skipped — %', o.organization_id, sqlerrm;
    end;
  end loop;
  return v_n;
end;
$fn$;

comment on function custom.agg_subscription_tick(interval) is
  'DOOR-18: read the records.changed outbox for the last window and fire every instant subscription whose view a record has just ENTERED. Claims nothing, so other consumers of the same feed are untouched; idempotent through the delivery dedupe key.';

create function custom.agg_digest_tick()
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  o      record;
  s      record;
  v_last timestamptz;
  v_due  timestamptz;
  v_n    integer := 0;
begin
  for o in
    select distinct r.organization_id
      from custom.record r
     where r.data_class = 'rule' and r.deleted_at is null and r.data ? 'subscription'
  loop
    begin
      for s in select * from custom.agg_subscriptions(o.organization_id, null, null)
                where cadence in ('hourly', 'daily', 'weekly') loop
        v_last := custom.agg_last_digest_at(o.organization_id, s.rule_id);
        -- A subscription that has never sent is due one period after it was made,
        -- not immediately: "email me a Monday summary" written on a Tuesday means
        -- next Monday, and the first summary covers the week it names.
        if v_last is null then
          select r.created_at into v_last from custom.record r
           where r.organization_id = o.organization_id and r.id = s.rule_id;
        end if;
        v_due := custom.agg_digest_due_at(s.cadence, s.schedule, s.quiet_hours,
                                          coalesce(v_last, now()));
        if v_due is not null and v_due <= now() then
          v_n := v_n + custom.agg_digest_run(o.organization_id, s.rule_id, null);
        end if;
      end loop;
    exception when others then
      raise warning 'custom.agg_digest_tick: organization % skipped — %', o.organization_id, sqlerrm;
    end;
  end loop;
  return v_n;
end;
$fn$;

comment on function custom.agg_digest_tick() is
  'DOOR-18: send every summary that has come due — the next due moment computed from the cadence, the schedule and the quiet hours, measured from that subscription''s own last send.';

-- ═══ 14. THE DOORS A PERSON REACHES ═══════════════════════════════════════════

create function custom.subscription_declare(p_organization_id uuid, p_table_id uuid,
                                                       p_spec jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_cadence text;
  v_quiet   jsonb;
  v_channel text;
  v_view    uuid;
  v_who     uuid;
  v_name    text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.subscription_declare');
  perform custom.assert_store_door(p_organization_id, 'custom.subscription_declare');
  -- Subscribing people to a Table is an act ON that Table, so it takes the rung
  -- writing on it takes. The one ladder, asked once, here.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.subscription_declare');

  v_name  := coalesce(nullif(btrim(p_spec ->> 'name'), ''), 'Tell me');
  v_view  := nullif(p_spec ->> 'saved_view_id', '')::uuid;
  v_who   := coalesce(nullif(p_spec ->> 'recipient_user_id', '')::uuid, custom.query_principal());
  v_channel := lower(coalesce(nullif(btrim(p_spec ->> 'channel'), ''), 'in_app'));
  v_cadence := custom.agg_cadence_normalize(p_spec ->> 'cadence');

  if v_view is null then
    raise exception 'A subscription needs a saved view: it is the view that decides what counts.'
      using errcode = '22004',
            hint = 'Save the view you want to be told about first, then subscribe to it — that is how "what counts as urgent" stays editable in English.';
  end if;
  if v_cadence is null then
    raise exception '% is not a cadence anything acts on. The cadences are: %.',
                    coalesce(p_spec ->> 'cadence', '(none)'),
                    array_to_string(custom.agg_subscription_cadences(), ', ')
      using errcode = '22023';
  end if;
  if v_channel not in ('in_app', 'email', 'sms') then
    raise exception '% is not a channel this platform sends on. The channels are: in_app, email, sms.', v_channel
      using errcode = '22023';
  end if;
  if v_who is null then
    raise exception 'A subscription needs somebody to tell, and this call named nobody.'
      using errcode = '22004',
            hint = 'Name recipient_user_id, or call it signed in so that "tell me" means you.';
  end if;

  v_quiet := case when jsonb_typeof(p_spec -> 'quiet_hours') = 'object'
                  then p_spec -> 'quiet_hours' else null end;
  if v_quiet is not null then
    -- A quiet-hours block nobody can read would be worse than none: it would look
    -- set on the screen and do nothing at 3am. It is parsed HERE, at the write.
    begin
      perform (v_quiet ->> 'start')::time, (v_quiet ->> 'end')::time,
              now() at time zone coalesce(nullif(btrim(v_quiet ->> 'tz'), ''), 'UTC');
    exception when others then
      raise exception 'Those quiet hours cannot be read: %', sqlerrm
        using errcode = '22023',
              hint = 'Quiet hours are {"start":"22:00","end":"07:00","tz":"America/Chicago"} — two times of day and a time zone name.';
    end;
  end if;

  -- REC-72: a Rule is DECLARED, never written as a record. custom.record_write
  -- would insert data_class = 'record', which every reader that goes looking for a
  -- Rule steps straight past — so this delegates rather than writing.
  return custom.rule_declare(p_organization_id, jsonb_build_object(
    'name', v_name,
    'kind', 'predicate',
    'uses', jsonb_build_array('membership'),
    'scope_table_id', p_table_id,
    'applies_to_types', jsonb_build_array(),
    'expr', jsonb_build_object('const', true),
    'subscription', jsonb_strip_nulls(jsonb_build_object(
      'saved_view_id', v_view,
      'cadence', v_cadence,
      'schedule', nullif(btrim(p_spec ->> 'schedule'), ''),
      'quiet_hours', v_quiet,
      'channel', v_channel,
      'recipient_user_id', v_who,
      'event_key', coalesce(nullif(btrim(p_spec ->> 'event_key'), ''), 'records.changed')))),
    nullif(p_spec ->> 'rule_id', '')::uuid);
end;
$fn$;

comment on function custom.subscription_declare(uuid, uuid, jsonb) is
  'DOOR-18: the one door that writes a subscription. It refuses a cadence no runner acts on, a channel this platform does not send on, quiet hours nobody can parse and a subscription with no view or nobody to tell — BY NAME — then declares the Rule through custom.rule_declare (REC-72).';

create function custom.subscription_preview(p_organization_id uuid, p_rule_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me    uuid := custom.query_principal();
  v_rule  custom.record;
  v_who   uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.subscription_preview');
  select * into v_rule from custom.record r
   where r.organization_id = p_organization_id and r.id = p_rule_id
     and r.data_class = 'rule' and r.deleted_at is null;
  if not found or not (v_rule.data ? 'subscription') then
    raise exception 'There is no subscription % here.', p_rule_id
      using errcode = '23503';
  end if;

  v_who := nullif(v_rule.data -> 'subscription' ->> 'recipient_user_id', '')::uuid;
  -- SHOWING SOMEBODY ELSE'S SUMMARY WOULD SHOW THEM THEIR RECORDS. The same rung
  -- muting takes: your own is yours, and somebody else's takes admin on the Table.
  if v_who is distinct from v_me
     and not custom.query_is_store_owner()
     and not custom.has_visibility(v_me, 'record', (v_rule.data ->> 'scope_table_id')::uuid,
                                   'admin'::public.permission_level) then
    raise exception 'That summary is addressed to somebody else, so it is not yours to read.'
      using errcode = '42501',
            hint = 'A summary is assembled under the person it is sent to, so reading one means reading their records. Ask whoever holds admin on the table.';
  end if;

  -- It ASSEMBLES and returns. Nothing is sent and nothing is recorded, so pressing
  -- "show me one now" does not move the watermark and does not cost somebody a text.
  return custom.agg_digest_assemble(p_organization_id, p_rule_id, null, now());
end;
$fn$;

comment on function custom.subscription_preview(uuid, uuid) is
  'DOOR-18: the summary this subscription would send right now — what entered, left and changed since its last one, named. It assembles only: nothing is delivered, nothing is recorded and the watermark does not move.';

-- ═══ 15. THE PERSON'S OWN LIST, WITH THE TWO ANSWERS IT NEVER HAD ═════════════
--
-- "When is my next summary?" and "when did this last tell me anything?" are the
-- two questions anybody looking at a notifications list actually has, and neither
-- could be asked. They are answered by the SAME functions the runner uses, so the
-- screen's "next Monday 08:00" and the moment the runner fires cannot drift.
-- The return type is a strict superset; the drop and the create are one
-- transaction, and the arguments are unchanged, so every existing caller keeps
-- working on its next call.



-- ═══ 16. THE THREE NEW CLIENT DOORS, DECLARED ═════════════════════════════════

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'subscription_declare',
   'p_organization_id uuid, p_table_id uuid, p_spec jsonb',
   array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there, and custom.assert_store_door applies the product switch before any write. p_table_id is then put to custom.assert_client_may_change at the editor rung, so subscribing people to a Table takes the rung writing on that Table takes; a table_id from another tenant reads as absent. p_spec is not stored as given: the cadence, the channel and the quiet hours are each parsed and refused BY NAME when nothing acts on them, the recipient defaults to the caller, and the Rule is written through custom.rule_declare (REC-72) rather than as a record. It returns one rule id and reads no record.',
   'digests_the_cadence_the_quiet_hours_and_the_real_digest.sql', null, true, false),
  ('custom', 'subscription_preview',
   'p_organization_id uuid, p_rule_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. p_rule_id is matched together with the organization and with data_class = ''rule'', so another tenant''s rule reads as absent. The caller is then either the subscription''s own recipient or holds admin on the Table it is about, checked by custom.has_visibility — because a summary is assembled UNDER the person it is addressed to, so reading somebody else''s would be reading their records. It assembles and returns; it delivers nothing, records nothing and does not move the watermark.',
   'digests_the_cadence_the_quiet_hours_and_the_real_digest.sql', null, true, false),
  ('custom', 'agg_view_admits_state', 'p_definition jsonb, p_state jsonb',
   array['jsonb'::regtype, 'jsonb'::regtype]::oid[],
   'Declared as the notifier''s own, NOT client-callable: it is IMMUTABLE, reads no table and touches no organization, and it exists only so custom.agg_digest_assemble and custom.agg_subscription_fire_entered run ONE copy of the saved view''s predicate. Nothing client-side calls it.',
   'digests_the_cadence_the_quiet_hours_and_the_real_digest.sql',
   'server_only: a pure predicate over two jsonb values with no organization argument and nothing to reach. The runners call it as the definer.', false, false)
on conflict do nothing;

-- The declarations `custom.subscriptions` and `custom.subscription_mute` already
-- carry are untouched: their arguments did not change, so the rows still describe
-- the doors exactly.
