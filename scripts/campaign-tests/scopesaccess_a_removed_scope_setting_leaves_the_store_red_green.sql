-- LANE SCOPES-READS-ACCESS — A SETTINGS KEY A SCOPE'S OLD ROW NO LONGER CARRIES LEAVES ITS RECORD TOO,
-- measured RED then GREEN on the dev clone.
--
-- THE USE CASE. A teacher runs "World Literature" (admin@admin.com's own test class in admin's
-- Workspace). She hands out a join code, the class fills, and she disables the code so nobody else can
-- walk in with it. Since the press (2026-09-29) every scope write lands in the record store in the same
-- statement, and the class readers are moving to the store. Before this lane's first file the store kept
-- the disabled code (custom._ctx_store_scope wrote only the keys the row still said), so a store reader
-- would have let a stranger in with it. She also clears the teacher's name from the class settings;
-- the store must drop it too, and keep every other word of the class exactly.
--
-- Everything happens inside one transaction that is rolled back. Nothing is kept.
--
-- WHAT MAKES IT FAIL (RED before scopesaccess_a_removed_scope_setting_leaves_the_store.sql):
--   R1  after edu_class_join_code(…, 'rotate') the Record holds the new code (the fixture works)
--   R2  after edu_class_join_code(…, 'disable') the old row has no join_code AND the Record's join code
--       is empty                                                                      ← RED before
--   R3  a settings write that drops `teacher` empties the Record's teacher setting    ← RED before
--   R4  every other key of the Record (name, description, slug, sort order, term, access mode, exam
--       dates, context item values) is exactly what it was
--   R5  a write that keeps every settings key changes nothing on the Record

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesaccess_a_removed_scope_setting_leaves_the_store_red_green.sql'
\set requires 'function:custom._ctx_store_scope|function:public.edu_class_join_code'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $t$
declare
  c_admin  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_class  constant uuid := '027fbb4e-ad14-4c35-b015-d62f4d532372';   -- World Literature (admin's Workspace)
  v_org    uuid;
  v_type   uuid;
  v_code   text;
  v_before jsonb;
  v_after  jsonb;
  v_skeys  text[];
  v_tkey   text;
  v_ckey   text;
begin
  select s.organization_id, s.scope_type_id into v_org, v_type from context.scopes s where s.id = c_class;
  if v_org is null then raise exception 'FIXTURE: World Literature is not on this database'; end if;
  if custom.context_writer(v_org) <> 'store' then
    -- The clone may carry the undo rehearsal of the press (PROGRESS-SCOPES-PRESS-EVERYONE) and its follow
    -- does not run, so the press refuses there; production is pressed for every organization. Make the
    -- store this organization's writer inside the rolled-back transaction, as the press does.
    insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
    values ('custom', 'scopes_written_in_the_store', 'organization', v_org, v_org, 'true'::jsonb, 'scopesaccess suite fixture')
    on conflict do nothing;
    update platform.knob_override set value = 'true'::jsonb
     where feature = 'custom' and key = 'scopes_written_in_the_store' and scope_kind = 'organization' and scope_id = v_org;
  end if;
  if custom.context_writer(v_org) <> 'store' then
    raise exception 'FIXTURE: admin''s Workspace writes its scopes in %, not the store', custom.context_writer(v_org);
  end if;
  -- The Record keys of the Table's settings Fields (the ones this lane's fix may touch).
  select array_agg(f.data ->> 'key'),
         max(f.data ->> 'key') filter (where m[1] = 'teacher'),
         max(f.data ->> 'key') filter (where m[1] = 'join_code')
    into v_skeys, v_tkey, v_ckey
    from custom.record f
    cross join lateral regexp_match(f.metadata -> 'moved_from' ->> 'note', '^the ''(.*)'' key of this type''s scopes'' settings') m
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = v_type::text
     and f.id = custom._ctx_id('scope-setting-field', v_type::text, m[1]);
  if v_tkey is null or v_ckey is null then
    raise exception 'FIXTURE: the class Table has no teacher / join code setting Field (%, %)', v_tkey, v_ckey;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_code := public.edu_class_join_code(c_class, 'rotate') ->> 'code';
  perform set_config('role', 'none', true);
  if (select r.data ->> v_ckey from custom.record r where r.organization_id = v_org and r.id = c_class) is distinct from v_code then
    raise exception 'R1 FIXTURE: the Record does not hold the rotated code %', v_code;
  end if;

  select r.data - array['_values', '_sources'] - v_skeys into v_before from custom.record r where r.organization_id = v_org and r.id = c_class;

  perform set_config('role', 'authenticated', true);
  perform public.edu_class_join_code(c_class, 'disable');
  perform set_config('role', 'none', true);
  if (select s.settings ? 'join_code' from context.scopes s where s.id = c_class) then
    raise exception 'R2 FIXTURE: the old row still has a join code';
  end if;
  if (select jsonb_typeof(coalesce(r.data -> v_ckey, 'null'::jsonb)) from custom.record r where r.organization_id = v_org and r.id = c_class) <> 'null' then
    raise exception 'R2 RED: the class''s join code was disabled but its Record still holds %',
      (select r.data -> v_ckey from custom.record r where r.organization_id = v_org and r.id = c_class);
  end if;

  update context.scopes set settings = settings - 'teacher' where id = c_class;
  if (select jsonb_typeof(coalesce(r.data -> v_tkey, 'null'::jsonb)) from custom.record r where r.organization_id = v_org and r.id = c_class) <> 'null' then
    raise exception 'R3 RED: the teacher was cleared from the class settings but its Record still holds %',
      (select r.data -> v_tkey from custom.record r where r.organization_id = v_org and r.id = c_class);
  end if;

  select r.data - array['_values', '_sources'] - v_skeys into v_after from custom.record r where r.organization_id = v_org and r.id = c_class;
  if v_after is distinct from v_before then
    raise exception 'R4 RED: a key that is not a removed setting moved: before % after %', v_before, v_after;
  end if;
  if (select r.data ->> 'term' is distinct from s.settings ->> 'term' and r.data ->> 'setting_term' is distinct from s.settings ->> 'term'
        from custom.record r join context.scopes s on s.id = r.id where r.organization_id = v_org and r.id = c_class) then
    raise exception 'R4 RED: the class term no longer agrees';
  end if;

  select r.data - array['_values', '_sources'] into v_before from custom.record r where r.organization_id = v_org and r.id = c_class;
  update context.scopes set settings = settings where id = c_class;
  select r.data - array['_values', '_sources'] into v_after from custom.record r where r.organization_id = v_org and r.id = c_class;
  if v_after is distinct from v_before then
    raise exception 'R5 RED: a write that kept every settings key changed the Record: before % after %', v_before, v_after;
  end if;

  raise notice 'GREEN R1–R5: a disabled join code and a cleared teacher leave the Record in the same statement; nothing else on it moves; a write that keeps every key changes nothing.';
end
$t$;

rollback;
