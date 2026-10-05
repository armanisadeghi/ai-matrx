/**
 * Agent Factory build — the shapes this admin surface reads.
 *
 * A build is a durable job on the execution spine: one root
 * `runtime.global_execution` of type `agent_factory_build` (its id IS the build
 * id) whose latest `runtime.global_execution_checkpoint.state` is the whole
 * build state (`BuildState` in aidream/aidream/services/agent_factory/pipeline.py).
 *
 * The checkpoint state is a runtime record, not a registered kind, so it is
 * typed here (mirror of the pydantic models, defensive: every field optional
 * because a build that died mid-step leaves a partial state). The STEP ANSWERS
 * inside it are registered kinds and render through their kind components.
 */

export type FactoryStepName =
  | "intake"
  | "contract"
  | "goal"
  | "tool_choice"
  | "instructions"
  | "model"
  | "save"
  | "proof"
  | "proof_review";

/** The judgment steps — each its own Mandate run with a registered answer kind. */
export type FactoryJudgmentStep = "contract" | "goal" | "tool_choice" | "instructions" | "proof_review";

export interface FactoryStepRecord {
  step: FactoryJudgmentStep;
  attempt?: number;
  status?: "running" | "done" | "failed" | "skipped";
  mandate_key?: string | null;
  execution_id?: string | null;
  conversation_id?: string | null;
  request_id?: string | null;
  holder_agent_id?: string | null;
  answer?: unknown;
  findings?: string[];
  error?: string | null;
  started_at?: string;
  ended_at?: string | null;
}

/** One gate result: [name, passed, detail]. */
export type FactoryGateTuple = [string, boolean, string];

export interface FactoryProofCase {
  case_id: string;
  source?: string;
  candidate_output?: string;
  candidate_conversation_id?: string | null;
  gates?: FactoryGateTuple[];
  candidate_label?: "a" | "b";
  preferred?: string | null;
}

export interface FactoryRealInput {
  case_id: string;
  source?: string;
  variables?: Record<string, unknown>;
  user_input?: string | null;
  baseline_output?: string;
}

export interface FactoryLockedFacts {
  mandate_key?: string | null;
  output_kind?: string | null;
  input_names?: string[];
  required_output_keys?: string[];
  accepts_user_input?: boolean | null;
  guaranteed_input_names?: string[];
}

export interface FactoryJobFacts {
  greenfield?: boolean;
  holder_agent_id?: string | null;
  locked?: FactoryLockedFacts;
  real_inputs?: FactoryRealInput[];
}

export interface FactoryModelChoice {
  model_id?: string;
  model_name?: string;
  source?: string;
  reason?: string;
}

export type FactoryOutcome =
  | "passed"
  | "saved_unproven"
  | "failed"
  | "workflow_sized"
  | "send_backs_exhausted"
  | "judge_not_blind"
  | "no_proof_inputs"
  | "needs_new_kind"
  | "unproven"
  | "worker_lost";

/** Outcomes that keep the saved agent active (pipeline.KEPT_OUTCOMES). */
export const KEPT_OUTCOMES: ReadonlySet<string> = new Set(["passed", "saved_unproven"]);

export interface FactoryBuildRequest {
  unproven?: boolean;
  door?: string | null;
  spec?: Record<string, unknown> & {
    name?: string;
    display_name?: string | null;
    model_id?: string | null;
    tools?: string[];
  };
  mandate_key?: string | null;
  idempotency_key?: string | null;
}

export interface FactoryBuildState {
  build_id?: string;
  request?: FactoryBuildRequest;
  status?: "running" | "completed" | "failed";
  current_step?: FactoryStepName;
  steps?: Partial<Record<FactoryJudgmentStep, FactoryStepRecord>>;
  history?: FactoryStepRecord[];
  facts?: FactoryJobFacts | null;
  flags?: string[];
  assumptions?: string[];
  model?: FactoryModelChoice | null;
  agent_id?: string | null;
  version_ids?: string[];
  proof?: FactoryProofCase[];
  /** R15: an unpassed build archived the agent it saved. */
  archived_agent?: boolean;
  send_backs?: number;
  outcome?: FactoryOutcome | null;
  error?: string | null;
  /** The finished build as the registered `agent_factory_build` kind. */
  build?: Record<string, unknown> | null;
}

/** The spine row's status (`runtime.global_execution.status`). */
export type SpineStatus = string;

export interface FactoryBuildRow {
  id: string;
  spineStatus: SpineStatus;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  mandateKey: string | null;
  name: string | null;
  currentStep: string | null;
  outcome: string | null;
  sendBacks: number;
  verdict: string | null;
  agentId: string | null;
  error: string | null;
}

export interface FactoryBuildDetail {
  id: string;
  spineStatus: SpineStatus;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  checkpointAt: string | null;
  state: FactoryBuildState | null;
}

/** The kind each judgment step answers in — rendered through its kind component. */
export const STEP_ANSWER_KIND: Record<FactoryJudgmentStep, string> = {
  contract: "agent_factory_contract",
  goal: "agent_mandate_specification",
  tool_choice: "agent_factory_tool_choice",
  instructions: "agent_factory_instructions",
  proof_review: "agent_factory_proof_review",
};

export const STEP_LABEL: Record<FactoryStepName, string> = {
  intake: "Intake",
  contract: "Contract",
  goal: "Goal",
  tool_choice: "Tools",
  instructions: "Instructions",
  model: "Model",
  save: "Save",
  proof: "Proof",
  proof_review: "Judge",
};

/** Pipeline order — what a running build still has ahead of it. */
export const STEP_ORDER: FactoryStepName[] = [
  "intake",
  "contract",
  "goal",
  "tool_choice",
  "instructions",
  "model",
  "save",
  "proof",
  "proof_review",
];

/** A spine status that will not change again. */
export function spineIsOver(status: SpineStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}
