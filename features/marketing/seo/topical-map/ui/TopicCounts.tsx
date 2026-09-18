"use client";

/**
 * features/marketing/seo/topical-map/ui/TopicCounts.tsx
 *
 * 🚨 ABSENT IS NOT ZERO. `map_tree` omits counts entirely when the tree was
 * read without `include: ["counts"]`, so `counts.loaded === false` means WE DO
 * NOT KNOW. This component then renders NOTHING but still hangs a `title` on
 * the empty span, so a reader who inspects the gap is told why it is empty
 * instead of concluding the topic has no pages. Printing "0" there is the
 * confident lie this whole feature is built to avoid.
 */

import type { MapTopicCounts } from "../redux/selectors";

export interface TopicCountsProps {
  counts: MapTopicCounts;
  /** Numbers only, no words. For a dense row. */
  compact?: boolean;
}

export function TopicCounts({ counts, compact }: TopicCountsProps) {
  if (!counts.loaded) {
    return (
      <span
        className="inline-block"
        title="counts not loaded for this view"
        data-counts-loaded="false"
      />
    );
  }

  const parts: { key: string; value: number; word: string }[] = [
    { key: "pages", value: counts.pages, word: counts.pages === 1 ? "page" : "pages" },
    { key: "planned", value: counts.planned, word: "planned" },
    {
      key: "keywords",
      value: counts.keywords,
      word: counts.keywords === 1 ? "keyword" : "keywords",
    },
  ];

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
      {parts.map((part) => (
        <span key={part.key} title={`${part.value} ${part.word}`}>
          {part.value}
          {compact ? null : ` ${part.word}`}
        </span>
      ))}
    </span>
  );
}
