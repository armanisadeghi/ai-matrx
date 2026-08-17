"use client";

/**
 * THE REBIND GUARD — every path that changes a mandate's bound agent goes through
 * here, so the console can never again suggest a swap and then perform it
 * blind. See `rebind-impact.ts` for why this exists.
 *
 * Doctrine (cross-repo SoR: common-docs/systems/agent-variable-binding/FEATURE.md):
 * loud, never blocking. A clean swap saves with no interruption; a lossy one
 * states EXACTLY what stops flowing, offers the copy-paste fix brief, and still
 * lets the admin proceed deliberately. Refusing the write would be
 * over-tightening, which is itself a defect.
 */

import { useCallback, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { parseMandateContract } from "@/features/agents/mandates/overrides";
import {
  buildRebindFixBrief,
  computeRebindImpact,
  type RebindImpact,
} from "./rebind-impact";
import { VariableVerdictList } from "./variable-verdict-presentation";
import {
  updateMandateDefinition,
  type MandateCodeTruth,
  type MandateDefinitionRow,
} from "./service";

export interface RebindRequest {
  /** The agent to bind. */
  agentId: string;
  /** Human name, for the dialog and the fix brief. */
  agentName: string;
  /** Pin to a specific version, or null to track latest. */
  versionId?: string | null;
  useLatest?: boolean;
  successMessage: string;
}

/** Reads an agent's declared variables, or null when they can't be read. */
async function readAgentVariables(
  dispatch: ReturnType<typeof useAppDispatch>,
  store: ReturnType<typeof useAppStore>,
  agentId: string | null,
): Promise<VariableDefinition[] | null> {
  if (!agentId) return null;
  try {
    await dispatch(fetchAgentExecutionMinimal(agentId)).unwrap();
  } catch {
    return null;
  }
  const payload = selectAgentExecutionPayload(store.getState(), agentId);
  if (!payload.isReady) return null;
  return payload.variableDefinitions ?? [];
}

export function useGuardedRebind({
  mandate,
  currentAgentId,
  codeTruth,
  onSaved,
}: {
  mandate: MandateDefinitionRow;
  currentAgentId: string | null;
  codeTruth?: MandateCodeTruth | null;
  onSaved: () => void;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{
    request: RebindRequest;
    impact: RebindImpact;
  } | null>(null);

  const write = useCallback(
    async (request: RebindRequest) => {
      setSaving(true);
      try {
        await updateMandateDefinition(mandate.id, {
          default_agent_id: request.agentId,
          default_agent_version_id: request.versionId ?? null,
          use_latest: request.useLatest ?? true,
        });
        toast.success(request.successMessage);
        setPending(null);
        onSaved();
      } catch (error: unknown) {
        toast.error(
          `Rebind failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setSaving(false);
      }
    },
    [onSaved, mandate.id],
  );

  /**
   * Check first, then write. A clean swap never interrupts the admin; a lossy
   * one opens the dialog and waits.
   */
  const requestRebind = useCallback(
    async (request: RebindRequest) => {
      setChecking(true);
      try {
        const [currentVariables, candidateVariables] = await Promise.all([
          readAgentVariables(dispatch, store, currentAgentId),
          readAgentVariables(dispatch, store, request.agentId),
        ]);
        // The candidate itself being unreadable is not a "clean" swap — say so
        // rather than waving it through.
        if (candidateVariables === null) {
          setPending({
            request,
            impact: {
              variables: [],
              breaking: [],
              cautions: [],
              clean: false,
              indeterminate: true,
            },
          });
          return;
        }
        const impact = computeRebindImpact({
          currentVariables,
          candidateVariables,
          contractRequired: parseMandateContract(mandate.contract).requiredVariables,
          codeSuppliedVariables: codeTruth?.code_variables,
        });
        if (impact.clean && !impact.indeterminate) {
          await write(request);
          return;
        }
        setPending({ request, impact });
      } finally {
        setChecking(false);
      }
    },
    [codeTruth?.code_variables, currentAgentId, dispatch, mandate.contract, store, write],
  );

  const dialog = pending ? (
    <ConfirmDialog
      open
      onOpenChange={(open) => !saving && !open && setPending(null)}
      title={
        pending.impact.breaking.length > 0
          ? "This rebind stops values from reaching the agent"
          : "Check this rebind before saving"
      }
      description={
        pending.impact.indeterminate
          ? "The declared variables for one of these agents could not be read, so the impact of this swap is unknown. Saving anyway is a blind change."
          : `Swapping to ${pending.request.agentName} changes what actually reaches the prompt.`
      }
      // Block-level content must live here — `description` renders inside a <p>.
      content={
        <div className="space-y-2 text-xs">
          {pending.impact.indeterminate && (
            <div className="flex items-start gap-1.5 text-amber-600">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>Proceeding without knowing what breaks.</span>
            </div>
          )}
          {pending.impact.variables.length > 0 && (
            <VariableVerdictList items={pending.impact.variables} hideOk />
          )}
          {pending.impact.breaking.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton
                content={buildRebindFixBrief({
                  mandateKey: mandate.slot_key,
                  candidateName: pending.request.agentName,
                  impact: pending.impact,
                  codeTruth: codeTruth ?? undefined,
                })}
                label="Copy fix brief for AI"
                tooltip="A paste-ready brief naming the mismatch and every call site to update"
                size="sm"
              />
              <span className="text-[11px] text-muted-foreground">
                Paste it into a coding session to have the code and the agent
                updated together.
              </span>
            </div>
          )}
        </div>
      }
      confirmLabel={
        pending.impact.breaking.length > 0 ? "Rebind anyway" : "Rebind"
      }
      variant={pending.impact.breaking.length > 0 ? "destructive" : "default"}
      busy={saving}
      onConfirm={() => void write(pending.request)}
    />
  ) : null;

  return { requestRebind, dialog, checking, saving };
}
