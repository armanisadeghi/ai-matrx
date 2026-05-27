import type { UseFileDocumentState } from "@/features/files/hooks/useFileDocument";
import type { CloudFile, CloudShareLink } from "@/features/files/types";
import { formatFileSize } from "@/features/files/utils/format";

export interface FileInfoSnapshot {
  file: CloudFile;
  typeDisplayName: string;
  parentFolderPath: string | null;
  versionCount: number;
  activeShareLinks: CloudShareLink[];
  ragState: UseFileDocumentState;
}

function formatTs(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
}

function visibilityLabel(visibility: CloudFile["visibility"]): string {
  switch (visibility) {
    case "public":
      return "Public — anyone with a link";
    case "shared":
      return "Shared — specific grantees + share links";
    default:
      return "Private — only you";
  }
}

function ragStatusLabel(state: UseFileDocumentState): string {
  switch (state.status) {
    case "found":
      return `Indexed · ${state.doc.derivation_kind}`;
    case "absent":
      return "Not yet processed for RAG. Use the Document tab or the Reprocess action to index this file.";
    case "unavailable":
      return "Lookup unavailable (backend endpoint not yet implemented).";
    case "loading":
      return "Checking…";
    default:
      return "—";
  }
}

/**
 * Human-readable, sectioned summary of everything shown on the Info tab.
 * Shared by the per-field Copy buttons' "copy all" action and Copy for AI.
 */
export function fileInfoHumanSummary(snapshot: FileInfoSnapshot): string {
  const {
    file,
    typeDisplayName,
    parentFolderPath,
    versionCount,
    activeShareLinks,
    ragState,
  } = snapshot;

  const shareLink = activeShareLinks[0] ?? null;
  const lines: string[] = [];

  lines.push("Identity");
  lines.push(`Name: ${file.fileName}`);
  lines.push(`Type: ${typeDisplayName}`);
  lines.push(`File ID: ${file.id}`);
  lines.push("");

  lines.push("Location");
  lines.push(`Folder: ${parentFolderPath ?? "(root)"}`);
  lines.push(`Full path: ${file.filePath || "—"}`);
  lines.push("");

  lines.push("Type & size");
  lines.push(`MIME type: ${file.mimeType || "—"}`);
  lines.push(
    `Size: ${
      file.fileSize != null
        ? `${formatFileSize(file.fileSize)} (${file.fileSize.toLocaleString()} bytes)`
        : "—"
    }`,
  );
  const versionLine =
    versionCount > 1
      ? `v${file.currentVersion} · ${versionCount} versions total`
      : `v${file.currentVersion}`;
  lines.push(`Version: ${versionLine}`);
  if (file.checksum) {
    lines.push(`Checksum: ${file.checksum}`);
  }
  lines.push("");

  lines.push("Sharing");
  lines.push(`Visibility: ${visibilityLabel(file.visibility)}`);
  if (shareLink) {
    lines.push(`Active link: /share/${shareLink.shareToken}`);
  } else {
    lines.push(
      `Share link: No active share link. Use "Copy link" in the header to create a 7-day signed URL.`,
    );
  }
  lines.push("");

  lines.push("History");
  lines.push(`Created: ${formatTs(file.createdAt)}`);
  lines.push(`Last modified: ${formatTs(file.updatedAt)}`);
  lines.push(`Owner ID: ${file.ownerId || "—"}`);
  if (file.deletedAt) {
    lines.push(`Soft-deleted: ${formatTs(file.deletedAt)}`);
  }
  lines.push("");

  if (file.source.kind === "real") {
    lines.push("RAG / document");
    lines.push(`Status: ${ragStatusLabel(ragState)}`);
    if (ragState.status === "found") {
      lines.push(`Pages: ${(ragState.doc.total_pages ?? 0).toLocaleString()}`);
      if (ragState.doc.chunk_count != null) {
        lines.push(`Chunks: ${ragState.doc.chunk_count.toLocaleString()}`);
      }
      lines.push(`Last ingested: ${formatTs(ragState.doc.updated_at)}`);
      lines.push(
        `Processed document ID: ${ragState.doc.processed_document_id}`,
      );
    }
    if (file.parentFileId) {
      lines.push(`Derived from: ${file.parentFileId}`);
    }
    if (file.derivationKind) {
      lines.push(`Derivation kind: ${file.derivationKind}`);
    }
    lines.push("");
  }

  const metadataKeys = Object.keys(file.metadata ?? {});
  if (metadataKeys.length > 0) {
    lines.push("Metadata");
    lines.push(JSON.stringify(file.metadata, null, 2));
  }

  return lines.join("\n").trimEnd();
}
