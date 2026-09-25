-- Inverse of migrations/campaign/sc2_the_context_copy_follows_the_current_screens.sql (lane SC-2').
-- Drops the four follow triggers and their function. The outbox rows already written stay (they
-- are the store's own record of what changed; the compare panel's lag reader counts them) — the
-- follow simply stops being told. Nothing in the old context tables is touched.
-- window-class: DROP TRIGGER takes ACCESS EXCLUSIVE on the four small context tables for the
--   length of this transaction; run under lock_timeout.

set local lock_timeout = '2s';
set local statement_timeout = '120s';

drop trigger if exists zz_follow_to_the_copy on context.context_item_values;
drop trigger if exists zz_follow_to_the_copy on context.scopes;
drop trigger if exists zz_follow_to_the_copy on context.context_items;
drop trigger if exists zz_follow_to_the_copy on context.scope_types;
drop function if exists context._follow_to_the_copy();
