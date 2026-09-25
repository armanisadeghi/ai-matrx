-- chair-step: the INVERSE of storetails3_every_archived_table_remembers_what_it_took.sql.
--   Withdraws exactly the archive events that repair reconstructed and nobody has used since:
--   each is stamped undone and `withdrawn: true` (a Migration log row is history and is never
--   deleted), so custom.record_restore no longer finds it and an archived table's restore goes
--   back to bringing back the table row alone. An event already used by a restore is left as it
--   is — that restore happened.
-- lock: custom
-- lane: STORE-TAILS-3

set local lock_timeout = '30s';
set local statement_timeout = '300s';

update history.migration_log m
   set undone_at = now(),
       inverse   = m.inverse || jsonb_build_object('withdrawn', true, 'withdrawn_by', 'storetails3_every_archived_table_remembers_what_it_took_down.sql')
 where m.verb = 'archive'
   and m.target_kind = 'table'
   and m.undone_at is null
   and coalesce((m.inverse ->> 'reconstructed')::boolean, false)
   and m.note like 'STORE-TAILS-3: % was archived before archive events existed;%';
