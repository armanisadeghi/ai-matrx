-- target: branch,production
-- additive: yes
-- guard: custom/row_versions_guard
--
-- W3-HIST, part three — HIS-5, HIS-6 and DYN-19: TWO CLOCKS. World time is the `dated` Field
--                       modifier carrying valid-from and valid-to, queryable as-of; recorded
--                       time is History, always; neither is recoverable from the other and
--                       neither is heavy.
--
-- WHAT `dated` ALREADY MEANT, AND WHAT IT DID NOT
-- ----------------------------------------------
-- `W1-FIELD` already makes every Field DECLARE `dated` — `custom._field_shape_guard` refuses a
-- Field whose `dated` key is not a boolean, by name, as FLD-2's modifier. So the opt-in half of
-- HIS-5 exists. What did not exist is the VALUE half: nothing anywhere could store a period,
-- nothing could read as-of, and `custom.value_envelope_keys()` — the CLOSED key set every
-- envelope is validated against — would refuse a period if anybody wrote one. A modifier with
-- nowhere to put its data is a declaration, not a clock.
--
-- THE SHAPE, AND WHY IT IS INSIDE THE ENVELOPE
-- -------------------------------------------
-- A dated value's periods live at `data -> '_values' -> <key> -> 'dated'`: an ordered array of
-- `{"from": <date|null>, "to": <date|null>, "value": <anything>}`, half-open [from, to), null
-- meaning unbounded on that side, and no two periods overlapping — MariaDB's `WITHOUT
-- OVERLAPS` is the integrity constraint HIS-6's own proof cites, and this is it.
--
-- Inside the envelope, because "neither clock is heavy" (HIS-6) is a claim about storage and
-- the only way to keep it true is to add no table, no partition and no join: a dated value is
-- the same one row it always was, and the recorded clock is `history.row_versions`, which
-- already exists and already holds 1.4 million rows. Two clocks, zero new stores.
--
-- NEITHER RECOVERABLE FROM THE OTHER — AND THAT IS WHAT THE TEST MEASURES
-- ----------------------------------------------------------------------
-- T6, over ONE stored row set and four dates. The world clock answers "what was true then"
-- from the CURRENT row's periods, so a correction recorded today changes the answer for March
-- 2024. The recorded clock answers "what did this store say then" from the version rows, so
-- it still returns the uncorrected answer for August 2026. A single-clock implementation
-- returns the same value twice and the test goes red — which is exactly the shape §1 requires
-- of a clause that cannot pass while broken.
--
-- THE ONE LIVE BODY THIS FILE REPLACES, AND WHY IT IS ONE
-- ------------------------------------------------------
-- `custom.value_envelope_keys()` is a closed set, so the period block cannot be stored until
-- `dated` is in it. That is the ONLY replacement here: the VALIDATION of the block is a NEW
-- trigger function (`custom._dated_values_guard`) rather than a second rewrite of
-- `custom.value_envelope_refusal`, which three lanes are already writing into. A `-- based-on:`
-- line declares the body this file overwrites, so the runner refuses to replay it over
-- anybody else's later change (DD-220).

-- based-on: custom.value_envelope_keys() 5178326ac6ba0e252b56c951f7a6825eb4d4db8639bbe138288160b12d2ae811

set lock_timeout = '5s';
set statement_timeout = '300s';

-- ─────────────────────────────────────────────────────────────────────────────
-- THE CLOSED KEY SET, OPENED BY EXACTLY ONE WORD.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.value_envelope_keys()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- `dated` (HIS-5) is the world clock: the periods this value was true for, on a Field that
  -- declared the `dated` modifier. Everything else is unchanged from W1-VAL.
  select array['ver', 'src', 'actor', 'on_behalf_of', 'at', 'absent', 'alternates', 'dated']::text[];
$fn$;

comment on function custom.value_envelope_keys() is
  'VAL-5 / VAL-6 and HIS-5: the closed set of keys a value envelope may carry. `dated` holds the world clock — the periods the value was true for — and is refused on a Field that did not declare the modifier.';

-- ─────────────────────────────────────────────────────────────────────────────
-- THE WORLD CLOCK'S OWN GUARD. New body, new trigger: nothing else is replaced.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom._dated_values_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_values  jsonb := coalesce(new.data -> '_values', '{}'::jsonb);
  v_key     text;
  v_env     jsonb;
  v_periods jsonb;
  v_p       jsonb;
  v_k       text;
  v_from    date;
  v_to      date;
  v_prev_to date;
  v_field   jsonb;
  v_rtype   text;
  v_type_fld text;
  v_n       integer;
begin
  -- THE DOOR. One call to the ONE predicate, which judges custom.caller_role() and never
  -- current_user. The switch decides WHO may write and never which check runs.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  if jsonb_typeof(v_values) <> 'object' then
    return new;                      -- the envelope law refuses the malformed block by name
  end if;

  for v_key, v_env in select * from jsonb_each(v_values) loop
    if jsonb_typeof(v_env) <> 'object' or not (v_env ? 'dated') then
      continue;
    end if;
    v_periods := v_env -> 'dated';
    if jsonb_typeof(v_periods) = 'null' then
      continue;
    end if;

    -- HIS-5: the modifier is OPT-IN PER FIELD, so a period on a Field that did not declare
    -- `dated` is refused. Without this the modifier means nothing — every Field would be
    -- dated the moment anybody wrote a period into one.
    if new.data_class = 'record' and new.table_id is not null then
      v_type_fld := custom.table_type_field(new.organization_id, new.table_id);
      if v_type_fld is not null then
        v_rtype := new.data ->> v_type_fld;
      end if;
      select f.data into v_field
        from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) f
       where f.data ->> 'key' = v_key
       limit 1;
      if v_field is not null and coalesce((v_field ->> 'dated')::boolean, false) is not true then
        raise exception '% keeps a single value, so it cannot be given dates it was true between.',
                        coalesce(v_field ->> 'label', v_key)
          using errcode = '23514',
                hint = format('HIS-5: only a field that says its values are dated carries a history of what was true when. Turn that on for %s first, and every value it already holds stays exactly as it is.',
                              coalesce(v_field ->> 'label', v_key));
      end if;
    end if;

    if jsonb_typeof(v_periods) <> 'array' then
      raise exception '% says when it was true, and that has to be a list of periods — it is a %.', v_key, jsonb_typeof(v_periods)
        using errcode = '23514',
              hint = 'HIS-5: each period is a from, a to and the value that held between them. Leave from or to out (write null) for "since forever" and "still true".';
    end if;

    v_n := 0;
    v_prev_to := null;
    for v_p in select value from jsonb_array_elements(v_periods) loop
      v_n := v_n + 1;
      if jsonb_typeof(v_p) <> 'object' then
        raise exception '% has a period that is a %, and a period is a from, a to and a value.', v_key, jsonb_typeof(v_p)
          using errcode = '23514', hint = 'HIS-5.';
      end if;
      for v_k in select k from jsonb_object_keys(v_p) k loop
        if v_k not in ('from', 'to', 'value') then
          raise exception '%: a period carries "%", which is not part of one. A period holds from, to and value.', v_key, v_k
            using errcode = '23514',
                  hint = 'HIS-5: who wrote it and when they wrote it are the RECORDED clock and live in History — never inside a period, or the two clocks would be one.';
        end if;
      end loop;
      if not (v_p ? 'value') then
        raise exception '%: a period with no value says nothing was true between those dates, which is not the same as a period.', v_key
          using errcode = '23514',
                hint = 'HIS-5: leave the gap out instead — the dates with no period covering them are the dates nothing was true.';
      end if;

      begin
        v_from := nullif(v_p ->> 'from', '')::date;
        v_to   := nullif(v_p ->> 'to', '')::date;
      exception when others then
        raise exception '%: a period runs between two dates, and one of "%" and "%" is not one.', v_key, v_p ->> 'from', v_p ->> 'to'
          using errcode = '23514', hint = 'HIS-5: write them as dates, such as 2024-06-01.';
      end;

      if v_from is not null and v_to is not null and v_to <= v_from then
        raise exception '%: a period cannot end on or before it starts (% to %).', v_key, v_from, v_to
          using errcode = '23514', hint = 'HIS-5: the period runs from the first date up to, but not including, the second.';
      end if;

      -- WITHOUT OVERLAPS, and it is why the list must be in order: two periods covering one
      -- day would make "what was true on that day" have two answers, which is the failure
      -- MariaDB's own constraint exists to prevent.
      if v_n > 1 then
        if v_from is null then
          raise exception '%: only the first period may run from the beginning of time, and this is period %.', v_key, v_n
            using errcode = '23514', hint = 'HIS-5: the periods are in order, oldest first.';
        end if;
        if v_prev_to is null then
          raise exception '%: period % is still true, so nothing can come after it.', v_key, v_n - 1
            using errcode = '23514', hint = 'HIS-5: give period ' || (v_n - 1) || ' the date it stopped being true.';
        end if;
        if v_from < v_prev_to then
          raise exception '%: two periods both cover %. A date has one answer.', v_key, v_from
            using errcode = '23514',
                  hint = 'HIS-5: the periods must not overlap — end the earlier one on or before the later one starts.';
        end if;
      end if;
      v_prev_to := v_to;
    end loop;
  end loop;

  return new;
end;
$fn$;

comment on function custom._dated_values_guard() is
  'HIS-5 and HIS-6: the world clock''s integrity. Periods are ordered, half-open and non-overlapping (MariaDB''s WITHOUT OVERLAPS, which HIS-6''s own proof cites), and a period on a Field that did not declare the `dated` modifier is refused by the field''s own name.';

create trigger custom_record_dated_values_guard
  before insert or update on custom.record
  for each row execute function custom._dated_values_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- READING ON EITHER CLOCK. One body; the two clocks are two arguments.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function history.value_in_document(p_data jsonb, p_key text, p_world_on date)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_env     jsonb := p_data -> '_values' -> p_key;
  v_periods jsonb;
  v_p       jsonb;
  v_from    date;
  v_to      date;
begin
  if p_world_on is null then
    -- No world date asked for: the value as the document states it, which is the answer for
    -- an undated Field and the "as it stands" answer for a dated one.
    return p_data -> p_key;
  end if;

  v_periods := v_env -> 'dated';
  if v_periods is null or jsonb_typeof(v_periods) <> 'array' then
    -- HIS-6: an undated Field has NO world clock, and pretending its current value was true
    -- on an arbitrary date would be recovering one clock from the other. It is absent.
    return null;
  end if;

  for v_p in select value from jsonb_array_elements(v_periods) loop
    v_from := nullif(v_p ->> 'from', '')::date;
    v_to   := nullif(v_p ->> 'to', '')::date;
    if (v_from is null or p_world_on >= v_from)
       and (v_to is null or p_world_on < v_to) then
      return v_p -> 'value';
    end if;
  end loop;

  -- A date no period covers: nothing was true then. A contract valid 2027–2029 is storable
  -- today and absent from every as-of query before 2027 (T6), and this is that line.
  return null;
end;
$fn$;

comment on function history.value_in_document(jsonb, text, date) is
  'HIS-5: the WORLD clock, applied to one stored document — the value that was true on a date, from the periods the `dated` modifier carries. A date no period covers answers nothing, which is how a contract valid from 2027 stays absent from every earlier as-of read.';

create or replace function history.value_as_of(p_organization_id uuid,
                                               p_record_id uuid,
                                               p_key text,
                                               p_world_on date default null,
                                               p_recorded_at timestamptz default null)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_data jsonb;
begin
  if p_recorded_at is null then
    -- The RECORD as it stands. The world clock still applies to it.
    select r.data into v_data
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
    if v_data is null then
      raise exception 'There is no record % in this organization.', p_record_id
        using errcode = '02000';
    end if;
  else
    -- THE RECORDED CLOCK. What this store held at that moment, from History and from nothing
    -- else — so a correction made afterwards does not reach back and change it.
    perform history.assert_watching('custom.record', p_recorded_at);
    v_data := history.record_at(p_organization_id, p_record_id, p_recorded_at);
    if v_data is null then
      raise exception 'This store held no record % on %.', p_record_id, p_recorded_at
        using errcode = '02000',
              hint = 'HIS-5: the recorded clock answers what was here at that moment. If the record was created later, the honest answer is that it did not exist yet.';
    end if;
    v_data := v_data -> 'data';
  end if;

  return history.value_in_document(v_data, p_key, p_world_on);
end;
$fn$;

comment on function history.value_as_of(uuid, uuid, text, date, timestamptz) is
  'HIS-5 and HIS-6: the two clocks, as two arguments over one store. p_world_on asks what was TRUE then; p_recorded_at asks what this store SAID then. Neither is recoverable from the other: a correction recorded today moves the world answer for a past date and leaves every recorded answer untouched.';

-- ─────────────────────────────────────────────────────────────────────────────
-- DYN-19 — a merge field declares live, as-of or snapshot, and as-of reads either clock.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom._merge_field_temporal_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  d      jsonb := new.data;
  v_name text;
  v_t    jsonb;
  v_mode text;
  v_clk  text;
  v_temporal boolean;
begin
  -- THE DOOR, the one predicate, exactly as every other RETURNS trigger in this schema.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  if new.table_id is distinct from custom.merge_field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_name := coalesce(nullif(d ->> 'key', ''), 'this merge field');
  v_temporal := exists (select 1 from jsonb_array_elements(coalesce(d -> 'modifiers', '[]'::jsonb)) m
                         where m #>> '{}' = 'temporal');
  v_t := d -> 'temporal';

  if not v_temporal then
    if v_t is not null and jsonb_typeof(v_t) <> 'null' then
      raise exception '% says which moment to read, and it does not behave as something that reads a moment.', v_name
        using errcode = '23514',
              hint = 'DYN-19: add "temporal" to its modifiers, or take the temporal block out. A declaration nothing reads is the silent kind of wrong.';
    end if;
    return new;
  end if;

  if v_t is null or jsonb_typeof(v_t) <> 'object' then
    raise exception '% reads a moment, and it does not say which one.', v_name
      using errcode = '23514',
            hint = 'DYN-19: say {"mode": "live"} for whatever it is now, {"mode": "as_of", "clock": "world"|"recorded", "at": "<date>"} for a moment, or {"mode": "snapshot"} to freeze what it read when it was set.';
  end if;

  v_mode := v_t ->> 'mode';
  if coalesce(v_mode, '') not in ('live', 'as_of', 'snapshot') then
    raise exception '% reads its value %, and a merge field reads it live, as of a moment, or as a snapshot.', v_name, coalesce(v_mode, 'nobody said how')
      using errcode = '23514', hint = 'DYN-19: live, as_of, snapshot.';
  end if;

  if v_mode = 'as_of' then
    v_clk := v_t ->> 'clock';
    if coalesce(v_clk, '') not in ('world', 'recorded') then
      raise exception '% reads a past moment and does not say on which clock.', v_name
        using errcode = '23514',
              hint = 'DYN-19 / HIS-5: "world" asks what was TRUE then; "recorded" asks what this store SAID then. They are different questions and neither answers the other.';
    end if;
    if nullif(v_t ->> 'at', '') is null then
      raise exception '% reads a past moment and does not say which moment.', v_name
        using errcode = '23514', hint = 'DYN-19: "at" is the date, such as 2024-03-01.';
    end if;
    begin
      if v_clk = 'world' then
        perform (v_t ->> 'at')::date;
      else
        perform (v_t ->> 'at')::timestamptz;
      end if;
    exception when others then
      raise exception '% reads as of "%", and that is not a moment.', v_name, v_t ->> 'at'
        using errcode = '23514', hint = 'DYN-19: a date for the world clock, a date and time for the recorded one.';
    end;
  elsif v_t ? 'at' and jsonb_typeof(v_t -> 'at') <> 'null' then
    raise exception '% reads its value %, so naming a moment changes nothing.', v_name, v_mode
      using errcode = '23514',
            hint = 'DYN-19: only as_of reads a moment. A setting nothing reads is how a person comes to believe they pinned something they did not.';
  end if;

  return new;
end;
$fn$;

comment on function custom._merge_field_temporal_guard() is
  'DYN-19: a merge field that behaves temporally declares live, as-of or snapshot, and an as-of names WHICH CLOCK — world or recorded. A temporal block on a non-temporal merge field, and a moment named by a mode that never reads one, are both refused by name.';

create trigger custom_record_merge_field_temporal_guard
  before insert or update on custom.record
  for each row execute function custom._merge_field_temporal_guard();

create or replace function history.merge_field_resolve(p_organization_id uuid,
                                                       p_merge_field_id uuid,
                                                       p_record_id uuid,
                                                       p_key text)
returns table(value jsonb, record_id uuid, field_id uuid, value_version integer,
              clock text, at text)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_mf    jsonb;
  v_t     jsonb;
  v_mode  text;
  v_clk   text;
  v_data  jsonb;
  v_at    text;
begin
  select m.data into v_mf
    from custom.record m
   where m.organization_id = p_organization_id
     and m.id = p_merge_field_id
     and m.table_id = custom.merge_field_kernel_id();
  if v_mf is null then
    raise exception 'There is no merge field % in this organization.', p_merge_field_id
      using errcode = '02000';
  end if;

  v_t    := coalesce(v_mf -> 'temporal', jsonb_build_object('mode', 'live'));
  v_mode := coalesce(v_t ->> 'mode', 'live');
  v_clk  := v_t ->> 'clock';
  v_at   := v_t ->> 'at';

  if v_mode = 'as_of' and v_clk = 'recorded' then
    perform history.assert_watching('custom.record', v_at::timestamptz);
    v_data := (history.record_at(p_organization_id, p_record_id, v_at::timestamptz)) -> 'data';
    if v_data is null then
      raise exception 'This store held no record % on %.', p_record_id, v_at
        using errcode = '02000';
    end if;
  else
    select r.data into v_data
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
    if v_data is null then
      raise exception 'There is no record % in this organization.', p_record_id
        using errcode = '02000';
    end if;
  end if;

  -- DYNAMIC-VALUES §A: the prompt gets the rendered string, the RUN gets the triple
  -- (record id, field id, value version). Every debugging, audit and reproduction question
  -- is answerable only from the triple, so the triple is what this returns.
  return query
  select history.value_in_document(v_data, p_key,
                                   case when v_mode = 'as_of' and v_clk = 'world'
                                        then v_at::date end),
         p_record_id,
         (select f.id
            from custom.applicable_fields(p_organization_id,
                                          (select r.table_id from custom.record r
                                            where r.organization_id = p_organization_id and r.id = p_record_id),
                                          null) f
           where f.data ->> 'key' = p_key
           limit 1),
         coalesce((v_data -> '_values' -> p_key ->> 'ver')::integer, 1),
         case when v_mode = 'as_of' then v_clk else v_mode end,
         case when v_mode = 'as_of' then v_at end;
end;
$fn$;

comment on function history.merge_field_resolve(uuid, uuid, uuid, text) is
  'DYN-19: resolve a merge field''s value under its own temporal declaration — live, as of a world date, or as of a recorded moment — and return the resolution triple (record id, field id, value version) beside it, because the prompt gets the string and the run gets the triple.';
