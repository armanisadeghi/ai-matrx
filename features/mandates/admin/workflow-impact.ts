// features/mandates/admin/workflow-impact.ts
//
// THE WORKFLOW TWIN of ./impact.ts (workflow parity, round 2). A mandate is
// filled by an agent OR a workflow; the agent read (`POST /mandates/impact`)
// grades only agent rungs and gives a workflow rung `unsupported_holder`.
// aidream `POST /mandates/impact/workflows` grades workflow rungs on the SAME
// scale: what changed between the pinned and the newest published version
// (inputs, output kind, steps), stored overrides a workflow never applies, and
// whether the holder fits the mandate's contract TODAY (`contract_broken`).
//
// Every sentence a person reads is the server's; this module only types,
// validates and groups it. There is no workflow advance door yet — a pin is
// moved in the Mandate Holder tab — so nothing here writes.

import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import {
  IMPACT_GRADE_ORDER,
  type ImpactFinding,
  type ImpactGrade,
} from "./impact";

export type WorkflowImpactBlocker = "tracks_latest" | "unreachable" | "set_aside";
export type WorkflowBreakWay = "inputs" | "output" | "steps" | "overrides";

// Hand-typed until the OpenAPI types are regenerated from a server carrying
// the endpoint; `isWorkflowImpactReport` checks the shape at the boundary.
export interface WorkflowImpactVerdict {
  holder_kind: "mandate_default" | "binding";
  row_id: string;
  mandate_key: string;
  principal_kind: "system" | "org" | "user";
  organization_id: string | null;
  subject_user_id: string | null;
  workflow_id: string;
  workflow_name: string;
  pinned_version_id: string | null;
  pinned_version_number: number | null;
  latest_version_id: string | null;
  latest_version_number: number | null;
  grade: ImpactGrade;
  blocker: WorkflowImpactBlocker | null;
  set_aside_reason: string | null;
  findings: ImpactFinding[];
  breaks: Partial<Record<WorkflowBreakWay, ImpactGrade>>;
  contract_broken: boolean;
  behind_latest: boolean;
}

export interface WorkflowImpactReport {
  verdicts: WorkflowImpactVerdict[];
  withheld: {
    total: number;
    by_principal_kind: Record<string, number>;
    sentence: string | null;
  };
  workflows_examined: number;
  computed_at: string;
}

export const WORKFLOW_IMPACT_PATH = "/mandates/impact/workflows" as const;

export function isWorkflowImpactReport(value: unknown): value is WorkflowImpactReport {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.verdicts) &&
    typeof record.computed_at === "string" &&
    record.verdicts.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).workflow_id === "string" &&
        typeof (item as Record<string, unknown>).grade === "string",
    )
  );
}

/** Every workflow-held rung the caller may read, graded. */
export async function fetchWorkflowImpact(
  dispatch: AppDispatch,
  workflowIds?: readonly string[],
): Promise<WorkflowImpactReport> {
  const response = await dispatch(
    callApi({
      path: WORKFLOW_IMPACT_PATH,
      method: "POST",
      body: { workflow_ids: workflowIds ? [...workflowIds] : null },
    }),
  );
  if (response.error) throw new Error(response.error.message);
  if (!isWorkflowImpactReport(response.data)) {
    throw new Error(
      `POST ${WORKFLOW_IMPACT_PATH} did not return a workflow impact report — the workflow grades are unknown, not clean.`,
    );
  }
  return response.data;
}

/** mandate key → its workflow rungs' verdicts (default first). */
export function groupWorkflowImpactByMandate(
  verdicts: readonly WorkflowImpactVerdict[],
): Map<string, WorkflowImpactVerdict[]> {
  const out = new Map<string, WorkflowImpactVerdict[]>();
  for (const verdict of verdicts) {
    const list = out.get(verdict.mandate_key) ?? [];
    list.push(verdict);
    out.set(verdict.mandate_key, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) =>
      a.holder_kind === b.holder_kind ? 0 : a.holder_kind === "mandate_default" ? -1 : 1,
    );
  }
  return out;
}

/** The verdict that speaks for a mandate: its default rung, else its worst binding. */
export function leadWorkflowVerdict(
  verdicts: readonly WorkflowImpactVerdict[],
): WorkflowImpactVerdict | null {
  const byDefault = verdicts.find((v) => v.holder_kind === "mandate_default");
  if (byDefault) return byDefault;
  return verdicts.reduce<WorkflowImpactVerdict | null>(
    (worst, v) =>
      !worst ||
      IMPACT_GRADE_ORDER.indexOf(v.grade) > IMPACT_GRADE_ORDER.indexOf(worst.grade)
        ? v
        : worst,
    null,
  );
}

export const WORKFLOW_BLOCKER_META: Record<
  WorkflowImpactBlocker,
  { label: string; meaning: string; remedy: string }
> = {
  tracks_latest: {
    label: "Tracks latest",
    meaning:
      "No pin — this rung runs the workflow's live definition, so every saved edit already reaches it.",
    remedy:
      "Nothing to move. The grade shows what the most recent change did to this job.",
  },
  unreachable: {
    label: "Unreachable",
    meaning:
      "The workflow was edited past this pin but no newer version was published, so there is nothing to pin to.",
    remedy: "Publish the workflow, or switch this job to follow the latest version.",
  },
  set_aside: {
    label: "Set aside",
    meaning: "This rung cannot be judged as it stands.",
    remedy: "Open the mandate and fix why, using the sentence shown.",
  },
};

export const BREAK_WAY_LABEL: Record<WorkflowBreakWay, string> = {
  inputs: "Inputs",
  output: "Output",
  steps: "Steps",
  overrides: "Overrides",
};

export function workflowPinLabel(verdict: WorkflowImpactVerdict): string {
  if (verdict.blocker === "tracks_latest") return "live";
  return verdict.pinned_version_number != null
    ? `v${verdict.pinned_version_number}`
    : "unknown version";
}

export function workflowNewestLabel(verdict: WorkflowImpactVerdict): string {
  return verdict.latest_version_number != null
    ? `v${verdict.latest_version_number}`
    : "no published version";
}

/**
 * The job is ALREADY affected: the holder fails the mandate's contract today,
 * or the rung runs the live workflow and a red change has reached it. (A red
 * change above a pin is a warning on the Grade, not drift — the pin holds.)
 */
export function isWorkflowDrift(verdict: WorkflowImpactVerdict): boolean {
  return (
    verdict.contract_broken ||
    (verdict.grade === "red" && verdict.blocker === "tracks_latest")
  );
}
