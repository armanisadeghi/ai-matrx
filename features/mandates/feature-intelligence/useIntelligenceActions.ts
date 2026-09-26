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
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { isJsonObject, type JsonObject } from "@/types/json";
import { extractErrorMessage } from "@/utils/errors";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { duplicateWorkflow, duplicateWorkflowVersion } from "@/features/workflow-runtime/browse/service";
import {
  putMandateBinding,
  removeMandateBinding,
  type BindingWriteReport,
  type MandateBindingPrincipalInput,
} from "../overrides";
import { duplicateMandateAgent } from "../useCopyMandateAgent";
import { resolvePersonalOrgId } from "@/lib/organizations/personalOrg";
import { fetchMandateLadder } from "../workspace/useMandateLadder";
import { parseConsumptionMap, type ConsumptionMap } from "../provision-shapes";
import type { HolderDraft } from "@/features/bindings/ScopeHolderBar";
import type { FeatureIntelligenceRow, IntelligenceLevel } from "./types";
import { fetchFeatureIntelligence } from "./service";

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

/**
 * One short line for the person (Arman, 2026-09-26: no novels). The server's
 * `appliesIn` paragraph explains binding scope in bookkeeping terms; the card's
 * ladder already shows where the choice now sits, so the toast says the
 * outcome only. Server notes are warnings and still show.
 */
function reportToast(report: BindingWriteReport, message: string): void {
  toast.success(message);
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
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const principal = principalFor(seat);
  const where =
    seat.level === "organization" ? "for your organization" : "for you";

  const readChoice = async (row: FeatureIntelligenceRow) => {
    const rows = await fetchFeatureIntelligence({
      feature: row.mandateKey.split(".")[0],
      level: seat.level,
      organizationId: seat.organizationId,
      userId,
    });
    return rows.find((candidate) => candidate.mandateKey === row.mandateKey);
  };

  const choiceIsActive = async (row: FeatureIntelligenceRow, copyId: string) => {
    const updated = await readChoice(row);
    return updated?.decidedRung === rungFor(seat.level) && updated.holderId === copyId;
  };

  const duplicateAndModify = async (
    row: FeatureIntelligenceRow,
    options?: { effectiveTopicAgentId?: string; afterBind?: () => Promise<void> },
  ) => {
    const sourceId = options?.effectiveTopicAgentId ?? row.holderId;
    const sourceType = options?.effectiveTopicAgentId ? "agent" : row.holderType;
    if (!sourceId || (sourceType !== "agent" && sourceType !== "workflow")) {
      toast.error("No agent or workflow is assigned to this job yet, so there is nothing to duplicate. Use your own instead.");
      return;
    }
    setBusyKey(row.mandateKey);
    let copyId: string | null = null;
    try {
      const running = await runningAnswer(row, seat);
      // Where the copy lives: the organization this seat manages, or — on a
      // personal page — the person's OWN workspace. A personal action never
      // asks "Which workspace is this for?" (review 2026-09-25).
      const home =
        seat.level === "organization" && seat.organizationId
          ? seat.organizationId
          : await resolvePersonalOrgId();
      // A topic's old per-record agent is a run-scope override. The server
      // runs it verbatim, without the underlying org/user rung's settings.
      // Copy that behavior rather than silently importing rung settings.
      const configOverrides = options?.effectiveTopicAgentId
        ? null
        : running.configOverrides;
      const consumptionMap = options?.effectiveTopicAgentId
        ? undefined
        : running.consumptionMap;
      let destination: string;
      let report: BindingWriteReport;
      if (sourceType === "workflow") {
        const copy = running.versionId
          ? await duplicateWorkflowVersion(running.versionId, home)
          : await duplicateWorkflow(sourceId, home);
        copyId = copy.id;
        report = await putMandateBinding(dispatch, row.mandateKey, principal, {
          holderType: "workflow",
          holderId: copy.id,
          holderVersionId: null,
          agentId: null,
          configOverrides,
          consumptionMap,
        });
        destination = `/workflows/${copy.id}`;
      } else {
        copyId = await duplicateMandateAgent(dispatch, {
          overrideAgentId: options?.effectiveTopicAgentId ?? (running.versionId ? null : sourceId),
          defaultAgentId: sourceId,
          defaultAgentVersionId: options?.effectiveTopicAgentId ? null : running.versionId,
          organizationId: home,
        });
        report = await putMandateBinding(dispatch, row.mandateKey, principal, {
          holderType: "agent",
          agentId: copyId,
          configOverrides,
          consumptionMap,
        });
        destination = `/agents/${copyId}/build`;
      }
      const active = report.contractCheck?.state !== "unmet" && await choiceIsActive(row, copyId);
      if (!active) {
        toast.info(report.contractCheck?.summary ?? "Your copy is connected, but the mandate has set it aside. It needs attention before it can run.");
      } else if (options?.afterBind) {
        // Only remove an older topic choice after the new mandate answer is
        // proven runnable. A saved red binding may be edited without taking
        // the working topic choice away.
        try {
          await options.afterBind();
        } catch (error) {
          toast.error(`Your copy is connected, but this topic still uses its older choice: ${extractErrorMessage(error)}`);
          router.push(destination);
          return;
        }
      }
      if (active) reportToast(report, `Your copy now runs this job ${where}. Opening it to edit.`);
      router.push(destination);
    } catch (error) {
      if (isOrganizationSelectionCancelled(error)) return;
      toast.error(copyId
        ? `The copy was created, but this page could not confirm it runs the job: ${extractErrorMessage(error)}`
        : `Could not duplicate: ${extractErrorMessage(error)}`);
    } finally {
      setBusyKey(null);
    }
  };

  const setOwn = async (
    row: FeatureIntelligenceRow,
    draft: HolderDraft,
    afterBind?: () => Promise<void>,
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
      const selectedId = isWorkflow ? draft.workflowId : draft.agentId;
      const active = selectedId && report.contractCheck?.state !== "unmet"
        ? await choiceIsActive(row, selectedId)
        : false;
      if (active) {
        if (afterBind) {
          try {
            await afterBind();
          } catch (error) {
            toast.error(`Your choice is connected, but this topic still uses its older choice: ${extractErrorMessage(error)}`);
            return true;
          }
        }
        reportToast(report, `Your choice now runs this job ${where}.`);
      } else {
        toast.info(report.contractCheck?.summary ?? "Your choice was saved but is not active yet. Open its details to repair it.");
      }
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
      try {
        const inherited = await readChoice(row);
        toast.success(inherited?.holderId
          ? `Choice removed. ${inherited.holderName} now runs this job (${inherited.decidedBy}).`
          : "Choice removed. This job has no assigned intelligence now.");
      } catch {
        toast.success("Choice removed. Refresh to see the inherited assignment.");
      }
    } catch (error) {
      toast.error(`Could not reset: ${extractErrorMessage(error)}`);
    } finally {
      setBusyKey(null);
    }
  };

  return { busyKey, duplicateAndModify, setOwn, resetToDefault };
}
