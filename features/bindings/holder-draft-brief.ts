// features/bindings/holder-draft-brief.ts
//
// ── THE BRIEF THE "+ AGENT" DOOR HANDS THE DRAFTING JOB ──────────────────────
//
// `mandates.holder_draft` (aidream `services/mandates/holder_draft_mandates.py`)
// drafts the agent that fulfils ONE Mandate. Its Provision,
// `mandates.holder_draft_brief`, offers exactly what the workspace already has
// in hand — the job's goal, its offered values, its output contract, who will
// own the agent and what holds the job today. This module is the ONE place
// those offered values are assembled, keyed by their declared names, so the
// launch and the declaration cannot drift apart without this file changing.
//
// Pure: no React, no reads. Jest-pinned in `__tests__/holder-draft-brief.test.ts`.

import type { MandateWorkspaceData } from "@/features/mandates/workspace/useMandateWorkspaceData";
import type { OfferedValue } from "@/features/mandates/provision-shapes";
import { splitMandateKey } from "@/features/mandates/mandate-key";
import type { AgentOwner } from "@/features/agents/agent-creators/services/agentBuilderService";
import type { HolderDraft, WorkspaceRung } from "./ScopeHolderBar";
import { DEFAULT_HOLDER_RUNG } from "./default-holder-rung";

/** The provision's owner_scope vocabulary — the server's words, not ours. */
export type HolderDraftOwnerScope = "system" | "organization" | "user";

export interface HolderDraftBriefInput {
  data: MandateWorkspaceData;
  /** What the job offers, as the workspace resolved it (provision or described). */
  offeredValues: readonly OfferedValue[];
  /** The holder in the controls right now — the draft replaces or joins it. */
  holder: HolderDraft;
  owner: AgentOwner;
}

/**
 * WHOSE AGENT THE DOOR CREATES, from the rung it stands on — the SAME rule the
 * holder picker enforces on its list (`ScopeHolderBar.holderRestriction`):
 *
 *  · the platform-wide binding, or the job's own default when the job is homed
 *    in the system organization, runs for every user → a SYSTEM agent;
 *  · an organization's binding, or an org-homed default, runs for that
 *    organization's members → an agent that organization owns;
 *  · a person's binding → their own.
 *
 * `null` when the rung is an organization's but no organization is named yet
 * — the door cannot create an agent nobody would own, and says so.
 */
export function holderDraftOwnerOf(input: {
  rung: WorkspaceRung;
  organizationId: string | null;
  systemHomed: boolean;
}): AgentOwner | null {
  const { rung, organizationId, systemHomed } = input;
  if (rung === DEFAULT_HOLDER_RUNG) {
    if (systemHomed) return { kind: "system" };
    return organizationId ? { kind: "organization", organizationId } : null;
  }
  if (rung === "org") {
    return organizationId ? { kind: "organization", organizationId } : null;
  }
  return { kind: "user" };
}

export function ownerScopeOf(owner: AgentOwner): HolderDraftOwnerScope {
  return owner.kind;
}

/**
 * The offered values of `mandates.holder_draft_brief`, keyed by their declared
 * names. Optional values are OMITTED when the workspace has nothing honest to
 * send (never an empty string standing in for "unknown").
 */
export function buildHolderDraftBrief(
  input: HolderDraftBriefInput,
): Record<string, unknown> {
  const { data, offeredValues, holder, owner } = input;
  const mandate = data.mandate;
  const brief: Record<string, unknown> = {
    mandate_key: mandate.mandate_key,
    mandate_label: mandate.label ?? mandate.mandate_key,
    feature: splitMandateKey(mandate.mandate_key).feature,
    goal: mandate.goal ?? "",
    offered_values: offeredValues.map((value) => ({
      name: value.name,
      kind: value.kind,
      guaranteed: value.guaranteed,
      lazy: value.lazy,
      description: value.description,
      ...(value.example ? { example: value.example } : {}),
    })),
    accepts_user_input: String(mandate.accepts_user_input ?? true),
    owner_scope: ownerScopeOf(owner),
  };
  const description = mandate.description?.trim();
  if (description) brief.description = description;
  if (mandate.output_kind) brief.output_kind = mandate.output_kind;
  if (data.contract.requiredOutputKeys.length > 0) {
    brief.required_output_keys = data.contract.requiredOutputKeys;
  }
  if (data.pins && Object.keys(data.pins).length > 0) brief.pins = data.pins;

  const currentHolder = currentHolderOf(holder, data);
  if (currentHolder) brief.current_holder = currentHolder;
  return brief;
}

function currentHolderOf(
  holder: HolderDraft,
  data: MandateWorkspaceData,
): { kind: "agent" | "workflow"; name: string | null; agent_id?: string } | null {
  if (holder.kind === "agent" && holder.agentId) {
    return {
      kind: "agent",
      name: data.agentsById[holder.agentId]?.name ?? null,
      agent_id: holder.agentId,
    };
  }
  if (holder.kind === "workflow" && holder.workflowId) {
    return { kind: "workflow", name: null };
  }
  return null;
}
