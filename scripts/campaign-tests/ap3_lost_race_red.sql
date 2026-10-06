-- AP-3 — RED TWIN of ap3_lost_race_green.sql: PROVES CLAUSE 2 (THE RACE) CAN FAIL.
--
-- Inside its own rolled-back transaction it puts custom.entity_row_write's OLD 0-row branch back —
-- the one that compared the PRE-READ version, as the body stood before migration
-- ap3_a_lost_race_is_a_stale_write_not_a_refusal — adds the same armed hook just before the UPDATE,
-- and runs the same race (test@test.com saves between admin@admin.com's read and her UPDATE). It
-- REQUIRES the loser to be answered 42501 "not yours to change", the defect (she owns the
-- organization and the green suite's clause 1 shows she saves at the right version, so 42501 here
-- comes only from the race). If the old body does
-- not misreport the race, the green suite's clause 2 is not testing what it claims, and this suite
-- fails. Ends in ROLLBACK; the live body is untouched.

\set suite 'ap3_lost_race_red.sql'
\set requires 'grant:authenticated:custom.entity_row_write|relation:projects.projects|row:iam.organization_member:organization_id = \'344cfaa8-2b0c-4971-854a-9694614816f2\' and user_id = \'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_owner  uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com, Holloway owner
  c_member uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, Holloway member
  c_org    uuid := '344cfaa8-2b0c-4971-854a-9694614816f2';  -- Holloway Creative
  c_hook_at text := '  -- LANE7-W4B[h1]: AN HR ROW';
  c_fixed  text := $f$    if p_expected_version is not null then
      execute format('select x.version from %I.%I x where x.id = $1', t.schema_name, t.table_name)
        into v_cur using p_record_id;
      if v_cur is distinct from p_expected_version and v_cur is not null then
        raise exception 'Someone changed this % since you read it (it is at version %, and you sent %). Nothing was written.',
          t.label, v_cur, p_expected_version
          using errcode = 'PT409', hint = 'Read it again, then send your change with the new version.';
      end if;
    end if;
$f$;
  c_old    text := $o$    if p_expected_version is not null and (v_row ->> 'version')::integer is distinct from p_expected_version then
      raise exception 'Someone changed this % since you read it (it is at version %, and you sent %). Nothing was written.',
        t.label, v_row ->> 'version', p_expected_version
        using errcode = 'PT409', hint = 'Read it again, then send your change with the new version.';
    end if;
$o$;
  v_boss   text := current_user;
  v_def    text; v_weak text;
  v_proj   uuid; v_ver int; v_st text; v_msg text;
begin
  perform set_config('app.actor_system', 'campaign.ap3_lost_race_red', true);

  -- the live body, with the old 0-row branch put back and the race hook before the UPDATE
  v_def := pg_get_functiondef('custom.entity_row_write(uuid,text,uuid,jsonb,jsonb,integer,boolean)'::regprocedure);
  if (length(v_def) - length(replace(v_def, c_fixed, ''))) / length(c_fixed) <> 1
     or (length(v_def) - length(replace(v_def, c_hook_at, ''))) / length(c_hook_at) <> 1 then
    raise exception 'red: the live body no longer carries the lost-race branch or the UPDATE marker this twin edits — update the twin';
  end if;
  v_weak := replace(replace(v_def, c_fixed, c_old), c_hook_at, $h$  if current_setting('campaign.race_armed', true) = 'on' then
    perform set_config('campaign.race_armed', 'off', true);
    perform set_config('request.jwt.claims', current_setting('campaign.race_winner'), true);
    perform custom.entity_row_write(null, p_token, p_record_id, current_setting('campaign.race_winner_columns')::jsonb, '{}'::jsonb, null, null);
    perform set_config('request.jwt.claims', current_setting('campaign.race_loser'), true);
  end if;
$h$ || c_hook_at);
  execute v_weak;

  perform set_config('campaign.race_winner', json_build_object('sub', c_member::text, 'role', 'authenticated')::text, true);
  perform set_config('campaign.race_loser', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('campaign.race_winner_columns', '{"description":"test@test.com: moved the shoot to Thursday."}', true);
  perform set_config('request.jwt.claims', current_setting('campaign.race_loser'), true);
  perform set_config('role', 'authenticated', true);
  v_proj := (custom.entity_row_write(c_org, 'project', null,
               '{"name":"Autumn catalog shoot","description":"Shot list for the autumn catalog."}'::jsonb,
               '{}'::jsonb, null, null) ->> 'id')::uuid;
  select version into v_ver from projects.projects where id = v_proj;
  perform set_config('campaign.race_armed', 'on', true);
  begin
    perform custom.entity_row_write(null, 'project', v_proj, '{"description":"admin: added the backup studio."}'::jsonb, '{}'::jsonb, v_ver, null);
    raise exception 'red: the loser of the race was written';
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
  end;
  if v_st <> '42501' then
    raise exception 'red: with the old 0-row branch the lost race answered % "%" instead of 42501 — the green clause 2 cannot fail', v_st, v_msg;
  end if;

  perform set_config('role', v_boss, true);
  raise notice 'ap3_lost_race_red: the old body told the race''s loser "%" (42501), as it must — green clause 2 is a real check', v_msg;
end $$;

rollback;
