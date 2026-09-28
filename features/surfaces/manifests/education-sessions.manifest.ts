/** Study-session history (`matrx-user/education-sessions`). */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_SESSIONS_SURFACE_NAME = "matrx-user/education-sessions";

const groups: SurfaceValueGroup[] = [
  {
    key: "history",
    label: "Study history",
    sortOrder: 100,
    description:
      "The learner's persisted study sessions currently shown in this history view.",
  },
  {
    key: "filters",
    label: "Filters",
    sortOrder: 200,
    description:
      "Route-provided restrictions that decide which sessions this history view shows.",
  },
];

const values: SurfaceValue[] = [
  {
    name: "session_list",
    label: "Session list",
    description:
      "The visible persisted study sessions, newest first, including { id, version, mode, status, started_at, ended_at, source_set_id, aggregate_score }. Only completed or abandoned rows may be deleted; use their id and version with delete_sessions. Empty when no sessions match; absent while loading or after a load failure.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3500,
    inlineUpTo: 4000,
    group: "history",
    sortOrder: 100,
  },
  {
    name: "session_count",
    label: "Session count",
    description:
      "How many sessions are visible in this route after its empty-session rule is applied. Absent while loading or after a load failure.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "history",
    sortOrder: 110,
  },
  {
    name: "sessions_loading",
    label: "Sessions loading",
    description:
      "True while the page is fetching sessions and their attempt summaries. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "history",
    sortOrder: 120,
  },
  {
    name: "sessions_error",
    label: "Sessions error",
    description:
      "The load error shown by the page. Absent when sessions loaded successfully or are still loading.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "history",
    sortOrder: 130,
  },
  {
    name: "history_filters",
    label: "History filters",
    description:
      "The route's active filter object: { set_id, mode, hide_empty, detail_base_path }. Always present; null set_id and mode mean no restriction.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 150,
    group: "filters",
    sortOrder: 200,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "delete_sessions",
    label: "Delete sessions",
    description:
      "Soft-deletes completed or abandoned study-history rows after approval. Value is a JSON ARRAY of 1-25 { id, version } objects from session_list. Active sessions and rows changed since the proposal are refused. Deleted sessions leave this history; card mastery is not changed. There is no restore action on this page.",
    valueType: "array",
    mode: "entity",
    applyPolicy: "ask",
    updatesValue: "session_list",
    group: "history",
    sortOrder: 300,
  },
];

export const educationSessionsManifest: SurfaceManifest = {
  surfaceName: EDUCATION_SESSIONS_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Study-session history list at /education/sessions and per-flashcard-set session history.",
  readiness: "partial",
  readinessNote:
    "Manifest, route mapping, and provider/agent delete handler are implemented. Focused mirror sync and live agent interaction proof remain required.",
  label: "Study sessions",
  urlPattern: "/education/sessions",
  intro: `<surface_intro>
You are on Study Sessions: persisted history for completed, active, and abandoned study runs. Read session_list for the visible rows and history_filters for this route's scope. A session can be deleted through delete_sessions after the learner approves; that removes the history row and its results but does not alter card mastery. This page does not create or edit sessions.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), values),
  writeTargets,
  agentRosterMode: "universal",
};

export function createEducationSessionsScope(values: {
  sessions_loading: boolean;
  history_filters: {
    set_id: string | null;
    mode: string | null;
    hide_empty: boolean;
    detail_base_path: string;
  };
  session_list?: unknown[];
  session_count?: number;
  sessions_error?: string;
}): SurfaceScopePayload {
  return {
    ...values,
    runtime: { surfaceName: EDUCATION_SESSIONS_SURFACE_NAME },
  };
}
