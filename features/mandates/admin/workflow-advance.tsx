"use client";

// features/mandates/admin/workflow-advance.tsx
//
// BATCH "ADVANCE" FOR WORKFLOW PINS — the workflow twin of ./impact-advance.tsx.
//
// A workflow-held rung is graded by aidream `POST /mandates/impact/workflows`
// (./workflow-impact.ts) on the same scale as an agent rung, but there is no
// workflow advance door on the server. Moving a pin is the SAME write the
// Mandate Holder tab makes, through the ONE holder doors in ../overrides.ts:
//
//   the job's default  → `putMandateDefaultHolder`, holder half only — a key
//                        left out is left as stored, so the default's map,
//                        settings and auto-run are untouched;
//   an org / own rung  → `putMandateBinding`, which REPLACES the whole row, so
//                        the stored settings, map, auto-run and enabled flag
//                        are read fresh and re-sent unchanged. A stored map
//                        this client cannot read in full is refused (never
//                        silently thinned) with the reason.
//
// Consequence first (destructive-and-expensive-actions law): one confirm names
// every pin that moves, from which version to which, and how many carry a
// warning grade. Then one write per rung; each row answers moved / refused
// with its own sentence. The server's contract gate still judges every write
// (a mismatch saves red, never blocks — the note comes back per row).

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { createClient } from "@/utils/supabase/client";
import { isJsonObject, type JsonObject } from "@/types/json";
import type { AppDispatch } from "@/lib/redux/store";
import { mandateBindings } from "@/lib/supabase/mandateStorage";
import { parseBindingWave1 } from "@/features/mandates/provision-shapes";
import {
  putMandateBinding,
  putMandateDefaultHolder,
} from "@/features/mandates/overrides";
import {
  WORKFLOW_BLOCKER_META,
  workflowNewestLabel,
  workflowPinLabel,
  type WorkflowImpactVerdict,
} from "./workflow-impact";

export interface WorkflowAdvanceEligibility {
  batchable: boolean;
  why?: string;
}

/** Can this workflow rung be moved to its newest published version from a batch? */
export function workflowAdvanceEligibility(
  verdict: WorkflowImpactVerdict,
  actorUserId: string | null,
): WorkflowAdvanceEligibility {
  if (verdict.blocker) {
    const meta = WORKFLOW_BLOCKER_META[verdict.blocker];
    return { batchable: false, why: `${meta.label}: ${meta.remedy}` };
  }
  if (verdict.principal_kind === "user" && verdict.subject_user_id !== actorUserId) {
    return {
      batchable: false,
      why: "A person's own pin — theirs to advance, never moved on their behalf.",
    };
  }
  if (!verdict.latest_version_id) {
    return { batchable: false, why: "The workflow has no published version to move to." };
  }
  if (!verdict.behind_latest || verdict.pinned_version_id === verdict.latest_version_id) {
    return { batchable: false, why: "Already on the newest published version." };
  }
  return { batchable: true };
}

export interface WorkflowAdvanceRowResult {
  verdict: WorkflowImpactVerdict;
  moved: boolean;
  /** The reason it did not move, or the server's notes on the write. */
  sentence: string | null;
}

function rungWords(verdict: WorkflowImpactVerdict): string {
  const where =
    verdict.holder_kind === "mandate_default"
      ? "the job's default"
      : verdict.principal_kind === "org"
        ? "an organization's answer"
        : "your own answer";
  return `${verdict.mandate_key} (${where}): ${verdict.workflow_name} ${workflowPinLabel(verdict)} → ${workflowNewestLabel(verdict)} [${verdict.grade}]`;
}

/** The confirm's words: what moves, and how many carry a warning. */
export function describeWorkflowAdvance(verdicts: readonly WorkflowImpactVerdict[]): {
  title: string;
  description: string;
  moves: string[];
} {
  const warned = verdicts.filter((v) => v.grade === "orange" || v.grade === "red").length;
  return {
    title: `Advance ${verdicts.length} workflow pin${verdicts.length === 1 ? "" : "s"}?`,
    description:
      `Each job below starts running the workflow's newest published version for everyone that rung serves. ` +
      (warned > 0
        ? `${warned} of them carry an orange or red grade — the change may break the job. `
        : "") +
      "Settings, input mappings and run-instantly stay exactly as stored. To undo, pin the old version again in the Binding tab.",
    moves: verdicts.map(rungWords),
  };
}

async function advanceOne(
  dispatch: AppDispatch,
  verdict: WorkflowImpactVerdict,
): Promise<WorkflowAdvanceRowResult> {
  const target = verdict.latest_version_id as string;
  if (verdict.holder_kind === "mandate_default") {
    const report = await putMandateDefaultHolder(dispatch, verdict.mandate_key, {
      holderType: "workflow",
      agentId: null,
      agentVersionId: null,
      useLatest: false,
      holderId: verdict.workflow_id,
      holderVersionId: target,
    });
    return { verdict, moved: true, sentence: report.notes.join(" ") || null };
  }

  // A binding write replaces the row: re-send everything it stores, read fresh.
  const supabase = createClient();
  const { data: row, error } = await mandateBindings(supabase)
    .select("*")
    .eq("id", verdict.row_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!row) {
    return { verdict, moved: false, sentence: "This binding no longer exists — nothing to move." };
  }
  const stored = parseBindingWave1(row);
  if (stored.droppedSources.length > 0) {
    return {
      verdict,
      moved: false,
      sentence: `Not moved: part of this binding's input mapping cannot be read here, and re-saving would lose it. Open it in the Binding tab. (${stored.droppedSources.join(" ")})`,
    };
  }
  const principal =
    row.principal_type === "org"
      ? { principalType: "org" as const, organizationId: row.organization_id as string }
      : { principalType: "user" as const };
  const report = await putMandateBinding(dispatch, verdict.mandate_key, principal, {
    holderType: "workflow",
    agentId: null,
    holderId: verdict.workflow_id,
    holderVersionId: target,
    useLatest: false,
    configOverrides: isJsonObject(row.config_overrides)
      ? (row.config_overrides as JsonObject)
      : null,
    consumptionMap: stored.consumptionMap,
    autoRun: stored.autoRun,
    isEnabled: row.is_enabled !== false,
  });
  return { verdict, moved: true, sentence: report.notes.join(" ") || null };
}

/**
 * Confirm, then move every chosen workflow pin to its newest published
 * version. Resolves to the per-row results, or null when the person kept the
 * current pins. Never throws: a failed row carries its own sentence.
 */
export async function advanceWorkflowPins(
  dispatch: AppDispatch,
  verdicts: readonly WorkflowImpactVerdict[],
): Promise<WorkflowAdvanceRowResult[] | null> {
  if (verdicts.length === 0) return [];
  const { title, description, moves } = describeWorkflowAdvance(verdicts);
  const ok = await confirm({
    title,
    description: (
      <div className="space-y-2 text-xs">
        <p>{description}</p>
        <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded border border-border bg-muted/30 p-2 font-mono text-[11px]">
          {moves.map((move, index) => (
            <li key={`${index}-${move}`}>{move}</li>
          ))}
        </ul>
      </div>
    ),
    confirmLabel: verdicts.some((v) => v.grade === "orange" || v.grade === "red")
      ? `Advance ${verdicts.length} anyway`
      : `Advance ${verdicts.length}`,
    cancelLabel: "Keep the current pins",
    variant: verdicts.some((v) => v.grade === "red") ? "destructive" : "default",
  });
  if (!ok) return null;
  const results: WorkflowAdvanceRowResult[] = [];
  for (const verdict of verdicts) {
    try {
      results.push(await advanceOne(dispatch, verdict));
    } catch (error) {
      results.push({
        verdict,
        moved: false,
        sentence: error instanceof Error ? error.message : "The write failed.",
      });
    }
  }
  return results;
}
