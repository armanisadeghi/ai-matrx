-- chair-step: drops the per-consumer read index on custom.io_outbox (CONCURRENTLY; autocommit).
drop index concurrently if exists custom.io_outbox_event_key_organization_created_idx;
