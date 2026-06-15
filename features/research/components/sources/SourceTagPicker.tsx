"use client";

import { useState } from "react";
import { Plus, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useResearchTags, useSourceTags } from "../../hooks/useResearchState";
import { assignTagsToSource, removeSourceTag } from "../../service";

/**
 * Assign this source to the topic's tags (dimensions). Toggling a chip adds or
 * removes the source⇄tag link via `assignTagsToSource` / `removeSourceTag` —
 * the inputs a tag consolidation actually synthesizes over. Without this the
 * Tags page can create + consolidate tags but they have no sources, so "tags
 * don't do anything"; this closes that manual loop.
 */
export function SourceTagPicker({
  topicId,
  sourceId,
}: {
  topicId: string;
  sourceId: string;
}) {
  const { data: tags } = useResearchTags(topicId);
  const { data: sourceTags, refresh } = useSourceTags(sourceId);
  const [busyId, setBusyId] = useState<string | null>(null);

  const available = tags ?? [];
  const assignedIds = new Set((sourceTags ?? []).map((st) => st.tag_id));

  const toggle = async (tagId: string, on: boolean) => {
    setBusyId(tagId);
    try {
      if (on) {
        await removeSourceTag(sourceId, tagId);
      } else {
        await assignTagsToSource(sourceId, { tag_ids: [tagId] });
      }
      refresh();
    } catch (err) {
      toast.error(
        `Couldn't ${on ? "remove" : "add"} tag: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    } finally {
      setBusyId(null);
    }
  };

  if (available.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        No tags yet. Create tags on the{" "}
        <Link
          href={`/research/topics/${topicId}/tags`}
          className="text-primary hover:underline"
        >
          Tags page
        </Link>
        , then assign sources here to consolidate them.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {available.map((tag) => {
        const on = assignedIds.has(tag.id);
        const isBusy = busyId === tag.id;
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id, on)}
            disabled={isBusy}
            aria-pressed={on}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 min-h-[28px]",
              on
                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60",
            )}
          >
            {isBusy ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : on ? (
              <Check className="h-2.5 w-2.5" />
            ) : (
              <Plus className="h-2.5 w-2.5" />
            )}
            <span className="truncate max-w-[10rem]">{tag.name}</span>
          </button>
        );
      })}
    </div>
  );
}
