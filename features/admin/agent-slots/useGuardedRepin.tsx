"use client";

/**
 * THE REPIN GUARD — every path that changes a slot's bound agent goes through
 * here, so the console can never again suggest a swap and then perform it
 * blind. See `repin-impact.ts` for why this exists.
 *
 * Doctrine (cross-repo SoR: common-docs/systems/agent-variable-binding/FEATURE.md):
 * loud, never blocking. A clean swap saves with no interruption; a lossy one
 * states EXACTLY what stops flowing, offers the copy-paste fix brief, and still
 * lets the admin proceed deliberately. Refusing the write would be
 * over-tightening, which is itself a defect.
 */

import { useCallback, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { parseSlotContract } from "@/features/agents/slots/overrides";
import {
  buildRepinFixBrief,
  computeRepinImpact,
  type RepinImpact,
  type RepinVariableImpact,
} from "./repin-impact";
import { updateSlotDefinition, type SlotDefinitionRow } from "./service";

export interface RepinRequest {
  /** The agent to bind. */
  agentId: string;
  /** Human name, for the dialog and the fix brief. */
  agentName: string;
  /** Pin to a specific version, or null to track latest. */
  versionId?: string | null;
  useLatest?: boolean;
  successMessage: string;
}

const VERDICT_COPY: Record<
  RepinVariableImpact["verdict"],
  { label: string; tone: "bad" | "warn" | "ok" }
> = {
  lost: { label: "stops reaching the agent", tone: "bad" },
  unsupplied_required: { label: "required, nothing supplies it", tone: "bad" },
  rename_candidate: { label: "same value, different name", tone: "warn" },
  default_available: { label: "agent default will be used", tone: "ok" },
  ok: { label: "keeps flowing", tone: "ok" },
};

function ImpactRow({ item }: { item: RepinVariableImpact }) {
  const copy = VERDICT_COPY[item.verdict];
  return (
    <li className="flex flex-wrap items-center gap-1.5 py-0.5">
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
        {item.name}
      </code>
      {item.suggestedMapping && (
        <>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
            {item.suggestedMapping}
          </code>
        </>
      )}
      <Badge
        variant={copy.tone === "bad" ? "destructive" : "outline"}
        className="h-4 px-1 text-[10px]"
      >
        {copy.label}
      </Badge>
    </li>
  );
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

export function useGuardedRepin({
  slot,
  currentAgentId,
  onSaved,
}: {
  slot: SlotDefinitionRow;
  currentAgentId: string | null;
  onSaved: () => void;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{
    request: RepinRequest;
    impact: RepinImpact;
  } | null>(null);

  const write = useCallback(
    async (request: RepinRequest) => {
      setSaving(true);
      try {
        await updateSlotDefinition(slot.id, {
          default_agent_id: request.agentId,
          default_agent_version_id: request.versionId ?? null,
          use_latest: request.useLatest ?? true,
        });
        toast.success(request.successMessage);
        setPending(null);
        onSaved();
      } catch (error: unknown) {
        toast.error(
          `Repin failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setSaving(false);
      }
    },
    [onSaved, slot.id],
  );

  /**
   * Check first, then write. A clean swap never interrupts the admin; a lossy
   * one opens the dialog and waits.
   */
  const requestRepin = useCallback(
    async (request: RepinRequest) => {
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
        const impact = computeRepinImpact({
          currentVariables,
          candidateVariables,
          contractRequired: parseSlotContract(slot.contract).requiredVariables,
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
    [currentAgentId, dispatch, slot.contract, store, write],
  );

  const dialog = pending ? (
    <ConfirmDialog
      open
      onOpenChange={(open) => !saving && !open && setPending(null)}
      title={
        pending.impact.breaking.length > 0
          ? "This repin stops values from reaching the agent"
          : "Check this repin before saving"
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
            <ul className="rounded border border-border bg-muted/30 p-2">
              {pending.impact.variables
                .filter((item) => item.verdict !== "ok")
                .map((item) => (
                  <ImpactRow key={`${item.name}-${item.verdict}`} item={item} />
                ))}
            </ul>
          )}
          {pending.impact.breaking.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton
                content={buildRepinFixBrief({
                  slotKey: slot.slot_key,
                  candidateName: pending.request.agentName,
                  impact: pending.impact,
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
        pending.impact.breaking.length > 0 ? "Repin anyway" : "Repin"
      }
      variant={pending.impact.breaking.length > 0 ? "destructive" : "default"}
      busy={saving}
      onConfirm={() => void write(pending.request)}
    />
  ) : null;

  return { requestRepin, dialog, checking, saving };
}
