// features/mandates/candidate-dialog/target.ts
//
// PURE: where a "try as candidate" comes from → the dialog's pre-fill. Three
// doors open the same set-candidate dialog (PLAN P18 + §2.6):
//   · the record's Candidates tab     — rung = the seat the person is viewing
//   · a graded mandate row (Find Usages / ImpactBatch) — rung = that row's rung,
//     target = the newest saved version the row would Advance to
//   · a test-bench result row          — target = exactly what that run ran
//
// Every rule here mirrors the server's own reading (aidream
// candidates/api.py), so the dialog never offers something the server would
// refuse without saying why first.

import type { HolderDraft } from "@/features/bindings/ScopeHolderBar";
import type { ImpactVerdict } from "@/features/mandates/admin/impact";
import type { MandateTestResponse } from "@/features/mandates/test-run";
import type { CandidateRung, LiveCandidateForecast } from "./api";

export interface CandidateRungChoice {
  rung: CandidateRung;
  /** The organization (org rung) or person (user rung); null for global. */
  principalId: string | null;
}

export const EMPTY_TARGET: HolderDraft = {
  kind: "agent",
  agentId: null,
  agentVersionId: null,
  useLatest: true,
  workflowId: null,
  workflowVersionId: null,
};

/** The rung a graded impact row speaks for (its `holder_kind` + principal). */
export function rungOfImpactVerdict(verdict: ImpactVerdict): CandidateRungChoice {
  if (verdict.holder_kind === "mandate_default") return { rung: "global", principalId: null };
  if (verdict.principal.kind === "user") {
    return { rung: "user", principalId: verdict.principal.subject_user_id ?? null };
  }
  return { rung: "org", principalId: verdict.principal.organization_id };
}

/** "Try as candidate" on an impact row: the version Advance would move it to. */
export function targetOfImpactVerdict(verdict: ImpactVerdict): HolderDraft {
  return {
    ...EMPTY_TARGET,
    agentId: verdict.agent_id,
    agentVersionId: verdict.latest_version_id ?? null,
    useLatest: !verdict.latest_version_id,
  };
}

/** "Set as live candidate" on a bench result: exactly what that run ran. */
export function targetOfBenchResult(result: MandateTestResponse): HolderDraft | null {
  if (result.holder_type === "workflow") {
    if (!result.workflow_id) return null;
    return {
      ...EMPTY_TARGET,
      kind: "workflow",
      workflowId: result.workflow_id,
      workflowVersionId: result.workflow_version_id ?? null,
    };
  }
  const agentId = result.definition_agent_id ?? result.agent_id ?? null;
  if (!agentId) return null;
  // `agent_id` is a VERSION id when the run named one (`is_version`).
  const versionId = result.is_version && result.agent_id ? result.agent_id : null;
  return { ...EMPTY_TARGET, agentId, agentVersionId: versionId, useLatest: !versionId };
}

/** The draft the picker holds → the set request's holder half. Null = incomplete. */
export function holderOfDraft(
  draft: HolderDraft,
): { holder_type: "agent" | "workflow"; holder_id: string; holder_version_id: string | null } | null {
  if (draft.kind === "workflow") {
    return draft.workflowId
      ? {
          holder_type: "workflow",
          holder_id: draft.workflowId,
          holder_version_id: draft.workflowVersionId ?? null,
        }
      : null;
  }
  return draft.agentId
    ? {
        holder_type: "agent",
        holder_id: draft.agentId,
        holder_version_id: draft.useLatest ? null : draft.agentVersionId,
      }
    : null;
}

/**
 * The server refuses a WORKFLOW candidate when the mandate's recent runs came
 * only through a chat start (`mandate_candidate_workflow_on_chat_only`: a chat
 * start cannot run a workflow). Same rule, said before the click.
 */
export function workflowRefusalOf(
  draft: HolderDraft,
  forecast: LiveCandidateForecast | null,
): string | null {
  if (draft.kind !== "workflow" || !forecast) return null;
  const doors = Object.keys(forecast.doors ?? {});
  return doors.length > 0 && doors.every((door) => door === "chat_start")
    ? "This job only runs as a chat, which can't run a workflow. Pick an agent."
    : null;
}

/** Plain words for a door key (PLAN §2.3 doors + the uncovered paths §4). */
export const DOOR_LABEL: Record<string, string> = {
  chat_start: "Chat start",
  run_mandate: "Server run",
  batch_submit: "Batch",
  run_mandated: "Named agent",
  workflow_step: "Workflow step",
  held_code_call: "Held code call",
};

export function doorLabel(door: string): string {
  return DOOR_LABEL[door] ?? door.replace(/_/g, " ");
}

/** Plain words for a skip reason (`candidate.skips`, P17). */
export const SKIP_LABEL: Record<string, string> = {
  not_visible: "Chat you can't open",
  other_rung: "Ran at another level",
  uncovered_door: "Door not covered",
  continuation: "Follow-up turn",
};

export function skipLabel(reason: string): string {
  return SKIP_LABEL[reason] ?? reason.replace(/_/g, " ");
}

export const RUNG_LABEL: Record<CandidateRung, string> = {
  global: "Everyone",
  org: "Organization",
  user: "Personal",
};
