"use client";

// features/mandates/feature-intelligence/card-options/parts.tsx
//
// The shared, REAL pieces every card option on /intelligence/card-options is
// built from (Arman, 2026-09-26: "10 card options … real data, real working
// controls"). One job model per mandate (`useJob`) and small parts that render
// it; the options differ only in layout. Nothing here is a mockup: the peeks,
// new-tab doors, ladder, inputs, output, places and the three actions are the
// live ones the Intelligence page uses.

import Link from "next/link";
import { Copy, Loader2, MapPin, RotateCcw, UserRoundCog, Workflow } from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { NewTabLink } from "@/components/official/entity-ref/NewTabLink";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { agentHref } from "../../admin/mandate-health";
import { useMandateInputSurface } from "../../input-surface";
import { kindPhrase } from "../../provision-shapes";
import { MandatePeekButton } from "../../peek/MandatePeek";
import { inputDisplayLabel } from "../../peek/input-label";
import { MandateStatusBadge } from "../../status/MandateStatusBadge";
import { useMandateLadder, type MandateRung } from "../../workspace/useMandateLadder";
import type { FeatureIntelligenceRow, ResolvedPlace } from "../types";

export interface JobContext {
  places: readonly ResolvedPlace[];
  orgLevel: boolean;
  organizationId: string | null;
  organizationName: string | null;
  busy: boolean;
  detailsHref: string;
  onDuplicate: () => void;
  onUseOwn: () => void;
  onReset: () => void;
}

export const RUNGS = ["system", "org", "user"] as const satisfies readonly MandateRung[];
export const RUNG_LABEL: Record<MandateRung, string> = {
  system: "System",
  org: "Organization",
  user: "You",
};

export function decidedWords(row: FeatureIntelligenceRow, orgLevel: boolean): string {
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

/** Everything one option needs about one mandate, from the live sources. */
export function useJob(row: FeatureIntelligenceRow, ctx: JobContext) {
  const ladder = useMandateLadder(row.mandateKey, ctx.organizationId);
  const ownRung = ctx.orgLevel ? "org" : "user";
  const hasSavedChoice = Boolean(ladder.rows.find((entry) => entry.rung === ownRung)?.binding_id);
  const canReset = hasSavedChoice || row.decidedRung === ownRung;
  const canDuplicate =
    Boolean(row.holderId) && (row.holderType === "agent" || row.holderType === "workflow");
  const where = ctx.places.filter((place) => place.mandateKeys.includes(row.mandateKey));
  const about = row.description || row.goal?.split(/(?<=[.!?])\s+/)[0] || row.goal;
  const rungState = (rung: MandateRung): string => {
    const entry = ladder.rows.find((item) => item.rung === rung);
    if (ladder.loading) return "Checking";
    if (ladder.error) return "Unavailable";
    if (entry?.dropped_reason) return "Needs attention";
    if (entry?.chose_holder) return row.decidedRung === rung ? "Active" : "Set";
    return "No choice";
  };
  return {
    ladder,
    rungState,
    canReset,
    canDuplicate,
    where,
    about,
    resetLabel: ctx.orgLevel ? "Remove organization choice" : "Remove my choice",
    useOwnLabel: ctx.orgLevel ? `Use this for ${ctx.organizationName ?? "your organization"}` : "Use my own",
  };
}
export type Job = ReturnType<typeof useJob>;

/** Name + status + Lightbulb (Mandate Peek) + new-tab door. */
export function MandateTitle({
  row,
  ctx,
  className,
  size = "md",
}: {
  row: FeatureIntelligenceRow;
  ctx: JobContext;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <h3
        className={cn(
          "min-w-0 truncate font-semibold leading-tight text-foreground",
          size === "lg" ? "text-[17px]" : size === "sm" ? "text-[13px]" : "text-[15px]",
        )}
      >
        {row.shortName}
      </h3>
      <MandatePeekButton mandate={row.id} name={row.shortName} href={ctx.detailsHref} />
      <NewTabLink href={ctx.detailsHref} label={row.shortName} />
      <MandateStatusBadge status={row.status} size="sm" className="ml-1" />
    </div>
  );
}

/** The agent or workflow filling it, with its peek and new-tab door. */
export function HolderRef({ row, className }: { row: FeatureIntelligenceRow; className?: string }) {
  const Icon = row.holderType === "workflow" ? Workflow : AGENT_ICON;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {row.holderType === "agent" && row.holderId ? (
        <EntityRef
          token="agent"
          id={row.holderId}
          name={row.holderName}
          href={agentHref(row.holderId, null)}
          showIcon={false}
          alwaysShowActions
          labelClassName="font-medium"
        />
      ) : row.holderType === "workflow" && row.holderId ? (
        <EntityRef
          token="workflow"
          id={row.holderId}
          name={row.holderName}
          showIcon={false}
          alwaysShowActions
          labelClassName="font-medium"
        />
      ) : (
        <span className="text-muted-foreground">{row.holderName}</span>
      )}
    </span>
  );
}

export function HolderMeta({ row, ctx, badge = true }: { row: FeatureIntelligenceRow; ctx: JobContext; badge?: boolean }) {
  return (
    <>
      <span className="text-xs text-muted-foreground">
        {row.holderType === "workflow" ? "Workflow" : row.holderType === "agent" ? "Agent" : ""}
        {row.pinText && row.pinText !== "None" ? ` · ${row.pinText}` : ""}
      </span>
      {badge ? (
        <Badge
          variant="outline"
          className={cn(
            "font-normal",
            row.decidedRung === "user" || (ctx.orgLevel && row.decidedRung === "org")
              ? "border-primary/40 text-primary"
              : "text-muted-foreground",
          )}
        >
          {decidedWords(row, ctx.orgLevel)}
        </Badge>
      ) : null}
    </>
  );
}

/** Duplicate & modify · Use my own · Reset — the live actions. */
export function Actions({
  row,
  ctx,
  job,
  size = "sm",
  compact = false,
  className,
}: {
  row: FeatureIntelligenceRow;
  ctx: JobContext;
  job: Job;
  size?: "sm" | "xs";
  compact?: boolean;
  className?: string;
}) {
  const h = size === "xs" ? "h-7 px-2 text-xs" : undefined;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {job.canDuplicate ? (
        <Button size="sm" className={h} onClick={ctx.onDuplicate} disabled={ctx.busy}>
          {ctx.busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          Duplicate &amp; modify
        </Button>
      ) : null}
      <Button size="sm" variant="outline" className={h} onClick={ctx.onUseOwn} disabled={ctx.busy}>
        <UserRoundCog className="mr-1.5 h-3.5 w-3.5" />
        {job.useOwnLabel}
      </Button>
      {job.canReset ? (
        <Button size="sm" variant="ghost" className={h} onClick={ctx.onReset} disabled={ctx.busy}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          {compact ? "Reset" : job.resetLabel}
        </Button>
      ) : null}
    </span>
  );
}

/** System → Organization → You, as chips. */
export function LadderChips({ row, job, className }: { row: FeatureIntelligenceRow; job: Job; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-[11px]", className)} aria-label="Mandate precedence">
      {RUNGS.map((rung, index) => {
        const isWinner = row.decidedRung === rung;
        const entry = job.ladder.rows.find((item) => item.rung === rung);
        return (
          <span key={rung} className="inline-flex items-center gap-1.5">
            {index > 0 ? <span className="text-muted-foreground/50" aria-hidden>→</span> : null}
            <span
              className={cn(
                "rounded-full border px-2 py-0.5",
                isWinner
                  ? "border-primary/40 bg-primary/5 font-medium text-primary"
                  : "border-border text-muted-foreground",
              )}
              title={entry?.dropped_reason ?? undefined}
            >
              {RUNG_LABEL[rung]}: {job.rungState(rung)}
            </span>
          </span>
        );
      })}
      {job.ladder.error ? (
        <span className="text-destructive">
          {job.ladder.error} <ErrorAlchemyMenu error={job.ladder.error} />
        </span>
      ) : null}
    </div>
  );
}

/** Inputs — the served input surface, in plain words. */
export function InputChips({ mandateKey, className }: { mandateKey: string; className?: string }) {
  const state = useMandateInputSurface(mandateKey);
  if (state.status === "loading") {
    return <span className="inline-block h-5 w-40 animate-pulse rounded bg-muted" aria-label="Reading inputs" />;
  }
  if (state.status === "error") {
    return (
      <span className="text-xs text-muted-foreground">
        {state.message} <ErrorAlchemyMenu error={state.message} />
      </span>
    );
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
    <div className={cn("flex flex-wrap gap-1", className)}>
      {inputs.map((input) => (
        <span
          key={input.name}
          title={input.help || undefined}
          className={cn(
            "inline-flex max-w-[14rem] items-center truncate rounded-md border px-1.5 py-0.5 text-[11px]",
            input.sourcing === "require"
              ? "border-primary/30 bg-primary/5 text-foreground"
              : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          {inputDisplayLabel(input)}
        </span>
      ))}
      {acceptsUserInput ? (
        <span className="inline-flex items-center rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
          + your text
        </span>
      ) : null}
    </div>
  );
}

export function makesWords(row: FeatureIntelligenceRow): string {
  return row.outputKind ? kindPhrase(row.outputKind).replace(/^an? /, "") : "Text";
}

/** Where it runs — each place links to its screen when the page is known. */
export function PlaceChips({ places, className }: { places: readonly ResolvedPlace[]; className?: string }) {
  if (places.length === 0) {
    return <span className="text-xs text-muted-foreground">Not recorded yet</span>;
  }
  return (
    <div className={cn("flex min-w-0 flex-wrap gap-1", className)}>
      {places.map((place) => {
        const chip = (
          <>
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{place.label}</span>
          </>
        );
        const base = "inline-flex max-w-[16rem] items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]";
        return place.href ? (
          <Link
            key={place.id}
            href={place.href}
            title={place.trigger}
            className={cn(base, "border-border text-foreground hover:border-primary/50 hover:bg-primary/5")}
          >
            {chip}
          </Link>
        ) : (
          <span key={place.id} title={place.trigger} className={cn(base, "border-dashed border-border text-muted-foreground")}>
            {chip}
          </span>
        );
      })}
    </div>
  );
}
