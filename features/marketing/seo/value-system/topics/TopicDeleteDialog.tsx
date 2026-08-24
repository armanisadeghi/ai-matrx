"use client";

import { ArrowRightLeft, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/features/marketing/search-console/types";
import type { TopicDeleteImpact } from "./types";

export type TopicDeleteMode = "unassign" | "reassign";

export function TopicDeleteDialog({
  topicName,
  impact,
  loading,
  error,
  mode,
  replacementName,
  busy,
  onModeChange,
  onChooseReplacement,
  onRetry,
  onCancel,
  onDelete,
}: {
  topicName: string;
  impact: TopicDeleteImpact | null;
  loading: boolean;
  error: string | null;
  mode: TopicDeleteMode;
  replacementName: string | null;
  busy: boolean;
  onModeChange: (mode: TopicDeleteMode) => void;
  onChooseReplacement: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const canDelete =
    Boolean(impact) &&
    !busy &&
    (mode === "unassign" || Boolean(replacementName));

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="flex max-h-[90dvh] max-w-xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4 text-destructive" />
            Delete “{topicName}”?
          </DialogTitle>
          <DialogDescription>
            Topics are shared across every site. This preview includes the full
            catalog impact, not only the site you are viewing.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="space-y-2" aria-label="Measuring deletion impact">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <p>{error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={onRetry}
              >
                Try again
              </Button>
            </div>
          ) : impact ? (
            <>
              <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
                <p className="flex items-start gap-2 text-sm font-medium text-foreground">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  {impact.associated_keywords > 0
                    ? `${formatCount(impact.associated_keywords)} associated keyword${impact.associated_keywords === 1 ? "" : "s"} across ${formatCount(impact.affected_organizations)} organization${impact.affected_organizations === 1 ? "" : "s"} will be affected.`
                    : "No keywords are associated with this topic."}
                </p>
                <ul className="mt-2 space-y-1 pl-6 text-xs text-muted-foreground">
                  {impact.child_topics > 0 ? (
                    <li>
                      {formatCount(impact.child_topics)} direct child topic
                      {impact.child_topics === 1 ? " moves" : "s move"} up one
                      level.
                    </li>
                  ) : null}
                  {impact.site_worth_rulings > 0 ? (
                    <li>
                      {formatCount(impact.site_worth_rulings)} site-specific
                      worth ruling
                      {impact.site_worth_rulings === 1 ? " is" : "s are"}{" "}
                      removed.
                    </li>
                  ) : null}
                  {impact.starter_pack_items > 0 ? (
                    <li>
                      {formatCount(impact.starter_pack_items)} starter-pack
                      reference
                      {impact.starter_pack_items === 1 ? " is" : "s are"}{" "}
                      removed.
                    </li>
                  ) : null}
                </ul>
              </div>

              {impact.associated_keywords > 0 ? (
                <RadioGroup
                  value={mode}
                  onValueChange={(value) =>
                    onModeChange(value === "reassign" ? "reassign" : "unassign")
                  }
                  className="gap-2"
                >
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/40">
                    <RadioGroupItem value="reassign" className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        Reassign the keyword associations
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Keep every association, including which placement was
                        primary, on another topic.
                      </span>
                      {mode === "reassign" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-2 max-w-full"
                          onClick={onChooseReplacement}
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          <span className="truncate">
                            {replacementName ?? "Choose the replacement topic…"}
                          </span>
                        </Button>
                      ) : null}
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/40">
                    <RadioGroupItem value="unassign" className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        Remove the associations
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Keywords whose primary placement was here become
                        unplaced.
                      </span>
                    </span>
                  </label>
                </RadioGroup>
              ) : null}
            </>
          ) : null}
        </div>

        <DialogFooter className="pb-safe">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onDelete}
            disabled={!canDelete}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete topic
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
