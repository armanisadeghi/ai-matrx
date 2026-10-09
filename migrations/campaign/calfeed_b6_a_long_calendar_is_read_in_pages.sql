-- chair-step: replaces users.calendar_feed_read (b5): the read door serves at most 1000 rows a page, so the feed reads up to five pages and says when it was cut. Inverse: migrations/inverse/calfeed_b_a_calendar_feed_is_a_private_link_read_as_its_owner_down.sql.
-- additive: yes
-- guard: custom/system_enabled
-- lock: platform
-- lane: CAL-FEED-CHART
-- based-on: users.calendar_feed_read(text) a2c491fcc4abe9e24c9f6abf0c4ef62b7c40bddb4d1d42aa564772d4ed4b6fe4
--
-- CAL-FEED-CHART part 6: a long calendar is read in pages.

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
  v_q      jsonb;
  v_rows   jsonb := '[]'::jsonb;
  v_total  integer := 0;
  v_off    integer := 0;
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
    -- The store serves at most 1000 rows a page; read up to five pages (5000 events) and say when that cut it.
    v_q := coalesce(case when v_view ? 'where' and v_view -> 'where' <> 'null'::jsonb then v_view -> 'where' end,
                    case when v_view ? 'filters' and v_view -> 'filters' <> '{}'::jsonb then v_view -> 'filters' end, '{}'::jsonb);
    loop
      v_page := custom.read_records_page(f.organization_id, f.table_id, v_q, null, '[]'::jsonb, null, false, 1000, v_off, f.time_zone);
      v_rows := v_rows || coalesce(v_page -> 'rows', '[]'::jsonb);
      v_total := coalesce((v_page ->> 'total')::int, 0);
      exit when jsonb_array_length(coalesce(v_page -> 'rows', '[]'::jsonb)) < 1000 or v_off >= 4000;
      v_off := v_off + 1000;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'type', type, 'config', config)), '[]'::jsonb)
      into v_fields from custom.field where entity_definition_id = f.table_id;
    select jsonb_build_object('name', name, 'title_field', title_field) into v_table from custom."table" where id = f.table_id;
  exception when others then
    -- Lost access (or the table is gone): the calendar is empty, never someone else's data.
    v_rows := '[]'::jsonb; v_total := 0;
  end;
  return jsonb_build_object(
    'status', 'ok', 'feed_id', f.id, 'title', f.title, 'organization_id', f.organization_id, 'table_id', f.table_id,
    'time_zone', f.time_zone, 'description_field', f.description_field, 'date_field', f.date_field, 'end_field', f.end_field,
    'view', v_view, 'fields', v_fields, 'table', v_table,
    'rows', v_rows, 'total', v_total, 'truncated', v_total > jsonb_array_length(v_rows));
end
$function$;
