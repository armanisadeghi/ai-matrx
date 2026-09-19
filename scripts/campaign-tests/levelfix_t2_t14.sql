-- LEVEL-FIX — T2 (note on three records) AND T14'S SECOND HALF (the refusal below the floor),
-- re-asked on the MAIN database after the "viewer means viewer" fix.
--
-- T2 was the fifth independent pass's one FAIL: "the member saw the note before any share was
-- made, and a member can edit what she is shown". Both clauses were the same defect, so both are
-- re-asked here. T14's second half — "an organization attempting to set retention to ten days is
-- refused" — is the clause that pass could not ask, because `custom.history_retention_set` now
-- demands a table and it had none.
--
-- It runs against ONE throwaway organization and deletes it at the end; a census fails the run
-- unless every trace is gone. `admin@admin.com` is the author, `test@test.com` (Dana) is the
-- plain member, `arman@titaniumsuccess.com` (Sam) is the principal shared on nothing.
--
-- The organization is left at `shared_only`, which is what "Dana is a viewer on A ONLY" means:
-- a test whose subject is what a SHARE conveys cannot be run in an organization that shows
-- every member everything by default.

\set ON_ERROR_STOP on
\timing off

\set ORG   '\'1ef10000-0000-4a00-8a00-000000000e01\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''
\set SAM   '\'34ed4fc3-c527-4819-99bf-15c26603b261\''

begin;
set local statement_timeout = '600s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'levelfix_t2_t14', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from iam.content_lane where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from custom.field  where organization_id = :ORG;
delete from custom.io_outbox where organization_id = :ORG;
delete from custom.io_comment where organization_id = :ORG;
delete from custom.record_alias where organization_id = :ORG;
delete from custom.visibility_epoch where organization_id = :ORG;
delete from custom.organization_visibility_version where organization_id = :ORG;
delete from history.row_versions where organization_id = :ORG;
delete from history.migration_log where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'LEVELFIX T2 Throwaway', 'levelfix-t2-throwaway', 'LFT', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner',  'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active'),
       (:ORG, 'organization', :ORG, :SAM,   'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled',            'organization', :ORG, :ORG, 'true'::jsonb,          'LEVEL-FIX T2'),
       ('custom', 'member_default_visibility', 'organization', :ORG, :ORG, '"shared_only"'::jsonb, 'LEVEL-FIX T2');
commit;

-- ═══════════════════════════════════════ the three Tables, the three records and the note
begin;
set local statement_timeout = '600s';
select set_config('app.actor_system', 'levelfix_t2_t14', true);
-- 🚨 NO TEMPORARY TABLE. The main database is reached through the pooler in TRANSACTION mode,
-- so two transactions in one psql session are two different backends and a temp table created
-- in the first does not exist in the second. The ids live in the fixture's own HQ record, which
-- is a row every transaction can see, and are read back by name.
do $t$
declare
  v_org   constant uuid := '1ef10000-0000-4a00-8a00-000000000e01';
  v_korg  constant uuid := '11111111-0000-4000-8000-000000000004';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_hq uuid; v_tp uuid; v_tpe uuid; v_tc uuid; v_tn uuid;
  v_a uuid; v_b uuid; v_c uuid; v_note uuid;
begin
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, v_korg, 'record', jsonb_build_object('name', 'T2 HQ'), v_admin) returning id into v_hq;

  v_tp  := custom.table_declare(v_org, jsonb_build_object('name','Project','slug','t2_project',
    'label_singular','Project','label_plural','Projects','type','entity','display','list','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),'title_field','title',
    'parent_id', v_hq::text));
  v_tpe := custom.table_declare(v_org, jsonb_build_object('name','Person','slug','t2_person',
    'label_singular','Person','label_plural','People','type','entity','display','list','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),'title_field','title',
    'parent_id', v_hq::text));
  v_tc  := custom.table_declare(v_org, jsonb_build_object('name','Class','slug','t2_class',
    'label_singular','Class','label_plural','Classes','type','entity','display','list','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),'title_field','title',
    'parent_id', v_hq::text));
  v_tn  := custom.table_declare(v_org, jsonb_build_object('name','Note','slug','t2_note',
    'label_singular','Note','label_plural','Notes','type','entity','display','list','ordered',false,
    'weight','light','retention_days',30,'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),'title_field','title',
    'parent_id', v_hq::text));

  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, v_tp,  'record', jsonb_build_object('title','Project A'), v_admin) returning id into v_a;
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, v_tpe, 'record', jsonb_build_object('title','Person B'),  v_admin) returning id into v_b;
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, v_tc,  'record', jsonb_build_object('title','Class C'),   v_admin) returning id into v_c;
  -- "A note's parent is its author": the note hangs off the author's own HQ, not off A, B or C.
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, v_tn, 'record', jsonb_build_object('title','The note', 'parent_id', v_hq::text), v_admin)
  returning id into v_note;

  -- the three REFERENCED CARRYING relations
  perform custom.relation_carry(v_org, v_a, v_note);
  perform custom.relation_carry(v_org, v_b, v_note);
  perform custom.relation_carry(v_org, v_c, v_note);

  update custom.record set data = data || jsonb_build_object(
    'a', v_a::text, 'b', v_b::text, 'c', v_c::text, 'note', v_note::text, 'tn', v_tn::text)
   where organization_id = v_org and id = v_hq;
end $t$;
commit;

-- ═══════════════════════════════════════ T2, clause by clause
begin;
set local statement_timeout = '300s';
select set_config('app.actor_system', 'levelfix_t2_t14', true);
do $t$
declare
  v_org   constant uuid := '1ef10000-0000-4a00-8a00-000000000e01';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_sam   constant uuid := '34ed4fc3-c527-4819-99bf-15c26603b261';
  v_a uuid; v_c uuid; v_note uuid;
begin
  select (r.data ->> 'a')::uuid, (r.data ->> 'c')::uuid, (r.data ->> 'note')::uuid
    into v_a, v_c, v_note
    from custom.record r
   where r.organization_id = v_org and r.data ->> 'name' = 'T2 HQ';

  -- 1. BEFORE ANY SHARE, she does not see it. This is the fifth pass's `query_can_see` → true.
  if custom.has_visibility(v_dana, 'record', v_note, 'viewer'::public.permission_level) then
    raise exception 'T2 FAILED — the member saw the note before anybody shared anything.';
  end if;

  -- 2. Dana is a VIEWER ON A ONLY: she sees the note, and CANNOT EDIT IT.
  perform custom.share_grant(v_org, v_a, 'person', v_dana, 'viewer'::public.permission_level);
  if not custom.has_visibility(v_dana, 'record', v_note, 'viewer'::public.permission_level) then
    raise exception 'T2 FAILED — shared on A, she does not see the note it carries.';
  end if;
  if custom.has_visibility(v_dana, 'record', v_note, 'editor'::public.permission_level) then
    raise exception 'T2 FAILED — a VIEWER on A may EDIT the note A carries. This is the clause '
      'the fifth pass failed.';
  end if;

  -- 3. UNSHARE A: she loses it.
  perform custom.share_revoke(v_org, v_a, 'person', v_dana);
  if custom.has_visibility(v_dana, 'record', v_note, 'viewer'::public.permission_level) then
    raise exception 'T2 FAILED — A was unshared and she still sees the note.';
  end if;

  -- 4. SHARE C: she sees it again.
  perform custom.share_grant(v_org, v_c, 'person', v_dana, 'viewer'::public.permission_level);
  if not custom.has_visibility(v_dana, 'record', v_note, 'viewer'::public.permission_level) then
    raise exception 'T2 FAILED — shared on C, she does not see the note again.';
  end if;
  if custom.has_visibility(v_dana, 'record', v_note, 'editor'::public.permission_level) then
    raise exception 'T2 FAILED — a viewer on C may edit the note.';
  end if;

  -- 5. THE AUTHOR SEES IT THROUGHOUT.
  if custom.effective_level(v_admin, v_org, v_note, 'record') is distinct from 'admin'::public.permission_level then
    raise exception 'T2 FAILED — the author is at % on their own note.',
      coalesce(custom.effective_level(v_admin, v_org, v_note, 'record')::text, 'nothing');
  end if;

  -- 6. A PRINCIPAL SHARED ON NONE OF A, B, C OR THE AUTHOR DOES NOT SEE IT.
  if custom.has_visibility(v_sam, 'record', v_note, 'viewer'::public.permission_level) then
    raise exception 'T2 FAILED — a member shared on nothing at all sees the note.';
  end if;

  raise notice 'T2 PASSED — she sees it only through what carries it, she cannot edit it, '
    'unsharing takes it away, sharing another carrier brings it back, the author holds it '
    'throughout, and a principal shared on nothing does not see it.';
end $t$;
commit;

-- ═══════════════════════════════════════ T14, second half: the refusal below the floor
begin;
set local statement_timeout = '300s';
select set_config('app.actor_system', 'levelfix_t2_t14', true);
do $t$
declare
  v_org constant uuid := '1ef10000-0000-4a00-8a00-000000000e01';
  v_tn  uuid;
  v_msg text;
begin
  select (r.data ->> 'tn')::uuid into v_tn
    from custom.record r
   where r.organization_id = v_org and r.data ->> 'name' = 'T2 HQ';
  -- The Table is LIGHT and sits at the thirty-day floor. Ten days is below it.
  begin
    perform custom.history_retention_set(v_org, v_tn, 10);
    raise exception 'T14 FAILED — the organization set retention to ten days on a light Table '
      'whose floor is thirty.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'T14 FAILED%' then raise; end if;
    if v_msg !~* '(30|thirty|floor|less|below|minimum)' then
      raise exception 'T14 FAILED — it was refused, but the sentence does not say what the floor '
        'is or why: %', v_msg;
    end if;
    raise notice 'T14 (second half) PASSED — ten days is refused and the refusal says why: %', v_msg;
  end;
  -- and the floor itself still takes.
  perform custom.history_retention_set(v_org, v_tn, 45);
  raise notice 'T14 (second half) PASSED — and forty-five days is accepted, so the refusal is a '
    'floor and not a wall.';
end $t$;
commit;

-- ═══════════════════════════════════════ teardown, and the census of it
begin;
set local statement_timeout = '600s';
select set_config('app.actor_system', 'levelfix_t2_t14', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from iam.content_lane where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from custom.field  where organization_id = :ORG;
delete from custom.io_outbox where organization_id = :ORG;
delete from custom.io_comment where organization_id = :ORG;
delete from custom.record_alias where organization_id = :ORG;
delete from custom.visibility_epoch where organization_id = :ORG;
delete from custom.organization_visibility_version where organization_id = :ORG;
delete from history.row_versions where organization_id = :ORG;
delete from history.migration_log where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;
commit;

do $t$
declare v_n int;
begin
  select (select count(*) from custom.record where organization_id = '1ef10000-0000-4a00-8a00-000000000e01')
       + (select count(*) from iam.organizations where id = '1ef10000-0000-4a00-8a00-000000000e01')
    into v_n;
  if v_n <> 0 then raise exception 'TEARDOWN FAILED — % trace(s) left behind.', v_n; end if;
  raise notice 'TEARDOWN PASSED — census zero. T2 AND T14 SECOND HALF BOTH PASSED.';
end $t$;
