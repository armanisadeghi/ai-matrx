// features/kg-suggestions/components/KgSuggestionRowItem.tsx
//
// The shared row used by the popover, the per-slot panel, AND the global
// drawer. One row UX everywhere: entity name + kind chip → target slot (or
// "new scope" for heavy_hitter), suggested value, a confidence bar, the
// match-kind chip, and the three per-row actions (Accept / Reject / Defer).
//
// Accept / reject / defer are SUGGESTIONS — accept is primary and explicit;
// reject and defer are easy and non-destructive (no ConfirmDialog). Results
// surface via toast. Heavy-hitter accept opens a lightweight "Create scope"
// step (HeavyHitterAcceptDialog) where the user confirms the scope name + picks
// a scope type; confirming runs accept → create scope → tag source mentions.

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Clock, Network, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectKgRowMutation } from "@/lib/redux/slices/kgSuggestionsSlice";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import type {
  KgAcceptResult,
  KgMatchKind,
  KgSuggestionRow,
} from "@/features/kg-suggestions/types";
import { HeavyHitterAcceptDialog } from "./HeavyHitterAcceptDialog";
import { extractErrorMessage } from "@/utils/errors";

const MATCH_LABEL: Record<KgMatchKind, string> = {
  exact: "Exact",
  fuzzy: "Fuzzy",
  semantic: "Semantic",
  heavy_hitter: "Recurring",
};

const MATCH_TONE: Record<KgMatchKind, string> = {
  exact: "border-primary/40 text-primary",
  fuzzy: "border-border text-muted-foreground",
  semantic: "border-border text-muted-foreground",
  heavy_hitter: "border-primary/40 text-primary",
};

export interface KgSuggestionRowItemProps {
  row: KgSuggestionRow;
  accept: (id: string) => Promise<KgAcceptResult>;
  reject: (id: string) => Promise<unknown>;
  defer: (id: string) => Promise<unknown>;
  /** Compact (popover/panel) trims secondary metadata. Default false. */
  compact?: boolean;
  className?: string;
}

export function KgSuggestionRowItem({
  row,
  accept,
  reject,
  defer,
  compact = false,
  className,
}: KgSuggestionRowItemProps) {
  const mutation = useAppSelector((s) => selectKgRowMutation(s, row.id));
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const [localBusy, setLocalBusy] = useState(false);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const busy = localBusy || mutation !== "idle";

  const isHeavyHitter = row.match_kind === "heavy_hitter";
  const entityName = row.entity.name ?? row.suggested_value ?? "Unknown entity";
  const slotLabel = isHeavyHitter
    ? "New scope"
    : row.target.slot_name ?? "scope slot";
  const confidencePct = Math.round(Math.max(0, Math.min(1, row.confidence)) * 100);

  const run = async (
    kind: "accept" | "reject" | "defer",
    fn: () => Promise<unknown>,
    successMsg: string,
  ) => {
    setLocalBusy(true);
    try {
      await fn();
      toast.success(successMsg);
    } catch (err) {
      toast.error(extractErrorMessage(err) || `Could not ${kind} suggestion`);
    } finally {
      setLocalBusy(false);
    }
  };

  const onAccept = () => {
    // Heavy-hitter accept is a scope-creation flow — open the dialog (which
    // confirms name + type, then runs accept → create scope → tag sources).
    if (isHeavyHitter) {
      setScopeDialogOpen(true);
      return;
    }
    void run(
      "accept",
      () => accept(row.id),
      `Filled ${slotLabel} with “${row.suggested_value ?? entityName}”`,
    );
  };

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card px-2.5 py-2 text-sm",
        className,
      )}
    >
      {/* Entity → target */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {isHeavyHitter ? (
          <Network className="h-3.5 w-3.5 text-primary shrink-0" />
        ) : null}
        <span className="font-medium text-foreground truncate max-w-[14rem]">
          {entityName}
        </span>
        {row.entity.kind ? (
          <Badge variant="outline" className="h-4 text-[10px] px-1.5">
            {row.entity.kind}
          </Badge>
        ) : null}
        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground truncate max-w-[10rem]">
          {slotLabel}
        </span>
      </div>

      {/* Suggested value (slot-fill) — show before→after intent */}
      {!isHeavyHitter && row.suggested_value ? (
        <div className="mt-1 text-xs text-foreground/90 truncate">
          <span className="text-muted-foreground">Set value:&nbsp;</span>
          <span className="font-medium">{row.suggested_value}</span>
        </div>
      ) : null}

      {isHeavyHitter ? (
        <div className="mt-1 text-xs text-muted-foreground">
          Appears across multiple sources — promote to a scope?
        </div>
      ) : null}

      {/* Context snippet */}
      {!compact && row.context_snippet ? (
        <div className="mt-1 text-[11px] text-muted-foreground/80 line-clamp-2">
          “{row.context_snippet}”
        </div>
      ) : null}

      {/* Confidence + match-kind */}
      <div className="mt-2 flex items-center gap-2">
        <div
          className="h-1.5 flex-1 max-w-[7rem] rounded-full bg-muted overflow-hidden"
          aria-label={`Confidence ${confidencePct}%`}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {confidencePct}%
        </span>
        <Badge
          variant="outline"
          className={cn("h-4 text-[10px] px-1.5", MATCH_TONE[row.match_kind])}
        >
          {MATCH_LABEL[row.match_kind]}
        </Badge>
      </div>

      {/* Actions */}
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("defer", () => defer(row.id), "Snoozed for 7 days")}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
        >
          <Clock className="h-3 w-3" />
          Defer
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run("reject", () => reject(row.id), "Dismissed for 30 days")
          }
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
        >
          <X className="h-3 w-3" />
          Reject
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isHeavyHitter ? (
            <>
              <Network className="h-3 w-3" />
              Create scope
            </>
          ) : (
            <>
              <Check className="h-3 w-3" />
              Accept
            </>
          )}
        </button>
      </div>

      {isHeavyHitter ? (
        <HeavyHitterAcceptDialog
          open={scopeDialogOpen}
          onOpenChange={setScopeDialogOpen}
          row={row}
          organizationId={organizationId}
          accept={accept}
        />
      ) : null}
    </div>
  );
}

export default KgSuggestionRowItem;
