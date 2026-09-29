-- access_ladder_t13_5b_new_row_columns_granted_like_the_old.sql
--
-- T-13 phase 5 (common-docs/projects/access-ladder/t13/PLAN.md). Phase 3.1 added published_to_web,
-- published_to_web_at, published_to_web_by to 334 tables, but 31 of them grant columns one by one, and the
-- new columns were never granted there. So a client that reads or writes the new columns instead of the old
-- one gets 42501 on exactly these tables (files.files among them), and the signed-out public pages on 14
-- tables cannot read published_to_web at all. Rule applied: a role gets on each new column exactly the
-- privilege it already holds on the old one, except that `anon` gets published_to_web only (who published and
-- when is nobody's business on a public page, DD-186), and scraper.scrape_parsed_page's shown_to follows its
-- row column for signed-in readers. Found live 2026-09-28 by comparing has_column_privilege on the old column
-- and each new column for anon, authenticated and service_role x SELECT, INSERT, UPDATE (service_role: no gap).
-- matrx-frontend lib/security/public-exposure.ts ANON_COLUMN_SURFACE gains published_to_web on the 14.

set local lock_timeout = '2s';

-- 1. Signed-out readers: published_to_web beside the old column (14).
grant select (published_to_web) on agent.message_template to anon;
grant select (published_to_web) on ai.model_definition to anon;
grant select (published_to_web) on app.definition to anon;
grant select (published_to_web) on canvas.canvas_items to anon;
grant select (published_to_web) on canvas.shared_canvas_items to anon;
grant select (published_to_web) on content_ir.kind_definition to anon;
grant select (published_to_web) on education.learn_doc to anon;
grant select (published_to_web) on platform.categories to anon;
grant select (published_to_web) on podcast.pc_articles to anon;
grant select (published_to_web) on podcast.pc_episodes to anon;
grant select (published_to_web) on podcast.pc_shows to anon;
grant select (published_to_web) on public.app_config to anon;
grant select (published_to_web) on workbench.heatmap_saves to anon;
grant select (published_to_web) on workbench.notes to anon;

-- 2. Signed-in readers and writers: all three, read + insert + update, where the old column has all three (12).
grant select (published_to_web, published_to_web_at, published_to_web_by), insert (published_to_web, published_to_web_at, published_to_web_by), update (published_to_web, published_to_web_at, published_to_web_by) on agent.term_list to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by), insert (published_to_web, published_to_web_at, published_to_web_by), update (published_to_web, published_to_web_at, published_to_web_by) on ai.endpoint to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by), insert (published_to_web, published_to_web_at, published_to_web_by), update (published_to_web, published_to_web_at, published_to_web_by) on ai.offering to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by), insert (published_to_web, published_to_web_at, published_to_web_by), update (published_to_web, published_to_web_at, published_to_web_by) on crm.sending_identity to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by), insert (published_to_web, published_to_web_at, published_to_web_by), update (published_to_web, published_to_web_at, published_to_web_by) on docproc.processed_documents to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by), insert (published_to_web, published_to_web_at, published_to_web_by), update (published_to_web, published_to_web_at, published_to_web_by) on files.files to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by), insert (published_to_web, published_to_web_at, published_to_web_by), update (published_to_web, published_to_web_at, published_to_web_by) on hr.employer_profile to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by), insert (published_to_web, published_to_web_at, published_to_web_by), update (published_to_web, published_to_web_at, published_to_web_by) on hr.kiosk_device to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by), insert (published_to_web, published_to_web_at, published_to_web_by), update (published_to_web, published_to_web_at, published_to_web_by) on hr.provider_binding to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by), insert (published_to_web, published_to_web_at, published_to_web_by), update (published_to_web, published_to_web_at, published_to_web_by) on rag.library_docs to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by), insert (published_to_web, published_to_web_at, published_to_web_by), update (published_to_web, published_to_web_at, published_to_web_by) on seo.collection_run to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by), insert (published_to_web, published_to_web_at, published_to_web_by), update (published_to_web, published_to_web_at, published_to_web_by) on workflow.trigger to authenticated;

-- 3. Signed-in readers only, where the old column is read-only for them (5).
grant select (published_to_web, published_to_web_at, published_to_web_by) on iam.api_keys to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by) on iam.team to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by) on platform.action_request to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by) on platform.egress_device to authenticated;
grant select (published_to_web, published_to_web_at, published_to_web_by) on scraper.scrape_parsed_page to authenticated;
grant select (shown_to) on scraper.scrape_parsed_page to authenticated;

-- Proof inside the transaction: no role holds a privilege on the old column that it lacks on a new one
-- (anon: published_to_web only). Raises by name, so the file never lands half-right.
do $$
declare v_gap text;
begin
  select string_agg(format('%s %s %s.%s.%s', ro, pr, s, n, col), '; ') into v_gap
  from (select c0.table_schema s, c0.table_name n, c.column_name col
          from information_schema.columns c0
          join information_schema.columns c on c.table_schema = c0.table_schema and c.table_name = c0.table_name
           and c.column_name in ('published_to_web','published_to_web_at','published_to_web_by','shown_to')
         where c0.column_name = 'published_to_web') x
  cross join unnest(array['anon','authenticated','service_role']) ro
  cross join unnest(array['SELECT','INSERT','UPDATE']) pr
  where has_column_privilege(ro, format('%I.%I', s, n), 'visibility', pr)
    and not has_column_privilege(ro, format('%I.%I', s, n), col, pr)
    and not (ro = 'anon' and col <> 'published_to_web');
  if v_gap is not null then
    raise exception 't13_new_row_columns_not_granted_like_the_old: %', v_gap;
  end if;
end $$;
