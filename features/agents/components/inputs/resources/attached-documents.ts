"use client";

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { getFile } from "@/features/files/api/files";
import {
  getFileFromState,
  selectFileName,
} from "@/features/files/redux/selectors";

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
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import type { DocumentRepresentation } from "@/features/agents/types/instance.types";
import type { Json } from "@/types/database.types";

/**
 * The two entity tokens a stored file can be attached under. `processed_document`
 * (default when the file has one) leads with the extracted/cleaned text; `file`
 * leads with the raw file. The backend resolver handles both — the difference is
 * only what it leads with. Ordered default-first for stable chip render order.
 */
export const ATTACHED_DOCUMENT_TOKENS = ["processed_document", "file"] as const;

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

/** True when a string looks like a signed-URL tail (SigV2 or SigV4), not a filename. */
export function looksLikeSignedUrlCredentialFragment(
  value: string | null | undefined,
): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  return /(?:^|[?&])(?:AWSAccessKeyId|X-Amz-(?:Credential|Algorithm|Signature|Date|Expires)|Signature|Expires)=/i.test(
    v,
  );
}

/**
 * Legacy URL sanitizer for edge labels written before we sourced names from
 * `files.files.file_name`. Prefer {@link resolveAttachedDocumentDisplayName}
 * everywhere we have a `file_id`.
 */
export function cleanDocumentLabel(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "Document";
  if (looksLikeSignedUrlCredentialFragment(value)) return "Document";
  // Looks like a URL (or has a query string) → keep only the basename of the path.
  if (/^https?:\/\//i.test(value) || value.includes("?")) {
    try {
      const url = new URL(value, "https://placeholder.invalid");
      const path = url.pathname;
      const seg = path.slice(path.lastIndexOf("/") + 1);
      const name = decodeURIComponent(seg || "");
      if (looksLikeSignedUrlCredentialFragment(name)) return "Document";
      return name || "Document";
    } catch {
      const beforeQuery = value.split("?")[0];
      const seg = beforeQuery.slice(beforeQuery.lastIndexOf("/") + 1);
      if (looksLikeSignedUrlCredentialFragment(seg)) return "Document";
      return seg || "Document";
    }
  }
  return value;
}

/**
 * Canonical display name for an attached document chip / drawer title.
 *
 * Order: cloud-files `file_name` (by `file_id`) → sane edge label → "Document".
 * Never show signed-URL credential fragments when we know the file id.
 */
export function resolveAttachedDocumentDisplayName(args: {
  fileName: string | null | undefined;
  edgeLabel: string | null | undefined;
}): string {
  const fromFile = args.fileName?.trim();
  if (fromFile) return fromFile;
  const cleaned = cleanDocumentLabel(args.edgeLabel);
  if (cleaned !== "Document") return cleaned;
  return "Document";
}

/**
 * Label to persist on a new `platform.associations` edge at attach time.
 * Uses the cloud-files row already in Redux when the user picked from the picker.
 */
export function documentAttachLabelFromState(
  state: RootState,
  fileId: string,
  resourceFilenameFallback: string,
): string {
  const fromStore = getFileFromState(state, fileId)?.fileName?.trim();
  if (fromStore) return fromStore;
  const fallback = cleanDocumentLabel(resourceFilenameFallback);
  return fallback === "Document" ? "Document" : fallback;
}

/**
 * Resolve the human filename for a durable attachment edge. Reads Redux first
 * (picker / files tree already hydrated the row); if missing, one GET by
 * `file_id` — we always have the canonical id on the edge metadata.
 */
export function useAttachedDocumentDisplayName(
  fileId: string | null | undefined,
  edgeLabel: string | null | undefined,
): string {
  const fileNameFromStore = useAppSelector((s) =>
    fileId ? selectFileName(s, fileId) : null,
  );
  const [fetchedName, setFetchedName] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId || fileNameFromStore) {
      setFetchedName(null);
      return undefined;
    }
    let cancelled = false;
    void getFile(fileId)
      .then(({ data }) => {
        if (!cancelled) {
          setFetchedName(
            typeof data.file_name === "string" ? data.file_name : null,
          );
        }
      })
      .catch(() => {
        if (!cancelled) setFetchedName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, fileNameFromStore]);

  return resolveAttachedDocumentDisplayName({
    fileName: fileNameFromStore ?? fetchedName,
    edgeLabel,
  });
}

/**
 * The org a new attachment edge is stamped with: the conversation's org first,
 * then the user's EFFECTIVE org (`selectEffectiveOrganizationId` — the explicitly
 * selected org, else the never-empty personal org). This is the SAME selector the
 * execution thunks use, so the write org MATCHES the org the backend reads the
 * conversation's edges under (`resolve_effective_organization_id`, which also
 * falls back to the personal org). On a personal chat both resolve to the user's
 * personal-org UUID, so the edge is written where the backend will look for it.
 *
 * `assoc_add` will NOT auto-derive org for a `conversation` target, so this must
 * resolve — callers report loudly on null. It can still be null before the
 * active-org bootstrap hydrates `personal_organization_id`; that pre-boot window
 * is the only remaining gap and surfaces loudly via the caller's toast.
 */
export function resolveConversationOrgId(
  state: RootState,
  conversationId: string,
): string | null {
  return (
    state.conversations.byConversationId[conversationId]?.organizationId ??
    selectEffectiveOrganizationId(state)
  );
}
