-- chair-step: the inverse of W4-IO — drops the objects this lane created, in dependency order, and nothing it did not create
--
-- W4-IO — THE INVERSE.
--
-- Everything W4-IO added and NOTHING else. It does not touch `custom.record`, the kernel, the
-- read door, `platform.client_callable_door` rows belonging to other lanes, or
-- `iam.entity_read_kernel_expected()` — re-recording that expectation was a measurement of a
-- state another lane created, and un-recording it would put the provisioner back into refusing
-- every table for a kernel that has legitimately moved.
--
-- IT DROPS THE EVENT TRIGGER AND `platform.reopen_declared_doors` TOO. They are this lane's,
-- even though they live in `platform` — the class fix went where the class lives.

set lock_timeout = '5s';
set statement_timeout = '600s';

drop event trigger if exists platform_reopen_declared_doors;
drop function if exists platform._reopen_declared_doors_after_revoke();
drop function if exists platform.reopen_declared_doors(text);

drop trigger if exists io_outbox_announce on custom.io_outbox;
-- 🚨 RE-POINTED TO THE LIVE TRIGGERS (lane RED-SUITES-3, 2026-09-21). This file named only the
-- ROW-level trigger `io_record_changed`, and
-- `writeperf2_the_after_triggers_fire_once_per_statement.sql` replaced it with a STATEMENT-level
-- trio (`io_record_changed_s_i` / `_s_u` / `_s_d` over `custom.io_record_changed_stmt_insert` /
-- `_stmt_update` / `_stmt_delete`). Those three bodies call `custom.io_changed_field_ids` and
-- `custom.io_changed_keys` and write into `custom.io_outbox` — all three dropped below — so as
-- written this inverse left live triggers calling functions and a table that no longer existed,
-- and the next write to `custom.record` in the transaction would have died on that rather than
-- on the defect this file exists to restore. The same class took `storerel_red` out for a whole
-- session. The triggers come off BEFORE their functions.
drop trigger if exists io_record_changed     on custom.record;
drop trigger if exists io_record_changed_s_i on custom.record;
drop trigger if exists io_record_changed_s_u on custom.record;
drop trigger if exists io_record_changed_s_d on custom.record;

drop view if exists custom.record_outbox;

drop function if exists custom.io_outbox_announce();
drop function if exists custom.io_record_changed();
drop function if exists custom.io_record_changed_stmt_insert();
drop function if exists custom.io_record_changed_stmt_update();
drop function if exists custom.io_record_changed_stmt_delete();
drop function if exists custom.io_outbox_drain(uuid, text, integer, text);
drop function if exists custom.io_outbox_release(uuid, text, interval);
drop function if exists custom.io_changed_field_ids(uuid, uuid, jsonb, jsonb);
-- 🚨 `custom.io_changed_keys` STAYS STANDING (lane INVERSE-GUARD, 2026-09-21).
-- `custom.history_changes` (`histscreens_a_record_can_say_who_changed_it.sql`, a later lane on
-- the live read path) calls it to say which keys a revision moved. Dropping it took the
-- history screen's ground away, which is not the defect this file restores: with the outbox
-- triggers detached above and every io_* door gone below, nothing announces a change any more,
-- which is precisely the prior state.
drop function if exists custom.io_csv_parse(text, text);
drop function if exists custom.io_csv_escape(text, text);
drop function if exists custom.io_infer_type(jsonb);
drop function if exists custom.io_import_open(uuid, uuid, text, text, jsonb);
drop function if exists custom.io_import_rows(uuid, uuid, jsonb, jsonb);
drop function if exists custom.io_proposal_accept(uuid, uuid, text, text, text);
drop function if exists custom.io_proposal_reject(uuid, uuid, text);
drop function if exists custom.io_export(uuid, uuid, text[], integer, text);
drop function if exists custom.io_export_csv(uuid, uuid, text[], integer, text, text);
drop function if exists custom.io_comment_write(uuid, uuid, text, jsonb, uuid);
drop function if exists custom.io_comment_resolve(uuid, uuid, boolean);
drop function if exists custom.io_comments(uuid, uuid, boolean);
drop function if exists custom.io_revisions(uuid, uuid);
drop function if exists custom.io_restore(uuid, uuid, integer);

delete from platform.client_callable_door
 where schema_name in ('custom', 'platform')
   and function_name in ('io_outbox_drain', 'io_outbox_release', 'io_import_open',
                         'io_import_rows', 'io_proposal_accept', 'io_proposal_reject',
                         'io_export', 'io_export_csv', 'io_comment_write', 'io_comment_resolve',
                         'io_comments', 'io_revisions', 'io_restore', 'reopen_declared_doors');

drop table if exists custom.io_comment;
drop table if exists custom.io_import;
-- 🚨 `custom.io_outbox` STAYS STANDING, AND IS EMPTIED INSTEAD (lane INVERSE-GUARD,
-- 2026-09-21). `custom.agg_digest_assemble`
-- (`digests_the_cadence_the_quiet_hours_and_the_real_digest.sql`, a later lane) reads this
-- table to build a real digest, so dropping it took the digest's ground away. The table stays
-- and carries nothing: the three statement-level capture triggers and `io_outbox_announce` are
-- detached above and every door that drains or releases it is gone below, so nothing writes to
-- it and nothing reads it for an outbox any more. That is the defect — no outbox behaviour —
-- with the platform's ground left standing.
delete from custom.io_outbox;

-- 🚨 THE REGISTRY ROW IS NOT ALONE ANY MORE (lane RED-SUITES-3, 2026-09-21). A registered
-- token has grown dependants since this inverse was written: the data-lifecycle platform
-- gives every enlisted entity a `platform.lifecycle_entity_plan` row, and
-- `lifecycle_entity_plan_entity_token_fkey` made this DELETE refuse by name —
--     update or delete on table "entity_types" violates foreign key constraint
--     "lifecycle_entity_plan_entity_token_fkey" on table "lifecycle_entity_plan"
--     Key (token)=(io_comment) is still referenced
-- which killed the inverse two statements from its end. The plan and the archive ledger are
-- the registry's own bookkeeping about a token, so they go when the token goes; nothing that
-- belongs to a person is touched here.
delete from platform.lifecycle_archive_row where entity_token in ('io_outbox', 'io_import', 'io_comment');
delete from platform.lifecycle_entity_plan  where entity_token in ('io_outbox', 'io_import', 'io_comment');
delete from platform.retention_policy       where entity_token in ('io_outbox', 'io_import', 'io_comment');
delete from platform.entity_types where token in ('io_outbox', 'io_import', 'io_comment');
