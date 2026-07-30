"use client";

/**
 * Page visual-feedback composition over two platform primitives:
 * the shared annotation window and canonical file → web_page associations.
 */

import { ImagePlus, Loader2, PenLine, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { fileIdToMediaRef } from "@/features/files/redux/converters";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import { useOpenImageAnnotationWindow } from "@/features/overlays/openers/imageAnnotationWindow";
import {
  type ContainerLink,
  useContainerLinks,
} from "@/features/scopes/hooks/useContainerLinks";
import type { MarketingPage } from "@/features/marketing/types";
import { toast } from "@/lib/toast";

const VISUAL_FEEDBACK_KIND = "visual_feedback";

function isVisualFeedbackLink(link: ContainerLink): boolean {
  const metadata = link.metadata;
  return (
    metadata !== null &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    "kind" in metadata &&
    metadata.kind === VISUAL_FEEDBACK_KIND
  );
}

export function usePageVisualFeedback(page: MarketingPage) {
  const links = useContainerLinks({
    containerType: "web_page",
    containerId: page.id,
    orgId: page.organization_id,
  });
  const openAnnotation = useOpenImageAnnotationWindow();

  const attachSavedFile = async ({
    result,
    origin,
    sourceFileId,
  }: {
    result: { fileId: string; filename: string };
    origin: "new" | "crawl_capture" | "existing_feedback";
    sourceFileId?: string | null;
  }) => {
    if (links.attachedIdsFor("file").has(result.fileId)) {
      await links.reload();
      toast.success("Visual feedback updated");
      return;
    }
    const attached = await links.attach(
      "file",
      result.fileId,
      result.filename,
      {
        kind: VISUAL_FEEDBACK_KIND,
        origin,
        page_id: page.id,
        source_file_id: sourceFileId ?? null,
      },
    );
    if (!attached.ok) {
      toast.error("Markup saved but NOT attached to this page", {
        description: `${attached.error ?? "The association write failed."} The image is safe in ${CloudFolders.IMAGES_ANNOTATED} and can be attached manually from Files.`,
        duration: 12000,
      });
      return;
    }
    toast.success("Visual feedback attached to page");
  };

  const openNew = () =>
    openAnnotation({
      title: "Add visual feedback",
      defaultFolder: CloudFolders.IMAGES_ANNOTATED,
      onSaved: ({ result }) =>
        attachSavedFile({
          result,
          origin: "new",
        }),
    });

  const openCapture = (fileId: string, label: string) =>
    openAnnotation({
      sourceFileId: fileId,
      sourceFilename: label,
      title: `Mark up ${label}`,
      defaultFolder: CloudFolders.IMAGES_ANNOTATED,
      overwriteSource: false,
      onSaved: ({ result }) =>
        attachSavedFile({
          result,
          origin: "crawl_capture",
          sourceFileId: fileId,
        }),
    });

  const openExisting = (fileId: string, label: string) =>
    openAnnotation({
      sourceFileId: fileId,
      sourceFilename: label,
      title: "Update visual feedback",
      defaultFolder: CloudFolders.IMAGES_ANNOTATED,
      overwriteSource: true,
      onSaved: ({ result }) =>
        attachSavedFile({
          result,
          origin: "existing_feedback",
          sourceFileId: fileId,
        }),
    });

  return {
    links,
    visualLinks: links.linksFor("file").filter(isVisualFeedbackLink),
    openNew,
    openCapture,
    openExisting,
  };
}

export function PageVisualFeedback({ page }: { page: MarketingPage }) {
  const feedback = usePageVisualFeedback(page);
  const openFilePreview = useOpenFilePreviewWindow();

  const detach = async (link: ContainerLink) => {
    const result = await feedback.links.detach("file", link.resourceId);
    if (!result.ok) {
      toast.error("Could not detach visual feedback", {
        description: result.error,
      });
      return;
    }
    toast.success("Visual feedback detached");
  };

  return (
    <section className="mb-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            Visual feedback
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Capture or upload an image, draw on it, and attach the flattened
            markup to this page.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          onClick={feedback.openNew}
        >
          <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
          Add visual feedback
        </Button>
      </div>

      {feedback.links.status === "loading" ||
      feedback.links.status === "idle" ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading attachments…
        </p>
      ) : feedback.links.status === "error" ? (
        <p className="mt-3 text-xs text-destructive">
          Could not load visual feedback: {feedback.links.error}
        </p>
      ) : feedback.visualLinks.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No marked-up images attached yet.
        </p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {feedback.visualLinks.map((link) => (
            <div
              key={link.edgeId}
              className="group overflow-hidden rounded-lg border border-border bg-card"
            >
              <button
                type="button"
                className="relative block h-28 w-full bg-muted/30"
                onClick={() =>
                  openFilePreview({ fileId: link.resourceId })
                }
                aria-label={`Preview ${link.label ?? "visual feedback"}`}
              >
                <InlineMediaRef
                  ref={fileIdToMediaRef(link.resourceId, "image/png")}
                  size="fill"
                  fit="cover"
                  rounded="none"
                  fallback="icon"
                  errorFallback="icon"
                  alt={link.label ?? "Visual feedback"}
                />
              </button>
              <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                  {link.label ?? "Visual feedback"}
                </span>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() =>
                    feedback.openExisting(
                      link.resourceId,
                      link.label ?? "visual feedback",
                    )
                  }
                  title="Edit markup"
                  aria-label="Edit markup"
                >
                  <PenLine className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void detach(link)}
                  title="Detach from page"
                  aria-label="Detach from page"
                >
                  <Unlink className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
