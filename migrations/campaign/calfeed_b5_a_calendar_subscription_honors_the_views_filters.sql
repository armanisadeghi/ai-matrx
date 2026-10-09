-- chair-step: replaces users.calendar_feed_create and users.calendar_feed_read (created earlier today by calfeed_b2 / b4): the read door's p_view_id means a HAND-ORDERED view, not a view's filter, so the feed now sends the view's own question (its Rule, else its flat filters) as the filter, and the view must belong to the link's table and organization . Inverse: migrations/inverse/calfeed_b_a_calendar_feed_is_a_private_link_read_as_its_owner_down.sql.
-- additive: yes
-- guard: custom/system_enabled
-- lock: platform
-- lane: CAL-FEED-CHART
-- based-on: users.calendar_feed_create(uuid, uuid, uuid, text, text, text, integer) f778a3ccc05fe3248fe358e1c93c9b35a4421dd54acc5e22e98bb1e7a7970778
-- based-on: users.calendar_feed_read(text) f0ece167610cabd84f201c1022eb904590fbb9d14a7ee294cdeb0c9a61175302
--
-- CAL-FEED-CHART part 5: a subscribed calendar honors the view's filters.

create or replace function users.calendar_feed_create(
  p_organization_id uuid, p_table_id uuid, p_view_id uuid, p_title text,
  p_description_field text default null, p_time_zone text default null, p_expires_days integer default null)
 returns jsonb
 language plpgsql security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_def   jsonb;
  v_token text;
  v_days  integer := coalesce(p_expires_days, users.calendar_feed_default_days());
  v_id    uuid;
  v_exp   timestamptz;
  v_tz    text := coalesce(nullif(btrim(p_time_zone), ''), 'UTC');
begin
  if v_uid is null then
    raise exception 'Sign in to subscribe to a calendar.' using errcode = '28000';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    raise exception '% is not a time zone name, so the calendar could not be set to it.', v_tz using errcode = '22023';
  end if;
  -- The caller must be able to read this view's rows RIGHT NOW: the ordinary door judges it.
  perform custom.read_records_page(p_organization_id, p_table_id, '{}'::jsonb, null, '[]'::jsonb, null, false, 1, 0, v_tz);
  if p_view_id is not null then
    select definition into v_def from platform.saved_view
     where id = p_view_id and deleted_at is null and organization_id = p_organization_id
       and coalesce(subject_id, nullif(definition ->> 'table_id', '')::uuid) = p_table_id;
  end if;
  if coalesce(v_def ->> 'date_field', v_def ->> 'start_field') is null then
    raise exception 'A calendar subscription needs a view with a date field - open a Calendar or Timeline view and subscribe from there.'
      using errcode = '22023';
  end if;
  if v_days < 1 or v_days > 3650 then
    raise exception 'A calendar link lives between 1 day and 10 years, and % days was asked.', v_days using errcode = '22023';
  end if;
  v_token := users._calendar_feed_token();
  v_exp := now() + make_interval(days => v_days);
  insert into users.calendar_feed
    (organization_id, created_by, table_id, view_id, title, description_field, time_zone, token_hash, token_prefix, expires_at)
  values (p_organization_id, v_uid, p_table_id, p_view_id, coalesce(nullif(btrim(p_title), ''), 'Calendar'),
          nullif(btrim(p_description_field), ''), v_tz, users._calendar_feed_hash(v_token), left(v_token, 11), v_exp)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_exp, 'time_zone', v_tz);
end
$function$;

create or replace function users.calendar_feed_read(p_token text)
 returns jsonb
 language plpgsql security definer
 set search_path to 'pg_catalog'
as $function$
declare
  f        users.calendar_feed%rowtype;
  v_page   jsonb := null;
  v_view   jsonb := null;
  v_fields jsonb := '[]'::jsonb;
  v_table  jsonb := null;
begin
  select * into f from users.calendar_feed
   where token_hash = users._calendar_feed_hash(coalesce(p_token, '')) and deleted_at is null;
  if not found or f.revoked_at is not null or (f.expires_at is not null and f.expires_at < now()) then
    return jsonb_build_object('status', 'gone');
  end if;
  update users.calendar_feed set last_read_at = now(), read_count = read_count + 1 where id = f.id;

  -- From here the transaction carries the identity of the person who made the link. Postgres forbids SET ROLE inside a
  -- SECURITY DEFINER function, so the person's wall and ladder are applied by the door itself: custom.read_records_page
  -- judges auth.uid() / custom.caller_role() and never the connection's role. The view, field and table metadata below
  -- is read only AFTER that door has let the person in, and only for this link's own table.
  perform set_config('request.jwt.claims', json_build_object('sub', f.created_by::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', f.created_by::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    if f.view_id is not null then
      select definition || jsonb_build_object('name', name) into v_view from platform.saved_view
       where id = f.view_id and deleted_at is null and organization_id = f.organization_id
         and coalesce(subject_id, nullif(definition ->> 'table_id', '')::uuid) = f.table_id;
      if v_view is null then
        raise exception 'The view this calendar shows is gone, or is gone.';
      end if;
    end if;
    -- THE VIEW'S OWN QUESTION: its Rule (where), else its flat filters - the same pair the screens read.
    v_page := custom.read_records_page(f.organization_id, f.table_id,
      coalesce(case when v_view ? 'where' and v_view -> 'where' <> 'null'::jsonb then v_view -> 'where' end,
               case when v_view ? 'filters' and v_view -> 'filters' <> '{}'::jsonb then v_view -> 'filters' end, '{}'::jsonb),
      null, '[]'::jsonb, null, false, 5000, 0, f.time_zone);
    select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'type', type, 'config', config)), '[]'::jsonb)
      into v_fields from custom.field where entity_definition_id = f.table_id;
    select jsonb_build_object('name', name, 'title_field', title_field) into v_table from custom."table" where id = f.table_id;
  exception when others then
    -- Lost access (or the table is gone): the calendar is empty, never someone else's data.
    v_page := null;
  end;
  return jsonb_build_object(
    'status', 'ok', 'feed_id', f.id, 'title', f.title, 'organization_id', f.organization_id, 'table_id', f.table_id,
    'time_zone', f.time_zone, 'description_field', f.description_field, 'date_field', f.date_field, 'end_field', f.end_field,
    'view', v_view, 'fields', v_fields, 'table', v_table,
    'rows', coalesce(v_page -> 'rows', '[]'::jsonb), 'total', coalesce((v_page ->> 'total')::int, 0));
end
$function$;
