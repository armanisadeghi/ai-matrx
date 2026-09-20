/**
 * Surface manifest — Model Battle (`matrx-user/agent-comparison-model`).
 *
 * `/agents/battle/model` runs one locked agent request against multiple model
 * variants. It is a measuring surface: a future judge may read the shared
 * request and each outcome, but it cannot alter a model, replay a run, or
 * rewrite the evidence.
 *
 * The emitter is `ModelBattleSurfaceRuntime`. It snapshots Redux only when a
 * header agent or the page menu opens. No fixed mandate runs on this page, so
 * this manifest deliberately declares no agent role.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { CHAT_DRAFT_WRITE_MODES, CHAT_INPUT_DRAFT_MAX } from "./chat.manifest";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "comparison_setup",
    label: "Comparison setup",
    sortOrder: 100,
    description:
      "The locked agent, its version, and the shared request every model receives.",
  },
  {
    key: "comparison_inputs",
    label: "Shared inputs",
    sortOrder: 200,
    description:
      "The variables, resources, and context copied into every model run.",
  },
  {
    key: "comparison_outcomes",
    label: "Model outcomes",
    sortOrder: 300,
    description: "One safe transcript and outcome per comparison column.",
  },
  {
    key: "comparison_session",
    label: "Comparison session",
    sortOrder: 400,
    description: "Saved-set linkage, submit state, and blind-test visibility.",
  },
];

/** Visible UI labels and Locate anchors for the Model Battle owner. */
export const MODEL_BATTLE_SURFACE_LABELS = {
  sharedRequest: "Shared request",
  lockedAgent: "Locked agent",
  sharedVariables: "Shared variables",
  sharedResources: "Shared resources",
  sharedContext: "Shared context",
  outcomes: "Model outcomes",
  feedback: "Response feedback",
} as const;

export const MODEL_BATTLE_SURFACE_ANCHORS = {
  lockedAgent: "locked_agent",
  sharedUserInputDraft: "shared_user_input_draft",
  sharedVariables: "shared_variables",
  sharedResources: "shared_resources",
  sharedContextEntries: "shared_context_entries",
  modelOutcomes: "model_outcomes",
  modelFeedback: "model_feedback",
} as const;

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "locked_agent",
    label: "Locked agent",
    description:
      "The one agent definition used for every column. Empty until an agent is chosen.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "comparison_setup",
    sortOrder: 100,
  },
  {
    name: "shared_user_input_draft",
    label: "Shared user input draft",
    description:
      "The unsent request that Submit All copies into every model column. Empty when no draft exists.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    group: "comparison_setup",
    sortOrder: 110,
  },
  {
    name: "shared_variables",
    label: "Shared variables",
    description:
      "Resolved variable values copied into every column for the next shared run.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    group: "comparison_inputs",
    sortOrder: 200,
  },
  {
    name: "shared_resources",
    label: "Shared resources",
    description:
      "Safe summaries of resources attached to the shared request, in send order.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    group: "comparison_inputs",
    sortOrder: 210,
  },
  {
    name: "shared_context_entries",
    label: "Shared context entries",
    description: "Named context entries copied into every model run.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    group: "comparison_inputs",
    sortOrder: 220,
  },
  {
    name: "model_outcomes",
    label: "Model outcomes",
    description:
      "Ordered per-column user and assistant transcript text, current status, and safe outcome details. During an unrevealed blind session, every column is anonymous and model identity and run metrics are omitted.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    group: "comparison_outcomes",
    sortOrder: 300,
  },
  {
    name: "feedback_metric_definitions",
    label: "Response feedback rubric",
    description:
      "The rating dimensions and human-readable prompts used by the response feedback controls.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 900,
    autoContext: false,
    group: "comparison_outcomes",
    sortOrder: 310,
  },
  {
    name: "model_feedback",
    label: "Response feedback",
    description:
      "Per-column human feedback: thumbs rating, overall score, rank, rubric scores, and note. Blind sessions retain anonymous labels and omit conversation IDs.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    group: "comparison_outcomes",
    sortOrder: 320,
  },
  {
    name: "comparison_set",
    label: "Saved comparison set",
    description:
      "The saved comparison set name and ID when this page is linked to one. Empty for an unsaved comparison.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "comparison_session",
    sortOrder: 400,
  },
  {
    name: "comparison_state",
    label: "Comparison state",
    description:
      "Whether Submit All is active and whether blind mode is hiding model identity. A judge must not identify or rank a partial run as final.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 80,
    group: "comparison_session",
    sortOrder: 410,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "shared_user_input_draft",
    label: "Shared user input draft",
    description: `Stages text in Model Battle's shared request box for the user to review and submit to every model. Value: { "text": string (1-${CHAT_INPUT_DRAFT_MAX} characters), "mode"?: ${CHAT_DRAFT_WRITE_MODES.map((mode) => `"${mode}"`).join(" | ")} }. "replace" is the default; "append" adds a new line after the current draft. This never submits a run or changes a model. Refused while a comparison is submitting or any model run is active.`,
    valueType: "object",
    updatesValue: "shared_user_input_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "comparison_setup",
    sortOrder: 500,
  },
  {
    name: "shared_variables",
    label: "Shared variables",
    description:
      "Stages a partial patch of variables in the shared request. Every supplied key must be declared by the locked agent; omitted keys are preserved. This never submits a run or changes a model. Refused while a comparison is submitting or any model run is active.",
    valueType: "object",
    updatesValue: "shared_variables",
    mode: "draft",
    applyPolicy: "ask",
    group: "comparison_inputs",
    sortOrder: 510,
  },
];

export const agentComparisonModelManifest: SurfaceManifest = {
  surfaceName: "matrx-user/agent-comparison-model",
  label: "Model Battle",
  readiness: "partial",
  readinessNote:
    "The manifest and runtime contract are wired, focused checks pass, and the DB mirror is synchronized. Live menu, launch, writeback, and blind-session verification remain pending.",
  urlPattern: "/agents/battle/model",
  intro: `<surface_intro>
Model Battle sends one locked request to several model variants of the same agent.

- shared_user_input_draft, shared_variables, shared_resources, and shared_context_entries contain the common input every column receives.
- model_outcomes contains the comparison evidence: display-safe user and assistant transcript text, status, and outcome information.
- During comparison_state.blind_active with identity_available false, model identities, column IDs, conversation IDs, model metadata, detailed errors, and run metrics are absent. Outcome and feedback labels are anonymous.
- feedback_metric_definitions contains the existing feedback rubric; model_feedback contains matching per-column human scores and notes without adding a judging workflow.
- The two draft targets stage the next shared request for review. The surface has no execution, model-selection, agent-definition, or feedback write target.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

export function createAgentComparisonModelScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  locked_agent?: Record<string, unknown>;
  shared_user_input_draft?: string;
  shared_variables?: Record<string, unknown>;
  shared_resources?: object[];
  shared_context_entries?: object[];
  model_outcomes?: object[];
  feedback_metric_definitions?: object[];
  model_feedback?: object[];
  comparison_set?: Record<string, unknown>;
  comparison_state: Record<string, unknown>;
}): SurfaceScopePayload {
  return values;
}
