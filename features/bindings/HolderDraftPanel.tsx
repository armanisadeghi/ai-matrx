"use client";

// features/bindings/HolderDraftPanel.tsx
//
// ── THE "+ AGENT" DOOR — CREATE THE AGENT THAT HOLDS THIS JOB ────────────────
//
// Arman, 2026-09-20: *"anywhere you allow assigning a holder, you're also going
// to add an option for + Agent so the user can create an agent … the return
// item is going to be the generated agent in the same form as the main agent
// page: agents/new/generate … when the agent is created … set that agent so the
// user can adjust the settings and save … allow the user to see and edit it via
// the advanced agent editing window panel."*
//
// So this is the Create Agent tab of the Mandate workspace: THE agent generator
// (`AgentGenerator`, the same component `/agents/new/generate` mounts) in its
// mandate mode. It hands the drafting job (`mandates.holder_draft`) everything
// this screen knows about the Mandate, receives the created agent's id, sets
// it into the holder controls (Latest) and opens the advanced editor on it.
// Nothing is saved to the binding here — the person reviews and presses the
// one Save that already exists.
//
// WHOSE AGENT: `owner` is decided by the rung the controls stand on
// (`holderDraftOwnerOf`), never by the page. The system rung creates a system
// agent; an organization's rung an agent the organization owns; a person's
// rung their own — the same rule the picker enforces on its list.

import { AgentGenerator } from "@/features/agents/agent-creators/interactive-builder/AgentGenerator";
import type { AgentOwner } from "@/features/agents/agent-creators/services/agentBuilderService";
import type { MandateWorkspaceData } from "@/features/mandates/workspace/useMandateWorkspaceData";
import type { OfferedValue } from "@/features/mandates/provision-shapes";
import { useOpenAgentContentWindow } from "@/features/overlays/openers/agentAdvancedEditorWindow";
import { buildHolderDraftBrief } from "./holder-draft-brief";
import type { HolderDraft } from "./ScopeHolderBar";
import {
  RequestAccess,
  type RequestAccessTarget,
} from "@/features/access-gate/components/RequestAccess";

export interface HolderDraftPanelProps {
  data: MandateWorkspaceData;
  offeredValues: readonly OfferedValue[];
  holder: HolderDraft;
  /** `null` when the rung names no owner yet (an org rung with no org). */
  owner: AgentOwner | null;
  /** Called with the created agent; the host sets the holder and opens the editor. */
  onCreated: (agentId: string) => void;
  /**
   * The PERMISSION refusal for this rung, in the host's words — the person may
   * not write this answer, so an agent created here could never be bound.
   * `null` when they may. Never derived from a transient busy flag: an earlier
   * version printed "you can read this but not change it" during every save,
   * which was a lie, and never printed it for the case it was written for.
   */
  refusal?: string | null;
  /** With a permission refusal: who to ask (owner ruling 2026-09-25). */
  requestAccess?: RequestAccessTarget | null;
}

export function HolderDraftPanel({
  data,
  offeredValues,
  holder,
  owner,
  onCreated,
  refusal = null,
  requestAccess = null,
}: HolderDraftPanelProps) {
  const openEditor = useOpenAgentContentWindow();

  if (refusal) {
    return (
      <div className="space-y-2">
        <p
          data-testid="holder-draft-refused"
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground"
        >
          {refusal}
        </p>
        {requestAccess ? (
          <RequestAccess target={requestAccess} reason="" />
        ) : null}
      </div>
    );
  }
  if (!owner) {
    return (
      <p
        data-testid="holder-draft-no-owner"
        className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground"
      >
        Pick the organization this answer is for on the Mandate Holder tab first — a
        new agent has to belong to someone before it can be drafted.
      </p>
    );
  }
  const variables = buildHolderDraftBrief({ data, offeredValues, holder, owner });
  const ownerLine =
    owner.kind === "system"
      ? "A system agent — it runs for every user on the platform."
      : owner.kind === "organization"
        ? "An agent this organization owns — it runs for its members."
        : "Your own agent.";

  return (
    <div
      data-testid="holder-draft-panel"
      className="min-h-[36rem] rounded-xl border border-border bg-card"
    >
      <AgentGenerator
        mandate={{
          variables,
          owner,
          summary: (
            // Label ABOVE value, not beside it: this sits in the generator's
            // 40% column, and a label|value grid there squeezes the goal into
            // a ribbon three words wide.
            <dl className="space-y-2.5 rounded-lg border border-border bg-background p-3 text-[12px]">
              <Fact label="Job" value={data.mandate.label ?? data.mandate.mandate_key} />
              <Fact
                label="Goal"
                value={
                  data.mandate.goal?.trim() ||
                  "No goal has been written for this job yet."
                }
              />
              <Fact
                label="Values it will be given"
                value={
                  offeredValues.length > 0
                    ? offeredValues.map((v) => v.name).join(", ")
                    : "None — this job offers no values."
                }
                mono={offeredValues.length > 0}
              />
              <Fact
                label="Answer it must produce"
                value={
                  [
                    data.mandate.output_kind
                      ? `kind: ${data.mandate.output_kind}`
                      : null,
                    data.contract.requiredOutputKeys.length > 0
                      ? `keys: ${data.contract.requiredOutputKeys.join(", ")}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No output contract declared."
                }
              />
              <Fact label="Owner" value={ownerLine} />
            </dl>
          ),
          onCreated: (agentId) => {
            onCreated(agentId);
            // The advanced editor opens on the new agent so the person can
            // read and adjust it before saving it as the Holder.
            openEditor({ initialAgentId: agentId });
          },
        }}
      />
    </div>
  );
}

/** One fact, label above value, so the value owns the column's full width. */
function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={
          mono
            ? "mt-0.5 font-mono text-[11.5px] leading-relaxed text-foreground"
            : "mt-0.5 leading-relaxed text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}
