"use client";

import { ComingSoonBadge } from "@/components/coming-soon/ComingSoonBadge";
import AppLink from "@/components/navigation/AppLink";
import { Badge } from "@/components/ui/badge";
import ShellIcon from "@/features/shell/components/ShellIcon";
import { iconColorMap } from "@/features/shell/constants/nav-data";
import type { ShellIconName } from "@/features/shell/shellIconMap";
import { cn } from "@/lib/utils";

export interface MetricNavigationItem {
  key: string;
  label: string;
  href: string;
  iconName: ShellIconName;
  color?: string;
  /** Omit when this destination has no honest metric. */
  value?: number | string;
  /** Describes the metric value, independently from destination availability. */
  state?: "ready" | "loading" | "unavailable";
  /** A concise explanation of the count's scope. */
  description?: string;
  external?: boolean;
  /** A destination can be visibly unavailable without making its count unknown. */
  availability?: "ready" | "coming-soon" | "unavailable";
}

export interface MetricNavigationProps {
  /** Accessible name for this compact navigation group. */
  label: string;
  items: readonly MetricNavigationItem[];
  className?: string;
}

function formatValue(value: number | string): string {
  return typeof value === "number" ? value.toLocaleString() : value;
}

function availabilityBadge(
  availability: MetricNavigationItem["availability"],
) {
  if (availability === "coming-soon") return <ComingSoonBadge />;
  if (availability === "unavailable") {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        Unavailable
      </Badge>
    );
  }
  return null;
}

/**
 * Compact, touch-safe links for a module's real destinations and optional live
 * metrics. Callers own reads, access filtering, count semantics, and routes.
 */
export function MetricNavigation({
  label,
  items,
  className,
}: MetricNavigationProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        "grid max-w-full grid-flow-col auto-cols-max grid-rows-2 gap-2 overflow-x-auto pb-1 sm:flex sm:flex-wrap sm:overflow-visible sm:pb-0",
        className,
      )}
    >
      {items.map((item) => {
        const state = item.state ?? "ready";
        const metricDescription =
          state === "unavailable" ? "Count unavailable" : item.description;
        const accessibleLabel = [
          item.label,
          state === "ready" ? item.value : undefined,
          metricDescription,
        ]
          .filter((part): part is string | number => part !== undefined)
          .join(", ");

        return (
          <AppLink
            key={item.key}
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener noreferrer" : undefined}
            title={metricDescription}
            aria-label={accessibleLabel}
            data-surface-value={
              item.value !== undefined ? `${item.key}_count` : undefined
            }
            className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                iconColorMap[item.color ?? "slate"] ?? iconColorMap.slate,
              )}
            >
              <ShellIcon name={item.iconName} size={12} strokeWidth={2} />
            </span>
            {state === "loading" ? (
              <span
                aria-label="Loading count"
                className="h-4 w-6 shrink-0 animate-pulse rounded bg-muted"
              />
            ) : state === "unavailable" ? (
              <span className="text-xs text-muted-foreground">Count unavailable</span>
            ) : item.value !== undefined ? (
              <span className="font-semibold tabular-nums text-foreground">
                {formatValue(item.value)}
              </span>
            ) : null}
            <span className="min-w-0 break-words text-muted-foreground">
              {item.label}
            </span>
            {availabilityBadge(item.availability ?? "ready")}
          </AppLink>
        );
      })}
    </section>
  );
}
