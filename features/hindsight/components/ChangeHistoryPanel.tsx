"use client";

/**
 * ChangeHistoryPanel — Internal Affairs' window onto the platform's own edits.
 *
 * C-19 of the Dynamic Agent Graph program. Every applied change to a governed
 * unit (agent / tool / workflow), newest first: which unit, which version it
 * moved from and to, WHO made it (provenance tier), and — when a Hindsight
 * finding caused it — a door straight to that finding's review.
 *
 * Two rules this component exists to keep, both of which are easy to violate
 * by accident and impossible to notice afterwards:
 *
 * 1. A `version_from` the server INFERRED is rendered differently from one it
 *    RECORDED. `agx_promote_version` rolls a definition back without writing a
 *    version row, so the previous row is not always the previous state. An
 *    inferred number is marked with a `~` and says so on hover; a recorded one
 *    is plain. Showing them identically would turn a guess into an audit claim.
 * 2. Nothing here renders a null as a zero. "No signal yet" and "measured zero"
 *    are different facts and the difference is the entire point of measuring.
 *
 * Door Law: every unit named here opens, every finding named here opens, and
 * the header links to the enrollment that produced the finding.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RotateCcw, Sparkles, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { getChangeHistory } from "../api";
import { agentHref, toolHref, workflowHref } from "../subject-doors";
import type { ActorTier, ChangeHistoryRow, ChangeRole, UnitToken } from "../types";
import { versionFromIsInferred } from "../types";
import { DoorLink } from "./DoorLink";
import { fmtDate, KIND_COLOR, KIND_ICON, LEVER_LABEL } from "./tokens";

const PAGE_SIZE = 25;

const ROLE_LABEL: Record<ChangeRole, string> = {
  apply: "Applied a finding",
  revert: "Reverted",
  edit: "Direct edit",
};

const ROLE_COLOR: Record<ChangeRole, string> = {
  apply: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  revert: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  edit: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

/**
 * Provenance (C-11). A NULL tier is the PRE-PROVENANCE ERA, not an unknown
 * author and not a system one — the platform's standing rule is that it reads
 * as human, and it is never backfilled. Labelling it "unknown" would invent a
 * mystery; labelling it "human" flat would hide that nothing was stamped. It is
 * shown as human, muted, and says which on hover.
 */
const TIER_LABEL: Record<ActorTier, string> = {
  human: "Human",
  ai: "AI",
  code: "System",
};

const TIER_COLOR: Record<ActorTier, string> = {
  human: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  ai: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  code: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

function unitDoor(row: ChangeHistoryRow) {
  if (row.unit_token === "agent") {
    return { href: agentHref(row.unit_id), label: "Open agent", external: false };
  }
  if (row.unit_token === "tool") {
    return { href: toolHref(row.unit_id), label: "Open tool", external: false };
  }
  return { href: workflowHref(row.unit_id), label: "Open workflow", external: true };
}

/** v18 → v19, with the inferred case visibly marked. Never a bare arrow. */
function VersionMove({ row }: { row: ChangeHistoryRow }) {
  const inferred = versionFromIsInferred(row);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums">
      {row.version_from == null ? (
        <span
          className="text-muted-foreground"
          title="No earlier version exists — this is the unit's first recorded version."
        >
          —
        </span>
      ) : (
        <span
          className={cn(inferred && "text-muted-foreground underline decoration-dotted")}
          title={
            inferred
              ? "Inferred: this is the previous version ROW. A version promote can roll a definition back without writing a row, so the version that was actually live may differ. Not a recorded fact."
              : "Recorded at the moment of the change — this is what was live immediately before."
          }
        >
          {inferred ? "~" : ""}v{row.version_from}
        </span>
      )}
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span className="font-medium">v{row.version_to}</span>
      {row.restored_version != null && (
        <span
          className="ml-1 text-amber-600 dark:text-amber-400"
          title="The version whose content came back."
        >
          (restored v{row.restored_version})
        </span>
      )}
    </span>
  );
}

export function ChangeHistoryPanel({
  unitToken,
  unitId,
}: {
  unitToken?: UnitToken;
  unitId?: string;
}) {
  const [withFindingsOnly, setWithFindingsOnly] = useState(false);
  const [offset, setOffset] = useState(0);

  const history = useQuery({
    queryKey: ["hindsight", "change-history", unitToken, unitId, withFindingsOnly, offset],
    queryFn: () =>
      getChangeHistory({
        unitToken,
        unitId,
        withFindingsOnly,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  const rows = history.data?.rows ?? [];

  return (
    <Card className="p-3">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Change history</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Every applied change to a governed agent, tool, or workflow — who
            made it, which version it moved from and to, and the finding that
            caused it. This is what Internal Affairs reads.
          </p>
        </div>
        <Button
          variant={withFindingsOnly ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setWithFindingsOnly((v) => !v);
            setOffset(0);
          }}
          data-testid="change-history-findings-filter"
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          {withFindingsOnly ? "Finding-caused only" : "All changes"}
        </Button>
      </header>

      {history.isLoading && <Skeleton className="h-40" />}
      {history.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not load change history: {(history.error as Error).message}
        </p>
      )}

      {!history.isLoading && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {withFindingsOnly
            ? "No change here was caused by a Hindsight finding yet."
            : "No changes recorded for this filter."}
        </p>
      )}

      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const Icon = KIND_ICON[row.unit_token];
          const tier = row.actor_tier;
          const tierLabel = tier ? TIER_LABEL[tier] : "Human";
          return (
            <li
              key={row.change_id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2"
              data-testid="change-history-row"
            >
              <span
                className={cn(
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded",
                  KIND_COLOR[row.unit_token],
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>

              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {row.unit_name ?? row.unit_id}
              </span>

              <VersionMove row={row} />

              <Badge
                variant="outline"
                className={cn("shrink-0 border-0 text-[10px]", ROLE_COLOR[row.change_role])}
              >
                {row.change_role === "revert" && <RotateCcw className="mr-1 h-3 w-3" />}
                {ROLE_LABEL[row.change_role]}
              </Badge>

              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 border-0 text-[10px]",
                  TIER_COLOR[tier ?? "human"],
                  !tier && "opacity-60",
                )}
                title={
                  tier
                    ? row.actor_system
                      ? `${tierLabel} — ${row.actor_system}`
                      : tierLabel
                    : "Written before provenance stamping existed. The platform reads an unstamped change as human; it is never backfilled."
                }
              >
                {tier === "human" && <UserRound className="mr-1 h-3 w-3" />}
                {tierLabel}
                {!tier && " (unstamped)"}
              </Badge>

              {row.finding_lever && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {LEVER_LABEL[row.finding_lever]}
                </Badge>
              )}

              <span className="shrink-0 text-xs text-muted-foreground">
                {fmtDate(row.changed_at)}
              </span>

              {/* Door Law: the unit opens, and so does the finding behind it. */}
              <DoorLink door={unitDoor(row)} size="xs" />
              {row.enrollment_id && (
                <DoorLink
                  door={{
                    href: `/administration/agents/hindsight?enrollment=${row.enrollment_id}`,
                    label: "Open finding",
                    external: false,
                  }}
                  size="xs"
                />
              )}
            </li>
          );
        })}
      </ul>

      {(offset > 0 || history.data?.has_more) && (
        <footer className="mt-3 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            {offset + 1}–{offset + rows.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!history.data?.has_more}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
          >
            Next
          </Button>
        </footer>
      )}
    </Card>
  );
}
