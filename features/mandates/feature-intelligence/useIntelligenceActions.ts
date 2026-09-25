"use client";

// features/mandates/feature-intelligence/useIntelligenceActions.ts
//
// THE THREE ACTIONS on every job (Arman, 2026-09-25: "duplicate & modify
// whatever is assigned, or set your own"):
//
//   Duplicate & modify — copy the agent OR workflow that runs the job now into
//     the viewer's space, answer the job with the copy at the viewer's level,
//     and open the copy for editing. The copy carries the running rung's input
//     mapping and settings, so it runs exactly like the original until edited.
//   Use my own        — answer the job with any agent or workflow the viewer
//     can open (no mapping sent: the holder receives the job's inputs by name).
//   Reset to default  — remove the viewer's answer at this level.
//
// Every write goes through the one bind path (`putMandateBinding` /
// `removeMandateBinding`); the server's refusal is shown verbatim.

import { useState } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { isJsonObject, type JsonObject } from "@/types/json";
import { extractErrorMessage } from "@/utils/errors";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { duplicateWorkflow } from "@/features/workflow-runtime/browse/service";
import {
  putMandateBinding,
  removeMandateBinding,
  type BindingWriteReport,
  type MandateBindingPrincipalInput,
} from "../overrides";
import { useCopyMandateAgent } from "../useCopyMandateAgent";
import { fetchMandateLadder } from "../workspace/useMandateLadder";
import { parseConsumptionMap, type ConsumptionMap } from "../provision-shapes";
import type { HolderDraft } from "@/features/bindings/ScopeHolderBar";
import type { FeatureIntelligenceRow, IntelligenceLevel } from "./types";

export interface IntelligenceSeat {
  level: IntelligenceLevel;
  /** The organization managed (organization level) or resolved in (person). */
  organizationId: string | null;
}

export function principalFor(seat: IntelligenceSeat): MandateBindingPrincipalInput {
  return seat.level === "organization" && seat.organizationId
    ? { principalType: "org", organizationId: seat.organizationId }
    : { principalType: "user" };
}

/** The rung this seat writes — the one "Reset" removes. */
export function rungFor(level: IntelligenceLevel): "user" | "org" {
  return level === "organization" ? "org" : "user";
}

function reportToast(report: BindingWriteReport, fallback: string): void {
  toast.success(report.appliesIn ?? fallback);
  for (const note of report.notes) toast.info(note);
}

interface RunningAnswer {
  versionId: string | null;
  configOverrides: JsonObject | null;
  consumptionMap: ConsumptionMap | undefined;
}

/** What the deciding rung runs with — copied onto the duplicate. */
async function runningAnswer(
  row: FeatureIntelligenceRow,
  seat: IntelligenceSeat,
): Promise<RunningAnswer> {
  const ladder = await fetchMandateLadder(row.mandateKey, seat.organizationId);
  const rung =
    ladder.find(
      (entry) =>
        entry.rung === row.decidedRung &&
        entry.chose_holder &&
        entry.holder_id === row.holderId,
    ) ?? ladder.find((entry) => entry.rung === row.decidedRung) ?? null;
  return {
    versionId: rung?.holder_version_id ?? null,
    configOverrides: isJsonObject(rung?.config_overrides)
      ? (rung.config_overrides as JsonObject)
      : null,
    consumptionMap:
      rung?.consumption_map != null
        ? parseConsumptionMap(rung.consumption_map)
        : undefined,
  };
}

export function useIntelligenceActions(seat: IntelligenceSeat) {
  const dispatch = useAppDispatch();
  const { copyAndOpen } = useCopyMandateAgent();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const principal = principalFor(seat);
  const where =
    seat.level === "organization" ? "for your organization" : "for you";

  const duplicateAndModify = async (row: FeatureIntelligenceRow) => {
    if (!row.holderId || (row.holderType !== "agent" && row.holderType !== "workflow")) {
      toast.error("No agent or workflow is assigned to this job yet, so there is nothing to duplicate. Use your own instead.");
      return;
    }
    setBusyKey(row.mandateKey);
    try {
      const running = await runningAnswer(row, seat);
      if (row.holderType === "workflow") {
        let copy: { id: string; name: string };
        try {
          copy = await duplicateWorkflow(row.holderId);
        } catch (error) {
          if (!isOrganizationSelectionCancelled(error)) {
            toast.error(`Could not copy the workflow: ${extractErrorMessage(error)}`);
          }
          return;
        }
        try {
          const report = await putMandateBinding(dispatch, row.mandateKey, principal, {
            holderType: "workflow",
            holderId: copy.id,
            holderVersionId: null,
            agentId: null,
            configOverrides: running.configOverrides,
            consumptionMap: running.consumptionMap,
          });
          reportToast(report, `"${copy.name}" now runs this job ${where}. Opening it to edit.`);
        } catch (error) {
          toast.error(
            `Copied into "${copy.name}", but it could not be set for this job: ${extractErrorMessage(error)}`,
          );
        }
        window.location.assign(`/workflows/${copy.id}`);
        return;
      }
      await copyAndOpen(
        {
          overrideAgentId: running.versionId ? null : row.holderId,
          defaultAgentId: row.holderId,
          defaultAgentVersionId: running.versionId,
        },
        {
          connect: async (newAgentId) => {
            try {
              const report = await putMandateBinding(
                dispatch,
                row.mandateKey,
                principal,
                {
                  holderType: "agent",
                  agentId: newAgentId,
                  configOverrides: running.configOverrides,
                  consumptionMap: running.consumptionMap,
                },
              );
              for (const note of report.notes) toast.info(note);
            } catch (error) {
              toast.error(`The copy could not be set for this job: ${extractErrorMessage(error)}`);
              throw error;
            }
          },
          connectedMessage: `Your copy now runs this job ${where}. Opening it to edit.`,
          copiedOnlyMessage: "Your copy was made and is opening, but this job still runs the original.",
        },
      );
    } catch (error) {
      toast.error(`Could not duplicate: ${extractErrorMessage(error)}`);
    } finally {
      setBusyKey(null);
    }
  };

  const setOwn = async (
    row: FeatureIntelligenceRow,
    draft: HolderDraft,
  ): Promise<boolean> => {
    setBusyKey(row.mandateKey);
    try {
      const isWorkflow = draft.kind === "workflow";
      const report = await putMandateBinding(dispatch, row.mandateKey, principal, {
        holderType: draft.kind,
        agentId: isWorkflow ? null : draft.agentId,
        agentVersionId: isWorkflow ? null : draft.agentVersionId,
        useLatest: isWorkflow ? draft.workflowVersionId == null : draft.useLatest,
        holderId: isWorkflow ? draft.workflowId : null,
        holderVersionId: isWorkflow ? (draft.workflowVersionId ?? null) : null,
        configOverrides: null,
      });
      reportToast(report, `Your choice now runs this job ${where}.`);
      return true;
    } catch (error) {
      toast.error(extractErrorMessage(error));
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const resetToDefault = async (row: FeatureIntelligenceRow) => {
    setBusyKey(row.mandateKey);
    try {
      await removeMandateBinding(dispatch, row.mandateKey, principal);
      toast.success(
        seat.level === "organization"
          ? "Your organization's choice was removed. Members get the default again."
          : "Your choice was removed. The job runs the default again.",
      );
    } catch (error) {
      toast.error(`Could not reset: ${extractErrorMessage(error)}`);
    } finally {
      setBusyKey(null);
    }
  };

  return { busyKey, duplicateAndModify, setOwn, resetToDefault };
}
