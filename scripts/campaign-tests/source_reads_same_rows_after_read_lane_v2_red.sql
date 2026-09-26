-- WHO SEES WHAT MUST NOT CHANGE BY ONE ROW when the Source reads are made cheap — THE EQUIVALENCE
-- GUARD for the 2026-09-26 memory-pressure incident, Cause 2
-- (common-docs/projects/database-workload-safety/incidents/2026-09-26-memory-pressure.md).
-- Companion of source_screen_reads_under_the_cap_red.sql (cost); this one is correctness.
--
-- What it does, in ONE rolled-back transaction on the clone:
--   1. snapshots, AS each of 13 real people + anon, under RLS: the exact id set (count + md5 of the
--      sorted ids) of docproc.processed_document_pages, rag.kg_chunks, docproc.processed_documents,
--      the seven research.rs_* components, and get_topic_overview for 6 topics (md5 of its json);
--   2. applies THE CANDIDATE FIX (the block between the CHANGE markers) — today: enroll
--      processed_document + processed_document_page in read-lane v2 and regenerate through
--      iam.apply_rls (the chair-approved generator: P1 parent probe + P2 lane-admin guard);
--   3. snapshots again and RAISES RED naming every (person, surface) whose rows differ.
-- People: admin@admin.com, the owner and two admins/members of the orgs holding the most Sources,
-- Titanium's two members, test@, a 49-Source creator, three one-org light users, two no-org users.
--
-- ITS RED (2026-09-26, clone hykobnqyuxspbcijrodb): 3 of 224 pairs differ — pages 4889->4890
-- (admin@admin.com), 4840->4850, 4012->4022. Cause: the clone's kernel fingerprint (fb18...) is not
-- iam.entity_read_kernel_expected() (1754...), so every regeneration ON THE CLONE emits an UNBOUNDED
-- iam.has_access('processed_document_page', id) lane, and the kernel answers TRUE for pages of
-- another person's `personal` document whose parent it answers FALSE for. Production's fingerprint
-- matches (bounded lane), so this red says the clone cannot prove the change, not that production
-- would widen — it goes green only when both hold. Run: statements separated by `---` lines.

begin;
---
set local statement_timeout = '900s';
---
set local lock_timeout = '3s';
---
-- snapshot: (label) -> the eq.snap transaction setting (who, surface, n, digest). Runs each read AS the person, under RLS.
create or replace function pg_temp.snap(p_label text) returns void language plpgsql as $f$
declare
  u text; r record; n bigint; dg text; s text; topic uuid; ok boolean;
  users text[] := array['87a6e699-3622-4869-8843-d0867456c0dd','4cf62e4e-2679-484f-b652-034e697418df','34ed4fc3-c527-4819-99bf-15c26603b261','f0146c96-e02e-420b-a99f-92774da0566c','c5e92166-e148-4e73-926e-83af0c453665','392afd39-d59c-4418-866b-451e9d93fead','4060701e-706a-4c76-b3ca-0bbc69fa5a14','77c6af70-a35e-4724-a304-64a0dd789674','a4955b5c-d524-4d72-a90e-0658d5d51148','47eb4cb4-3c2a-49e8-be9c-ba126ca251ae','6555aa73-c647-4ecf-8a96-b60e315b6b18','59f15d53-9138-464c-946f-d16accce35b4','ef90890e-4e94-4a6b-9933-b3101834f946','anon'];
  surf text[] := array[
    'docproc.processed_document_pages','rag.kg_chunks','docproc.processed_documents',
    'research.rs_source','research.rs_keyword','research.rs_analysis','research.rs_content',
    'research.rs_synthesis','research.rs_document','research.rs_tag'];
  topics uuid[] := array['db504d8f-a3a7-4eb7-a1d3-934df1923f5c','c5c4ee8c-d5b8-4f5d-8b42-54d89893fc14','eea72fd8-6de1-4c91-be3c-2e444cd1016e','08ec80da-a84c-475a-b6a5-443727e6cef6','0f8fb6c6-3003-433d-bbcf-2a03dae66b81','4191bcd9-f947-4198-8a0a-7eb30f62609d'];
begin
  foreach u in array users loop
    if u = 'anon' then
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      execute 'set local role anon';
    else
      perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
      execute 'set local role authenticated';
    end if;
    foreach s in array surf loop
      begin
        execute format('select count(*), md5(coalesce(string_agg(id::text, '','' order by id),'''')) from %s', s) into n, dg;
      exception when others then n := -1; dg := sqlstate || ' ' || left(sqlerrm, 60);
      end;
      perform set_config('eq.snap', (coalesce(nullif(current_setting('eq.snap', true),''),'[]')::jsonb || jsonb_build_array(jsonb_build_array(p_label,u,s,n,dg)))::text, true);
    end loop;
    foreach topic in array topics loop
      begin
        execute 'select md5(public.get_topic_overview($1)::text)' into dg using topic; n := 1;
      exception when others then n := -1; dg := sqlstate || ' ' || left(sqlerrm, 60);
      end;
      perform set_config('eq.snap', (coalesce(nullif(current_setting('eq.snap', true),''),'[]')::jsonb || jsonb_build_array(jsonb_build_array(p_label,u,'get_topic_overview:' || left(topic::text, 8),n,dg)))::text, true);
    end loop;
    execute 'reset role';
  end loop;
end $f$;
;
---
select pg_temp.snap('before');
---
-- ===== CHANGE (the candidate fix) =====
insert into iam.read_lane_v2_rollout (token, batch)
select token, 'srcperf' from platform.entity_types
 where (schema_name, table_name) in (('docproc','processed_documents'),('docproc','processed_document_pages')) and is_active
on conflict do nothing;
---
select iam.apply_rls(et.schema_name, et.table_name, et.token, et.rls_variant)
  from platform.entity_types et
 where (schema_name, table_name) in (('docproc','processed_documents'),('docproc','processed_document_pages')) and is_active;
-- ===== /CHANGE =====
---
select pg_temp.snap('after');
---
do $$ declare r record; nd int := 0; nt int := 0; v_red text := ''; begin
 for r in with x as (select e->>0 label, e->>1 who, e->>2 surface, (e->>3)::bigint n, e->>4 dg from jsonb_array_elements(current_setting('eq.snap')::jsonb) e)
   select b.who, b.surface, b.n bn, a.n an, b.dg = a.dg same from x b join x a on a.who=b.who and a.surface=b.surface and a.label='after' where b.label='before' order by b.surface, b.who loop
   nt := nt + 1;
   if not r.same then nd := nd + 1; v_red := v_red || format('%s as %s: %s -> %s rows; ', r.surface, left(r.who, 8), r.bn, r.an); end if;
 end loop;
 if nt = 0 then raise exception 'RED: no snapshot pairs were taken'; end if;
 if nd > 0 then raise exception 'RED: % of % (person, surface) pairs changed rows: %', nd, nt, v_red; end if;
 raise notice 'GREEN: all % (person, surface) pairs return the identical rows before and after', nt;
end $$;
---
rollback;
