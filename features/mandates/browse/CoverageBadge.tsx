"use client";

// features/mandates/browse/CoverageBadge.tsx
//
// THE PER-ROW COVERAGE BADGE — the scoreboard the admin console already shows,
// brought to the two lists people actually browse (/agents/mandates and an
// organization's mandate settings).
//
//   met                    quiet. Nothing is drawn — a badge on every one of
//                          340+ assigned rows is noise, not information.
//   running on fallback    amber, and it NAMES the leader whose Holder carries
//                          this mandate (FALLBACK-MANDATES.md: a fallback that
//                          runs unnamed is silent permanent mediocrity).
//   nothing assigned       red. No Holder, no fallback that resolves.
//
// ONE fetch per page (useMandateCoverageStates), ONE classification (the
// server's — see ../coverage.ts). Clicking a badge narrows the list to that
// state SERVER-SIDE, by sending the keys that server already classified
// (./useCoverageList.tsx → ./service.ts); the active narrowing shows as a
// strip with a Clear button above the list.

import { createContext, useContext, useEffect, useState } from "react";
import { CircleAlert, CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { cn } from "@/lib/utils";
import {
  COVERAGE_META,
  buildCoverageStateIndex,
  fetchMandateCoverageStates,
  type MandateCoverageStateIndex,
  type MandateCoverageStatesResponse,
} from "@/features/mandates/coverage";

/** The two states a row can be filtered to. Green is quiet, so never a filter. */
export type MandateCoverageFilterBucket = "orange" | "red";

export interface MandateCoverageView {
  report: MandateCoverageStatesResponse | null;
  states: MandateCoverageStateIndex;
  loading: boolean;
  /** Verbatim server failure — a badge that vanishes on error would read as met. */
  error: string | null;
  /** True when the report answers for ONE owner's mandates only (an org page). */
  scoped: boolean;
  /** Narrow the list to one state, or clear it when it is already active. */
  onToggleFilter: (bucket: MandateCoverageFilterBucket) => void;
  active: MandateCoverageFilterBucket | null;
}

const CoverageContext = createContext<MandateCoverageView | null>(null);

export const MandateCoverageProvider = CoverageContext.Provider;

export function useMandateCoverageView(): MandateCoverageView | null {
  return useContext(CoverageContext);
}

/**
 * The ONE coverage fetch a mandate list makes. `organizationId` scopes it to
 * that organization's own mandates (the ownership law); omit it for the whole
 * registry.
 */
export function useMandateCoverageStates(
  organizationId?: string | null,
  enabled = true,
): {
  report: MandateCoverageStatesResponse | null;
  states: MandateCoverageStateIndex;
  loading: boolean;
  error: string | null;
} {
  const dispatch = useAppDispatch();
  // `callApi` requires an explicitly selected organization on EVERY request.
  // A list can mount before app-context hydration finishes, and firing at null
  // froze the admin console's coverage on a local pre-flight error even though
  // the shell showed the organization moments later (the same fix as
  // MandatesConsole). Wait for the authority the transport itself reads.
  const activeOrganizationId = useAppSelector(selectOrganizationId);
  const [report, setReport] = useState<MandateCoverageStatesResponse | null>(
    null,
  );
  const [states, setStates] = useState<MandateCoverageStateIndex>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Not yet answerable (an org page before its organization resolves).
    // Stay in LOADING rather than firing an unscoped report the page would
    // then present as that organization's coverage.
    if (!enabled || !activeOrganizationId) return;
    let cancelled = false;
    setLoading(true);
    void fetchMandateCoverageStates(dispatch, organizationId)
      .then((next) => {
        if (cancelled) return;
        setReport(next);
        setStates(buildCoverageStateIndex(next));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setReport(null);
        setStates(new Map());
        // Never swallowed and never downgraded to "everything is assigned":
        // the badges say UNKNOWN and carry this sentence.
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, organizationId, enabled, activeOrganizationId]);

  return { report, states, loading, error };
}

export interface MandateCoverageBadgeProps {
  mandateKey: string;
  /** Show the leader's key inline (the table has the width; cards do not). */
  nameLeader?: boolean;
}

/**
 * THE BADGE RULES, as a value — every one of them is a way to get honesty
 * wrong, so they are decided here and tested here rather than inside JSX.
 *
 *   none        met, or an unscoped report that has nothing to say. Quiet.
 *   unknown     the report FAILED. Never quiet: a vanished badge reads as met.
 *   unanswered  a scoped (org) report does not cover this mandate — it belongs
 *               to another owner. Distinct from met, and drawn differently.
 *   state       orange or red, with the sentence and (orange) the leader.
 */
export type CoverageBadgeVerdict =
  | { kind: "none" }
  | { kind: "unknown"; title: string }
  | { kind: "unanswered" }
  | {
      kind: "state";
      bucket: MandateCoverageFilterBucket;
      label: string;
      title: string;
    };

export function coverageBadgeVerdict(
  view: MandateCoverageView | null,
  mandateKey: string,
  nameLeader = false,
): CoverageBadgeVerdict {
  if (!view) return { kind: "none" };
  if (view.error) {
    return {
      kind: "unknown",
      title: `Coverage is unknown, not clean: ${view.error}`,
    };
  }
  if (view.loading) return { kind: "none" };

  const row = view.states.get(mandateKey);
  if (!row) return view.scoped ? { kind: "unanswered" } : { kind: "none" };
  if (row.state === "green") return { kind: "none" };

  const bucket: MandateCoverageFilterBucket = row.state;
  const meta = COVERAGE_META[bucket];
  const isActive = view.active === bucket;
  return {
    kind: "state",
    bucket,
    label:
      bucket === "orange"
        ? nameLeader && row.leader_key
          ? row.leader_key
          : "Fallback"
        : "Unassigned",
    title: `${row.reason ?? meta.description} — click to ${
      isActive ? "clear this filter" : `show only "${meta.label}"`
    }`,
  };
}

export function MandateCoverageBadge({
  mandateKey,
  nameLeader = false,
}: MandateCoverageBadgeProps) {
  const view = useMandateCoverageView();
  const verdict = coverageBadgeVerdict(view, mandateKey, nameLeader);

  if (verdict.kind === "none") return null;

  if (verdict.kind === "unknown") {
    return (
      <span className="text-[11px] text-muted-foreground" title={verdict.title}>
        unknown
      </span>
    );
  }

  if (verdict.kind === "unanswered") {
    return (
      <span
        className="text-[11px] text-muted-foreground/70"
        title="Another owner's Mandate — this organization's coverage does not answer for it."
      >
        —
      </span>
    );
  }

  const { bucket } = verdict;
  const Icon = bucket === "orange" ? CircleDashed : CircleAlert;
  const isActive = view?.active === bucket;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        view?.onToggleFilter(bucket);
      }}
      aria-pressed={isActive}
      title={verdict.title}
      className="max-w-full"
    >
      <Badge
        variant="outline"
        className={cn(
          "max-w-full gap-1 py-0 text-[10px] font-medium",
          bucket === "orange"
            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
          isActive && "ring-1 ring-primary",
        )}
      >
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate font-mono">{verdict.label}</span>
      </Badge>
    </button>
  );
}
