/**
 * features/files/storage-meter/OrgStorageMeter.tsx
 *
 * The storage meter for ONE organization, with billing as its only source.
 *
 * Every state is honest (law 4): a plan that could not be read says so and
 * offers Retry; an unmeasured ledger draws no bar; an over-quota account says
 * by how much and where to fix it. There is no state in which this component
 * shows a number it did not get from `billing.resolve_capability`.
 */

"use client";

import Link from "next/link";
import { AlertTriangle, Gauge, HardDrive, RefreshCw } from "lucide-react";
import { Button } from "@ai-matrx/design-system";

import { cn } from "@/lib/utils";

import { PLAN_PAGE_HREF } from "./summary";
import { useOrgStorageMeter } from "./useOrgStorageMeter";

export interface OrgStorageMeterProps {
  /** The organization that owns the files this meter describes. */
  organizationId: string | null;
  /** Shown when the surface lists more than one organization's storage. */
  organizationLabel?: string | null;
  className?: string;
}

export function OrgStorageMeter({
  organizationId,
  organizationLabel,
  className,
}: OrgStorageMeterProps) {
  const { meter, loading, refresh } = useOrgStorageMeter(organizationId);

  if (!organizationId)
    return (
      <div
        className={cn(
          "rounded-md border border-border bg-card/40 px-2.5 py-2 text-[11px] text-muted-foreground",
          className,
        )}
        role="status"
      >
        No organization owns a synced folder yet, so there is no storage plan to
        show.
      </div>
    );

  if (meter.kind === "loading")
    return (
      <div
        className={cn(
          "rounded-md border border-border bg-card/40 px-2.5 py-2 text-[11px] text-muted-foreground",
          className,
        )}
        role="status"
      >
        Reading this organization&rsquo;s storage plan…
      </div>
    );

  if (meter.kind === "unreadable")
    return (
      <div
        className={cn(
          "flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-[11px]",
          className,
        )}
        role="status"
      >
        <span className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {meter.title}
        </span>
        <span className="text-muted-foreground">{meter.detail}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-fit px-1.5 text-[11px]"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw
            className={cn("h-3 w-3", loading && "animate-spin")}
            aria-hidden="true"
          />
          <span className="ml-1">Try again</span>
        </Button>
      </div>
    );

  const barClass =
    meter.severity === "over" || meter.severity === "critical"
      ? "bg-destructive"
      : meter.severity === "warning"
        ? "bg-amber-500"
        : "bg-primary";

  const TitleIcon =
    meter.severity === "over"
      ? AlertTriangle
      : meter.severity === "unmeasured"
        ? Gauge
        : HardDrive;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md border bg-card/40 px-2.5 py-2 text-[12px]",
        meter.severity === "over" && "border-destructive/40 bg-destructive/5",
        className,
      )}
      role="status"
      aria-label={
        meter.planName
          ? `${meter.planName} plan storage: ${meter.headline}`
          : `Storage: ${meter.headline}`
      }
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-foreground/90">
          <TitleIcon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              meter.severity === "over"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
          <span className="truncate font-medium">
            {meter.planName ?? "No plan on file"}
          </span>
        </span>
        {meter.percent !== null ? (
          <span
            className={cn(
              "tabular-nums text-[11px]",
              meter.severity === "over" || meter.severity === "critical"
                ? "text-destructive"
                : meter.severity === "warning"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground",
            )}
          >
            {meter.percent}%
          </span>
        ) : null}
      </div>

      {meter.fraction !== null ? (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          aria-hidden="true"
        >
          <div
            className={cn("h-full rounded-full transition-all", barClass)}
            style={{ width: `${Math.max(meter.fraction * 100, 2)}%` }}
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{meter.headline}</span>
        {meter.offerMoreStorage ? (
          <Link
            href={PLAN_PAGE_HREF}
            className="shrink-0 font-medium text-destructive underline underline-offset-2 hover:opacity-80"
          >
            Get more storage
          </Link>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground">{meter.detail}</p>
      {meter.grain ? (
        <p className="text-[11px] text-muted-foreground/80">
          {organizationLabel ? `${organizationLabel} · ` : ""}
          {meter.grain}
        </p>
      ) : null}
    </div>
  );
}
