"use client";

/**
 * features/image-manager/components/CloudFileMetadataSheet.tsx
 *
 * Read-only metadata side sheet for a single cloud file. Surfaces the
 * fields the user most often wants to know — name, size, dimensions
 * (when available in the file metadata bag), MIME, visibility, dates,
 * folder path, current version, and a copyable file id.
 *
 * Intentionally read-only in this iteration. Editing (rename, move,
 * tags, etc.) will land in a follow-up — likely promoting this sheet
 * into a small form once the cloud-files mutate API exposes those
 * actions to the client.
 */

import React from "react";
import { Copy } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MediaThumbnail } from "@/features/files/components/core/MediaThumbnail/MediaThumbnail";
import {
  formatAbsoluteDate,
  formatFileSize,
  formatRelativeTime,
} from "@/features/files/utils/format";
import type { CloudFileRecord } from "@/features/files/types";
import { toast } from "sonner";

export interface CloudFileMetadataSheetProps {
  file: CloudFileRecord | null;
  onOpenChange: (open: boolean) => void;
}

export function CloudFileMetadataSheet({
  file,
  onOpenChange,
}: CloudFileMetadataSheetProps) {
  const open = file !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
        {file ? (
          <>
            <SheetHeader>
              <SheetTitle className="truncate" title={file.fileName}>
                {file.fileName}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Read-only file details — editing comes in a follow-up.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 aspect-square w-full overflow-hidden rounded-md bg-muted">
              <MediaThumbnail
                file={file}
                iconSize={48}
                className="h-full w-full"
              />
            </div>

            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Size" value={formatFileSize(file.fileSize)} />
              <Row label="Type" value={file.mimeType || "—"} mono />
              <Row
                label="Visibility"
                value={visibilityLabel(file.visibility)}
              />
              <Row label="Version" value={`v${file.currentVersion}`} />
              <Row label="Path" value={file.filePath || "/"} mono />
              <Row
                label="Updated"
                value={`${formatRelativeTime(file.updatedAt)} (${formatAbsoluteDate(file.updatedAt)})`}
              />
              <Row
                label="Created"
                value={`${formatRelativeTime(file.createdAt)} (${formatAbsoluteDate(file.createdAt)})`}
              />
              <Row label="File id" value={file.id} mono copyable />
              {file.checksum ? (
                <Row label="Checksum" value={file.checksum} mono copyable />
              ) : null}
              <ExtendedMetadata metadata={file.metadata} />
            </dl>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function visibilityLabel(v: CloudFileRecord["visibility"]): string {
  switch (v) {
    case "public":
      return "Public";
    case "private":
      return "Private";
    case "shared":
      return "Shared";
    default:
      return v;
  }
}

function Row({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const handleCopy = () => {
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error(`Couldn't copy ${label.toLowerCase()}`));
  };

  return (
    <div className="grid grid-cols-[80px_1fr_auto] items-start gap-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground pt-0.5">
        {label}
      </dt>
      <dd
        className={
          mono
            ? "text-xs font-mono break-all text-foreground"
            : "text-sm text-foreground break-words"
        }
      >
        {value}
      </dd>
      {copyable ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={handleCopy}
          title={`Copy ${label.toLowerCase()}`}
        >
          <Copy className="h-3 w-3" />
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}

function ExtendedMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  // Skip empty bags; show only primitive values to keep this tight.
  const entries = Object.entries(metadata ?? {}).filter(([, v]) => {
    return (
      typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    );
  });
  if (entries.length === 0) return null;

  return (
    <div className="pt-3 mt-3 border-t border-border">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
        Extras
      </div>
      <div className="space-y-1">
        {entries.map(([key, value]) => (
          <Row key={key} label={key} value={String(value)} mono />
        ))}
      </div>
    </div>
  );
}
