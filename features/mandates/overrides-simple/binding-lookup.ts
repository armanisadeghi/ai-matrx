// features/mandates/overrides-simple/binding-lookup.ts
//
// Which stored record the simple Overrides tab edits, and which agent holds it.
//
// COPIED, not imported: these are private functions of
// `features/bindings/OneBindingWorkspace.tsx` (findBinding, holderDraftOf,
// defaultHolderDraftOf, effectiveAgentId), and that file is owner-protected —
// the simple tab must not change it. The logic is kept identical so both tabs
// resolve the same row and the same holder for the same mandate.

import {
  agentHolderOfBinding,
  holderOfMandate,
  isFloatingBinding,
} from "@/lib/supabase/mandateStorage";
import {
  isOfferedSource,
  parseBindingWave1,
  type ConsumptionMap,
} from "@/features/mandates/provision-shapes";
import { hasLiveGlobalBinding } from "@/features/bindings/system-answer-record";
import { DEFAULT_HOLDER_RUNG } from "@/features/bindings/default-holder-rung";
import type {
  HolderDraft,
  WorkspaceRung,
} from "@/features/bindings/ScopeHolderBar";
import type {
  MandateBindingRowDb,
  MandateRowDb,
  MandateWorkspaceData,
} from "@/features/mandates/workspace/useMandateWorkspaceData";

/** The three levels the Overrides tab serves — the same as the workspace's. */
export type OverridesLevel = "system" | "organization" | "person";

/** The rung a level edits. System follows the data (FIX-R13/A). */
export function rungForLevel(
  level: OverridesLevel,
  data: MandateWorkspaceData,
): WorkspaceRung {
  if (level === "system") {
    return hasLiveGlobalBinding(data.bindings) ? "global" : DEFAULT_HOLDER_RUNG;
  }
  return level === "organization" ? "org" : "user";
}

export function findBinding(
  bindings: readonly MandateBindingRowDb[],
  rung: WorkspaceRung,
  userId: string | null,
  organizationId: string | null,
): MandateBindingRowDb | null {
  if (rung === DEFAULT_HOLDER_RUNG) return null;
  if (rung === "global") {
    return bindings.find((b) => b.principal_type === "global") ?? null;
  }
  if (rung === "org") {
    if (!organizationId) return null;
    return (
      bindings.find(
        (b) =>
          b.principal_type === "org" && b.organization_id === organizationId,
      ) ?? null
    );
  }
  return (
    bindings.find(
      (b) => b.principal_type === "user" && b.subject_user_id === userId,
    ) ?? null
  );
}

export function holderDraftOf(binding: MandateBindingRowDb | null): HolderDraft {
  const wave1 = parseBindingWave1(binding);
  const agent = agentHolderOfBinding(binding ?? {});
  return {
    kind: wave1.holderType === "workflow" ? "workflow" : "agent",
    agentId: agent.holderId,
    agentVersionId: agent.versionId,
    useLatest: binding ? isFloatingBinding(binding) : true,
    workflowId: wave1.holderType === "workflow" ? wave1.holderId : null,
  };
}

export function defaultHolderDraftOf(mandate: MandateRowDb): HolderDraft {
  const held = holderOfMandate(mandate);
  const isWorkflow = held.holderType === "workflow";
  return {
    kind: isWorkflow ? "workflow" : "agent",
    agentId: isWorkflow ? null : held.holderId,
    agentVersionId: isWorkflow ? null : held.versionId,
    useLatest: held.versionId === null,
    workflowId: isWorkflow ? held.holderId : null,
  };
}

/** A pinned version resolves to its master agent. */
export function effectiveAgentId(
  holder: HolderDraft,
  data: MandateWorkspaceData,
): string | null {
  if (holder.kind === "workflow") return null;
  if (holder.agentId) return holder.agentId;
  if (holder.agentVersionId) {
    return data.versionsById[holder.agentVersionId]?.agentId ?? null;
  }
  return null;
}

/** An unfinished pick (an offered source with no value chosen) never reaches the wire. */
export function withoutUnpicked(map: ConsumptionMap): ConsumptionMap {
  const out: ConsumptionMap = {};
  for (const [name, sources] of Object.entries(map)) {
    const chosen = sources.filter(
      (entry) => !isOfferedSource(entry) || entry.target !== "",
    );
    if (chosen.length > 0) out[name] = chosen;
  }
  return out;
}
