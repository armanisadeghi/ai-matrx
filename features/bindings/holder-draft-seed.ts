// features/bindings/holder-draft-seed.ts
//
// The stored row -> the holder DRAFT the three controls edit. Pure, so the one
// rule that matters is jest-covered: what the row says is what the screen
// opens on — including a WORKFLOW version pin (workflow parity, 2026-09-25:
// the draft had no field for it, so opening a pinned workflow binding and
// saving anything silently unpinned it).

import {
  agentHolderOfBinding,
  holderOfMandate,
  isFloatingBinding,
} from "@/lib/supabase/mandateStorage";
import { parseBindingWave1 } from "@/features/mandates/provision-shapes";
import type {
  MandateBindingRowDb,
  MandateRowDb,
} from "@/features/mandates/workspace/useMandateWorkspaceData";
import type { HolderDraft } from "./ScopeHolderBar";

export function holderDraftOf(binding: MandateBindingRowDb | null): HolderDraft {
  const wave1 = parseBindingWave1(binding);
  const agent = agentHolderOfBinding(binding ?? {});
  return {
    kind: wave1.holderType === "workflow" ? "workflow" : "agent",
    agentId: agent.holderId,
    agentVersionId: agent.versionId,
    useLatest: binding ? isFloatingBinding(binding) : true,
    workflowId: wave1.holderType === "workflow" ? wave1.holderId : null,
    workflowVersionId:
      wave1.holderType === "workflow" ? wave1.holderVersionId : null,
  };
}

/**
 * THE BOTTOM RUNG'S CURRENT ANSWER — the mandate definition's own default
 * holder, read through the one accessor (`holderOfMandate`) so no screen names
 * `default_holder_*` a second time.
 *
 * 🚨 A pinned default stores BOTH the agent's definition id and the version:
 * `mandate._rungs` reads `chose_holder = (default_holder_id IS NOT NULL)`, so a
 * version-only default would return a bottom rung that names nobody. `useLatest`
 * is therefore derived from the VERSION being absent, never from a stored flag.
 */
export function defaultHolderDraftOf(mandate: MandateRowDb): HolderDraft {
  const held = holderOfMandate(mandate);
  const isWorkflow = held.holderType === "workflow";
  return {
    kind: isWorkflow ? "workflow" : "agent",
    agentId: isWorkflow ? null : held.holderId,
    agentVersionId: isWorkflow ? null : held.versionId,
    useLatest: held.versionId === null,
    workflowId: isWorkflow ? held.holderId : null,
    workflowVersionId: isWorkflow ? held.versionId : null,
  };
}

/**
 * Which Holder a draft names — the thing a consumption map's keys belong to
 * (its input names). A version change keeps the identity; a different agent,
 * a different workflow, or a change of kind does not.
 */
export function holderIdentityOf(draft: HolderDraft): string {
  return draft.kind === "workflow"
    ? `workflow:${draft.workflowId ?? ""}`
    : `agent:${draft.agentId ?? draft.agentVersionId ?? ""}`;
}
