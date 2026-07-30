"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ImageOff,
  Monitor,
  PenLine,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { CaptureThumb } from "@/features/marketing/components/shared/CaptureThumb";
import { CaptureAttachments } from "@/features/marketing/components/pages/CaptureAttachments";
import { CaptureObservations } from "@/features/marketing/components/pages/CaptureObservations";
import { usePageVisualFeedback } from "@/features/marketing/components/pages/PageVisualFeedback";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import {
  useDeleteScreenshot,
  usePageScreenshots,
} from "@/features/marketing/data/hooks";
import type {
  MarketingPage,
  SiteScreenshot,
} from "@/features/marketing/types";
import {
  captureAvailability,
  pageCaptureRows,
} from "@/features/marketing/lib/marketing-page-scope";
import { marketingPageManifest } from "@/features/surfaces/manifests/marketing-page.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import {
  formatDate,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

// THE NAMING LAW: canonical labels for every declared surface value + group —
// section titles and field labels below render these byte-identically.
const L = surfaceValueLabels(marketingPageManifest);

/** Current capture per kind + per-page capture history, canonical file viewer on click. */
export function PageCapturesCard({ page }: { page: MarketingPage }) {
  const { site, sitePath } = useMarketingSite();
  const pageId = page.id;
  const screenshots = usePageScreenshots(site.id, pageId);
  const deleteMutation = useDeleteScreenshot(site.id);
  const openFilePreview = useOpenFilePreviewWindow();
  const visualFeedback = usePageVisualFeedback(page);
  const [deleting, setDeleting] = useState<SiteScreenshot | null>(null);

  // Same row filter + desktop/mobile classification the surface scope emits
  // (captures / has_desktop_capture / has_mobile_capture).
  const rows = pageCaptureRows(screenshots.data);
  const { hasDesktopCapture, hasMobileCapture } = captureAvailability(rows);

  // Rows arrive newest-first; the first row per kind is the current capture.
  const byKind = new Map<string, (SiteScreenshot & { file_id: string })[]>();
  for (const row of rows) {
    const list = byKind.get(row.kind) ?? [];
    list.push(row);
    byKind.set(row.kind, list);
  }

  const copy = webCopy({
    kind: "web-page-captures",
    label: "Page captures",
    description:
      "Visual capture records for this page (current per kind + history); file_id values open via the canonical file viewer.",
    surface: `Captures — ${page.url}`,
    data: rows,
    lines: [
      ["URL", page.url],
      ["Captures", rows.length],
      ...[...byKind.entries()].map(([kind, captures]): [string, string] => [
        kind,
        `current as of ${formatDate(captures[0].captured_at)} (${captures.length} total)`,
      ]),
    ],
    attributes: { page_id: pageId, count: rows.length },
  });

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      toast.success("Capture deleted");
      setDeleting(null);
    } catch (error) {
      toast.error("Could not delete capture", {
        description: extractErrorMessage(error),
      });
    }
  };

  let body: React.ReactNode;
  if (screenshots.isLoading) {
    body = (
      <div className="m-3 h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  } else if (screenshots.isError) {
    body = (
      <QueryError
        error={screenshots.error}
        onRetry={() => void screenshots.refetch()}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <p className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4" />
        No captures exist for this page yet — they are stored by site
        initialization and screenshot-enabled crawls.
      </p>
    );
  } else {
    body = (
      <div className="grid gap-4 p-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1",
              hasDesktopCapture
                ? "border-border bg-muted/30 text-foreground"
                : "border-warning/40 bg-warning/10 text-warning",
            )}
          >
            <Monitor className="h-3.5 w-3.5" />
            {hasDesktopCapture ? "Desktop captured" : "Desktop not captured"}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1",
              hasMobileCapture
                ? "border-border bg-muted/30 text-foreground"
                : "border-warning/40 bg-warning/10 text-warning",
            )}
          >
            <Smartphone className="h-3.5 w-3.5" />
            {hasMobileCapture ? "Mobile captured" : "Mobile not captured"}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...byKind.entries()].map(([kind, captures]) => {
            const current = captures[0];
            return (
              <div key={kind} className="min-w-0">
                <CaptureThumb
                  fileId={current.file_id}
                  alt={`${kind} capture as of ${formatDate(current.captured_at)}`}
                  footer={
                    <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-1.5 text-[11px]">
                      <span className="font-medium capitalize">{kind}</span>
                      <span className="text-muted-foreground">
                        as of {formatDate(current.captured_at)}
                      </span>
                    </div>
                  }
                />
                <div className="mt-1.5 flex items-center gap-1.5">
                  <CaptureAttachments
                    screenshotId={current.id}
                    orgId={page.organization_id}
                    className="min-w-0 flex-1"
                  />
                  <CaptureObservations
                    screenshot={current}
                    kind={kind}
                    page={page}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      visualFeedback.openCapture(
                        current.file_id,
                        `${kind} capture`,
                      )
                    }
                    className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-border px-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    title="Draw, circle, or write on this capture and attach it as visual feedback"
                    aria-label={`Mark up ${kind} capture`}
                  >
                    <PenLine className="h-3 w-3" />
                    Mark up
                  </button>
                </div>
                {captures.length > 1 ? (
                  <ul className="mt-1.5 grid gap-1">
                    {captures.slice(1).map((capture) => (
                      <li
                        key={capture.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[11px]"
                      >
                        <button
                          type="button"
                          className="truncate text-left text-foreground hover:text-primary"
                          onClick={() =>
                            openFilePreview({ fileId: capture.file_id })
                          }
                          title="Open in file viewer"
                        >
                          as of {formatDate(capture.captured_at)}
                          {capture.width && capture.height
                            ? ` · ${capture.width}×${capture.height}`
                            : ""}
                        </button>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {capture.snapshot_id ? (
                            <Link
                              href={`${sitePath}/pages/${pageId}/snapshots/${capture.snapshot_id}`}
                              className="text-muted-foreground hover:text-primary"
                            >
                              Snapshot
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            title="Mark up this capture"
                            aria-label="Mark up this capture"
                            onClick={() =>
                              visualFeedback.openCapture(
                                capture.file_id,
                                `${kind} capture`,
                              )
                            }
                            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                          >
                            <PenLine className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title="Delete capture"
                            onClick={() => setDeleting(capture)}
                            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
        <ConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Delete capture?"
          description="The capture record moves to trash. The stored file itself is not destroyed."
          variant="destructive"
          confirmLabel="Delete capture"
          busy={deleteMutation.isPending}
          onConfirm={() => void confirmDelete()}
        />
      </div>
    );
  }
  return (
    <SectionCard title={L.captures} copy={copy} collapsible anchor="captures">
      {body}
    </SectionCard>
  );
}
