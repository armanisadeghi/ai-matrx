"use client";

/**
 * PLACE MANY KEYWORDS ON A SERVICE — the bulk half of the Service column.
 *
 * Three gestures reach it, exactly like `AssignPanel`: the checked rows,
 * everything matching the filters, and (for the reason box) a single row that
 * wants to say why. All three end in the ONE placement write,
 * `seo.gsc_set_keyword_topic`.
 *
 * P24 — the reason rides along and is stored ON the placement
 * (`seo.keyword_topic.notes`), because "these are all ITAD buyers asking about
 * hard drives" is the training material an AI later learns the pattern from.
 *
 * The target headline (including the honest sentence when the server capped the
 * sweep) is `AssignTargetHeadline`, shared with the stamp panel — one place
 * where the count is described, so the two can never say it differently.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eraser, Loader2, Network } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { setKeywordService, type SetServiceResult } from "../data";
import type { SiteServices } from "../hooks/useSiteServices";
import { AssignTargetHeadline, type AssignTarget } from "./AssignPanel";
import { ServicePicker, SERVICE_UNPLACED } from "./ServicePicker";

export function ServiceAssignPanel({
  siteId,
  services,
  target,
  onDone,
  onCancel,
}: {
  siteId: string;
  services: SiteServices;
  target: AssignTarget;
  onDone: (
    result: SetServiceResult[],
    placed: { topicId: string | null; name: string },
  ) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [topicId, setTopicId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  // A new target is a new decision — never carry a reason written about other
  // keywords onto these. Reset during render, not in an effect (an effect lets
  // the stale reason paint for one frame).
  const [targetSeen, setTargetSeen] = useState(target);
  if (targetSeen !== target) {
    setTargetSeen(target);
    setTopicId(null);
    setNotes("");
  }

  const write = useMutation({
    mutationFn: (input: { clear: boolean }) => {
      if (!input.clear && !topicId) throw new Error("Pick a service first.");
      return setKeywordService({
        siteId,
        keywordIds: target.keywordIds,
        topicId: input.clear ? null : topicId,
        notes: notes.trim() || null,
      });
    },
    onSuccess: async (result, input) => {
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "seo", "keyword-services", siteId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "gsc", "keyword-value-for", siteId],
      });
      // The tree screen counts these placements; it must not go stale behind us.
      await queryClient.invalidateQueries({ queryKey: ["seo", "topics"] });
      onDone(result, {
        topicId: input.clear ? null : topicId,
        name: input.clear
          ? "no service"
          : (services.byId.get(topicId ?? "")?.name ?? "that service"),
      });
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Could not place those.",
      );
    },
  });

  const count = target.keywordIds.length;

  return (
    <div className="space-y-3">
      <AssignTargetHeadline
        target={target}
        icon={Network}
        title={`Which service does ${target.label} map to?`}
      />

      <ServicePicker
        siteId={siteId}
        services={services}
        value={topicId}
        onSelect={(next) =>
          setTopicId(next === SERVICE_UNPLACED ? null : next)
        }
        size="md"
        ariaLabel="Service"
      />

      <div className="space-y-1">
        <label
          htmlFor="service-reason"
          className="text-xs font-medium text-foreground"
        >
          Why?{" "}
          <span className="text-muted-foreground">
            — optional, but this is what teaches the system
          </span>
        </label>
        <Textarea
          id="service-reason"
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
          title="Take these keywords off the tree entirely"
        >
          <Eraser className="h-3.5 w-3.5" />
          Take off the tree
        </Button>
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={!topicId || write.isPending}
          onClick={() => write.mutate({ clear: false })}
        >
          {write.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          Place {count.toLocaleString()}
        </Button>
      </div>
    </div>
  );
}
