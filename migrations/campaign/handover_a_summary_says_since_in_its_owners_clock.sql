-- additive: yes
-- based-on: custom.agg_digest_assemble(uuid, uuid, timestamp with time zone, timestamp with time zone) 778ef9b4a7f3dabaa3438d3662753921ea7dcfd98437761ff568be6b680c9841
--
-- HANDOVER (2026-09-28) — A SUMMARY SAYS "SINCE" IN ITS OWNER'S CLOCK.
--
-- Adds ONE helper (custom._digest_since_words, SECURITY INVOKER) and replaces one live body,
-- same signature (custom.agg_digest_assemble, SECURITY INVOKER); nothing dropped, granted or
-- revoked; no row touched.
--
-- What a person met: Cedar Ridge Physical Therapy's office manager, in California, pressed
-- "Send me a preview now" on her weekly Patients summary and read "Since Monday 21 September
-- 2026 20:43 UTC." The subscription carries its zone (quiet_hours.tz — the records client now
-- always sends it); the sentence now reads "Since Monday 21 September 2026 13:43,
-- America/Los_Angeles time." A subscription with no zone still says UTC, plainly.
-- Guard: scripts/campaign-tests/handover_a_summary_says_since_in_its_owners_clock.sql

-- The moment a summary's window opened, in the subscription's own clock ("Monday 21 September
-- 2026 13:43, America/Los_Angeles time"). A zone nobody can read, or none, is said as UTC —
-- never an error inside a summary.
CREATE OR REPLACE FUNCTION custom._digest_since_words(p_at timestamptz, p_tz text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tz text := nullif(btrim(coalesce(p_tz, '')), '');
begin
  if v_tz is not null and upper(v_tz) <> 'UTC' then
    begin
      return to_char(p_at at time zone v_tz, 'FMDay DD FMMonth YYYY HH24:MI') || ', ' || v_tz || ' time';
    exception when others then
      null;                                        -- an unreadable zone falls through to UTC
    end;
  end if;
  return to_char(p_at at time zone 'utc', 'FMDay DD FMMonth YYYY HH24:MI') || ' UTC';
end
$function$;

CREATE OR REPLACE FUNCTION custom.agg_digest_assemble(p_organization_id uuid, p_rule_id uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
    raise exception 'There is no such subscription here.' using errcode = '23503',
            hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).',
            detail = jsonb_build_object('rule_id', p_rule_id)::text;
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
               jsonb_build_array(jsonb_build_object('op', 'count')),
               null,
               -- THE VIEW'S OWN FILTERS, handed to the eighth verb. Without them the
               -- number was the whole TABLE: a summary that had just named one lead
               -- leaving said "3 in the view now" while the view held two.
               coalesce(v_def -> 'filters', '{}'::jsonb)) a;
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
    format('Since %s.', custom._digest_since_words(v_since, v_sub -> 'quiet_hours' ->> 'tz'))));

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
$function$;
