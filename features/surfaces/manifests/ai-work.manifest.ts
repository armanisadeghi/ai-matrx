/**
 * Surface manifest — AI Work Hub (`matrx-user/ai-work`).
 *
 * The hub half of the AI Work feature (`features/ai-work/**`): the truthful
 * directory at `/work`, the caller's Saved Requests at `/work/requests`, and
 * the provider/connection facts at `/work/connections`. Composing a NEW run is
 * its own surface (`matrx-user/ai-work-composer`), and browsing conversations
 * is a third (`matrx-user/ai-work-conversations`) — different agents belong in
 * each.
 *
 * Declared 2026-08-17: `/work/**` was an entire Tier-1 route family with no
 * surface declaration of any kind.
 *
 * Curated groups (band 0-899):
 *   work_route     Which hub route the user is on
 *   saved_requests The caller's own saved requests
 *   connections    Provider/runtime availability facts
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
    key: "work_route",
    label: "Hub route",
    sortOrder: 100,
    description: "Which of the AI Work hub routes the user is currently on.",
  },
  {
    key: "saved_requests",
    label: "Saved requests",
    sortOrder: 200,
    description:
      "The caller's own reusable requests, as listed on `/work/requests`.",
  },
  {
    key: "connections",
    label: "Connections",
    sortOrder: 300,
    description:
      "Which execution destinations are actually available to this user right now.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "work_route",
    label: "Hub route",
    description:
      '"overview" on `/work`, "requests" on `/work/requests`, "connections" on `/work/connections". Tells an agent which part of the hub the user is looking at.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 100,
    group: "work_route",
  },
  {
    name: "saved_request_count",
    label: "Saved request count",
    description:
      "How many Saved Requests the caller owns. Always populated on `/work/requests` and zero before any are saved; zero on the other hub routes, which do not load the list.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 200,
    group: "saved_requests",
  },
  {
    name: "saved_requests_summary",
    label: "Saved requests summary",
    description:
      "One entry per Saved Request with { id, label, destination }, newest first. Populated only on `/work/requests`; absent elsewhere. Bindable-only — an agent that needs one can open it by id.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    autoContext: false,
    sortOrder: 210,
    group: "saved_requests",
  },
  {
    name: "available_destinations",
    label: "Available destinations",
    description:
      'Destination ids the user can actually run against right now (e.g. "ai-matrx", "claude-code"), after the live capability checks. Populated on `/work/connections`; absent on the other hub routes, which do not run the checks.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 300,
    group: "connections",
  },
  {
    name: "local_runtime_available",
    label: "Local runtime available",
    description:
      "True when the user's own Matrx Local engine answered `available` over the per-user bridge channel. Populated on `/work/connections`; absent when the check has not run. A timeout is reported as false, never as unknown.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 310,
    group: "connections",
  },
];

export const aiWorkManifest: SurfaceManifest = {
  surfaceName: "matrx-user/ai-work",
  readiness: "stub",
  readinessNote:
    "Baseline vocabulary declared 2026-08-17 to close an undeclared Tier-1 route family (/work, /work/requests, /work/connections). Not yet audited field-by-field against each page, and no runtime emitter is wired.",
  label: "AI Work Hub",
  urlPattern: "/work",
  intro: `<surface_intro>
You are on the AI Work hub: the user's front door for finding, continuing, and organizing AI work without knowing which subsystem owns it. It composes existing platform capabilities — it owns no conversation store, scheduler, or provider bridge of its own.
Three routes share this surface: the overview directory, the caller's Saved Requests, and the connections page that states which execution destinations are genuinely available. Read work_route first; the other groups are populated only on the route that loads them.
Starting a new run happens on a different surface (the composer at /work/new), and browsing conversations on another still — do not assume their values are present here.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** One entry as emitted in `saved_requests_summary`. */
export interface AiWorkSavedRequestSummaryEntry {
  id: string;
  label: string;
  destination: string;
}

/** Type-safe payload helper — required keys mirror `alwaysAvailable: true`. */
export function createAiWorkScope(values: {
  work_route: "overview" | "requests" | "connections";
  selection?: string;
  context?: Record<string, unknown>;
  saved_request_count?: number;
  saved_requests_summary?: AiWorkSavedRequestSummaryEntry[];
  available_destinations?: string[];
  local_runtime_available?: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
