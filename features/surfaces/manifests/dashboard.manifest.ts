/**
 * Surface manifest — Dashboard (`matrx-user/dashboard`).
 *
 * Drives `/dashboard` — the lean core hub (`features/dashboard`,
 * `DashboardClient`): a greeting, the user's engagement metrics
 * (`get_user_dashboard_metrics` RPC), a fixed "Start something" quick-action
 * row, the user's own pinned favorites, and the rotating Discover strip.
 *
 * This is a HUB, not an editor: there is no document, selection, or editable
 * content here. The values are the user's engagement picture (what they have
 * built so far) plus what the page is currently advertising (pins, quick
 * actions, the visible Discover window). Metric values are emitted only once
 * the RPC has resolved — a still-loading dashboard never reports zeros as if
 * they were real counts.
 *
 * Runtime emitter: `features/dashboard/components/DashboardClient.tsx`
 * (mounts `SurfaceRuntimeProvider` and assembles the scope at Run time via
 * `createDashboardScope`).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "engagement_metrics",
    label: "Engagement metrics",
    sortOrder: 100,
    description:
      "Per-user counts of what the user has built on the platform, from the dashboard metrics RPC.",
  },
  {
    key: "favorites",
    label: "Pinned favorites",
    sortOrder: 200,
    description:
      "The user's own pinned shortcuts shown in the Pinned grid (and the sidebar Favorites).",
  },
  {
    key: "quick_start",
    label: "Quick actions",
    sortOrder: 300,
    description:
      'The fixed "Start something" launcher row curated in dashboard.config.ts.',
  },
  {
    key: "discover",
    label: "Discover",
    sortOrder: 400,
    description:
      "The rotating strip of platform areas currently being spotlighted to the user.",
  },
];

/** Per-metric count value factory — 12 individual counts mirror the composite. */
function metricCount(
  name: string,
  label: string,
  what: string,
  sortOrder: number,
): SurfaceValue {
  return {
    name,
    label,
    description: `Count of ${what} owned by the user. Absent until the dashboard metrics RPC has resolved on this visit. Mirrors one key of the \`metrics\` composite.`,
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    autoContext: false, // redundant with the `metrics` composite — bindable-only
    sortOrder,
    group: "engagement_metrics",
  };
}

const surfaceSpecific: SurfaceValue[] = [
  // ── Engagement metrics ────────────────────────────────────────────────
  {
    name: "metrics",
    label: "Engagement metrics",
    description:
      "Composite of every per-user engagement count shown on the dashboard: { agents, conversations, knowledge_files, published_apps, notes, tasks, transcripts, scopes, shortcuts, research_reports, podcasts, messages }. Absent while the metrics RPC is still loading or has errored — never fabricated zeros.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 300,
    group: "engagement_metrics",
  },
  metricCount("agents_count", "Agents count", "the user's agents", 310),
  metricCount(
    "conversations_count",
    "Conversations count",
    "the user's conversations",
    312,
  ),
  metricCount(
    "knowledge_files_count",
    "Knowledge files count",
    "the user's knowledge files",
    314,
  ),
  metricCount(
    "published_apps_count",
    "Published apps count",
    "the user's published agent apps",
    316,
  ),
  metricCount("notes_count", "Notes count", "the user's notes", 318),
  metricCount("tasks_count", "Tasks count", "the user's tasks", 320),
  metricCount(
    "transcripts_count",
    "Transcripts count",
    "the user's transcripts",
    322,
  ),
  metricCount("scopes_count", "Scopes count", "the user's scopes", 324),
  metricCount(
    "shortcuts_count",
    "Shortcuts count",
    "the user's agent shortcuts",
    326,
  ),
  metricCount(
    "research_reports_count",
    "Research reports count",
    "the user's research reports",
    328,
  ),
  metricCount("podcasts_count", "Podcasts count", "the user's podcasts", 330),
  metricCount("messages_count", "Messages count", "the user's messages", 332),

  // ── Pinned favorites ──────────────────────────────────────────────────
  {
    name: "pinned_items",
    label: "Pinned items",
    description:
      "The user's pinned favorites as shown in the Pinned grid, in display order: one entry per pin with { id, kind, label, href }. Always populated — empty array when the user has pinned nothing.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 500,
    sortOrder: 400,
    group: "favorites",
  },
  {
    name: "pinned_count",
    label: "Pinned count",
    description:
      "Number of items the user has pinned. Always populated — zero when nothing is pinned.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 410,
    group: "favorites",
  },

  // ── Quick actions ─────────────────────────────────────────────────────
  {
    name: "quick_actions",
    label: "Quick actions",
    description:
      'The fixed "Start something" launcher row: one entry per action with { label, href }. Always populated (curated in code, not per-user). Bindable-only — static chrome, low signal for automatic context.',
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 350,
    autoContext: false,
    sortOrder: 500,
    group: "quick_start",
  },

  // ── Discover ──────────────────────────────────────────────────────────
  {
    name: "discover_items",
    label: "Discover items",
    description:
      "The Discover cards currently visible in the rotating strip (the window changes per day/visit and on Show more): one entry per card with { label, href, description }. Always populated — empty array only if the Discover pool is empty.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 900,
    autoContext: false,
    sortOrder: 600,
    group: "discover",
  },
];

export const dashboardManifest: SurfaceManifest = {
  surfaceName: "matrx-user/dashboard",
  readiness: "verified",
  label: "Dashboard",
  urlPattern: "/dashboard",
  intro: `<surface_intro>
You are on the Dashboard: the user's home hub — not an editor. There is no document or selection here; the page shows the user's engagement picture and jumping-off points.
The Engagement metrics group is the truth about what the user has built (agents, conversations, notes, …). The metrics composite is absent while still loading — never treat missing metrics as zeros.
pinned_items are the shortcuts the USER chose to keep close — they signal what the user cares about. quick_actions and discover_items are platform-curated chrome: what the page is advertising, not what the user has done.
Useful agent work here is orientation and momentum: interpreting the metrics, suggesting next steps, or guiding the user to the right area of the platform.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
};

/** One pinned favorite as emitted in `pinned_items`. */
export interface DashboardPinnedEntry {
  id: string;
  kind: string;
  label: string;
  href: string;
}

/** One quick action as emitted in `quick_actions`. */
export interface DashboardQuickActionEntry {
  label: string;
  href: string;
}

/** One Discover card as emitted in `discover_items`. */
export interface DashboardDiscoverEntry {
  label: string;
  href: string;
  description: string;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createDashboardScope(values: {
  // alwaysAvailable: true → required
  pinned_items: DashboardPinnedEntry[];
  pinned_count: number;
  quick_actions: DashboardQuickActionEntry[];
  discover_items: DashboardDiscoverEntry[];
  // alwaysAvailable: false → optional (absent while the metrics RPC loads)
  metrics?: Record<string, number>;
  agents_count?: number;
  conversations_count?: number;
  knowledge_files_count?: number;
  published_apps_count?: number;
  notes_count?: number;
  tasks_count?: number;
  transcripts_count?: number;
  scopes_count?: number;
  shortcuts_count?: number;
  research_reports_count?: number;
  podcasts_count?: number;
  messages_count?: number;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
