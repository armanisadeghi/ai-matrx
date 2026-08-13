// features/agent-apps/format.ts
//
// Shared formatters + copy summaries for agent-apps surfaces. Centralizes:
//   - formatNumber / formatDateTime — previously duplicated across
//     agent-app-listings/AgentAppCard.tsx, route/AgentAppOverviewContent.tsx,
//     route/AgentAppVersionsContent.tsx, and the version snapshot page.
//   - humanAgentApp / appBrief — the `human` text used by <CopyButtons> on
//     rows/cards across the grid, admin table, panel, and dashboard.
//
// Any surface showing an app row/card should import from here rather than
// hand-rolling its own formatter or summary string.

import { visibilityLabelShort } from "@/lib/visibility/labels";

/** "1.2k" / "3m" style compact number, matching the app's existing style. */
export function formatNumber(n: number | null | undefined): string {
  if (!n || n <= 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

/** Locale date+time string, tolerant of bad/missing ISO input. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Minimal shape the summary builders need. `AgentAppCardModel`,
 * `AgentAppAdminView`, and `AgentAppSummary` (and the raw `AgentApp` record)
 * all satisfy this structurally — no explicit import/cast required at
 * callsites.
 */
export interface AppSummaryLike {
  id: string;
  name: string;
  slug: string;
  tagline?: string | null;
  description?: string | null;
  category?: string | null;
  status?: string;
  visibility?: string | null;
  is_featured?: boolean | null;
  is_verified?: boolean | null;
  total_executions?: number | null;
  success_rate?: number | null;
  updated_at?: string;
}

/** Multi-line human-readable summary of a single app — per-row/card copy. */
export function humanAgentApp(app: AppSummaryLike): string {
  const lines = [
    `${app.name} (${app.slug})`,
    app.tagline || null,
    [
      app.status ? `Status: ${app.status}` : null,
      app.visibility ? visibilityLabelShort(app.visibility) : null,
      app.is_featured ? "Featured" : null,
      app.is_verified ? "Verified" : null,
    ]
      .filter(Boolean)
      .join(" · "),
    app.category ? `Category: ${app.category}` : null,
    `Runs: ${formatNumber(app.total_executions)}${
      typeof app.success_rate === "number"
        ? ` · ${Math.round(app.success_rate * 100)}% success`
        : ""
    }`,
    app.description || null,
  ].filter(Boolean);
  return lines.join("\n");
}

/** One-line brief — used by compact "briefs" aiVariants on lists/tables. */
export function appBrief(app: AppSummaryLike): string {
  const bits = [
    app.name,
    `(${app.slug})`,
    app.status ? `— ${app.status}` : null,
    app.category ? `· ${app.category}` : null,
    `· ${formatNumber(app.total_executions)} runs`,
    typeof app.success_rate === "number"
      ? `· ${Math.round(app.success_rate * 100)}% success`
      : null,
  ].filter(Boolean);
  return bits.join(" ");
}
