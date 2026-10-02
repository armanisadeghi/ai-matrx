"use client";

import type { RootState } from "@host/lib/redux/store";
import { useEffect, useState } from "react";
import { useFile } from "@host/features/files/handler/hooks/useFile";
import { fileHandler } from "@host/features/files/handler/handler";

/**
 * attached-documents — the shared vocabulary for a document attached to a chat.
 *
 * A new attachment is a DURABLE `file → conversation`
 * `platform.associations` edge. Legacy `processed_document → conversation`
 * edges remain readable and migrate to the canonical file edge when edited.
 * It PERSISTS across turns and reloads: the chip renders
 * from the conversation's incoming edges (via `useContainerLinks`), and the
 * backend reads those edges at call time and injects the context itself. The FE's
 * only jobs are: create the edge on attach, remove it on detach, render the chip.
 *
 * This module holds the shared bits both the ATTACH path
 * (`attach-resource.ts`) and the CHIP render (`AttachedDocumentChips.tsx`) need:
 * the canonical and legacy source tokens, edge-metadata shape, a URL-proof label cleaner, and
 * the org resolver. Writes go through `associationsService` / the association
 * thunks / `useContainerLinks` — never a bespoke edge write.
 */

import type { DocumentRepresentation } from "../../../types/instance.types";
import type { VariableResourceContextConfig } from "../../../types/agent-definition.types";
import type { Json } from "@host/types/database.types";
import { normalizeResourceFamilyPolicy } from "./resource-family-policy";

/**
 * Canonical `file` plus the legacy `processed_document` token retained for
 * rendering and migrating old edges. New writes always use `file`.
 */
export const ATTACHED_DOCUMENT_TOKENS = ["processed_document", "file"] as const;

export type AttachedDocumentToken = (typeof ATTACHED_DOCUMENT_TOKENS)[number];

/**
 * Props stored on the attachment edge's `platform.associations.metadata`.
 * `assoc_add` REPLACES metadata on conflict, so every write persists the FULL
 * object.
 */
export interface AttachedDocumentMetadata {
  /** Explicit primary override. Omitted = Clean -> Raw -> original PDF. */
  representation?: DocumentRepresentation;
  /** The origin binary file id — lets the chip offer "attach as raw file". */
  file_id?: string | null;
  /** Per-reference promotion/suppression policy consumed by the backend. */
  resource_policy?: VariableResourceContextConfig;
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
    m.representation === "clean" ||
    m.representation === "raw" ||
    m.representation === "pdf"
      ? m.representation
      : undefined;
  const fileId =
    typeof m.file_id === "string" || m.file_id === null
      ? (m.file_id as string | null)
      : undefined;
  const resourcePolicy =
    m.resource_policy &&
    typeof m.resource_policy === "object" &&
    !Array.isArray(m.resource_policy)
      ? normalizeResourceFamilyPolicy(
          m.resource_policy as VariableResourceContextConfig,
        )
      : undefined;
  return {
    representation,
    file_id: fileId,
    ...(resourcePolicy ? { resource_policy: resourcePolicy } : {}),
  };
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
  const fromStore = state.cloudFiles.filesById[fileId]?.fileName?.trim();
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
  const { file } = useFile(fileId ? { kind: "file_id", fileId } : null);

  return resolveAttachedDocumentDisplayName({
    fileName: file?.meta.fileName,
    edgeLabel,
  });
}

/**
 * The binary file behind an attachment edge: a `file` edge IS the file; a
 * legacy `processed_document` edge names it in its metadata.
 */
export function attachedDocumentFileId(
  token: AttachedDocumentToken,
  link: { resourceId: string; metadata: unknown },
): string | null {
  if (token === "file") return link.resourceId;
  return parseAttachedDocumentMetadata(link.metadata as Json).file_id ?? null;
}

/**
 * {@link useAttachedDocumentDisplayName} for many documents at once (the
 * context chip lists every attachment as a row). Same loader, same naming
 * rule — so a row and its tile always name a document identically.
 * Returns file id → file name for the ids resolved so far.
 */
export function useAttachedDocumentFileNames(
  fileIds: readonly string[],
): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const idsKey = [...new Set(fileIds)].sort().join(",");
  useEffect(() => {
    if (!idsKey) return undefined;
    let cancelled = false;
    for (const fileId of idsKey.split(",")) {
      fileHandler
        .resolve({ kind: "file_id", fileId })
        .then((file) => {
          const name = file.meta.fileName?.trim();
          if (cancelled || !name) return;
          setNames((prev) => (prev[fileId] === name ? prev : { ...prev, [fileId]: name }));
        })
        .catch(() => {
          // The row keeps its edge label; the tile beside it shows the same
          // fallback through useAttachedDocumentDisplayName.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [idsKey]);
  return names;
}
