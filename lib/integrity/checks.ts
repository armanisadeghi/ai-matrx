// lib/integrity/checks.ts
//
// The registry of data-integrity checks. Add an invariant here and both the
// admin UI and the CLI pick it up automatically.
//
// Conventions for "sql" checks:
//   - Select a few identifying columns so findings are actionable.
//   - ALWAYS include `count(*) over() as _total` and a `LIMIT` (the sample cap).
//   - Filter to live rows (`deleted_at is null`) unless the check is about
//     deleted/archived rows specifically.
//   - Schema-qualify every relation — these run through `execute_admin_query`,
//     not the client search_path (files.files / files.folders /
//     docproc.processed_documents after the 2026 schema reorg).
//
// NOTE on `storage_uri`: the S3 location is a SERVER-ONLY column — the column
// grant is revoked for `authenticated` and it must never appear in any client
// model or finding payload. The checks below may FILTER on it (they execute
// server-side via the SECURITY DEFINER admin-query path, which is unaffected
// by the revoke) but must never SELECT it into the sample rows.
//
// Focus today: the file system (`files.files` / `files.folders`) and the PDF
// document bridge (`docproc.processed_documents`), which is where the 2026-05
// AWS storage migration left orphans. The framework is general — checks for
// other domains can be appended to the same array.

import type { IntegrityCheckDef } from "./types";

const SAMPLE_LIMIT = 100;

// ── Security: definer-grant recurrence guard (D31 class) ────────────────────
//
// Known-good SECURITY DEFINER functions that are DELIBERATELY executable by
// `anon` with a caller-supplied identity param. Every entry needs a reason —
// an unexplained new anon grant is ALWAYS a finding (loud recovery). To clear
// a finding, either fix the function (auth.uid() check / revoke anon) or add
// it here with a real justification.
const DEFINER_GRANT_ALLOWLIST: ReadonlyArray<{
  functionName: string;
  reason: string;
}> = [
  {
    functionName: "check_upload_quota",
    reason: "Guest (no-JWT) upload flow must read quota before auth exists.",
  },
  {
    functionName: "get_usage_status",
    reason: "Guest (no-JWT) usage flow — read-only status for guest users.",
  },
  {
    functionName: "get_user_limits",
    reason: "Guest (no-JWT) limits read — read-only, no sensitive payload.",
  },
  {
    functionName: "check_rate_limit",
    reason: "Guest (no-JWT) rate limiting — must run pre-auth by design.",
  },
  {
    functionName: "accept_organization_invitation",
    reason: "Invite acceptance flow runs before the user has a session.",
  },
];

const DEFINER_GRANT_ALLOWLIST_VALUES = DEFINER_GRANT_ALLOWLIST.map(
  (e) =>
    `('${e.functionName}', '${e.reason.replace(/'/g, "''")}')`,
).join(",\n          ");

export const INTEGRITY_CHECKS: IntegrityCheckDef[] = [
  // ── Files: dead / missing source bytes ────────────────────────────────────
  {
    id: "cld-files-unrecoverable-visible",
    kind: "sql",
    title: "Visible files with unrecoverable source",
    category: "Files",
    severity: "error",
    description:
      "Live (non-deleted) files.files rows whose storage location is marked " +
      "'unrecoverable://…'. The original bytes are gone (orphaned by the " +
      "2026-05 AWS storage migration) but the file still appears in the user's " +
      "tree and fails to open.",
    remediation:
      "Soft-delete or re-upload the original. These are the files that 'fail " +
      "to load with no error' for users — they should not be browseable.",
    sql: `
      select id, file_name, created_by, mime_type, created_at,
             count(*) over() as _total
      from files.files
      where deleted_at is null
        and storage_uri like 'unrecoverable://%'
      order by created_at desc
      limit ${SAMPLE_LIMIT}
    `,
  },
  {
    id: "cld-files-missing-storage-uri",
    kind: "sql",
    title: "Files with no storage location",
    category: "Files",
    severity: "error",
    description:
      "Live files.files rows with a null or empty storage location. The " +
      "server has nowhere to fetch bytes from — guaranteed load failure.",
    remediation:
      "Investigate how the row was created without a storage location; " +
      "re-upload or soft-delete.",
    sql: `
      select id, file_name, created_by, mime_type, created_at,
             count(*) over() as _total
      from files.files
      where deleted_at is null
        and (storage_uri is null or storage_uri = '')
      order by created_at desc
      limit ${SAMPLE_LIMIT}
    `,
  },
  // ── Files: referential integrity ──────────────────────────────────────────
  {
    id: "cld-files-dangling-parent-folder",
    kind: "sql",
    title: "Files pointing at a missing folder",
    category: "Files",
    severity: "error",
    description:
      "Live files.files rows whose parent_folder_id references a files.folders " +
      "row that does not exist (or was hard-deleted). Breaks tree rendering.",
    remediation:
      "Re-parent to the owner's root, or soft-delete if the file is itself " +
      "orphaned.",
    sql: `
      select f.id, f.file_name, f.created_by, f.parent_folder_id,
             count(*) over() as _total
      from files.files f
      where f.deleted_at is null
        and f.parent_folder_id is not null
        and not exists (
          select 1 from files.folders d where d.id = f.parent_folder_id
        )
      limit ${SAMPLE_LIMIT}
    `,
  },
  {
    id: "cld-files-dangling-duplicate-of",
    kind: "sql",
    title: "Files referencing a missing duplicate target",
    category: "Files",
    severity: "warning",
    description:
      "Live files.files rows whose duplicate_of_file_id references a files.files " +
      "row that no longer exists. Dedup lineage is broken.",
    remediation: "Clear duplicate_of_file_id or re-link to the surviving copy.",
    sql: `
      select f.id, f.file_name, f.created_by, f.duplicate_of_file_id,
             count(*) over() as _total
      from files.files f
      where f.deleted_at is null
        and f.duplicate_of_file_id is not null
        and not exists (
          select 1 from files.files d where d.id = f.duplicate_of_file_id
        )
      limit ${SAMPLE_LIMIT}
    `,
  },
  {
    id: "cld-folders-dangling-parent",
    kind: "sql",
    title: "Folders pointing at a missing parent folder",
    category: "Files",
    severity: "error",
    description:
      "Live files.folders rows whose parent_id references a folder that does " +
      "not exist. Produces unreachable subtrees.",
    remediation: "Re-parent to root or soft-delete the orphaned subtree.",
    sql: `
      select d.id, d.folder_name, d.created_by, d.parent_id,
             count(*) over() as _total
      from files.folders d
      where d.deleted_at is null
        and d.parent_id is not null
        and not exists (
          select 1 from files.folders p where p.id = d.parent_id
        )
      limit ${SAMPLE_LIMIT}
    `,
  },
  // ── PDF / document bridge ─────────────────────────────────────────────────
  {
    id: "cld-bridge-missing-doc",
    kind: "sql",
    title: "Bridge points at a missing processed_document",
    category: "PDF / Documents",
    severity: "error",
    description:
      "files.files.canonical_processed_document_id references a " +
      "docproc.processed_documents row that does not exist. The PDF surface " +
      "bridge is broken — fileId↔docId resolution fails.",
    remediation:
      "Null the bridge column and let the maintenance trigger re-link, or " +
      "re-run extraction.",
    sql: `
      select f.id, f.file_name, f.created_by, f.canonical_processed_document_id,
             count(*) over() as _total
      from files.files f
      where f.deleted_at is null
        and f.canonical_processed_document_id is not null
        and not exists (
          select 1 from docproc.processed_documents p
          where p.id = f.canonical_processed_document_id
        )
      limit ${SAMPLE_LIMIT}
    `,
  },
  {
    id: "cld-bridge-archived-doc",
    kind: "sql",
    title: "Bridge points at an archived processed_document",
    category: "PDF / Documents",
    severity: "warning",
    description:
      "files.files.canonical_processed_document_id references a " +
      "docproc.processed_documents row that is archived. The canonical doc for " +
      "a live file should not be archived — surfaces may show stale/empty " +
      "content.",
    remediation:
      "Re-point the bridge to the live canonical doc, or unarchive the target.",
    sql: `
      select f.id, f.file_name, f.created_by, f.canonical_processed_document_id,
             count(*) over() as _total
      from files.files f
      join docproc.processed_documents p
        on p.id = f.canonical_processed_document_id
      where f.deleted_at is null
        and p.archived_at is not null
      limit ${SAMPLE_LIMIT}
    `,
  },
  {
    id: "processed-docs-orphaned",
    kind: "sql",
    title: "Processed documents with no source file",
    category: "PDF / Documents",
    severity: "warning",
    description:
      "Non-archived docproc.processed_documents with source_kind='cld_file' " +
      "whose source_id does not match any files.files row. The derived " +
      "document has no physical source.",
    remediation:
      "Archive the orphaned document (text is preserved) or restore the source " +
      "file if it exists elsewhere.",
    sql: `
      select p.id, p.name, p.owner_id, p.source_id,
             count(*) over() as _total
      from docproc.processed_documents p
      where p.source_kind = 'cld_file'
        and p.archived_at is null
        and not exists (
          select 1 from files.files f where f.id::text = p.source_id
        )
      limit ${SAMPLE_LIMIT}
    `,
  },
  {
    id: "processed-docs-on-deleted-file",
    kind: "sql",
    title: "Processed documents on a soft-deleted file",
    category: "PDF / Documents",
    severity: "warning",
    description:
      "Non-archived docproc.processed_documents whose source files.files row " +
      "is soft-deleted. The document is live but its source is gone from the " +
      "tree.",
    remediation:
      "Archive the document alongside its deleted source, or undelete the file.",
    sql: `
      select p.id, p.name, p.owner_id, p.source_id,
             count(*) over() as _total
      from docproc.processed_documents p
      where p.source_kind = 'cld_file'
        and p.archived_at is null
        and exists (
          select 1 from files.files f
          where f.id::text = p.source_id and f.deleted_at is not null
        )
      limit ${SAMPLE_LIMIT}
    `,
  },
  // ── Security: definer-grant recurrence guard ──────────────────────────────
  {
    id: "definer-grant-anon-identity",
    kind: "sql",
    title: "SECURITY DEFINER functions anon can call with a caller-supplied identity",
    category: "Security",
    severity: "error",
    description:
      "The D31 class: a SECURITY DEFINER function EXECUTE-granted to anon (or " +
      "PUBLIC, which anon inherits), taking a caller-supplied identity param " +
      "(p_user_id / p_actor / p_org_id / *_email / …), with no auth.uid() / " +
      "auth.role() / is_super_admin / service_role check in its body. Any " +
      "unauthenticated caller can impersonate any user — this exact pattern " +
      "leaked decrypted MCP OAuth tokens. Scans EVERY PostgREST-exposed " +
      "schema (read live from the authenticator role's pgrst.db_schemas " +
      "setting, so it adapts as schemas are exposed). Known-good exceptions " +
      "are allowlisted IN the check with a reason each (" +
      DEFINER_GRANT_ALLOWLIST.map((e) => e.functionName).join(", ") +
      "); an unexplained new anon grant is always a finding.",
    remediation:
      "Either the function must derive identity from auth.uid() (drop the " +
      "identity param) / verify the caller inside its body, or its EXECUTE " +
      "grant must be revoked from anon/PUBLIC (GRANT to authenticated / " +
      "service_role only). If the anon grant is genuinely required (guest " +
      "flow), add the function to DEFINER_GRANT_ALLOWLIST in " +
      "lib/integrity/checks.ts with the reason.",
    sql: `
      with exposed as (
        select distinct trim(both ' "' from schema_name) as schema_name
        from pg_catalog.pg_db_role_setting rs
        join pg_catalog.pg_roles r on r.oid = rs.setrole
        cross join lateral unnest(rs.setconfig) as cfg
        cross join lateral regexp_split_to_table(split_part(cfg, '=', 2), ',') as schema_name
        where r.rolname = 'authenticator'
          and cfg like 'pgrst.db_schemas=%'
      ),
      allowlist(function_name, reason) as (
        values
          ${DEFINER_GRANT_ALLOWLIST_VALUES}
      )
      select n.nspname as schema,
             p.proname as function,
             pg_get_function_identity_arguments(p.oid) as params,
             case
               when p.proacl is null then 'PUBLIC (default acl)'
               when exists (
                 select 1 from aclexplode(p.proacl) a
                 join pg_catalog.pg_roles g on g.oid = a.grantee
                 where g.rolname = 'anon' and a.privilege_type = 'EXECUTE'
               ) then 'anon'
               when exists (
                 select 1 from aclexplode(p.proacl) a
                 where a.grantee = 0 and a.privilege_type = 'EXECUTE'
               ) then 'PUBLIC'
               else 'inherited'
             end as granted_via,
             count(*) over() as _total
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      join exposed e on e.schema_name = n.nspname
      join pg_catalog.pg_language l on l.oid = p.prolang
      where p.prosecdef
        and p.prokind = 'f'
        and l.lanname in ('sql', 'plpgsql')
        and has_function_privilege('anon', p.oid, 'EXECUTE')
        and pg_get_function_identity_arguments(p.oid)
          ~* '\\m(p_user|p_uid|p_actor|p_actor_id|p_target_user|p_created_by|[a-z_]*user_id|[a-z_]*org_id|[a-z_]*organization_id|[a-z_]*owner_id|[a-z_]*account_id|[a-z_]*member_id|[a-z_]*email[a-z_]*)\\M'
        and coalesce(p.prosrc, '') !~* '(auth\\.uid|auth\\.role|auth\\.jwt|is_super_admin|service_role)'
        and not exists (
          select 1 from allowlist a where a.function_name = p.proname
        )
      order by n.nspname, p.proname
      limit ${SAMPLE_LIMIT}
    `,
  },
  // ── Files: S3 byte liveness (opt-in, HTTP probe) ──────────────────────────
  {
    id: "cld-pdfs-dead-source-probe",
    kind: "probe",
    title: "PDF source bytes missing (live probe)",
    category: "Files",
    severity: "error",
    description:
      "Probes the download endpoint (Range bytes=0-0) for live s3-backed PDFs " +
      "and buckets any 404/410/500 as a dead source. This is the only way to " +
      "find files whose bytes silently vanished without an 'unrecoverable://' " +
      "flag. Bounded sample; requires an auth token, and only covers files the " +
      "token can access (no cross-user service token exists yet).",
    remediation:
      "Mark confirmed-dead files 'unrecoverable://' (or soft-delete) so they " +
      "stop appearing as healthy. A full cross-user audit needs a backend " +
      "service endpoint with S3 access.",
    failureStatuses: [404, 410, 500, 502, 503],
    candidateSql: `
      select id, file_name, created_by as owner_id
      from files.files
      where deleted_at is null
        and mime_type = 'application/pdf'
        and storage_uri like 's3://%'
      order by created_at desc
      limit 50
    `,
  },
];
