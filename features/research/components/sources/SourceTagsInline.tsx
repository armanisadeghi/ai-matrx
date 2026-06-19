"use client";

import { useState } from "react";
import { Tags, Plus, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assignTagsToSource, removeSourceTag } from "../../service";
import type { ResearchTag } from "../../types";

interface Props {
  sourceId: string;
  /** Tags currently assigned to this source. */
  assigned: { id: string; name: string }[];
  /** All tags available on the topic. */
  tags: ResearchTag[];
  /** Refresh the source→tag map (and tag list) after a change. */
  onChanged: () => void;
  /** Open the shared "create tag" dialog targeting this source. */
  onCreateTag: (sourceId: string) => void;
}

/**
 * Compact, inline tag chips + a "+" picker for a single source row in the
 * Sources list — the manual-tagging surface where the user actually browses.
 * Toggling a tag assigns/removes the source⇄tag link via the same
 * `assignTagsToSource` / `removeSourceTag` the source-detail picker uses;
 * "Create new tag…" defers to the list's shared dialog so we don't mount one
 * dialog per row.
 */
export function SourceTagsInline({
  sourceId,
  assigned,
  tags,
  onChanged,
  onCreateTag,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const assignedIds = new Set(assigned.map((t) => t.id));

  const toggle = async (tagId: string, on: boolean) => {
    setBusyId(tagId);
    try {
      if (on) {
        await removeSourceTag(sourceId, tagId);
      } else {
        await assignTagsToSource(sourceId, {
          tag_ids: [tagId],
          is_primary_source: false,
        });
      }
      onChanged();
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

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {assigned.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 pl-1.5 pr-0.5 py-px text-[10px] font-medium text-primary"
        >
          <span className="truncate max-w-[7rem]">{t.name}</span>
          <button
            type="button"
            onClick={() => toggle(t.id, true)}
            disabled={busyId === t.id}
            aria-label={`Remove ${t.name}`}
            className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full hover:bg-primary/20 disabled:opacity-50"
          >
            {busyId === t.id ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <X className="h-2.5 w-2.5" />
            )}
          </button>
        </span>
      ))}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Add tag"
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full border border-dashed border-border/70 px-1.5 py-px text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors",
            )}
          >
            <Tags className="h-2.5 w-2.5" />
            <Plus className="h-2.5 w-2.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-72 overflow-y-auto w-52"
        >
          <DropdownMenuItem onClick={() => onCreateTag(sourceId)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Create new tag…
          </DropdownMenuItem>
          {tags.length > 0 && <DropdownMenuSeparator />}
          {tags.map((t) => {
            const on = assignedIds.has(t.id);
            return (
              <DropdownMenuItem
                key={t.id}
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(t.id, on);
                }}
                className="gap-1.5"
              >
                <span
                  className={cn(
                    "inline-flex items-center justify-center h-3.5 w-3.5 rounded border",
                    on
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border",
                  )}
                >
                  {busyId === t.id ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : on ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : null}
                </span>
                <span className="truncate flex-1">{t.name}</span>
              </DropdownMenuItem>
            );
          })}
          {tags.length === 0 && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
              No tags yet — create one above.
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
