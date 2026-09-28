-- lane: access-ladder T-21
-- Access ladder T-21 (2026-09-28), follow-up to 04/17/19:
--  * billing.usage_ledger and rag.retrieval_audit left the owner-only `personal` variant for Organization and
--    need a declared list landing place (iam.verify_canonical default_list_scope_set). Each row is one person's
--    usage or retrieval, so their lists open on "mine" — a list choice, never a lock (the access ladder law).
--  * legal.ingest_runs' organization foreign key needs a covering index before it can be validated
--    (provision_shape_guard). The table is small; a plain index build holds it for milliseconds.
set local lock_timeout = '3s';
set local statement_timeout = '120s';

update platform.entity_types set default_list_scope = 'mine'
 where token in ('billing_usage_ledger', 'retrieval_audit') and default_list_scope is null;

create index if not exists ingest_runs_organization_id_idx on legal.ingest_runs (organization_id);
