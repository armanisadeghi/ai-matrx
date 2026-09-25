-- docproc: created_by IS the owner — THE GREEN SUITE for
-- migrations/docproc_created_by_is_the_owner_2026_09_25.sql.
--
--   C1  no docproc row that names an owner leaves created_by empty (the policies' owner shortcut
--       keys on created_by; empty means every read and write takes the slow set lane).
--   C2  a service-role insert that names only owner_id (aidream's shape) gets created_by = owner.
--   C3  the owner renaming one of their documents, as a real signed-in user through RLS, finishes
--       under 1 000 ms of server time (measured 1.97-2.10 s before the fix, ~0.1 s after).
--
-- RUN IT on the clone or a branch, ALWAYS in one rolled-back transaction. Statements are separated
-- by `---` lines so a driver can send them one at a time; psql reads them as comments.
-- ITS RED: before the migration C1 fails (473 + 194 empty on 2026-09-25), then C2, then C3.

begin;
---
select set_config('suite.owner', (select id::text from auth.users where email = 'admin@admin.com'), true);
---
do $c1$
declare v_pd bigint; v_pej bigint;
begin
  select count(*) into v_pd from docproc.processed_documents where created_by is null and owner_id is not null;
  select count(*) into v_pej from docproc.page_extraction_jobs where created_by is null and owner_id is not null;
  if v_pd + v_pej > 0 then
    raise exception 'C1 RED: % processed_documents and % page_extraction_jobs name an owner but no created_by', v_pd, v_pej;
  end if;
  raise notice 'C1 GREEN: every docproc row that names an owner carries created_by';
end $c1$;
---
set local role service_role;
---
select set_config('app.actor_system', 'docproc_created_by_suite', true);
---
do $c2$
declare v_owner uuid := current_setting('suite.owner')::uuid; v_id uuid; v_cb uuid;
begin
  insert into docproc.processed_documents (owner_id, organization_id, source_kind, source_id, name, source_hash)
  select d.owner_id, d.organization_id, d.source_kind, d.source_id, 'suite probe', md5(random()::text)
    from docproc.processed_documents d where d.owner_id = v_owner limit 1
  returning id, created_by into v_id, v_cb;
  if v_id is null then raise exception 'C2 UNMEASURED: admin@admin.com owns no processed document to copy'; end if;
  if v_cb is distinct from v_owner then
    raise exception 'C2 RED: a service-role insert naming owner_id % stored created_by %', v_owner, v_cb;
  end if;
  raise notice 'C2 GREEN: service-role insert stamped created_by = owner';
end $c2$;
---
reset role;
---
select set_config('request.jwt.claims', json_build_object('sub', current_setting('suite.owner'), 'role', 'authenticated')::text, true);
---
set local role authenticated;
---
do $c3$
declare v_owner uuid := current_setting('suite.owner')::uuid; v_id uuid; v_t0 timestamptz; v_ms numeric; v_n int;
begin
  select id into v_id from docproc.processed_documents
   where owner_id = v_owner and deleted_at is null and name <> 'suite probe' order by id limit 1;
  v_t0 := clock_timestamp();
  update docproc.processed_documents set name = name || '' where id = v_id;
  get diagnostics v_n = row_count;
  v_ms := extract(epoch from clock_timestamp() - v_t0) * 1000;
  if v_n <> 1 then raise exception 'C3 RED: the owner''s rename touched % rows', v_n; end if;
  if v_ms > 1000 then raise exception 'C3 RED: the owner''s one-row rename took % ms', round(v_ms); end if;
  raise notice 'C3 GREEN: the owner''s one-row rename took % ms', round(v_ms);
end $c3$;
---
rollback;
