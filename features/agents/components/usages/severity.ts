/**
 * Drift severity presentation — the single source of truth for how every
 * surface (find-usages window, drift report, agents-page banner, DM chips)
 * renders a severity. Pure TS, no React, so the messaging chip registry can
 * import it without a component-graph cycle.
 *
 * Two amber tiers (silent_breaking, warning) share the `warning` hue and are
 * disambiguated by icon + fill — silent_breaking is the dangerous-sneaky one
 * (filled), warning is the loud-but-safe stale pin (outline).
 */

import {
  Info,
  OctagonAlert,
  EyeOff,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { DriftSeverity } from "@/features/agents/redux/usages/usages.types";

/** Worst → least. Drives sort order and badge ordering everywhere. */
export const DRIFT_SEVERITY_ORDER: DriftSeverity[] = [
  "breaking",
  "silent_breaking",
  "warning",
  "info",
];

export interface DriftSeverityMeta {
  label: string;
  /** One-line plain-English explanation for tooltips / empty states. */
  description: string;
  icon: LucideIcon;
  textClass: string;
  bgClass: string;
  borderClass: string;
  /** Composed pill classes for <DriftSeverityBadge>. */
  badgeClass: string;
}

export const DRIFT_SEVERITY_META: Record<DriftSeverity, DriftSeverityMeta> = {
  breaking: {
    label: "Breaking",
    description:
      "A variable the usage relies on is gone, a required variable is unmet, or the agent was disabled. This usage will fail.",
    icon: OctagonAlert,
    textClass: "text-destructive",
    bgClass: "bg-destructive/10",
    borderClass: "border-destructive/30",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/30",
  },
  silent_breaking: {
    label: "Silent break",
    description:
      "A context slot was renamed. The value is still injected, but as plain default context — the slot's rules are silently ignored.",
    icon: EyeOff,
    textClass: "text-warning",
    bgClass: "bg-warning/15",
    borderClass: "border-warning/40",
    badgeClass: "bg-warning/15 text-warning border-warning/40",
  },
  warning: {
    label: "Stale pin",
    description:
      "Pinned to a version older than the agent's active version. It still runs the old snapshot — it just won't get updates.",
    icon: TriangleAlert,
    textClass: "text-warning",
    bgClass: "bg-warning/5",
    borderClass: "border-warning/20",
    badgeClass: "bg-warning/5 text-warning border-warning/25",
  },
  info: {
    label: "Info",
    description:
      "Pinned older, but only instructions/model/settings changed — the variable and slot contract is unchanged.",
    icon: Info,
    textClass: "text-muted-foreground",
    bgClass: "bg-muted/40",
    borderClass: "border-border",
    badgeClass: "bg-muted/50 text-muted-foreground border-border",
  },
};

/** The worst severity in a set of findings, or null when there are none. */
export function worstSeverity(
  findings: ReadonlyArray<{ severity: DriftSeverity }>,
): DriftSeverity | null {
  for (const sev of DRIFT_SEVERITY_ORDER) {
    if (findings.some((f) => f.severity === sev)) return sev;
  }
  return null;
}

/** Sum a list of per-severity count maps into one. */
export function sumSeverityCounts(
  maps: ReadonlyArray<Partial<Record<DriftSeverity, number>>>,
): Record<DriftSeverity, number> {
  const out: Record<DriftSeverity, number> = {
    breaking: 0,
    silent_breaking: 0,
    warning: 0,
    info: 0,
  };
  for (const m of maps) {
    for (const sev of DRIFT_SEVERITY_ORDER) out[sev] += m[sev] ?? 0;
  }
  return out;
}

/** Worst severity with a non-zero count. Pass `skip` to ignore tiers (e.g. info-only drift stays neutral). */
export function worstSeverityFromCounts(
  counts: Partial<Record<DriftSeverity, number>>,
  skip: ReadonlySet<DriftSeverity> = new Set(),
): DriftSeverity | null {
  for (const sev of DRIFT_SEVERITY_ORDER) {
    if (skip.has(sev)) continue;
    if ((counts[sev] ?? 0) > 0) return sev;
  }
  return null;
}
