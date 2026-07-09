"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import type { HtmlPageSummary } from "@/features/html-pages/types";
import { ExternalLink, FileCode, Loader2 } from "lucide-react";
import { HTML_PAGES_GRID_ROW_BATCH } from "@/features/html-pages/utils/list-url-state";

interface HtmlPageGridViewProps {
  pages: HtmlPageSummary[];
  visibleCount: number;
  onVisibleCountChange: (count: number) => void;
  onOpenPage: (pageId: string, e?: React.MouseEvent) => void;
  /** Query string to append so editor can return to this list state. */
  listReturnQuery?: string;
  openTab?: "preview" | "meta" | "html";
}

function LazyPreviewCard({
  page,
  href,
  onOpenPage,
}: {
  page: HtmlPageSummary;
  href: string;
  onOpenPage: (pageId: string, e?: React.MouseEvent) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px 0px", threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-shadow"
    >
      <Link
        href={href}
        onClick={(e) => onOpenPage(page.id, e)}
        className="relative block aspect-[4/3] bg-muted/40 overflow-hidden"
      >
        {!visible && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <FileCode className="h-8 w-8 opacity-30" />
          </div>
        )}
        {visible && !iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-muted/30">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {visible && (
          <iframe
            title={`Preview of ${page.meta_title}`}
            src={page.url}
            sandbox="allow-scripts allow-same-origin"
            loading="lazy"
            onLoad={() => setIframeLoaded(true)}
            className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
            style={{
              width: "200%",
              height: "200%",
              transform: "scale(0.5)",
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </Link>

      <div className="px-2.5 py-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Link
            href={href}
            onClick={(e) => onOpenPage(page.id, e)}
            className="text-sm font-medium text-foreground truncate hover:text-primary min-w-0 flex-1"
            title={page.meta_description || page.meta_title || undefined}
          >
            {page.meta_title || "Untitled"}
          </Link>
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
            title="View live"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}

export default function HtmlPageGridView({
  pages,
  visibleCount,
  onVisibleCountChange,
  onOpenPage,
  listReturnQuery = "",
  openTab = "preview",
}: HtmlPageGridViewProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const slice = pages.slice(0, visibleCount);
  const hasMore = visibleCount < pages.length;

  // Reset depth when the filtered set shrinks below current window.
  useEffect(() => {
    if (visibleCount > pages.length && pages.length > 0) {
      onVisibleCountChange(pages.length);
    }
  }, [pages.length, visibleCount, onVisibleCountChange]);

  // Auto-load three more rows when the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    let locked = false;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || locked) continue;
          locked = true;
          onVisibleCountChange(
            Math.min(pages.length, visibleCount + HTML_PAGES_GRID_ROW_BATCH),
          );
          break;
        }
      },
      { rootMargin: "400px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, pages.length, visibleCount, onVisibleCountChange]);

  if (pages.length === 0) return null;

  const pageHref = (id: string) => {
    const params = new URLSearchParams();
    if (openTab) params.set("tab", openTab);
    if (listReturnQuery) params.set("ret", listReturnQuery);
    const qs = params.toString();
    return qs ? `/cms/html-pages/${id}?${qs}` : `/cms/html-pages/${id}`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {slice.map((page) => (
          <LazyPreviewCard
            key={page.id}
            page={page}
            href={pageHref(page.id)}
            onOpenPage={onOpenPage}
          />
        ))}
      </div>

      {hasMore ? (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center py-6 text-muted-foreground"
          aria-hidden
        >
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          Showing all {pages.length} pages
        </p>
      )}
    </div>
  );
}

export function formatRelativeDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const sameDay = d.toDateString() === now.toDateString();
    const diffHr = Math.floor(diffMin / 60);
    if (sameDay) {
      return d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    }
    if (diffHr < 48) return "Yesterday";
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
