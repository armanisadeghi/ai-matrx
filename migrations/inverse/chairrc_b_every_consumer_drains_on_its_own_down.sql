-- chair-step: drops the two per-consumer tables. Part A's doors fall back to io_outbox.consumed_at the
-- moment they are gone. Events consumed only in the per-consumer world (after Part B, before this)
-- read as waiting again for context-follow; its copy is idempotent, so a re-carry changes nothing.
--
-- ground-standing-ok: a
--   The trigger context._follow_to_the_copy (zz_follow_to_the_copy on context.scope_types, context_items,
--   scopes) reaches custom.io_outbox_consumption only through custom.io_outbox_rearm, and only behind
--   `if custom.io_outbox_per_consumer()` (a to_regclass test on both tables); io_outbox_rearm itself
--   returns at once when that test is false and touches the table by dynamic SQL alone. With the tables
--   gone the trigger takes the old consumed_at path it took before Part B. Read off production's bodies
--   2026-10-03 and run on the clone by rule 27 (up, this file, a context edit, up again).
delete from platform.entity_types where token in ('custom_io_outbox_consumption', 'custom_io_outbox_consumer');
drop table if exists custom.io_outbox_consumption;
drop table if exists custom.io_outbox_consumer;
