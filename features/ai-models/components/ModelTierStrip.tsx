"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { aiModelService } from "../service";
import { costRatingTier } from "../format";
import { hasHeldTierChange, isMaxTier, tierMismatch, tierMismatchText } from "../maxTier";
import { MaxTierBadge } from "./CostRatingCell";
import type { AiModel, CostRatingChange } from "../types";

function ratingText(rating: number | null): string {
  return costRatingTier(rating) ?? "none";
}

/** The model's MAX-tier state: badge, mismatch flag, held request, and who changed it. */
export default function ModelTierStrip({
  model,
  onChanged,
}: {
  model: AiModel;
  onChanged: (saved: AiModel) => void;
}) {
  const [history, setHistory] = useState<CostRatingChange[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = tierMismatch(model);
  const held = hasHeldTierChange(model);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    aiModelService
      .fetchCostRatingHistory(model.id)
      .then((rows) => {
        if (cancelled) return;
        setHistory(rows);
        setHistoryError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setHistoryError(extractErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, model.id, model.updated_at]);

  const resolve = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const saved = await aiModelService.resolveCostTierHold(model, pending === "approve");
      onChanged(saved);
      toast.success(pending === "approve" ? "Rating change approved" : "Rating change rejected");
      setPending(null);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const heldRating = model.pending_cost_rating === 0 ? null : (model.pending_cost_rating ?? null);

  return (
    <div className="shrink-0 border-b bg-card text-xs">
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <span className="text-muted-foreground">Cost</span>
        <span className="tabular-nums">{ratingText(model.cost_rating ?? null)}</span>
        {isMaxTier(model) && <MaxTierBadge />}
        {mismatch && (
          <span className="text-amber-700 dark:text-amber-300" title={tierMismatchText(mismatch)}>
            Tier mismatch
          </span>
        )}
        {held && (
          <span className="flex items-center gap-1.5 text-sky-700 dark:text-sky-300">
            Held: {model.pending_cost_rating_by ?? "automation"} asked for {ratingText(heldRating)}
            <Button variant="outline" onClick={() => setPending("approve")}>
              Approve
            </Button>
            <Button variant="quiet" onClick={() => setPending("reject")}>
              Reject
            </Button>
          </span>
        )}
        <Button variant="quiet" className="ml-auto" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide rating history" : "Rating history"}
        </Button>
      </div>
      {open && (
        <div className="max-h-40 overflow-auto border-t px-3 py-1.5">
          {historyError ? (
            <span className="text-destructive">{historyError}</span>
          ) : history === null ? (
            <span className="text-muted-foreground">Loading rating history</span>
          ) : history.length === 0 ? (
            <span className="text-muted-foreground">No MAX-tier changes recorded</span>
          ) : (
            <table className="w-full">
              <tbody>
                {history.map((row) => (
                  <tr key={`${row.version}-${row.occurred_at}`}>
                    <td className="pr-3 whitespace-nowrap text-muted-foreground">
                      {new Date(row.occurred_at).toLocaleString()}
                    </td>
                    <td className="pr-3 whitespace-nowrap">
                      {ratingText(row.from_rating)} to {ratingText(row.to_rating)}
                      {row.held_rating != null && ` (held: ${ratingText(row.held_rating === 0 ? null : row.held_rating)})`}
                    </td>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {row.actor_tier ?? "unknown"}
                      {row.actor_id ? ` ${row.actor_id.slice(0, 8)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <AlertDialog open={pending !== null} onOpenChange={(next) => !next && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending === "approve" ? "Approve" : "Reject"} the rating change for {model.common_name || model.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending === "approve"
                ? `Its cost rating becomes ${ratingText(heldRating)}${heldRating === 6 || isMaxTier(model) ? ", which changes whether it counts as MAX (5+)" : ""}. The change is recorded under your name.`
                : "The model keeps its current cost rating and the request is cleared."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void resolve()}>
              {busy ? "Saving" : pending === "approve" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
