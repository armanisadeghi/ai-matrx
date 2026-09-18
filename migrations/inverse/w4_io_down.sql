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
drop trigger if exists io_record_changed on custom.record;

drop view if exists custom.record_outbox;

drop function if exists custom.io_outbox_announce();
drop function if exists custom.io_record_changed();
drop function if exists custom.io_outbox_drain(uuid, text, integer, text);
drop function if exists custom.io_outbox_release(uuid, text, interval);
drop function if exists custom.io_changed_field_ids(uuid, uuid, jsonb, jsonb);
drop function if exists custom.io_changed_keys(jsonb, jsonb);
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
drop table if exists custom.io_outbox;

delete from platform.entity_types where token in ('io_outbox', 'io_import', 'io_comment');
