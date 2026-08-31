"use client";

// features/bindings/ScopeHolderBar.tsx
//
// WHO THIS IS FOR, AND WHAT RUNS — three cells across the top of the one
// binding UI: RUNG · HOLDER · JOB.
//
// UI-STANDARD P13: scope is ONE DESCRIBED CONTROL INSIDE THE FLOW, not a
// property of which URL family you happened to open. Before this, `/mandates/…`
// meant "my answer", `/organizations/…/mandates/…` meant "my org's answer" and
// the system answer lived on a different page family entirely — the person
// editing never saw the ladder they were standing on and could not move. The
// routes survive as entry points and PRE-SELECT the rung (D1, resolved
// 2026-08-31 by the defaults rule).
//
// The rung control is `ShortcutScopePicker` — the same described select the
// shortcut UI has used for months, each rung carrying its own sentence and
// revealing an entity picker when it needs one. It is given `allowedScopes`
// because a mandate binding is written for a user, an org, or everybody
// (`agent.mandate_binding.principal_type`) and has no project or task rung:
// offering one would be a control that cannot be saved.

import { Workflow as WorkflowIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { AgentVersionPicker } from "@/features/agent-shortcuts/components/AgentVersionPicker";
import { ShortcutScopePicker } from "@/features/agent-shortcuts/components/ShortcutScopePicker";
import { AGENT_SCOPES, type AgentScope } from "@/features/agent-shortcuts/constants";
import { WorkflowHolderPicker } from "./WorkflowHolderPicker";

/** The rungs a mandate binding can actually be written at. */
export type BindingRung = "global" | "org" | "user";

export interface HolderDraft {
  kind: "agent" | "workflow";
  agentId: string | null;
  agentVersionId: string | null;
  useLatest: boolean;
  workflowId: string | null;
}

export interface ScopeHolderBarProps {
  rung: BindingRung;
  organizationId: string | null;
  /** Super-admin authority — the system rung is theirs alone (server 403s). */
  allowGlobal: boolean;
  onRungChange: (rung: BindingRung, organizationId: string | null) => void;

  holder: HolderDraft;
  onHolderChange: (next: HolderDraft) => void;

  /** The job being bound — identity, what it answers in, what it offers. */
  job: {
    mandateKey: string;
    label: string;
    outputKind: string | null;
    offeredCount: number;
    offerSourceLine: string;
  };

  /** One honest sentence about the ladder as it stands right now. */
  ladderLine: string;
  disabled?: boolean;
}

const RUNG_TO_SCOPE: Record<BindingRung, AgentScope> = {
  global: AGENT_SCOPES.GLOBAL,
  org: AGENT_SCOPES.ORGANIZATION,
  user: AGENT_SCOPES.USER,
};

const MANDATE_SCOPES: readonly AgentScope[] = [
  AGENT_SCOPES.GLOBAL,
  AGENT_SCOPES.ORGANIZATION,
  AGENT_SCOPES.USER,
];

function scopeToRung(scope: AgentScope): BindingRung {
  if (scope === AGENT_SCOPES.GLOBAL) return "global";
  if (scope === AGENT_SCOPES.ORGANIZATION) return "org";
  return "user";
}

export function ScopeHolderBar({
  rung,
  organizationId,
  allowGlobal,
  onRungChange,
  holder,
  onHolderChange,
  job,
  ladderLine,
  disabled = false,
}: ScopeHolderBarProps) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-3 py-2">
        <h3 className="text-[12.5px] font-semibold text-foreground">
          Who this is for, and what runs
        </h3>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {ladderLine}
        </p>
      </header>

      <div className="grid gap-4 p-3 lg:grid-cols-3">
        {/* ── RUNG ── */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Rung
          </p>
          <ShortcutScopePicker
            scope={RUNG_TO_SCOPE[rung]}
            scopeId={organizationId ?? undefined}
            allowGlobal={allowGlobal}
            allowedScopes={MANDATE_SCOPES}
            disabled={disabled}
            onScopeChange={(scope, scopeId) =>
              onRungChange(scopeToRung(scope), scopeId ?? null)
            }
          />
          {!allowGlobal ? (
            <p className="text-[10.5px] leading-snug text-muted-foreground/80">
              The system rung — the answer everybody gets — is a super-admin
              decision, so it is not offered here.
            </p>
          ) : null}
          {rung === "org" && !organizationId ? (
            <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
              Pick the organization this answer is for — nothing can be saved
              until you do.
            </p>
          ) : null}
        </div>

        {/* ── HOLDER ── */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Holder
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <AgentListDropdown
              consumerId={`one-binding-holder-${job.mandateKey}`}
              activeAgentId={holder.kind === "agent" ? holder.agentId : null}
              label={
                holder.kind === "agent" && holder.agentId
                  ? "Change agent"
                  : "Choose an agent"
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
            <Button
              variant={holder.kind === "workflow" ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5"
              disabled={disabled}
              onClick={() =>
                onHolderChange({
                  kind: "workflow",
                  agentId: null,
                  agentVersionId: null,
                  useLatest: true,
                  workflowId: holder.workflowId,
                })
              }
            >
              <WorkflowIcon className="h-3.5 w-3.5" />
              {holder.kind === "workflow" && holder.workflowId
                ? "Change workflow"
                : "Use a workflow"}
            </Button>
          </div>

          {holder.kind === "workflow" ? (
            <WorkflowHolderPicker
              mandateOutputKind={job.outputKind}
              value={holder.workflowId}
              onChange={(id) => onHolderChange({ ...holder, workflowId: id })}
              disabled={disabled}
            />
          ) : holder.agentId ? (
            <div className="space-y-1.5">
              <EntityRef
                token="agent"
                id={holder.agentId}
                className="text-[12.5px] font-medium"
              />
              <AgentVersionPicker
                agentId={holder.agentId}
                agentVersionId={holder.agentVersionId}
                useLatest={holder.useLatest}
                onAgentVersionIdChange={(next) =>
                  onHolderChange({ ...holder, agentVersionId: next })
                }
                onUseLatestChange={(next) =>
                  onHolderChange({
                    ...holder,
                    useLatest: next,
                    agentVersionId: next ? null : holder.agentVersionId,
                  })
                }
                disabled={disabled}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                {holder.useLatest
                  ? "Latest: your edits to this agent apply here automatically — convenient, but an edit that changes its inputs or output can break this job until you fix it."
                  : "Pinned: this job keeps running exactly this version, immune to later edits — you choose when to update."}
              </p>
            </div>
          ) : (
            <p className="text-[11px] leading-snug text-muted-foreground">
              No holder yet — pick an agent or a workflow to start mapping, or
              come back when the intelligence exists.
            </p>
          )}
        </div>

        {/* ── THE JOB ── */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Job
          </p>
          <div className="rounded-md border border-border px-2 py-1.5">
            <span className="block text-[12px] font-medium text-foreground">
              {job.label}
            </span>
            <code className="block font-mono text-[10px] text-muted-foreground">
              {job.mandateKey}
            </code>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="py-0 font-mono text-[9.5px]">
              {job.outputKind ?? "no declared output kind"}
            </Badge>
            <Badge variant="outline" className="py-0 text-[9.5px]">
              offers {job.offeredCount}
            </Badge>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {job.offerSourceLine}
          </p>
        </div>
      </div>
    </section>
  );
}

/** What each rung covers, in one sentence — the ladder, said out loud (P13). */
export function rungWords(rung: BindingRung): { noun: string; covers: string } {
  switch (rung) {
    case "global":
      return {
        noun: "the system answer",
        covers:
          "Everybody on the platform gets this, unless their organization or they themselves override it.",
      };
    case "org":
      return {
        noun: "an organization's answer",
        covers:
          "Everyone in one organization gets this. It overrides the system answer; a member may still override it for themselves.",
      };
    default:
      return {
        noun: "your own answer",
        covers:
          "This applies everywhere you run. It overrides your organization's answer and the system answer.",
      };
  }
}
