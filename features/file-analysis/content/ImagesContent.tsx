/**
 * ImagesContent — thumbnail grid of every embedded image, fetched lazily.
 *
 * Each placement of each image gets its own card with a server-rendered
 * cropped thumbnail (via /render-page-with-overlay clipped to the
 * placement bbox via overlay-as-window — we just use the page renderer
 * since clipping happens via setting the overlay's bbox AS the page,
 * effectively). For simplicity v1 renders each placement page at low DPI
 * and lets the FE crop with CSS; we can move to true server-side cropping
 * later.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as Api from "@/features/file-analysis/api/file-analysis";
import {
  asObject,
  findResult,
  type EmbeddedImagePayload,
  type EmbeddedImagesPayload,
} from "./utils";
import type { FileAnalysisResultRow } from "@/features/file-analysis/api/file-analysis";

interface Props {
  fileId: string;
  results: FileAnalysisResultRow[];
  onJumpToPage?: (pageNumber: number) => void;
}

export function ImagesContent({ fileId, results, onJumpToPage }: Props) {
  const result = findResult(results, "embedded_images");
  const payload = asObject<EmbeddedImagesPayload>(result?.payload);
  const images = payload?.images ?? [];

  if (!images.length) {
    return (
      <div className="rounded border border-dashed border-border bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground">
        No embedded images detected in this document.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {images.map((img, idx) => (
        <ImageCard
          key={`${img.xref}-${idx}`}
          fileId={fileId}
          image={img}
          onJumpToPage={onJumpToPage}
        />
      ))}
    </div>
  );
}

function ImageCard({
  fileId,
  image,
  onJumpToPage,
}: {
  fileId: string;
  image: EmbeddedImagePayload;
  onJumpToPage?: (page: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting) setVisible(true);
      },
      { rootMargin: "120px" },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || png || error) return;
    const placement = image.placements?.[0];
    if (!placement) return;
    Api.renderPageWithOverlay(fileId, {
      page_number: image.page_number,
      overlays: [
        {
          bbox: placement,
          color: "#22c55e",
          fill: "#22c55e",
          fill_opacity: 0,
          stroke_width: 1,
          font_size: 10,
        },
      ],
      dpi: 110,
      return_format: "png",
    })
      .then(({ data }) => setPng(`data:image/png;base64,${data.image_base64}`))
      .catch((e) => setError(e instanceof Error ? e.message : "render failed"));
  }, [visible, png, error, fileId, image]);

  const placement = image.placements?.[0];

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded border border-border bg-card"
    >
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1 text-[10px]">
        <ImageIcon className="h-3 w-3 text-muted-foreground" />
        <span className="rounded bg-muted px-1 py-px uppercase tracking-wider text-muted-foreground">
          p{image.page_number}
        </span>
        <span className="text-muted-foreground">
          {image.width}×{image.height}
        </span>
        <span className="ml-auto text-muted-foreground">{image.filter || "raw"}</span>
      </div>
      <div className="relative flex aspect-[8.5/11] items-center justify-center bg-muted/30">
        {png ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={png}
            alt={`Image on page ${image.page_number}`}
            className="block h-full w-full object-contain"
          />
        ) : error ? (
          <div className="px-2 text-center text-[10px] text-destructive">
            {error}
          </div>
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {placement && png ? (
          <div
            className="pointer-events-none absolute border-2 border-emerald-500"
            style={{
              left: `${(placement.x0 / 612) * 100}%`,
              top: `${(placement.y0 / 792) * 100}%`,
              width: `${((placement.x1 - placement.x0) / 612) * 100}%`,
              height: `${((placement.y1 - placement.y0) / 792) * 100}%`,
            }}
          />
        ) : null}
      </div>
      {onJumpToPage ? (
        <div className="border-t border-border bg-card/40 px-2 py-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onJumpToPage(image.page_number)}
            className="h-6 w-full text-[10px]"
          >
            Open page {image.page_number}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
