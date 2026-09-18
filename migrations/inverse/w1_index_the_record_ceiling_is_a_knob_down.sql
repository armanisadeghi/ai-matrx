-- target: branch
--
-- THE INVERSE of `migrations/campaign/w1_index_the_record_ceiling_is_a_knob.sql` (§4.13,
-- rule 27). It restores the prior state exactly: neither `custom.table_capacity` nor the
-- one-argument `custom.table_record_ceiling` exists.
--
-- IT IS `-- target: branch` ON PURPOSE, like every other inverse here: an inverse is a DROP,
-- which rule 9 forbids on production in any lane.
--
-- THE ZERO-ARGUMENT `custom.table_record_ceiling()` IS NOT TOUCHED. It belongs to
-- `w1_index_the_promotion_layer.sql` and has its own inverse; dropping it here would make two
-- files' inverses fight over one object. THE KNOB ROW IS NOT TOUCHED EITHER — it belongs to
-- `w1_index_the_record_ceiling_knob.sql`, and `…_knob_down.sql` is what removes it.

set lock_timeout = '5s';
set statement_timeout = '600s';

drop function if exists custom.table_capacity(uuid, uuid);
drop function if exists custom.table_record_ceiling(uuid);
