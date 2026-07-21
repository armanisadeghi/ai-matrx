"use client";

import dynamic from "next/dynamic";
import { FileCode2, FileText, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaptureThumb } from "@/features/marketing/components/shared/CaptureThumb";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import { useSnapshotScreenshots } from "@/features/marketing/data/inspection-hooks";
import type { PageSnapshot } from "@/features/marketing/types";
import { QueryError } from "@/features/marketing/components/shared/MarketingUi";

const MarkdownPreview = dynamic(
  () =>
    import("@/features/files/components/core/FilePreview/previewers/MarkdownPreview").then(
      (module) => module.MarkdownPreview,
    ),
  { ssr: false },
);

function captureKind(metadata: unknown, fallback: string): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return fallback;
  }
  const value = (metadata as Record<string, unknown>).capture_kind;
  return typeof value === "string" ? value : fallback;
}

export function SnapshotArtifacts({
  siteId,
  snapshot,
  showMarkdown = false,
}: {
  siteId: string;
  snapshot: PageSnapshot;
  showMarkdown?: boolean;
}) {
  const screenshots = useSnapshotScreenshots(siteId, snapshot.id);
  const openFilePreview = useOpenFilePreviewWindow();

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {snapshot.body_file_id ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              openFilePreview({ fileId: snapshot.body_file_id })
            }
          >
            <FileCode2 className="mr-1.5 h-3.5 w-3.5" />
            Open captured HTML
          </Button>
        ) : null}
        {snapshot.markdown_file_id ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              openFilePreview({ fileId: snapshot.markdown_file_id })
            }
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Open extracted Markdown
          </Button>
        ) : null}
      </div>

      {screenshots.isError ? (
        <QueryError
          error={screenshots.error}
          onRetry={() => void screenshots.refetch()}
        />
      ) : screenshots.data?.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {screenshots.data.map((screenshot) =>
            screenshot.file_id ? (
              <CaptureThumb
                key={screenshot.id}
                fileId={screenshot.file_id}
                alt={`${captureKind(screenshot.metadata, screenshot.kind)} screenshot`}
                footer={
                  <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-2 text-[11px]">
                    <span className="font-medium">
                      {captureKind(screenshot.metadata, screenshot.kind)}
                    </span>
                    <span className="text-muted-foreground">
                      {screenshot.width ?? "—"} × {screenshot.height ?? "—"}
                    </span>
                  </div>
                }
              />
            ) : null,
          )}
        </div>
      ) : screenshots.isLoading ? (
        <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
      ) : (
        <div className="flex h-32 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
          <ImageOff className="h-4 w-4" />
          No screenshots were captured for this snapshot.
        </div>
      )}

      {showMarkdown && snapshot.markdown_file_id ? (
        <div className="min-h-[24rem] overflow-hidden rounded-lg border border-border bg-card p-3">
          <MarkdownPreview fileId={snapshot.markdown_file_id} />
        </div>
      ) : null}
    </div>
  );
}
