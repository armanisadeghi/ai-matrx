"use client";

// features/mandates/feature-intelligence/IntelligenceJobCard.tsx
//
// ONE JOB of a feature's Intelligence page (Arman, 2026-09-26: options 2 + 3
// of the card study). Collapsed it is one row — the mandate on the left (name,
// status, Lightbulb peek, new tab) and the intelligence on the right (the agent
// or workflow running it, its peek and new tab, and which level decided it).
// Expanded it is the split card: the mandate's description, what it can use,
// what it makes and where it runs on the left; on the right the holder with
// Duplicate & modify, Use my own and Reset beside it, and the System →
// Organization → You ladder.
//
// 🚨 TEXT NEVER WRAPS. Every name and sentence is one line, truncated with an
// ellipsis, with the full text in its tooltip; at narrow widths the two halves
// stack left over right instead of squeezing. Checked at 375 / 768 / 1024 /
// 1440.

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { NewTabLink } from "@/components/official/entity-ref/NewTabLink";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationName } from "@/lib/redux/slices/appContextSlice";
import { agentHref } from "../admin/mandate-health";
import { MemberHealthBadge } from "../member-list/columns";
import { MandateStatusControl } from "../status/MandateStatusControl";
import { MandatePeekButton } from "../peek/MandatePeek";
import { inputDisplayLabel } from "../peek/input-label";
import {
  Actions,
  HolderRef,
  InputChips,
  PlaceChips,
  RUNGS,
  RUNG_LABEL,
  decidedWords,
  makesWords,
  useJob,
  type JobContext,
} from "./job-card-parts";
import type { FeatureIntelligenceRow, ResolvedPlace } from "./types";
import { SetAsideNotice, setAsideRung } from "./SetAsideNotice";

export { inputDisplayLabel };

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

const LABEL = "shrink-0 text-xs font-medium text-muted-foreground";

/** One line of text that never wraps; the whole text is its tooltip. */
function Line({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn("min-w-0 truncate", className)} title={text}>
      {text}
    </p>
  );
}

function topicWords(runOverride: RunOverride): string {
  if (runOverride.health === "unavailable") return "Agent unavailable";
  if (runOverride.health === "unknown") return "Status unavailable";
  if (runOverride.health === "checking") return "Checking agent";
  return runOverride.matchesMandate ? "Same agent" : "Active";
}

function topicSentence(runOverride: RunOverride): string {
  if (runOverride.health === "unavailable") {
    return "The selected agent cannot be opened. Remove this topic choice to use the mandate assignment.";
  }
  if (runOverride.health === "unknown") return "This topic choice is recorded, but its agent could not be checked.";
  return runOverride.matchesMandate
    ? "The same agent the mandate picks today. If the mandate choice changes, this topic keeps running this agent until you remove the topic choice."
    : "This topic choice takes precedence over the mandate choice.";
}

export function IntelligenceJobCard({
  row,
  places,
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
  places: readonly ResolvedPlace[];
  focused: boolean;
  orgLevel: boolean;
  organizationId: string | null;
  busy: boolean;
  canReset: boolean;
  resetLabel: string;
  detailsHref: string;
  runOverride: RunOverride | null;
  onHover: (key: string | null) => void;
  onDuplicate: () => void;
  onUseOwn: () => void;
  onReset: () => void;
}) {
  const organizationName = useAppSelector(selectOrganizationName);
  const ctx: JobContext = {
    places,
    orgLevel,
    organizationId,
    organizationName,
    busy,
    detailsHref,
    onDuplicate,
    onUseOwn,
    onReset,
  };
  const job = useJob(row, ctx);
  const [expanded, setExpanded] = useState(focused);
  /** A topic choice that actually changes what runs (not a dormant same-agent pin). */
  const overriding = Boolean(runOverride && !runOverride.matchesMandate);
  const decided = decidedWords(row, orgLevel);
  const mine = row.decidedRung === "user" || (orgLevel && row.decidedRung === "org");
  const panelId = `intelligence-${row.mandateKey}-details`;
  const setAside = setAsideRung(job.ladder.rows);

  // The row toggles on a click anywhere that is not itself a control.
  const onRowClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, [role='menu'], [role='dialog'], [data-radix-popper-content-wrapper]")) return;
    setExpanded((value) => !value);
  };

  return (
    <li
      id={`intelligence-${row.mandateKey}`}
      data-mandate-key={row.mandateKey}
      data-expanded={expanded ? "true" : "false"}
      onMouseEnter={() => onHover(row.mandateKey)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(row.mandateKey)}
      className={cn(
        "min-w-0 scroll-mt-24 overflow-hidden rounded-xl border bg-card transition-colors",
        focused ? "border-primary/60 ring-2 ring-primary/20" : "border-border",
      )}
    >
      {/* ── Collapsed row: mandate | intelligence ─────────────────────────── */}
      <div
        onClick={onRowClick}
        className="grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 px-3 py-2.5 hover:bg-accent/20 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,22rem)]"
      >
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={expanded ? `Collapse ${row.shortName}` : `Expand ${row.shortName}`}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
        </button>

        <div className="flex min-w-0 items-center gap-1">
          <h3 className="min-w-[7rem] shrink truncate text-[14px] font-semibold text-foreground" title={row.shortName}>
            {row.shortName}
          </h3>
          <MandatePeekButton mandate={row.id} name={row.shortName} href={detailsHref} />
          <NewTabLink href={detailsHref} label={row.shortName} />
          <span className="ml-1 shrink-0" onClick={(event) => event.stopPropagation()}>
            {/* THE STATUS — draft vs active is never left to a guess. The
                person who made this job may change it here. */}
            <MandateStatusControl
              mandateId={row.id}
              name={row.shortName}
              status={row.status}
              canManage={!orgLevel && row.createdByMe && row.origin === "soft" && !row.isSystem}
              onSetHolder={onUseOwn}
              size="sm"
            />
          </span>
          {row.health !== "OK" ? <span className="hidden shrink-0 sm:inline-flex"><MemberHealthBadge health={row.health} /></span> : null}
        </div>

        <div className="col-start-2 flex min-w-0 items-center gap-2 text-[13px] md:col-start-3">
          <HolderRef row={row} className="min-w-0 flex-1" />
          {runOverride ? (
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 font-normal",
                runOverride.health === "unavailable" ? "border-destructive/40 text-destructive" : "border-primary/40 text-primary",
              )}
              title={topicSentence(runOverride)}
            >
              {runOverride.contextLabel}: {topicWords(runOverride)}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className={cn("max-w-[10rem] shrink-0 truncate font-normal", mine ? "border-primary/40 text-primary" : "text-muted-foreground")}
              title={decided}
            >
              {decided}
            </Badge>
          )}
        </div>
      </div>

      {setAside ? (
        <SetAsideNotice
          rung={setAside}
          expects={makesWords(row)}
          runsInstead={row.holderName}
          onPickAnother={onUseOwn}
        />
      ) : null}

      {/* ── Expanded: the split card ──────────────────────────────────────── */}
      {expanded ? (
        <div id={panelId} className="grid min-w-0 border-t border-border/60 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0 space-y-3 p-4">
            {job.about ? <Line text={job.about} className="text-[13px] text-muted-foreground" /> : null}
            {row.health !== "OK" ? <span className="inline-flex sm:hidden"><MemberHealthBadge health={row.health} /></span> : null}
            {!row.isSystem ? (
              <Badge variant="outline" className="max-w-full truncate font-normal text-muted-foreground" title={row.homeLabel}>
                {row.homeLabel}
              </Badge>
            ) : null}
            <div className="min-w-0 space-y-1">
              <div className={LABEL}>Can use</div>
              <InputChips mandateKey={row.mandateKey} />
            </div>
            <div className="flex min-w-0 items-baseline gap-2 text-[13px]">
              <span className={LABEL}>Makes</span>
              <Line text={makesWords(row)} className="text-foreground" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className={LABEL}>Runs in</div>
              <PlaceChips places={job.where} />
            </div>
          </div>

          <div className="min-w-0 space-y-3 border-t border-border/60 bg-muted/20 p-4 md:border-l md:border-t-0">
            <div className="min-w-0 space-y-1.5">
              <div className={LABEL}>{overriding ? "Mandate choice" : "Runs now"}</div>
              <div className="flex min-w-0 items-center gap-2 text-[13px]">
                <HolderRef row={row} className="min-w-0 flex-1" />
                <Line
                  text={`${row.holderType === "workflow" ? "Workflow" : row.holderType === "agent" ? "Agent" : ""}${row.pinText && row.pinText !== "None" ? ` · ${row.pinText}` : ""}`}
                  className="max-w-[45%] shrink-0 text-xs text-muted-foreground"
                />
              </div>
              <Actions
                row={row}
                ctx={ctx}
                job={{ ...job, canDuplicate: job.canDuplicate || Boolean(runOverride), canReset: canReset || job.canReset, resetLabel }}
                className="min-w-0 [&_button]:max-w-full"
              />
            </div>

            {runOverride ? (
              <div className="min-w-0 space-y-1">
                <div className={LABEL}>
                  {runOverride.matchesMandate ? "Recorded on" : "Runs on"} {runOverride.contextLabel.toLowerCase()}
                </div>
                <div className="flex min-w-0 items-center gap-2 text-[13px]">
                  {runOverride.health === "unavailable" ? (
                    <Line text={topicSentence(runOverride)} className="text-destructive" />
                  ) : (
                    <>
                      <EntityRef
                        token="agent"
                        id={runOverride.holderId}
                        name={runOverride.holderName}
                        href={agentHref(runOverride.holderId, null)}
                        showIcon={false}
                        alwaysShowActions
                        className="min-w-0 shrink"
                      />
                      <Line text={topicSentence(runOverride)} className="text-xs text-muted-foreground" />
                    </>
                  )}
                  <Link href={runOverride.manageHref} className="shrink-0 text-xs text-primary hover:underline">
                    Manage
                  </Link>
                </div>
              </div>
            ) : null}

            <ol className="space-y-0.5 text-[12px]" aria-label="Mandate precedence">
              {RUNGS.map((rung) => {
                const entry = job.ladder.rows.find((item) => item.rung === rung);
                const winner = row.decidedRung === rung && !overriding;
                const state = job.rungState(rung) === "Active" && overriding ? "Under topic choice" : job.rungState(rung);
                return (
                  <li
                    key={rung}
                    title={entry?.dropped_reason ?? undefined}
                    className={cn(
                      "flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-1",
                      winner ? "bg-primary/10 font-medium text-primary" : entry?.dropped_reason ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    <span className="shrink-0">{RUNG_LABEL[rung]}</span>
                    <span className="min-w-0 truncate">{state}</span>
                  </li>
                );
              })}
            </ol>
            {job.ladder.error ? (
              <p className="min-w-0 truncate text-xs text-destructive" title={job.ladder.error}>
                Could not read the mandate layers: {job.ladder.error} <ErrorAlchemyMenu error={job.ladder.error} />
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
