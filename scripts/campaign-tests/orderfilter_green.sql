-- LANE ORDER-FILTER — A FILTERED, HAND-ORDERED VIEW READS EXACTLY ITS ROWS, IN THEIR PLACES.
--
-- THE USE CASE (_gridprim_clinic.sql, grown to a season). Cedar Ridge Veterinary Clinic's day
-- sheet holds the whole autumn: 630 visits. Marisol Vega (test@test.com, the front desk, a
-- member) keeps a "Call-back list" view: the day sheet in the order she works it, placed by hand
-- (every visit positioned), filtered to the No-show visits — the owners she phones back. A second
-- question narrows it further as a Rule: the No-show CATS (the feline clinic day).
--
-- WHAT MAKES IT FAIL:
--   OF1 the OLD way (the grid before this lane: the order door's first 500 positions of the whole
--       table, then the filtered page kept) — measured and SAID, not asserted: it misorders the
--       No-shows placed past position 500 and reads hundreds of documents the view never shows.
--   OF2 the door asked the view's filter answers exactly the No-shows, in position order, page by
--       page (50 + the rest), each with its STORED position; no other visit is read.
--   OF3 a nested Rule (No-show AND Cat) answers exactly those, in position order.
--   OF4 the positions on the view's row are untouched — the hidden rows keep theirs.
--   OF5 nothing asked ({} and null) is the unfiltered door, unchanged.
--   OF6 the ladder stays inside: a stranger is refused; a flat filter on a column she may not
--       read (the restricted account balance) is refused by name, as the list door refuses it;
--       the documents are masked.
-- RED before the file (the door takes no filter: OF2 cannot even be asked), GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'orderfilter_green.sql'
\set requires 'function:custom.view_declare|function:custom.read_records_by_ids|function:custom.view_record_order_set'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '300s';
\i scripts/campaign-tests/_gridprim_clinic.sql

-- THE SEASON. 620 more visits, synthesized, through the same write door a person uses.
do $season$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_appts uuid;
  c_pets    constant text[] := array['Bailey','Luna','Cooper','Nala','Finn','Winnie','Gus','Mochi','Rosie','Otis',
                                     'Pickles','Sage','Bear','Clementine','Milo','Poppy','Ranger','Willow','Duke','Pip'];
  c_owners  constant text[] := array['Alvarez','Brandt','Chen','Donnelly','Estrada','Faulkner','Gupta','Halvorsen',
                                     'Iverson','Jaramillo','Kowalski','Lindgren','Moreau','Nwosu','Oyelaran','Pruitt'];
  c_species constant text[] := array['Dog','Cat','Dog','Cat','Rabbit','Dog','Bird','Cat'];
  c_status  constant text[] := array['Completed','Completed','Scheduled','Checked in','Completed','No-show','Completed','Scheduled','Completed'];
  i integer;
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  perform set_config('request.jwt.claims', c_admin_j, true);
  -- What the owner still owes the clinic — the billing office's, RESTRICTED: the front desk
  -- phones no-shows back but does not see balances (restricted: the table's admins only).
  perform custom.field_declare(v_org, v_appts, jsonb_build_object('key', 'account_balance', 'label', 'Account balance',
    'type', 'currency', 'unit', '$', 'sort', 90, 'sensitivity', 'restricted'));
  for i in 1..620 loop
    perform custom.record_write(v_org, v_appts, jsonb_build_object(
      'patient', c_pets[1 + (i * 7) % 20] || ' (' || c_owners[1 + (i * 3) % 16] || ')',
      'species', c_species[1 + i % 8],
      'visit_status', c_status[1 + i % 9],
      'visit_on', (date '2026-09-01' + (i % 90))::text,
      'visit_fee', 95 + (i * 37) % 320,
      'owner_phone', '(541) ' || lpad((200 + i % 700)::text, 3, '0') || '-' || lpad(((i * 53) % 10000)::text, 4, '0'),
      'account_balance', (i * 29) % 240));
  end loop;
end
$season$;

do $t$
declare
  c_dana_j     constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_org uuid; v_appts uuid; v_view uuid; f_status uuid; f_species uuid;
  v_all uuid[]; v_noshow uuid[]; v_truth uuid[]; v_cats uuid[];
  v_positions_before jsonb; v_positions_after jsonb;
  v_filter jsonb := '{"visit_status": "No-show"}';
  v_rule jsonb;
  v_old uuid[]; v_old_read integer; v_old_pos jsonb;
  v_p1 uuid[]; v_p2 uuid[]; v_pos numeric[]; v_n integer; v_bad integer;
  v_plain uuid[]; v_plain_new uuid[];
begin
  select v into v_org from gp where k = 'org'; select v into v_appts from gp where k = 'appts';
  select v into f_status from gp where k = 'f_status'; select v into f_species from gp where k = 'f_species';

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_view := custom.view_declare(v_org, v_appts, jsonb_build_object('name', 'Call-back list'));

  -- She places every visit, in the order she works the sheet (a fixed shuffle of the season).
  select array_agg(v order by md5(v::text)) into v_all
    from custom.query_visible_ids(v_org, v_appts, 'viewer') v;
  if cardinality(v_all) <> 630 then raise exception 'OF0: the season should be 630 visits, the desk sees %', cardinality(v_all); end if;
  perform custom.view_record_order_set(v_org, v_view, v_all);

  perform set_config('role', 'postgres', true);
  select metadata -> 'record_positions' into v_positions_before from platform.saved_view where id = v_view;
  perform set_config('role', 'authenticated', true);
  -- THE TRUTH, from the LIST door (the filter's own meaning, independent of the order door): every
  -- page of the No-shows, then put in the order of their STORED positions.
  v_rule := jsonb_build_object('op', 'and', 'args', jsonb_build_array(
    jsonb_build_object('op', 'eq', 'args', jsonb_build_array(jsonb_build_object('field', f_status), jsonb_build_object('const', 'No-show'))),
    jsonb_build_object('op', 'eq', 'args', jsonb_build_array(jsonb_build_object('field', f_species), jsonb_build_object('const', 'Cat')))));
  select array_agg(m.id order by (v_positions_before ->> m.id::text)::numeric) into v_truth
    from (select x.id from generate_series(0, 3) pg,
                 lateral custom.read_records_matching(v_org, v_appts, v_filter, false, 200, pg * 200) x) m;
  select array_agg(m.id order by (v_positions_before ->> m.id::text)::numeric) into v_cats
    from (select x.id from generate_series(0, 3) pg,
                 lateral custom.read_records_matching(v_org, v_appts, v_rule, false, 200, pg * 200) x) m;
  select count(*) into v_n from unnest(v_truth) t where (v_positions_before ->> t::text)::numeric > 500 * 1024;
  if cardinality(v_truth) < 60 or v_n = 0 or coalesce(cardinality(v_cats), 0) = 0 then
    raise exception 'OF0: the fixture must hold No-shows past position 500 (% No-shows, % past 500, % cats)', cardinality(v_truth), v_n, cardinality(v_cats);
  end if;

  -- OF1. THE OLD WAY, exactly as the grid did it: the list door's first page of the filter (50,
  -- newest first), put in the positions of the order door's first 500 rows of the WHOLE table.
  select array_agg(m.id order by m.ord) into v_old
    from (select x.id, row_number() over () as ord
            from custom.read_records_matching(v_org, v_appts, v_filter, false, 50, 0) x) m;
  select count(*), jsonb_object_agg(o.id::text, o.position) into v_old_read, v_old_pos
    from custom.read_records_in_view_order(v_org, v_view, false, 500, 0) o;
  select array_agg(u.id order by (v_old_pos ->> u.id::text)::numeric nulls last, u.ord) into v_old
    from unnest(v_old) with ordinality u(id, ord);
  select count(*) into v_bad from unnest(v_old) with ordinality u(id, ord)
   where u.id is distinct from v_truth[u.ord];
  raise notice 'OF1 (the old way, measured): page 1 read % documents for a 50-row page of % No-shows; % of its 50 rows are not the rows, or not in the place, the hand order puts there.',
    v_old_read + 50, cardinality(v_truth), v_bad;
  if v_bad = 0 then
    raise exception 'OF1: the fixture no longer shows the old way wrong — it proves nothing';
  end if;

  -- OF2. THE DOOR ASKED THE VIEW'S FILTER: exactly the No-shows, in place, paged.
  select array_agg(o.id order by o.ord), array_agg(o.position order by o.ord) into v_p1, v_pos
    from (select x.*, row_number() over () as ord
            from custom.read_records_in_view_order(v_org, v_view, false, 50, 0, v_filter) x) o;
  if v_p1 is distinct from v_truth[1:50] then
    raise exception 'OF2a: page 1 of the call-back list is not the first 50 No-shows in place (% of 50 differ)',
      (select count(*) from unnest(v_p1) with ordinality u(id, ord) where u.id is distinct from v_truth[u.ord]);
  end if;
  if exists (select 1 from unnest(v_p1, v_pos) u(id, pos) where pos is distinct from (v_positions_before ->> id::text)::numeric) then
    raise exception 'OF2b: a row came back with a position that is not the one stored for it';
  end if;
  select array_agg(o.id order by o.ord) into v_p2
    from (select x.*, row_number() over () as ord
            from custom.read_records_in_view_order(v_org, v_view, false, 500, 50, v_filter) x) o;
  if v_p2 is distinct from v_truth[51:] then
    raise exception 'OF2c: page 2 is not the rest of the No-shows in place (% rows, % expected)', cardinality(v_p2), cardinality(v_truth) - 50;
  end if;
  -- By name, the way PostgREST calls it.
  select count(*) into v_n from custom.read_records_in_view_order(p_organization_id => v_org, p_view_id => v_view,
         p_filter => v_filter, p_limit => 500, p_offset => 0);
  if v_n <> cardinality(v_truth) then raise exception 'OF2d: by name the door read % rows, % No-shows', v_n, cardinality(v_truth); end if;
  raise notice 'OF2 PASS — the call-back list reads exactly its % No-shows in their places, 50 then %, each with its stored position; no other visit read.', cardinality(v_truth), cardinality(v_truth) - 50;

  -- OF3. A NESTED RULE (the view's own `where`): No-show AND Cat.
  select array_agg(o.id order by o.ord) into v_p1
    from (select x.*, row_number() over () as ord
            from custom.read_records_in_view_order(v_org, v_view, false, 500, 0, v_rule) x) o;
  if v_p1 is distinct from v_cats then
    raise exception 'OF3: the Rule (No-show AND Cat) read % rows, % expected, in place: %', cardinality(v_p1), cardinality(v_cats), v_p1 = v_cats;
  end if;
  raise notice 'OF3 PASS — a nested Rule reads exactly its % No-show cats, in place.', cardinality(v_cats);

  -- OF4. The positions on the view's row are untouched.
  perform set_config('role', 'postgres', true);
  select metadata -> 'record_positions' into v_positions_after from platform.saved_view where id = v_view;
  perform set_config('role', 'authenticated', true);
  if v_positions_after is distinct from v_positions_before
     or (select count(*) from jsonb_object_keys(v_positions_after)) <> 630 then
    raise exception 'OF4: a filtered read changed the view''s positions';
  end if;
  raise notice 'OF4 PASS — every visit the filter hides keeps its stored position (630 of 630 unchanged).';

  -- OF5. Nothing asked is the unfiltered door.
  select array_agg(o.id order by o.ord) into v_plain
    from (select x.*, row_number() over () as ord from custom.read_records_in_view_order(v_org, v_view, false, 500, 0) x) o;
  select array_agg(o.id order by o.ord) into v_plain_new
    from (select x.*, row_number() over () as ord from custom.read_records_in_view_order(v_org, v_view, false, 500, 0, '{}'::jsonb) x) o;
  if v_plain is distinct from v_all[1:500] or v_plain_new is distinct from v_plain then
    raise exception 'OF5: the unfiltered door is not the whole hand order';
  end if;
  raise notice 'OF5 PASS — no filter (null or {}) reads the whole hand order, unchanged.';

  -- OF6. The ladder is inside.
  -- A flat question on a column she may not read is refused by the column's name — by the list
  -- door and by the order door alike ("the no-shows who owe $58" would answer the balance).
  begin
    perform custom.read_records_matching(v_org, v_appts, '{"account_balance": 58}'::jsonb, false, 50, 0);
    raise exception 'OF6a: the list door answered a filter on a column the desk may not read';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.read_records_in_view_order(v_org, v_view, false, 50, 0, '{"account_balance": 58}'::jsonb);
    raise exception 'OF6a: the order door answered a filter on a column the desk may not read';
  exception when insufficient_privilege then null;
  end;
  -- And the documents it does answer are masked as every read masks them.
  if exists (select 1 from custom.read_records_in_view_order(v_org, v_view, false, 50, 0, v_filter) x
              where x.document ->> 'account_balance' is not null and jsonb_typeof(x.document -> 'account_balance') <> 'object') then
    raise exception 'OF6c: the order door handed the desk an account balance';
  end if;
  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.read_records_in_view_order(v_org, v_view, false, 50, 0, v_filter);
    raise exception 'OF6b: a stranger read the call-back list';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OF6 PASS — a stranger is refused; a filter on the restricted balance is refused by name on both doors; no balance is handed out.';
  raise notice 'ORDERFILTER GREEN — every part passed.';
end $t$;
rollback;
