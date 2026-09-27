-- chair-step: a unique index cannot gain a predicate in place; each of the 8 is dropped and recreated with the same columns plus deleted_at IS NULL (strictly wider — no write that succeeds today can fail), in one transaction, reviewed adversarially 2026-09-27.
-- soft_delete_partial_unique_mcp_and_parsed_page.sql   (check:soft-delete-unique, 2026-09-27)
--
-- THE DEFECT: unique indexes that count soft-deleted rows, so removing a thing and making it again
-- is refused, naming a row nobody can see (pattern: soft_delete_partial_unique_indexes_context.sql).
--
-- scrape_parsed_page: NOT a live failure today — scraper.retire_identity_row_with_its_trash flips a
-- trashed row to validity 'stale', so it already leaves the validity='active' predicate (live, 2026-09-27:
-- 84 removed rows, 0 still active). The predicate is added so uniqueness no longer rests on that
-- trigger alone; aidream landing.py looks up only live rows before it creates.
--
-- THE FIX (8 indexes): add `deleted_at IS NULL` to the predicate. A partial unique index accepts
-- strictly more rows than the total one it replaces, so no write that succeeds today can fail.
-- Checked before writing: no DB function, ORM or PostgREST upsert infers ON CONFLICT on any of
-- these eight, and no foreign key depends on the three that are constraints.
--
-- KNOWN DORMANT EDGE (review 2026-09-27): upsert_mcp_connection and the two aidream reconnect paths
-- revive a removed row with deleted_at = NULL but keep its is_default. A removed DEFAULT, a new default
-- for the same provider, then a reconnect of the first would now hit *_default_per_provider (23505).
-- Unreachable today: every live mcp_server-provider row is is_default = false and only the scraper
-- credential path (server_id NULL, never revived there) sets a default. If that changes, clear
-- is_default on revive.
--
-- DELIBERATELY NOT CHANGED (recorded in scripts/soft-delete-unique-baseline.json `deliberate`):
--   tool.mcp_user_conn (created_by, server_id) / (user_id, server_id) — public.upsert_mcp_connection
--     does ON CONFLICT (created_by, server_id) … SET deleted_at = NULL: reconnecting RESTORES the
--     removed connection. Partial would break that inference and create a second row.
--   platform.comments client_request_id, platform.secure_delivery actor_token_id — idempotency /
--     single-use identities.
--   ops.check_item, ops.check_run, ops.proof_check — registry identities upserted by DB functions.
--   mandate.reference head — the revision chain's head rule; _reference_record_states' own head
--     test ignores deleted_at, consistent with the global index.


-- scraper.scrape_parsed_page (≈9k rows)
drop index scraper.scrape_parsed_page_identity_per_creator_uidx;
create unique index scrape_parsed_page_identity_per_creator_uidx on scraper.scrape_parsed_page
  (organization_id,
   coalesce(case when visibility = 'personal'::platform.visibility then created_by else null::uuid end,
            '00000000-0000-0000-0000-000000000000'::uuid),
   canonical_url)
  where validity::text = 'active' and deleted_at is null;

drop index scraper.scrape_parsed_page_identity_per_reach_uidx;
create unique index scrape_parsed_page_identity_per_reach_uidx on scraper.scrape_parsed_page
  (organization_id, coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), canonical_url)
  where validity::text = 'active' and deleted_at is null;

-- tool.mcp_server: a removed server's slug is free for a new one
alter table tool.mcp_server drop constraint tool_mcp_server_slug_key;
create unique index tool_mcp_server_slug_key on tool.mcp_server (slug) where deleted_at is null;

-- tool.mcp_config: one live config of each type per server
alter table tool.mcp_config drop constraint tool_mcp_config_server_id_config_type_key;
create unique index tool_mcp_config_server_id_config_type_key on tool.mcp_config (server_id, config_type)
  where deleted_at is null;

-- tool.mcp_user_conn: a removed default no longer blocks a new default for the provider
drop index tool.mcp_user_conn_created_by_default_per_provider;
create unique index mcp_user_conn_created_by_default_per_provider on tool.mcp_user_conn (created_by, provider)
  where is_default and deleted_at is null;

drop index tool.uq_tool_mcp_user_conn_default_per_provider;
create unique index uq_tool_mcp_user_conn_default_per_provider on tool.mcp_user_conn (user_id, provider)
  where is_default and deleted_at is null;

drop index tool.mcp_user_conn_created_by_credential_key;
create unique index mcp_user_conn_created_by_credential_key on tool.mcp_user_conn
  (created_by, provider, server_id, display_name) nulls not distinct where deleted_at is null;

alter table tool.mcp_user_conn drop constraint uq_tool_mcp_user_conn_credential;
create unique index uq_tool_mcp_user_conn_credential on tool.mcp_user_conn
  (user_id, provider, server_id, display_name) nulls not distinct where deleted_at is null;

-- Proof: all eight exist, are unique, valid, and carry the predicate.
do $$
declare v_bad text;
begin
  select string_agg(w.s || '.' || w.i, ', ') into v_bad
    from (values ('scraper','scrape_parsed_page_identity_per_creator_uidx'),
                 ('scraper','scrape_parsed_page_identity_per_reach_uidx'),
                 ('tool','tool_mcp_server_slug_key'),
                 ('tool','tool_mcp_config_server_id_config_type_key'),
                 ('tool','mcp_user_conn_created_by_default_per_provider'),
                 ('tool','uq_tool_mcp_user_conn_default_per_provider'),
                 ('tool','mcp_user_conn_created_by_credential_key'),
                 ('tool','uq_tool_mcp_user_conn_credential')) w(s, i)
    join pg_namespace n on n.nspname = w.s
    left join pg_class c on c.relnamespace = n.oid and c.relname = w.i
    left join pg_index x on x.indexrelid = c.oid
   where c.oid is null or not x.indisunique or not x.indisvalid
      or pg_get_indexdef(c.oid) not ilike '%deleted_at IS NULL%';
  if v_bad is not null then raise exception 'partial unique index proof failed: %', v_bad; end if;
end $$;
