"use client";

/**
 * PlanLedger — the left pane: every step of the DEFINITION as one tight row,
 * present from frame zero. Progressive condensation: contiguous finished
 * stretches fold into one "N steps done · time" line (tap to unfold), so a
 * 4-step plan and a 40-step plan both read at a glance while attention stays
 * on what's running and what's next. Clicking a row aims the focus pane.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Crosshair } from "lucide-react";

import { cn } from "@/lib/utils";
import IconResolver from "@/components/official/icons/IconResolver";
import { formatElapsed } from "@/components/official-candidate/elapsed-time/ElapsedTime";

import { PhaseIcon, PHASE_LABEL } from "../../components/readout-parts";
import {
  FAMILY_ICON,
  humanizeKind,
} from "../../components/run/node-presentation";
import { condensePlan, type LedgerRow } from "./model";

export function PlanLedger({
  rows,
  aimedNodeId,
  followedNodeId,
  onAim,
}: {
  rows: LedgerRow[];
  /** The step the focus pane is showing (aimed or followed). */
  aimedNodeId: string | null;
  /** The freshest work (what auto-follow tracks) — gets the live marker. */
  followedNodeId: string | null;
  onAim: (nodeId: string) => void;
}) {
  const [expandedFolds, setExpandedFolds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const entries = condensePlan(rows, aimedNodeId, expandedFolds);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Keep the aimed row in view as the run advances — nearest, never a jump.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [aimedNodeId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2.5 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          The plan
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {rows.filter((r) => r.phase === "settled" || r.phase === "skipped").length}
          /{rows.length} done
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {entries.map((entry) =>
          entry.kind === "fold" ? (
            <button
              key={`fold:${entry.key}`}
              type="button"
              onClick={() =>
                setExpandedFolds((prev) => new Set([...prev, entry.key]))
              }
              className="flex w-full items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-left hover:bg-accent/50"
            >
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {entry.rows.length} steps done
              </span>
              {entry.totalDurationMs !== null ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatElapsed(entry.totalDurationMs)}
                </span>
              ) : null}
            </button>
          ) : (
            <LedgerRowLine
              key={entry.row.step.nodeId}
              row={entry.row}
              aimed={entry.row.step.nodeId === aimedNodeId}
              followed={entry.row.step.nodeId === followedNodeId}
              onAim={onAim}
              activeRef={
                entry.row.step.nodeId === aimedNodeId ? activeRef : undefined
              }
              onCollapse={
                // A row that could re-fold (its stretch was expanded) offers
                // the reverse door via the chevron; cheap and honest.
                expandedFolds.has(entry.row.step.nodeId)
                  ? () =>
                      setExpandedFolds((prev) => {
                        const next = new Set(prev);
                        next.delete(entry.row.step.nodeId);
                        return next;
                      })
                  : undefined
              }
            />
          ),
        )}
      </div>
    </div>
  );
}

function LedgerRowLine({
  row,
  aimed,
  followed,
  onAim,
  activeRef,
  onCollapse,
}: {
  row: LedgerRow;
  aimed: boolean;
  followed: boolean;
  onAim: (nodeId: string) => void;
  activeRef?: React.RefObject<HTMLButtonElement | null>;
  onCollapse?: () => void;
}) {
  const { step, phase } = row;
  const fanOut = row.expectedCount > 1;
  return (
    <button
      ref={activeRef}
      type="button"
      onClick={() => onAim(step.nodeId)}
      aria-current={aimed ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-left transition-colors",
        aimed ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      {onCollapse ? (
        <span
          role="presentation"
          onClick={(e) => {
            e.stopPropagation();
            onCollapse();
          }}
        >
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </span>
      ) : (
        <PhaseIcon phase={phase} />
      )}
      <IconResolver
        iconName={step.iconName ?? FAMILY_ICON[step.family]}
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {step.label}
      </span>
      {followed && (phase === "running" || phase === "retrying") ? (
        <Crosshair className="h-3 w-3 shrink-0 text-primary" />
      ) : null}
      {step.outputKind ? (
        <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium leading-none text-emerald-600 dark:text-emerald-400">
          {humanizeKind(step.outputKind)}
        </span>
      ) : null}
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {fanOut && phase !== "idle"
          ? `${row.settledCount}/${row.expectedCount}`
          : row.durationMs !== null
            ? formatElapsed(row.durationMs)
            : phase === "idle"
              ? ""
              : PHASE_LABEL[phase]}
      </span>
    </button>
  );
}
