"use client";

/**
 * GeneratedImageSetBlock — THE renderer for the `generated_image_set` kind.
 * There is no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (`features/content-ir/FEATURE.md`). Every
 * image-generating node in the platform emits this shape, so this component
 * is what chat, the live-run window, and the workflow-runtime readout all
 * show. Need one tile on its own? Import `GeneratedImageTile`. Need a verb on
 * it? The kind-component action registry. **Do not build a second image grid.**
 *
 * 🚨 MEDIA DURABILITY. Media renders ONLY through `<InlineMediaRef>`, handed
 * the item's durable handle (`file_id` when the producer supplied one, else
 * its most durable URL — decided once in `kinds/media-io-shared.ts`). No raw
 * `<img src>` anywhere: a signed URL that expires re-mints instead of
 * breaking.
 *
 * NO DEAD ENDS. A tile with a `file_id` opens the canonical file preview
 * window; a URL-only tile opens the image viewer. Every image the user can
 * see is an image the user can reach.
 */

import { ImageIcon, Loader2 } from "lucide-react";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import { useOpenImageViewerWindow } from "@/features/overlays/openers/imageViewer";
import {
  readGeneratedImageList,
  type GeneratedImageData,
  type GeneratedImageSetData,
} from "@/features/content-ir/kinds/generated-image-set";
import {
  formatCost,
  readUsage,
} from "@/features/content-ir/kinds/media-io-shared";
import { cn } from "@/lib/utils";

export interface GeneratedImageSetBlockProps {
  serverData?: unknown;
  /** Hide the header row — for a host frame that already draws its own chrome. */
  hideHeader?: boolean;
  className?: string;
}

/**
 * The bridge already produced this shape; this re-read is the same defensive
 * boundary every kind block keeps, so stale or foreign `serverData` renders
 * nothing rather than throwing inside a stream.
 */
export function readGeneratedImageSetData(
  serverData: unknown,
): GeneratedImageSetData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<GeneratedImageSetData>;
  if (!Array.isArray(candidate.images)) return null;
  return {
    images: readGeneratedImageList(candidate.images),
    count: typeof candidate.count === "number" ? candidate.count : null,
    model: typeof candidate.model === "string" ? candidate.model : "",
    usage: readUsage(candidate.usage),
    isComplete: candidate.isComplete === true,
  };
}

// ---------------------------------------------------------------------------
// PARTS — importable alone so a surface can render one tile without
// re-implementing it. The ONLY sanctioned way to render part of this shape.
// ---------------------------------------------------------------------------

export function GeneratedImageTile({
  image,
  index,
}: {
  image: GeneratedImageData;
  index: number;
}) {
  const openFilePreview = useOpenFilePreviewWindow();
  const openImageViewer = useOpenImageViewerWindow();

  const viewerUrl = image.cdn_url ?? image.url;
  const label = `Generated image ${index + 1}`;

  const open = () => {
    if (image.file_id) {
      openFilePreview({ fileId: image.file_id });
      return;
    }
    if (viewerUrl)
      openImageViewer({ images: [viewerUrl], alts: [label], title: label });
  };

  const dims =
    image.width && image.height ? `${image.width}×${image.height}` : null;

  return (
    <figure className="animate-in fade-in group min-w-0">
      <InlineMediaRef
        ref={image.handle}
        as="img"
        size="fill"
        fit="contain"
        rounded="md"
        border="subtle"
        alt={label}
        onClick={open}
        className="aspect-square w-full bg-muted transition-opacity group-hover:opacity-90"
      />
      {(dims || image.seed !== null) && (
        <figcaption className="mt-1 flex flex-wrap items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
          {dims && <span>{dims}</span>}
          {image.seed !== null && <span>seed {image.seed}</span>}
        </figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// The parent — composes the parts.
// ---------------------------------------------------------------------------

export default function GeneratedImageSetBlock({
  serverData,
  hideHeader = false,
  className,
}: GeneratedImageSetBlockProps) {
  const data = readGeneratedImageSetData(serverData);
  if (!data) return null;

  const cost = formatCost(data.usage?.cost_usd ?? null);

  return (
    <div className={cn("my-2 space-y-2", className)}>
      {!hideHeader && (
        <div className="flex flex-wrap items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Generated images
          </span>
          {data.images.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {data.images.length}
            </span>
          )}
          {data.model && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {data.model}
            </span>
          )}
          {cost && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {cost}
            </span>
          )}
          {!data.isComplete && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating
            </span>
          )}
        </div>
      )}

      {data.images.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {data.isComplete
            ? "No images were returned."
            : "Waiting for the first image…"}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {data.images.map((image, index) => (
            <GeneratedImageTile
              key={image.file_id ?? image.handle ?? index}
              image={image}
              index={index}
            />
          ))}
        </div>
      )}
    </div>
  );
}
