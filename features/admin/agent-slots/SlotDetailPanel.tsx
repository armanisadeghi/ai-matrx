"use client";

/**
 * Slot workbench drawer — the panel that opens when a slot row is clicked.
 *
 * Issue-driven by design (2026-08-12 rebuild): the drawer opens because the
 * Health column said something, so the FIRST thing it shows is that verdict
 * and its fix — and it never offers a remedy that doesn't apply to the state
 * the slot is actually in. A system agent is never offered "create a system
 * twin"; a healthy slot is never scolded. Version drift (the common case)
 * gets a real split view — running version vs latest, inline diff, one-click
 * update, and a test bench pre-armed to compare exactly those two.
 *
 * Everything secondary (repin picker, test bench, overrides) lives in
 * collapsible sections so the fix is never buried under machinery.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileCode2,
  GitCompareArrows,
  History,
  Loader2,
  Pin,
  ShieldCheck,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type {
  AgentLineage,
  AgentLineageRef,
} from "@/features/agents/redux/agent-definition/selectors";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { getAgentModeHref } from "@/features/agents/components/shared/AgentModeController";
import { AgentDiffViewer } from "@/features/agents/components/diff/AgentDiffViewer";
import { SlotOverridePanel } from "@/features/agents/slots/components/SlotOverridePanel";
import { SlotResolutionRibbon } from "@/features/agents/slots/components/SlotResolutionRibbon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { parseSlotContract } from "@/features/agents/slots/overrides";
import { SlotTestBench } from "./SlotTestBench";
import { SlotInputsCell, SlotOutputCell } from "./slot-contract-cells";
import { useGuardedRepin } from "./useGuardedRepin";
import {
  buildRepinFixBrief,
  codeTruthRepinImpact,
  computeRepinImpact,
  type RepinImpact,
} from "./repin-impact";
import { VariableVerdictList } from "./variable-verdict-presentation";
import {
  CreateSystemTwinButton,
  LineageChip,
  LinkedSyncButton,
  RepinToTwinButton,
} from "./slot-actions";
import {
  HEALTH_CLASS,
  HEALTH_HINT,
  SYSTEM_AGENT_BASE,
  USER_AGENT_BASE,
  agentHref,
  type SlotRow,
} from "./slot-health";
import {
  fetchAgentVersions,
  fetchPinnedAgentIdentity,
  fetchSlotVariableVerdicts,
  fetchVersionSnapshotDefinition,
  updateSlotDefinition,
  type PinnedAgentIdentityResult,
  type SlotBindingRow,
  type SlotConsoleData,
  type SlotDefinitionRow,
  type SlotVariableVerdict,
  type SlotVersionInfo,
} from "./service";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── Collapsible section ──────────────────────────────────────────────────────

/**
 * One drawer section. `keepMounted` renders children hidden while closed —
 * the test bench needs this so its surface write handlers and published
 * draft snapshot stay live even when the section is folded.
 */
function Section({
  title,
  meta,
  open,
  onToggle,
  keepMounted = false,
  children,
}: {
  title: string;
  meta?: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  keepMounted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/40"
        onClick={() => onToggle(!open)}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="text-sm font-medium">{title}</span>
        {meta && (
          <span className="ml-auto truncate text-[11px] text-muted-foreground">
            {meta}
          </span>
        )}
      </button>
      {(open || keepMounted) && (
        <div className={cn("border-t border-border", !open && "hidden")}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Version drift — the common case, treated as the main event ───────────────

/**
 * Split view for a drifted pin: what users run now vs the newest saved
 * version, an inline field-level diff, and the two honest remedies (update
 * the pin, or switch to tracking latest). The "Test before updating" button
 * arms the bench below with exactly this comparison.
 */
function DriftPanel({
  row,
  onSaved,
  onTest,
}: {
  row: SlotRow;
  onSaved: () => void;
  onTest: () => void;
}) {
  const agentId = row.agentId;
  const [versions, setVersions] = useState<SlotVersionInfo[] | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diff, setDiff] = useState<{
    old: AgentDefinition;
    next: AgentDefinition;
  } | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pin" | "latest" | null>(null);
  // Set when a version bump would drop variables — the write waits for an
  // explicit confirmation instead of silently changing what reaches the prompt.
  const [versionImpact, setVersionImpact] = useState<{
    mode: "pin" | "latest";
    impact: RepinImpact;
  } | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    fetchAgentVersions(agentId)
      .then((rows) => {
        if (!cancelled) setVersions(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          toast.error(`Couldn't load version list: ${describeError(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const pinnedNumber = row.pinnedVersionNumber;
  // Newest SAVED snapshot — what an explicit repin can actually point at. The
  // master counter (row.latestVersion) and the newest saved row agree in
  // practice; the saved row is what the update writes.
  const latestSaved = versions?.[0] ?? null;
  const pinnedInfo =
    versions?.find((v) => v.versionNumber === pinnedNumber) ?? null;

  useEffect(() => {
    if (!diffOpen || diff || !agentId || pinnedNumber == null || !latestSaved)
      return;
    let cancelled = false;
    Promise.all([
      fetchVersionSnapshotDefinition(agentId, pinnedNumber),
      fetchVersionSnapshotDefinition(agentId, latestSaved.versionNumber),
    ])
      .then(([oldSnap, nextSnap]) => {
        if (cancelled) return;
        if (!oldSnap || !nextSnap) {
          setDiffError(
            "One of the two version snapshots is missing — open the full version history instead.",
          );
          return;
        }
        setDiff({ old: oldSnap, next: nextSnap });
      })
      .catch((error: unknown) => {
        if (!cancelled) setDiffError(describeError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [diffOpen, diff, agentId, pinnedNumber, latestSaved]);

  if (!agentId) return null;

  /** The write itself, with no checks — reached either by a clean pre-flight
   * or by the admin explicitly confirming a lossy bump. */
  const writeVersionPin = async (mode: "pin" | "latest") => {
    setBusy(mode);
    try {
      await updateSlotDefinition(row.slot.id, {
        default_agent_id: agentId,
        default_agent_version_id:
          mode === "pin" ? (latestSaved?.id ?? null) : null,
        use_latest: mode === "latest",
      });
      toast.success(
        mode === "pin"
          ? `${row.slotKey} updated to v${latestSaved?.versionNumber}.`
          : `${row.slotKey} now tracks latest — it picks up every new version automatically.`,
      );
      setVersionImpact(null);
      onSaved();
    } catch (error: unknown) {
      toast.error(`Update failed: ${describeError(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const updateToLatest = async (mode: "pin" | "latest") => {
    setBusy(mode);
    try {
      // A VERSION bump changes variables too — "updating an agent can break
      // things" is the first failure Arman named. Compare the two snapshots'
      // declarations before writing; loud, never blocking.
      if (pinnedNumber != null && latestSaved) {
        const [oldSnap, nextSnap] = await Promise.all([
          fetchVersionSnapshotDefinition(agentId, pinnedNumber),
          fetchVersionSnapshotDefinition(agentId, latestSaved.versionNumber),
        ]);
        if (oldSnap && nextSnap) {
          const impact = computeRepinImpact({
            currentVariables: oldSnap.variableDefinitions ?? [],
            candidateVariables: nextSnap.variableDefinitions ?? [],
            contractRequired: parseSlotContract(row.slot.contract)
              .requiredVariables,
            codeSuppliedVariables: row.codeTruth?.code_variables,
          });
          if (impact.breaking.length > 0) {
            setVersionImpact({ mode, impact });
            setBusy(null);
            return;
          }
        }
      }
    } catch (error: unknown) {
      // A failed pre-flight must not silently become an unchecked write.
      toast.error(
        `Couldn't check what this version changes: ${describeError(error)}`,
      );
      setBusy(null);
      return;
    }
    await writeVersionPin(mode);
  };

  return (
    <div className="space-y-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 text-xs">
          <div className="font-medium text-amber-700 dark:text-amber-500">
            A newer version of this agent exists.
          </div>
          <div className="mt-0.5 text-muted-foreground">
            Users are getting the pinned version. Nothing changes until you
            update the pin.
          </div>
        </div>
      </div>

      {/* The split view: running now vs newest. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <div className="rounded-md border border-border bg-card px-2.5 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Running now
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-lg font-semibold leading-none">
              v{pinnedNumber ?? "?"}
            </span>
            <Badge variant="outline" className="h-4 px-1 text-[9px]">
              pinned
            </Badge>
          </div>
          {pinnedInfo?.name && (
            <div className="mt-1 truncate text-[11px] text-muted-foreground">
              {pinnedInfo.name}
            </div>
          )}
        </div>
        <ArrowRight className="h-4 w-4 self-center text-muted-foreground" />
        <div className="rounded-md border border-amber-500/50 bg-card px-2.5 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-amber-600">
            Newest
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-lg font-semibold leading-none">
              v{latestSaved?.versionNumber ?? row.latestVersion ?? "?"}
            </span>
          </div>
          {latestSaved?.name && (
            <div className="mt-1 truncate text-[11px] text-muted-foreground">
              {latestSaved.name}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={busy !== null || !latestSaved}
          onClick={() => void updateToLatest("pin")}
        >
          {busy === "pin" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Pin className="h-3 w-3" />
          )}
          Update to v{latestSaved?.versionNumber ?? row.latestVersion}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={() => setDiffOpen((v) => !v)}
        >
          <GitCompareArrows className="h-3 w-3" />
          {diffOpen ? "Hide changes" : "See what changed"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={onTest}
        >
          Test old vs new first
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground"
          disabled={busy !== null}
          onClick={() => void updateToLatest("latest")}
          title="Stop pinning: the slot follows every new version automatically"
        >
          {busy === "latest" && (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          )}
          Track latest automatically
        </Button>
      </div>

      {versionImpact && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setVersionImpact(null)}
          title="This version drops variables the slot supplies"
          description={`v${latestSaved?.versionNumber} does not declare everything v${pinnedNumber} did. Updating changes what actually reaches the prompt.`}
          content={
            <div className="space-y-2 text-xs">
              <ul className="rounded border border-border bg-muted/30 p-2">
                {versionImpact.impact.variables
                  .filter((item) => item.verdict !== "ok")
                  .map((item) => (
                    <li
                      key={`${item.name}-${item.verdict}`}
                      className="flex flex-wrap items-center gap-1.5 py-0.5"
                    >
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                        {item.name}
                      </code>
                      <Badge
                        variant={
                          item.verdict === "lost" ||
                          item.verdict === "unsupplied_required"
                            ? "destructive"
                            : "outline"
                        }
                        className="h-4 px-1 text-[10px]"
                      >
                        {item.verdict === "lost"
                          ? "stops reaching the agent"
                          : item.verdict === "unsupplied_required"
                            ? "required, nothing supplies it"
                            : item.verdict === "rename_candidate"
                              ? `renamed → ${item.suggestedMapping}`
                              : "agent default will be used"}
                      </Badge>
                    </li>
                  ))}
              </ul>
              <CopyButton
                content={buildRepinFixBrief({
                  slotKey: row.slotKey,
                  candidateName: `${row.agentName} v${latestSaved?.versionNumber}`,
                  impact: versionImpact.impact,
                  codeTruth: row.codeTruth ?? undefined,
                })}
                label="Copy fix brief for AI"
                tooltip="A paste-ready brief naming the mismatch and every call site to update"
                size="sm"
              />
            </div>
          }
          confirmLabel="Update anyway"
          variant="destructive"
          busy={busy !== null}
          onConfirm={() => void writeVersionPin(versionImpact.mode)}
        />
      )}

      {diffOpen && (
        <div className="rounded-md border border-border bg-card">
          {diffError ? (
            <div className="space-y-1 p-3 text-xs">
              <p className="text-destructive">{diffError}</p>
              <a
                href={getAgentModeHref("versions", agentId, SYSTEM_AGENT_BASE)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <History className="h-3 w-3" /> Open full version history
              </a>
            </div>
          ) : !diff ? (
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading both versions…
            </div>
          ) : (
            <div className="max-h-96 overflow-auto p-2">
              <AgentDiffViewer
                oldAgent={diff.old}
                newAgent={diff.next}
                oldLabel={`v${pinnedNumber} (running)`}
                newLabel={`v${latestSaved?.versionNumber} (newest)`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Non-system pin — the fix is promotion or repin, shown in place ───────────

function NonSystemPanel({
  row,
  lineage,
  onSaved,
}: {
  row: SlotRow;
  lineage: AgentLineage;
  onSaved: () => void;
}) {
  if (!row.agentId) return null;
  const twin = lineage.systemTwin;
  return (
    <div className="space-y-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
        <div className="min-w-0">
          <div className="font-medium text-rose-600">
            This slot is pinned to a personal agent.
          </div>
          <div className="mt-0.5 text-muted-foreground">
            {HEALTH_HINT["not a system agent"]} Move the pin to a system copy.
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {twin ? (
          <>
            <LineageChip label="system twin" agent={twin} Icon={ShieldCheck} />
            <RepinToTwinButton
              slot={row.slot}
              twin={twin}
              currentAgentId={row.agentId}
              codeTruth={row.codeTruth}
              onSaved={onSaved}
            />
            <LinkedSyncButton
              agentId={row.agentId}
              label="Compare with twin…"
              slot={row.slot}
            />
          </>
        ) : (
          <>
            <CreateSystemTwinButton
              slot={row.slot}
              agentId={row.agentId}
              agentName={row.agentName}
              onSaved={onSaved}
            />
            <LinkedSyncButton
              agentId={row.agentId}
              label="Advanced…"
              slot={row.slot}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Unresolved pin — identify it server-side, then remedy in place ───────────

/**
 * The Redux lineage index cannot see a pin that points at another user's
 * personal agent, so this asks the server (super-admin lookup) WHO the pin
 * is, then renders the identity WITH its door plus the remedies in place.
 */
function UnresolvedPinPanel({
  row,
  onSaved,
}: {
  row: SlotRow;
  onSaved: () => void;
}) {
  const [lookup, setLookup] = useState<{
    slotId: string;
    result: PinnedAgentIdentityResult;
  } | null>(null);
  const [lookupError, setLookupError] = useState<{
    slotId: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPinnedAgentIdentity(row.slot)
      .then((result) => {
        if (cancelled) return;
        setLookup({ slotId: row.slot.id, result });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLookupError({
          slotId: row.slot.id,
          message: describeError(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [row.slot]);

  const result = lookup?.slotId === row.id ? lookup.result : null;
  const error = lookupError?.slotId === row.id ? lookupError.message : null;
  const agent = result?.agent ?? null;

  return (
    <div className="space-y-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
        <div className="min-w-0">
          <div className="font-medium text-rose-600">
            This slot&apos;s pin is outside your direct reach.
          </div>
          <div className="mt-0.5 text-muted-foreground">
            {HEALTH_HINT["unresolved pin"]}
          </div>
        </div>
      </div>

      {result === null && error === null && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Identifying the pinned agent…
        </div>
      )}

      {error !== null && (
        <div className="space-y-1">
          <p className="text-rose-600">The server lookup also failed: {error}</p>
          {row.agentId && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Pinned agent:</span>
              <EntityRef
                token="agent"
                id={row.agentId}
                name={row.agentName}
                href={agentHref(row.agentId, row.agentType)}
                alwaysShowActions
              />
            </div>
          )}
        </div>
      )}

      {result !== null && agent === null && (
        <p className="text-rose-600">
          The pinned agent no longer exists — the record was deleted. Choose a
          replacement in “Change pinned agent” below.
        </p>
      )}

      {result !== null && agent !== null && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <EntityRef
              token="agent"
              id={agent.id}
              name={agent.name}
              href={agentHref(agent.id, agent.agentType)}
              alwaysShowActions
            />
            <Badge
              variant="outline"
              className={HEALTH_CLASS["not a system agent"]}
            >
              {agent.agentType === "builtin"
                ? "System agent"
                : "Personal agent"}
            </Badge>
            {agent.ownerEmail && (
              <Badge variant="outline">owner: {agent.ownerEmail}</Badge>
            )}
            {result.pinnedVersionNumber != null && (
              <Badge variant="outline">
                pinned v{result.pinnedVersionNumber}
              </Badge>
            )}
            {agent.isArchived && <Badge variant="secondary">archived</Badge>}
            {agent.deletedAt && <Badge variant="secondary">deleted</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {result.systemTwin ? (
              <>
                <LineageChip
                  label="system twin"
                  agent={{
                    id: result.systemTwin.id,
                    name: result.systemTwin.name,
                    agentType: "builtin",
                    isSystem: true,
                  }}
                  Icon={ShieldCheck}
                />
                <RepinToTwinButton
                  slot={row.slot}
                  twin={{
                    id: result.systemTwin.id,
                    name: result.systemTwin.name,
                    agentType: "builtin",
                    isSystem: true,
                  }}
                  currentAgentId={agent.id}
                  codeTruth={row.codeTruth}
                  onSaved={onSaved}
                />
              </>
            ) : agent.deletedAt === null ? (
              <CreateSystemTwinButton
                slot={row.slot}
                agentId={agent.id}
                agentName={agent.name}
                onSaved={onSaved}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

// ── Code truth drift — the acceptance-test failure, with real options ───────

function CodeAgentDriftPanel({
  row,
  variableVerdicts,
  onOpenRepin,
}: {
  row: SlotRow;
  variableVerdicts: SlotVariableVerdict[];
  onOpenRepin: () => void;
}) {
  const truth = row.codeTruth;
  if (!truth) return null;
  const impact = codeTruthRepinImpact(truth);
  const brief = buildRepinFixBrief({
    slotKey: row.slotKey,
    candidateName: truth.bound_agent?.name ?? row.agentName,
    impact,
    codeTruth: truth,
  });
  const agentVariables = truth.bound_agent?.declared_variables ?? [];
  const usesDefault = variableVerdicts.some(
    (item) => item.verdict === "default_used",
  );
  const agentEditHref = row.agentId
    ? getAgentModeHref(
        "edit",
        row.agentId,
        row.agentType === "builtin" ? SYSTEM_AGENT_BASE : USER_AGENT_BASE,
      )
    : null;

  return (
    <div className="space-y-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
        <div>
          <div className="font-medium text-rose-600">
            The code and {truth.bound_agent?.name ?? "the bound agent"} do not
            agree.
          </div>
          <div className="mt-0.5 text-muted-foreground">
            Code passes {truth.code_variables.join(", ") || "no named variables"}; the
            agent declares {agentVariables.join(", ") || "no variables"}. Pick the
            intent below—the system will not guess or silently block the slot.
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-border bg-card p-2">
          <div className="font-medium">Map to an existing variable</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Keep the code value and route it to a variable the agent already
            declares.
          </div>
          {agentVariables.length > 0 ? (
            <CopyButton
              content={`${brief}\n\nPREFERRED OPTION: map the code value to one of the existing agent variables (${agentVariables.join(", ")}). Confirm meaning before choosing; do not guess from the name alone.`}
              label="Copy mapping fix"
              size="sm"
              className="mt-2"
            />
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-xs"
              disabled
              title="This agent declares no variables to map onto"
            >
              No agent variable available
            </Button>
          )}
        </div>

        <div className="rounded border border-border bg-card p-2">
          <div className="font-medium">Use the agent&apos;s default</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Safe only when the declared agent variable actually has a default.
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-7 text-xs"
            disabled
            title={
              usesDefault
                ? "The verdict above confirms the default is already in use"
                : "No applicable agent default was reported"
            }
          >
            {usesDefault ? "Default already used" : "No default available"}
          </Button>
        </div>

        <div className="rounded border border-border bg-card p-2">
          <div className="font-medium">Pass it as user text</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Preserve the value immediately as labeled user_input; keep the
            caution visible until the contract gains a real variable.
          </div>
          <CopyButton
            content={`${brief}\n\nPREFERRED OPTION: spill the unconsumed code value into user_input as "Name: value" and preserve the caution verdict. Update every discovered call site.`}
            label="Copy user-text fix"
            size="sm"
            className="mt-2"
          />
        </div>

        <div className="rounded border border-border bg-card p-2">
          <div className="font-medium">Declare it on the agent</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Add the variable to the agent and update its prompt to consume it.
          </div>
          {agentEditHref ? (
            <Button asChild size="sm" variant="outline" className="mt-2 h-7 text-xs">
              <a href={agentEditHref} target="_blank" rel="noopener noreferrer">
                Open agent builder <ExternalLink className="ml-1 h-3 w-3" />
              </a>
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" disabled>
              Agent unavailable
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CopyButton
          content={brief}
          label="Copy full code-fix brief"
          tooltip="Includes the runner, live variables, source file, and every discovered call site"
          size="sm"
        />
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onOpenRepin}>
          Choose a different agent
        </Button>
      </div>
    </div>
  );
}

// ── Status banner — one verdict, matched to the state, never a mismatch ──────

function StatusBanner({
  row,
  variableVerdicts,
  lineage,
  onSaved,
  onTest,
  onOpenRepin,
}: {
  row: SlotRow;
  variableVerdicts: SlotVariableVerdict[];
  lineage: AgentLineage;
  onSaved: () => void;
  onTest: () => void;
  onOpenRepin: () => void;
}) {
  switch (row.health) {
    case "code ↔ agent drift":
      return (
        <CodeAgentDriftPanel
          row={row}
          variableVerdicts={variableVerdicts}
          onOpenRepin={onOpenRepin}
        />
      );
    case "code truth import failed":
      return (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <div className="font-medium text-amber-700 dark:text-amber-500">
                The code declaration could not be loaded.
              </div>
              <div className="mt-0.5 text-muted-foreground">
                {row.codeTruth?.import_error ??
                  HEALTH_HINT["code truth import failed"]}
              </div>
            </div>
          </div>
          <CopyButton
            content={`Fix the code-truth import failure for agent slot "${row.slotKey}".\n\nRead /Users/armanisadeghi/code/common-docs/systems/agent-variable-binding/FEATURE.md first.\n\nImport failure: ${row.codeTruth?.import_error ?? "unknown"}\n\nRestore the declaring module so GET /agent-slots/code-truth reports code_declaration_found, then verify every variable and call site. Do not change the slot pin or contract to hide the import failure.`}
            label="Copy import-fix brief"
            size="sm"
          />
        </div>
      );
    case "code ↔ contract drift":
      return (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <div className="font-medium text-amber-700 dark:text-amber-500">
                Live code and the stored contract cache disagree.
              </div>
              <div className="mt-0.5 text-muted-foreground">
                Code is authoritative. Code-only: {row.codeTruth?.code_only_variables.join(", ") || "none"}; contract-only:{" "}
                {row.codeTruth?.db_only_variables.join(", ") || "none"}.
              </div>
            </div>
          </div>
          {row.codeTruth && (
            <CopyButton
              content={buildRepinFixBrief({
                slotKey: row.slotKey,
                candidateName: row.agentName,
                impact: codeTruthRepinImpact(row.codeTruth),
                codeTruth: row.codeTruth,
              })}
              label="Copy contract-fix brief"
              size="sm"
            />
          )}
        </div>
      );
    case "ok":
      return (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="font-medium text-emerald-700 dark:text-emerald-500">
            Healthy
          </span>
          <span className="text-muted-foreground">
            System agent,{" "}
            {row.slot.use_latest
              ? "tracking the latest version"
              : "pin is up to date"}
            .
          </span>
        </div>
      );
    case "version drift":
      return <DriftPanel row={row} onSaved={onSaved} onTest={onTest} />;
    case "not a system agent":
      return <NonSystemPanel row={row} lineage={lineage} onSaved={onSaved} />;
    case "agent archived":
      return (
        <div className="space-y-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div className="min-w-0">
              <div className="font-medium text-rose-600">
                The pinned agent is archived.
              </div>
              <div className="mt-0.5 text-muted-foreground">
                {HEALTH_HINT["agent archived"]}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onOpenRepin}
          >
            Choose a replacement
          </Button>
        </div>
      );
    case "unresolved pin":
      return <UnresolvedPinPanel row={row} onSaved={onSaved} />;
  }
}

// ── The facts — labeled values first, so nothing is ever guessed ─────────────

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="min-w-0 text-xs">{children}</div>
    </>
  );
}

/**
 * The drawer opens with the FACTS, each labeled — agent, system-agent
 * boolean, version (amber when it trails latest), the contract's inputs and
 * output promise. The problem verdict comes AFTER the reader knows what
 * they're looking at (Arman's ordering ruling, 2026-08-14).
 */
function FactsPanel({
  row,
  variableVerdicts,
  verdictsLoading,
  verdictsError,
}: {
  row: SlotRow;
  variableVerdicts: SlotVariableVerdict[];
  verdictsLoading: boolean;
  verdictsError: string | null;
}) {
  const isSystem = row.agentType === "builtin";
  const drifted = row.drift != null;
  return (
    <div className="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-1.5 rounded-md border border-border bg-card px-3 py-2.5">
      <Fact label="Agent">
        <div className="flex min-w-0 items-center gap-2">
          {row.agentId ? (
            <EntityRef
              token="agent"
              id={row.agentId}
              name={row.agentName}
              href={agentHref(row.agentId, row.agentType)}
              alwaysShowActions
            />
          ) : (
            <span className="text-muted-foreground">{row.agentName}</span>
          )}
          {row.agentId && (
            <a
              href={getAgentModeHref(
                "versions",
                row.agentId,
                isSystem ? SYSTEM_AGENT_BASE : USER_AGENT_BASE,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              title={`Version history for ${row.agentName}`}
            >
              <History className="h-3 w-3" />
              Versions
            </a>
          )}
        </div>
      </Fact>
      <Fact label="System agent">
        {row.agentType == null ? (
          <span className="text-muted-foreground">unknown</span>
        ) : isSystem ? (
          "Yes"
        ) : (
          <span className="font-medium text-rose-600">No — personal agent</span>
        )}
      </Fact>
      <Fact label="Version">
        {row.slot.use_latest ? (
          <span>
            latest
            {row.latestVersion != null && (
              <span className="text-muted-foreground">
                {" "}
                (v{row.latestVersion})
              </span>
            )}
          </span>
        ) : row.pinnedVersionNumber != null ? (
          <span className={cn(drifted && "font-medium text-amber-600")}>
            v{row.pinnedVersionNumber}
            {drifted && (
              <span className="text-muted-foreground">
                {" "}
                — latest is v{row.latestVersion}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {row.slot.default_agent_version_id ? "unknown version" : "latest"}
          </span>
        )}
      </Fact>
      <Fact label="Inputs">
        <SlotInputsCell row={row} maxChips={8} />
      </Fact>
      <Fact label="Output">
        <SlotOutputCell row={row} maxChips={8} />
      </Fact>
      {row.codeTruth && (
        <>
          <Fact label="Code declaration">
            {row.codeTruth.source ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <FileCode2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                <code className="break-all text-[11px]">
                  {row.codeTruth.source.class_name} ·{" "}
                  {row.codeTruth.source.source_file}:{row.codeTruth.source.line}
                </code>
              </span>
            ) : (
              <span className="text-muted-foreground">
                {row.codeTruth.resolution.replaceAll("_", " ")}
              </span>
            )}
          </Fact>
          <Fact label="Code passes">
            {row.codeTruth.code_variables.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {row.codeTruth.code_variables.map((name) => (
                  <code
                    key={name}
                    className="rounded border border-border bg-muted/40 px-1 py-0.5 text-[11px]"
                  >
                    {name}
                  </code>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">no named variables</span>
            )}
          </Fact>
          <Fact label="Agent declares">
            {(row.codeTruth.bound_agent?.declared_variables.length ?? 0) > 0 ? (
              <div className="flex flex-wrap gap-1">
                {row.codeTruth.bound_agent?.declared_variables.map((name) => (
                  <code
                    key={name}
                    className="rounded border border-border bg-muted/40 px-1 py-0.5 text-[11px]"
                  >
                    {name}
                  </code>
                ))}
              </div>
            ) : (
              <span className="font-medium text-rose-600">no variables</span>
            )}
          </Fact>
          <Fact label="User text">
            {row.codeTruth.passes_user_input
              ? "The call site passes user_input"
              : "The call site does not pass user_input"}
          </Fact>
          <Fact label="Call sites">
            {row.codeTruth.call_sites?.length ? (
              <div className="space-y-0.5">
                {row.codeTruth.call_sites.map((site) => (
                  <div
                    key={`${site.source_file}:${site.line}`}
                    className="break-all font-mono text-[11px]"
                  >
                    {site.source_file}:{site.line} · user text{" "}
                    {site.passes_user_input ? "yes" : "no"}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">none discovered</span>
            )}
          </Fact>
          <Fact label="Variable flow">
            {verdictsLoading ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking the bound
                agent…
              </span>
            ) : verdictsError ? (
              <span className="text-rose-600">{verdictsError}</span>
            ) : (
              <VariableVerdictList items={variableVerdicts} />
            )}
          </Fact>
        </>
      )}
    </div>
  );
}

// ── Repin editor ─────────────────────────────────────────────────────────────

function SlotEditor({
  slot,
  data,
  builtinAgentsById,
  currentAgentId,
  codeTruth,
  onSaved,
}: {
  slot: SlotDefinitionRow;
  data: SlotConsoleData;
  builtinAgentsById: ReadonlyMap<string, string>;
  /** The agent bound today — the baseline THE REPIN GUARD compares against. */
  currentAgentId: string | null;
  codeTruth: SlotRow["codeTruth"];
  onSaved: () => void;
}) {
  const {
    requestRepin,
    dialog: repinDialog,
    checking,
    saving: repinSaving,
  } = useGuardedRepin({ slot, currentAgentId, codeTruth, onSaved });
  const pinnedVersion = slot.default_agent_version_id
    ? data.versionsById[slot.default_agent_version_id]
    : undefined;
  const initialAgentId =
    slot.default_agent_id ?? pinnedVersion?.agentId ?? null;
  const [agentId, setAgentId] = useState<string | null>(initialAgentId);
  const [useLatest, setUseLatest] = useState<boolean>(Boolean(slot.use_latest));
  const [versionId, setVersionId] = useState<string | null>(
    slot.default_agent_version_id,
  );
  // Versions keyed by the agent they were fetched for — "loading" is DERIVED
  // (requested agent ≠ loaded agent), so the effect never sets state
  // synchronously (react-hooks/set-state-in-effect).
  const [loadedVersions, setLoadedVersions] = useState<{
    agentId: string;
    rows: SlotVersionInfo[];
  } | null>(null);
  const saving = repinSaving || checking;
  const versions =
    loadedVersions?.agentId === agentId ? loadedVersions.rows : [];
  const loadingVersions =
    !useLatest && agentId != null && loadedVersions?.agentId !== agentId;

  useEffect(() => {
    if (!agentId || useLatest) return;
    let cancelled = false;
    fetchAgentVersions(agentId)
      .then((rows) => {
        if (cancelled) return;
        setLoadedVersions({ agentId, rows });
        setVersionId((prev) =>
          rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? null),
        );
      })
      .catch((error: unknown) => {
        toast.error(`Failed to load versions: ${describeError(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, useLatest]);

  const save = async () => {
    if (!agentId) {
      toast.error("Pick an agent first.");
      return;
    }
    if (!builtinAgentsById.has(agentId)) {
      toast.error("Choose a system agent before saving this slot.");
      return;
    }
    if (!useLatest && !versionId) {
      toast.error("Pick a version to pin, or switch to latest.");
      return;
    }
    // Routed through THE REPIN GUARD — a manual repin is the same swap the
    // one-click remedies perform, and gets the same variable check.
    await requestRepin({
      agentId,
      agentName: builtinAgentsById.get(agentId) ?? "the selected agent",
      versionId: useLatest ? null : versionId,
      useLatest,
      successMessage: `${slot.slot_key} repinned.`,
    });
  };

  const selectableAgentId =
    agentId && builtinAgentsById.has(agentId) ? agentId : null;
  const selectedAgentName = selectableAgentId
    ? (builtinAgentsById.get(selectableAgentId) ?? "Selected system agent")
    : "Select a system agent";

  return (
    <div className="space-y-3 p-3">
      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          Agent
        </div>
        {/* The canonical agent dropdown, constrained to system agents because
            a slot default serves every user. The full catalogue exists only
            while the admin opens the dropdown. */}
        <AgentListDropdown
          consumerId={`agent-slot-repin-${slot.id}`}
          onSelect={setAgentId}
          activeAgentId={selectableAgentId}
          label={selectedAgentName}
          initialTab="system"
          visibleTabs={["system"]}
          systemTabLabel="System"
          resolveAgentHref={(agent) => agentHref(agent.id, agent.agentType)}
          showPinnedAgent={Boolean(selectableAgentId)}
          contentSide="left"
          className="h-9 w-full"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={useLatest} onCheckedChange={setUseLatest} />
        <span>
          Track latest{" "}
          <span className="text-muted-foreground">
            (picks up every new version; pin one version for stability)
          </span>
        </span>
      </label>
      {!useLatest && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Pin version:</span>
          {loadingVersions ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : versions.length === 0 ? (
            <span className="text-muted-foreground">
              No saved versions for this agent — save a version first, or track
              latest.
            </span>
          ) : (
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              value={versionId ?? ""}
              onChange={(e) => setVersionId(e.target.value || null)}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber}
                  {v.name ? ` — ${v.name}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {repinDialog}
      <Button size="sm" onClick={() => void save()} disabled={saving}>
        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
        Save pin
      </Button>
    </div>
  );
}

// ── Overrides roll-up (read-only; editing happens in SlotOverridePanel) ──────

function OverridesList({
  bindings,
  data,
}: {
  bindings: SlotBindingRow[];
  data: SlotConsoleData;
}) {
  if (bindings.length === 0) return null;
  return (
    <div className="space-y-1 text-xs">
      <div className="font-medium text-muted-foreground">All bindings</div>
      {bindings.map((b) => {
        const versionAgentId = b.agent_version_id
          ? data.versionsById[b.agent_version_id]?.agentId
          : undefined;
        const agentKey = b.agent_id ?? versionAgentId;
        const agent = agentKey ? (data.agentsById[agentKey] ?? null) : null;
        return (
          <div key={b.id} className="space-y-0.5 py-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{b.principal_type}</Badge>
              <span>
                {agent ? `→ ${agent.name}` : "settings-only (no agent swap)"}
              </span>
              {!b.is_enabled && <Badge variant="secondary">disabled</Badge>}
            </div>
            {b.config_overrides != null && (
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-1.5 font-mono text-[10px] text-muted-foreground">
                {JSON.stringify(b.config_overrides, null, 1)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── The drawer ───────────────────────────────────────────────────────────────

/** Full slot workbench — status verdict + fix, agent identity, then repin /
 * test / overrides as collapsible sections. Used by both the side panel and
 * the WindowPanel Edit tab. */
export function SlotDetail({
  row,
  data,
  lineage,
  builtinAgentsById,
  onSaved,
}: {
  row: SlotRow;
  data: SlotConsoleData;
  lineage: AgentLineage;
  builtinAgentsById: ReadonlyMap<string, string>;
  onSaved: () => void;
}) {
  const dispatch = useAppDispatch();
  const bindings = data.bindingsBySlotId[row.id] ?? [];
  const [verdictState, setVerdictState] = useState<{
    slotKey: string;
    verdicts: SlotVariableVerdict[];
    error: string | null;
  } | null>(null);
  // The section relevant to the verdict opens itself; the rest stay folded.
  const [pinOpen, setPinOpen] = useState(
    row.health === "agent archived" || row.health === "unresolved pin",
  );
  const [testOpen, setTestOpen] = useState(row.health === "version drift");
  const [overridesOpen, setOverridesOpen] = useState(false);
  // Bumped by the drift panel's "Test old vs new first" — the bench scrolls
  // itself into view and arms the pinned-vs-latest comparison.
  const [benchFocus, setBenchFocus] = useState(0);
  const benchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const truth = row.codeTruth;
    if (!truth || truth.resolution !== "code_declaration_found") return;
    let cancelled = false;
    fetchSlotVariableVerdicts(dispatch, truth)
      .then((result) => {
        if (cancelled) return;
        setVerdictState({
          slotKey: truth.slot_key,
          verdicts: result.verdicts ?? [],
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setVerdictState({
          slotKey: truth.slot_key,
          verdicts: [],
          error: describeError(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, row.codeTruth]);

  useEffect(() => {
    if (benchFocus === 0) return;
    benchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [benchFocus]);

  const baselineLabel =
    row.pinnedVersionNumber != null
      ? `Current — pinned v${row.pinnedVersionNumber}`
      : "Current binding";
  const liveVerdictState =
    verdictState?.slotKey === row.slotKey ? verdictState : null;
  const variableVerdicts = liveVerdictState?.verdicts ?? [];
  const verdictsLoading =
    row.codeTruth?.resolution === "code_declaration_found" &&
    liveVerdictState === null;

  return (
    // SidePanelSurface (and the WindowPanel body) hand children an
    // overflow-hidden flex cell and expect the child to own its scroll —
    // without this wrapper the drawer simply cut off at the fold, which is
    // exactly the defect the 2026-08-12 rebuild was ordered over.
    // The table's detail container owns the scroll (MatrxDataTable wraps every
    // custom `detail.render` in `h-full min-h-0 overflow-y-auto`).
    <div className="space-y-3 p-3">
      {row.slot.description && (
        <p className="text-xs text-muted-foreground">{row.slot.description}</p>
      )}

      {/* Facts first — what IS. The verdict on what's wrong comes second. */}
      <FactsPanel
        row={row}
        variableVerdicts={variableVerdicts}
        verdictsLoading={verdictsLoading}
        verdictsError={liveVerdictState?.error ?? null}
      />

      <StatusBanner
        row={row}
        variableVerdicts={variableVerdicts}
        lineage={lineage}
        onSaved={onSaved}
        onTest={() => {
          setTestOpen(true);
          setBenchFocus((n) => n + 1);
        }}
        onOpenRepin={() => setPinOpen(true)}
      />

      <Section
        title="Change pinned agent"
        meta={row.pinLabel}
        open={pinOpen}
        onToggle={setPinOpen}
      >
        {/* key: SlotEditor seeds local state from props — remount per slot */}
        <SlotEditor
          key={row.id}
          slot={row.slot}
          data={data}
          builtinAgentsById={builtinAgentsById}
          currentAgentId={row.agentId}
          codeTruth={row.codeTruth}
          onSaved={onSaved}
        />
      </Section>

      <div ref={benchRef}>
        <Section
          title="Test this slot"
          meta="run saved test cases, compare versions"
          open={testOpen}
          onToggle={setTestOpen}
          // The bench registers surface write handlers and publishes its
          // composer draft upward — it must stay mounted while folded.
          keepMounted
        >
          <SlotTestBench
            key={row.id}
            slot={row.slot}
            baselineLabel={baselineLabel}
            presetLatestCandidate={row.drift != null}
            autoRunSignal={benchFocus}
            // Undefined (no code declaration / import failure) stays
            // undefined — the bench treats unknown as "offer the field",
            // never as "this slot takes no user message".
            passesUserInput={row.codeTruth?.passes_user_input}
          />
        </Section>
      </div>

      {/* "Bindings", not "overrides" — in this system, "overrides" means the
          config_overrides list sent to the API on a run. A slot_binding row is
          a per-user/per-org replacement (different agent and/or settings). */}
      <Section
        title={
          bindings.length > 0
            ? `User & org bindings (${bindings.length})`
            : "User & org bindings"
        }
        meta="who gets a different agent or settings"
        open={overridesOpen}
        onToggle={setOverridesOpen}
      >
        <div className="space-y-3 p-3">
          {/* The canonical precedence chain — the admin edits the SYSTEM layer
              in this drawer; these overrides sit above it at runtime. */}
          <SlotResolutionRibbon />
          {/* key: the panel + editor seed local state from props */}
          <SlotOverridePanel
            key={row.id}
            slot={row.slot}
            bindings={bindings}
            agentsById={data.agentsById}
            onChanged={onSaved}
          />
          <OverridesList bindings={bindings} data={data} />
        </div>
      </Section>
    </div>
  );
}
