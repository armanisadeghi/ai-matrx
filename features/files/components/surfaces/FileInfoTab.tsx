/**
 * features/files/components/surfaces/FileInfoTab.tsx
 *
 * The "Info" tab inside [PreviewPane](./PreviewPane.tsx). Surfaces every
 * piece of metadata we have on a file in one scannable view, sectioned
 * so the user can find what they want at a glance and copy-with-one-click
 * the values they care about (file id, share URL, full path, etc.).
 *
 * Sections, all populated from existing Redux selectors — no extra
 * dispatch needed:
 *
 *   IDENTITY     id, name, [Copy id]
 *   LOCATION     parent folder, full file path, [Copy path]
 *   TYPE & SIZE  mime, size, version count
 *   SHARING      visibility, active share link count, [Copy share link]
 *   HISTORY      created, updated, owner id (raw — humanizing requires
 *                a users-table lookup we don't have today)
 *   METADATA     raw `metadata` jsonb, JSON-pretty-printed
 *
 * Every "Copy" button uses the clipboard API with a transient checkmark
 * indicator. The whole tab is read-only — mutating actions live in the
 * header bar and the global file context menu.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveShareLinksForResource,
  selectFileById,
  selectFolderById,
  selectVersionsForFile,
} from "@/features/files/redux/selectors";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { formatFileSize } from "@/features/files/utils/format";
import { getFileTypeDetails } from "@/features/files/utils/file-types";
import { useFileDocument } from "@/features/files/hooks/useFileDocument";
import { FileRagStatusChip } from "@/features/rag/components/FileRagStatusChip";
import {
  fileInfoHumanSummary,
  type FileInfoSnapshot,
} from "@/features/files/utils/file-info-format";
import { FileText } from "lucide-react";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import { ContextStatusButton } from "@/features/scopes/components/context-assignment/ContextStatusButton";
import { ContextSummaryChips } from "@/features/scopes/components/context-assignment/ContextSummaryChips";
import { setRowScopes } from "@/features/scopes/components/context-assignment/data";
import Link from "next/link";

export interface FileInfoTabProps {
  fileId: string;
  className?: string;
}

export function FileInfoTab({ fileId, className }: FileInfoTabProps) {
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const parentFolder = useAppSelector((s) =>
    file?.parentFolderId ? selectFolderById(s, file.parentFolderId) : null,
  );
  const versions = useAppSelector((s) => selectVersionsForFile(s, fileId));
  const activeShareLinks = useAppSelector((s) =>
    selectActiveShareLinksForResource(s, fileId),
  );
  const actions = useFileActions(fileId);
  const docState = useFileDocument(fileId);

  const details = useMemo(
    () => getFileTypeDetails(file?.fileName ?? ""),
    [file?.fileName],
  );

  const metadataPretty = useMemo(() => {
    if (!file) return null;
    try {
      const keys = Object.keys(file.metadata ?? {});
      if (keys.length === 0) return null;
      return JSON.stringify(file.metadata, null, 2);
    } catch {
      return null;
    }
  }, [file]);

  const versionCount = versions.length || file?.currentVersion || 1;

  const infoSnapshot = useMemo<FileInfoSnapshot | null>(() => {
    if (!file) return null;
    return {
      file,
      typeDisplayName: details.displayName,
      parentFolderPath: parentFolder?.folderPath ?? null,
      versionCount,
      activeShareLinks,
      ragState: docState.state,
    };
  }, [
    file,
    details.displayName,
    parentFolder?.folderPath,
    versionCount,
    activeShareLinks,
    docState.state,
  ]);

  if (!file || !infoSnapshot) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center text-sm text-muted-foreground",
          className,
        )}
      >
        File not loaded.
      </div>
    );
  }

  const shareLink = activeShareLinks[0] ?? null;

  const formatTs = (iso: string | null | undefined): string =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-auto bg-card px-4 py-3",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-2xl pb-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">File info</h3>
          <CopyButtons
            size="sm"
            label={file.fileName}
            human={() => fileInfoHumanSummary(infoSnapshot)}
            agent={() => ({
              kind: "cloud-file-info",
              location: "AI Matrx — Cloud Files — Info tab",
              description:
                "Complete metadata for the file currently shown in the Info tab.",
              data: infoSnapshot,
              summary: fileInfoHumanSummary(infoSnapshot),
              attributes: {
                id: file.id,
                name: file.fileName,
                "mime-type": file.mimeType ?? "",
                visibility: file.visibility,
              },
              context: {
                "file-id": file.id,
                "parent-folder": parentFolder?.folderPath ?? "(root)",
                "rag-status": docState.state.status,
              },
            })}
          />
        </div>

        <div className="space-y-5">
          <Section title="Identity">
            <Row label="Name" value={file.fileName} />
            <Row label="Type" value={details.displayName} />
            <CopyableRow label="File ID" value={file.id} copyValue={file.id} />
          </Section>

          <Section title="Location">
            <Row label="Folder" value={parentFolder?.folderPath ?? "(root)"} />
            <CopyableRow
              label="Full path"
              value={file.filePath || "—"}
              copyValue={file.filePath || ""}
              disabled={!file.filePath}
            />
          </Section>

          <Section title="Type & size">
            <Row
              label="MIME type"
              value={file.mimeType || "—"}
              mono={!!file.mimeType}
            />
            <Row
              label="Size"
              value={
                file.fileSize != null
                  ? `${formatFileSize(file.fileSize)} (${file.fileSize.toLocaleString()} bytes)`
                  : "—"
              }
            />
            <Row
              label="Version"
              value={`v${file.currentVersion}${
                versionCount > 1 ? ` · ${versionCount} versions total` : ""
              }`}
            />
            {file.checksum ? (
              <CopyableRow
                label="Checksum"
                value={file.checksum}
                copyValue={file.checksum}
                mono
              />
            ) : null}
          </Section>

          <Section title="Sharing">
            <Row
              label="Visibility"
              value={
                file.visibility === "public"
                  ? "Public — anyone with a link"
                  : file.visibility === "shared"
                    ? "Shared — specific grantees + share links"
                    : "Private — only you"
              }
            />
            {shareLink ? (
              <CopyableShareLink
                fileId={fileId}
                shareToken={shareLink.shareToken}
                copyShareUrl={() => actions.copyShareUrl()}
              />
            ) : (
              <Row
                label="Share link"
                value={`No active share link. Use "Copy link" in the header to create a 7-day signed URL.`}
              />
            )}
          </Section>

          <Section title="History">
            <Row label="Created" value={formatTs(file.createdAt)} />
            <Row label="Last modified" value={formatTs(file.updatedAt)} />
            <CopyableRow
              label="Owner ID"
              value={file.ownerId || "—"}
              copyValue={file.ownerId || ""}
              disabled={!file.ownerId}
              mono
            />
            {file.deletedAt ? (
              <Row label="Soft-deleted" value={formatTs(file.deletedAt)} />
            ) : null}
          </Section>

          {/*
           * Context — tag this file to scopes (Client Ava, Case 123, Patient
           * X) via the official ContextAssignment surface. Writes
           * ctx_scope_assignments through the canonical chokepoint (NEVER
           * appContext — this is local, per-entity tagging). No org
           * pre-selection required: the picker browses every org. Real files
           * only; virtual rows live in their own systems. This is what makes
           * a file discoverable structurally and feeds RAG/NER downstream.
           */}
          {file.source.kind === "real" ? (
            <Section title="Context">
              <div className="px-3 py-2">
                <FileContextInfoRow fileId={fileId} fileName={file.fileName} />
              </div>
            </Section>
          ) : null}

          {/*
           * RAG status — visible only for real (non-virtual) files.
           *
           *   - found        → chunk count, derivation, last ingested + link
           *   - absent       → "Not yet processed for RAG" hint
           *   - unavailable  → soft warning, lookup not implemented
           *
           * Lineage data (parentFileId / derivationKind) is shown
           * unconditionally when present; that field comes from the file
           * row itself and doesn't require a backend probe.
           */}
          {file.source.kind === "real" ? (
            <Section title="RAG / document">
              {/*
               * Lifecycle chip — the scheduled auto-RAG state (scheduled /
               * running / completed / failed) from /files/{id}/rag-status,
               * with Process-now / Refresh actions. Complements the
               * document-lookup detail below (chunks / pages / viewer link).
               */}
              <Row
                label="Lifecycle"
                value={<FileRagStatusChip fileId={fileId} showActions />}
              />
              {docState.state.status === "found" ? (
                <>
                  <Row
                    label="Status"
                    value={`Indexed · ${docState.state.doc.derivation_kind}`}
                  />
                  <Row
                    label="Pages"
                    value={(
                      docState.state.doc.total_pages ?? 0
                    ).toLocaleString()}
                  />
                  {docState.state.doc.chunk_count != null ? (
                    <Row
                      label={RAG_VOCAB.segmentsShort}
                      value={docState.state.doc.chunk_count.toLocaleString()}
                    />
                  ) : null}
                  <Row
                    label="Last ingested"
                    value={formatTs(docState.state.doc.updated_at)}
                  />
                  <div className="flex items-center justify-end pt-1">
                    <Link
                      href={`/rag/viewer/${docState.state.doc.processed_document_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      Open in document viewer →
                    </Link>
                  </div>
                </>
              ) : docState.state.status === "absent" ? (
                <Row
                  label="Status"
                  value="Not yet processed for RAG. Use the Document tab or the Reprocess action to index this file."
                />
              ) : docState.state.status === "unavailable" ? (
                <Row
                  label="Status"
                  value="Lookup unavailable (backend endpoint not yet implemented)."
                />
              ) : (
                <Row label="Status" value="Checking…" />
              )}
              {file.parentFileId ? (
                <CopyableRow
                  label="Derived from"
                  value={file.parentFileId}
                  copyValue={file.parentFileId}
                  mono
                />
              ) : null}
              {file.derivationKind ? (
                <Row label="Derivation kind" value={file.derivationKind} />
              ) : null}
            </Section>
          ) : null}

          {metadataPretty ? (
            <Section title="Metadata">
              <pre className="text-[11px] leading-snug text-foreground bg-muted/30 rounded-md p-3 overflow-auto max-h-72 font-mono whitespace-pre-wrap break-words">
                {metadataPretty}
              </pre>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-1 rounded-md border border-border bg-card">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-baseline gap-3 px-3 py-2 border-b border-border last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-xs text-foreground break-words min-w-0",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CopyableRow({
  label,
  value,
  copyValue,
  mono,
  disabled,
}: {
  label: string;
  value: React.ReactNode;
  copyValue: string;
  mono?: boolean;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    if (disabled || !copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable in non-secure context — silent */
    }
  }, [copyValue, disabled]);

  return (
    <div className="grid grid-cols-[8rem_1fr_auto] items-baseline gap-2 px-3 py-2 border-b border-border last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "truncate text-xs text-foreground min-w-0",
          mono && "font-mono",
        )}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => void onCopy()}
        disabled={disabled}
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground transition-colors",
          "hover:bg-accent hover:text-foreground",
          "disabled:cursor-not-allowed disabled:opacity-40",
        )}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function CopyableShareLink({
  shareToken,
  copyShareUrl,
}: {
  fileId: string;
  shareToken: string;
  copyShareUrl: () => Promise<string | null>;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    const url = await copyShareUrl();
    if (url) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  }, [copyShareUrl]);

  // We can't pre-build the public URL without window context, but the
  // share token alone is enough to identify the link in the row text;
  // the Copy button uses the canonical action that resolves it to the
  // full /share/{token} URL on the current origin.
  return (
    <div className="grid grid-cols-[8rem_1fr_auto] items-baseline gap-2 px-3 py-2 border-b border-border last:border-b-0">
      <span className="text-xs text-muted-foreground">Active link</span>
      <span
        className="truncate text-xs text-foreground font-mono min-w-0"
        title={`/share/${shareToken}`}
      >
        /share/{shareToken}
      </span>
      <button
        type="button"
        onClick={() => void onCopy()}
        className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Copy share URL"
      >
        {copied ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        {copied ? "Copied" : "Copy URL"}
      </button>
    </div>
  );
}

/**
 * Per-file context status + readable chips + assign affordance. The shield is
 * amber until the file has context (the nudge that drives RAG/NER hygiene).
 * Reads the canonical per-entity cache; saves write through to the row-scope
 * store so any visible table cell for this file updates instantly.
 */
function FileContextInfoRow({
  fileId,
  fileName,
}: {
  fileId: string;
  fileName: string;
}) {
  const es = useEntityScopes({ entityType: "file", entityId: fileId });
  return (
    <div className="flex items-start gap-2">
      <ContextStatusButton
        subject={{
          entityType: "file",
          entityId: fileId,
          title: fileName,
          icon: FileText,
        }}
        knownScopeCount={es.scopeIds.length}
        writeMode="live"
        onSaved={(r) => {
          if (!r.ok) return;
          setRowScopes(
            "file",
            fileId,
            r.selection.scopeIds.filter((id) => !id.startsWith("new:")),
          );
          void es.refresh();
        }}
      />
      <ContextSummaryChips
        size="sm"
        value={{ scopeIds: es.scopeIds }}
        emptyText="No context — invisible to scoped RAG, NER, and agents. Click the shield to assign."
      />
    </div>
  );
}

export default FileInfoTab;
