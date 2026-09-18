-- target: branch
--
-- THE INVERSE of `migrations/campaign/w1_index_the_record_ceiling_knob.sql` (§4.13, rule 27):
-- `platform.feature_knob` holds no `custom/table_record_ceiling` row.
--
-- IT IS `-- target: branch` ON PURPOSE, like every other inverse here: an inverse is a DELETE,
-- which rule 9 forbids on production in any lane.
--
-- THE ROW IS DELETED ONLY IF NOBODY SET ONE. An organization override is a customer's
-- decision, and an inverse that silently erased it would be undoing somebody else's work
-- rather than its own — so the delete is refused, by name, while an override exists.

set lock_timeout = '5s';
set statement_timeout = '600s';

do $$
declare v_overrides integer;
begin
  select count(*) into v_overrides
    from platform.knob_override o
   where o.feature = 'custom' and o.key = 'table_record_ceiling';

  if v_overrides > 0 then
    raise exception 'custom/table_record_ceiling still carries % organization override(s), so this inverse will not delete the knob it belongs to', v_overrides
      using errcode = '23503',
            hint = 'Remove the overrides through the knob door first. An inverse undoes its own file and never a customer''s setting.';
  end if;

  delete from platform.feature_knob where feature = 'custom' and key = 'table_record_ceiling';
end $$;
