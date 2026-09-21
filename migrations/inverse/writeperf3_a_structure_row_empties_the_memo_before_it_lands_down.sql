-- additive: yes
--
-- chair-step: THE INVERSE of writeperf3_a_structure_row_empties_the_memo_before_it_lands.sql. It
--   removes the BEFORE-ROW trigger that empties the memo when a Table, a Field or a Rule is
--   written, which is what makes a Field's behaviour change visible to the nested update that
--   rewrites its values inside the same statement. Run for real by
--   scripts/campaign-tests/writeperf3_red.sql inside a rolled-back transaction.

drop trigger if exists _aa_memo_clear on custom.record;
drop function if exists platform.memo_clear_on_structure_row();
