/**
 * features/file-analysis/studio/ThumbnailStrip.tsx
 *
 * Left rail of the studio — page thumbnails with status + exclude toggle.
 *
 * Implementation choice: we DON'T pre-render every page on mount (200-page
 * docs are common). Instead we list page rows with a small index card and
 * lazily fetch a server-rendered overlay thumbnail when the row is in the
 * viewport (via IntersectionObserver). The active page is always rendered
 * (it's centered).
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { EyeOff, Eye, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePages } from "@/features/file-analysis/hooks/usePages";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type { FilePageOut } from "@/features/file-analysis/api/file-analysis";

interface Props {
  fileId: string;
  activePageNumber: number;
  onSelectPage: (pageNumber: number, pageId: string | null) => void;
}

export function ThumbnailStrip({ fileId, activePageNumber, onSelectPage }: Props) {
  const { pages, loading } = usePages(fileId);

  if (loading && !pages.length) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    );
  }
  if (!pages.length) {
    return (
      <div className="px-2 py-4 text-center text-[11px] text-muted-foreground">
        No pages yet — analysis runs at upload.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-2">
      <ul className="space-y-1.5">
        {pages.map((p) => (
          <ThumbnailItem
            key={p.id}
            fileId={fileId}
            page={p}
            active={activePageNumber === p.page_index + 1}
            onSelect={() => onSelectPage(p.page_index + 1, p.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function ThumbnailItem({
  fileId,
  page,
  active,
  onSelect,
}: {
  fileId: string;
  page: FilePageOut;
  active: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLLIElement | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) setVisible(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || thumbnail) return;
    let cancelled = false;
    Api.renderPageWithOverlay(fileId, {
      page_id: page.id,
      overlays: [],
      dpi: 50,
      return_format: "png",
    })
      .then(({ data }) => {
        if (cancelled) return;
        setThumbnail(`data:image/png;base64,${data.image_base64}`);
      })
      .catch(() => {
        // ignore — render lazily next time the strip scrolls.
      });
    return () => {
      cancelled = true;
    };
  }, [visible, thumbnail, fileId, page.id]);

  const excluded = page.status === "excluded";

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (excluded) {
      await Api.includePage(fileId, page.id);
    } else {
      await Api.excludePage(fileId, page.id, { reason: null });
    }
  };

  return (
    <li
      ref={ref}
      className={cn(
        "group relative cursor-pointer rounded border transition-colors",
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:bg-accent/30",
        excluded ? "opacity-50" : "",
      )}
      onClick={onSelect}
    >
      <div className="aspect-[8.5/11] w-full overflow-hidden rounded">
        {thumbnail ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumbnail}
            alt={`Page ${page.page_index + 1}`}
            className="block h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted/30 text-[10px] text-muted-foreground">
            p{page.page_index + 1}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-1 px-1 py-0.5 text-[10px]">
        <span className="tabular-nums text-muted-foreground">
          {page.page_index + 1}
        </span>
        {page.text_source === "ocr" || page.text_source === "mixed" ? (
          <span className="rounded bg-amber-500/15 px-1 py-px text-[8px] uppercase text-amber-700 dark:text-amber-300">
            ocr
          </span>
        ) : null}
        <button
          type="button"
          onClick={(e) => void toggle(e)}
          className="ml-auto opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          title={excluded ? "Include in extraction" : "Exclude from extraction"}
        >
          {excluded ? (
            <Eye className="h-3 w-3" />
          ) : (
            <EyeOff className="h-3 w-3" />
          )}
        </button>
      </div>
    </li>
  );
}
