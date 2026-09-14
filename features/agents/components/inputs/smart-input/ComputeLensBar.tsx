"use client";

/**
 * ComputeLensBar — condensed sandbox / local-PC row for the `+` attach menu.
 * Mirrors ContextLensBar: one pill, left label zone, up to two inline target
 * chips, overflow + chevron opens the full Sandbox panel in run-controls window.
 */

import {
  Box,
  Check,
  ChevronDown,
  Loader2,
  Monitor,
  Moon,
  Plus,
  TriangleAlert,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ComputeTarget } from "@/hooks/sandbox/use-compute-targets";
import {
  computeTargetIconColor,
  computeTargetKindLabel,
  useComputeTargetActions,
} from "./use-compute-target-actions";
import {
  describeBoundTargetState,
  type BoundTargetView,
} from "@/lib/sandbox/bound-target-view";

export interface ComputeLensBarProps {
  conversationId: string;
  /** Opens run-controls window on the Sandbox tab. */
  onOpenPanel: () => void;
  className?: string;
}

function TargetGlyph({
  kind,
  className,
}: {
  kind: ComputeTarget["kind"];
  className?: string;
}) {
  return kind === "local-pc" ? (
    <Monitor className={className} />
  ) : (
    <Box className={className} />
  );
}

function TargetChip({
  target,
  isBound,
  onSelect,
}: {
  target: ComputeTarget;
  isBound: boolean;
  onSelect: () => void;
}) {
  const color = computeTargetIconColor(target, isBound);
  const kindLabel = computeTargetKindLabel(target.kind);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            "inline-flex h-5 max-w-[10rem] min-w-0 items-center gap-1 rounded-full px-1.5 transition-colors",
            isBound
              ? "bg-muted/80 hover:bg-muted"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
          aria-label={
            isBound
              ? `${kindLabel} connected: ${target.name}. Open compute settings.`
              : `Connect ${kindLabel}: ${target.name}`
          }
        >
          {/* State reads in plain signals, not icon code: a bound chip leads
              with a check, an unbound one leads with a + ("connect this"). */}
          {isBound ? (
            <Check className="h-3 w-3 shrink-0 text-emerald-500" />
          ) : (
            <Plus className="h-3 w-3 shrink-0 text-muted-foreground/70" />
          )}
          <TargetGlyph
            kind={target.kind}
            className={cn("h-3 w-3 shrink-0", color)}
          />
          <span
            className={cn("truncate text-[11px] font-medium", isBound && color)}
          >
            {target.name}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {`${kindLabel}: ${target.name}${target.sandbox_id ? ` · ${target.sandbox_id}` : ""}`}
        {isBound ? " — click to manage" : " — click to connect"}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The chat's OWN box. Always rendered when the conversation is bound — while
 * the liveness check is still out, and while the box is asleep or gone. The
 * control's job is to answer "which box is this chat on?", and the record
 * always has that answer (`lib/sandbox/bound-target-view.ts`).
 */
function BoundChip({
  view,
  onOpenPanel,
}: {
  view: BoundTargetView;
  onOpenPanel: () => void;
}) {
  const { label, remedy } = describeBoundTargetState(view);
  const kindLabel = computeTargetKindLabel(view.kind);
  const healthy = view.state === "online";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpenPanel}
          className={cn(
            "inline-flex h-5 max-w-[10rem] min-w-0 items-center gap-1 rounded-full px-1.5 transition-colors",
            view.state === "gone"
              ? "bg-amber-500/10 hover:bg-amber-500/20"
              : "bg-muted/80 hover:bg-muted",
          )}
          aria-label={`${kindLabel} for this chat: ${view.name} — ${label}. Open compute settings.`}
        >
          {view.state === "checking" ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          ) : view.state === "online" ? (
            <Check className="h-3 w-3 shrink-0 text-emerald-500" />
          ) : view.state === "asleep" ? (
            <Moon className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <TriangleAlert className="h-3 w-3 shrink-0 text-amber-500" />
          )}
          <TargetGlyph
            kind={view.kind}
            className={cn(
              "h-3 w-3 shrink-0",
              healthy
                ? view.kind === "local-pc"
                  ? "text-blue-500"
                  : "text-emerald-500"
                : "text-muted-foreground",
            )}
          />
          <span
            className={cn(
              "truncate text-[11px] font-medium",
              healthy ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {view.name}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {`This chat's ${kindLabel.toLowerCase()}: ${view.name} — ${label}.`}
        {remedy ? ` ${remedy}` : " Click to manage."}
      </TooltipContent>
    </Tooltip>
  );
}

export function ComputeLensBar({
  conversationId,
  onOpenPanel,
  className,
}: ComputeLensBarProps) {
  const {
    loading,
    boundView,
    hasBinding,
    visibleTargets,
    overflowCount,
    totalCount,
    applyBinding,
    disabled,
  } = useComputeTargetActions(conversationId);

  // `visibleTargets` never contains the bound box — it is rendered by
  // `BoundChip` from the conversation's record.
  const handleChipClick = (target: ComputeTarget) => {
    applyBinding(target);
  };

  return (
    <div
      className={cn(
        "group inline-flex h-7 min-w-0 items-center rounded-full border border-border bg-card pl-1 pr-0.5 text-xs transition-colors hover:border-secondary/45",
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpenPanel}
            disabled={disabled && !loading}
            className={cn(
              "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 transition-colors",
              "text-secondary/90 group-hover:bg-secondary/10 group-hover:text-secondary",
              disabled && !loading && "cursor-not-allowed opacity-50",
            )}
            aria-label="Open sandbox and computer settings"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Monitor className="h-3.5 w-3.5" />
            )}
            <span className="font-medium">Compute</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {loading
            ? "Checking computers and sandboxes…"
            : totalCount === 0
              ? "Set up a sandbox or local computer"
              : "Manage sandbox and local computer bindings"}
        </TooltipContent>
      </Tooltip>

      {boundView || visibleTargets.length > 0 || (!loading && !hasBinding) ? (
        <span className="mx-0.5 h-4 w-px shrink-0 bg-border/80" aria-hidden />
      ) : null}

      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden rounded-full transition-colors group-hover:bg-secondary/[0.04]">
        {/* The chat's own box comes FIRST and is always named. */}
        {boundView ? (
          <BoundChip view={boundView} onOpenPanel={onOpenPanel} />
        ) : null}

        {/* Compact empty-state — "None" keeps the pill one row; tooltip carries
            the full meaning (Arman 2026-08-11: kill the padded "Not attached"). */}
        {!loading && !hasBinding && visibleTargets.length > 0 ? (
          <span
            className="shrink-0 px-1 text-[11px] tabular-nums text-muted-foreground/70"
            title="No compute attached"
          >
            None
          </span>
        ) : null}

        {visibleTargets.map((target) => (
          <TargetChip
            key={target.id}
            target={target}
            isBound={false}
            onSelect={() => handleChipClick(target)}
          />
        ))}

        {!boundView && visibleTargets.length === 0 && !loading ? (
          <button
            type="button"
            onClick={onOpenPanel}
            className="inline-flex h-5 items-center rounded-full px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            title="No sandbox or local computer available"
          >
            None
          </button>
        ) : null}
      </div>

      {hasBinding ? (
        // The word "Detach", not an icon glyph — detaching must never require
        // decoding icon language (Arman's ruling, 2026-08-08).
        <button
          type="button"
          onClick={() => applyBinding(null)}
          className="inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          title={`Detach ${boundView?.name ?? "connected compute"} from this chat`}
        >
          Detach
        </button>
      ) : null}

      {(overflowCount > 0 || totalCount > 0) && (
        <button
          type="button"
          onClick={onOpenPanel}
          className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground group-hover:text-secondary/80"
          aria-label={
            overflowCount > 0
              ? `${overflowCount} more compute targets — open full list`
              : "Open compute settings"
          }
        >
          {overflowCount > 0 ? (
            <span className="text-[10px] font-medium tabular-nums">
              +{overflowCount}
            </span>
          ) : null}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
        </button>
      )}
    </div>
  );
}
