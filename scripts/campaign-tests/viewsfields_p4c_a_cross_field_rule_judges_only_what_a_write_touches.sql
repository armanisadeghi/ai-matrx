-- LANE 10 VIEWS-AND-FIELDS, sublane P4, ROUND 4 — ASKED FROM THE OWNER'S SEAT (independent verifier V13).
-- Guard for migrations/campaign/viewsfields_p4c_a_cross_field_rule_judges_only_what_a_write_touches.sql (applied
-- after viewsfields_p4_… and viewsfields_p4b_…).
--
-- admin@admin.com, the owner of Cedar Ridge Physical Therapy, on its Patient Visit Tracker; writes as a person.
-- One transaction, rolled back.
--   C  "Different from" / "Same as" added over records that break them: an edit of only the title is kept;
--      an edit that makes the pair break the rule is still refused.
--   L  a change that only loosens a rule reads no record (custom._field_change_can_refuse); one that
--      tightens does.
--   X  rich text: every bypass V13 found refused, every false refusal it found kept (its own fixtures).
--   U  custom.field_update refuses a unit the kind cannot keep and "several" on a barcode, as declare does.
--   R  a value set aside by a change of kind names the Rule it failed.
--   B  a barcode refuses look-alike spaces and fullwidth digits.
-- THE VERDICT IS THE EXIT CODE: RED raises (psql exits 3 under ON_ERROR_STOP), GREEN exits 0.
--
-- RUN IT (dev clone only; rolled back), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/viewsfields_p4c_a_cross_field_rule_judges_only_what_a_write_touches.sql
\set ON_ERROR_STOP on
\set suite 'viewsfields_p4c_a_cross_field_rule_judges_only_what_a_write_touches.sql'
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
grant all on res to authenticated, service_role;
select set_config('t.me', '87a6e699-3622-4869-8843-d0867456c0dd', true),
       set_config('t.org', '0a54df90-eab8-4d07-ab29-81a45fb41e04', true),
       set_config('t.tracker', '031d3690-4a02-4cee-a575-454ffd96c992', true) \g /dev/null
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.me'), 'role', 'authenticated')::text, true),
       set_config('app.actor_tier', 'user', true) \g /dev/null

-- C: cross-field rules
do $$
declare o uuid := current_setting('t.org')::uuid; t uuid := current_setting('t.tracker')::uuid;
        fa uuid; fb uuid; fc uuid; r1 uuid; r2 uuid; m text;
begin
  fa := custom.field_declare(o, t, '{"label": "Treating therapist", "type": "text"}'::jsonb);
  fb := custom.field_declare(o, t, '{"label": "Supervising therapist", "type": "text"}'::jsonb);
  fc := custom.field_declare(o, t, '{"label": "Billing therapist", "type": "text"}'::jsonb);
  r1 := custom.record_write(o, t, '{"title": "Maya Okafor — week 5", "treating_therapist": "Dr. Lena Ortiz", "supervising_therapist": "Dr. Lena Ortiz", "billing_therapist": "Sam Patel"}'::jsonb);
  perform custom.field_update(o, fb, '{"rules": [{"kind": "differs_from_field", "value": "treating_therapist"}]}'::jsonb);
  perform custom.field_update(o, fc, '{"rules": [{"kind": "equals_field", "value": "treating_therapist"}]}'::jsonb);
  begin
    perform custom.record_update(o, r1, '{"title": "Maya Okafor — week 5 (seen)"}'::jsonb, null);
    insert into res values ('C a title edit is kept beside a pair that breaks "Different from" and "Same as"', true, 'saved');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('C a title edit is kept beside a pair that breaks "Different from" and "Same as"', false, m);
  end;
  begin
    perform custom.record_update(o, r1, '{"supervising_therapist": "Dr. Lena Ortiz", "treating_therapist": "Dr. Lena Ortiz", "billing_therapist": "Dr. Lena Ortiz"}'::jsonb, null);
    insert into res values ('C a write that keeps the pair the same is kept', true, 'saved');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('C a write that keeps the pair the same is kept', false, m);
  end;
  r2 := custom.record_write(o, t, '{"title": "Rosa Delgado — evaluation", "treating_therapist": "Sam Patel", "supervising_therapist": "Dr. Lena Ortiz", "billing_therapist": "Sam Patel"}'::jsonb);
  begin
    perform custom.record_update(o, r2, '{"supervising_therapist": "Sam Patel"}'::jsonb, null);
    insert into res values ('C a write that makes the pair break "Different from" is refused', false, 'saved');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('C a write that makes the pair break "Different from" is refused', m like 'Supervising therapist and treating_therapist have to be different%', m);
  end;
  begin
    perform custom.record_update(o, r2, '{"billing_therapist": "Dr. Lena Ortiz"}'::jsonb, null);
    insert into res values ('C a write that makes the pair break "Same as" is refused', false, 'saved');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('C a write that makes the pair break "Same as" is refused', m like 'Billing therapist and treating_therapist have to be the same%', m);
  end;
end $$;

-- L: only a change that can refuse a value reads the records
reset role;
do $$
declare c record; got boolean;
begin
  for c in select * from (values
    ('L a raised max reads no record', false, '{"rules": [{"kind": "max", "value": 10}]}'::jsonb, '{"rules": [{"kind": "max", "value": 15}]}'::jsonb),
    ('L a lowered min reads no record', false, '{"rules": [{"kind": "min", "value": 5}]}'::jsonb, '{"rules": [{"kind": "min", "value": 0}]}'::jsonb),
    ('L a longer length reads no record', false, '{"rules": [{"kind": "length", "value": "5"}]}'::jsonb, '{"rules": [{"kind": "length", "value": "50"}]}'::jsonb),
    ('L a removed rule reads no record', false, '{"rules": [{"kind": "pattern", "value": "^PT-"}]}'::jsonb, '{"rules": []}'::jsonb),
    ('L a new status group reads no record', false, '{"config": {"status_groups": {}}}'::jsonb, '{"config": {"status_groups": {"seen": "done"}}}'::jsonb),
    ('L a lowered max reads the records', true, '{"rules": [{"kind": "max", "value": 15}]}'::jsonb, '{"rules": [{"kind": "max", "value": 10}]}'::jsonb),
    ('L a new pattern reads the records', true, '{"rules": []}'::jsonb, '{"rules": [{"kind": "pattern", "value": "^PT-"}]}'::jsonb),
    ('L a new symbology reads the records', true, '{"config": {}}'::jsonb, '{"config": {"symbology": "ean13"}}'::jsonb)) x(label, want, was, now) loop
    begin
      execute 'select custom._field_change_can_refuse($1, $2)' into got using c.was, c.now;
      insert into res values (c.label, got = c.want, got::text);
    exception when others then
      insert into res values (c.label, false, sqlerrm);
    end;
  end loop;
end $$;
set local role authenticated;

-- X: rich text — V13's own fixtures
create temp table rich (label text, b64 text, want text) on commit drop;
grant all on rich to authenticated;
\i scripts/campaign-tests/viewsfields_p4c_rich_text_fixtures.sql
do $$
declare b record; r uuid; m text; body text;
begin
  perform custom.field_declare(current_setting('t.org')::uuid, current_setting('t.tracker')::uuid, '{"label": "Exercise notes", "type": "rich_text"}'::jsonb);
  r := custom.record_write(current_setting('t.org')::uuid, current_setting('t.tracker')::uuid, '{"title": "Theo Nakamura — shoulder"}'::jsonb);
  for b in select * from rich loop
    body := convert_from(decode(b.b64, 'base64'), 'UTF8');
    begin
      perform custom.record_update(current_setting('t.org')::uuid, r, jsonb_build_object('exercise_notes', body), null);
      insert into res values ('X ' || b.label, b.want = '-', 'kept');
    exception when others then get stacked diagnostics m = message_text;
      insert into res values ('X ' || b.label, b.want = 'refused' and m like 'Exercise notes %', m);
    end;
  end loop;
end $$;

-- U, R, B
do $$
declare o uuid := current_setting('t.org')::uuid; t uuid := current_setting('t.tracker')::uuid;
        f uuid; r uuid; m text; d jsonb; k text; v text;
begin
  for k, v in select * from (values ('Clinic address', 'address'), ('Pain stars', 'rating'), ('Plan phase', 'status')) x loop
    f := custom.field_declare(o, t, jsonb_build_object('label', k, 'type', v));
    begin
      perform custom.field_update(o, f, '{"unit": "km"}'::jsonb);
      insert into res values ('U a ' || v || ' refuses a unit', false, 'saved');
    exception when others then get stacked diagnostics m = message_text;
      insert into res values ('U a ' || v || ' refuses a unit', m = format('"%s" has no unit, so it cannot be kept in km.', k), m);
    end;
  end loop;
  f := custom.field_declare(o, t, '{"label": "Wristband code", "type": "barcode"}'::jsonb);
  begin
    perform custom.field_update(o, f, '{"multi": true}'::jsonb);
    insert into res values ('U a barcode refuses "several" in its settings', false, 'saved');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('U a barcode refuses "several" in its settings', m = '"Wristband code" holds one barcode per record, so it cannot hold several.', m);
  end;
  begin
    perform custom.field_declare(o, t, '{"label": "Spare band codes", "type": "barcode", "multi": true}'::jsonb);
    insert into res values ('U a barcode refuses "several" when declared', false, 'declared');
  exception when others then get stacked diagnostics m = message_text;
    insert into res values ('U a barcode refuses "several" when declared', m = '"Spare band codes" holds one barcode per record, so it cannot hold several.', m);
  end;
  -- R
  f := custom.field_declare(o, t, '{"label": "Progress share", "type": "number"}'::jsonb);
  r := custom.record_write(o, t, '{"title": "Grace Holloway — discharge", "progress_share": 140}'::jsonb);
  perform custom.field_update(o, f, '{"type": "percent"}'::jsonb);
  perform set_config('t.r_rec', r::text, true);
  -- B
  r := custom.record_write(o, t, '{"title": "Kofi Mensah — balance class"}'::jsonb);
  for k, v in select * from (values ('an em space', 'PT' || chr(8195) || '123'), ('an ideographic space', 'PT' || chr(12288) || '123'),
                                    ('a variation selector', 'PT' || chr(65039) || '123'), ('the Hangul filler', 'PT' || chr(12644) || '123'),
                                    ('the braille blank', 'PT' || chr(10240) || '123'), ('fullwidth digits', 'PT' || chr(65297) || chr(65298))) x loop
    begin
      perform custom.record_update(o, r, jsonb_build_object('wristband_code', v), null);
      insert into res values ('B a barcode refuses ' || k, false, 'kept');
    exception when others then get stacked diagnostics m = message_text;
      insert into res values ('B a barcode refuses ' || k, m like 'Wristband code is a barcode%', m);
    end;
  end loop;
end $$;
reset role;
insert into res
select 'R a value set aside by a change of kind names the Rule it failed',
       exists (select 1 from jsonb_array_elements(data -> '_retired') e
                where e ->> 'key' = 'progress_share' and e ->> 'reason' like 'Progress share cannot be more than 100 — %'),
       (data -> '_retired')::text
  from custom.record where id = current_setting('t.r_rec')::uuid;

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
