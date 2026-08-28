"use client";

/**
 * 4. THE COMPLETENESS STRIP — the surfaces admin's three jewels, in one line.
 *
 *  - the readiness badge (`SurfaceReadinessBadge`'s tone table and its
 *    `readiness_note`-as-tooltip behaviour),
 *  - the drift summary chip opening the report — the 15-array report's
 *    severity-toned Section structure kept intact (amber / rose / orange, a
 *    count badge, and a prose consequence per section),
 *  - one-click Sync with the counted receipt.
 *
 * Plus the live-scope read the floating window already gives ("N/M supplied",
 * "contract honored", "N write targets unwired") — hoisted onto the place's own
 * page, because that number is the completeness law and it should not live only
 * in a floating window.
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Inert } from "./preview-chrome";
import {
  DRIFT_ISSUE_COUNT,
  DRIFT_SECTIONS,
  LIVE_SCOPE,
  PLACE,
  SYNC_RECEIPT,
  type DriftSection,
} from "./mock-data";

/** Same four buckets and the same tone table as `SurfaceReadinessBadge`. */
const READINESS_META = {
  verified: {
    label: "verified",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  partial: {
    label: "partial",
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  stub: { label: "stub", className: "text-muted-foreground" },
  unregistered: {
    label: "unregistered",
    className: "border-destructive/40 bg-destructive/5 text-destructive",
  },
} as const;

function DriftReportDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[80dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Manifest drift report — {PLACE.displayName}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <p className="text-[11px] text-muted-foreground">
            {DRIFT_ISSUE_COUNT} issues found. The count sums every array the
            report computes rather than a hand-picked subset, so a new drift
            category can never be silently under-reported.
          </p>
          {DRIFT_SECTIONS.map((section) => (
            <Section key={section.title} section={section} />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ section }: { section: DriftSection }) {
  const toneClass =
    section.tone === "amber"
      ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
      : section.tone === "rose"
        ? "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
        : "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold">{section.title}</h3>
        <Badge variant="outline" className={cn("text-[10px]", toneClass)}>
          {section.rows.length}
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">{section.description}</p>
      <div className="divide-y divide-border rounded-md border border-border">
        {section.rows.map((row) => (
          <div
            key={row.name}
            className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5"
          >
            <span className="font-mono text-[11px] text-foreground">
              {row.name}
            </span>
            <code className="truncate font-mono text-[10px] text-muted-foreground">
              {row.detail}
            </code>
            <Inert what="delete this one stale mirror row, naming the CASCADE first">
              <Button variant="outline" size="sm" className="h-6 text-[10px]">
                Delete this row
              </Button>
            </Inert>
          </div>
        ))}
      </div>
    </div>
  );
}

function SyncReceiptDialog({ onClose }: { onClose: () => void }) {
  const total = SYNC_RECEIPT.reduce((n, r) => n + r.count, 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Sync applied — {total} changes
          </DialogTitle>
        </DialogHeader>
        <div className="divide-y divide-border rounded-md border border-border">
          {SYNC_RECEIPT.map((row) => (
            <div
              key={row.label}
              className={cn(
                "flex items-center justify-between px-2 py-1 text-[11px]",
                row.count === 0 && "text-muted-foreground",
              )}
            >
              <span>{row.label}</span>
              <span className="font-mono tabular-nums">{row.count}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Remaining drift: <b className="font-mono tabular-nums">0</b> — counted
          by the same exhaustive helper the report uses, so the receipt and the
          report can never disagree.
        </p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompletenessStrip({ readOnly }: { readOnly: boolean }) {
  const [dialog, setDialog] = useState<"drift" | "sync" | null>(null);
  const readiness = READINESS_META[PLACE.readiness];

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
        <Badge
          variant="outline"
          className={cn("text-[10px]", readiness.className)}
          title={PLACE.readinessNote}
        >
          {readiness.label}
        </Badge>

        <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
          <CircleDot className="h-2.5 w-2.5 fill-current" />
          live
        </span>

        <span className="text-[11px] text-muted-foreground">
          <b className="font-mono tabular-nums text-foreground">
            {LIVE_SCOPE.supplied}
          </b>
          /{LIVE_SCOPE.declared} supplied
        </span>

        {LIVE_SCOPE.undeclaredRuntimeKeys.length > 0 && (
          <span
            className="text-[11px] text-amber-600 dark:text-amber-400"
            title={`Runtime keys with no declaration: ${LIVE_SCOPE.undeclaredRuntimeKeys.join(", ")}`}
          >
            {LIVE_SCOPE.undeclaredRuntimeKeys.length} undeclared (runtime only)
          </span>
        )}

        <span className="flex items-center gap-1 text-[11px] text-destructive">
          <TriangleAlert className="h-3 w-3" />
          {LIVE_SCOPE.writeTargetsUnwired} of {LIVE_SCOPE.writeTargets} write
          targets unwired
        </span>

        <span className="text-[11px] text-muted-foreground">
          {PLACE.lastCheckedLabel}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 border-orange-500/40 bg-orange-500/10 text-[11px] text-orange-700 hover:bg-orange-500/20 dark:text-orange-300"
            onClick={() => setDialog("drift")}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Drift
            <span className="font-mono tabular-nums">{DRIFT_ISSUE_COUNT}</span>
          </Button>
          {!readOnly && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={() => setDialog("sync")}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sync manifests
            </Button>
          )}
        </div>
      </div>

      {dialog === "drift" && (
        <DriftReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "sync" && (
        <SyncReceiptDialog onClose={() => setDialog(null)} />
      )}
    </>
  );
}
