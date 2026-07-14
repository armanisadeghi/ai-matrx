"use client";

/**
 * attached-documents — the shared vocabulary for a document attached to a chat.
 *
 * An attached document is a DURABLE `platform.associations` edge from the file
 * (or its processed document) to the conversation — `file → conversation` or
 * `processed_document → conversation`, both registered + active with
 * `container_side=target`. It PERSISTS across turns and reloads: the chip renders
 * from the conversation's incoming edges (via `useContainerLinks`), and the
 * backend reads those edges at call time and injects the context itself. The FE's
 * only jobs are: create the edge on attach, remove it on detach, render the chip.
 *
 * This module holds the shared bits both the ATTACH path
 * (`attach-resource.ts`) and the CHIP render (`AttachedDocumentChips.tsx`) need:
 * the two source tokens, the edge-metadata shape, a URL-proof label cleaner, and
 * the org resolver. Writes go through `associationsService` / the association
 * thunks / `useContainerLinks` — never a bespoke edge write.
 */

import type { RootState } from "@/lib/redux/store";
import { getActiveOrgId } from "@/lib/organizations/activeOrg";
import type { DocumentRepresentation } from "@/features/agents/types/instance.types";
import type { Json } from "@/types/database.types";

/**
 * The two entity tokens a stored file can be attached under. `processed_document`
 * (default when the file has one) leads with the extracted/cleaned text; `file`
 * leads with the raw file. The backend resolver handles both — the difference is
 * only what it leads with. Ordered default-first for stable chip render order.
 */
export const ATTACHED_DOCUMENT_TOKENS = [
  "processed_document",
  "file",
] as const;

export type AttachedDocumentToken = (typeof ATTACHED_DOCUMENT_TOKENS)[number];

/**
 * Props stored on the attachment edge's `platform.associations.metadata`.
 * `assoc_add` REPLACES metadata on conflict, so every write persists the FULL
 * object.
 */
export interface AttachedDocumentMetadata {
  /** Chosen PRIMARY text representation (processed_document edges only). */
  representation?: DocumentRepresentation;
  /** The origin binary file id — lets the chip offer "attach as raw file". */
  file_id?: string | null;
}

/** Narrow an edge's opaque `Json` metadata to the attachment shape. */
export function parseAttachedDocumentMetadata(
  metadata: Json,
): AttachedDocumentMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  const m = metadata as Record<string, unknown>;
  const representation =
    m.representation === "clean" || m.representation === "raw"
      ? m.representation
      : undefined;
  const fileId =
    typeof m.file_id === "string" || m.file_id === null
      ? (m.file_id as string | null)
      : undefined;
  return { representation, file_id: fileId };
}

/**
 * A URL-PROOF display name. The label bug: the chip once showed a signed-URL
 * fragment (`…?X-Amz-Signature=…`). Source the name from the file's real
 * filename; if a caller only has a URL, take the last path segment WITHOUT the
 * query string, never the raw tail. Empty → "Document".
 */
export function cleanDocumentLabel(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "Document";
  // Looks like a URL (or has a query string) → keep only the basename of the path.
  if (/^https?:\/\//i.test(value) || value.includes("?")) {
    try {
      const url = new URL(value, "https://placeholder.invalid");
      const path = url.pathname;
      const seg = path.slice(path.lastIndexOf("/") + 1);
      const name = decodeURIComponent(seg || "");
      return name || "Document";
    } catch {
      const beforeQuery = value.split("?")[0];
      const seg = beforeQuery.slice(beforeQuery.lastIndexOf("/") + 1);
      return seg || "Document";
    }
  }
  return value;
}

/**
 * The org a new attachment edge is stamped with: the conversation's org first,
 * then the user's GLOBAL active org. `assoc_add` will NOT auto-derive org for a
 * `conversation` target, so this must resolve — callers report loudly on null.
 */
export function resolveConversationOrgId(
  state: RootState,
  conversationId: string,
): string | null {
  return (
    state.conversations.byConversationId[conversationId]?.organizationId ??
    getActiveOrgId()
  );
}
