"use client";

/**
 * The ONE research-topic picker for the content-plan feature — used by the
 * Setup AI bar and the Generate-plan popover. Loads the caller's research
 * topics itself (`useAllTopics` — RLS-filtered, all of mine) and reports the
 * picked `rs_topic.id` (null = no grounding).
 */
import { useEffect, useState } from "react";

import { CreatablePicker } from "@/components/ui/creatable-picker";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import { useAllTopics } from "@/features/research/hooks/useResearchState";
import { createTopic } from "@/features/research/service";
import { toast } from "@/lib/toast";

const NO_TOPIC = "__none__";

export function ResearchTopicSelect({
  value,
  onChange,
  organizationId,
  triggerClassName,
  ariaLabel = "Research topic",
  refreshKey = null,
}: {
  value: string | null;
  onChange: (topicId: string | null) => void;
  /** The viewed site's organization — never inferred from the shell context. */
  organizationId: string | null;
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
  const [createdTopic, setCreatedTopic] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const refresh = topics.refresh;
  useEffect(() => {
    if (refreshKey != null) refresh();
  }, [refreshKey, refresh]);
  const rows = topics.data ?? [];
  const topicOptions = rows.map((topic) => ({
    value: topic.id,
    label: topic.name,
  }));
  if (createdTopic && !rows.some((topic) => topic.id === createdTopic.id)) {
    topicOptions.unshift({
      value: createdTopic.id,
      label: createdTopic.name,
    });
  }
  // A linked topic the list has not (or cannot) load still renders — hiding
  // it would silently show "No research selected" for a real link.
  const orphanValue =
    value && !topicOptions.some((topic) => topic.value === value)
      ? value
      : null;
  if (orphanValue) {
    topicOptions.unshift({
      value: orphanValue,
      label: "Linked topic (not in your list)",
    });
  }

  const handleCreate = async (name: string): Promise<string | null> => {
    if (!organizationId) {
      toast.error(
        "This site's organization is still loading. Try creating the research topic again in a moment.",
      );
      return null;
    }

    try {
      const { topic } = await createTopic(organizationId, { name });
      setCreatedTopic({ id: topic.id, name: topic.name });
      refresh();
      toast.success(`Research topic “${topic.name}” created in Research.`, {
        action: toastDoor("research_topic", topic.id),
      });
      return topic.id;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Research topic was not created: ${error.message}`
          : "Research topic was not created.",
      );
      return null;
    }
  };

  return (
    <CreatablePicker
      value={value ?? NO_TOPIC}
      options={[
        { value: NO_TOPIC, label: "No research selected" },
        ...topicOptions,
      ]}
      onSelect={(next) => onChange(next === NO_TOPIC ? null : next)}
      onCreate={handleCreate}
      placeholder="Pick a research topic"
      searchPlaceholder="Search or add a research topic…"
      noun="research topic"
      loading={topics.isLoading}
      triggerClassName={triggerClassName ?? "h-7 w-56 text-xs"}
      ariaLabel={ariaLabel}
      emptyLabel="No matching research topics."
      manageAction={{
        label: "Manage research topics",
        href: "/research/topics",
      }}
    />
  );
}
