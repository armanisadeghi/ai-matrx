"use client";

/**
 * One ad (UI-SPEC §6): creative thumbnail with the aspect reserved before it
 * loads, status + run length, advertiser, headline, copy, CTA, where it ran,
 * and a landing link. Missing creative -> the library label on a neutral tile,
 * never a broken image. `⋯` holds Open in library / Open landing page / Save /
 * Track advertiser. A "Likely winner" pill is a fact about days live.
 */

import { useState } from "react";
import { Bookmark, Copy, ExternalLink, MoreHorizontal, Radar } from "lucide-react";

import { Badge } from "@ai-matrx/design-system/controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { adFormatLabel, isLikelyWinner, runLabel } from "../ads";
import { AD_LIBRARY_LABELS, isAdLibrary, type AdCardModel } from "../types";

export function libraryLabel(library: string): string {
  return isAdLibrary(library) ? AD_LIBRARY_LABELS[library] : library;
}

function aspect(format: string): string {
  return format === "video" ? "aspect-[4/5]" : format === "carousel" || format === "image" ? "aspect-square" : "aspect-video";
}

function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export interface AdCardProps {
  ad: AdCardModel;
  onOpen?: (ad: AdCardModel) => void;
  onSave?: (ad: AdCardModel) => void;
  onTrack?: (ad: AdCardModel) => void;
  /** Newly seen since the last look. */
  isNew?: boolean;
  className?: string;
}

export function AdCard({ ad, onOpen, onSave, onTrack, isNew, className }: AdCardProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const showThumb = Boolean(ad.thumbnailUrl) && !thumbFailed;
  const run = runLabel(ad);
  const winner = isLikelyWinner(ad);
  const copy = ad.headline || ad.body;
  const where = [...ad.placements, ...ad.countries].join(" · ");

  return (
    <div className={cn("group relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card", className)}>
      <button
        type="button"
        onClick={() => onOpen?.(ad)}
        disabled={!onOpen}
        aria-label={`Open ad ${copy || ad.advertiser}`.trim()}
        className={cn("relative block w-full bg-muted", aspect(ad.format))}
      >
        {showThumb ? (
          <img
            src={ad.thumbnailUrl ?? undefined}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setThumbFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            {libraryLabel(ad.library)} · {adFormatLabel(ad.format)}
          </span>
        )}
        <span className="absolute left-1.5 top-1.5 flex gap-1">
          <Badge tone={ad.status === "active" ? "success" : "neutral"}>
            {ad.status === "active" ? "Active" : ad.status === "inactive" ? "Ended" : "Unknown"}
          </Badge>
          {isNew ? <Badge tone="primary">New</Badge> : null}
        </span>
        <span className="absolute right-1.5 top-1.5 rounded bg-card/90 px-1 text-xs text-foreground">{libraryLabel(ad.library)}</span>
        {run ? (
          <span className="absolute bottom-1.5 left-1.5 flex gap-1">
            <span className="rounded bg-black/65 px-1 text-xs tabular-nums text-white" title={ad.startedAt ?? undefined}>
              {run}
            </span>
            {winner ? (
              <span className="rounded bg-black/65 px-1 text-xs text-white" title={`${run} — still running`}>
                Likely winner
              </span>
            ) : null}
          </span>
        ) : null}
        {ad.removed ? (
          <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-xs text-white">Removed</span>
        ) : null}
      </button>

      <div className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5">
        <div className="flex min-w-0 items-center justify-between gap-1">
          <p className="truncate text-xs font-medium text-foreground" title={ad.advertiser}>
            {ad.advertiser}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Ad actions"
                className="-mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ad.libraryUrl ? (
                <DropdownMenuItem asChild>
                  <a href={ad.libraryUrl} target="_blank" rel="noreferrer noopener">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open in library
                  </a>
                </DropdownMenuItem>
              ) : null}
              {ad.landingUrl ? (
                <DropdownMenuItem asChild>
                  <a href={ad.landingUrl} target="_blank" rel="noreferrer noopener">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open landing page
                  </a>
                </DropdownMenuItem>
              ) : null}
              {ad.libraryUrl ? (
                <DropdownMenuItem
                  onSelect={() => {
                    void navigator.clipboard
                      .writeText(ad.libraryUrl ?? "")
                      .then(() => toast.success("Link copied"))
                      .catch(() => toast.error("Couldn't copy the link"));
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy link
                </DropdownMenuItem>
              ) : null}
              {onSave ? (
                <DropdownMenuItem onSelect={() => onSave(ad)}>
                  <Bookmark className="mr-2 h-4 w-4" />
                  Save to swipe file
                </DropdownMenuItem>
              ) : null}
              {onTrack ? (
                <DropdownMenuItem onSelect={() => onTrack(ad)}>
                  <Radar className="mr-2 h-4 w-4" />
                  Track advertiser
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="line-clamp-2 min-h-[2lh] text-xs text-muted-foreground" title={ad.body || ad.headline}>
          {copy || "No copy"}
        </p>
        <div className="flex min-w-0 items-center justify-between gap-1 text-xs text-muted-foreground">
          <span className="truncate">{ad.cta || "—"}</span>
          {ad.landingUrl ? (
            <a
              href={ad.landingUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="truncate text-primary hover:underline"
              title={ad.landingUrl}
            >
              {hostOf(ad.landingUrl)}
            </a>
          ) : null}
        </div>
        {where ? (
          <p className="truncate text-xs text-muted-foreground" title={where}>
            {where}
          </p>
        ) : null}
      </div>
    </div>
  );
}
