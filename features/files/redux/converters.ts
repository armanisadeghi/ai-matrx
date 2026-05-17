/**
 * features/files/redux/converters.ts
 *
 * Pure functions that translate DB rows (snake_case) and REST API shapes
 * (snake_case) into the domain types (camelCase) used throughout the app.
 *
 * No Redux, no Supabase client — these are pure and testable.
 */

import type {
  CloudFile,
  CloudFileRow,
  CloudFilePermission,
  CloudFilePermissionRow,
  CloudFileVersion,
  CloudFileVersionRow,
  CloudFolder,
  CloudFolderRow,
  CloudShareLink,
  CloudShareLinkRow,
  CloudTreeRow,
  CloudUserGroup,
  CloudUserGroupMember,
  CloudUserGroupMemberRow,
  CloudUserGroupRow,
  FileRecordApi,
  GranteeType,
  MediaRef,
  PermissionLevel,
  ResourceType,
  Visibility,
} from "@/features/files/types";

// ---------------------------------------------------------------------------
// Narrowing helpers
// ---------------------------------------------------------------------------

function toVisibility(raw: string | null | undefined): Visibility {
  return raw === "public" || raw === "shared" ? raw : "private";
}

function toPermissionLevel(raw: string | null | undefined): PermissionLevel {
  return raw === "write" || raw === "admin" ? raw : "read";
}

function toResourceType(raw: string | null | undefined): ResourceType {
  return raw === "folder" ? "folder" : "file";
}

function toGranteeType(raw: string | null | undefined): GranteeType {
  return raw === "group" ? "group" : "user";
}

function toMetadataObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export function dbRowToCloudFile(row: CloudFileRow): CloudFile {
  return {
    id: row.id,
    ownerId: row.owner_id,
    filePath: row.file_path,
    storageUri: row.storage_uri,
    fileName: row.file_name,
    mimeType: row.mime_type,
    // Phase 0 rename: `cld_files.file_size` → `cld_files.size_bytes`.
    // See docs/PYTHON_UPDATES.md §3. The Supabase generated row type
    // already carries the new column name.
    fileSize: row.size_bytes,
    checksum: row.checksum,
    visibility: toVisibility(row.visibility),
    currentVersion: row.current_version,
    parentFolderId: row.parent_folder_id,
    metadata: toMetadataObject(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    // The DB has no public_url column — it's computed server-side. For
    // direct DB reads (Supabase realtime, server-side SSR), callers
    // should fall back to useFileSrc({ kind: "file_id", fileId }) when this is null.
    publicUrl: null,
    // The DB no longer has a thumbnail_url column either (Phase 1b dropped
    // it); resolved server-side from the variants store on the REST path.
    // Direct-DB-read callers should fall back to `useFileAsset(fileId)`
    // and read `asset.variants["thumbnail_url"].url`.
    thumbnailUrl: null,
    source: { kind: "real" },
    // Dedup-pyramid columns from Phase 2.0. Null on rows uploaded before
    // the dedup consolidation script ran or on rows that have never been
    // identified as duplicates / never had their canonical extract set.
    duplicateOfFileId: row.duplicate_of_file_id ?? null,
    canonicalProcessedDocumentId: row.canonical_processed_document_id ?? null,
  };
}

/**
 * Convert the REST API's FileRecord (snake_case) to the domain type. Shape
 * is identical to CloudFileRow modulo a few nullable defaults.
 */
export function apiFileRecordToCloudFile(row: FileRecordApi): CloudFile {
  // The Python FileRecord schema is gaining `duplicate_of_file_id` and
  // `canonical_processed_document_id` per the Phase 2.0 dedup handoff.
  // The OpenAPI types haven't been regenerated to include them yet, so
  // read defensively through a Record cast and treat them as optional.
  // Once the OpenAPI types ship the new fields, this cast becomes a
  // no-op and the values flow through unchanged.
  const extras = row as unknown as {
    duplicate_of_file_id?: string | null;
    canonical_processed_document_id?: string | null;
  };
  return {
    id: row.id,
    ownerId: row.owner_id,
    filePath: row.file_path,
    storageUri: row.storage_uri,
    fileName: row.file_name,
    mimeType: row.mime_type ?? null,
    // Phase 0 rename: `FileRecord.file_size` → `FileRecord.size_bytes`.
    // The Python OpenAPI schema has been regenerated. See
    // docs/PYTHON_UPDATES.md §3.
    fileSize: row.size_bytes ?? null,
    checksum: row.checksum ?? null,
    visibility: toVisibility(row.visibility),
    currentVersion: row.current_version ?? 1,
    parentFolderId: row.parent_folder_id ?? null,
    metadata: toMetadataObject(row.metadata),
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
    deletedAt: row.deleted_at ?? null,
    // CDN URL for visibility="public" files when the server has the CDN
    // feature enabled. Includes a ?v=<checksum[:8]> cache-buster.
    publicUrl: row.public_url ?? null,
    // Phase 1b: backend-rendered thumbnail (every file gets one). The
    // wire field is resolved server-side from the variants store now
    // that `cld_files.thumbnail_url` column has been dropped.
    thumbnailUrl: row.thumbnail_url ?? null,
    source: { kind: "real" },
    duplicateOfFileId: extras.duplicate_of_file_id ?? null,
    canonicalProcessedDocumentId:
      extras.canonical_processed_document_id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export function dbRowToCloudFolder(row: CloudFolderRow): CloudFolder {
  return {
    id: row.id,
    ownerId: row.owner_id,
    folderPath: row.folder_path,
    folderName: row.folder_name,
    parentId: row.parent_id,
    visibility: toVisibility(row.visibility),
    metadata: toMetadataObject(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    source: { kind: "real" },
  };
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export function dbRowToCloudFileVersion(
  row: CloudFileVersionRow,
): CloudFileVersion {
  return {
    id: row.id,
    fileId: row.file_id,
    versionNumber: row.version_number,
    storageUri: row.storage_uri,
    // Phase 0 rename — see `dbRowToCloudFile` above.
    fileSize: row.size_bytes,
    checksum: row.checksum,
    createdBy: row.created_by,
    createdAt: row.created_at,
    changeSummary: row.change_summary,
  };
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export function dbRowToCloudFilePermission(
  row: CloudFilePermissionRow,
): CloudFilePermission {
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceType: toResourceType(row.resource_type),
    granteeId: row.grantee_id,
    granteeType: toGranteeType(row.grantee_type),
    permissionLevel: toPermissionLevel(row.permission_level),
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
  };
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

export function dbRowToCloudShareLink(row: CloudShareLinkRow): CloudShareLink {
  const level = toPermissionLevel(row.permission_level);
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceType: toResourceType(row.resource_type),
    shareToken: row.share_token,
    permissionLevel: level === "admin" ? "write" : level,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    isActive: row.is_active,
  };
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export function dbRowToCloudUserGroup(row: CloudUserGroupRow): CloudUserGroup {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export function dbRowToCloudUserGroupMember(
  row: CloudUserGroupMemberRow,
): CloudUserGroupMember {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    role: row.role,
    addedBy: row.added_by,
    addedAt: row.added_at,
  };
}

// ---------------------------------------------------------------------------
// Tree RPC — tolerant reader
// ---------------------------------------------------------------------------
//
// The RPC returns `Json` (opaque). We shape-check defensively — if the Python
// team updates the schema, only this function changes.

type LooseRow = Record<string, unknown>;

function str(row: LooseRow, key: string): string | null {
  const v = row[key];
  return typeof v === "string" ? v : null;
}

function num(row: LooseRow, key: string): number | null {
  const v = row[key];
  return typeof v === "number" ? v : null;
}

/**
 * Parse one row from `cloud_get_user_file_tree`. Returns null if the row
 * doesn't have enough shape to use.
 *
 * Supports two shapes:
 *   - Explicit `kind: 'file' | 'folder'` discriminator.
 *   - Implicit: presence of `file_name` vs `folder_name`.
 */
export function parseCloudTreeRow(raw: unknown): CloudTreeRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as LooseRow;

  const id = str(row, "id");
  if (!id) return null;

  const explicitKind = str(row, "kind");
  const hasFolderName = typeof row.folder_name === "string";
  const hasFileName = typeof row.file_name === "string";

  const isFolder = explicitKind === "folder" || (hasFolderName && !hasFileName);

  const created = str(row, "created_at") ?? new Date().toISOString();
  const updated = str(row, "updated_at") ?? created;
  const visibility = toVisibility(str(row, "visibility") ?? "private");
  const effPerm = str(row, "effective_permission");

  // ── Cross-shape readers ────────────────────────────────────────────────
  //
  // The RPC has TWO documented row shapes that we must both accept:
  //
  //   Legacy (kind-specific fields):
  //     { kind, id, owner_id,
  //       file_path|folder_path, file_name|folder_name,
  //       parent_folder_id|parent_id, mime_type, file_size, ... }
  //
  //   Unified (Python team release notes — "Returns folders too now.
  //   Each row has a `kind` discriminator"):
  //     { kind, id, owner_id, path, name, parent_id,
  //       mime_type, size_bytes, ... }
  //
  // Reading both keeps the FE working whether the deployed Postgres
  // function returns the old or the new shape — useful during rollouts
  // and in dev / staging where the migration order can be different
  // from prod. The output `CloudTreeRow` keeps the kind-specific names
  // so existing consumers don't need to change.
  //
  // Diagnosed 2026-04-26: the Python team's RPC update shipped the
  // unified shape; the FE was still reading the legacy field names,
  // which meant every row landed in `filesById` with empty
  // `filePath`/`fileName` and `undefined` `parentFolderId`. The Home
  // view rendered them as blank rows; the deeper folder filters
  // returned zero matches because `parentFolderId === activeFolderId`
  // failed (`undefined !== null`). Result: cloud-files appeared empty
  // even though every row was in state.
  // ────────────────────────────────────────────────────────────────────
  const folderPath = str(row, "folder_path") ?? str(row, "path") ?? "";
  const folderName = str(row, "folder_name") ?? str(row, "name") ?? "";
  const filePath = str(row, "file_path") ?? str(row, "path") ?? "";
  const fileName = str(row, "file_name") ?? str(row, "name") ?? "";
  const parentFolderId = str(row, "parent_folder_id") ?? str(row, "parent_id");
  // Phase 0 rename: `file_size` → `size_bytes`. Read both during the
  // transition; emit canonical `size_bytes` on the output row.
  const sizeBytes = num(row, "size_bytes") ?? num(row, "file_size");

  if (isFolder) {
    return {
      kind: "folder",
      id,
      folder_path: folderPath,
      folder_name: folderName,
      parent_id: str(row, "parent_id"),
      visibility,
      effective_permission: effPerm ? toPermissionLevel(effPerm) : null,
      owner_id: str(row, "owner_id") ?? "",
      created_at: created,
      updated_at: updated,
      deleted_at: str(row, "deleted_at"),
    };
  }

  return {
    kind: "file",
    id,
    file_path: filePath,
    file_name: fileName,
    parent_folder_id: parentFolderId,
    mime_type: str(row, "mime_type"),
    size_bytes: sizeBytes,
    visibility,
    current_version: num(row, "current_version") ?? 1,
    effective_permission: effPerm ? toPermissionLevel(effPerm) : null,
    owner_id: str(row, "owner_id") ?? "",
    created_at: created,
    updated_at: updated,
    deleted_at: str(row, "deleted_at"),
  };
}

/**
 * Parse the full RPC return (array of rows). Skips malformed rows rather than
 * throwing — a single bad row shouldn't blank the tree.
 */
export function parseCloudTreeRows(raw: unknown): CloudTreeRow[] {
  if (!Array.isArray(raw)) return [];
  const out: CloudTreeRow[] = [];
  for (const item of raw) {
    const parsed = parseCloudTreeRow(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

// ---------------------------------------------------------------------------
// MediaRef builders — outbound API content blocks
// ---------------------------------------------------------------------------
//
// Build a `MediaRef` (the canonical outbound-content reference shape; see
// [features/files/types.ts](../types.ts)) from whatever the caller has on
// hand. Always prefer `cloudFileToMediaRef` — it picks `file_id` (preferred)
// and pulls the mime hint from the in-store record. Use `fileIdToMediaRef`
// when you have the id but not the full record. Use `urlToMediaRef` only
// for genuinely external URLs (e.g. a user pasting a public link).
//
// Why this lives here: every `addResource` callsite, every chat input, every
// agent-runner attachment flows through one of these builders. Adding a new
// identifier scheme (e.g. a `cdn_url` field) means editing this one file.

/** Build a MediaRef from an in-store CloudFile. Prefers `file_id`. */
export function cloudFileToMediaRef(file: CloudFile): MediaRef {
  const ref: MediaRef = { file_id: file.id };
  if (file.mimeType) ref.mime_type = file.mimeType;
  return ref;
}

/**
 * Build a MediaRef from just a `file_id` (e.g. when an upload completes
 * and the caller has the id but not the full record yet).
 */
export function fileIdToMediaRef(
  fileId: string,
  mimeType?: string | null,
): MediaRef {
  const ref: MediaRef = { file_id: fileId };
  if (mimeType) ref.mime_type = mimeType;
  return ref;
}

/**
 * Build a MediaRef from an external URL (public website image, signed URL
 * we don't own, etc.). Use this ONLY when you don't have a `file_id` —
 * otherwise the backend has to follow the URL to resolve the file.
 */
export function urlToMediaRef(url: string, mimeType?: string | null): MediaRef {
  const ref: MediaRef = { url };
  if (mimeType) ref.mime_type = mimeType;
  return ref;
}

/**
 * Build a MediaRef from a native cloud URI (`s3://`, `gs://`,
 * `supabase://...`). Rare on the FE — usually only for backend-issued
 * file URIs we want to pass through unchanged.
 */
export function fileUriToMediaRef(
  fileUri: string,
  mimeType?: string | null,
): MediaRef {
  const ref: MediaRef = { file_uri: fileUri };
  if (mimeType) ref.mime_type = mimeType;
  return ref;
}
