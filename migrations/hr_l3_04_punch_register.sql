-- HR domain L3 — migration 4 of 7 (register item HRB-015, lane L3 punch + kiosk).
--
-- `hr.punch_register` — THE RAW EVIDENCE LANE behind route 30. Raw punches only: never an
-- interval, never a computed or rounded figure, fully paginated, voids returned rather than hidden.
--
-- Authority: SPEC-TIME §1.1, §2.5, §3.4, §4.7 (source_ip privacy posture), §9.1, §10;
--            SPEC-DATA-MODEL §7.1; SPEC-ACCESS §4.2;
--            R-L3-READINESS L3-10, L3-11, LAW 3 (no capped fetch).
-- Applied live as `hr_l3_04_punch_register`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE PAGE ALWAYS CARRIES `total`, WHICH IS WHAT MAKES IT PAGINATION RATHER THAN A CAP.
--    LAW 3 calls a capped fetch a defect. A `limit` alone is indistinguishable from a cap to the
--    caller — they cannot tell "these are all of them" from "these are the first hundred of nine
--    thousand". So the result carries `total`, `returned`, `has_more` and `next_offset`, and the
--    caller can walk the whole set deterministically. `limit` is clamped to 500 and the clamp is
--    REPORTED back in `page.limit_clamped_from` rather than applied silently.
--
-- 2. 🚨 VOIDED PUNCHES ARE RETURNED, LINKED, AND NEVER HIDDEN — AND SO ARE THEIR REPLACEMENTS.
--    §2.5: both punches remain visible forever, the void struck through, the pair linked. The row
--    carries the void chain in BOTH directions: `voided_by_punch_id` (this row was superseded by
--    that one) and `voids_punch_id` (this row supersedes that one), so a surface can render the
--    pair from either end without a second query. There is no `include_voided` filter, deliberately
--    — a register that can be asked to hide evidence is not an evidence lane.
--
-- 3. NO COMPUTED VALUE APPEARS ANYWHERE IN THIS RESULT. No hours, no rounding, no interval, no
--    elapsed figure, not even a convenience "duration since the previous punch". §2.5 and §10 both
--    turn on raw and computed never being conflated, and the cheapest way to guarantee that is for
--    this function to have no arithmetic over timestamps in it at all. The three stamps
--    (`device_reported_at`, `occurred_at`, `server_received_at`) and `clock_skew_applied_seconds`
--    are returned as stored.
--
-- 4. GEO AND PHOTO ARE RETURNED AS **PRESENCE**, NOT AS CONTENT. `geo_captured` / `photo_captured`
--    booleans plus `geo_accuracy_m`. The coordinates and the file id are deliberately not in the
--    list payload: §4.9's transparency ruling gives the employee the right to see their OWN
--    capture, and route 30 puts the photo behind a sensitivity gate as a DOOR — a list that ships
--    every coordinate to every viewer with punch-edit authority would be a bulk location disclosure
--    nobody asked for. The door is `hr_confidential_get`, which already exists.
--
-- 5. `source_ip` IS SHOWN TO PUNCH-EDIT AUTHORITY, AND ALWAYS TO THE SUBJECT (§4.7 privacy posture).
--    Resolved once per employment, not once per row. Everyone else gets the key absent — absent,
--    not null and not masked, so a client cannot render an empty box that reads as "no IP recorded"
--    when the truth is "you may not see it". `source_ip_visible` says which case it is.
--
-- 6. NEAR-DUPLICATE GROUPING IS COMPUTED OVER THE FULL FILTERED SET, NOT OVER THE PAGE.
--    A window function partitioned by (employment, kind) runs before the page slice, so a duplicate
--    pair that straddles a page boundary is still flagged on both rows. Doing it after the slice
--    is the subtle bug this note exists to prevent. The window is
--    `near_duplicate_punch_window_seconds`, the same knob `hr.punch_record` flags on, so the
--    register and the exception can never disagree about what a near duplicate is.
--
-- 7. THE DENIAL NAMES EVERY EMPLOYMENT IT REFUSED (SPEC-ACCESS §4.2). A partial-reach request does
--    not silently return the readable subset — that would let a caller discover reach by
--    subtraction and would quietly under-report evidence in a wage dispute. It refuses, listing the
--    employment ids that were denied and the capability that would have granted them.
-- ===================================================================================

create or replace function hr.punch_register(p_filters jsonb default '{}'::jsonb,
                                             p_page    jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare
  v_uid      uuid := auth.uid();
  v_mine     uuid[];
  v_emp_ids  uuid[];
  v_org      uuid;
  v_from     date;
  v_to       date;
  v_kinds    text[];
  v_sources  text[];
  v_actors   text[];
  v_locs     uuid[];
  v_dupes    boolean;
  v_limit    int;
  v_limit_in int;
  v_offset   int;
  v_denied   uuid[] := '{}';
  v_ipok     uuid[] := '{}';
  v_window   int;
  v_total    bigint;
  v_rows     jsonb;
  e          uuid;
begin
  if v_uid is null then
    return hr._punch_refusal('hr_no_authenticated_caller',
      'The punch register is a signed-in surface.');
  end if;

  p_filters := coalesce(p_filters, '{}'::jsonb);
  p_page    := coalesce(p_page, '{}'::jsonb);
  v_mine    := hr.employments_of(v_uid, current_date);

  ---------------------------------------------------------------- filters
  if p_filters ? 'employment_ids' then
    select array_agg(x::uuid) into v_emp_ids
      from jsonb_array_elements_text(p_filters -> 'employment_ids') x;
  end if;
  v_org  := nullif(p_filters ->> 'organization_id', '')::uuid;
  v_from := nullif(p_filters ->> 'from', '')::date;
  v_to   := nullif(p_filters ->> 'to', '')::date;
  v_dupes := coalesce((p_filters ->> 'duplicate_suspected_only')::boolean, false);
  if p_filters ? 'punch_kinds' then
    select array_agg(x) into v_kinds from jsonb_array_elements_text(p_filters -> 'punch_kinds') x;
  end if;
  if p_filters ? 'sources' then
    select array_agg(x) into v_sources from jsonb_array_elements_text(p_filters -> 'sources') x;
  end if;
  if p_filters ? 'actor_types' then
    select array_agg(x) into v_actors from jsonb_array_elements_text(p_filters -> 'actor_types') x;
  end if;
  if p_filters ? 'work_location_ids' then
    select array_agg(x::uuid) into v_locs
      from jsonb_array_elements_text(p_filters -> 'work_location_ids') x;
  end if;

  ---------------------------------------------------------------- page (decision 1)
  v_limit_in := coalesce((p_page ->> 'limit')::int, 100);
  v_limit    := least(greatest(v_limit_in, 1), 500);
  v_offset   := greatest(coalesce((p_page ->> 'offset')::int, 0), 0);

  ---------------------------------------------------------------- authorization (decision 7)
  if v_emp_ids is null or cardinality(v_emp_ids) = 0 then
    if v_org is null then
      return hr._punch_refusal('hr_register_scope_required',
        'Ask for a person or for an organization. The punch register never returns "everything '
        || 'the caller happens to be able to see" — an evidence lane has to state its scope.',
        jsonb_build_object('give_one_of', jsonb_build_array('filters.employment_ids', 'filters.organization_id')));
    end if;
    if not hr.capability(v_uid, 'working_record.read', null, current_date) then
      return hr._punch_refusal('hr_no_register_read_authority',
        'Reading the whole organization''s punch register needs the working_record.read capability. '
        || 'You can always read your own punches by naming your employment instead.',
        jsonb_build_object('needed', 'working_record.read',
                           'organization_id', v_org,
                           'door', 'filters.employment_ids'));
    end if;
  else
    foreach e in array v_emp_ids loop
      if not (e = any(v_mine)) and not hr.capability(v_uid, 'working_record.read', e, current_date) then
        v_denied := v_denied || e;
      end if;
    end loop;
    if cardinality(v_denied) > 0 then
      return hr._punch_refusal('hr_no_register_read_authority',
        'You do not have reach over ' || cardinality(v_denied) || ' of the employments requested. '
        || 'The register refuses the whole request rather than quietly returning a subset, because '
        || 'a partial answer in a wage dispute reads as a complete one.',
        jsonb_build_object('denied_employment_ids', to_jsonb(v_denied),
                           'needed', 'working_record.read'));
    end if;
  end if;

  ---------------------------------------------------------------- who may see source_ip (decision 5)
  if v_emp_ids is not null then
    foreach e in array v_emp_ids loop
      if e = any(v_mine)
         or coalesce((hr._can_edit_punch(v_uid, e, current_date) ->> 'ok')::boolean, false) then
        v_ipok := v_ipok || e;
      end if;
    end loop;
  end if;

  v_window := (hr._punch_knob('near_duplicate_punch_window_seconds', '120'::jsonb) #>> '{}')::integer;

  ---------------------------------------------------------------- the raw set (decisions 2, 3, 4, 6)
  with filtered as (
    select p.*
      from hr.punch p
     where (v_emp_ids is null or p.employment_id = any(v_emp_ids))
       and (v_org is null or p.organization_id = v_org)
       and (v_from is null or p.local_work_date >= v_from)
       and (v_to   is null or p.local_work_date <= v_to)
       and (v_kinds is null or p.punch_kind = any(v_kinds))
       and (v_sources is null or p.source = any(v_sources))
       and (v_actors is null or p.actor_type = any(v_actors))
       and (v_locs is null or p.work_location_id = any(v_locs))
  ),
  -- decision 6: the window runs over the WHOLE filtered set, before any page slice
  grouped as (
    select f.*,
           lag(f.occurred_at)  over w as prev_at,
           lead(f.occurred_at) over w as next_at
      from filtered f
    window w as (partition by f.employment_id, f.punch_kind order by f.occurred_at)
  ),
  marked as (
    select g.*,
           (g.voided_at is null and (
              (g.prev_at is not null and extract(epoch from (g.occurred_at - g.prev_at)) <= v_window)
           or (g.next_at is not null and extract(epoch from (g.next_at - g.occurred_at)) <= v_window)
           )) as duplicate_suspected
      from grouped g
  )
  select count(*) into v_total from marked m
   where (not v_dupes) or m.duplicate_suspected;

  with filtered as (
    select p.*
      from hr.punch p
     where (v_emp_ids is null or p.employment_id = any(v_emp_ids))
       and (v_org is null or p.organization_id = v_org)
       and (v_from is null or p.local_work_date >= v_from)
       and (v_to   is null or p.local_work_date <= v_to)
       and (v_kinds is null or p.punch_kind = any(v_kinds))
       and (v_sources is null or p.source = any(v_sources))
       and (v_actors is null or p.actor_type = any(v_actors))
       and (v_locs is null or p.work_location_id = any(v_locs))
  ),
  grouped as (
    select f.*,
           lag(f.occurred_at)  over w as prev_at,
           lead(f.occurred_at) over w as next_at,
           lag(f.id)           over w as prev_id,
           lead(f.id)          over w as next_id
      from filtered f
    window w as (partition by f.employment_id, f.punch_kind order by f.occurred_at)
  ),
  marked as (
    select g.*,
           (g.voided_at is null and (
              (g.prev_at is not null and extract(epoch from (g.occurred_at - g.prev_at)) <= v_window)
           or (g.next_at is not null and extract(epoch from (g.next_at - g.occurred_at)) <= v_window)
           )) as duplicate_suspected,
           case when g.prev_at is not null
                 and extract(epoch from (g.occurred_at - g.prev_at)) <= v_window then g.prev_id
                when g.next_at is not null
                 and extract(epoch from (g.next_at - g.occurred_at)) <= v_window then g.next_id
           end as duplicate_of_punch_id
      from grouped g
  ),
  final as (
    select * from marked m where (not v_dupes) or m.duplicate_suspected
     order by m.occurred_at desc, hr._punch_kind_rank(m.punch_kind) desc, m.server_received_at desc
     limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(row_payload order by ord), '[]'::jsonb) into v_rows
    from (
      select row_number() over (order by f.occurred_at desc) as ord,
             jsonb_strip_nulls(jsonb_build_object(
               'id', f.id,
               'employment_id', f.employment_id,
               'organization_id', f.organization_id,
               'punch_kind', f.punch_kind,
               'break_paid', f.break_paid,
               'source', f.source,
               'idempotency_key', f.idempotency_key,
               -- decision 3: all three stamps, as stored, with no arithmetic anywhere
               'device_reported_at', f.device_reported_at,
               'occurred_at', f.occurred_at,
               'server_received_at', f.server_received_at,
               'clock_skew_applied_seconds', f.clock_skew_applied_seconds,
               -- {{JURIS}}, read from the stamped record
               'work_location_id', f.work_location_id,
               'jurisdiction_id', f.jurisdiction_id,
               'jurisdiction_key', (select j.key from hr.jurisdiction j where j.id = f.jurisdiction_id),
               'tz', f.tz,
               'local_work_date', f.local_work_date,
               'position_assignment_id', f.position_assignment_id,
               'shift_id', f.shift_id,
               -- {{ACTOR}}
               'actor', jsonb_strip_nulls(jsonb_build_object(
                 'actor_type', f.actor_type,
                 'actor_employment_id', f.actor_employment_id,
                 'actor_user_id', f.actor_user_id,
                 'actor_device_id', f.actor_device_id,
                 'actor_agent_id', f.actor_agent_id,
                 'actor_external_ref', f.actor_external_ref,
                 'actor_note', f.actor_note)),
               -- decision 4: presence, never content
               'geo_captured', (f.geo_lat is not null),
               'geo_accuracy_m', f.geo_accuracy_m,
               'photo_captured', (f.photo_file_id is not null),
               'capture_door', case when f.photo_file_id is not null or f.geo_lat is not null
                                    then 'hr_confidential_get' end,
               -- decision 5
               'source_ip_visible', (f.employment_id = any(v_ipok)),
               'source_ip', case when f.employment_id = any(v_ipok) then host(f.source_ip) end,
               -- decision 2: the void chain, both directions
               'voided_at', f.voided_at,
               'voided_reason', f.voided_reason,
               'voided_by_punch_id', f.voided_by_punch_id,
               'voids_punch_id', (select o.id from hr.punch o where o.voided_by_punch_id = f.id limit 1),
               'entered_reason', f.entered_reason,
               'original_values', nullif(f.original_values, '{}'::jsonb),
               -- decision 6
               'duplicate_suspected', f.duplicate_suspected,
               'duplicate_of_punch_id', f.duplicate_of_punch_id,
               'attestation_kind', f.attestation_kind,
               'attestation_response', nullif(f.attestation_response, '{}'::jsonb)
             )) as row_payload
        from final f) z;

  return jsonb_build_object(
    'ok', true,
    'rows', v_rows,
    'contains_computed_values', false,   -- decision 3, asserted on the wire
    'page', jsonb_strip_nulls(jsonb_build_object(
      'limit', v_limit,
      'limit_clamped_from', case when v_limit <> v_limit_in then v_limit_in end,
      'offset', v_offset,
      'returned', jsonb_array_length(v_rows),
      'total', v_total,
      'has_more', v_offset + jsonb_array_length(v_rows) < v_total,
      'next_offset', case when v_offset + jsonb_array_length(v_rows) < v_total
                          then v_offset + jsonb_array_length(v_rows) end)),
    'near_duplicate_window_seconds', v_window,
    'source_ip_visible_for_employment_ids', to_jsonb(v_ipok));
end
$$;

comment on function hr.punch_register(jsonb, jsonb) is
  'L3-10: the raw evidence lane. Raw punches only - no interval, no computed or rounded figure. '
  'Fully paginated with a total (LAW 3). Voided punches are returned and linked, never hidden.';

do $$
declare missing text;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = 'punch_register') then
    raise exception 'hr_l3_04: hr.punch_register did not land';
  end if;
end $$;
