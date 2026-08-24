"use client";

/**
 * ASSIGN — the one place a person gives keywords meaning, and the one place
 * they say WHY.
 *
 * Three gestures reach this component, and all three end in the same RPC
 * (`seo.gsc_set_keyword_stamps`):
 *   • one row, from the right-click menu or a cell dropdown;
 *   • the checked rows;
 *   • every keyword the current filters match (bulk).
 *
 * P24 — the reason field is not optional decoration. Arman: "as they are
 * assigning them, they also type some text that explains why they're doing
 * it… the presumption is that artificial intelligence models are very good at
 * being able to then mimic that behavior on future things." One shared reason
 * per bulk assignment, its own for a single row. It is stored ON the stamp.
 *
 * Clearing is the same control, not a second one — the button flips to
 * "Remove this value" when the target already carries it.
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eraser, Loader2, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import type { FacetDimension } from "@/features/marketing/seo/value-system/dimensions/data";
import {
  setKeywordStamps,
  type SetStampsResult,
} from "@/features/marketing/seo/keyword-workbench/data";
import {
  DimensionValuePicker,
  type PickedValue,
} from "./DimensionValuePicker";

export interface AssignTarget {
  keywordIds: string[];
  /** What the user sees named in the panel — one keyword, or "412 keywords". */
  label: string;
  /** True when the ids came from "everything matching", so we can say so. */
  fromFilters?: boolean;
  /** The server stopped at its cap; the panel must not imply totality. */
  capped?: boolean;
  /** Pre-selected dimension when the gesture started in a dimension column. */
  lockedDimensionSlug?: string;
  /** Pre-selected value (a cell dropdown re-opening on the current answer). */
  initial?: PickedValue | null;
}

export function AssignPanel({
  siteId,
  dimensions,
  dimensionsLoading,
  target,
  onDone,
  onCancel,
}: {
  siteId: string;
  dimensions: FacetDimension[];
  dimensionsLoading?: boolean;
  target: AssignTarget;
  onDone: (result: SetStampsResult, picked: PickedValue) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<PickedValue | null>(target.initial ?? null);
  const [notes, setNotes] = useState("");

  // A new target (different rows) is a new decision — never carry a reason
  // written about other keywords onto these.
  useEffect(() => {
    setPicked(target.initial ?? null);
    setNotes("");
  }, [target]);

  const write = useMutation({
    mutationFn: (input: { clear: boolean }) => {
      if (!picked) throw new Error("Pick a value first.");
      return setKeywordStamps({
        siteId,
        keywordIds: target.keywordIds,
        valueId: picked.valueId,
        notes: notes.trim() || null,
        clear: input.clear,
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "seo", "keyword-stamps", siteId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "gsc", "keyword-value-for", siteId],
      });
      if (picked) onDone(result, picked);
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Could not save that.",
      );
    },
  });

  const count = target.keywordIds.length;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Tag className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Assign a value to {target.label}
          </p>
          {target.fromFilters ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              {target.capped
                ? `Your filters match more than this — ${count.toLocaleString()} keywords were taken, the most one assignment can carry. Narrow the filters and repeat for the rest.`
                : `Every keyword your current filters match — ${count.toLocaleString()} of them.`}
            </p>
          ) : null}
        </div>
      </div>

      <DimensionValuePicker
        siteId={siteId}
        dimensions={dimensions}
        loading={dimensionsLoading}
        picked={picked}
        onPicked={setPicked}
        lockedDimensionSlug={target.lockedDimensionSlug}
      />

      <div className="space-y-1">
        <label
          htmlFor="assign-reason"
          className="text-xs font-medium text-foreground"
        >
          Why? <span className="text-muted-foreground">— optional, but this is what teaches the system</span>
        </label>
        <Textarea
          id="assign-reason"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={
            count > 1
              ? "One reason for all of these — e.g. “these are all research phrases, nobody buying uses them”."
              : "e.g. “buyers use this exact phrase when they already have a quote”."
          }
          className="text-xs"
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onCancel}
            disabled={write.isPending}
          >
            Cancel
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={!picked || write.isPending}
          onClick={() => write.mutate({ clear: true })}
          title="Remove this value from these keywords"
        >
          <Eraser className="h-3.5 w-3.5" />
          Remove
        </Button>
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={!picked || write.isPending}
          onClick={() => write.mutate({ clear: false })}
        >
          {write.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          Assign to {count.toLocaleString()}
        </Button>
      </div>
    </div>
  );
}
