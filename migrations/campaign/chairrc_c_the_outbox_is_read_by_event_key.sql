-- chair-step: CREATE INDEX CONCURRENTLY on custom.io_outbox (written by every record write, so never a
-- plain CREATE INDEX). Autocommit: apply through aidream's runner, which sends it outside a transaction.
-- Serves every per-consumer read (custom._io_outbox_claim, io_outbox_pending_organizations,
-- io_outbox_backlog): event key first, then organization, in created order. Correct without it, slower.
-- Lane CHAIR-RECORD-CHANGED, 2026-10-02; apply after chairrc_b_every_consumer_drains_on_its_own.sql.
create index concurrently if not exists io_outbox_event_key_organization_created_idx
  on custom.io_outbox (event_key, organization_id, created_at, id)
  where deleted_at is null;
