-- chair-step: it inserts ONE row into `platform.metadata_reserved_keys`, the register that
--   declares which metadata keys are the platform's own state. That table is not on the
--   allow-list — rightly, since a file that could quietly widen the metadata key space would
--   defeat DD-060 — so the declaration is NAMED instead. It writes nothing else, drops
--   nothing, grants nothing and touches no organization's rows. The inverse is
--   `migrations/inverse/pipelines_an_options_position_is_system_state_down.sql`.
-- guard: custom/system_enabled
--
-- PIPELINES — an option's POSITION is system state, registered as such.
--
-- `platform._metadata_guard` (DD-060) refused `metadata -> 'option_position'` the moment the
-- previous file started writing it, which is the guard being right: the metadata column
-- belongs to the platform and a key nobody declared is user content smuggled into it.
--
-- This is the same declaration CHOICE-VALUE made for `option_key` on 2026-09-20, for the same
-- reason. FLD-5 keeps a choices Table to ONE title field, so neither the stable key nor the
-- position can be a column of it; both are facts the STORE keeps about an option, written
-- only by `custom._options_table_for`, never by a caller.

insert into platform.metadata_reserved_keys (table_token, key, reason)
values ('record', 'option_position',
        'The position of an option within its choice list: the 1-based place it was written '
        'in when the list was declared, stamped by custom._options_table_for and never sent '
        'by a caller. Every option of one list is inserted in ONE transaction, so created_at '
        'is identical across them and the only tiebreak left was a random uuid — measured on '
        'the main database 2026-09-20, a five-stage board declared Lead, Qualified, Proposal, '
        'Won, Lost drew Proposal, Lost, Qualified, Lead, Won. FLD-5 keeps a choices Table to '
        'one title field, which is why this is system state and not a column, exactly as '
        'option_key is.')
on conflict do nothing;
