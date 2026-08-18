"use client";

// features/masterwork/understudy/UnderstudyCard.tsx
//
// "Your system is already running — try it." The Rulebook page's face of the
// Understudy (vision doc 13: the system runs from the first minute, and
// everything after is improvement). Renders the SAME TryMasterworkBox the
// Studio and Encore use — never a second run surface — over the Understudy
// workflow, plus the two lines that make the reframe land: it is a STAND-IN
// (say the word — the name is the explanation), and it gets better as rules
// are approved.
//
// Self-heals: a Rulebook created before the Understudy existed has no row yet;
// when the editor opens it, one free refresh call mints it.

import { Loader2, PlayCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [healFailed, setHealFailed] = useState(false);
  const healedRef = useRef(false);

  // Self-heal exactly once per mount: no Understudy + an editor looking at the
  // page → mint it (free, idempotent) and let the parent re-list.
  const heal = useCallback(() => {
    setHealing(true);
    setHealFailed(false);
    void refreshUnderstudy(rulebookId)
      .then(() => onCreated())
      .catch((err) => {
        // Never leave the card spinning on "Starting your system…" forever —
        // that silent dead end is the same defect as a bare error toast.
        console.error("[understudy] self-heal refresh failed", err);
        setHealFailed(true);
      })
      .finally(() => setHealing(false));
  }, [rulebookId, onCreated]);

  useEffect(() => {
    if (understudy || !canEdit || healedRef.current) return;
    healedRef.current = true;
    heal();
  }, [understudy, canEdit, heal]);

  if (!understudy) {
    if (!canEdit) return null;
    if (healFailed) {
      return (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-sm text-foreground">
            We couldn&apos;t bring your understudy on just now.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your rules are safe — nothing was lost. Try again, or reload the
            page; it costs nothing and takes a second.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={heal}
            disabled={healing}
          >
            <RotateCw className="mr-1 h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {healing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          Bringing your understudy on — the stand-in that does this job today…
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
          Your understudy is ready — try it
        </h3>
      </div>
      {/* THE NAME IS THE EXPLANATION (Arman, 2026-08-18). An understudy is the
          stand-in who goes on tonight, not the star — so "your system is
          already running" claimed the exact opposite of the word and threw
          away the one term that teaches the Understudy/Masterwork pair for
          free. Say the name, then be honest that it isn't good yet: that
          honesty is what makes "Build a Masterwork" mean something. */}
      <p className="mb-1 text-xs text-muted-foreground">
        A rough stand-in that already does this whole job —{" "}
        {approvedCount === 0
          ? "improvising, since you haven't approved any rules yet"
          : `from the ${approvedCount} ${approvedCount === 1 ? "rule" : "rules"} you've approved`}
        . Describe a job below and watch it work.
      </p>
      <p className="mb-2 text-xs text-muted-foreground">
        It won&apos;t be as good as the real thing — that&apos;s what building
        your Masterwork is for.
      </p>
      <TryMasterworkBox
        masterworkId={understudy.id}
        masterworkKind="generate"
        whatItRuns="Your understudy"
        onRunFinished={() => undefined}
      />
    </div>
  );
}
