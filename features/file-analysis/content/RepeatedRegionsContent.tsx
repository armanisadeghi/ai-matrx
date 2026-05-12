/**
 * RepeatedRegionsContent — cards for each repeating header/footer/watermark
 * with cropped previews + a list of pages they appear on.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as Api from "@/features/file-analysis/api/file-analysis";
import {
  allResults,
  asObject,
  type RepeatedRegionPayload,
  type RepeatedRegionsPayload,
} from "./utils";
import type { FileAnalysisResultRow } from "@/features/file-analysis/api/file-analysis";

interface Props {
  fileId: string;
  results: FileAnalysisResultRow[];
  onJumpToPage?: (pageNumber: number) => void;
  initialTier?: "low" | "medium" | "high";
}

export function RepeatedRegionsContent({
  fileId,
  results,
  onJumpToPage,
  initialTier = "medium",
}: Props) {
  const rows = allResults(results, "repeated_regions");
  const [tier, setTier] = useState<"low" | "medium" | "high">(initialTier);
  const row = rows.find((r) => r.confidence_tier === tier) ?? rows[0];
  const regions =
    asObject<RepeatedRegionsPayload>(row?.payload)?.regions ?? [];

  if (!rows.length) {
    return (
      <Empty message="Repeated-region detection hasn't finished yet." />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Tier
        </span>
        {(["low", "medium", "high"] as const).map((t) => {
          const trow = rows.find((r) => r.confidence_tier === t);
          const count =
            ((asObject<RepeatedRegionsPayload>(trow?.payload))?.regions ?? [])
              .length;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] capitalize transition-colors",
                tier === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {t} · {count}
            </button>
          );
        })}
      </div>

      {!regions.length ? (
        <Empty message={`No repeating regions at the ${tier} tier.`} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {regions.map((r) => (
            <RegionCard
              key={r.region_id}
              fileId={fileId}
              region={r}
              onJumpToPage={onJumpToPage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RegionCard({
  fileId,
  region,
  onJumpToPage,
}: {
  fileId: string;
  region: RepeatedRegionPayload;
  onJumpToPage?: (page: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const samplePage = region.bbox_per_page?.[0];

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
    if (!visible || png || !samplePage) return;
    Api.renderPageWithOverlay(fileId, {
      page_number: samplePage.page_number,
      overlays: [
        {
          bbox: {
            x0: samplePage.x0,
            y0: samplePage.y0,
            x1: samplePage.x1,
            y1: samplePage.y1,
          },
          color: "#f472b6",
          fill: "#f472b6",
          fill_opacity: 0.18,
          stroke_width: 2,
          label: region.kind,
          font_size: 10,
        },
      ],
      dpi: 90,
      return_format: "png",
    })
      .then(({ data }) => setPng(`data:image/png;base64,${data.image_base64}`))
      .catch(() => null);
  }, [visible, png, fileId, samplePage, region.kind]);

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-2 py-1 text-[10px]">
        <span className="rounded bg-muted px-1.5 py-px uppercase tracking-wider text-muted-foreground">
          {region.kind}
        </span>
        <span className="text-muted-foreground">
          {region.pages.length} pages · {Math.round(region.confidence * 100)}%
        </span>
        <span className="ml-auto font-mono text-[9px] text-muted-foreground">
          {region.region_id.slice(0, 6)}
        </span>
      </div>
      <div className="aspect-[8.5/11] bg-muted/30">
        {png ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={png}
            alt={`Repeating ${region.kind}`}
            className="block h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="space-y-1 border-t border-border bg-card/40 p-2 text-[11px]">
        <div className="line-clamp-2 break-words text-muted-foreground">
          <span className="font-medium text-foreground">Template:</span>{" "}
          {region.text_template || "(empty)"}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Pages:</span>
          <span className="flex flex-wrap gap-1">
            {region.pages.slice(0, 12).map((p) =>
              onJumpToPage ? (
                <button
                  key={p}
                  type="button"
                  onClick={() => onJumpToPage(p)}
                  className="rounded bg-muted px-1 py-px text-[9px] tabular-nums hover:bg-accent"
                >
                  {p}
                </button>
              ) : (
                <span key={p} className="rounded bg-muted px-1 py-px text-[9px] tabular-nums">
                  {p}
                </span>
              ),
            )}
            {region.pages.length > 12 ? (
              <span className="text-[9px] text-muted-foreground">
                +{region.pages.length - 12} more
              </span>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="rounded border border-dashed border-border bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}
