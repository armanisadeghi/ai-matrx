// lib/media/agent-payload.ts
//
// Media sanitizer for agent-copy payloads (see the `agent-copy` skill).
//
// WHY THIS EXISTS: a Copy-for-AI payload is read by an agent LATER — minutes,
// hours, or days after the click. That makes it exactly the "consumer must
// resolve it later" case from CLAUDE.md § Media durability, where an expiring
// signed URL is a defect rather than a legitimate time-boxed handoff. A signed
// S3 link (`X-Amz-Signature` / `Expires`) is dead within days and is worthless
// to the agent; the durable identity is the `file_id`, which any layer can
// re-mint from.
//
// Two rules, enforced here so no media surface has to remember them:
//   1. NEVER emit a signed URL. Emit `file_id` + a durable/CDN URL instead.
//   2. NEVER emit a raw storage path / `storage_uri`.
//
// Detection reuses `isSignedUrl` (lib/media/signed-url — knows both AWS
// dialects) and the drop decision reuses `shareableMediaUrl`
// (lib/media/durability). Neither is forked; a second `X-Amz` regex in this
// codebase is exactly the bug those modules exist to prevent.
//
// Stubs are HONEST (agent-copy doctrine): a dropped value is replaced with a
// marker saying what was removed and why, so the agent knows to ask for a
// fresh URL rather than believing the field was empty.

import { isSignedUrl } from "@/lib/media/signed-url";
import { shareableMediaUrl } from "@/lib/media/durability";

/** Replacement for a signed URL — names the durable path forward. */
export const DROPPED_SIGNED_URL =
  "[omitted: signed URL, expires within days — re-mint from file_id]";

/** Replacement for a raw storage path. */
export const DROPPED_STORAGE_PATH =
  "[omitted: raw storage path — use file_id]";

/**
 * Keys whose value is a raw storage location, in every casing this codebase
 * uses. Dropped regardless of value.
 */
const STORAGE_PATH_KEYS = new Set([
  "filepath",
  "file_path",
  "storageuri",
  "storage_uri",
  "storagepath",
  "storage_path",
  "storagekey",
  "storage_key",
  "objectkey",
  "object_key",
  "s3key",
  "s3_key",
  "s3uri",
  "s3_uri",
  "bucketkey",
  "bucket_key",
]);

/** Depth cap — payload data is JSON-ish; runaway nesting is a bug, not data. */
const MAX_DEPTH = 12;

function isStoragePathKey(key: string): boolean {
  return STORAGE_PATH_KEYS.has(key.toLowerCase());
}

/**
 * Recursively strip signed URLs and storage paths from any value bound for a
 * Copy-for-AI payload. Returns a NEW value — the input is never mutated, so a
 * live Redux row can be passed straight in.
 *
 * Cycles and over-deep branches collapse to a marker rather than throwing: a
 * copy button must never break the page it is copying from.
 */
export function mediaSafe<T>(value: T): unknown {
  return sanitize(value, 0, new WeakSet<object>());
}

function sanitize(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (typeof value === "string") {
    return isSignedUrl(value) ? DROPPED_SIGNED_URL : value;
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[omitted: nesting too deep]";

  const asObject = value as object;
  if (seen.has(asObject)) return "[omitted: circular reference]";
  seen.add(asObject);

  try {
    if (Array.isArray(value)) {
      return value.map((entry) => sanitize(entry, depth + 1, seen));
    }
    // Dates and other non-plain objects serialize fine as-is.
    if (value instanceof Date) return value.toISOString();

    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (isStoragePathKey(key)) {
        out[key] = DROPPED_STORAGE_PATH;
        continue;
      }
      out[key] = sanitize(entry, depth + 1, seen);
    }
    return out;
  } finally {
    seen.delete(asObject);
  }
}

/**
 * The canonical durable reference for one of our files, for use inside agent
 * payloads. `file_id` is the identity; `durable_url` is present only when a
 * permanent (CDN/public) URL genuinely exists — `shareableMediaUrl` returns
 * null for anything signed, and we do not invent a substitute.
 */
export interface AgentFileRef {
  file_id: string;
  name?: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  /** Permanent URL, or null when the file has none (agent should re-mint). */
  durable_url: string | null;
}

/**
 * Build an `AgentFileRef` from any file-ish row. Accepts the several shapes
 * this codebase carries (`CloudFile`, `CloudFileRecord`, REST `FileRecord`)
 * without importing them, so this module stays dependency-free for every
 * media feature.
 */
export function agentFileRef(file: {
  id?: string | null;
  file_id?: string | null;
  fileName?: string | null;
  file_name?: string | null;
  mimeType?: string | null;
  mime_type?: string | null;
  fileSize?: number | null;
  file_size?: number | null;
  cdnUrl?: string | null;
  cdn_url?: string | null;
  publicUrl?: string | null;
  public_url?: string | null;
}): AgentFileRef {
  const durable =
    shareableMediaUrl(file.cdnUrl ?? file.cdn_url) ??
    shareableMediaUrl(file.publicUrl ?? file.public_url) ??
    null;

  return {
    file_id: file.id ?? file.file_id ?? "",
    name: file.fileName ?? file.file_name ?? undefined,
    mime_type: file.mimeType ?? file.mime_type ?? null,
    size_bytes: file.fileSize ?? file.file_size ?? null,
    durable_url: durable,
  };
}
