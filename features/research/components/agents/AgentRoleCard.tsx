"use client";

/**
 * AgentRoleCard — one research pipeline role, backed by an agent slot.
 * Thin consumer of the canonical agent-slots primitives
 * (`features/agents/slots/`): ContractItem rows, the shared Copy & Update
 * hook (useCopySlotAgent), and SlotAgentPicker in controlled-override mode —
 * the write path stays research's own `rs_topic.agent_config` (via
 * onApply/onRemove from TopicAgentsPage). The old raw UUID paste box +
 * Validate button was replaced by the canonical picker (its contract
 * pre-flight blocks a non-conforming candidate before the write).
 */

import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCopy,
  CopyPlus,
  Hash,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentById,
  selectAgentExecutionPayload,
} from "@/features/agents/redux/agent-definition/selectors";
import type { RootState } from "@/lib/redux/store";
import { systemContractRows } from "@/features/agents/slots/contract-compare";
import { useCopySlotAgent } from "@/features/agents/slots/useCopySlotAgent";
import { ContractItem } from "@/features/agents/slots/components/ContractItem";
import { SlotAgentPicker } from "@/features/agents/slots/components/SlotAgentPicker";
import type { AgentRoleDefinition } from "./constants";
import { shortUuid } from "./utils";

// ─── Status pills ──────────────────────────────────────────────────────────

type Tone = "neutral" | "primary" | "success" | "destructive" | "warning";

const TONE_CLASSES: Record<Tone, string> = {
  neutral:
    "bg-muted/50 text-muted-foreground ring-1 ring-inset ring-border/60",
  primary: "bg-primary/8 text-primary ring-1 ring-inset ring-primary/20",
  success:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20",
  destructive:
    "bg-destructive/8 text-destructive ring-1 ring-inset ring-destructive/20",
  warning:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20",
};

function StatusPill({
  tone,
  icon: Icon,
  children,
}: {
  tone: Tone;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-tight",
        TONE_CLASSES[tone],
      )}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {children}
    </span>
  );
}

// ─── Role card ─────────────────────────────────────────────────────────────

interface AgentRoleCardProps {
  role: AgentRoleDefinition;
  /** UUID currently saved as the override on the topic (or null). */
  currentOverrideId: string | null;
  isApplying: boolean;
  onApply: (candidateId: string) => Promise<void>;
  onRemove: () => Promise<void>;
}

export function AgentRoleCard({
  role,
  currentOverrideId,
  isApplying,
  onApply,
  onRemove,
}: AgentRoleCardProps) {
  const dispatch = useAppDispatch();
  const Icon = role.icon;
  const { copying, copyAndOpen } = useCopySlotAgent();

  const systemPayload = useAppSelector((s: RootState) =>
    selectAgentExecutionPayload(s, role.systemAgentId),
  );
  const systemAgent = useAppSelector((s: RootState) =>
    selectAgentById(s, role.systemAgentId),
  );
  const overrideAgent = useAppSelector((s: RootState) =>
    currentOverrideId ? selectAgentById(s, currentOverrideId) : undefined,
  );

  // Lazy-load the system contract on first mount.
  useEffect(() => {
    if (!systemPayload.isReady) {
      dispatch(fetchAgentExecutionMinimal(role.systemAgentId)).catch(() => {
        /* errors surface via Redux _error; no toast on autoload */
      });
    }
  }, [dispatch, role.systemAgentId, systemPayload.isReady]);

  const [removeOpen, setRemoveOpen] = useState(false);

  const systemRows = useMemo(
    () =>
      systemPayload.isReady
        ? systemContractRows({
            variableDefinitions: systemPayload.variableDefinitions,
            contextSlots: systemPayload.contextSlots,
          })
        : { variables: [], slots: [] },
    [systemPayload],
  );

  // Copy & Update — the ONE shared implementation (fork the exact record the
  // server runs; a failed connect must not masquerade as a failed copy).
  const handleCopyUpdate = () => {
    void copyAndOpen(
      {
        overrideAgentId: currentOverrideId,
        defaultAgentId: role.systemAgentId,
        defaultAgentVersionId: role.systemVersionId,
      },
      {
        connect: (newId) => onApply(newId),
        connectedMessage: "Copied — opening your editable version to update",
        copiedOnlyMessage:
          "Copied your editable version — connect it to this role later",
      },
    );
  };

  const copyId = (id: string) => {
    void navigator.clipboard.writeText(id).then(
      () => toast.success("Copied agent ID"),
      () => toast.error("Couldn't copy"),
    );
  };

  // Header pill state
  const overrideActive = !!currentOverrideId && !role.systemOnly;
  const headerPill = role.systemOnly ? (
    <StatusPill tone="neutral" icon={Lock}>
      System level
    </StatusPill>
  ) : overrideActive ? (
    <StatusPill tone="primary" icon={KeyRound}>
      Override active
    </StatusPill>
  ) : (
    <StatusPill tone="neutral" icon={ShieldCheck}>
      System default
    </StatusPill>
  );

  return (
    <article
      className={cn(
        "group relative rounded-2xl border border-border/60 bg-card transition-colors",
        "hover:border-border",
      )}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex items-start gap-3 px-5 pt-5">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            overrideActive
              ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/15"
              : "bg-muted/50 text-muted-foreground ring-1 ring-inset ring-border/60",
          )}
          aria-hidden
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {role.label}
            </h3>
            {headerPill}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {role.description}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">
            {role.usedBy}
          </p>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="grid gap-px border-t border-border/40 bg-border/40 mt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-px">
        {/* Required contract */}
        <section className="bg-card px-5 py-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Required contract
            </h4>
            <span className="font-mono text-[10.5px] text-muted-foreground/60">
              {systemAgent?.name ?? shortUuid(role.systemAgentId)}
            </span>
          </div>

          {!systemPayload.isReady ? (
            <ContractSkeleton />
          ) : systemRows.variables.length === 0 &&
            systemRows.slots.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground italic">
              This agent declares no variables or context slots — any agent
              with valid execution metadata will pass.
            </p>
          ) : (
            <div className="space-y-3">
              {systemRows.variables.length > 0 ? (
                <SectionList
                  label={`Variables (${systemRows.variables.length})`}
                >
                  <ul className="divide-y divide-border/30">
                    {systemRows.variables.map((row) => (
                      <ContractItem
                        key={row.name}
                        row={row}
                        state="pending"
                        showCheck={false}
                        iconSlot={<Hash className="h-3 w-3" />}
                      />
                    ))}
                  </ul>
                </SectionList>
              ) : null}

              {systemRows.slots.length > 0 ? (
                <SectionList label={`Context slots (${systemRows.slots.length})`}>
                  <ul className="divide-y divide-border/30">
                    {systemRows.slots.map((row) => (
                      <ContractItem
                        key={row.name}
                        row={row}
                        state="pending"
                        showCheck={false}
                        iconSlot={<KeyRound className="h-3 w-3" />}
                      />
                    ))}
                  </ul>
                </SectionList>
              ) : null}
            </div>
          )}
        </section>

        {/* Override */}
        <section className="bg-card px-5 py-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {role.systemOnly ? "Configuration" : "Override"}
            </h4>
            {overrideActive && currentOverrideId ? (
              <button
                type="button"
                onClick={() => copyId(currentOverrideId)}
                className="inline-flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground/70 hover:text-foreground"
                title="Copy agent ID"
              >
                <ClipboardCopy className="h-2.5 w-2.5" />
                {shortUuid(currentOverrideId)}
              </button>
            ) : null}
          </div>

          {role.systemOnly ? (
            <SystemOnlyPanel agentId={role.systemAgentId} />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium">Make it your own</div>
                  <div className="text-[10px] text-muted-foreground">
                    Copy this agent to an editable version, tweak it, and we
                    connect it here for you.
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleCopyUpdate}
                  disabled={copying || isApplying}
                  className="gap-1.5 shrink-0"
                >
                  {copying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CopyPlus className="h-3.5 w-3.5" />
                  )}
                  Copy &amp; Update
                </Button>
              </div>

              {overrideActive && currentOverrideId ? (
                <CurrentOverridePanel
                  agentId={currentOverrideId}
                  agentName={overrideAgent?.name}
                  onRemove={() => setRemoveOpen(true)}
                  isApplying={isApplying}
                />
              ) : null}

              {/* The canonical picker (search, tabs, favorites, contract
                  pre-flight) in controlled-override mode — writes stay on
                  rs_topic.agent_config via onApply/onRemove. */}
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2",
                  overrideActive && "mt-3",
                )}
              >
                <span className="text-[11px] font-medium text-muted-foreground">
                  {overrideActive
                    ? "Replace with another agent"
                    : "Choose one of your agents"}
                </span>
                <SlotAgentPicker
                  slotKey={role.slotKey}
                  override={{
                    agentId: currentOverrideId,
                    apply: async (candidateId) => {
                      await onApply(candidateId);
                    },
                    reset: async () => {
                      await onRemove();
                    },
                  }}
                />
              </div>
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={(o) => !isApplying && setRemoveOpen(o)}
        title="Remove override?"
        description={
          <>
            This role will fall back to the system default. Your agent stays
            intact — only the topic-level override is cleared.
          </>
        }
        confirmLabel="Remove override"
        variant="destructive"
        busy={isApplying}
        onConfirm={async () => {
          await onRemove();
          setRemoveOpen(false);
        }}
      />
    </article>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionList({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
        {label}
      </p>
      {children}
    </div>
  );
}

function ContractSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-2.5 w-24 animate-pulse rounded bg-muted/60" />
          {Array.from({ length: 2 }).map((_, j) => (
            <div key={j} className="space-y-1.5 py-1">
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted/50" />
              <div className="h-2.5 w-3/4 animate-pulse rounded bg-muted/30" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CurrentOverridePanel({
  agentId,
  agentName,
  onRemove,
  isApplying,
}: {
  agentId: string;
  agentName?: string;
  onRemove: () => void;
  isApplying: boolean;
}) {
  return (
    <div className="rounded-md border border-primary/15 bg-primary/[0.04] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-primary/80">
            Currently overridden
          </p>
          <p
            className="mt-0.5 truncate text-[13px] font-medium text-foreground"
            title={agentName ?? agentId}
          >
            {agentName ?? "Custom agent"}
          </p>
          <p className="font-mono text-[10.5px] text-muted-foreground/70">
            {shortUuid(agentId)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={isApplying}
          className="h-7 shrink-0 gap-1 rounded-md px-2 text-[11.5px] text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </Button>
      </div>
    </div>
  );
}

function SystemOnlyPanel({ agentId }: { agentId: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 text-[12.5px] text-muted-foreground">
      <p className="leading-relaxed">
        This agent is resolved from a module-level constant on the research
        backend, not from <code className="font-mono">rs_topic.agent_config</code>.
        Per-topic override isn&apos;t available yet.
      </p>
      <p className="mt-2 font-mono text-[10.5px] text-muted-foreground/70">
        {shortUuid(agentId)}
      </p>
    </div>
  );
}
