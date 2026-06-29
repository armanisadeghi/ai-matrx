"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play } from "lucide-react";
import { InlineMediaRef } from "@/features/files";
import { useInfiniteWindow } from "@/features/files";
import {
  formatDuration,
  formatRangeHeader,
  formatMonthHeader,
} from "../../shared/relative-time";
import type { WAMediaItem } from "../../types";

interface MediaTabProps {
  items: WAMediaItem[];
}

interface MediaGroup {
  id: string;
  label: string;
  rangeLabel?: string;
  items: WAMediaItem[];
}

function groupMedia(items: WAMediaItem[]): MediaGroup[] {
  if (items.length === 0) return [];
  const NOW = new Date();
  const dayMs = 86_400_000;

  const recentCutoff = new Date(NOW.getTime() - 14 * dayMs);
  const recent = items.filter((i) => new Date(i.createdAt) >= recentCutoff);
  const older = items.filter((i) => new Date(i.createdAt) < recentCutoff);

  const byMonth = new Map<string, WAMediaItem[]>();
  for (const item of older) {
    const key = item.createdAt.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(item);
  }

  const groups: MediaGroup[] = [];
  if (recent.length > 0) {
    const sorted = [...recent].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
    groups.push({
      id: "recent",
      label: "Last week",
      rangeLabel: formatRangeHeader(
        sorted[sorted.length - 1].createdAt,
        sorted[0].createdAt,
      ),
      items: sorted,
    });
  }
  for (const [key, monthItems] of [...byMonth.entries()].sort((a, b) =>
    a[0] < b[0] ? 1 : -1,
  )) {
    const sorted = [...monthItems].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
    groups.push({
      id: key,
      label: formatMonthHeader(sorted[0].createdAt),
      rangeLabel: formatRangeHeader(
        sorted[sorted.length - 1].createdAt,
        sorted[0].createdAt,
      ),
      items: sorted,
    });
  }
  return groups;
}

const PAGE = 60;

export function MediaTab({ items }: MediaTabProps) {
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [items],
  );

  const { visibleCount, hasMore, sentinelRef } = useInfiniteWindow({
    total: sorted.length,
    initial: PAGE,
    pageSize: PAGE,
    resetKey: items.length,
  });

  const visible = useMemo(
    () => sorted.slice(0, visibleCount),
    [sorted, visibleCount],
  );

  const groups = useMemo(() => groupMedia(visible), [visible]);

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-20 text-center text-[14px] text-muted-foreground">
        No media in your library yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-4">
      {groups.map((g) => (
        <section key={g.id}>
          <header className="pb-2">
            <h3 className="text-[20px] font-semibold text-foreground">
              {g.label}
            </h3>
            {g.rangeLabel ? (
              <div className="text-[12.5px] text-muted-foreground">
                {g.rangeLabel}
              </div>
            ) : null}
          </header>
          <div className="grid grid-cols-5 gap-1">
            {g.items.map((item) => (
              <MediaTile key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
      {hasMore ? (
        <div
          ref={sentinelRef}
          className="flex h-12 items-center justify-center text-[12.5px] text-muted-foreground"
        >
          Loading more…
        </div>
      ) : (
        <div className="py-2 text-center text-[12px] text-muted-foreground">
          {sorted.length} item{sorted.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

function MediaTile({ item }: { item: WAMediaItem }) {
  const tileRef = useRef<HTMLButtonElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Only fire image / signed-URL requests when the tile actually scrolls
  // near the viewport. Without this, mounting 60 windowed tiles fires
  // 60 simultaneous requests; the first ~15-20 succeed and the rest
  // queue or stall. With it, requests follow the user's scroll.
  useEffect(() => {
    if (isVisible) return undefined;
    const el = tileRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isVisible]);

  const inlineUrl = item.thumbnailUrl || item.url;
  // InlineMediaRef does the cloud-files URL hop internally — we pass the
  // preferred reference and let the universal handler pick the right URL
  // flavour (cloud_file_id → CDN, else inline URL).
  const ref = isVisible
    ? (inlineUrl || item.cloudFileId || null)
    : null;

  return (
    <button
      ref={tileRef}
      type="button"
      className="group relative aspect-square overflow-hidden rounded-md bg-muted"
      title={item.conversationName ?? item.caption ?? ""}
    >
      {ref ? (
        <InlineMediaRef
          ref={ref}
          size="fill"
          fit="cover"
          rounded="none"
          fallback={null}
          alt={item.caption ?? item.conversationName ?? "Media"}
        />
      ) : null}
      {item.kind === "video" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/15">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55">
            <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
          </div>
        </div>
      ) : null}
      {item.kind === "video" && item.durationSec ? (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[11px] text-white">
          {formatDuration(item.durationSec)}
        </span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-1.5 pt-6 text-left">
        <span className="block truncate text-[12.5px] font-medium text-white">
          {item.conversationName ?? ""}
        </span>
      </div>
    </button>
  );
}
