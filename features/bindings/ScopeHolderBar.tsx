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
  /**
   * F3 — the standing sentence about what moving the rung costs, printed
   * whenever there IS something to lose. `null` when the draft is clean, so it
   * is a fact about right now and never decorative noise.
   */
  unsavedNote?: string | null;
  /**
   * 🚨 WHERE THE SAVED ROW ACTUALLY ANSWERS — the SERVER'S sentence
   * (`BindingResult.applies_in`, aidream v0.2.456), printed verbatim under the
   * rung it describes.
   *
   * The three rungs are not symmetric about organizations and the row cannot be
   * read to find out: a user binding stamps an org that is bookkeeping, not a
   * scope, and it follows the person into every organization they work in. That
   * was read as a leak once already (V3-CORRECTNESS F10). The write path is the
   * only thing that knows, so it says it and this cell shows it — `null` until
   * a write has spoken, because the alternative is the client inventing a
   * scope sentence the server never agreed to.
   */
  appliesIn?: string | null;

  holder: HolderDraft;
  onHolderChange: (next: HolderDraft) => void;
  /**
   * The holder agent's REAL NAME, resolved by the workspace.
   *
   * 🚨 V2 finding G2: without it `EntityRef` falls back to `id.slice(0,8)…`,
   * so the loudest thing in the HOLDER cell was the raw UUID prefix
   * `8cfa8351…` with the human name truncated beneath it. A name is never a
   * UUID when a name exists; `null` means it genuinely is not read yet, and
   * the cell says so rather than printing an id as if it were an identity.
   */
  holderName?: string | null;

  /** The job being bound — identity, what it answers in, what it offers. */
  job: {
    mandateKey: string;
    label: string;
    outputKind: string | null;
    /** null while the offer is still being read — never a premature 0. */
    offeredCount: number | null;
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
  unsavedNote = null,
  appliesIn = null,
  holder,
  onHolderChange,
  holderName = null,
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
      </header>

      {/* 🚨 THREE CELLS, PROPORTIONED TO WHAT THEY HOLD (V2 finding G3, a
          re-occurrence of a class Arman rejected by name). Equal thirds gave
          the HOLDER — a name, a version control and its consequence sentence —
          the same 240px the RUNG's one select gets, so the holder overflowed
          while the RUNG cell sat 62% empty and the JOB cell 73%. The holder now
          takes the width it needs and the two reference cells compress first,
          exactly as the match's own grid template already does with its rails.
          The ladder sentence moved OUT of the header and INTO the rung cell:
          it is a fact about the rung, so it belongs where the rung is chosen —
          which fills that cell with meaning instead of padding. */}
      <div className="grid gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,1fr)]">
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
          {/* THE RUNG EXPLAINS ITSELF IN ITS OWN CELL — who it covers and what
              it overrides — instead of a lone select in dead space. */}
          {/* `ladderLine` OPENS with this rung's own `covers` sentence and then
              names which rungs are answered today — one paragraph, not two, so
              the cell is filled with the ladder rather than with a repeat. */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {ladderLine}
          </p>
          {/* THE SAVED ROW SAYS WHERE IT ANSWERS, in the server's own words —
              beneath the ladder sentence, which is about the rung you are
              choosing, not about the row that exists. */}
          {appliesIn ? (
            <p className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">
                Saved — where this applies:{" "}
              </span>
              {appliesIn}
            </p>
          ) : null}
          {!allowGlobal ? (
            <p className="text-[10.5px] leading-snug text-muted-foreground/80">
              The system rung — the answer everybody gets — is a super-admin
              decision, so it is not offered here.
            </p>
          ) : null}
          {unsavedNote ? (
            <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
              {unsavedNote}
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
              {/* The holder's IDENTITY gets a full line of its own. It used to
                  sit in a flex row beside the version panel and rendered as
                  "Agent G…" / "Specializes i…" — a name nobody could read. */}
              {/* 🚨 THE NAME, WHOLE (V2 G2). Two defects lived in these six
                  lines: `EntityRef` with no `name` prints `id.slice(0,8)…`, so
                  a raw UUID prefix was the loudest thing in the cell; and its
                  default `truncate` clipped "Masterwork Method Interrog…" at
                  1280. `name` gives it the identity and `wrap` gives it the
                  whole line — a holder is the answer to "what runs this", and
                  half of that answer is not an answer. */}
              <div className="min-w-0 rounded-md border border-border px-2 py-1.5">
                {holderName ? (
                  <EntityRef
                    token="agent"
                    id={holder.agentId}
                    name={holderName}
                    wrap
                    fill
                    className="block w-full text-[12.5px] font-medium"
                  />
                ) : (
                  <p className="text-[12px] text-muted-foreground">
                    Reading this agent&apos;s name…
                  </p>
                )}
              </div>
              <AgentVersionPicker
                subjectNoun="job"
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
              {job.offeredCount === null
                ? "reading what it offers…"
                : `offers ${job.offeredCount}`}
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
