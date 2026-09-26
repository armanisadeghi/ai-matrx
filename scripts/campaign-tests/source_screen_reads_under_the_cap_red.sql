-- The Source screen's three reads stay far under the 8 s authenticated statement cap for a member
-- whose organization holds thousands of Sources — THE RED GUARD for the 2026-09-26 memory-pressure
-- incident (common-docs/projects/database-workload-safety/incidents/2026-09-26-memory-pressure.md).
--
--   S1  docproc.source_list_facts(one id)                         < 20 000 shared buffers
--   S2  docproc.processed_document_pages for one Source (RLS)      < 20 000 shared buffers
--   S3  rag.kg_chunks count for one Source (RLS)                   < 20 000 shared buffers
--
-- Why buffers, not milliseconds: buffers do not depend on load. On live at 18:5xZ S2 read 778 096
-- buffers (8.6 s, every call a 57014) because the pages policy builds the caller's WHOLE
-- processed_document set with iam.accessible_entity_ids (6 506 ids for admin@admin.com after 1309)
-- before it keeps 16 rows; the clone (pre-1309, 447 ids) reads 35 432 buffers for the same 16 rows.
-- S1 went GREEN with aidream 1308 (a per-id kernel question): its before/after is the model.
--
-- Measured 2026-09-26 18:5xZ on the clone hykobnqyuxspbcijrodb (1308 applied, pre-1309):
--   S1 8 976 buffers / 2 142 ms, S2 34 035 / 5 703 ms (RED), S3 16 279 / 1 920 ms.
-- ITS RED today: S2 fails on the clone; S2 (778 096) and, by the same policy, S3 fail on live. It turns green only when the pages and
-- chunks reads stop paying for the caller's whole set (a policy/door change — owner's chair step).
-- RUN IT on the clone, in one rolled-back transaction. Statements are separated by `---` lines.

begin;
---
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'admin@admin.com'), 'role', 'authenticated')::text, true);
---
set local role authenticated;
---
set local statement_timeout = '60s';
---
do $s$
declare
  v_doc uuid := '27932f31-3c9e-438b-bd7f-d6c15714ecc1';  -- a 16-page Source present on live and the clone
  v_plan json; v_buf bigint; v_ms numeric; v_red text := '';
  v_sql text[] := array[
    format('select * from docproc.source_list_facts(array[%L]::uuid[])', v_doc),
    format('select page_index, page_number, portion_kind, locator, speaker from docproc.processed_document_pages where processed_document_id = %L order by page_index limit 1000', v_doc),
    format('select count(*) from rag.kg_chunks where processed_document_id = %L and deleted_at is null', v_doc)];
  v_name text[] := array['S1 source_list_facts', 'S2 processed_document_pages', 'S3 kg_chunks'];
  i int;
begin
  for i in 1..3 loop
    execute 'explain (analyze, buffers, format json) ' || v_sql[i] into v_plan;
    v_buf := coalesce((v_plan -> 0 -> 'Plan' ->> 'Shared Hit Blocks')::bigint, 0)
           + coalesce((v_plan -> 0 -> 'Plan' ->> 'Shared Read Blocks')::bigint, 0);
    v_ms := round((v_plan -> 0 ->> 'Execution Time')::numeric);
    raise notice '% : % buffers, % ms', v_name[i], v_buf, v_ms;
    if v_buf >= 20000 then v_red := v_red || format('%s read %s buffers (%s ms); ', v_name[i], v_buf, v_ms); end if;
  end loop;
  if v_red <> '' then raise exception 'RED: %', v_red; end if;
  raise notice 'GREEN: all three Source-screen reads under 20 000 buffers';
end $s$;
---
rollback;
