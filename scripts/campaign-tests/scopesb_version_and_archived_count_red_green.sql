-- LANE 9 SCOPES-ON-THE-STORE — CHAIR RULINGS 2 AND 4 (2026-10-02 13:20 PT), measured RED then GREEN on the dev
-- clone (migrations/campaign/scopesb_a_scope_value_shows_the_version_a_person_made.sql).
--
-- THE USE CASE (admin@admin.com's test firm and workspace on the clone; everything rolled back):
--   Castellano & Reyes, LLP — four matter values a person set and the copy later rewrote (the workers'
--   compensation team, a target date, the official QME report kept as a file, a second team list).
--   admin's Workspace — two archived suppliers under the archived "Suppliers" scope type.
--
-- WHAT MAKES IT FAIL:
--   G2  custom.context_values answers a value's `version` other than the version a PERSON made — the
--       oracle is the old image table (context.context_item_values: one row per person write, the scope
--       door still writes it), never the door itself. The four values carry system rewrites (store ver
--       3, 2, 4, 1 against a person's 1, 1, 3, 2), so a door that answers the stamp's ver is RED.
--   G2b a person's write through the scope door (custom.context_value_write) moves the shown version by
--       exactly one — the image row the write made is the oracle — and `store_version` keeps the store's
--       own counter (old ver + 1). Its expected value differs from G2's, so a constant cannot pass both.
--   G4  custom.context_archived_types' archived_scope_count is not what the data home's archive
--       (custom.read_records_archived) answers the same person for that type. Planted: Harbor Freight Tools
--       (archived, created by admin) made "Only me" — test@test.com, a member, must count 1, its owner
--       admin@admin.com 2.
-- RED on the bodies of 2026-10-02 (G2 4 cells, G2b, G4 test seat); GREEN after. Rolled back.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesb_version_and_archived_count_red_green.sql'
\set expect 'clone'
\set requires 'function:custom.context_values|function:custom.context_archived_types|function:custom.read_records_archived'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '300s';

do $guard$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_test    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_firm    constant uuid := '7cd12da2-2213-4378-8fba-a9e2dc4ea657';   -- Castellano & Reyes, LLP
  c_ws      constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace
  c_supp    constant uuid := '5b994de2-c8b0-4d79-8c35-0f87731fe9e4';   -- archived "Suppliers" type
  c_harbor  constant uuid := '4be6a932-e2c5-4eef-823f-4bf65ce35dc6';   -- Harbor Freight Tools (archived)
  c_team    constant uuid := '5f7a90b5-42ff-45e5-b6c7-5f1a70f37a81';   -- Workers' Compensation (scope)
  c_members constant uuid := 'a7fd8e90-7a39-499b-9683-13df9459f3bc';   -- its team_members item
  v_fail    text[] := '{}';
  v_cell    record;
  v_ans     jsonb;
  v_row     jsonb;
  v_before  integer;
  v_write   jsonb;
  v_img     integer;
  v_seat    record;
  v_count   integer;
  v_door    integer;
begin
  -- ── the oracles, read as the owner before any seat is taken ─────────────────────────────────────────
  create temp table g2_oracle on commit drop as
    select v.id, v.scope_id, v.context_item_id, v.version as person_version,
           (r.data -> '_values' -> ci.key ->> 'ver')::int as store_ver
      from context.context_item_values v
      join context.context_items ci on ci.id = v.context_item_id
      join custom.record r on r.id = v.scope_id
     where v.is_current
       and v.id in ('fc35370e-ae52-4e99-9598-752e94b02eda', 'ab9a65bb-8b2a-4107-9284-fe4d4a1ea786',
                    'e0e0e088-a7ed-48be-9908-5fe1102b4b93', '6128f08c-0e07-4715-8076-d8a81e30cd3c');
  if (select count(*) from g2_oracle) <> 4
     or not exists (select 1 from g2_oracle where store_ver <> person_version) then
    raise exception 'UNMEASURED: the four Castellano & Reyes values (or a system rewrite among them) are not on this clone';
  end if;
  grant select on g2_oracle to authenticated;

  -- G4's plant: Harbor Freight Tools becomes "Only me" for its creator, admin@admin.com.
  update custom.record set visibility = 'personal'
   where organization_id = c_ws and id = c_harbor and created_by = c_admin and deleted_at is not null;
  if not found then
    raise exception 'UNMEASURED: Harbor Freight Tools is not an archived scope admin@admin.com created on this clone';
  end if;

  -- ── G2: the shown version is the person's, as admin@admin.com ─────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_ans := custom.context_values(array(select distinct scope_id from g2_oracle));
  for v_cell in select * from g2_oracle loop
    select x into v_row from jsonb_array_elements(v_ans) x
     where x ->> 'value_id' = v_cell.id::text limit 1;
    if v_row is null then
      v_fail := v_fail || format('G2 %s: the door answered no cell', left(v_cell.id::text, 8));
    elsif (v_row ->> 'version')::int is distinct from v_cell.person_version then
      v_fail := v_fail || format('G2 %s: version %s, a person made %s', left(v_cell.id::text, 8),
                                 v_row ->> 'version', v_cell.person_version);
    end if;
  end loop;

  -- ── G2b: a person's write moves the shown version by one; the store keeps its own counter ───────────
  v_before := (select store_ver from g2_oracle where scope_id = c_team);
  v_write := custom.context_value_write(jsonb_build_object(
    'scope_id', c_team, 'context_item_id', c_members, 'source_type', 'manual',
    'value_text', E'```matrx\n{"kind": "reference", "type": "scope", "items": [{"id": "0cb16e97-e146-406f-a517-7f45d7618508", "label": "Tomas Reyes"}], "matrx_version": 1}\n```'));
  if coalesce(v_write ->> 'ok', 'false') <> 'true' or v_write ->> 'writer' <> 'store' then
    v_fail := v_fail || format('G2b: the scope door refused the write: %s', v_write::text);
  else
    v_img := (v_write -> 'data' ->> 'version')::int;     -- the image row this person write made
    select x into v_row from jsonb_array_elements(custom.context_values(array[c_team])) x
     where x ->> 'context_item_id' = c_members::text limit 1;
    if (v_row ->> 'version')::int is distinct from v_img then
      v_fail := v_fail || format('G2b: version %s after one person write, the write made %s', v_row ->> 'version', v_img);
    end if;
    if (v_row ->> 'store_version')::int is distinct from v_before + 1 then
      v_fail := v_fail || format('G2b: store_version %s, the store counter was %s before the write',
                                 coalesce(v_row ->> 'store_version', 'absent'), v_before);
    end if;
  end if;
  execute 'reset role';

  -- ── G4: each seat's count is what the data home's archive shows that seat ─────────────────────────
  for v_seat in select * from (values (c_test, 1, 'test@test.com'), (c_admin, 2, 'admin@admin.com')) s(uid, want, who) loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_seat.uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select (x ->> 'archived_scope_count')::int into v_count
      from jsonb_array_elements(custom.context_archived_types(c_ws)) x where x ->> 'id' = c_supp::text;
    select count(*) into v_door from custom.read_records_archived(c_ws, c_supp, 'org', false, 1000, 0);
    if v_door <> v_seat.want then
      v_fail := v_fail || format('G4 UNMEASURED %s: the archive door shows %s suppliers, the plant needs %s', v_seat.who, v_door, v_seat.want);
    elsif v_count is distinct from v_door then
      v_fail := v_fail || format('G4 %s: archived_scope_count %s, the data home''s archive shows %s',
                                 v_seat.who, coalesce(v_count::text, 'absent'), v_door);
    end if;
    execute 'reset role';
  end loop;

  if cardinality(v_fail) > 0 then
    raise exception 'RED (%): %', cardinality(v_fail), array_to_string(v_fail, ' | ');
  end if;
  raise notice 'GREEN: G2 4 cells, G2b one person write, G4 two seats';
end
$guard$;

rollback;
