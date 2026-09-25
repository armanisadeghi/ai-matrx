"use client";

// One job of the feature, as the person working there needs it: what it is,
// what runs it for them now (and who chose that), what it can use, what it
// makes, where it runs — and the two actions that are always there.

import Link from "next/link";
import {
  BrainCircuit,
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  RotateCcw,
  UserRoundCog,
  Workflow,
} from "lucide-react";
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
import { useMandateInputSurface } from "../input-surface";
import { kindPhrase } from "../provision-shapes";
import type { FeatureIntelligenceRow, ResolvedPlace } from "./types";

export interface RunOverride {
  /** The name of what runs instead, for this context only. */
  holderName: string;
  /** Where that choice is managed. */
  manageHref: string;
  /** "This topic". */
  contextLabel: string;
}

function decidedWords(row: FeatureIntelligenceRow, orgLevel: boolean): string {
  switch (row.decidedRung) {
    case "user":
      return "Your choice";
    case "org":
      return orgLevel ? "Your organization's choice" : `${row.decidedBy}'s choice`;
    case "system":
    case "global":
      return "Default";
    default:
      return "Not assigned";
  }
}

function Inputs({ mandateKey }: { mandateKey: string }) {
  const state = useMandateInputSurface(mandateKey);
  if (state.status === "loading") {
    return <span className="h-5 w-40 animate-pulse rounded bg-muted" aria-label="Reading inputs" />;
  }
  if (state.status === "error") {
    return <span className="text-xs text-muted-foreground">{state.message}</span>;
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
              {input.label || input.name}
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
  busy,
  canReset,
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
  busy: boolean;
  canReset: boolean;
  detailsHref: string;
  runOverride: RunOverride | null;
  onHover: (key: string | null) => void;
  onDuplicate: () => void;
  onUseOwn: () => void;
  onReset: () => void;
}) {
  const where = places.filter((place) => place.mandateKeys.includes(row.mandateKey));
  const canDuplicate =
    Boolean(row.holderId) && (row.holderType === "agent" || row.holderType === "workflow");
  const HolderIcon = row.holderType === "workflow" ? Workflow : BrainCircuit;
  const about = row.goal ?? row.description;

  return (
    <li
      id={`intelligence-${row.mandateKey}`}
      data-mandate-key={row.mandateKey}
      onMouseEnter={() => onHover(row.mandateKey)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(row.mandateKey)}
      className={cn(
        "scroll-mt-24 rounded-xl border bg-card p-3.5 transition-colors sm:p-4",
        focused ? "border-primary/60 ring-2 ring-primary/20" : "border-border",
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold leading-tight text-foreground">
              {row.shortName}
            </h3>
            {row.health !== "OK" ? <MemberHealthBadge health={row.health} /> : null}
            {!row.isSystem ? (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                {row.homeLabel}
              </Badge>
            ) : null}
          </div>
          {about ? (
            <p className="line-clamp-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {about}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {canDuplicate ? (
            <Button size="sm" onClick={onDuplicate} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5" />
              )}
              Duplicate &amp; modify
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={onUseOwn} disabled={busy}>
            <UserRoundCog className="mr-1.5 h-3.5 w-3.5" />
            Use my own
          </Button>
          {canReset ? (
            <Button size="sm" variant="ghost" onClick={onReset} disabled={busy}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset to default
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" asChild>
            <Link href={detailsHref} aria-label={`All settings for ${row.shortName}`}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-[7.5rem_1fr]">
        <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">Runs now</dt>
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
            <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">
              {runOverride.contextLabel}
            </dt>
            <dd className="text-[13px]">
              Uses <span className="font-medium">{runOverride.holderName}</span> here, ahead of
              the choice above.{" "}
              <Link href={runOverride.manageHref} className="text-primary hover:underline">
                Change it
              </Link>
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
