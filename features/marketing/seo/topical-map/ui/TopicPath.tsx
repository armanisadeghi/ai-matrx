"use client";

/**
 * features/marketing/seo/topical-map/ui/TopicPath.tsx — root-first crumbs for
 * one topic (CONTRACTS §4.3).
 *
 * ONE CRUMB IS ONE COMPONENT because `selectMapTopic` is curried per slug: a
 * loop calling `useAppSelector(selectMapTopic(mapId, slug))` inside the parent
 * would be a hook in a loop whose count changes with the path's depth. A child
 * per crumb keeps the hook count fixed per component, which is the same device
 * the rest of this feature uses.
 *
 * A crumb whose topic is not in the loaded tree still renders — as its SLUG,
 * muted. A path that silently loses a level is a lie about the hierarchy; a
 * slug is ugly and true.
 */

import { ChevronRight } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import { selectMapTopic, selectMapTopicPath } from "../redux/selectors";

export interface TopicPathProps {
  mapId: string;
  slug: string;
  /** Present = the crumbs are clickable. Absent = the path is a label. */
  onNavigate?: (slug: string) => void;
  className?: string;
}

export function TopicPath({ mapId, slug, onNavigate, className }: TopicPathProps) {
  const path = useAppSelector(selectMapTopicPath(mapId, slug));

  if (path.length === 0) return null;

  return (
    <nav
      aria-label="Topic path"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-0.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {path.map((crumbSlug, index) => (
        <span key={crumbSlug} className="flex min-w-0 items-center gap-0.5">
          {index > 0 ? (
            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
          ) : null}
          <TopicPathCrumb
            mapId={mapId}
            slug={crumbSlug}
            last={index === path.length - 1}
            onNavigate={onNavigate}
          />
        </span>
      ))}
    </nav>
  );
}

function TopicPathCrumb({
  mapId,
  slug,
  last,
  onNavigate,
}: {
  mapId: string;
  slug: string;
  last: boolean;
  onNavigate?: (slug: string) => void;
}) {
  const topic = useAppSelector(selectMapTopic(mapId, slug));
  const name = topic?.name ?? slug;
  const classes = cn("truncate", last && "text-foreground");

  if (!onNavigate) {
    return (
      <span className={classes} title={topic ? undefined : `Not in the loaded tree: ${slug}`}>
        {name}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onNavigate(slug)}
      className={cn(classes, "rounded-sm hover:text-foreground hover:underline")}
    >
      {name}
    </button>
  );
}
