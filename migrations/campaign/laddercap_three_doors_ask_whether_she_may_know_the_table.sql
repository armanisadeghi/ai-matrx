-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.bookings(uuid, uuid) 3d69edc4da8356af66cb0625a2b19d0cc372af53a1be8c6a06ad26110b13e674
-- based-on: custom.enrichments(uuid, uuid) 3fe1a6c5a2b919d901f801a3cbaefae1161639b08af942677be9a6274b603dab
-- based-on: custom.pipeline_board(uuid, uuid, text) ccf45d9aed24bc109825189f6b3719d7982179ba33eeec65d018c382bc059fcf
--
-- LADDER-CAP — THREE NEW DOORS DESCRIBE A TABLE WITHOUT ASKING WHETHER THE CALLER MAY KNOW IT.
--
-- FOUND BY `scripts/campaign-tests/storerel_green.sql` PART 4j, STORE-REL's own census, which
-- exists so "the class cannot reopen through a tenth door". It reopened through three:
--
--     function_name   | why
--     ----------------+------------------------------------------------------------------
--     bookings        | takes a Table and describes it - its Fields, its Homes, its columns
--     enrichments     | or how many records it holds - without asking whether the caller may
--     pipeline_board  | know that Table exists (VIS-5 / T10)
--
-- All three are client doors added TODAY (lanes BOOKING, ENRICH and PIPELINES), all three take
-- `p_table_id`, and all three ask `custom.assert_client_may_reach` — the ORGANIZATION wall — and
-- stop there. VIS-5/T10 is the wall after it: a member of the organization who may not know a
-- Table exists must not be told its shape, its columns, its Homes or how many rows it holds, and
-- `custom.assert_may_know_table` is the one line the other nine doors ask.
--
-- Each body is the live body, character for character, with ONE line added after the wall it
-- already asks — the same line, in the same place, in the same order as
-- `custom.applicable_fields`. `custom.assert_may_know_table` returns early on a null Table, so
-- the list-everything call each of these doors also serves is untouched.
--
-- NOT THIS LANE'S OBJECTS, AND FIXED HERE ANYWAY: the suite is red on main, the census is the
-- guard that says so, and a door that describes a Table to somebody who may not know it exists
-- is the defect VIS-5 exists to stop. Each replacement declares the body it was written against,
-- so a lane that has moved one of these since will refuse this file rather than lose its work.


CREATE OR REPLACE FUNCTION custom.bookings(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(form_id uuid, table_id uuid, title text, slug text, published_at timestamp with time zone, closed_at timestamp with time zone, slot_minutes integer, timezone text, slot_table_id uuid, booked bigint, cancelled bigint, upcoming bigint, held bigint, next_at timestamp with time zone, state text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.bookings');
  -- VIS-5 / T10 (LADDER-CAP): and the wall after it — a Table she may not know exists is
  -- not described to her. Null Table = list everything, and this returns early on that.
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.bookings');
  return query
    select f.id, f.table_id, coalesce(f.title, 'Book a time'), f.slug,
           f.published_at, f.closed_at,
           (f.presentation -> 'booking' ->> 'slot_minutes')::integer,
           f.presentation -> 'booking' ->> 'timezone',
           (f.presentation -> 'booking' ->> 'slot_table_id')::uuid,
           coalesce(b.booked, 0), coalesce(b.cancelled, 0), coalesce(b.upcoming, 0),
           coalesce(h.held, 0), b.next_at,
           case when f.closed_at is not null then 'closed'
                when f.published_at is null then 'draft'
                else 'open' end
      from custom.anon_form f
      left join lateral (
        select count(*) filter (where coalesce(r.data ->> 'status', 'booked') <> 'cancelled') as booked,
               count(*) filter (where r.data ->> 'status' = 'cancelled') as cancelled,
               count(*) filter (where coalesce(r.data ->> 'status', 'booked') <> 'cancelled'
                                  and (r.data ->> 'slot')::timestamptz > now()) as upcoming,
               min((r.data ->> 'slot')::timestamptz) filter (
                 where coalesce(r.data ->> 'status', 'booked') <> 'cancelled'
                   and (r.data ->> 'slot')::timestamptz > now()) as next_at
          from custom.anon_submission s
          join custom.record r
            on r.organization_id = s.organization_id and r.id = s.record_id and r.deleted_at is null
         where s.organization_id = f.organization_id and s.form_id = f.id
           and s.booking_ref is not null) b on true
      left join lateral (
        select count(*) as held from custom.record hr
         where hr.organization_id = f.organization_id
           and hr.table_id = (f.presentation -> 'booking' ->> 'slot_table_id')::uuid
           and hr.deleted_at is null
           and coalesce((hr.data ->> 'expires_at')::timestamptz, now()) > now()) h on true
     where f.organization_id = p_organization_id
       and f.deleted_at is null
       and f.presentation ? 'booking'
       and (p_table_id is null or f.table_id = p_table_id)
       -- THE WALL. A booking page is only listed to somebody who may already open the
       -- Table it books into; the list can never reveal a Table.
       and custom.my_level(p_organization_id, f.table_id, 'table') is not null
     order by f.published_at desc nulls last, f.slug;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.enrichments(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(field_id uuid, table_id uuid, field_key text, label text, enrichment jsonb, enabled boolean, review_interval_days integer, rows_total integer, rows_filled integer, rows_stale integer, rows_pinned integer, rows_absent integer, runs integer, cost_cents numeric, cost_per_row_cents numeric, last_run_at timestamp with time zone, last_run jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.enrichments');
  -- VIS-5 / T10 (LADDER-CAP): and the wall after it — a Table she may not know exists is
  -- not described to her. Null Table = list everything, and this returns early on that.
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.enrichments');

  return query
  with fields as (
    select f.id as fid,
           (f.data ->> 'entity_definition_id')::uuid as tid,
           f.data ->> 'key'   as fkey,
           coalesce(f.data ->> 'label', f.data ->> 'key') as flabel,
           coalesce(f.data -> 'source_config', '{}'::jsonb) as cfg,
           nullif(f.data ->> 'review_interval_days', '')::integer as every
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'source' = 'agent'
       and (p_table_id is null or (f.data ->> 'entity_definition_id')::uuid = p_table_id)
       -- ONLY OVER TABLES THIS CALLER CAN ALREADY OPEN (VIS-5), so the list of what a model
       -- fills in is never a second way to learn that a Table exists.
       and (f.data ->> 'entity_definition_id')::uuid
             in (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
  ),
  cells as (
    select fl.fid,
           count(*)::integer as n_total,
           count(*) filter (where r.data ? fl.fkey
                              and jsonb_typeof(r.data -> fl.fkey) <> 'null')::integer as n_filled,
           count(*) filter (where coalesce((r.data -> '_values' -> fl.fkey ->> 'pinned')::boolean, false))::integer as n_pinned,
           count(*) filter (where nullif(r.data -> '_values' -> fl.fkey ->> 'absent', '') is not null)::integer as n_absent,
           count(*) filter (where fl.every is not null
                              and (r.data -> '_values' -> fl.fkey ->> 'at') is not null
                              and (r.data -> '_values' -> fl.fkey ->> 'at')::timestamptz
                                    + make_interval(days => fl.every) < now())::integer as n_stale
      from fields fl
      join custom.record r
        on r.organization_id = p_organization_id
       and r.table_id = fl.tid
       and r.deleted_at is null
       and r.data_class = 'record'
       and r.id in (select v from custom.query_visible_ids(p_organization_id, fl.tid) v)
     group by fl.fid
  ),
  runs as (
    select (x.data ->> 'field_id')::uuid as fid,
           count(*)::integer             as n_runs,
           sum(coalesce((x.data ->> 'cost_cents')::numeric, 0))   as spend,
           sum(coalesce((x.data ->> 'rows_written')::numeric, 0)) as written,
           max(x.created_at)             as last_at
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = custom.organization_kernel_id()
       and x.data_class = custom.enrich_run_class()
       and x.deleted_at is null
     group by 1
  ),
  last_one as (
    select distinct on ((x.data ->> 'field_id')::uuid)
           (x.data ->> 'field_id')::uuid as fid, x.data as doc
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = custom.organization_kernel_id()
       and x.data_class = custom.enrich_run_class()
       and x.deleted_at is null
     order by (x.data ->> 'field_id')::uuid, x.created_at desc
  )
  select fl.fid, fl.tid, fl.fkey, fl.flabel, fl.cfg,
         coalesce((fl.cfg ->> 'enabled')::boolean, false),
         fl.every,
         coalesce(c.n_total, 0), coalesce(c.n_filled, 0), coalesce(c.n_stale, 0),
         coalesce(c.n_pinned, 0), coalesce(c.n_absent, 0),
         coalesce(rn.n_runs, 0), coalesce(rn.spend, 0),
         case when coalesce(rn.written, 0) > 0
              then round(coalesce(rn.spend, 0) / rn.written, 4) end,
         rn.last_at, lo.doc
    from fields fl
    left join cells c   on c.fid  = fl.fid
    left join runs rn   on rn.fid = fl.fid
    left join last_one lo on lo.fid = fl.fid
   order by fl.flabel;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.pipeline_board(p_organization_id uuid, p_table_id uuid, p_measure text DEFAULT NULL::text)
 RETURNS TABLE(stage_key text, stage_label text, stage_position integer, cards bigint, total numeric, wip_limit integer, over_limit boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_read jsonb;
  v_key  text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipeline_board');
  -- VIS-5 / T10 (LADDER-CAP): and the wall after it — a Table she may not know exists is
  -- not described to her. Null Table = list everything, and this returns early on that.
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.pipeline_board');
  v_read := custom.pipeline_read(p_organization_id, p_table_id);
  if not coalesce((v_read ->> 'is_pipeline')::boolean, false) then
    return;
  end if;
  v_key := v_read ->> 'stage_field';
  if p_measure is not null and not exists (
       select 1 from custom.record f
        where f.organization_id = p_organization_id
          and f.table_id = custom.field_kernel_id()
          and f.deleted_at is null
          and (f.data ->> 'entity_definition_id')::uuid = p_table_id
          and f.data ->> 'key' = p_measure) then
    raise exception 'this board was asked to total %, and there is no such column on this table', p_measure
      using errcode = '23503',
            hint = 'The measure is a column key of the same table — a number, a money or a percentage one.';
  end if;
  return query
    with stages as (
      select s ->> 'key' as k, s ->> 'label' as lab, ord::integer as pos
        from jsonb_array_elements(v_read -> 'stages') with ordinality as t(s, ord)),
    lim as (
      -- The limit is written into the Rule's own test, which is the only copy of it. Reading
      -- it back from there is why a board cannot show a limit the store does not enforce.
      select r.data #>> '{pipeline,stage}' as k,
             (jsonb_path_query_first(r.data -> 'expr',
                '$.**{0 to 8} ? (@.op == "lt").args[1].const') #>> '{}')::integer as n
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.rule_kernel_id()
         and r.deleted_at is null
         and (r.data #>> '{pipeline,stage_field_of}')::uuid = p_table_id
         and r.data #>> '{pipeline,kind}' = 'limit'),
    live as (
      select r.data ->> v_key as k,
             count(*) as n,
             sum(case when p_measure is null then null
                      when jsonb_typeof(r.data -> p_measure) = 'number'
                        then (r.data ->> p_measure)::numeric end) as total
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and r.data_class = 'record'
         and r.id in (select custom.query_visible_ids(p_organization_id, p_table_id, 'viewer'))
       group by 1)
    select s.k, s.lab, s.pos, coalesce(l.n, 0), l.total, lm.n,
           lm.n is not null and coalesce(l.n, 0) > lm.n
      from stages s
      left join live l on l.k = s.k
      left join lim  lm on lm.k = s.k
     order by s.pos;
end;
$function$;
