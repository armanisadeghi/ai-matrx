-- Lexical replay bootstrap for the crawler-artifact cutover. All crawl output
-- was explicitly declared disposable; preserve sites/catalog/configuration but
-- remove captured/test rows before any later migration requires file UUIDs.

do $$
declare
  v_has_legacy boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'web' and table_name = 'snapshot'
      and column_name = 'body_ref'
  ) or exists (
    select 1 from information_schema.columns
    where table_schema = 'web' and table_name = 'screenshot'
      and column_name in ('storage_bucket', 'storage_path')
  ) into v_has_legacy;

  alter table web.snapshot
    add column if not exists body_file_id uuid,
    add column if not exists markdown_file_id uuid;
  alter table web.screenshot
    add column if not exists file_id uuid;

  -- Live environments that already completed the cutover have no legacy
  -- columns and must retain their accepted canonical crawls.
  if not v_has_legacy then
    return;
  end if;

  update web.site set homepage_screenshot_id = null
  where homepage_screenshot_id is not null;
  update web.crawl_schedule set last_session_id = null
  where last_session_id is not null;
  update web.page set latest_snapshot_id = null
  where latest_snapshot_id is not null;

  -- The old immutable-history triggers intentionally reject ordinary deletes.
  -- Disable only user triggers on the disposable tables for this transaction;
  -- FK constraint triggers remain active and enforce the deletion order.
  alter table web.finding disable trigger user;
  alter table web.batch_item disable trigger user;
  alter table web.analysis_result disable trigger user;
  alter table web.batch_job disable trigger user;
  alter table web.crawl_event disable trigger user;
  alter table web.screenshot disable trigger user;
  alter table web.link_edge disable trigger user;
  alter table web.crawl_url disable trigger user;
  alter table web.snapshot disable trigger user;
  alter table web.page_evidence disable trigger user;
  alter table web.page disable trigger user;
  alter table web.crawl_session disable trigger user;
  delete from web.finding;
  delete from web.batch_item;
  delete from web.analysis_result;
  delete from web.batch_job;
  delete from web.crawl_event;
  delete from web.screenshot;
  delete from web.link_edge;
  delete from web.crawl_url;
  delete from web.snapshot;
  delete from web.page_evidence;
  delete from web.page;
  delete from web.crawl_session;
  alter table web.finding enable trigger user;
  alter table web.batch_item enable trigger user;
  alter table web.analysis_result enable trigger user;
  alter table web.batch_job enable trigger user;
  alter table web.crawl_event enable trigger user;
  alter table web.screenshot enable trigger user;
  alter table web.link_edge enable trigger user;
  alter table web.crawl_url enable trigger user;
  alter table web.snapshot enable trigger user;
  alter table web.page_evidence enable trigger user;
  alter table web.page enable trigger user;
  alter table web.crawl_session enable trigger user;

  if exists (select 1 from web.snapshot)
     or exists (select 1 from web.screenshot)
     or exists (select 1 from web.page)
     or exists (select 1 from web.crawl_session) then
    raise exception 'disposable legacy crawler data was not fully wiped'
      using errcode = '55000';
  end if;
end;
$$;
