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
import { DEFAULT_HOLDER_RUNG } from "@/features/bindings/default-holder-rung";
import type { HolderChoice } from "@/features/mandates/workspace/save-payload";
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

/**
 * The rung a level edits. The system level is the job's OWN DEFAULT — the one
 * record the system answer lives in (aidream 1037); there is no platform-wide
 * binding to edit instead.
 */
export function rungForLevel(
  level: OverridesLevel,
  _data: MandateWorkspaceData,
): WorkspaceRung {
  if (level === "system") return DEFAULT_HOLDER_RUNG;
  return level === "organization" ? "org" : "user";
}

export function findBinding(
  bindings: readonly MandateBindingRowDb[],
  rung: WorkspaceRung,
  userId: string | null,
  organizationId: string | null,
): MandateBindingRowDb | null {
  // The bottom rung is the definition, never a binding.
  if (rung === DEFAULT_HOLDER_RUNG) return null;
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

export function holderDraftOf(
  binding: MandateBindingRowDb | null,
): HolderDraft {
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

/**
 * WHO RUNS THIS JOB FOR THE VIEWER TODAY — the server's verdict
 * (`useMandate` → `GET /mandates/{key}/resolution`), handed in by the host.
 * Never derived here from ladder rows (that would be a fourth hand-written
 * ladder — see `useMandateLadder.ts`).
 */
export type ResolvedHolderForOverrides =
  | { status: "loading" }
  | {
      status: "ready";
      /** The live agent row of the winning holder (never a version id). */
      agentId: string;
      /** The pinned version id when the winning rung pins one. */
      versionId: string | null;
    }
  | { status: "unavailable"; message: string };

export type OverridesHolder =
  /** This level's own record names the holder (or a workflow). */
  | { source: "own"; holder: HolderDraft }
  /**
   * This level chose no holder; the settings shown are those of the agent that
   * actually runs (from a lower rung). Saving writes a SETTINGS-ONLY record at
   * this level — who runs keeps following the lower rung.
   */
  | { source: "resolved"; holder: HolderDraft }
  | { source: "loading" }
  | { source: "none"; message: string | null };

/**
 * The holder whose settings the simple Overrides tab shows.
 *
 * The person and organization levels usually choose NO holder of their own —
 * the job resolves to an agent from a lower rung (the organization, the
 * platform-wide binding, or the job's own default). Showing "No agent is set"
 * there is false: an agent runs, and its settings are what the person may
 * override. So when this level names nobody, the server's verdict names the
 * agent instead.
 */
export function overridesHolderOf(
  own: HolderDraft,
  rung: WorkspaceRung,
  data: MandateWorkspaceData,
  resolved: ResolvedHolderForOverrides | null,
): OverridesHolder {
  if (own.kind === "workflow" || effectiveAgentId(own, data)) {
    return { source: "own", holder: own };
  }
  // The system rungs ARE the bottom of the ladder: nothing sits below them.
  if (rung !== "user" && rung !== "org")
    return { source: "none", message: null };
  if (!resolved) return { source: "none", message: null };
  if (resolved.status === "loading") return { source: "loading" };
  if (resolved.status === "unavailable") {
    return { source: "none", message: resolved.message };
  }
  return {
    source: "resolved",
    holder: {
      kind: "agent",
      agentId: resolved.agentId,
      agentVersionId: resolved.versionId,
      useLatest: resolved.versionId === null,
      workflowId: null,
    },
  };
}

/**
 * The holder a save writes at this level.
 *   · `bindAgentId` — the system-level guard swapped the agent (a twin).
 *   · a RESOLVED holder (this level chose nobody) — SETTINGS-ONLY: overriding a
 *     setting must not start choosing an agent, so who runs keeps following the
 *     lower rung (`chose_holder = false` on the server).
 *   · otherwise the level's own holder goes back exactly as stored.
 */
export function holderChoiceForSave(args: {
  picked: OverridesHolder;
  agentId: string | null;
  bindAgentId: string | null;
}): HolderChoice {
  const { picked, agentId, bindAgentId } = args;
  if (bindAgentId != null && bindAgentId !== agentId) {
    return { agentId: bindAgentId, agentVersionId: null, useLatest: true };
  }
  if (picked.source !== "own") {
    return { agentId: null, agentVersionId: null, useLatest: true };
  }
  const holder = picked.holder;
  return {
    agentId: holder.useLatest ? agentId : null,
    agentVersionId: holder.useLatest ? null : holder.agentVersionId,
    useLatest: holder.useLatest,
  };
}
