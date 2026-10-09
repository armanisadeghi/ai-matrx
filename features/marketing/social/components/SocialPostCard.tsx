"use client";

/**
 * THE social post card (UI-SPEC §1.3) — one card for grids, outlier feeds,
 * creator pages, swipe boards and board tiles.
 *
 *   thumbnail (aspect reserved before load)   top-left platform mark
 *                                              top-right OutlierBadge
 *                                              bottom-left duration / format
 *   hook line (1 line) · @handle · age · views first, likes second
 *
 * Missing/expired thumbnail -> the platform mark on a neutral tile (never a
 * broken image). Null metrics render "—", never 0. The card's `⋯` holds
 * Open original / Copy link / Save to swipe file.
 *
 * Built from semantic tokens directly: `components/official/card-and-grid`'s
 * `Card` is an icon-launcher card (icon + title + description), not a media
 * card, so there is nothing in it to reuse for a thumbnail card.
 */

import { useState } from "react";
import { Bookmark, Copy, ExternalLink, MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { formatDuration, relativeAge } from "../mappers";
import { formatCompact, outlierBadgeModel } from "../outlier";
import type { PostCardModel } from "../types";
import { OutlierBadge } from "./OutlierBadge";
import { PlatformMark } from "./PlatformMark";

/** Reserved thumbnail shape per platform/format, so nothing shifts on load. */
export function thumbAspect(platform: string, format: string): string {
  if (format === "image" || format === "carousel") return "aspect-square";
  if (platform === "youtube" && format !== "short") return "aspect-video";
  if (platform === "linkedin" || platform === "facebook" || platform === "x") return "aspect-video";
  return "aspect-[9/16]";
}

export interface SocialPostCardProps {
  post: PostCardModel;
  onOpen?: (post: PostCardModel) => void;
  /** Present -> the `⋯` offers "Save to swipe file". */
  onSave?: (post: PostCardModel) => void;
  /** Compact density: thumbnail + badge + views only. */
  compact?: boolean;
  className?: string;
}

export function SocialPostCard({ post, onOpen, onSave, compact, className }: SocialPostCardProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const badge = outlierBadgeModel(post.outlier);
  const duration = formatDuration(post.durationSeconds);
  const showThumb = Boolean(post.thumbnailUrl) && !thumbFailed;
  const absolute = post.postedAt ? new Date(post.postedAt).toLocaleString() : "";

  return (
    <div
      data-clickable={onOpen ? "" : undefined}
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onOpen?.(post)}
        disabled={!onOpen}
        aria-label={`Open post ${post.hookLine || post.handle || ""}`.trim()}
        className={cn("relative block w-full bg-muted", thumbAspect(post.platform, post.format))}
      >
        {showThumb ? (
          <img
            src={post.thumbnailUrl ?? undefined}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setThumbFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <PlatformMark platform={post.platform} size={36} />
          </span>
        )}
        <span className="absolute left-1.5 top-1.5">
          <PlatformMark platform={post.platform} size={20} />
        </span>
        <span className="absolute right-1.5 top-1.5 rounded-full bg-card/90">
          <OutlierBadge model={badge} />
        </span>
        {duration || post.format === "carousel" ? (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/65 px-1 text-[11px] tabular-nums text-white">
            {duration ?? "Carousel"}
          </span>
        ) : null}
        {post.removed ? (
          <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[11px] text-white">
            Removed
          </span>
        ) : null}
        {post.isAd ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-card/90 px-1 text-[11px] text-foreground">
            Ad
          </span>
        ) : null}
      </button>

      <div className={cn("flex min-w-0 flex-col gap-0.5 px-2 py-1.5", compact && "py-1")}>
        {compact ? null : (
          <p className="truncate text-xs font-medium text-foreground" title={post.hookLine}>
            {post.hookLine || "No caption"}
          </p>
        )}
        <div className="flex min-w-0 items-center justify-between gap-1 text-[11px] text-muted-foreground">
          <span className="truncate" title={absolute}>
            {compact ? "" : `${post.handle ? `@${post.handle} · ` : ""}${relativeAge(post.postedAt)}`}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Post actions"
                className="-mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={post.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open original
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard
                    .writeText(post.url)
                    .then(() => toast.success("Link copied"))
                    .catch(() => toast.error("Couldn't copy the link"));
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy link
              </DropdownMenuItem>
              {onSave ? (
                <DropdownMenuItem onSelect={() => onSave(post)}>
                  <Bookmark className="mr-2 h-4 w-4" />
                  Save to swipe file
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p
          className="truncate text-[11px] tabular-nums text-foreground"
          title={`${formatCompact(post.comments)} comments · ${formatCompact(post.shares)} shares`}
        >
          {formatCompact(post.views)} views
          {compact ? "" : ` · ${formatCompact(post.likes)} likes`}
        </p>
      </div>
    </div>
  );
}
