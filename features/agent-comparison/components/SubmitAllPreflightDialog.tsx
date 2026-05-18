"use client";

/**
 * SubmitAllPreflightDialog
 *
 * Shown immediately before `submitAllBattleColumns` fires. Gives the user:
 *   - a per-column "ready" status (✓ has input, ⚠ empty)
 *   - an optional shared follow-up message that broadcasts to every empty
 *     column (saves them from typing the same message N times when they
 *     just want to continue the chat across all agents)
 *   - the choice to submit only the columns that already have input, or
 *     to cancel and fill messages manually
 *
 * The dialog only opens when at least one configured column has no input
 * ready. When everything is set, the toolbar's Submit All bypasses the
 * dialog and goes straight through.
 */

import { useEffect, useState } from "react";
import { Loader2, MessageSquarePlus, Play, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BattleColumn } from "../types";

export interface ColumnReadiness {
  column: BattleColumn;
  agentName: string;
  hasMessage: boolean;
  /** "first-turn" — column has 0 completed responses; vars matter. */
  /** "continuation" — column has ≥1 completed responses; only message matters. */
  phase: "first-turn" | "continuation";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readiness: ColumnReadiness[];
  /** Called when user wants to broadcast a message and submit. */
  onSubmitWithSharedMessage: (message: string) => Promise<void> | void;
  /** Called when user wants to submit only the ready columns. */
  onSubmitOnlyReady: () => Promise<void> | void;
}

export function SubmitAllPreflightDialog({
  open,
  onOpenChange,
  readiness,
  onSubmitWithSharedMessage,
  onSubmitOnlyReady,
}: Props) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset the draft each time the dialog re-opens.
  useEffect(() => {
    if (open) {
      setDraft("");
      setBusy(false);
    }
  }, [open]);

  const emptyColumns = readiness.filter((r) => !r.hasMessage);
  const readyColumns = readiness.filter((r) => r.hasMessage);

  const handleBroadcast = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await onSubmitWithSharedMessage(draft.trim());
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitOnlyReady = async () => {
    setBusy(true);
    try {
      await onSubmitOnlyReady();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Some columns have no message
          </DialogTitle>
          <DialogDescription>
            Send the same follow-up to every empty column, or submit only the
            ones that already have input.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Per-column readiness list */}
          <div className="border border-border rounded-md divide-y divide-border max-h-44 overflow-y-auto">
            {readiness.map((r) => (
              <div
                key={r.column.columnId}
                className="flex items-center gap-2 px-3 py-1.5 text-xs"
              >
                <span
                  className={cn(
                    "inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold shrink-0",
                    r.hasMessage
                      ? "bg-emerald-500/20 text-emerald-500"
                      : "bg-amber-500/20 text-amber-500",
                  )}
                  title={r.hasMessage ? "Has input" : "Empty"}
                >
                  {r.hasMessage ? "✓" : "!"}
                </span>
                <span className="flex-1 truncate font-medium text-foreground">
                  {r.agentName}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {r.phase === "first-turn" ? "1st turn" : "follow-up"}
                </span>
                <span
                  className={cn(
                    "text-[10px] shrink-0",
                    r.hasMessage ? "text-emerald-500" : "text-amber-500",
                  )}
                >
                  {r.hasMessage ? "ready" : "empty"}
                </span>
              </div>
            ))}
          </div>

          {/* Shared message editor */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Shared follow-up message
            </label>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message to send to every empty column..."
              rows={3}
              disabled={busy}
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground resize-y focus:outline-none focus:border-primary"
            />
            <p className="text-[10px] text-muted-foreground">
              Will be applied to {emptyColumns.length} empty column
              {emptyColumns.length === 1 ? "" : "s"}. Columns that already
              have a message are unaffected.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleSubmitOnlyReady}
            disabled={busy || readyColumns.length === 0}
            title={
              readyColumns.length === 0
                ? "No columns have a message yet"
                : `Submit only the ${readyColumns.length} ready column${
                    readyColumns.length === 1 ? "" : "s"
                  }`
            }
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Submit ready only ({readyColumns.length})
          </Button>
          <Button
            variant="default"
            onClick={handleBroadcast}
            disabled={busy || !draft.trim()}
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            Send to all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
