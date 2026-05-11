"use client";

/**
 * RegionOverlayPreview — renders one PDF page as an image (via
 * `/utilities/pdf/render-page`) and draws every detected region's bbox
 * on top as a coloured rectangle.
 *
 * Used by the `/detect-repeated-regions` demo to visually confirm that
 * the detector caught the right zones. Each region gets a stable colour
 * derived from its `region_id` so the bbox and the JSON entry can be
 * cross-referenced visually.
 *
 * Coord mapping: PyMuPDF returns bboxes in PDF points (72 pt = 1 inch).
 * The rendered image is in pixels at `dpi`. We convert via
 * `px = pt * dpi / 72`, then position absolutely inside the rendered img.
 */

import { useEffect, useState } from "react";

import {
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { usePdfDemoApi } from "../hooks/usePdfDemoApi";
import type { PdfSourcePayload } from "./PdfSourcePicker";
import type {
  RepeatedRegion,
  RepeatedRegionBbox,
} from "@/features/pdf-extractor/types";

interface Props {
  sourcePayload: PdfSourcePayload | null;
  /** Detected regions; all bboxes for the same page are drawn on one image. */
  regions: RepeatedRegion[];
  /** DPI for the rendered page — higher = sharper but slower. */
  dpi?: number;
  /** Page numbers to render. If null, picks the first page of every region. */
  pageNumbers?: number[] | null;
}

interface PageState {
  loading: boolean;
  error: string | null;
  url: string | null;
  width: number;
  height: number;
}

const PALETTE = [
  "rgba(244, 114, 182, 0.9)", // pink
  "rgba(96, 165, 250, 0.9)", // blue
  "rgba(74, 222, 128, 0.9)", // green
  "rgba(251, 191, 36, 0.9)", // amber
  "rgba(167, 139, 250, 0.9)", // violet
  "rgba(248, 113, 113, 0.9)", // red
  "rgba(45, 212, 191, 0.9)", // teal
];

function colorForRegion(regionId: string): string {
  let hash = 0;
  for (let i = 0; i < regionId.length; i++) {
    hash = (hash << 5) - hash + regionId.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function RegionOverlayPreview({
  sourcePayload,
  regions,
  dpi = 120,
  pageNumbers = null,
}: Props) {
  const api = usePdfDemoApi();
  const [pages, setPages] = useState<Record<number, PageState>>({});

  const wantedPages = (() => {
    if (pageNumbers && pageNumbers.length) {
      return Array.from(new Set(pageNumbers)).sort((a, b) => a - b);
    }
    const seen = new Set<number>();
    const out: number[] = [];
    for (const r of regions) {
      const p = r.bbox_per_page?.[0]?.page_number;
      if (p && !seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
    return out.slice(0, 6); // Cap to avoid runaway render calls.
  })();

  useEffect(() => {
    let cancelled = false;
    setPages({});
    if (!sourcePayload || !wantedPages.length) return;

    (async () => {
      for (const page of wantedPages) {
        if (cancelled) return;
        setPages((prev) => ({
          ...prev,
          [page]: {
            loading: true,
            error: null,
            url: null,
            width: 0,
            height: 0,
          },
        }));
        try {
          const blob = await api.postPdfBlob("renderPage", {
            ...sourcePayload,
            page,
            dpi,
            fmt: "png",
          });
          if (cancelled) return;
          const url = URL.createObjectURL(blob.blob);
          // We need natural width / height to compute scale. Load image.
          const dims = await new Promise<{ w: number; h: number }>(
            (resolve, reject) => {
              const img = new Image();
              img.onload = () =>
                resolve({ w: img.naturalWidth, h: img.naturalHeight });
              img.onerror = reject;
              img.src = url;
            },
          );
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          setPages((prev) => ({
            ...prev,
            [page]: {
              loading: false,
              error: null,
              url,
              width: dims.w,
              height: dims.h,
            },
          }));
        } catch (err) {
          if (cancelled) return;
          setPages((prev) => ({
            ...prev,
            [page]: {
              loading: false,
              error: err instanceof Error ? err.message : String(err),
              url: null,
              width: 0,
              height: 0,
            },
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
      setPages((prev) => {
        Object.values(prev).forEach((s) => {
          if (s.url) URL.revokeObjectURL(s.url);
        });
        return prev;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcePayload, regions, dpi, wantedPages.join(",")]);

  if (!sourcePayload || !regions.length) return null;

  // For each rendered page, collect every bbox + its region color.
  function bboxesForPage(page: number): Array<{
    bbox: RepeatedRegionBbox;
    color: string;
    regionId: string;
    kind: string;
  }> {
    const out: Array<{
      bbox: RepeatedRegionBbox;
      color: string;
      regionId: string;
      kind: string;
    }> = [];
    for (const r of regions) {
      for (const b of r.bbox_per_page ?? []) {
        if (b.page_number === page) {
          out.push({
            bbox: b,
            color: colorForRegion(r.region_id),
            regionId: r.region_id,
            kind: r.kind,
          });
        }
      }
    }
    return out;
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ImageIcon className="h-4 w-4 text-primary" />
        Region overlays (first {wantedPages.length} representative page
        {wantedPages.length === 1 ? "" : "s"})
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {wantedPages.map((page) => {
          const state = pages[page];
          const overlays = bboxesForPage(page);
          if (!state || state.loading) {
            return (
              <div
                key={page}
                className="flex h-72 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-xs text-muted-foreground"
              >
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> rendering page{" "}
                {page}…
              </div>
            );
          }
          if (state.error) {
            return (
              <div
                key={page}
                className="flex h-72 flex-col items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
              >
                <span className="font-medium mb-1">Page {page}</span>
                <span className="break-words">{state.error}</span>
              </div>
            );
          }
          if (!state.url) return null;
          // Scale factor: rendered img is `state.width / state.height` px, PDF
          // box is `state.width * 72 / dpi` pt wide. We position bboxes in pt
          // space then convert to px via dpi / 72.
          const ptToPx = dpi / 72;
          return (
            <div
              key={page}
              className="relative overflow-hidden rounded-md border border-border bg-muted"
            >
              <div className="absolute left-1 top-1 z-10 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium">
                Page {page}
              </div>
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={state.url}
                  alt={`Page ${page}`}
                  className="block max-w-full"
                />
                {overlays.map((o, idx) => (
                  <div
                    key={`${o.regionId}-${idx}`}
                    className="pointer-events-none absolute"
                    style={{
                      left: `${o.bbox.x0 * ptToPx}px`,
                      top: `${o.bbox.y0 * ptToPx}px`,
                      width: `${(o.bbox.x1 - o.bbox.x0) * ptToPx}px`,
                      height: `${(o.bbox.y1 - o.bbox.y0) * ptToPx}px`,
                      outline: `2px solid ${o.color}`,
                      backgroundColor: o.color.replace(/0\.9\)/, "0.15)"),
                      boxShadow: `0 0 0 1px rgba(0,0,0,0.3)`,
                    }}
                    title={`${o.kind} — ${o.regionId.slice(0, 8)}…`}
                  >
                    <span
                      className="absolute -top-4 left-0 rounded px-1 py-0.5 text-[9px] font-medium text-white"
                      style={{ backgroundColor: o.color }}
                    >
                      {o.kind}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {regions.map((r) => (
          <div
            key={r.region_id}
            className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs"
          >
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: colorForRegion(r.region_id) }}
            />
            <span className="font-medium">{r.kind}</span>
            <span className="text-muted-foreground">
              · {r.pages.length} page{r.pages.length === 1 ? "" : "s"}
            </span>
            <span className="text-muted-foreground">· {r.confidence.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
