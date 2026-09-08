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
//  4. 🚨 THE PICKER IS THE WHOLE CONTROL. Arman, 2026-09-08: *"The agent
//     dropdown is written to be a self-reliant and inclusive system that
//     doesn't require all of this extra trash around it! … Allow it to work
//     naturally to show the selected agent and all links and information come
//     up within it so there is no need for anything else."*
//
//     `AgentListDropdown` already names the assigned agent on its own trigger
//     and carries, INSIDE it, every door and fact a reader could want: the
//     hover detail card, the sneak peek, open-in-chat, open-in-new-tab,
//     favorite, categories, tags, search. This screen used to override the
//     trigger's label with "Change agent" and then rebuild the lost identity
//     beside it — the name a second time, the raw uuid, and a lone "Open it"
//     link. All three are DELETED: the label is now the agent's name, and the
//     row holds one control.
//
//     `WorkflowListDropdown` is the same control for the other holder type
//     (features/workflow-runtime/listings) — built to full parity for exactly
//     this reason, so the Workflow branch is a picker and not a wall of rows.
//
// Every control carries `data-holder-control` — the render guards count them,
// so a second chooser appearing anywhere in a mandate screen's tree fails a
// test rather than a walk.

import { useEffect, useRef, useState } from "react";
import {
  PropertyRow,
  FieldHelp,
} from "@/components/official/ConfigurationFields";
import { cn } from "@/lib/utils";
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
import { WorkflowListDropdown } from "@/features/workflow-runtime/listings/WorkflowListDropdown";
import type { HolderDraft } from "./ScopeHolderBar";

/** "Latest" as a select value. `null` is the stored form; this is the option. */
export const LATEST_VERSION_VALUE = "latest";

export interface HolderAssignmentProps {
  holder: HolderDraft;
  onHolderChange: (next: HolderDraft) => void;
  /**
   * The holder's real name, when the host already knows it — the picker names
   * the record itself from its own read, so this is a head start, never the
   * only source.
   */
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
  /**
   * 🚨 RESTORED BY FIX-R13/B — ONE LINE, not a paragraph, and not a fourth
   * control.
   *
   * `coverageLine()` — *"Every input this holder needs is fed — all 3."* —
   * lived in the JOB cell, which FIX-R9-UI deleted on the system host to obey
   * D19. Nothing else on that page states whether what the job offers actually
   * covers what the holder needs, so a reader could set a holder, read a
   * healthy verdict about it, and never learn a required input was unmapped.
   *
   * D19 permits it: it is a FACT the three controls cannot state, it is one
   * line, and it carries no control of its own — the `data-holder-control`
   * count stays three. `null` on every host that still has a JOB cell, so it
   * is never said twice.
   */
  coverageLine?: string | null;
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
      className="grid gap-x-3 gap-y-1.5 sm:grid-cols-[9.5rem_minmax(0,1fr)]"
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
  coverageLine = null,
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
                      workflowId:
                        kind === "workflow" ? holder.workflowId : null,
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
          <WorkflowListDropdown
            activeWorkflowId={holder.workflowId}
            label={holder.workflowId ? (holderName ?? undefined) : undefined}
            placeholder="Choose a workflow"
            wantedOutputKind={outputKind}
            disabled={disabled}
            className="w-full max-w-[22rem]"
            onSelect={(id) => onHolderChange({ ...holder, workflowId: id })}
          />
        ) : (
          <AgentListDropdown
            consumerId={`one-binding-holder-${mandateKey}`}
            activeAgentId={holder.agentId}
            visibleTabs={agentTabs?.visibleTabs}
            initialTab={agentTabs?.initialTab}
            includeSystemInAll={agentTabs?.includeSystemInAll}
            systemTabLabel="System"
            className="w-full max-w-[22rem]"
            // THE NAME IS THE LABEL. Not "Change agent" — the trigger IS the
            // statement of who holds this job, and the dropdown resolves the
            // name itself when the host has not got one yet.
            label={
              holder.agentId ? (holderName ?? undefined) : "Choose an agent"
            }
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
      ) : (
        <Row label="Version" control="version">
          <span className="text-xs">
            {isWorkflow && holder.workflowId ? "Latest" : "No holder selected"}
          </span>
          {isWorkflow ? (
            <FieldHelp label="Workflow version">
              Pinned workflow versions are not supported by this assignment
              control.
            </FieldHelp>
          ) : null}
        </Row>
      )}

      {/* THE COVERAGE FACT — one line, attached to the assignment it is about.
          It is honest in both directions: "Every input this holder needs is
          fed — all 3." and "1 required input is still unmapped, and a run
          would refuse." are the same sentence builder. */}
      {coverageLine ? (
        <p
          data-testid="holder-coverage-line"
          className="text-[11.5px] leading-relaxed text-muted-foreground"
        >
          {coverageLine}
        </p>
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

  const value =
    useLatest || !agentVersionId ? LATEST_VERSION_VALUE : agentVersionId;
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
            <SelectItem value={value}>
              A version this list cannot name
            </SelectItem>
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
