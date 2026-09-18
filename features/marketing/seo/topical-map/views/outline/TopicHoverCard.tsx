"use client";

/**
 * views/outline/TopicHoverCard.tsx — the small well-made popover of vision
 * §2.1: "description, counts, facets, a button to open the full panel".
 *
 * A COMPONENT, not a render function: `TopicTree` calls `renderHover(row)` per
 * row, and hooks cannot run inside that call. So the tree is handed
 * `(row) => <TopicHoverCard …/>` and this component reads its own selectors.
 *
 * Gated by the `outline_hover_popover` knob at the call site, and never
 * opened on a coarse pointer by the tree itself.
 */

import { PanelRight } from "lucide-react";

import { Button } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";

import {
  selectMapTopic,
  selectMapTopicCounts,
  selectMapTopicFacetsWithInheritance,
} from "../../redux/selectors";
import { FacetChip } from "../../ui/FacetChip";
import { TopicCounts } from "../../ui/TopicCounts";
import { TopicPath } from "../../ui/TopicPath";
import { TopicStatusMark } from "../../ui/TopicStatusMark";

export interface TopicHoverCardProps {
  mapId: string;
  slug: string;
  onOpen: (slug: string) => void;
}

export function TopicHoverCard({ mapId, slug, onOpen }: TopicHoverCardProps) {
  const topic = useAppSelector(selectMapTopic(mapId, slug));
  const counts = useAppSelector(selectMapTopicCounts(mapId, slug));
  const facets = useAppSelector(selectMapTopicFacetsWithInheritance(mapId, slug));

  if (!topic) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{topic.name}</p>
          <TopicPath mapId={mapId} slug={slug} className="mt-0.5" />
        </div>
        {topic.status ? <TopicStatusMark status={topic.status} /> : null}
      </div>

      {topic.description ? (
        <p className="line-clamp-6 whitespace-pre-line text-xs text-muted-foreground">
          {topic.description}
        </p>
      ) : (
        <p className="text-xs italic text-muted-foreground">No description yet.</p>
      )}

      {counts.loaded ? (
        <TopicCounts counts={counts} />
      ) : (
        <p className="text-[11px] italic text-muted-foreground">
          Counts were not loaded for this view.
        </p>
      )}

      {facets.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {facets.map((facet) => (
            <FacetChip
              key={`${facet.key}:${facet.valueSlug}`}
              facetKey={facet.key}
              valueSlug={facet.valueSlug}
              inherited={facet.inherited}
              fromSlug={facet.inherited ? facet.fromSlug : undefined}
            />
          ))}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" size="sm" variant="secondary" onClick={() => onOpen(slug)}>
          <PanelRight className="mr-1 h-3.5 w-3.5" aria-hidden />
          Open topic
        </Button>
      </div>
    </div>
  );
}
