-- chair-step: the inverse of gridtails_a_stored_plural_loses_the_machines_extra_s.sql. It puts back the EXACT prior `label_plural` of every Table that file changed, read from campaign_watch.gridtails_plural_repair, and only where the plural is still the value that file wrote (a plural somebody changed since is theirs and is left alone). Then it drops that list, which only the up file wrote and only this file read. Every row goes through custom.record's own triggers (history captures each one).
-- lane: GRID-TAILS
-- lock: custom

set local lock_timeout = '2s';
set local statement_timeout = '120s';

update custom.record r
   set data = jsonb_set(r.data, '{label_plural}', to_jsonb(a.prior_label_plural))
  from campaign_watch.gridtails_plural_repair a
 where r.organization_id = a.organization_id
   and r.id = a.record_id
   and r.table_id = custom.table_kernel_id()
   and r.data ->> 'label_plural' = a.repaired_label_plural;

drop table if exists campaign_watch.gridtails_plural_repair;
