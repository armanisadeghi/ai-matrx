-- LANE CHAIR-DOORS-2 j — A TABLE GIVES ITS NEW ROWS THEIR ROW CONTROLS, ASKED FROM THE MEMBER'S SEAT.
-- Guard for migrations/campaign/chairdoors2_j_a_table_gives_its_new_rows_their_row_controls.sql (Shown to; the
-- production half). The window half (Published to the web, Indexed) is chairdoors2_j_web_row_controls_from_the_member_seat.sql.
--
-- Every check runs as `authenticated` with test@test.com's claims (set local role — the grants are part of what is
-- proven). One transaction, rolled back; nothing is left behind.
--   1. In a Table she made (Visits, in an organization she owns): she sets "Shown to by default" = My team; a row
--      written through custom.record_write gets my_team, and so do both rows of a custom.record_write_many batch.
--   2. A Table that names no default: a new row keeps shown_to null (it follows the organization's default).
--   3. Per row: she overrides one row to Everyone through custom.record_row_controls_set; it sticks across an edit.
--   4. The rung: in Cedar Ridge Physical Therapy (member; editor on Patient Visits, which admin@admin.com made) she
--      is refused setting the Table's defaults (42501) and refused changing Shown to on admin's row (42501), and
--      the state doors say can_change = false.
--   5. Unknown keys are refused (22023), nothing written.
-- THE VERDICT IS THE EXIT CODE: RED raises (psql exits 3 under ON_ERROR_STOP), GREEN exits 0.
--
-- RUN IT (dev clone only; rolled back), session pooler:
--   cd matrx-frontend && psql "${CLONE_DATABASE_URL/:6543/:5432}" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/chairdoors2_j_row_controls_from_the_member_seat.sql
\set ON_ERROR_STOP on
\set suite 'chairdoors2_j_row_controls_from_the_member_seat.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\set QUIET on
begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';

create temp table res (check_name text, ok boolean, detail text) on commit drop;
grant all on res to authenticated, service_role;

select set_config('t.' || k, v, true) from (values
  ('me',       '4060701e-706a-4c76-b3ca-0bbc69fa5a14'),   -- test@test.com
  ('dry_run',  '9b8278c0-82b9-4034-9deb-1fc215522002'),   -- Cedar Ridge Physical Therapy – Referrals dry run (she owns it)
  ('visits',   'e1eb83b8-4f47-4961-b523-c2ab0fe6da0f'),   -- its Visits table
  ('cedar',    '0a54df90-eab8-4d07-ab29-81a45fb41e04'),   -- Cedar Ridge Physical Therapy (member)
  ('pvisits',  '4c6db6d1-de2c-4dc6-bf8e-f2cabbc27bc6')    -- its Patient Visits (editor; admin@admin.com made it)
) x(k, v) \g /dev/null
-- A row admin@admin.com wrote in Patient Visits, read as the owner before the seat is taken.
select set_config('t.admin_row', (select r.id::text from custom.record r
   where r.organization_id = current_setting('t.cedar')::uuid and r.table_id = current_setting('t.pvisits')::uuid
     and r.deleted_at is null and r.created_by = '87a6e699-3622-4869-8843-d0867456c0dd' order by r.created_at limit 1), true) \g /dev/null
-- A Table in her own organization that names no row defaults.
select set_config('t.plain', (select t.id::text from custom.record t
   where t.organization_id = current_setting('t.dry_run')::uuid and t.table_id = custom.table_kernel_id()
     and t.data_class = 'table' and t.deleted_at is null and t.id <> current_setting('t.visits')::uuid
     and not (t.data ? 'row_defaults') order by t.id limit 1), true) \g /dev/null

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.me'), 'role', 'authenticated')::text, true) \g /dev/null

do $$
declare
  v jsonb; v_id uuid; v_ids uuid[]; m text; c text;
  v_org uuid := current_setting('t.dry_run')::uuid;
  v_tab uuid := current_setting('t.visits')::uuid;
begin
  -- 1
  begin
    v := custom.table_row_defaults_set(v_org, v_tab, '{"shown_to": "my_team"}'::jsonb);
    insert into res values ('1 table default set by its maker', v ->> 'shown_to' = 'my_team' and (v ->> 'can_change')::boolean, v::text);
  exception when others then
    insert into res values ('1 table default set by its maker', false, sqlerrm);
  end;
  begin
    v_id := custom.record_write(v_org, v_tab, '{}'::jsonb);
    perform set_config('t.row1', v_id::text, true);
    v := custom.record_row_controls(v_org, v_id);
    insert into res values ('1 record_write row takes my_team', v #>> '{shown_to,value}' = 'my_team' and v #>> '{shown_to,table_default}' = 'my_team', v -> 'shown_to' ->> 'value');
    v_ids := custom.record_write_many(v_org, v_tab, array['{}'::jsonb, '{}'::jsonb]);
    insert into res values ('1 record_write_many rows take my_team',
      (select bool_and(custom.record_row_controls(v_org, x) #>> '{shown_to,value}' = 'my_team') from unnest(v_ids) x), array_to_string(v_ids, ','));
  exception when others then
    insert into res values ('1 rows take the table default', false, sqlerrm);
  end;
  -- 2
  begin
    v_id := custom.record_write(v_org, current_setting('t.plain')::uuid, '{}'::jsonb);
    v := custom.record_row_controls(v_org, v_id);
    insert into res values ('2 no table default: shown_to stays null', v #> '{shown_to,value}' = 'null'::jsonb, v -> 'shown_to' ->> 'value');
  exception when others then
    insert into res values ('2 no table default: shown_to stays null', false, current_setting('t.plain') || ': ' || sqlerrm);
  end;
  -- 3
  begin
    v_id := current_setting('t.row1')::uuid;
    v := custom.record_row_controls_set(v_org, v_id, '{"shown_to": "everyone"}'::jsonb);
    perform custom.record_update(v_org, v_id, '{"title": "Knee rehab follow-up"}'::jsonb);
    insert into res values ('3 override then an edit both land', true, 'ok');
  exception when others then
    insert into res values ('3 override then an edit both land', false, sqlerrm);
  end;
  begin
    v := custom.record_row_controls(v_org, current_setting('t.row1')::uuid);
    insert into res values ('3 per-row override sticks', v #>> '{shown_to,value}' = 'everyone' and v #>> '{shown_to,table_default}' = 'my_team', v -> 'shown_to' ->> 'value');
  exception when others then
    insert into res values ('3 per-row override sticks', false, sqlerrm);
  end;
  -- 4
  begin
    perform custom.table_row_defaults_set(current_setting('t.cedar')::uuid, current_setting('t.pvisits')::uuid, '{"shown_to": "only_me"}'::jsonb);
    insert into res values ('4 member without the rung cannot set the table default', false, 'written');
  exception when others then
    get stacked diagnostics m = message_text, c = returned_sqlstate;
    insert into res values ('4 member without the rung cannot set the table default', c = '42501', c || ' ' || m);
  end;
  begin
    v := custom.table_row_defaults(current_setting('t.cedar')::uuid, current_setting('t.pvisits')::uuid);
    insert into res values ('4 table state says can_change false', (v ->> 'can_change')::boolean is false, v ->> 'can_change');
  exception when others then
    insert into res values ('4 table state says can_change false', false, sqlerrm);
  end;
  begin
    perform custom.record_row_controls_set(current_setting('t.cedar')::uuid, current_setting('t.admin_row')::uuid, '{"shown_to": "only_me"}'::jsonb);
    insert into res values ('4 member without the rung cannot change a row''s Shown to', false, 'written');
  exception when others then
    get stacked diagnostics m = message_text, c = returned_sqlstate;
    insert into res values ('4 member without the rung cannot change a row''s Shown to', c = '42501', c || ' ' || m);
  end;
  begin
    v := custom.record_row_controls(current_setting('t.cedar')::uuid, current_setting('t.admin_row')::uuid);
    insert into res values ('4 row state says can_change false', (v #>> '{shown_to,can_change}')::boolean is false, v #>> '{shown_to,can_change}');
  exception when others then
    insert into res values ('4 row state says can_change false', false, sqlerrm);
  end;
  -- 5
  begin
    perform custom.table_row_defaults_set(v_org, v_tab, '{"colour": "red"}'::jsonb);
    insert into res values ('5 unknown key refused', false, 'written');
  exception when others then
    get stacked diagnostics c = returned_sqlstate;
    insert into res values ('5 unknown key refused', c = '22023', c);
  end;
end $$;

reset role;
select set_config('t.n', (select count(*) from res)::text, true) \g /dev/null
\set QUIET off
select check_name, ok, left(detail, 140) as detail from res order by check_name;
do $$
declare v_bad text;
begin
  select string_agg(check_name, '; ') into v_bad from res where not ok;
  if v_bad is not null or (select count(*) from res) < 10 then
    raise exception 'RED chairdoors2_j row controls: % (checks run: %)', coalesce(v_bad, 'too few checks'), (select count(*) from res);
  end if;
  raise notice 'GREEN chairdoors2_j row controls: % checks', (select count(*) from res);
end $$;
rollback;
