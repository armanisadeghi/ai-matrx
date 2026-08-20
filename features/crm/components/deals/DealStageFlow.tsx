"use client";

// features/crm/components/deals/DealStageFlow.tsx
//
// The stage progression strip on the deal record — every stage of the deal's
// pipeline as a clickable segment (the record-page twin of the board's drag).
// Clicking a stage IS the move; the DB derives everything else. Closing stages
// are visually distinct, and moving to Lost asks for the reason (a lost deal
// with no reason teaches nothing).

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { moveDealToStage, updateDeal } from "../../deals/service";
import type { DealListRow, DealPipeline } from "../../deals/types";

interface Props {
  deal: DealListRow;
  pipeline: DealPipeline;
  onChanged: () => Promise<void>;
}

export function DealStageFlow({ deal, pipeline, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const { categories: lostReasons } = useCategories({
    dimension: "deal_lost_reason",
  });

  const currentIndex = pipeline.stages.findIndex((s) => s.id === deal.stage_id);

  const move = async (stageId: string) => {
    if (busy || stageId === deal.stage_id) return;
    const target = pipeline.stages.find((s) => s.id === stageId);
    if (!target) return;
    setBusy(true);
    try {
      if (target.outcome === "lost") {
        const ok = await confirm({
          title: `Mark "${deal.name}" as lost?`,
          description:
            "The deal closes as lost. You can pick the reason afterwards — it stays editable on this page.",
          confirmLabel: "Mark lost",
          variant: "destructive",
        });
        if (!ok) return;
      }
      await moveDealToStage({ dealId: deal.id, stageId });
      if (target.outcome === "won") toast.success(`"${deal.name}" won 🎉`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move the deal");
    } finally {
      setBusy(false);
    }
  };

  const setLostReason = async (reasonId: string) => {
    try {
      await updateDeal(deal.id, { lost_reason_id: reasonId || null });
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the reason");
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-stretch gap-1">
        {pipeline.stages.map((stage, index) => {
          const isCurrent = stage.id === deal.stage_id;
          const reached =
            currentIndex >= 0 && index <= currentIndex && !stage.outcome;
          return (
            <button
              key={stage.id}
              type="button"
              disabled={busy}
              onClick={() => void move(stage.id)}
              title={
                stage.probability !== undefined
                  ? `${stage.name} — ${stage.probability}% default win probability`
                  : stage.name
              }
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition-colors",
                isCurrent
                  ? stage.outcome === "won"
                    ? "bg-emerald-600 text-white"
                    : stage.outcome === "lost"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-primary text-primary-foreground"
                  : reached
                    ? "bg-primary/15 text-primary hover:bg-primary/25"
                    : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {isCurrent && <Check className="h-3 w-3" />}
              {stage.name}
            </button>
          );
        })}
      </div>
      {deal.status === "lost" && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Lost because:</span>
          <select
            aria-label="Lost reason"
            className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
            value={deal.lost_reason_id ?? ""}
            onChange={(e) => void setLostReason(e.target.value)}
          >
            <option value="">Pick a reason…</option>
            {lostReasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
