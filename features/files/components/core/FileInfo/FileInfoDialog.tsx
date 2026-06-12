/**
 * features/files/components/core/FileInfo/FileInfoDialog.tsx
 *
 * Read-only "File info" dialog — restores parity with the legacy
 * components/file-system/context-menu File Info modal that exposed size,
 * mime-type, dates, storage path, owner, visibility, and the canonical
 * file id (copyable so devs can paste it into Redux DevTools / API calls).
 *
 * Triggered by the "File info" item inside `FileContextMenu`. Uses Dialog
 * on desktop; a future mobile pass should swap to Drawer (per the
 * iOS-first rules).
 */

"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Globe, Lock, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { selectAllFoldersMap, selectFileById } from "@/features/files/redux/selectors";
import { formatFileSize } from "@/features/files/utils/format";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { EntityScopeTagger } from "@/features/scopes/components/entity-context/EntityScopeTagger";
import { useActiveContext } from "@/features/scopes/hooks/useActiveContext";
import type { Visibility } from "@/features/files/types";

export interface FileInfoDialogProps {
  fileId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FileInfoDialog({
  fileId,
  open,
  onOpenChange,
}: FileInfoDialogProps) {
  const file = useAppSelector((s) =>
    fileId ? selectFileById(s, fileId) : null,
  );
  const foldersById = useAppSelector(selectAllFoldersMap);
  const activeContext = useActiveContext();

  // Resolve the parent-folder breadcrumb for context.
  let parentPath = "/";
  if (file?.parentFolderId) {
    const segments: string[] = [];
    let cursor: string | null = file.parentFolderId;
    let depth = 0;
    while (cursor && depth < 32) {
      const f = foldersById[cursor];
      if (!f) break;
      segments.unshift(f.folderName);
      cursor = f.parentId;
      depth += 1;
    }
    parentPath = segments.length ? `/ ${segments.join(" / ")}` : "/";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {file ? (
              <>
                <FileIcon fileName={file.fileName} size={18} />
                <span className="truncate">{file.fileName}</span>
              </>
            ) : (
              "File details"
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Read-only details about this file.
          </DialogDescription>
        </DialogHeader>

        {file ? (
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
            <Field label="Size">
              {file.fileSize != null ? formatFileSize(file.fileSize) : "—"}
            </Field>
            <Field label="Type">{file.mimeType || "—"}</Field>
            <Field label="Visibility">
              <VisibilityChip visibility={file.visibility} />
            </Field>
            <Field label="Folder">
              <span
                className="truncate text-muted-foreground"
                title={parentPath}
              >
                {parentPath}
              </span>
            </Field>
            <Field label="Created">{formatDate(file.createdAt)}</Field>
            <Field label="Modified">{formatDate(file.updatedAt)}</Field>
            <Field label="File path">
              <CopyableMono value={file.filePath} />
            </Field>
            <Field label="File id">
              <CopyableMono value={file.id} />
            </Field>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No file selected.</p>
        )}

        {/*
         * Scopes — tag this file to the org's scopes (Client, Case, Patient…).
         * Writes ctx_scope_assignments via the canonical EntityScopeTagger
         * (local per-entity tagging, never appContext). Real files only.
         */}
        {file && file.source.kind === "real" ? (
          <div className="mt-2 border-t border-border pt-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Scopes
            </p>
            {activeContext.organizationId ? (
              <EntityScopeTagger
                entityType="file"
                entityId={file.id}
                organizationId={activeContext.organizationId}
                variant="compact"
                showHeader={false}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Select an organization in the context bar to tag this file to a
                scope.
              </p>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground self-center">
        {label}
      </dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </>
  );
}

function VisibilityChip({ visibility }: { visibility: Visibility }) {
  const map: Record<
    Visibility,
    { Icon: typeof Lock; label: string; tone: string }
  > = {
    private: {
      Icon: Lock,
      label: "Private",
      tone: "bg-muted text-muted-foreground",
    },
    shared: {
      Icon: Users,
      label: "Shared",
      tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    public: {
      Icon: Globe,
      label: "Public",
      tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
  };
  const { Icon, label, tone } = map[visibility];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function CopyableMono({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable in non-secure context */
    }
  }, [value]);

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <code
        className="flex-1 truncate rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono"
        title={value}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={() => void onCopy()}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        title={copied ? "Copied" : "Copy"}
        aria-label="Copy"
      >
        {copied ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
