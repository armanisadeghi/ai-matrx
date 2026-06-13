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
//
// Focus today: the file system (`cld_files` / `cld_folders`) and the PDF
// document bridge (`processed_documents`), which is where the 2026-05 AWS
// storage migration left orphans. The framework is general — checks for other
// domains can be appended to the same array.

import type { IntegrityCheckDef } from "./types";

const SAMPLE_LIMIT = 100;

export const INTEGRITY_CHECKS: IntegrityCheckDef[] = [
  // ── Files: dead / missing source bytes ────────────────────────────────────
  {
    id: "cld-files-unrecoverable-visible",
    kind: "sql",
    title: "Visible files with unrecoverable source",
    category: "Files",
    severity: "error",
    description:
      "Live (non-deleted) cld_files rows whose storage_uri is marked " +
      "'unrecoverable://…'. The original bytes are gone (orphaned by the " +
      "2026-05 AWS storage migration) but the file still appears in the user's " +
      "tree and fails to open.",
    remediation:
      "Soft-delete or re-upload the original. These are the files that 'fail " +
      "to load with no error' for users — they should not be browseable.",
    sql: `
      select id, file_name, owner_id, mime_type, created_at,
             count(*) over() as _total
      from cld_files
      where deleted_at is null
        and storage_uri like 'unrecoverable://%'
      order by created_at desc
      limit ${SAMPLE_LIMIT}
    `,
  },
  {
    id: "cld-files-missing-storage-uri",
    kind: "sql",
    title: "Files with empty storage_uri",
    category: "Files",
    severity: "error",
    description:
      "Live cld_files rows with a null or empty storage_uri. The handler has " +
      "no location to fetch bytes from — guaranteed load failure.",
    remediation:
      "Investigate how the row was created without a storage location; " +
      "re-upload or soft-delete.",
    sql: `
      select id, file_name, owner_id, mime_type, created_at,
             count(*) over() as _total
      from cld_files
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
      "Live cld_files rows whose parent_folder_id references a cld_folders row " +
      "that does not exist (or was hard-deleted). Breaks tree rendering.",
    remediation:
      "Re-parent to the owner's root, or soft-delete if the file is itself " +
      "orphaned.",
    sql: `
      select f.id, f.file_name, f.owner_id, f.parent_folder_id,
             count(*) over() as _total
      from cld_files f
      where f.deleted_at is null
        and f.parent_folder_id is not null
        and not exists (
          select 1 from cld_folders d where d.id = f.parent_folder_id
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
      "Live cld_files rows whose duplicate_of_file_id references a cld_files " +
      "row that no longer exists. Dedup lineage is broken.",
    remediation: "Clear duplicate_of_file_id or re-link to the surviving copy.",
    sql: `
      select f.id, f.file_name, f.owner_id, f.duplicate_of_file_id,
             count(*) over() as _total
      from cld_files f
      where f.deleted_at is null
        and f.duplicate_of_file_id is not null
        and not exists (
          select 1 from cld_files d where d.id = f.duplicate_of_file_id
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
      "Live cld_folders rows whose parent_id references a folder that does not " +
      "exist. Produces unreachable subtrees.",
    remediation: "Re-parent to root or soft-delete the orphaned subtree.",
    sql: `
      select d.id, d.folder_name, d.owner_id, d.parent_id,
             count(*) over() as _total
      from cld_folders d
      where d.deleted_at is null
        and d.parent_id is not null
        and not exists (
          select 1 from cld_folders p where p.id = d.parent_id
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
      "cld_files.canonical_processed_document_id references a processed_documents " +
      "row that does not exist. The PDF surface bridge is broken — fileId↔docId " +
      "resolution fails.",
    remediation:
      "Null the bridge column and let the maintenance trigger re-link, or " +
      "re-run extraction.",
    sql: `
      select f.id, f.file_name, f.owner_id, f.canonical_processed_document_id,
             count(*) over() as _total
      from cld_files f
      where f.deleted_at is null
        and f.canonical_processed_document_id is not null
        and not exists (
          select 1 from processed_documents p
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
      "cld_files.canonical_processed_document_id references a processed_documents " +
      "row that is archived. The canonical doc for a live file should not be " +
      "archived — surfaces may show stale/empty content.",
    remediation:
      "Re-point the bridge to the live canonical doc, or unarchive the target.",
    sql: `
      select f.id, f.file_name, f.owner_id, f.canonical_processed_document_id,
             count(*) over() as _total
      from cld_files f
      join processed_documents p
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
      "Non-archived processed_documents with source_kind='cld_file' whose " +
      "source_id does not match any cld_files row. The derived document has no " +
      "physical source.",
    remediation:
      "Archive the orphaned document (text is preserved) or restore the source " +
      "file if it exists elsewhere.",
    sql: `
      select p.id, p.name, p.owner_id, p.source_id,
             count(*) over() as _total
      from processed_documents p
      where p.source_kind = 'cld_file'
        and p.archived_at is null
        and not exists (
          select 1 from cld_files f where f.id::text = p.source_id
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
      "Non-archived processed_documents whose source cld_files row is " +
      "soft-deleted. The document is live but its source is gone from the tree.",
    remediation:
      "Archive the document alongside its deleted source, or undelete the file.",
    sql: `
      select p.id, p.name, p.owner_id, p.source_id,
             count(*) over() as _total
      from processed_documents p
      where p.source_kind = 'cld_file'
        and p.archived_at is null
        and exists (
          select 1 from cld_files f
          where f.id::text = p.source_id and f.deleted_at is not null
        )
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
      "Probes the download endpoint (Range bytes=0-0) for live s3:// PDFs and " +
      "buckets any 404/410/500 as a dead source. This is the only way to find " +
      "files whose bytes silently vanished without an 'unrecoverable://' flag. " +
      "Bounded sample; requires an auth token, and only covers files the token " +
      "can access (no cross-user service token exists yet).",
    remediation:
      "Mark confirmed-dead files 'unrecoverable://' (or soft-delete) so they " +
      "stop appearing as healthy. A full cross-user audit needs a backend " +
      "service endpoint with S3 access.",
    failureStatuses: [404, 410, 500, 502, 503],
    candidateSql: `
      select id, file_name, owner_id
      from cld_files
      where deleted_at is null
        and mime_type = 'application/pdf'
        and storage_uri like 's3://%'
      order by created_at desc
      limit 50
    `,
  },
];
