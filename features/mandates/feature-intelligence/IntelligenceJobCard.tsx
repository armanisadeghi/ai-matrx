"use client";

// One job of the feature, as the person working there needs it: what it is,
// what runs it for them now (and who chose that), what it can use, what it
// makes, where it runs — and the two actions that are always there.

import Link from "next/link";
import {
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  RotateCcw,
  UserRoundCog,
  Workflow,
} from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { agentHref } from "../admin/mandate-health";
import { MemberHealthBadge } from "../member-list/columns";
import { MandateStatusControl } from "../status/MandateStatusControl";
import { useMandateInputSurface } from "../input-surface";
import { kindPhrase } from "../provision-shapes";
import { displayLabelForKey } from "@/features/agents/utils/variable-utils";
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

function decidedWords(row: FeatureIntelligenceRow, orgLevel: boolean): string {
  switch (row.decidedRung) {
    case "user":
      return "Your choice";
    case "org":
      return orgLevel ? "Your organization's choice" : `${row.decidedBy}'s choice`;
    case "system":
      return "Default";
    default:
      return "Not assigned";
  }
}

/**
 * An input as a person reads it: the provision's own label, else the name
 * humanized — never the raw `remaining_cards` / `organization_id`. A trailing
 * `_id` names a record, so it reads as that record ("Organization").
 */
export function inputDisplayLabel(input: { name: string; label?: string | null }): string {
  const explicit = input.label && input.label !== input.name ? input.label : null;
  if (explicit) return displayLabelForKey(input.name, explicit);
  const base = input.name.replace(/_ids?$/, "");
  return displayLabelForKey(base || input.name);
}

function Inputs({ mandateKey }: { mandateKey: string }) {
  const state = useMandateInputSurface(mandateKey);
  if (state.status === "loading") {
    return <span className="h-5 w-40 animate-pulse rounded bg-muted" aria-label="Reading inputs" />;
  }
  if (state.status === "error") {
    return <span className="text-xs text-muted-foreground">{state.message} <ErrorAlchemyMenu error={state.message} /></span>;
  }
  const { inputs, acceptsUserInput } = state.surface;
  if (inputs.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        {acceptsUserInput ? "Your text" : "No declared inputs"}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {inputs.map((input) => (
        <Tooltip key={input.name}>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex max-w-[14rem] items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[11px]",
                input.sourcing === "require"
                  ? "border-primary/30 bg-primary/5 text-foreground"
                  : "border-border bg-muted/40 text-muted-foreground",
              )}
            >
              {inputDisplayLabel(input)}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {input.help ? `${input.help} ` : ""}
            ({kindPhrase(input.kind)}
            {input.sourcing === "require" ? ", always given" : ""})
          </TooltipContent>
        </Tooltip>
      ))}
      {acceptsUserInput ? (
        <span className="inline-flex items-center rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
          + your text
        </span>
      ) : null}
    </div>
  );
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
  const where = places.filter((place) => place.mandateKeys.includes(row.mandateKey));
  const ladder = useMandateLadder(row.mandateKey, organizationId);
  /** A topic choice that actually changes what runs (not a dormant same-agent pin). */
  const overriding = Boolean(runOverride && !runOverride.matchesMandate);
  const ownRung = orgLevel ? "org" : "user";
  const hasSavedChoice = Boolean(ladder.rows.find((entry) => entry.rung === ownRung)?.binding_id);
  const canDuplicate =
    Boolean(row.holderId) && (row.holderType === "agent" || row.holderType === "workflow");
  const HolderIcon = row.holderType === "workflow" ? Workflow : AGENT_ICON;
  const about = row.description || row.goal?.split(/(?<=[.!?])\s+/)[0] || row.goal;

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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold leading-tight text-foreground">
              {row.shortName}
            </h3>
            {/* THE STATUS — draft vs active is never left to a guess. The
                person who made this job may change it here. */}
            <MandateStatusControl
              mandateId={row.id}
              name={row.shortName}
              status={row.status}
              canManage={!orgLevel && row.createdByMe && row.origin === "soft" && !row.isSystem}
              onSetHolder={onUseOwn}
              size="md"
            />
            {row.health !== "OK" ? <MemberHealthBadge health={row.health} /> : null}
            {!row.isSystem ? (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                {row.homeLabel}
              </Badge>
            ) : null}
            {/* The details door sits with the title, so it never wraps onto a
                row of its own under the action buttons on a phone. */}
            <Button size="sm" variant="ghost" asChild className="ml-auto h-7 w-7 p-0 lg:ml-0">
              <Link href={detailsHref} aria-label={`All settings for ${row.shortName}`}>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          {about ? (
            <p className="line-clamp-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {about}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {canDuplicate || runOverride ? (
            <Button size="sm" onClick={onDuplicate} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5" />
              )}
              {runOverride?.health === "unavailable" ? "Duplicate mandate choice" : "Duplicate & modify"}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={onUseOwn} disabled={busy}>
            <UserRoundCog className="mr-1.5 h-3.5 w-3.5" />
            Use my own
          </Button>
          {canReset || hasSavedChoice ? (
            <Button size="sm" variant="ghost" onClick={onReset} disabled={busy}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {resetLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3 text-[11px]" aria-label="Mandate precedence">
        {(["system", "org", "user"] as const satisfies readonly MandateRung[]).map((rung, index) => {
          const entry = ladder.rows.find((item) => item.rung === rung);
          const label = rung === "system" ? "System" : rung === "org" ? "Organization" : "You";
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
              <span className={cn(
                "rounded-full border px-2 py-0.5",
                isWinner && !overriding
                  ? "border-primary/40 bg-primary/5 font-medium text-primary"
                  : "border-border text-muted-foreground",
              )} title={entry?.dropped_reason ?? undefined}>
                {label}: {state}
              </span>
            </span>
          );
        })}
        {runOverride ? <span className={cn("rounded-full border px-2 py-0.5 font-medium", runOverride.health === "unavailable" ? "border-destructive/40 bg-destructive/5 text-destructive" : runOverride.health === "unknown" ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300" : "border-primary/40 bg-primary/5 text-primary")}>This topic: {runOverride.health === "unavailable" ? "Agent unavailable" : runOverride.health === "unknown" ? "Status unavailable" : runOverride.health === "checking" ? "Checking agent" : runOverride.matchesMandate ? "Same agent" : "Active"}</span> : null}
        {ladder.error ? <span className="text-destructive">Could not read the mandate layers: {ladder.error} <ErrorAlchemyMenu error={ladder.error} /></span> : null}
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-[7.5rem_1fr]">
        <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">{overriding ? "Mandate choice" : "Runs now"}</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <HolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {row.holderType === "agent" && row.holderId ? (
            <EntityRef
              token="agent"
              id={row.holderId}
              name={row.holderName}
              href={agentHref(row.holderId, null)}
              showIcon={false}
            />
          ) : row.holderType === "workflow" && row.holderId ? (
            <EntityRef token="workflow" id={row.holderId} name={row.holderName} showIcon={false} />
          ) : (
            <span className="text-muted-foreground">{row.holderName}</span>
          )}
          <span className="text-xs text-muted-foreground">
            {row.holderType === "workflow" ? "Workflow" : row.holderType === "agent" ? "Agent" : ""}
            {row.pinText && row.pinText !== "None" ? ` · ${row.pinText}` : ""}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "font-normal",
              row.decidedRung === "user" || (orgLevel && row.decidedRung === "org")
                ? "border-primary/40 text-primary"
                : "text-muted-foreground",
            )}
          >
            {decidedWords(row, orgLevel)}
          </Badge>
        </dd>

        {runOverride ? (
          <>
            <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">{runOverride.matchesMandate ? "Recorded on" : "Runs on"} {runOverride.contextLabel.toLowerCase()}</dt>
            <dd className="text-[13px]">
              {runOverride.health === "unavailable" ? <span className="text-destructive">The selected agent cannot be opened. Remove this topic choice to use the mandate assignment.</span> : <><EntityRef token="agent" id={runOverride.holderId} name={runOverride.holderName} showIcon={false} /><span className="text-muted-foreground"> — {runOverride.health === "unknown" ? "this topic choice is recorded, but its agent could not be checked." : runOverride.matchesMandate ? "the same agent the mandate picks today. If the mandate choice changes, this topic keeps running this agent until you remove the topic choice." : "this topic choice takes precedence over the mandate choice."} <ErrorAlchemyMenu /></span></>}{" "}
              <Link href={runOverride.manageHref} className="text-primary hover:underline">Manage topic choice</Link>
            </dd>
          </>
        ) : null}

        <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">Can use</dt>
        <dd className="min-w-0">
          <Inputs mandateKey={row.mandateKey} />
        </dd>

        <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">Makes</dt>
        <dd className="text-[13px] text-foreground">
          {row.outputKind ? kindPhrase(row.outputKind).replace(/^an? /, "") : "Text"}
        </dd>

        <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">Runs in</dt>
        <dd className="flex min-w-0 flex-wrap gap-1">
          {where.length === 0 ? (
            <span className="text-xs text-muted-foreground">Not recorded yet</span>
          ) : (
            where.map((place) => {
              const chip = (
                <>
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{place.label}</span>
                </>
              );
              const className =
                "inline-flex max-w-[16rem] items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]";
              return place.href ? (
                <Link
                  key={place.id}
                  href={place.href}
                  title={place.trigger}
                  className={cn(className, "border-border text-foreground hover:border-primary/50 hover:bg-primary/5")}
                >
                  {chip}
                </Link>
              ) : (
                <span
                  key={place.id}
                  title={place.trigger}
                  className={cn(className, "border-dashed border-border text-muted-foreground")}
                >
                  {chip}
                </span>
              );
            })
          )}
        </dd>
      </dl>
    </li>
  );
}
