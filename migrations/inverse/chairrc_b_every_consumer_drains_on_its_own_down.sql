-- chair-step: drops the two per-consumer tables. Part A's doors fall back to io_outbox.consumed_at the
-- moment they are gone. Events consumed only in the per-consumer world (after Part B, before this)
-- read as waiting again for context-follow; its copy is idempotent, so a re-carry changes nothing.
drop table if exists custom.io_outbox_consumption;
drop table if exists custom.io_outbox_consumer;
