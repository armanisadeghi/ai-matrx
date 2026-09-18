"use client";

/**
 * PLACE MANY KEYWORDS ON AN OFFERING — the bulk half of the Offering column.
 *
 * Three gestures reach it, exactly like `AssignPanel`: the checked rows,
 * everything matching the filters, and a single row that wants to say why. All
 * three end in the ONE placement write, `seo.gsc_set_keyword_offering`, on THIS
 * site's own placements.
 *
 * P24 — the reason rides along and is stored ON the placement
 * (`seo.site_keyword_offering.notes`), because "these are all ITAD buyers asking
 * about hard drives" is the training material an AI later learns the pattern
 * from.
 *
 * The target headline (including the honest sentence when the server capped the
 * sweep) is `AssignTargetHeadline`, shared with the stamp panel.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eraser, Loader2, Network } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { ProTextarea } from "@/components/official/ProTextarea";
import {
  KEYWORD_OFFERINGS_KEY,
  setKeywordOffering,
  type SetOfferingResult,
} from "../data";
import {
  requireOfferingOrganization,
  SITE_OFFERINGS_KEY,
  type SiteOfferings,
} from "../hooks/useSiteOfferings";
import { AssignTargetHeadline, type AssignTarget } from "./AssignPanel";
import { OfferingPicker, OFFERING_UNPLACED } from "./OfferingPicker";

export function OfferingAssignPanel({
  siteId,
  offerings,
  target,
  onDone,
  onCancel,
}: {
  siteId: string;
  offerings: SiteOfferings;
  target: AssignTarget;
  onDone: (
    result: SetOfferingResult[],
    placed: { offeringId: string | null; name: string },
  ) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  // A new target is a new decision — never carry a reason written about other
  // keywords onto these. Reset during render, not in an effect.
  const [targetSeen, setTargetSeen] = useState(target);
  if (targetSeen !== target) {
    setTargetSeen(target);
    setOfferingId(null);
    setNotes("");
  }

  const write = useMutation({
    mutationFn: (input: { clear: boolean }) => {
      if (!input.clear && !offeringId) throw new Error("Pick an offering first.");
      return setKeywordOffering({
        organizationId: requireOfferingOrganization(offerings),
        siteId,
        keywordIds: target.keywordIds,
        offeringId: input.clear ? null : offeringId,
        notes: notes.trim() || null,
      });
    },
    onSuccess: async (result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...KEYWORD_OFFERINGS_KEY, siteId] }),
        queryClient.invalidateQueries({ queryKey: ["marketing", "gsc", "keyword-value-for", siteId] }),
        // The offerings' keyword counts must not go stale behind us.
        queryClient.invalidateQueries({ queryKey: SITE_OFFERINGS_KEY }),
      ]);
      onDone(result, {
        offeringId: input.clear ? null : offeringId,
        name: input.clear
          ? "no offering"
          : (offerings.byId.get(offeringId ?? "")?.name ?? "that offering"),
      });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Could not place those.");
    },
  });

  const count = target.keywordIds.length;

  return (
    <div className="space-y-3">
      <AssignTargetHeadline
        target={target}
        icon={Network}
        title={`Which offering does ${target.label} map to?`}
      />

      <OfferingPicker
        siteId={siteId}
        offerings={offerings}
        value={offeringId}
        onSelect={(next) => setOfferingId(next === OFFERING_UNPLACED ? null : next)}
        size="md"
        ariaLabel="Offering"
      />

      <div className="space-y-1">
        <label htmlFor="offering-reason" className="text-xs font-medium text-foreground">
          Why?{" "}
          <span className="text-muted-foreground">
            — optional, but this is what teaches the system
          </span>
        </label>
        <ProTextarea
          id="offering-reason"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder={
            count > 1
              ? "One reason for all of these — e.g. “anyone asking about hard drive shredding is buying data destruction”."
              : "e.g. “this phrase is how ITAD buyers describe a decommission”."
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
          disabled={write.isPending}
          onClick={() => write.mutate({ clear: true })}
          title="Take these keywords off every offering"
        >
          <Eraser className="h-3.5 w-3.5" />
          Take off every offering
        </Button>
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={!offeringId || write.isPending}
          onClick={() => write.mutate({ clear: false })}
        >
          {write.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Place {count.toLocaleString()}
        </Button>
      </div>
    </div>
  );
}
