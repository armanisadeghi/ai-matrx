-- AP-3 — A LOST RACE IS A STALE WRITE, NOT A REFUSAL (custom.entity_row_write).
--
-- THE USE CASE (no fake data): Holloway Creative, a small agency whose owner is admin@admin.com and
-- whose one member is test@test.com — the pair the Applets acceptance uses to edit the same record
-- at once. Both open the project "Autumn catalog shoot" at the same version. test@test.com saves
-- first; admin@admin.com saves a moment later with the version she read. She must be told
-- "Someone changed this Project since you read it" (PT409), never "it is not yours to change"
-- (42501): she owns the organization.
--
-- THE DEFECT (fixed live by migration ap3_a_lost_race_is_a_stale_write_not_a_refusal, 2026-10-06):
-- the door pre-reads the row, then runs UPDATE … and version = <expected>. When the other writer
-- commits between the two, the UPDATE matches 0 rows, and the 0-row branch compared the PRE-READ
-- version — still the expected one — so it fell through to 42501. The fix reads the row's CURRENT
-- version in a fresh statement on 0 rows.
--
-- HOW THE RACE IS FORCED IN ONE SESSION. A psql suite has one connection, so the interleaving is
-- placed exactly where a concurrent commit lands: inside this rolled-back transaction the live body
-- is re-created with ONE armed hook immediately before its UPDATE (after the pre-read). When armed,
-- the hook disarms itself, takes test@test.com's seat and saves her change through the same door,
-- then hands the seat back. The loser's UPDATE then sees the winner's row (a new statement in READ
-- COMMITTED sees everything committed before it — here, everything written before it), exactly as
-- it would after a real concurrent commit. The live race itself (an MCP session holding the row lock,
-- a PostgREST call as admin@admin.com waiting on it) was run red and green on 2026-10-06.
--
-- 1 · NO REGRESSION (unhooked body): the right version saves; a wrong version is PT409; a person
--     the project is shared with as a viewer is 42501, with and without a version; an archive saves.
-- 2 · THE RACE: the loser is PT409, naming the winner's version (one past the one she read) and the
--     one she sent. That version number is the proof the winner's save landed between her read and
--     her UPDATE: the loser's failed call is a subtransaction, so the winner's write and the hook's
--     own flag are undone with it and cannot be read back afterwards.
--
-- RED TWIN: ap3_lost_race_red.sql puts the old 0-row branch back and requires the same race to
-- answer 42501. Ends in ROLLBACK; leaves nothing behind.

\set suite 'ap3_lost_race_green.sql'
\set requires 'grant:authenticated:custom.entity_row_write|grant:authenticated:public.share_resource_with_user|relation:projects.projects|row:iam.organization_member:organization_id = \'344cfaa8-2b0c-4971-854a-9694614816f2\' and user_id = \'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_owner  uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com, Holloway owner
  c_member uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, Holloway member
  c_viewer uuid := 'ab94c16c-b4a5-49f0-a068-e2a11db34a2c';  -- marcus.tillman@fixtures.aimatrx.com (not a Holloway member)
  c_org    uuid := '344cfaa8-2b0c-4971-854a-9694614816f2';  -- Holloway Creative
  c_hook_at text := '  -- LANE7-W4B[h1]: AN HR ROW';
  v_boss   text := current_user;
  v_def    text; v_hooked text;
  v_proj   uuid; v_ver int; v_st text; v_msg text;
begin
  perform set_config('app.actor_system', 'campaign.ap3_lost_race_green', true);
  v_def := pg_get_functiondef('custom.entity_row_write(uuid,text,uuid,jsonb,jsonb,integer,boolean)'::regprocedure);
  if position('A LOST RACE IS A STALE WRITE' in v_def) = 0 then
    raise exception '0: the live custom.entity_row_write does not carry the AP-3 lost-race branch';
  end if;

  -- the fixture: a project made through the store's own door, as the owner
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_proj := (custom.entity_row_write(c_org, 'project', null,
               '{"name":"Autumn catalog shoot","description":"Shot list for the autumn catalog."}'::jsonb,
               '{}'::jsonb, null, null) ->> 'id')::uuid;

  -- ══ 1 · NO REGRESSION ════════════════════════════════════════════════════════════════════
  select version into v_ver from projects.projects where id = v_proj;
  perform custom.entity_row_write(null, 'project', v_proj, '{"description":"Shot list, v2."}'::jsonb, '{}'::jsonb, v_ver, null);
  if (select version from projects.projects where id = v_proj) <> v_ver + 1 then
    raise exception '1a: a save at the right version did not move the version';
  end if;
  begin
    perform custom.entity_row_write(null, 'project', v_proj, '{"description":"Shot list, stale."}'::jsonb, '{}'::jsonb, v_ver, null);
    raise exception '1b: a save at a stale version was written';
  exception when sqlstate 'PT409' then null;
  end;
  perform public.share_resource_with_user('project', v_proj, c_viewer, 'viewer');
  select version into v_ver from projects.projects where id = v_proj;
  perform set_config('request.jwt.claims', json_build_object('sub', c_viewer::text, 'role', 'authenticated')::text, true);
  if not exists (select 1 from projects.projects where id = v_proj) then
    raise exception '1c: the viewer share did not let Marcus read the project, so the 42501 clause tests nothing';
  end if;
  begin
    perform custom.entity_row_write(null, 'project', v_proj, '{"description":"Viewer edit."}'::jsonb, '{}'::jsonb, v_ver, null);
    raise exception '1c: a viewer saved a change';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform custom.entity_row_write(null, 'project', v_proj, '{"description":"Viewer edit."}'::jsonb, '{}'::jsonb, null, null);
    raise exception '1d: a viewer saved a change without a version';
  exception when sqlstate '42501' then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform custom.entity_row_write(null, 'project', v_proj, '{}'::jsonb, '{}'::jsonb, v_ver, true);
  if (select deleted_at from projects.projects where id = v_proj) is null then
    raise exception '1e: an archive at the right version did not archive';
  end if;
  select version into v_ver from projects.projects where id = v_proj;
  perform custom.entity_row_write(null, 'project', v_proj, '{}'::jsonb, '{}'::jsonb, v_ver, false);

  -- ══ 2 · THE RACE ═════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  if (length(v_def) - length(replace(v_def, c_hook_at, ''))) / length(c_hook_at) <> 1 then
    raise exception '2: the spot just before the UPDATE is not found exactly once — update this suite';
  end if;
  v_hooked := replace(v_def, c_hook_at, $h$  if current_setting('campaign.race_armed', true) = 'on' then
    perform set_config('campaign.race_armed', 'off', true);
    perform set_config('request.jwt.claims', current_setting('campaign.race_winner'), true);
    perform custom.entity_row_write(null, p_token, p_record_id, current_setting('campaign.race_winner_columns')::jsonb, '{}'::jsonb, null, null);
    perform set_config('request.jwt.claims', current_setting('campaign.race_loser'), true);
  end if;
$h$ || c_hook_at);
  execute v_hooked;

  perform set_config('campaign.race_winner', json_build_object('sub', c_member::text, 'role', 'authenticated')::text, true);
  perform set_config('campaign.race_loser', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('campaign.race_winner_columns', '{"description":"test@test.com: moved the shoot to Thursday."}', true);
  perform set_config('request.jwt.claims', current_setting('campaign.race_loser'), true);
  perform set_config('role', 'authenticated', true);
  select version into v_ver from projects.projects where id = v_proj;
  perform set_config('campaign.race_armed', 'on', true);
  begin
    perform custom.entity_row_write(null, 'project', v_proj, '{"description":"admin: added the backup studio."}'::jsonb, '{}'::jsonb, v_ver, null);
    raise exception '2: the loser of the race was written';
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text;
  end;
  if v_st <> 'PT409' then
    raise exception '2: the loser of a race was answered % "%" instead of the stale-write refusal PT409', v_st, v_msg;
  end if;
  if position(format('it is at version %s, and you sent %s', v_ver + 1, v_ver) in v_msg) = 0 then
    raise exception '2: the PT409 sentence does not name the winner''s version: %', v_msg;
  end if;

  perform set_config('role', v_boss, true);
  raise notice 'ap3_lost_race_green: no regression (right version, stale version, viewer, archive), and the lost race is PT409: %', v_msg;
end $$;

rollback;
