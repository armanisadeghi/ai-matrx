-- LANE SCOPES-READS-ACCESS — A PLATFORM CONTEXT TABLE IS READ BY EVERYONE SIGNED IN, AND NOTHING ELSE OF ITS SYSTEM
-- ORGANIZATION IS (chair ruling 2026-09-29 (1)), measured RED then GREEN on the dev clone, rolled back.
--
-- THE USE CASE. Matrx System keeps the platform's own tags ("E-Waste", "Onboarding", …) that content across the platform
-- is filed under. A person who belongs to no organization at all still sees what a platform tag is called when she
-- opens something filed under it — the old scope rules let her. She must not, by the same door, reach any of the
-- system organization's other 329 Tables, and no write door may let her in.
--
-- The seat: test@test.com with every membership of hers archived inside this transaction (a person of no
-- organization). Nothing is kept.
--
--   P1  she reads three Matrx System tags through custom.context_scopes                         ← RED before
--   P2  the generic batch read (custom.read_records_by_ids) still refuses her: the tags reach her only through the
--       scopes door, which reads them in its own name
--   P3  every other Table of Matrx System refuses her at the Table wall (read_records_by_ids' door)
--   P4  she cannot list Matrx System's Tables (custom.query_visible_ids)
--   P5  a write door refuses her on a platform tag (custom.record_update)
--   P6  a context Table of an ordinary organization (Titanium's tags) still refuses her

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesaccess_platform_tags_are_read_through_the_scopes_door_red_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';

create temp table p_fx on commit drop as
  select (select id from auth.users where email = 'test@test.com') as me,
         '39c38960-d30c-4840-b0c1-c9960de95582'::uuid as sys,
         (select t.id from custom.record t where t.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582' and t.table_id = custom.table_kernel_id()
             and t.deleted_at is null and t.data @> '{"kept_for": "context", "offered_as_context": true}'::jsonb limit 1) as tag_table,
         (select array_agg(r.id) from (select r.id from custom.record r join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
             where r.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582' and r.deleted_at is null and r.data_class = 'record'
               and t.data @> '{"kept_for": "context"}'::jsonb order by r.id limit 3) r) as tags;
update iam.memberships set deleted_at = now() where user_id = (select me from p_fx) and deleted_at is null;
grant select on p_fx to authenticated;

do $t$
declare f p_fx; v jsonb; n int; v_refused text; t record; v_open int := 0; v_data uuid;
begin
  select * into f from p_fx;
  if f.tag_table is null or cardinality(f.tags) < 3 then raise exception 'FIXTURE: no Matrx System tags'; end if;
  if exists (select 1 from iam.memberships where user_id = f.me and deleted_at is null) then raise exception 'FIXTURE: she still belongs somewhere'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', f.me, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  v := custom.context_scopes(f.tags);
  if jsonb_array_length(v) <> 3 then
    raise exception 'P1 RED: a person of no organization reads % of 3 Matrx System tags', jsonb_array_length(v);
  end if;

  begin
    select count(*) into n from custom.read_records_by_ids(f.sys, f.tag_table, f.tags, false);
  exception when others then n := -1; v_refused := sqlerrm; end;
  if n <> -1 then raise exception 'P2 RED: the generic read door handed an outsider % Records of Matrx System', n; end if;

  perform set_config('role', 'none', true);
  for t in select tt.id from custom.record tt where tt.organization_id = f.sys and tt.table_id = custom.table_kernel_id()
              and tt.deleted_at is null and not (tt.data @> '{"kept_for": "context", "offered_as_context": true}'::jsonb) loop
    perform set_config('role', 'authenticated', true);
    begin
      perform custom.assert_may_know_table(f.sys, t.id, 'custom.read_records_by_ids');
      v_open := v_open + 1;
    exception when insufficient_privilege then null;
    end;
    perform set_config('role', 'none', true);
  end loop;
  if v_open > 0 then raise exception 'P3 RED: % other Tables of Matrx System let her in', v_open; end if;

  perform set_config('role', 'authenticated', true);
  begin
    perform custom.query_visible_ids(f.sys, custom.table_kernel_id());
    v_refused := null;
  exception when insufficient_privilege then v_refused := sqlerrm; end;
  if v_refused is null then raise exception 'P4 RED: she lists Matrx System''s Tables'; end if;

  begin
    perform custom.record_update(f.sys, f.tags[1], '{"name": "Renamed by an outsider"}'::jsonb, null);
    v_refused := null;
  exception when others then v_refused := sqlerrm; end;
  if v_refused is null then raise exception 'P5 RED: an outsider renamed a platform tag'; end if;

  perform set_config('role', 'none', true);
  select array_agg(r.id) into f.tags from (select r.id from custom.record r join custom.record tt on tt.organization_id = r.organization_id and tt.id = r.table_id
     where r.organization_id = 'f9cb3e35-2a65-4f2a-8525-088d6551071c' and r.deleted_at is null and r.data_class = 'record'
       and tt.data @> '{"kept_for": "context"}'::jsonb order by r.id limit 3) r;
  perform set_config('role', 'authenticated', true);
  v := custom.context_scopes(f.tags);
  if jsonb_array_length(v) <> 0 then raise exception 'P6 RED: she reads % tags of Titanium, an organization she is not in', jsonb_array_length(v); end if;
  perform set_config('role', 'none', true);

  raise notice 'GREEN P1–P6: a person of no organization reads the platform''s tags and nothing else of Matrx System; no write door lets her in; an ordinary organization''s tags stay closed. (P5 refused: %)', left(v_refused, 120);
end $t$;

rollback;
