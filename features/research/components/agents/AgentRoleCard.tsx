"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ClipboardCopy,
  Hash,
  KeyRound,
  Lock,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  XCircle,
  CopyPlus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useAppDispatch,
  useAppSelector,
  useAppStore,
} from "@/lib/redux/hooks";
import {
  fetchAgentExecutionMinimal,
  duplicateAgent,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentById,
  selectAgentExecutionPayload,
} from "@/features/agents/redux/agent-definition/selectors";
import type { RootState } from "@/lib/redux/store";
import type { AgentRoleDefinition } from "./constants";
import { UUID_PATTERN } from "./constants";
import {
  compareContracts,
  shortUuid,
  systemContractRows,
  type ComparisonResult,
  type ContractRow,
} from "./utils";

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

// ─── Contract row ──────────────────────────────────────────────────────────

type RowState = "pending" | "matched" | "missing";

function ContractItem({
  row,
  state,
  showCheck,
  iconSlot,
}: {
  row: ContractRow;
  state: RowState;
  showCheck: boolean;
  /** Optional leading icon (e.g., Hash for variables, key for slots). */
  iconSlot?: React.ReactNode;
}) {
  const Status =
    state === "matched"
      ? CheckCircle2
      : state === "missing"
        ? XCircle
        : CircleDashed;

  const statusClass =
    state === "matched"
      ? "text-emerald-600 dark:text-emerald-400"
      : state === "missing"
        ? "text-destructive"
        : "text-muted-foreground/50";

  return (
    <li className="flex items-start gap-2.5 py-1.5">
      {iconSlot ? (
        <span className="mt-0.5 text-muted-foreground/60">{iconSlot}</span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <code className="font-mono text-[12.5px] font-medium text-foreground">
            {row.name}
          </code>
          {row.type ? (
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/70">
              {row.type}
            </span>
          ) : null}
        </div>
        {row.helpText ? (
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground line-clamp-2">
            {row.helpText}
          </p>
        ) : null}
      </div>
      {showCheck ? (
        <Status className={cn("mt-0.5 h-4 w-4 shrink-0", statusClass)} />
      ) : null}
    </li>
  );
}

// ─── Role card ─────────────────────────────────────────────────────────────

type Phase =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "error"; message: string }
  | { kind: "result"; candidateId: string; comparison: ComparisonResult };

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
  const store = useAppStore();
  const router = useRouter();
  const Icon = role.icon;

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

  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [removeOpen, setRemoveOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  const trimmed = draft.trim();
  const hasDraft = trimmed.length > 0;
  const draftIsValid = UUID_PATTERN.test(trimmed);

  // Subscribe to the candidate's redux record so the candidate name renders
  // once the list-fetch populates it (parent prefetches `agx_get_list_full`).
  const candidateAgent = useAppSelector((s: RootState) =>
    phase.kind === "result" ? selectAgentById(s, phase.candidateId) : undefined,
  );

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

  const showResult = phase.kind === "result";
  const matchedVarSet = useMemo(
    () =>
      showResult
        ? new Set(phase.comparison.matchedVariables.map((r) => r.name))
        : new Set<string>(),
    [phase, showResult],
  );
  const matchedSlotSet = useMemo(
    () =>
      showResult
        ? new Set(phase.comparison.matchedSlots.map((r) => r.name))
        : new Set<string>(),
    [phase, showResult],
  );

  const handleValidate = async () => {
    if (!draftIsValid) {
      toast.error("Enter a valid agent UUID.");
      return;
    }
    if (!systemPayload.isReady) {
      toast.error("System contract still loading. Try again in a moment.");
      return;
    }
    if (trimmed === role.systemAgentId) {
      toast.info("That's the system default — already in use.");
      return;
    }
    setPhase({ kind: "validating" });
    try {
      await dispatch(fetchAgentExecutionMinimal(trimmed)).unwrap();
    } catch {
      setPhase({
        kind: "error",
        message: "Couldn't load that agent. Check the ID and access.",
      });
      return;
    }
    // The thunk returns silently when the RPC produces no row (no access /
    // doesn't exist). Re-read the payload from the store to detect that.
    const after = selectAgentExecutionPayload(store.getState(), trimmed);
    if (!after.isReady) {
      setPhase({
        kind: "error",
        message:
          "Agent not found, or you don't have access. Make sure it's shared with you and the ID is correct.",
      });
      return;
    }
    const sysAfter = selectAgentExecutionPayload(
      store.getState(),
      role.systemAgentId,
    );
    if (!sysAfter.isReady) {
      setPhase({
        kind: "error",
        message: "System contract failed to load. Reload the page.",
      });
      return;
    }
    const comparison = compareContracts(
      {
        variableDefinitions: sysAfter.variableDefinitions,
        contextSlots: sysAfter.contextSlots,
      },
      {
        variableDefinitions: after.variableDefinitions,
        contextSlots: after.contextSlots,
      },
    );
    setPhase({ kind: "result", candidateId: trimmed, comparison });
  };

  const handleClear = () => {
    setDraft("");
    setPhase({ kind: "idle" });
    setExtrasOpen(false);
  };

  // Copy & Update: duplicate the role's current agent (override or system) into
  // a personal, editable copy via agx_duplicate_agent, connect it as the
  // override, then open it in the builder so the user can tweak it.
  const handleCopyUpdate = async () => {
    const sourceAgentId = currentOverrideId ?? role.systemAgentId;
    setCopying(true);
    try {
      const newId = await dispatch(
        duplicateAgent({ agentId: sourceAgentId, asSystem: false }),
      ).unwrap();
      // The copy is the critical step — once it exists, open it for editing no
      // matter what. Connecting it as this role's override is best-effort; a
      // failed connect must not masquerade as a failed copy.
      try {
        await onApply(newId);
        toast.success("Copied — opening your editable version to update");
      } catch {
        toast.info(
          "Copied your editable version — connect it to this role later",
        );
      }
      router.push(`/agents/${newId}/build`);
    } catch (err) {
      toast.error(
        `Couldn't copy agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    } finally {
      setCopying(false);
    }
  };

  const handleApply = async () => {
    if (phase.kind !== "result" || !phase.comparison.passing) return;
    try {
      await onApply(phase.candidateId);
      toast.success("Override applied.");
      setDraft("");
      setPhase({ kind: "idle" });
    } catch (err) {
      toast.error(
        `Couldn't apply override: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    }
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
                        showCheck={showResult}
                        state={
                          showResult
                            ? matchedVarSet.has(row.name)
                              ? "matched"
                              : "missing"
                            : "pending"
                        }
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
                        showCheck={showResult}
                        state={
                          showResult
                            ? matchedSlotSet.has(row.name)
                              ? "matched"
                              : "missing"
                            : "pending"
                        }
                        iconSlot={<KeyRound className="h-3 w-3" />}
                      />
                    ))}
                  </ul>
                </SectionList>
              ) : null}
            </div>
          )}
        </section>

        {/* Override / Validation */}
        <section className="bg-card px-5 py-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {role.systemOnly ? "Configuration" : "Override"}
            </h4>
            {overrideActive ? (
              <button
                type="button"
                onClick={() => copyId(currentOverrideId!)}
                className="inline-flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground/70 hover:text-foreground"
                title="Copy agent ID"
              >
                <ClipboardCopy className="h-2.5 w-2.5" />
                {shortUuid(currentOverrideId!)}
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

              {overrideActive ? (
                <CurrentOverridePanel
                  agentId={currentOverrideId!}
                  agentName={overrideAgent?.name}
                  onRemove={() => setRemoveOpen(true)}
                  isApplying={isApplying}
                />
              ) : null}

              <div className={cn("space-y-2", overrideActive && "mt-3")}>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {overrideActive ? "Replace with another agent" : "Custom agent ID"}
                  </span>
                  <div className="mt-1.5 flex items-stretch gap-1.5">
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        if (phase.kind !== "idle")
                          setPhase({ kind: "idle" });
                      }}
                      placeholder="00000000-0000-0000-0000-000000000000"
                      spellCheck={false}
                      autoComplete="off"
                      className={cn(
                        "min-w-0 flex-1 rounded-md border bg-background px-2.5 font-mono text-[12.5px] text-foreground transition-colors",
                        "outline-none placeholder:text-muted-foreground/50",
                        "focus:border-primary/40 focus:ring-2 focus:ring-primary/15",
                        hasDraft && !draftIsValid
                          ? "border-destructive/50"
                          : "border-border/70",
                      )}
                      style={{ fontSize: "16px" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleValidate();
                        }
                      }}
                    />
                    {hasDraft ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={handleClear}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Clear input"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Clear</TooltipContent>
                      </Tooltip>
                    ) : null}
                    <Button
                      type="button"
                      onClick={handleValidate}
                      disabled={
                        !draftIsValid ||
                        phase.kind === "validating" ||
                        !systemPayload.isReady
                      }
                      className="h-9 shrink-0 gap-1.5 rounded-md px-3.5 text-[13px]"
                    >
                      {phase.kind === "validating" ? (
                        <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      Validate
                    </Button>
                  </div>
                  {hasDraft && !draftIsValid ? (
                    <p className="mt-1 text-[11.5px] text-destructive">
                      Not a valid UUID.
                    </p>
                  ) : null}
                </label>
              </div>

              {/* Validation result */}
              {phase.kind === "error" ? (
                <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                    <div className="min-w-0 flex-1 text-[12.5px]">
                      <p className="font-medium text-destructive">
                        Validation failed
                      </p>
                      <p className="mt-0.5 text-destructive/80">
                        {phase.message}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {showResult ? (
                <ValidationResult
                  comparison={phase.comparison}
                  candidateId={phase.candidateId}
                  candidateName={candidateAgent?.name}
                  isApplying={isApplying}
                  onApply={handleApply}
                  extrasOpen={extrasOpen}
                  onToggleExtras={() => setExtrasOpen((v) => !v)}
                />
              ) : null}
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

function ValidationResult({
  comparison,
  candidateId,
  candidateName,
  isApplying,
  onApply,
  extrasOpen,
  onToggleExtras,
}: {
  comparison: ComparisonResult;
  candidateId: string;
  candidateName?: string;
  isApplying: boolean;
  onApply: () => void;
  extrasOpen: boolean;
  onToggleExtras: () => void;
}) {
  const totalVars =
    comparison.matchedVariables.length + comparison.missingVariables.length;
  const totalSlots =
    comparison.matchedSlots.length + comparison.missingSlots.length;
  const extrasCount =
    comparison.extraVariables.length + comparison.extraSlots.length;

  const tone: Tone = comparison.passing ? "success" : "destructive";
  const Icon = comparison.passing ? CheckCircle2 : XCircle;

  return (
    <div className="mt-3 space-y-2.5">
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border p-3",
          comparison.passing
            ? "border-emerald-500/25 bg-emerald-500/5"
            : "border-destructive/25 bg-destructive/5",
        )}
      >
        <Icon
          className={cn(
            "mt-px h-4 w-4 shrink-0",
            comparison.passing
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-destructive",
          )}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p
            className={cn(
              "text-[13px] font-medium",
              comparison.passing
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-destructive",
            )}
          >
            {comparison.passing
              ? "Contract satisfied"
              : `Missing ${comparison.missingVariables.length + comparison.missingSlots.length} required field${
                  comparison.missingVariables.length +
                    comparison.missingSlots.length ===
                  1
                    ? ""
                    : "s"
                }`}
          </p>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <StatusPill tone={tone}>
              <span className="tabular-nums">
                {comparison.matchedVariables.length}/{totalVars}
              </span>{" "}
              variables
            </StatusPill>
            <StatusPill tone={tone}>
              <span className="tabular-nums">
                {comparison.matchedSlots.length}/{totalSlots}
              </span>{" "}
              context slots
            </StatusPill>
            {extrasCount > 0 ? (
              <button
                type="button"
                onClick={onToggleExtras}
                className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-muted-foreground ring-1 ring-inset ring-border/60 transition-colors hover:bg-muted"
              >
                <Plus className="h-3 w-3" />
                {extrasCount} extra{extrasCount === 1 ? "" : "s"}
                <ChevronDown
                  className={cn(
                    "h-2.5 w-2.5 transition-transform",
                    extrasOpen && "rotate-180",
                  )}
                />
              </button>
            ) : null}
          </div>
          <p
            className="truncate font-mono text-[10.5px] text-muted-foreground/80"
            title={candidateName ?? candidateId}
          >
            {candidateName ? `${candidateName} · ` : null}
            {shortUuid(candidateId)}
          </p>
        </div>
      </div>

      {extrasOpen && extrasCount > 0 ? (
        <div className="rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
          <p className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
            Candidate has more than required
          </p>
          <ul className="space-y-1">
            {comparison.extraVariables.map((row) => (
              <li
                key={`v-${row.name}`}
                className="flex items-center gap-2 text-[11.5px]"
              >
                <Hash className="h-2.5 w-2.5 text-muted-foreground/50" />
                <code className="font-mono text-foreground/90">{row.name}</code>
                <span className="text-muted-foreground/60">— variable</span>
              </li>
            ))}
            {comparison.extraSlots.map((row) => (
              <li
                key={`s-${row.name}`}
                className="flex items-center gap-2 text-[11.5px]"
              >
                <KeyRound className="h-2.5 w-2.5 text-muted-foreground/50" />
                <code className="font-mono text-foreground/90">{row.name}</code>
                <span className="text-muted-foreground/60">— slot</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 leading-relaxed text-muted-foreground/80">
            These won&apos;t be supplied by the research pipeline. Make sure
            they have sensible defaults.
          </p>
        </div>
      ) : null}

      {comparison.passing ? (
        <Button
          type="button"
          onClick={onApply}
          disabled={isApplying}
          className="h-9 w-full gap-2 rounded-md text-[13px] sm:w-auto"
        >
          {isApplying ? (
            <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Apply override
        </Button>
      ) : null}
    </div>
  );
}
