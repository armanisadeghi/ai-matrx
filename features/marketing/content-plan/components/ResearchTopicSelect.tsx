"use client";

/**
 * The ONE research-topic picker for the content-plan feature — used by the
 * Setup AI bar and the Generate-plan popover. Loads the caller's research
 * topics itself (`useAllTopics` — RLS-filtered, all of mine) and reports the
 * picked `rs_topic.id` (null = no grounding).
 */
import { useEffect } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAllTopics } from "@/features/research/hooks/useResearchState";

const NO_TOPIC = "__none__";

export function ResearchTopicSelect({
  value,
  onChange,
  triggerClassName,
  ariaLabel = "Research topic",
  refreshKey = null,
}: {
  value: string | null;
  onChange: (topicId: string | null) => void;
  triggerClassName?: string;
  ariaLabel?: string;
  /**
   * Bump (any non-null change) to refetch the topic list — for callers that
   * CREATE a topic while this picker is mounted (`useAllTopics` has no
   * cross-component cache, so a new topic is otherwise invisible until
   * remount; the orphan-value row keeps the selection itself working).
   */
  refreshKey?: string | number | null;
}) {
  const topics = useAllTopics();
  const refresh = topics.refresh;
  useEffect(() => {
    if (refreshKey != null) refresh();
  }, [refreshKey, refresh]);
  const rows = topics.data ?? [];
  // A linked topic the list has not (or cannot) load still renders — hiding
  // it would silently show "No research selected" for a real link.
  const orphanValue =
    value && !rows.some((topic) => topic.id === value) ? value : null;

  return (
    <Select
      value={value ?? NO_TOPIC}
      onValueChange={(next) => onChange(next === NO_TOPIC ? null : next)}
    >
      <SelectTrigger
        className={triggerClassName ?? "h-7 w-56 text-xs"}
        aria-label={ariaLabel}
      >
        <SelectValue
          placeholder={
            topics.isLoading ? "Loading topics…" : "Pick a research topic"
          }
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TOPIC} className="text-xs">
          No research selected
        </SelectItem>
        {orphanValue ? (
          <SelectItem value={orphanValue} className="text-xs">
            Linked topic (not in your list)
          </SelectItem>
        ) : null}
        {rows.map((topic) => (
          <SelectItem key={topic.id} value={topic.id} className="text-xs">
            {topic.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
