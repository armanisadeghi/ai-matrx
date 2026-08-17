"use client";

// features/masterwork/understudy/UnderstudyCard.tsx
//
// "Your system is already running — try it." The Rulebook page's face of the
// Understudy (vision doc 13: the system runs from the first minute, and
// everything after is improvement). Renders the SAME TryMasterworkBox the
// Studio and Encore use — never a second run surface — over the Understudy
// workflow, plus the one line that makes the reframe land: it gets better as
// rules are approved.
//
// Self-heals: a Rulebook created before the Understudy existed has no row yet;
// when the editor opens it, one free refresh call mints it.

import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Masterwork } from "../types";
import { TryMasterworkBox } from "../components/masterworks/TryMasterworkBox";
import { refreshUnderstudy } from "./refresh";

export function UnderstudyCard({
  rulebookId,
  understudy,
  approvedCount,
  canEdit,
  onCreated,
}: {
  rulebookId: string;
  /** The Understudy workflow row, when it already exists. */
  understudy: Masterwork | null;
  approvedCount: number;
  canEdit: boolean;
  /** Fired after the self-heal mints the row — reload the masterworks list. */
  onCreated: () => void;
}) {
  const [healing, setHealing] = useState(false);
  const healedRef = useRef(false);

  // Self-heal exactly once per mount: no Understudy + an editor looking at the
  // page → mint it (free, idempotent) and let the parent re-list.
  useEffect(() => {
    if (understudy || !canEdit || healedRef.current) return;
    healedRef.current = true;
    setHealing(true);
    void refreshUnderstudy(rulebookId)
      .then(() => onCreated())
      .catch((err) => {
        console.error("[understudy] self-heal refresh failed", err);
      })
      .finally(() => setHealing(false));
  }, [understudy, canEdit, rulebookId, onCreated]);

  if (!understudy) {
    if (!canEdit) return null;
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {healing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Starting your system…
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">
          Your system is already running — try it
        </h3>
        <span className="text-xs text-muted-foreground">
          {approvedCount === 0
            ? "No approved rules yet, so it improvises the whole job. Every rule you approve makes it sharper."
            : `Performing from your ${approvedCount} approved ${approvedCount === 1 ? "rule" : "rules"} — it gets sharper with every approval.`}
        </span>
      </div>
      <TryMasterworkBox
        masterworkId={understudy.id}
        masterworkKind="generate"
        onRunFinished={() => undefined}
      />
    </div>
  );
}
