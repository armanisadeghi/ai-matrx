/**
 * Surface manifest — Assists Manager (`matrx-user/assists`).
 *
 * `/assists`: the user's inbox of one-click AI assists (`platform.assists`,
 * `features/assists/**`) — what producers have proposed, what the user snoozed,
 * starred, or dismissed, and which sources they have silenced.
 *
 * Declared 2026-08-17: the assists inbox had no surface declaration at all,
 * even though assists are the platform's own AI-suggestion primitive.
 *
 * THE INTENTIONAL-ACTION LAW still governs: an assist never runs from this
 * surface's values — only the user's click on the verb-labeled button executes.
 *
 * Curated groups (band 0-899):
 *   inbox_view   Which slice of the inbox is on screen
 *   inbox_state  Counts and suppressions
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
    key: "inbox_view",
    label: "Inbox view",
    sortOrder: 100,
    description: "Which slice of the assists inbox the user is looking at.",
  },
  {
    key: "inbox_state",
    label: "Inbox state",
    sortOrder: 200,
    description: "How much is waiting, and what the user has silenced.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "assist_status_tab",
    label: "Status tab",
    description:
      'Which status tab is open — "pending" by default, plus the accepted/dismissed/expired slices. Always populated.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 100,
    group: "inbox_view",
  },
  {
    name: "assist_urgency_filter",
    label: "Urgency filter",
    description:
      "Urgency the list is filtered to. Empty when the user is looking at every urgency.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 110,
    group: "inbox_view",
  },
  {
    name: "assist_view_flags",
    label: "View flags",
    description:
      "The inbox toggles as one object: { include_snoozed, starred_only, unseen_only, show_silenced }. Always populated — all false by default.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 120,
    sortOrder: 120,
    group: "inbox_view",
  },
  {
    name: "assist_total_count",
    label: "Total matching assists",
    description:
      "How many assists match the current tab and filters, server-side — not just the visible page. Always populated; zero on an empty inbox.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 200,
    group: "inbox_state",
  },
  {
    name: "visible_assists_summary",
    label: "Visible assists",
    description:
      "One entry per assist on the current page with { id, title, urgency, status, source }. Always populated — empty array when nothing matches. Bindable-only; an agent that needs one opens it by id.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1800,
    autoContext: false,
    sortOrder: 210,
    group: "inbox_state",
  },
  {
    name: "silenced_sources",
    label: "Silenced sources",
    description:
      "Producer sources the user has suppressed. Always populated — empty array when nothing is silenced. An agent must not propose reviving a source the user deliberately silenced without saying so.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 220,
    group: "inbox_state",
  },
];

export const assistsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/assists",
  readiness: "stub",
  readinessNote:
    "Vocabulary declared 2026-08-17 to close the undeclared /assists inbox. Not yet audited against the manager's full table state, and no runtime emitter is wired.",
  label: "Assists",
  urlPattern: "/assists",
  intro: `<surface_intro>
You are on the Assists inbox: the user's queue of one-click AI assists that producers across the platform have proposed for them. Each assist is an offer, not an action.
assist_status_tab plus assist_view_flags describe which slice they are looking at; assist_total_count is the true server-side match count, not the page size.
Nothing here executes on your say-so — an assist runs only when the user presses its own verb-labeled button. Treat silenced_sources as a decision the user already made.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** One entry as emitted in `visible_assists_summary`. */
export interface AssistSummaryEntry {
  id: string;
  title: string;
  urgency: string | null;
  status: string;
  source: string | null;
}

/** Type-safe payload helper — required keys mirror `alwaysAvailable: true`. */
export function createAssistsScope(values: {
  assist_status_tab: string;
  assist_view_flags: {
    include_snoozed: boolean;
    starred_only: boolean;
    unseen_only: boolean;
    show_silenced: boolean;
  };
  assist_total_count: number;
  visible_assists_summary: AssistSummaryEntry[];
  silenced_sources: string[];
  selection?: string;
  context?: Record<string, unknown>;
  assist_urgency_filter?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
