-- LADDER-CAP — THE GREEN SUITE. THE MOST SPECIFIC GRANT ADDRESSED TO A PERSON DECIDES HER LEVEL.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/laddercap_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/` and is discovered
-- by no sweep. Its red twin is `laddercap_red.sql`.
--
-- WHAT IT PROVES. `levelfix_green.sql` PART 5b went red the day LEVEL-FIX landed: an
-- organization at its shipped default, a plain member deliberately shared ONE record at VIEWER,
-- and the store answered EDITOR — because the walk climbed to the TABLE the record lives in,
-- where no grant is addressed to her, and read the ORGANIZATION'S OWN default there as "and
-- therefore every row inside it".
--
-- PART 1 IS THE CENSUS OF THE WHOLE RULE, not of that one arm: every one of the FOUR content
-- levels against every rung that can be addressed to a person —
--
--     RUNG 1  a grant on the record itself
--     RUNG 2  a grant on the TABLE the record lives in
--     RUNG 3  a grant on a HOME of the subject
--     RUNG 5  the organization's own `custom/member_default_level`
--
-- — sixteen cases, each one built with EVERY LESS SPECIFIC RUNG SET TO `admin`, which is the
-- most tempting raise the system can offer. The answer must be the level of the most specific
-- rung addressed to her, and nothing above it. RUNG 4, containment carry, is addressed to nobody
-- and is what PART 2 asks about separately: it must ADD reach and never a level.
--
-- EVERY ASSERTED CLAUSE RUNS AS `authenticated` CARRYING HER CLAIMS, through `custom.my_level`
-- and `custom.share_grant` — the doors a browser reaches. The fixture writes step OUT and say so.
--
-- THE IDENTITIES. `admin@admin.com` owns the throwaway organization; `test@test.com` (Dana) is a
-- plain MEMBER of it. Nobody's own records are touched. It signs nobody in and reads no credential.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'laddercap_green.sql'
\set requires 'relation:custom.io_outbox'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\set ORG    '\'1ef1ca00-0000-4a00-8a00-000000000c01\''
\set ADMIN  '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA   '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''
\set HQ     '\'1ef1ca00-0000-4a00-8a00-000000000c11\''
\set TBL    '\'1ef1ca00-0000-4a00-8a00-000000000c21\''
\set REC    '\'1ef1ca00-0000-4a00-8a00-000000000c31\''

-- ══════════════════════════════════════════════ STEP 0 — a clean slate
begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'laddercap_green_suite', true);
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
values (:ORG, 'LADDERCAP Green Throwaway', 'laddercap-green-throwaway', 'LCG', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner',  'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active');
-- THE STORE SWITCH, and nothing else yet. PART 1 sets `custom/member_default_level` per case.
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled', 'organization', :ORG, :ORG, 'true'::jsonb, 'LADDER-CAP green suite');
commit;

-- The Table, its Home, and one record — built through the store's own door, as the owner.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'laddercap_green_suite', true);
do $t$
declare
  v_org   constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c01';
  v_korg  constant uuid := '11111111-0000-4000-8000-000000000004';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_hq    constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c11';
  v_tbl   constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c21';
  v_rec   constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c31';
  t uuid;
begin
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_org, v_korg, 'record', jsonb_build_object('name', 'LADDERCAP Green HQ'), v_admin);

  t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Case', 'slug', 'laddercap_green_case', 'label_singular', 'Case', 'label_plural', 'Cases',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq::text));
  if t is distinct from v_tbl then
    update custom.record set id = v_tbl where organization_id = v_org and id = t;
    update custom.record set data = data || jsonb_build_object('entity_definition_id', v_tbl::text)
     where organization_id = v_org and table_id = custom.field_kernel_id()
       and (data ->> 'entity_definition_id')::uuid = t;
    update custom.field set entity_definition_id = v_tbl where organization_id = v_org and entity_definition_id = t;
    -- AND THE CARRYING EDGE, which is what makes HQ a real HOME of this Table (rung 3). Without
    -- this the `contains` association still points at the id table_declare generated and
    -- `custom.visibility_ancestors` returns nothing, so PART 1's home cases would assert on a
    -- rung that does not exist.
    update platform.associations set target_id = v_tbl
     where organization_id = v_org and target_type = 'record' and target_id = t;
    update platform.associations set source_id = v_tbl
     where organization_id = v_org and source_type = 'record' and source_id = t;
  end if;
  if not exists (select 1 from custom.visibility_ancestors('record', v_tbl) a
                  where a.container_id = v_hq) then
    raise exception 'FIXTURE — HQ is not a carrying ancestor of the Table, so PART 1 could not '
      'test rung 3 (a home addressed to her) at all.';
  end if;

  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_rec, v_org, v_tbl, 'record', jsonb_build_object('title', 'The admin''s record'), v_admin);
end $t$;
commit;

-- ═══════════ PART 0 — TAKE THE SEAT AND PROVE IT, then PART 1 and PART 2 from inside it.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'laddercap_green_suite', true);
do $t$
declare
  c_org   constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c01';
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_hq    constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c11';
  c_tbl   constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c21';
  c_rec   constant uuid := '1ef1ca00-0000-4a00-8a00-000000000c31';
  c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss  constant text := current_user;
  v_levels constant public.permission_level[] :=
    array['viewer','commenter','editor','admin']::public.permission_level[];
  L       public.permission_level;
  v_rung  text;
  v_subject uuid;
  v_got   public.permission_level;
  v_cases int := 0;
  v_msg   text;
begin
  -- ── PART 0 — the seat, proven three ways (SEAT-RECIPE).
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — seated as authenticated, no privilege on custom.record.';

  -- ── PART 1 — THE CENSUS: FOUR LEVELS x FOUR ADDRESSED RUNGS.
  foreach L in array v_levels loop
    foreach v_rung in array array['record','table','home','organization'] loop

      -- The subject. RUNG 3 is asked about the TABLE row, whose HOME is HQ — a Home of a Table
      -- is a container of the Table (and, since LEAK-T10, of nothing inside it).
      v_subject := case when v_rung = 'home' then c_tbl else c_rec end;

      -- FIXTURE. Stepping OUT: clearing grant rows and moving a knob are operator statements,
      -- and no client door revokes in bulk or writes another organization's settings.
      perform set_config('role', v_boss, true);
      delete from iam.permissions
       where resource_type = 'record'
         and resource_id in (select id from custom.record where organization_id = c_org);
      delete from platform.knob_override
       where organization_id = c_org and feature = 'custom' and key = 'member_default_level';
      insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
      values ('custom', 'member_default_level', 'organization', c_org, c_org,
              to_jsonb(case when v_rung = 'organization' then L::text else 'admin' end),
              'LADDER-CAP green suite');
      perform set_config('role', 'authenticated', true);

      -- THE GRANTS, through the store's own Share door, as the OWNER — which is who a Share
      -- dialog runs as. Every rung LESS specific than the one under test is set to `admin`.
      perform set_config('request.jwt.claims', c_admin_j, true);
      if v_rung = 'record' then
        perform custom.share_grant(c_org, c_rec, 'user', c_dana, L);
        perform custom.share_grant(c_org, c_tbl, 'user', c_dana, 'admin'::public.permission_level);
        perform custom.share_grant(c_org, c_hq,  'user', c_dana, 'admin'::public.permission_level);
      elsif v_rung = 'table' then
        perform custom.share_grant(c_org, c_tbl, 'user', c_dana, L);
        perform custom.share_grant(c_org, c_hq,  'user', c_dana, 'admin'::public.permission_level);
      elsif v_rung = 'home' then
        perform custom.share_grant(c_org, c_hq,  'user', c_dana, L);
      end if;

      -- THE ANSWER, from HER seat, through the door a screen calls.
      perform set_config('request.jwt.claims', c_dana_j, true);
      v_got := custom.my_level(c_org, v_subject, 'record');
      v_cases := v_cases + 1;
      if v_got is distinct from L then
        raise exception '1 FAILED — rung "%" addressed to her at %, every less specific rung at '
          'admin: the store answered % on %. A less specific rung RAISED her level.',
          v_rung, L, coalesce(v_got::text, 'nothing'), v_subject;
      end if;
    end loop;
  end loop;
  raise notice 'PART 1 PASSED — % cases: four levels x four addressed rungs, every less specific '
    'rung at admin, and the most specific one addressed to her decided every answer.', v_cases;

  -- ── PART 2 — RUNG 4 AND THE PUBLIC RUNG ADD REACH AND NEVER A LEVEL.
  perform set_config('role', v_boss, true);
  delete from iam.permissions where resource_type = 'record'
     and resource_id in (select id from custom.record where organization_id = c_org);
  delete from platform.knob_override
   where organization_id = c_org and feature = 'custom' and key = 'member_default_level';
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'member_default_level', 'organization', c_org, c_org, '"admin"'::jsonb,
          'LADDER-CAP green suite');
  perform set_config('role', 'authenticated', true);

  -- 2a — the CARRY. No grant anywhere, the organization says admin: carrying the Table's rows is
  -- exactly what membership confers, so she reaches admin. This is the reach the cap must not eat.
  perform set_config('request.jwt.claims', c_dana_j, true);
  if custom.my_level(c_org, c_rec, 'record') is distinct from 'admin'::public.permission_level then
    raise exception '2a FAILED — with no grant addressed to her and the organization at admin she '
      'answers %, so the cap ATE the carrying rung it was never meant to touch.',
      coalesce(custom.my_level(c_org, c_rec, 'record')::text, 'nothing');
  end if;

  -- 2b — and now ONE deliberate viewer share caps her on that record, and only that record.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(c_org, c_rec, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if custom.my_level(c_org, c_rec, 'record') is distinct from 'viewer'::public.permission_level then
    raise exception '2b FAILED — a deliberate VIEWER share was raised back to % by the '
      'organization default carried through the Table.',
      coalesce(custom.my_level(c_org, c_rec, 'record')::text, 'nothing');
  end if;

  -- 2c — and the write door says the same thing in its own sentence.
  begin
    perform custom.record_update(c_org, c_rec, jsonb_build_object('title', 'Dana was here'), null);
    raise exception '2c FAILED — somebody shared at VIEWER took a write.';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    -- 🚨 RE-PINNED (lane RED-SUITES-2, 2026-09-21). This clause asked whether the refusal
    -- contained the word "access" or "permission" — it called that "saying what it was", and
    -- it is the opposite: those are the words of a database, not of a person. Lane TALK-REC's
    -- ruling replaced them. The sentence a person meets now is
    --   "You hold the viewer level on this record, and custom.record_update needs the editor level."
    -- The clause asserts THAT promise instead of the old vocabulary, and it is far stricter
    -- than a substring of jargon: the refusal has to name the level she HOLDS, the level the
    -- door NEEDS, and the door it was refused at.
    if v_msg not ilike '%viewer level%' or v_msg not ilike '%editor level%'
       or v_msg not like '%custom.record_update%' then
      raise exception '2c FAILED — the refusal does not name the level she holds, the level the door needs, and the door: "%"', v_msg;
    end if;
  end;

  -- 2d — a PUBLIC grant is addressed to NOBODY: it may only ADD. Publishing the record must not
  -- take a level away from the organization's own members (Rule 9, levelfix 5c).
  perform set_config('role', v_boss, true);
  delete from iam.permissions where resource_type = 'record' and resource_id = c_rec;
  insert into iam.permissions (resource_type, resource_id, is_public, permission_level, created_by)
  values ('record', c_rec, true, 'viewer', c_admin);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if custom.my_level(c_org, c_rec, 'record') is distinct from 'admin'::public.permission_level then
    raise exception '2d FAILED — publishing the record to the world LOWERED the organization''s '
      'own member to %. A public grant is addressed to nobody and may only add.',
      coalesce(custom.my_level(c_org, c_rec, 'record')::text, 'nothing');
  end if;
  raise notice 'PART 2 PASSED — carrying and public rungs add reach and set no level: she carries '
    'at admin, one viewer share caps her and the write door refuses her, and publishing takes nothing away.';

  -- ── PART 3 — THE OTHER SEAT IS UNTOUCHED.
  perform set_config('request.jwt.claims', c_admin_j, true);
  if custom.my_level(c_org, c_rec, 'record') is distinct from 'admin'::public.permission_level then
    raise exception '3 FAILED — the owner of the organization answers % on her own record.',
      coalesce(custom.my_level(c_org, c_rec, 'record')::text, 'nothing');
  end if;
  if (custom.read_record(c_org, c_rec, true)) is null then
    raise exception '3 FAILED — the owner cannot read her own record.';
  end if;
  raise notice 'PART 3 PASSED — the owner still answers admin and still reads the record.';

  perform set_config('role', v_boss, true);
end $t$;
commit;

-- ═══════════════════════════ PART 4 — THE CENSUSES, ON THE WHOLE DATABASE.
begin;
set local statement_timeout = '60s';
do $t$
declare v_n int; v_who text;
begin
  select count(*), string_agg(member_email || ' ' || record_id::text || ' ' ||
                              addressed_level::text || '->' || answered_level::text, '; ')
    into v_n, v_who from custom.levels_raised_by_a_less_specific_rung();
  if v_n <> 0 then
    raise exception '4a FAILED — % (member, record) pair(s) on this database are answered HIGHER '
      'than the most specific rung addressed to that person: %', v_n, v_who;
  end if;
  raise notice '4a PASSED — no (member, record) pair on this database is answered above the most '
    'specific rung addressed to that person.';

  select count(*), string_agg(organization_name || '/' || member_email || ' ' || records_over::text, '; ')
    into v_n, v_who from iam.member_level_overreach();
  if v_n <> 0 then
    raise exception '4b FAILED — % member(s) reach more than their grants and their '
      'organization''s knob justify: %', v_n, v_who;
  end if;
  raise notice '4b PASSED — the overreach census is zero for every organization on this database.';
end $t$;
commit;

-- ═══════════════════════════ TEARDOWN — the throwaway organization leaves nothing behind.
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'laddercap_green_suite', true);
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
do $t$
declare v_n int;
begin
  select count(*) into v_n from custom.levels_raised_by_a_less_specific_rung();
  if v_n <> 0 then raise exception 'TEARDOWN FAILED — census is % after teardown', v_n; end if;
  raise notice 'TEARDOWN PASSED — census zero, the throwaway organization is gone.';
  raise notice 'LADDER-CAP GREEN: ALL PARTS PASSED.';
end $t$;
commit;
