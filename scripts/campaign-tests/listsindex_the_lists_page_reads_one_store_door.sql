-- LANE HANDOVER — THE LISTS PAGE READS ONE STORE DOOR.
--
-- THE REAL USE CASE: the owner of an organization opens Lists (/lists/v3) to see every pick list
-- her organization keeps. From her seat (admin@admin.com in admin's Workspace):
--   A. custom.pick_list_index names exactly the Tables of choices custom.organization_pick_lists
--      names (the store's own visibility), each with its live choice count, plus her own live older
--      lists of that organization, marked 'older';
--   B. a person who is not a member (test@test.com, in an organization it is not in) is refused
--      42501 before anything is read;
--   C. custom.pick_list_index_everywhere answers every member organization inside 2 s, and holds
--      admin's Workspace's lists;
--   D. archived_ids names only archived Tables of choices.
-- RUN IT (clone or production; always rolled back):
--   psql "<DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/listsindex_the_lists_page_reads_one_store_door.sql
-- ITS RED: before the campaign file both doors are absent (42883).

\set ON_ERROR_STOP on
\timing off
\set suite 'listsindex_the_lists_page_reads_one_store_door.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'admin@admin.com'), 'role', 'authenticated')::text, true);

do $$
declare
  v_org   uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin's Workspace
  v_me    uuid := (select id from auth.users where email = 'admin@admin.com');
  v_doc   jsonb;
  v_store int; v_want int; v_diff int; v_older int; v_older_want int; v_bad int;
begin
  v_doc := custom.pick_list_index(v_org);
  select count(*) into v_store from jsonb_array_elements(v_doc -> 'lists') e where e ->> 'lives_in' = 'record';
  select count(*) into v_want from custom.organization_pick_lists(v_org);
  select count(*) into v_diff from (
    (select id from custom.organization_pick_lists(v_org))
    except (select (e ->> 'id')::uuid from jsonb_array_elements(v_doc -> 'lists') e where e ->> 'lives_in' = 'record')) d;
  if v_store <> v_want or v_diff <> 0 then
    raise exception 'A FAILED: % store lists, the store''s own door names % (% missing)', v_store, v_want, v_diff;
  end if;
  select count(*) into v_bad from jsonb_array_elements(v_doc -> 'lists') e
   where e ->> 'lives_in' = 'record'
     and (e ->> 'item_count')::int <> (select count(*) from custom.record c where c.organization_id = v_org
                                         and c.table_id = (e ->> 'id')::uuid and c.data_class = 'record' and c.deleted_at is null);
  if v_bad <> 0 then raise exception 'A FAILED: % list(s) carry a wrong choice count', v_bad; end if;
  select count(*) into v_older from jsonb_array_elements(v_doc -> 'lists') e where e ->> 'lives_in' = 'older';
  select count(*) into v_older_want from workbench.udt_structured_lists l
   where l.organization_id = v_org and l.user_id = v_me and l.deleted_at is null;
  if v_older <> v_older_want then raise exception 'A FAILED: % own older lists, % live', v_older, v_older_want; end if;
  raise notice 'A passed: % store lists, % own older lists, counts right', v_store, v_older;

  select count(*) into v_bad from jsonb_array_elements_text(v_doc -> 'archived_ids') a
    join custom.record t on t.id = a::uuid
   where not (t.deleted_at is not null and platform._is_store_pick_list(t.metadata));
  if v_bad <> 0 then raise exception 'D FAILED: % archived id(s) are not archived Tables of choices', v_bad; end if;
  raise notice 'D passed: % archived list ids, all archived Tables of choices', jsonb_array_length(v_doc -> 'archived_ids');
end $$;

select clock_timestamp() as t0 \gset
create temp table _everywhere on commit drop as select custom.pick_list_index_everywhere() as doc;
select extract(milliseconds from clock_timestamp() - :'t0'::timestamptz) as ms \gset
do $$
declare v_n int;
begin
  select count(*) into v_n from _everywhere, jsonb_array_elements(doc -> 'lists') e
   where e ->> 'organization_id' = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  if v_n <> jsonb_array_length(custom.pick_list_index('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f') -> 'lists') then
    raise exception 'C FAILED: everywhere holds % of admin''s Workspace''s lists', v_n;
  end if;
end $$;
select case when :ms < 2000 then 'C passed: everywhere in ' || round(:ms) || ' ms' else 'C FAILED: ' || round(:ms) || ' ms' end as verdict \gset
\echo :verdict

create temp table _outside on commit drop as
  select o.id from iam.organizations o
   where o.archived_at is null
     and not exists (select 1 from iam.organization_member m join auth.users u on u.id = m.user_id
                      where m.organization_id = o.id and u.email = 'test@test.com')
   order by o.created_at;
grant select on _outside to authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'test@test.com'), 'role', 'authenticated')::text, true);
-- AS THE BROWSER: the organization wall judges the signed-in role, never the maintenance role.
set local role authenticated;
do $$
declare v_org uuid;
begin
  select id into v_org from _outside limit 1;
  if v_org is null then raise exception 'B could not find an organization test@test.com is outside of'; end if;
  begin
    perform custom.pick_list_index(v_org);
    raise exception 'B FAILED: a non-member read an organization''s lists';
  exception when insufficient_privilege then
    raise notice 'B passed: a non-member is refused 42501';
  end;
end $$;
rollback;
\echo 'GREEN'
