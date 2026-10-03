-- LANE 10 VIEWS-AND-FIELDS, sublane P4, ROUND 3 — ASKED FROM THE OWNER'S SEAT (independent verifier V11).
-- Guard for migrations/campaign/viewsfields_p4b_a_rule_that_tightens_never_locks_a_record.sql (applied after
-- viewsfields_p4_a_column_can_be_a_rating_a_duration_a_status_an_address_and_five_more.sql).
--
-- admin@admin.com, the owner of Cedar Ridge Physical Therapy, on its Patient Visit Tracker; writes declared
-- as a person (app.actor_tier = user) unless a check says otherwise. One transaction, rolled back.
--   T  every rule kind tightened (max, min, length, pattern, required, choices) and every change into url,
--      email, phone and percent: no record is left holding a value its column refuses, every one stays
--      editable, and what no longer fits is in `_retired` with its reason.
--   X  rich text: the V11 bypasses refused, the V11 false refusals kept.
--   W  plain refusals for a change into a Count and out of a column that fills itself in.
--   U  custom.field_update takes `max` with custom.field_declare's own refusals.
--   D  "4" carried into a Duration is four minutes.
--   A  a system-created record names who set it going; clearing a value names who cleared it.
--   S  a status choice sits in one group; after two choices swap their words, groups follow the key.
--   M  `multi` and `unit` a kind cannot keep are refused.
--   B  barcode: tag characters, annotation marks, no-break space, combining and private-use characters.
-- THE VERDICT IS THE EXIT CODE: RED raises (psql exits 3 under ON_ERROR_STOP), GREEN exits 0.
--
-- RUN IT (dev clone only; rolled back), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/viewsfields_p4b_a_rule_that_tightens_never_locks_a_record.sql
\set ON_ERROR_STOP on
\set suite 'viewsfields_p4b_a_rule_that_tightens_never_locks_a_record.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\set QUIET on
begin;
set local statement_timeout = '180s';
set local lock_timeout = '10s';

create temp table res (check_name text, ok boolean, detail text) on commit drop;
create temp table made (label text, field_id uuid, rec uuid, change jsonb) on commit drop;
grant all on res, made to authenticated, service_role;

select set_config('t.me', '87a6e699-3622-4869-8843-d0867456c0dd', true),
       set_config('t.org', '0a54df90-eab8-4d07-ab29-81a45fb41e04', true),
       set_config('t.tracker', '031d3690-4a02-4cee-a575-454ffd96c992', true) \g /dev/null

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.me'), 'role', 'authenticated')::text, true),
       set_config('app.actor_tier', 'user', true) \g /dev/null

-- T: declare, write, tighten
do $$
declare
  o uuid := current_setting('t.org')::uuid;
  t uuid := current_setting('t.tracker')::uuid;
  c record;
  fid uuid;
  rid uuid;
  m text;
begin
  for c in select * from (values
      ('Pain today',        '{"type": "rating", "max": 5}'::jsonb,                               '5'::jsonb,          '{"max": 3}'::jsonb),
      ('Pain floor',        '{"type": "number"}'::jsonb,                                          '-2'::jsonb,         '{"rules": [{"kind": "min", "value": 0}]}'::jsonb),
      ('Reps done',         '{"type": "number"}'::jsonb,                                          '25'::jsonb,         '{"rules": [{"kind": "max", "value": 10}]}'::jsonb),
      ('Short note',        '{"type": "text"}'::jsonb,                                            '"Long words here"'::jsonb, '{"rules": [{"kind": "length", "value": 5}]}'::jsonb),
      ('Chart code',        '{"type": "text"}'::jsonb,                                            '"XY-1"'::jsonb,     '{"rules": [{"kind": "pattern", "value": "^PT-"}]}'::jsonb),
      ('Insurer',           '{"type": "text"}'::jsonb,                                            null::jsonb,         '{"required": true}'::jsonb),
      ('Clinic room',       '{"type": "select", "options": ["Gym", "Pool", "Room 2"]}'::jsonb,   '"Pool"'::jsonb,     '{"options": ["Gym", "Room 2"]}'::jsonb),
      ('Referral site',     '{"type": "text"}'::jsonb,                                            '"not a link"'::jsonb, '{"type": "url"}'::jsonb),
      ('Referrer email',    '{"type": "text"}'::jsonb,                                            '"dr ortiz"'::jsonb, '{"type": "email"}'::jsonb),
      ('Referrer phone',    '{"type": "text"}'::jsonb,                                            '"call front desk"'::jsonb, '{"type": "phone"}'::jsonb),
      ('Progress share',    '{"type": "number"}'::jsonb,                                          '140'::jsonb,        '{"type": "percent"}'::jsonb)) s(label, spec, val, change)
  loop
    fid := custom.field_declare(o, t, c.spec || jsonb_build_object('label', c.label));
    rid := custom.record_write(o, t, jsonb_build_object('title', 'Census visit — ' || c.label)
             || case when c.val is null then '{}'::jsonb else jsonb_build_object(regexp_replace(lower(c.label), '[^a-z0-9]+', '_', 'g'), c.val) end);
    insert into made values (c.label, fid, rid, c.change);
  end loop;
  -- every column is declared and written first; then each one tightens
  for c in select * from made loop
    begin
      perform custom.field_update(o, c.field_id, c.change);
    exception when others then
      get stacked diagnostics m = message_text;
      insert into res values ('T ' || c.label || ' tightens', false, m);
    end;
  end loop;
end $$;
-- T, as the seat: every census record stays editable
do $$
declare c record; m text;
begin
  for c in select * from made loop
    begin
      perform custom.record_update(current_setting('t.org')::uuid, c.rec, jsonb_build_object('title', 'Census visit — ' || c.label || ' (seen)'), null);
      insert into res values ('T ' || c.label || ' record stays editable', true, 'saved');
    exception when others then
      get stacked diagnostics m = message_text;
      insert into res values ('T ' || c.label || ' record stays editable', false, m);
    end;
  end loop;
end $$;
-- T, as the owner: every value the column now refuses is in _retired, with its reason
reset role;
do $$
declare c record; d jsonb; f custom.record; m text;
begin
  for c in select * from made where label <> 'Insurer' loop
    select x.data into d from custom.record x where x.id = c.rec;
    select x.* into f from custom.record x where x.id = c.field_id;
    begin
      perform custom.validate_values(f.organization_id, array[f], d);
      insert into res values ('T ' || c.label || ' holds only what its column takes', true,
                              coalesce((select string_agg(e ->> 'reason', ' | ') from jsonb_array_elements(d -> '_retired') e), 'kept in place'));
    exception when others then
      get stacked diagnostics m = message_text;
      insert into res values ('T ' || c.label || ' holds only what its column takes', false, m);
    end;
  end loop;
  select x.data into d from custom.record x where x.id = (select rec from made where label = 'Pain today');
  insert into res values ('T a 5 under a top star of 3 is set aside with its reason',
    not (d ? 'pain_today') and exists (select 1 from jsonb_array_elements(d -> '_retired') e where e ->> 'key' = 'pain_today' and e ->> 'value' = '5'
                                         and e ->> 'reason' like 'Pain today changed what it accepts%'), (d -> '_retired')::text);
end $$;
set local role authenticated;

-- T: a record with no Insurer is still refused when a NEW record leaves it blank
do $$
declare m text;
begin
  perform custom.record_write(current_setting('t.org')::uuid, current_setting('t.tracker')::uuid, '{"title": "New intake, no insurer"}'::jsonb);
  insert into res values ('T a new record still needs the required Insurer', false, 'written');
exception when others then
  get stacked diagnostics m = message_text;
  insert into res values ('T a new record still needs the required Insurer', m like 'Insurer is required%', m);
end $$;
-- (Insurer goes back to optional, so the checks below can write new visits.)
do $$
begin
  perform custom.field_update(current_setting('t.org')::uuid, (select field_id from made where label = 'Insurer'), '{"required": false}'::jsonb);
end $$;

-- X: rich text
create temp table rich (label text, body text, want text) on commit drop;
grant all on rich to authenticated;
insert into rich values
  ('details ontoggle',      '<details open ontoggle=alert(1) x=`y`>',             'it was given HTML'),
  ('div onmouseover',       '<div onmouseover=alert(1) title=x=y >hover me',      'it was given HTML'),
  ('iframe srcdoc',         '<iframe srcdoc=a=b onload=alert(1)>',                'it was given HTML'),
  ('svg slash onload',      'see <svg/onload=alert(1)> here',                     'it was given HTML'),
  ('unclosed div',          E'<div\nonmouseover=alert(1)>x</div>',                'it was given HTML'),
  ('ref escaped bracket',   E'[c][a\\]b]\n\n[a\\]b]: javascript:alert(1)',        'a link that is not a web page'),
  ('ref two-line label',    E'[c][a\nb]\n\n[a\nb]: javascript:alert(1)',          'a link that is not a web page'),
  ('protocol-relative',     '[c](//evil.example/x)',                              'a link that is not a web page'),
  ('scheme past the start', '[c](javascript:alert(''https://cedarridgept.example''))', 'a link that is not a web page'),
  ('angle dest with space', '[c](<java script:alert(1)>)',                        'a link that is not a web page'),
  ('a<b and c>d',           'a<b and c>d',                                        ''),
  ('Press <Enter>',         'Press <Enter> to save',                              ''),
  ('code span',             'Use `<br>` for a break',                             ''),
  ('List<String>',          'Returns List<String> of names',                      ''),
  ('flexion',               'flexion <a few degrees',                             ''),
  ('fenced code',           E'```\n<script>alert(1)</script>\n```',               '');
create temp table richfield (fid uuid, rec uuid) on commit drop;
grant all on richfield to authenticated;
do $$
declare fid uuid; rid uuid;
begin
  fid := custom.field_declare(current_setting('t.org')::uuid, current_setting('t.tracker')::uuid, '{"label": "Home program notes", "type": "rich_text"}'::jsonb);
  rid := custom.record_write(current_setting('t.org')::uuid, current_setting('t.tracker')::uuid, '{"title": "Maya Okafor — week 4"}'::jsonb);
  insert into richfield values (fid, rid);
end $$;
do $$
declare b record; m text; rid uuid := (select rec from richfield);
begin
  for b in select * from rich loop
    begin
      perform custom.record_update(current_setting('t.org')::uuid, rid, jsonb_build_object('home_program_notes', b.body), null);
      insert into res values ('X ' || b.label, b.want = '', 'kept');
    exception when others then
      get stacked diagnostics m = message_text;
      insert into res values ('X ' || b.label, b.want <> '' and position(b.want in m) > 0, m);
    end;
  end loop;
end $$;

-- W, U, D, M: settings and changes of kind
do $$
declare o uuid := current_setting('t.org')::uuid; t uuid := current_setting('t.tracker')::uuid; f1 uuid; f2 uuid; f3 uuid; r uuid; m text; v jsonb;
begin
  f1 := custom.field_declare(o, t, '{"label": "Visit notes plain", "type": "text"}'::jsonb);
  begin
    perform custom.field_update(o, f1, '{"type": "count"}'::jsonb);
    insert into res values ('W a column cannot become a Count', false, 'changed');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('W a column cannot become a Count', m like 'A column cannot become a Count. Add a Count column instead%', m);
  end;
  f2 := custom.field_declare(o, t, '{"label": "Booked by staff", "type": "created_by"}'::jsonb);
  begin
    perform custom.field_update(o, f2, '{"type": "text"}'::jsonb);
    insert into res values ('W a column that fills itself in cannot become text', false, 'changed');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('W a column that fills itself in cannot become text', m like '"Booked by staff" fills itself in, so it cannot become another kind of column%', m);
  end;
  f3 := custom.field_declare(o, t, '{"label": "Effort felt", "type": "rating"}'::jsonb);
  begin
    perform custom.field_update(o, f3, '{"max": "7"}'::jsonb);
    insert into res values ('U field_update takes max', true, 'saved');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('U field_update takes max', false, m);
  end;
  begin
    perform custom.field_update(o, f3, '{"max": "ten"}'::jsonb);
    insert into res values ('U field_update refuses max "ten" like declare', false, 'saved');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('U field_update refuses max "ten" like declare', m like 'A rating goes up to a whole number of stars from 1 to 10, and "Effort felt" asks for "ten", which is not a number.', m);
  end;
  -- D
  f1 := custom.field_declare(o, t, '{"label": "Session length typed", "type": "text"}'::jsonb);
  r := custom.record_write(o, t, '{"title": "Rosa Delgado — evaluation", "session_length_typed": "4"}'::jsonb);
  perform custom.field_update(o, f1, '{"type": "duration"}'::jsonb);
  v := custom.read_record(o, r);
  insert into res values ('D "4" carried into a Duration is four minutes', v ->> 'session_length_typed' = '240', coalesce(v ->> 'session_length_typed', 'none'));
  -- M
  begin
    perform custom.field_declare(o, t, '{"label": "Mood stars", "type": "rating", "multi": true}'::jsonb);
    insert into res values ('M a rating holding several is refused', false, 'declared');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('M a rating holding several is refused', m like '"Mood stars" holds one rating per record, so it cannot hold several.', m);
  end;
  begin
    perform custom.field_declare(o, t, '{"label": "Billing address", "type": "address", "unit": "USD"}'::jsonb);
    insert into res values ('M an address with a unit is refused', false, 'declared');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('M an address with a unit is refused', m like '"Billing address" has no unit, so it cannot be kept in USD.', m);
  end;
end $$;

-- B: barcode
do $$
declare o uuid := current_setting('t.org')::uuid; t uuid := current_setting('t.tracker')::uuid; r uuid; k text; v text; m text;
begin
  perform custom.field_declare(o, t, '{"label": "Band code", "type": "barcode"}'::jsonb);
  r := custom.record_write(o, t, '{"title": "Theo Nakamura — shoulder"}'::jsonb);
  for k, v in select * from (values ('a tag character', 'PT' || chr(917569) || '123'), ('an annotation mark', 'PT' || chr(65529) || '123'),
                                    ('a no-break space', 'PT' || chr(160) || '123'), ('a combining mark', 'PT' || chr(769) || '123'),
                                    ('a private-use character', 'PT' || chr(57344) || '123')) x loop
    begin
      perform custom.record_update(o, r, jsonb_build_object('band_code', v), null);
      insert into res values ('B a barcode refuses ' || k, false, 'kept');
    exception when others then get stacked diagnostics m = message_text;
      insert into res values ('B a barcode refuses ' || k, m like 'Band code is a barcode%', m);
    end;
  end loop;
end $$;

-- S: status groups
do $$
declare o uuid := current_setting('t.org')::uuid; t uuid := current_setting('t.tracker')::uuid; f uuid; m text;
begin
  begin
    perform custom.field_declare(o, t, '{"label": "Visit stage draft", "type": "status", "options": ["Booked", "Arrived", "Seen"],
                                         "status_groups": {"todo": ["Booked", "Arrived"], "in_progress": ["Arrived"], "done": ["Seen"]}}'::jsonb);
    insert into res values ('S one choice in two groups is refused', false, 'declared');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('S one choice in two groups is refused', m like 'A status choice sits in one group, and "Arrived" is put in two.', m);
  end;
  f := custom.field_declare(o, t, '{"label": "Visit stage", "type": "status", "options": ["Booked", "Arrived", "Seen"],
                                    "status_groups": {"Booked": "todo", "Arrived": "in_progress", "Seen": "done"}}'::jsonb);
  perform set_config('t.stage', f::text, true);
end $$;
reset role;
select set_config('t.stage_opts', (select data -> 'config' ->> 'options_table_id' from custom.record where id = current_setting('t.stage')::uuid), true) \g /dev/null
select set_config('t.st_' || o.key, o.value ->> 'id', true)
  from jsonb_each(custom.choice_options(current_setting('t.org')::uuid, current_setting('t.stage_opts')::uuid)) o \g /dev/null
set local role authenticated;
do $$
declare m text;
begin
  -- the two choices swap their words
  perform custom.field_update(current_setting('t.org')::uuid, current_setting('t.stage')::uuid, jsonb_build_object('options', jsonb_build_array(
    jsonb_build_object('id', current_setting('t.st_booked'), 'words', 'Arrived'),
    jsonb_build_object('id', current_setting('t.st_arrived'), 'words', 'Booked'),
    jsonb_build_object('id', current_setting('t.st_seen'), 'words', 'Seen'))));
  begin
    perform custom.field_update(current_setting('t.org')::uuid, current_setting('t.stage')::uuid,
      jsonb_build_object('status_groups', jsonb_build_object(current_setting('t.st_seen'), 'todo', 'Seen', 'done')));
    insert into res values ('S two names for one choice in two groups are refused', false, 'saved');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('S two names for one choice in two groups are refused', m like 'The status "Visit stage" puts "Seen" in two groups%', m);
  end;
end $$;
reset role;
insert into res
select 'S after a swap of words the groups follow the key',
       data -> 'config' -> 'status_groups' = '{"booked": "todo", "arrived": "in_progress", "seen": "done"}'::jsonb,
       (data -> 'config' -> 'status_groups')::text
  from custom.record where id = current_setting('t.stage')::uuid;
set local role authenticated;

-- A: who wrote
do $$
declare o uuid := current_setting('t.org')::uuid; t uuid := current_setting('t.tracker')::uuid; r uuid; v jsonb;
begin
  perform custom.field_declare(o, t, '{"label": "Entered by", "type": "created_by"}'::jsonb);
  perform custom.field_declare(o, t, '{"label": "Changed by", "type": "modified_by"}'::jsonb);
  perform custom.field_declare(o, t, '{"label": "Front desk note", "type": "text"}'::jsonb);
  perform set_config('app.actor_tier', 'system', true);
  r := custom.record_write(o, t, '{"title": "Grace Holloway — discharge (from the booking page)", "front_desk_note": "Booked online"}'::jsonb);
  v := custom.read_record(o, r);
  insert into res values ('A a system-created record names who set it going', v -> 'entered_by' ->> 'actor' = 'system' and v -> 'entered_by' ->> 'id' = current_setting('t.me'), (v -> 'entered_by')::text);
  perform set_config('app.actor_tier', 'user', true);
  perform custom.record_update(o, r, '{"front_desk_note": null}'::jsonb, null);
  v := custom.read_record(o, r);
  insert into res values ('A clearing a value names who cleared it', v -> 'changed_by' ->> 'actor' = 'user' and v -> 'changed_by' ->> 'id' = current_setting('t.me'), (v -> 'changed_by')::text);
  perform set_config('t.cleared', r::text, true);
end $$;
reset role;
insert into res
select 'A the cleared value keeps an envelope stamped by whoever cleared it',
       coalesce(coalesce(jsonb_typeof(data -> 'front_desk_note'), 'null') = 'null' and data -> '_values' -> 'front_desk_note' ->> 'actor' = 'user'
                and (data -> '_values' -> 'front_desk_note' ->> 'ver')::int = 2, false),
       coalesce((data -> '_values' -> 'front_desk_note')::text, 'no envelope')
  from custom.record where id = current_setting('t.cleared')::uuid;
set local role authenticated;

reset role;
\set QUIET off
select ok, check_name, left(detail, 300) as detail from res order by ok nulls first, check_name;
do $$
declare n int; f text;
begin
  select count(*) filter (where ok is not true), string_agg(check_name, '; ') filter (where ok is not true) into n, f from res;
  if n > 0 then
    raise exception 'RED: % check(s) failed: %', n, f;
  end if;
  raise notice 'GREEN: % checks', (select count(*) from res);
end $$;
rollback;
