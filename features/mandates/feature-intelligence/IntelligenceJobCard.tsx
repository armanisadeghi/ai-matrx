"use client";

// features/mandates/feature-intelligence/IntelligenceJobCard.tsx
//
// ONE MANDATE on a feature's Intelligence page (Arman, 2026-09-26: "The entire
// card doesn't make sense. It's confused about what is the mandate and what's
// the intelligence."). So the card says the two apart, top to bottom:
//
//   1. THE MANDATE — its name and its own description, nothing else. Beside
//      the name: Lightbulb (the Mandate Peek) and ExternalLink (its page, new
//      tab). A divider.
//   2. THE LADDER — System → Organization → You.
//   3. THE ASSIGNMENT — one button that really assigns: "For me" writes my own
//      binding; the organization seat (owners/admins only — the page offers it
//      to no one else) writes the organization default. It opens the one
//      holder picker (agents and workflows equally) and saves through the one
//      binding path; the ladder re-reads on the write.
//   4. THE INTELLIGENCE — the agent or workflow filling it now, with its peek,
//      its new-tab door, Duplicate and Use my own.

import Link from "next/link";
import {
  Copy,
  Loader2,
  RotateCcw,
  UserRoundCog,
  Workflow,
} from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { NewTabLink } from "@/components/official/entity-ref/NewTabLink";
import { agentHref } from "../admin/mandate-health";
import { MemberHealthBadge } from "../member-list/columns";
import { MandatePeekButton } from "../peek/MandatePeek";
import { useMandateLadder, type MandateRung } from "../workspace/useMandateLadder";
import type { FeatureIntelligenceRow, ResolvedPlace } from "./types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface RunOverride {
  holderId: string;
  /** The name of what runs instead, for this context only. */
  holderName: string;
  /** Where that choice is managed. */
  manageHref: string;
  /** "This topic". */
  contextLabel: string;
  /** A topic choice can outlive the agent it names. */
  health?: "checking" | "available" | "unavailable" | "unknown";
  /**
   * The recorded choice names the agent the mandate picks today, so it changes
   * nothing now — but it takes over the moment the mandate choice changes.
   */
  matchesMandate?: boolean;
}

const RUNG_LABEL: Record<MandateRung, string> = {
  system: "System",
  org: "Organization",
  user: "You",
};

export function IntelligenceJobCard({
  row,
  focused,
  orgLevel,
  organizationId,
  busy,
  canReset,
  resetLabel,
  detailsHref,
  runOverride,
  onHover,
  onDuplicate,
  onUseOwn,
  onReset,
}: {
  row: FeatureIntelligenceRow;
  /** Kept for the page's contract; where a job runs is the page's places map. */
  places?: readonly ResolvedPlace[];
  focused: boolean;
  orgLevel: boolean;
  organizationId: string | null;
  busy: boolean;
  canReset: boolean;
  resetLabel: string;
  /** The mandate's page for this seat. */
  detailsHref: string;
  runOverride: RunOverride | null;
  onHover: (key: string | null) => void;
  onDuplicate: () => void;
  /** Opens the holder picker; saving writes at this seat's level. */
  onUseOwn: () => void;
  onReset: () => void;
}) {
  const ladder = useMandateLadder(row.mandateKey, organizationId);
  /** A topic choice that actually changes what runs (not a dormant same-agent pin). */
  const overriding = Boolean(runOverride && !runOverride.matchesMandate);
  const ownRung = orgLevel ? "org" : "user";
  const hasSavedChoice = Boolean(ladder.rows.find((entry) => entry.rung === ownRung)?.binding_id);
  const hasHolder =
    Boolean(row.holderId) && (row.holderType === "agent" || row.holderType === "workflow");
  const isWorkflow = row.holderType === "workflow";
  const HolderIcon = isWorkflow ? Workflow : AGENT_ICON;
  const about = row.description || row.goal?.split(/(?<=[.!?])\s+/)[0] || row.goal;
  const assignLabel = orgLevel ? "Set organization default" : "Set my own";

  return (
    <li
      id={`intelligence-${row.mandateKey}`}
      data-mandate-key={row.mandateKey}
      onMouseEnter={() => onHover(row.mandateKey)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(row.mandateKey)}
      className={cn(
        "scroll-mt-24 rounded-2xl border bg-card p-4 transition-colors sm:p-5",
        focused ? "border-primary/60 ring-2 ring-primary/20" : "border-border",
      )}
    >
      {/* 1. THE MANDATE */}
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center gap-1">
          <h3 className="min-w-0 truncate text-[15px] font-semibold leading-tight text-foreground">
            {row.shortName}
          </h3>
          <MandatePeekButton mandate={row.id} name={row.shortName} href={detailsHref} />
          <NewTabLink href={detailsHref} label={row.shortName} />
        </div>
        {about ? (
          <p className="line-clamp-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            {about}
          </p>
        ) : null}
      </div>

      <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
        {/* 2. THE LADDER */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="Mandate precedence">
          {(["system", "org", "user"] as const).map((rung, index) => {
            const entry = ladder.rows.find((item) => item.rung === rung);
            const isWinner = row.decidedRung === rung;
            const state = ladder.loading
              ? "Checking"
              : ladder.error
                ? "Unavailable"
                : entry?.dropped_reason
                  ? "Needs attention"
                  : entry?.chose_holder
                    ? isWinner ? (overriding ? "Under topic choice" : "Active") : "Set"
                    : "No choice";
            return (
              <span key={rung} className="inline-flex items-center gap-1.5">
                {index > 0 ? <span className="text-muted-foreground/50" aria-hidden>→</span> : null}
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5",
                    isWinner && !overriding
                      ? "border-primary/40 bg-primary/5 font-medium text-primary"
                      : entry?.dropped_reason
                        ? "border-destructive/40 text-destructive"
                        : "border-border text-muted-foreground",
                  )}
                  title={entry?.dropped_reason ?? undefined}
                >
                  {RUNG_LABEL[rung]}: {state}
                </span>
              </span>
            );
          })}
          {runOverride ? (
            <span className={cn(
              "rounded-full border px-2 py-0.5 font-medium",
              runOverride.health === "unavailable"
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : runOverride.health === "unknown"
                  ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300"
                  : "border-primary/40 bg-primary/5 text-primary",
            )}>
              {runOverride.contextLabel}: {runOverride.health === "unavailable" ? "Agent unavailable" : runOverride.health === "unknown" ? "Status unavailable" : runOverride.health === "checking" ? "Checking agent" : runOverride.matchesMandate ? "Same agent" : "Active"}
            </span>
          ) : null}
          {ladder.error ? (
            <span className="text-destructive">
              {ladder.error} <ErrorAlchemyMenu error={ladder.error} />
            </span>
          ) : null}
        </div>

        {/* 3. THE ASSIGNMENT */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={onUseOwn} disabled={busy} data-intelligence-assign>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserRoundCog className="mr-1.5 h-3.5 w-3.5" />}
            {assignLabel}
          </Button>
          {canReset || hasSavedChoice ? (
            <Button size="sm" variant="ghost" onClick={onReset} disabled={busy}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {resetLabel}
            </Button>
          ) : null}
        </div>

        {/* 4. THE INTELLIGENCE filling it */}
        <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <HolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {hasHolder && row.holderId ? (
              isWorkflow ? (
                <EntityRef
                  token="workflow"
                  id={row.holderId}
                  name={row.holderName}
                  showIcon={false}
                  alwaysShowActions
                  labelClassName="font-medium"
                />
              ) : (
                <EntityRef
                  token="agent"
                  id={row.holderId}
                  name={row.holderName}
                  href={agentHref(row.holderId, null)}
                  showIcon={false}
                  alwaysShowActions
                  labelClassName="font-medium"
                />
              )
            ) : (
              <span className="text-muted-foreground">Not assigned</span>
            )}
            {hasHolder ? (
              <span className="text-xs text-muted-foreground">
                {isWorkflow ? "Workflow" : "Agent"}
                {row.pinText && row.pinText !== "None" ? ` · ${row.pinText}` : ""}
              </span>
            ) : null}
            {row.health !== "OK" ? <MemberHealthBadge health={row.health} /> : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {hasHolder || runOverride ? (
              <Button size="sm" variant="outline" onClick={onDuplicate} disabled={busy}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Duplicate
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={onUseOwn} disabled={busy}>
              <UserRoundCog className="mr-1.5 h-3.5 w-3.5" />
              Use my own
            </Button>
          </div>
        </div>

        {runOverride ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[13px]">
            <span className="text-xs font-medium text-muted-foreground">
              {runOverride.contextLabel}
            </span>
            {runOverride.health === "unavailable" ? (
              <span className="text-destructive">Agent unavailable</span>
            ) : (
              <EntityRef
                token="agent"
                id={runOverride.holderId}
                name={runOverride.holderName}
                href={agentHref(runOverride.holderId, null)}
                showIcon={false}
                alwaysShowActions
              />
            )}
            <Link href={runOverride.manageHref} className="text-xs text-primary hover:underline">
              Manage
            </Link>
          </div>
        ) : null}
      </div>
    </li>
  );
}
