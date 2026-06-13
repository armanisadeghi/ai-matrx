/**
 * Reports module registry — metadata-only, the way the feature admin map is.
 * The landing pages iterate this list; adding a report is one entry here plus
 * its route + component. Agent Drift is the first report; the module is built
 * around it so the next report (usage analytics, cost rollups, …) plugs in.
 */

export interface ReportDefinition {
  slug: string;
  title: string;
  description: string;
  /** shellIconMap-compatible Lucide icon name. */
  iconName: string;
  /** User-facing route. */
  href: string;
  /** Admin-scope route, when the report has a platform-wide variant. */
  adminHref?: string;
  status: "live" | "coming-soon";
}

export const REPORTS: ReportDefinition[] = [
  {
    slug: "agent-drift",
    title: "Agent Drift",
    description:
      "Every agent whose usages have drifted — breaking changes, silently-ignored context-slot settings, and stale version pins — across all your agents in one place.",
    iconName: "GitCompareArrows",
    href: "/reports/agent-drift",
    adminHref: "/administration/reports/agent-drift",
    status: "live",
  },
];

export function getReport(slug: string): ReportDefinition | undefined {
  return REPORTS.find((r) => r.slug === slug);
}
