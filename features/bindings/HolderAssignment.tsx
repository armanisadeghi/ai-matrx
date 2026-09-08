"use client";

// features/bindings/HolderAssignment.tsx
//
// ── THE HOLDER ASSIGNMENT: THREE CONTROLS, ONE PLACE ─────────────────────────
//
// Arman, 2026-09-08, verbatim and load-bearing:
//
//   "You have a mandate and it has to be met by: 1) Workflow or Agent. 2) A
//    specific ID 3) Is version or latest. That's it. 3 values are all that is
//    needed and then the mapping of the inputs. The ui acts as though there are
//    so many more things and it's horrible. … The ui should just say:
//      Holder Type: Agent | Workflow (A switch)
//      Assigned Agent or Workflow: [Dropdown V]
//      Version: [Latest or specific version selected from dropdown]"
//
// So this component is that, and nothing else. It is the ONE holder chooser in
// the repo: every host that assigns a holder mounts THIS (the class fix — the
// three values were previously chosen in one place, displayed in a second and
// nudged from a third, all with different words).
//
// THREE RULES IT ENFORCES BY CONSTRUCTION:
//  1. LABELS, NOT PARAGRAPHS. A control that needs a paragraph is the wrong
//     control. The only sentence this component can print is a REFUSAL — a
//     constraint the controls themselves cannot state.
//  2. THE VERSION QUESTION COMES AFTER THE INTELLIGENCE (Arman, 2026-08-31:
//     "that question may only be asked AFTER an intelligence is selected").
//     No holder ⇒ no version control at all — absent, never disabled-looking.
//  3. LATEST IS A VALUE, NOT A SWITCH. Storage is `default_holder_version_id
//     IS NULL` ⇒ latest; there is no `use_latest` flag, so the screen does not
//     invent a second control for one column.
//
// Every control carries `data-holder-control` — the render guards count them,
// so a second chooser appearing anywhere in a mandate screen's tree fails a
// test rather than a walk.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch } from "@/lib/redux/hooks";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import type { AgentTab } from "@/features/agents/redux/agent-consumers/slice";
import {
  fetchAgentVersionHistory,
  type AgentVersionHistoryItem,
} from "@/features/agents/redux/agent-definition/thunks";
import { WorkflowHolderPicker } from "./WorkflowHolderPicker";
import type { HolderDraft } from "./ScopeHolderBar";

/** "Latest" as a select value. `null` is the stored form; this is the option. */
export const LATEST_VERSION_VALUE = "latest";

export interface HolderAssignmentProps {
  holder: HolderDraft;
  onHolderChange: (next: HolderDraft) => void;
  /** The holder agent's real name — never an id where a name exists. */
  holderName?: string | null;
  /** Identity for the dropdown's consumer slot. */
  mandateKey: string;
  /** What may hold this job here — enforced on the list, not warned about. */
  agentTabs?: {
    visibleTabs?: readonly AgentTab[];
    initialTab?: AgentTab;
    includeSystemInAll?: boolean;
  };
  /** The mandate's declared output kind, for the workflow picker. */
  outputKind?: string | null;
  /**
   * A REFUSAL — the one thing a control cannot say about itself (a personal
   * agent drafted where only a system agent may hold). One sentence with its
   * remedy, or `null`.
   */
  refusal?: string | null;
  disabled?: boolean;
}

function Row({
  label,
  control,
  children,
}: {
  label: string;
  control: "type" | "assignment" | "version";
  children: React.ReactNode;
}) {
  return (
    <div
      data-holder-control={control}
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5"
    >
      <span className="w-[9.5rem] shrink-0 text-[12px] font-medium text-foreground">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}

export function HolderAssignment({
  holder,
  onHolderChange,
  holderName = null,
  mandateKey,
  agentTabs,
  outputKind = null,
  refusal = null,
  disabled = false,
}: HolderAssignmentProps) {
  const isWorkflow = holder.kind === "workflow";

  return (
    <div className="space-y-2.5">
      {/* 1 — HOLDER TYPE. A switch between the only two things that can hold
          a job. Changing it clears the other kind's value rather than carrying
          a stale id under a label that no longer names it. */}
      <Row label="Holder Type" control="type">
        <div
          role="radiogroup"
          aria-label="Holder Type"
          className="inline-flex rounded-md border border-border p-0.5"
        >
          {(
            [
              ["agent", "Agent"],
              ["workflow", "Workflow"],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={holder.kind === kind}
              disabled={disabled}
              onClick={() =>
                holder.kind === kind
                  ? undefined
                  : onHolderChange({
                      kind,
                      agentId: kind === "agent" ? holder.agentId : null,
                      agentVersionId: null,
                      useLatest: true,
                      workflowId: kind === "workflow" ? holder.workflowId : null,
                    })
              }
              className={cn(
                "rounded px-2.5 py-1 text-[12px] transition-colors",
                holder.kind === kind
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "opacity-60",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Row>

      {/* 2 — WHO. One dropdown. It names the agent (or the workflow) and shows
          THAT record's id — never a version id, which is a different record and
          was the id this screen used to print. */}
      <Row
        label={isWorkflow ? "Assigned Workflow" : "Assigned Agent"}
        control="assignment"
      >
        {isWorkflow ? (
          <WorkflowHolderPicker
            mandateOutputKind={outputKind}
            value={holder.workflowId}
            onChange={(id) => onHolderChange({ ...holder, workflowId: id })}
            disabled={disabled}
          />
        ) : (
          <>
            <AgentListDropdown
              consumerId={`one-binding-holder-${mandateKey}`}
              activeAgentId={holder.agentId}
              visibleTabs={agentTabs?.visibleTabs}
              initialTab={agentTabs?.initialTab}
              includeSystemInAll={agentTabs?.includeSystemInAll}
              systemTabLabel="System"
              label={holder.agentId ? "Change agent" : "Choose an agent"}
              onSelect={(id) =>
                onHolderChange({
                  kind: "agent",
                  agentId: id,
                  agentVersionId: null,
                  useLatest: true,
                  workflowId: null,
                })
              }
            />
            {holder.agentId ? (
              <>
                <EntityRef
                  token="agent"
                  id={holder.agentId}
                  name={holderName ?? undefined}
                  wrap
                  className="min-w-0 text-[12.5px] font-medium"
                />
                {/* THE AGENT'S OWN ID, said out loud — Arman: *"Some Agent Name
                    with Agent ID (Not a version id)"*. The version id is a
                    different record and belongs to the control below; printing
                    it here is how the screen used to answer "which agent" with
                    a number nobody could look up. */}
                <code
                  data-testid="holder-agent-id"
                  className="font-mono text-[10.5px] text-muted-foreground/80"
                >
                  {holder.agentId}
                </code>
              </>
            ) : null}
          </>
        )}
      </Row>

      {/* 3 — VERSION. ABSENT until an intelligence is chosen: the question has
          no meaning before it, and a control that cannot mean anything is the
          dead control the fourth law forbids. A workflow holder pins no agent
          version, so it has no version control either. */}
      {!isWorkflow && holder.agentId ? (
        <Row label="Version" control="version">
          <VersionSelect
            agentId={holder.agentId}
            agentVersionId={holder.agentVersionId}
            useLatest={holder.useLatest}
            disabled={disabled}
            onChange={(versionId) =>
              onHolderChange({
                ...holder,
                agentVersionId: versionId,
                useLatest: versionId === null,
              })
            }
          />
        </Row>
      ) : null}

      {refusal ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[11.5px] leading-relaxed text-destructive">
          {refusal}
        </p>
      ) : null}
    </div>
  );
}

/**
 * ONE DROPDOWN FOR ONE COLUMN. `Latest` is the first option and it stores
 * `null`; a version number stores that version's id. The old pair — a switch
 * plus a dropdown the switch disabled — was two controls for one value.
 */
function VersionSelect({
  agentId,
  agentVersionId,
  useLatest,
  onChange,
  disabled,
}: {
  agentId: string;
  agentVersionId: string | null;
  useLatest: boolean;
  onChange: (versionId: string | null) => void;
  disabled?: boolean;
}) {
  const dispatch = useAppDispatch();
  const [versions, setVersions] = useState<AgentVersionHistoryItem[]>([]);
  const [state, setState] = useState<"reading" | "ready" | "failed">("reading");
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (fetchedFor.current === agentId) return;
    fetchedFor.current = agentId;
    setState("reading");
    dispatch(fetchAgentVersionHistory({ agentId, limit: 50, offset: 0 }))
      .unwrap()
      .then((items) => {
        setVersions(
          [...items].sort((a, b) => b.version_number - a.version_number),
        );
        setState("ready");
      })
      .catch(() => setState("failed"));
  }, [agentId, dispatch]);

  const value = useLatest || !agentVersionId ? LATEST_VERSION_VALUE : agentVersionId;
  const known =
    value === LATEST_VERSION_VALUE ||
    versions.some((v) => v.version_id === value);

  return (
    <>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) =>
          onChange(next === LATEST_VERSION_VALUE ? null : next)
        }
      >
        <SelectTrigger className="h-7 w-[13rem] text-[12px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={LATEST_VERSION_VALUE}>Latest</SelectItem>
          {versions.map((v) => (
            <SelectItem key={v.version_id} value={v.version_id}>
              v{v.version_number}
            </SelectItem>
          ))}
          {/* A pin this list does not contain is still the stored answer, and
              the control must be able to show it — silently falling back to
              "Latest" would display a version the job is not running. */}
          {!known ? (
            <SelectItem value={value}>A version this list cannot name</SelectItem>
          ) : null}
        </SelectContent>
      </Select>
      {state === "failed" ? (
        <span className="text-[11px] text-destructive">
          This agent&apos;s versions could not be read — reload to choose one.
        </span>
      ) : null}
    </>
  );
}
