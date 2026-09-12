-- iam_personal_row_wall_dd165f_batch4 — REGENERATION BATCH 4 OF 4 (DD-165).
--
-- `pnpm db:apply` wraps a file in ONE transaction, so a single 179-table regeneration would take
-- ACCESS EXCLUSIVE on every one of them and HOLD every lock until commit. DD-137b12 lost that bet
-- twice against live traffic (55P03 lock storm, then a 40P01 deadlock), and `ddl_lock_timeout_guard`
-- gives the answer on every run: "commit per table — this bounds waiting, never holding." So this is
-- four files of ~45 tables, each its own transaction, in a fixed (schema, table) order so two runs
-- take their locks in the same sequence.
--
-- 🚨 WHAT PER-BATCH COMMITS COST, STATED PLAINLY. A partial application is POSSIBLE: batch 2 can
-- commit and batch 3 fail. That is acceptable only because every table is individually correct in
-- either state — staff arm unwalled (as today) or walled (as intended) — and because dd165g
-- measures the END state whatever happened in between and refuses to pass on a token still unwalled.
--
-- 🚨 A LOCK FAILURE IS NOT A STRUCTURAL REFUSAL. Only the closed set of causes below is tolerated —
-- each a token `iam.apply_rls` cannot generate BY CONSTRUCTION — and anything else aborts this batch
-- naming the table. This file is idempotent: re-run it after a lost race.
set local lock_timeout = '30s';

do $$
declare
  r record; v_ok int := 0; v_refused int := 0;
  v_tokens text[] := array['seo_engine_schedule','seo_geo_place','seo_gsc_dig_rule','seo_keyword','seo_keyword_class_rule','seo_keyword_edge','seo_keyword_facet','seo_keyword_market','seo_keyword_place','seo_keyword_topic','seo_rank_target','seo_source_request','seo_starter_pack','seo_starter_pack_item','seo_story_angle','seo_topic','skill','skill_render_definition','tool_bundle','tool','studio_session','transcript','ui_surface_agent_pref','ui_surface_config','invitation_code','user_profile','web_analysis_item','web_brand','web_listing_publisher','web_offering_template','web_provider','web_site','note_folder','note','product_capture_item','workflow','workflow_run','workflow_runtime_surface','workflow_template','workflow_trigger','project','task','thread','war_room'];
begin
  for r in select et.schema_name, et.table_name, et.token, et.rls_variant
             from platform.entity_types et
            where et.token = any(v_tokens) and et.is_active
              and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
            order by et.schema_name, et.table_name
  loop
    begin
      perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
      v_ok := v_ok + 1;
    exception when others then
      --   P0001 'access machinery'                 — owns the access resolver's inputs
      --   42703 column "id" does not exist          — bespoke tables with no id
      --   42883 operator does not exist             — extend.wbx_guidance's type mismatch
      --   P0001 'not an active registered entity'   — a token deactivated mid-run
      --   P0001 'has no composition parent'         — a parentless component (db-rules §6d-1)
      if sqlstate in ('P0001','42703','42883')
         and (sqlerrm like '%access machinery%'
              or sqlerrm like '%column "id" does not exist%'
              or sqlerrm like '%operator does not exist%'
              or sqlerrm like '%not an active registered entity%'
              or sqlerrm like '%has no composition parent%') then
        v_refused := v_refused + 1;
        raise notice 'dd165f: % (%.%) keeps its bespoke policy — %',
          r.token, r.schema_name, r.table_name, sqlerrm;
      else
        raise exception 'dd165f: % (%.%) failed with %: %. That is not a structural refusal, '
          'so this batch refuses to commit partially. A 55P03 or 40P01 here is a lost race — re-run '
          'this file; it is idempotent.', r.token, r.schema_name, r.table_name, sqlstate, sqlerrm;
      end if;
    end;
  end loop;
  raise notice 'dd165f: batch 4/4 — regenerated %, structurally refused %', v_ok, v_refused;
  if v_ok + v_refused < 44 then
    raise exception 'dd165f: only % of 44 tokens were reached — a silent drop is exactly the '
      'shape of the omission this file exists to prevent', v_ok + v_refused;
  end if;
end $$;
