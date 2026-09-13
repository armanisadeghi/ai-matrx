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

import { AlertTriangle, Loader2, PlayCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Masterwork } from "../types";
import { AgentCredit } from "../components/AgentCredit";
import { TryMasterworkBox } from "../components/masterworks/TryMasterworkBox";
import {
  getUnderstudyRefreshState,
  readUnderstudyStandIn,
  refreshUnderstudy,
  refreshUnderstudyTracked,
  subscribeToUnderstudyRefresh,
} from "./refresh";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

export function UnderstudyCard({
  rulebookId,
  understudy,
  approvedCount,
  rulebookVersion,
  canEdit,
  onCreated,
}: {
  rulebookId: string;
  /** The Understudy workflow row, when it already exists. */
  understudy: Masterwork | null;
  approvedCount: number;
  /**
   * The Rulebook's CURRENT version. Compared against the version baked into
   * the stand-in so the card can never let someone test a stale one unaware.
   */
  rulebookVersion: number;
  canEdit: boolean;
  /** Fired after the self-heal mints the row — reload the masterworks list. */
  onCreated: () => void;
}) {
  const [healing, setHealing] = useState(false);
  const [healFailed, setHealFailed] = useState(false);
  const healedRef = useRef(false);

  // THE STAND-IN NEVER LIES ABOUT WHAT IT KNOWS (trial 12, 2026-09-12). Two
  // independent truths, both shown, because either one alone hides the defect:
  //   1. the rebuild's own outcome — `pokeUnderstudy` fires after every rules
  //      save and used to fail into a console nobody reads (for two hours
  //      every refresh returned HTTP 500 and nothing on screen said so);
  //   2. the version baked into the row — the only evidence that survives a
  //      page reload, and the thing that was actually two hours stale while
  //      the page above this card read "88 approved".
  const refreshState = useSyncExternalStore(
    subscribeToUnderstudyRefresh,
    () => getUnderstudyRefreshState(rulebookId),
    () => getUnderstudyRefreshState(rulebookId),
  );
  const standIn = readUnderstudyStandIn(
    refreshState,
    understudy
      ? {
          rulebook_version: understudy.rulebook_version ?? null,
          approved: understudy.understudy_rules?.approved ?? null,
          unconfirmed: understudy.understudy_rules?.unconfirmed ?? null,
          refreshed_at: understudy.understudy_refreshed_at ?? null,
        }
      : null,
    rulebookVersion,
  );
  const builtFromVersion = standIn.builtFromVersion;
  const behind = standIn.behind;
  const bakedApproved = standIn.approved;
  const missedApprovals =
    bakedApproved !== null ? Math.max(approvedCount - bakedApproved, 0) : null;

  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(() => {
    setRetrying(true);
    void refreshUnderstudyTracked(rulebookId)
      .then(() => onCreated())
      .catch(() => undefined)
      .finally(() => setRetrying(false));
  }, [rulebookId, onCreated]);

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
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">Understudy</h3>
        <AgentCredit
          mandate={MANDATE_KEYS.masterwork__understudy}
          agent="Masterwork Understudy (generic)"
        />
      </div>
      {/* THE NAME IS THE EXPLANATION (Arman, 2026-08-18). An understudy is the
          stand-in who goes on tonight, not the star — so "your system is
          already running" claimed the exact opposite of the word and threw
          away the one term that teaches the Understudy/Masterwork pair for
          free. Say the name, then be honest that it isn't good yet: that
          honesty is what makes "Build a Masterwork" mean something. */}
      {/* ONE line (Arman, 2026-08-21, on the previous two paragraphs: "it's
          got this long-ass paragraph thing… it doesn't actually say what's
          going on"). What it is, what it uses, one sentence. */}
      <p className="mt-2 text-xs text-muted-foreground">
        Quick test of a temporary stand-in we&apos;re building in real time
      </p>

      {refreshState.failed || behind ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">
              {behind
                ? "This stand-in is behind your rules."
                : "The last rebuild of this stand-in did not go through, so it may be behind your rules."}{" "}
              It is performing from your Rulebook as it was at version{" "}
              {builtFromVersion ?? "?"}
              {bakedApproved !== null
                ? ` (${bakedApproved} approved ${bakedApproved === 1 ? "rule" : "rules"})`
                : ""}
              , and your Rulebook is now at version {rulebookVersion}
              {missedApprovals !== null && missedApprovals > 0
                ? ` with ${missedApprovals} more approved ${missedApprovals === 1 ? "rule" : "rules"}`
                : ""}
              . Anything you test now is the older stand-in.
            </p>
            {refreshState.message ? (
              <p className="mt-1 text-xs text-muted-foreground">
                The last rebuild did not go through: {refreshState.message}
              </p>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={retry}
              disabled={retrying || refreshState.pending}
            >
              {retrying || refreshState.pending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCw className="mr-1 h-3.5 w-3.5" />
              )}
              Bring it up to date
            </Button>
          </div>
        </div>
      ) : null}

      <p className="mb-4 mt-2 text-[11px] text-muted-foreground">
        {builtFromVersion !== null
          ? `Performing from your rules as of version ${builtFromVersion}`
          : "Performing from your rules"}
        {bakedApproved !== null
          ? ` · ${bakedApproved} approved, ${standIn.unconfirmed ?? 0} still in review`
          : ""}
        {standIn.rebuiltAt
          ? ` · rebuilt ${new Date(standIn.rebuiltAt).toLocaleString()}`
          : ""}
      </p>
      <TryMasterworkBox
        masterworkId={understudy.id}
        masterworkKind="generate"
        whatItRuns="Your understudy"
        fieldLabels={["Your request", "Supporting material"]}
        onRunFinished={() => undefined}
      />
    </div>
  );
}
