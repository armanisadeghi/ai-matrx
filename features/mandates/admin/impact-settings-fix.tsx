"use client";

/**
 * "FIX SETTINGS" ON A DRIFT ROW (Agent Change Impact, R13).
 *
 * A drift verdict's settings findings name an offending setting on the
 * NEWEST version of the agent. Fixing it is an EDIT OF THE AGENT, not a pin
 * move (R13: two actions): the ONE existing fixer
 * (`applyAllFixableIssues`, the same function the agent builder's "Fix all"
 * button calls) is applied to the newest version's settings, and the result
 * is saved through the normal agent save path (`setAgentSettings` →
 * `saveAgent`), which creates version N+1 exactly as a save in the builder
 * does — never a raw write to a version row. The panel then re-reads the
 * impact for that agent and re-piles the row from the fresh verdict.
 *
 * Nothing silent: a row the fixer cannot help says so and keeps its Advance
 * door; the confirm names every setting that will change and the version it
 * creates; a fix that produced no grade change says so afterwards.
 */

import { useState } from "react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentSettings } from "@/features/agents/redux/agent-definition/slice";
import {
  fetchFullAgent,
  saveAgent,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  fetchModelById,
  selectAllModels,
  selectModelFullyLoaded,
} from "@/features/ai-models/redux/modelRegistrySlice";
import type { ModelConstraint } from "@/features/ai-models/types";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import {
  resolveModelControls,
  type NormalizedControls,
} from "@/features/agents/hooks/useModelControls";
import {
  applyAllFixableIssues,
  canFixIssue,
} from "@/features/agents/components/settings-management/validation/apply-fix";
import { validateConfig } from "@/features/agents/components/settings-management/validation/engine";
import { resolveConfig } from "@/features/agents/components/settings-management/validation/resolve-config";
import type { ValidationIssue } from "@/features/agents/components/settings-management/validation/types";
import type { ImpactVerdict } from "./impact";

/** What the fixer found for ONE agent, before anything is written. */
export type SettingsFixPlan =
  | {
      status: "fixable";
      agentId: string;
      agentName: string;
      newestVersionNumber: number | null;
      fixable: ValidationIssue[];
      /** Issues a person has to resolve by hand — named, never hidden. */
      manual: ValidationIssue[];
      before: FeLlmParams;
      after: FeLlmParams;
      /** One sentence per changed setting: "sets reasoning_effort from high to medium". */
      changes: string[];
    }
  | {
      status: "nothing_fixable";
      agentId: string;
      agentName: string;
      newestVersionNumber: number | null;
      manual: ValidationIssue[];
      why: string;
    }
  | {
      status: "cannot";
      agentId: string;
      agentName: string;
      newestVersionNumber: number | null;
      why: string;
    };

/**
 * A thunk rejection is not always an Error: `createAsyncThunk`'s `condition`
 * rejects with a plain object (`{ name: "ConditionError" … }`) and
 * `rejectWithValue` with whatever the thunk passed. Every catch here reads
 * as a sentence, never "[object Object]".
 */
export function describeThunkFailure(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const record = error as { message?: unknown; name?: unknown; payload?: unknown };
    if (typeof record.message === "string" && record.message.length > 0) return record.message;
    if (typeof record.payload === "string" && record.payload.length > 0) return record.payload;
    if (record.name === "ConditionError") {
      return "the read was skipped because a read of the same record is already in flight or already failed — try again in a moment";
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function describeValue(value: unknown): string {
  if (value === undefined) return "unset";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * The changes between two settings objects, in words. Exported so a test
 * pins the sentences the confirm shows.
 */
export function describeSettingsChanges(
  before: FeLlmParams,
  after: FeLlmParams,
): string[] {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  const out: string[] = [];
  for (const key of keys) {
    const was = a[key];
    const now = b[key];
    if (JSON.stringify(was) === JSON.stringify(now)) continue;
    if (now === undefined) out.push(`removes ${key} (was ${describeValue(was)})`);
    else if (was === undefined) out.push(`sets ${key} to ${describeValue(now)}`);
    else out.push(`sets ${key} from ${describeValue(was)} to ${describeValue(now)}`);
  }
  return out;
}

/** Issue sentences for the "cannot fix" side, one per issue. */
export function describeIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((issue) => `${issue.key}: ${issue.message}`).join("; ");
}

/**
 * Plan the fix for one agent, from the live (newest) definition. Reads
 * through the same Redux thunks the builder uses; writes nothing.
 */
export async function planSettingsFix(
  dispatch: AppDispatch,
  getState: () => RootState,
  agentId: string,
  agentName: string,
  newestVersionNumber: number | null,
): Promise<SettingsFixPlan> {
  const base = { agentId, agentName, newestVersionNumber };
  // A record open in the builder with unsaved edits: saving the fix would
  // also commit those edits under the fix's name. Refuse, by sentence.
  const loaded = selectAgentById(getState(), agentId);
  if (loaded?._dirty) {
    return {
      status: "cannot",
      ...base,
      why: `${agentName} has unsaved edits open in the builder — save or discard them first, then fix its settings from here.`,
    };
  }
  try {
    await dispatch(fetchFullAgent(agentId)).unwrap();
  } catch (error) {
    return {
      status: "cannot",
      ...base,
      why: `the agent could not be read: ${describeThunkFailure(error)}`,
    };
  }
  const record = selectAgentById(getState(), agentId);
  if (!record) {
    return { status: "cannot", ...base, why: "the agent was read but did not land in the store." };
  }
  const modelId = record.modelId ?? null;
  if (!modelId) {
    return {
      status: "cannot",
      ...base,
      why: "the agent has no model, so there are no model controls to validate its settings against — open the agent and choose one.",
    };
  }
  // The registry thunk's `condition` SKIPS (and `.unwrap()` throws a plain
  // object) when the full record is already in the store — which it is on the
  // second fix of the same agent in a session. Read the store first; dispatch
  // only when the full controls are missing.
  if (!selectModelFullyLoaded(getState(), modelId)) {
    try {
      await dispatch(fetchModelById(modelId)).unwrap();
    } catch (error) {
      if (!selectModelFullyLoaded(getState(), modelId)) {
        return {
          status: "cannot",
          ...base,
          why: `its model could not be read: ${describeThunkFailure(error)}`,
        };
      }
    }
  }
  const models = selectAllModels(getState());
  const { normalizedControls, error: controlsError } = resolveModelControls(models, modelId);
  if (controlsError || !normalizedControls) {
    return {
      status: "cannot",
      ...base,
      why: controlsError ?? "its model's controls could not be parsed.",
    };
  }
  const model = models.find((m) => m.id === modelId);
  const rawConstraints = model?.constraints;
  const constraints =
    Array.isArray(rawConstraints) && rawConstraints.length > 0
      ? (rawConstraints as ModelConstraint[])
      : null;
  const before: FeLlmParams = record.settings ?? {};
  const issues = validateConfig(
    resolveConfig(before, modelId, normalizedControls as NormalizedControls, constraints),
  ).issues;
  const fixable = issues.filter((issue) => canFixIssue(issue, normalizedControls));
  const manual = issues.filter((issue) => !canFixIssue(issue, normalizedControls));
  if (fixable.length === 0) {
    return {
      status: "nothing_fixable",
      ...base,
      manual,
      why:
        issues.length === 0
          ? `the settings validator finds nothing wrong with ${agentName}'s newest settings on ${model?.name ?? "its model"} — what the impact read flagged is not something the fixer changes. Open the agent, or advance anyway.`
          : `${manual.length} issue${manual.length === 1 ? " needs" : "s need"} a person (${describeIssues(manual)}). Open the agent, or advance anyway.`,
    };
  }
  const after = applyAllFixableIssues(fixable, before, normalizedControls);
  const changes = describeSettingsChanges(before, after);
  if (changes.length === 0) {
    return {
      status: "nothing_fixable",
      ...base,
      manual,
      why: `the fixer found ${fixable.length} fixable issue${fixable.length === 1 ? "" : "s"} but its fix leaves the settings unchanged — nothing to save. Open the agent, or advance anyway.`,
    };
  }
  return { status: "fixable", ...base, fixable, manual, before, after, changes };
}

/** What one fix wrote, for the caller to compare before → after. */
export interface SettingsFixOutcome {
  agentId: string;
  agentName: string;
  fromVersionNumber: number | null;
  /** The version the save is expected to create (N+1), said before the re-read confirms it. */
  expectedVersionNumber: number | null;
  changes: string[];
}

export interface UseImpactSettingsFixOptions {
  /** After a save landed for an agent — the caller re-reads the impact and re-piles. */
  onFixed: (outcomes: SettingsFixOutcome[]) => void;
}

function FixList({ plans }: { plans: SettingsFixPlan[] }) {
  return (
    <div className="max-h-56 space-y-2 overflow-y-auto rounded border border-border bg-muted/30 p-2 text-[11px]">
      {plans.map((plan) => (
        <div key={plan.agentId} className="space-y-0.5">
          <div className="font-medium">
            {plan.agentName}
            {plan.status === "fixable"
              ? ` — creates version ${plan.newestVersionNumber != null ? plan.newestVersionNumber + 1 : "N+1"}`
              : ""}
          </div>
          {plan.status === "fixable" ? (
            <ul className="ml-3 list-disc font-mono">
              {plan.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
              {plan.manual.length > 0 ? (
                <li className="list-none -ml-3 font-sans text-muted-foreground">
                  Still needs a person: {describeIssues(plan.manual)}
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-muted-foreground">Not fixed here — {plan.why}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function useImpactSettingsFix({ onFixed }: UseImpactSettingsFixOptions) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [busy, setBusy] = useState(false);

  /**
   * Fix the agents behind these verdicts (one plan per distinct agent), one
   * confirm for the lot. Resolves to the outcomes that were saved.
   */
  const fix = async (verdicts: readonly ImpactVerdict[]): Promise<SettingsFixOutcome[]> => {
    if (busy || verdicts.length === 0) return [];
    setBusy(true);
    try {
      const agents = new Map<string, ImpactVerdict>();
      for (const verdict of verdicts) {
        if (!agents.has(verdict.agent_id)) agents.set(verdict.agent_id, verdict);
      }
      const plans: SettingsFixPlan[] = [];
      for (const verdict of agents.values()) {
        plans.push(
          await planSettingsFix(
            dispatch,
            store.getState,
            verdict.agent_id,
            verdict.agent_name,
            verdict.latest_version_number ?? null,
          ),
        );
      }
      const fixable = plans.filter((plan): plan is Extract<SettingsFixPlan, { status: "fixable" }> => plan.status === "fixable");
      if (fixable.length === 0) {
        // Every plan said why; say it once, plainly, and keep the Advance door.
        toast.info(
          plans.length === 1
            ? `Nothing to fix automatically on ${plans[0].agentName}.`
            : `Nothing to fix automatically on ${plans.length} agents.`,
          {
            duration: 15_000,
            description: plans.map((plan) => (plan.status === "fixable" ? "" : `${plan.agentName}: ${plan.why}`)).filter(Boolean).join(" "),
          },
        );
        return [];
      }
      const n = fixable.length;
      const ok = await confirm({
        title: n === 1 ? `Fix settings on ${fixable[0].agentName}?` : `Fix settings on ${n} agents?`,
        description: (
          <div className="space-y-2 text-xs">
            <p>
              This edits the {n === 1 ? "agent's" : "agents'"} settings and saves{" "}
              {n === 1 ? "it" : "them"} — the same save as in the builder, which creates a new
              version each. Jobs that track latest use the new version from the moment it lands;
              pinned jobs stay where they are until you advance them. The pins here are graded
              again afterwards, and each row says whether the fix changed its pile.
            </p>
            <FixList plans={plans} />
          </div>
        ),
        confirmLabel: n === 1 ? "Fix and save" : `Fix and save ${n}`,
        cancelLabel: "Leave the settings",
        variant: "default",
      });
      if (!ok) return [];
      const outcomes: SettingsFixOutcome[] = [];
      for (const plan of fixable) {
        dispatch(setAgentSettings({ id: plan.agentId, settings: plan.after }));
        try {
          await dispatch(saveAgent(plan.agentId)).unwrap();
          outcomes.push({
            agentId: plan.agentId,
            agentName: plan.agentName,
            fromVersionNumber: plan.newestVersionNumber,
            expectedVersionNumber:
              plan.newestVersionNumber != null ? plan.newestVersionNumber + 1 : null,
            changes: plan.changes,
          });
        } catch (error) {
          toast.error(
            `Saving the fix on ${plan.agentName} failed: ${error instanceof Error ? error.message : String(error)}`,
            { description: "Its settings were not changed; the pin was not moved." },
          );
        }
      }
      if (outcomes.length > 0) onFixed(outcomes);
      return outcomes;
    } finally {
      setBusy(false);
    }
  };

  return { fix, busy } as const;
}
