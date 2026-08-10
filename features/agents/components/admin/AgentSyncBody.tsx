"use client";

/**
 * AgentSyncBody
 *
 * Unified panel for the link between a user agent and its system ("builtin")
 * twin. Handles, from either side of the pair:
 *
 *   - Pull  (system → my personal copy) — owner-gated, behavior-only by default
 *   - Push  (user → system)             — super-admin-gated, identity included
 *   - Create my personal copy           — idempotent (opens an existing copy)
 *   - Convert to a new system agent      — when a user agent has no twin yet
 *
 * The DB (`agx_sync_linked_agents`) is the real authority on linkage + write
 * gating; this component only enables/labels the actions. Direction-agnostic by
 * design: the link lives on whichever side was derived, and we resolve the twin
 * from either end via `fetchLinkedCounterpart`.
 */

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  fetchLinkedCounterpart,
  syncLinkedAgents,
  createPersonalCopy,
} from "@/features/agents/redux/agent-definition/thunks";
import type {
  AgentDefinition,
  LinkedAgentRef,
  LinkedCounterpartResult,
} from "@/features/agents/types/agent-definition.types";
import { ConvertAgentToSystemBody } from "@/features/agents/components/admin/ConvertAgentToSystemBody";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Copy,
  GitCompareArrows,
  GitFork,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast-service";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { AgentDiffViewer } from "@/features/agents/components/diff/AgentDiffViewer";
import { compareAgentDefinitions } from "@/features/agents/components/diff/compare-agent-definitions";
import { getAgentModeHref } from "@/features/agents/components/shared/AgentModeController";
import { formatText } from "@/utils/text/text-case-converter";
import { fetchSavedAgentDefinition } from "@/features/agents/services/agent-definition-snapshot.service";

const SYSTEM_AGENT_ADMIN_BASE_PATH = "/administration/agents/system-agents/agents";
const USER_AGENT_BASE_PATH = "/agents";

interface AgentSyncBodyProps {
  agentId: string;
  onClose: () => void;
  /**
   * Optional slot context — set when this comparison was opened FROM an agent
   * slot (the admin slots console). When present, the linked-pair view names
   * the slot it is judging ("This is what slot X runs") and, with
   * `onRepinToSystem`, offers "Repin slot to system side" inside the diff.
   * Every other caller passes nothing and is unchanged.
   */
  slotKey?: string;
  slotLabel?: string;
  onRepinToSystem?: (systemAgentId: string) => Promise<void>;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function basePathFor(ref: LinkedAgentRef): string {
  return ref.agentType === "builtin"
    ? SYSTEM_AGENT_ADMIN_BASE_PATH
    : USER_AGENT_BASE_PATH;
}

function AgentHeadCard({
  agentRef,
  agent,
  label,
}: {
  agentRef: LinkedAgentRef;
  agent: Partial<AgentDefinition> | undefined;
  label: string;
}) {
  const basePath = basePathFor(agentRef);
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge variant="outline" className="text-[10px]">
          {label}
        </Badge>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {agent?.version != null ? `v${agent.version}` : "Current"}
        </span>
      </div>
      <EntityRef
        token="agent"
        id={agentRef.id}
        name={agentRef.name}
        href={`${basePath}/${agentRef.id}`}
        alwaysShowActions
        className="max-w-full text-sm font-medium"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-muted-foreground">
          Updated {formatTimestamp(agent?.updatedAt)}
        </span>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 gap-1 px-1.5 text-[10px]"
        >
          <Link
            href={getAgentModeHref("versions", agentRef.id, basePath)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <History className="h-3 w-3" />
            Versions
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Resolve the (userSide, systemSide) pair around the viewed agent, plus the
 * derived side's last-reconciled timestamp.
 */
function resolvePair(
  selfType: "user" | "builtin",
  counterpart: LinkedCounterpartResult,
): {
  userSide: LinkedAgentRef | null;
  systemSide: LinkedAgentRef | null;
} {
  const { self, source, derived } = counterpart;
  const candidates = [source, ...derived].filter(Boolean) as LinkedAgentRef[];

  if (selfType === "builtin") {
    // Prefer my own user copy; fall back to any visible user-side twin.
    const userSide =
      candidates.find((c) => c.agentType === "user" && c.isOwnedByMe) ??
      candidates.find((c) => c.agentType === "user") ??
      null;
    return { userSide, systemSide: self };
  }

  // self is a user agent — find its system twin.
  const systemSide = candidates.find((c) => c.agentType === "builtin") ?? null;
  return { userSide: self, systemSide };
}

export function AgentSyncBody({
  agentId,
  onClose,
  slotKey,
  slotLabel,
  onRepinToSystem,
}: AgentSyncBodyProps) {
  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const dispatch = useAppDispatch();

  const [counterpartState, setCounterpartState] = useState<{
    agentId: string;
    result: LinkedCounterpartResult;
  } | null>(null);
  const [resolveError, setResolveError] = useState<{
    agentId: string;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState<null | "pull" | "push" | "copy">(null);
  const [pullIdentity, setPullIdentity] = useState(false);
  const [activeView, setActiveView] = useState<"overview" | "differences">(
    "overview",
  );
  const [comparisonState, setComparisonState] = useState<{
    key: string;
    system: AgentDefinition;
    personal: AgentDefinition;
  } | null>(null);
  const [comparisonError, setComparisonError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [comparisonRetry, setComparisonRetry] = useState(0);
  const [confirmPushOpen, setConfirmPushOpen] = useState(false);
  const [repinBusy, setRepinBusy] = useState(false);

  const counterpart =
    counterpartState?.agentId === agentId ? counterpartState.result : null;
  const error = resolveError?.agentId === agentId ? resolveError.message : null;
  const loading = counterpart === null && error === null;
  const selfType: "user" | "builtin" =
    (counterpart?.self.agentType ?? agent?.agentType) === "builtin"
      ? "builtin"
      : "user";

  const load = async (): Promise<boolean> => {
    setCounterpartState(null);
    setResolveError(null);
    try {
      const result = await dispatch(fetchLinkedCounterpart(agentId)).unwrap();
      if (!result) throw new Error("This agent could not be found.");
      setCounterpartState({ agentId, result });
      return true;
    } catch (err) {
      setResolveError({
        agentId,
        message:
          err instanceof Error ? err.message : "Failed to resolve linked agent.",
      });
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    dispatch(fetchLinkedCounterpart(agentId))
      .unwrap()
      .then((result) => {
        if (cancelled) return;
        if (!result) throw new Error("This agent could not be found.");
        setCounterpartState({ agentId, result });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResolveError({
          agentId,
          message:
            err instanceof Error ? err.message : "Failed to resolve linked agent.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, dispatch]);

  const pair = counterpart ? resolvePair(selfType, counterpart) : null;
  const userSide = pair?.userSide ?? null;
  const systemSide = pair?.systemSide ?? null;
  const hasPair = !!userSide && !!systemSide;
  const comparisonKey =
    userSide && systemSide ? `${systemSide.id}:${userSide.id}` : null;
  useEffect(() => {
    if (!comparisonKey || !userSide || !systemSide) return undefined;
    let cancelled = false;
    Promise.all([
      fetchSavedAgentDefinition(systemSide.id),
      fetchSavedAgentDefinition(userSide.id),
    ])
      .then(([system, personal]) => {
        if (cancelled) return;
        setComparisonError(null);
        setComparisonState({ key: comparisonKey, system, personal });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setComparisonError({
          key: comparisonKey,
          message:
            err instanceof Error
              ? err.message
              : "Could not load the two agent definitions.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [comparisonKey, comparisonRetry, systemSide, userSide]);

  const comparisonReady = comparisonState?.key === comparisonKey;
  const systemAgent = comparisonReady ? comparisonState.system : undefined;
  const userAgent = comparisonReady ? comparisonState.personal : undefined;
  const comparison =
    comparisonReady && systemAgent && userAgent
      ? compareAgentDefinitions(systemAgent, userAgent)
      : null;
  const currentComparisonError =
    comparisonError?.key === comparisonKey ? comparisonError.message : null;

  // The reconciliation stamp lives on whichever side was derived.
  const derivedRef =
    userSide && userSide.sourceAgentId === systemSide?.id
      ? userSide
      : systemSide && systemSide.sourceAgentId === userSide?.id
        ? systemSide
        : null;
  const lastSyncedAt = derivedRef?.sourceSnapshotAt ?? null;

  const canPull = !!userSide && (userSide.isOwnedByMe || isSuperAdmin);
  const canPush = isSuperAdmin;

  const refreshLinkedDefinitions = async () => {
    if (!userSide || !systemSide) return;
    const [system, personal] = await Promise.all([
      fetchSavedAgentDefinition(systemSide.id),
      fetchSavedAgentDefinition(userSide.id),
    ]);
    setComparisonState({
      key: `${systemSide.id}:${userSide.id}`,
      system,
      personal,
    });
  };

  const runPull = async () => {
    if (!userSide || !systemSide || !systemAgent || !userAgent) return;
    setBusy("pull");
    try {
      await dispatch(
        syncLinkedAgents({
          fromId: systemSide.id,
          toId: userSide.id,
          includeIdentity: pullIdentity,
          expectedFromUpdatedAt: systemAgent.updatedAt,
          expectedToUpdatedAt: userAgent.updatedAt,
        }),
      ).unwrap();
      toast.success(`Pulled latest into "${userSide.name}".`);
      const [relationshipRefreshed, definitionsRefreshed] = await Promise.all([
        load(),
        refreshLinkedDefinitions()
          .then(() => true)
          .catch(() => false),
      ]);
      if (!relationshipRefreshed || !definitionsRefreshed) {
        toast.warning("Update saved, but the comparison could not be refreshed.");
      }
    } catch (err) {
      setComparisonState(null);
      setComparisonRetry((value) => value + 1);
      toast.error(err instanceof Error ? err.message : "Pull failed.");
    } finally {
      setBusy(null);
    }
  };

  const runPush = async () => {
    if (!userSide || !systemSide || !systemAgent || !userAgent) return;
    setBusy("push");
    try {
      await dispatch(
        syncLinkedAgents({
          fromId: userSide.id,
          toId: systemSide.id,
          includeIdentity: true,
          expectedFromUpdatedAt: userAgent.updatedAt,
          expectedToUpdatedAt: systemAgent.updatedAt,
        }),
      ).unwrap();
      toast.success(`Pushed "${userSide.name}" to the system agent.`);
      const [relationshipRefreshed, definitionsRefreshed] = await Promise.all([
        load(),
        refreshLinkedDefinitions()
          .then(() => true)
          .catch(() => false),
      ]);
      if (!relationshipRefreshed || !definitionsRefreshed) {
        toast.warning("Update saved, but the comparison could not be refreshed.");
      }
    } catch (err) {
      setComparisonState(null);
      setComparisonRetry((value) => value + 1);
      toast.error(err instanceof Error ? err.message : "Push failed.");
    } finally {
      setBusy(null);
    }
  };

  const runCreateCopy = async () => {
    setBusy("copy");
    try {
      const result = await dispatch(createPersonalCopy(agentId)).unwrap();
      toast.success(
        result.alreadyExisted
          ? "Opened your existing personal copy."
          : "Created your personal copy.",
      );
      const refreshed = await load();
      if (!refreshed) {
        toast.warning("Copy created, but the linked view could not be refreshed.");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create personal copy.",
      );
    } finally {
      setBusy(null);
    }
  };

  // ─── Loading / error ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 p-4 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        Resolving linked agent…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={load} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ─── No twin: user agent, super-admin → convert-create flow ──────────────

  if (!hasPair && selfType === "user" && isSuperAdmin) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <ConvertAgentToSystemBody agentId={agentId} onClose={onClose} />
      </div>
    );
  }

  // ─── No twin: builtin → create my personal copy ──────────────────────────

  if (!hasPair && selfType === "builtin") {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <Copy className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed text-muted-foreground">
            Create a personal, editable copy of{" "}
            <span className="font-medium text-foreground">
              {agent?.name ?? "this system agent"}
            </span>
            . Your copy stays linked, so you can pull future updates or (as an
            admin) push your changes back.
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={runCreateCopy} disabled={busy === "copy"}>
            {busy === "copy" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            Create my personal copy
          </Button>
        </div>
      </div>
    );
  }

  // ─── No twin: user agent, not admin ──────────────────────────────────────

  if (!hasPair) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <Unlink className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed text-muted-foreground">
            This agent isn&apos;t linked to a system agent.
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  // ─── Linked pair: relationship + configuration comparison + sync ────────

  const derivedAgent =
    derivedRef?.id === userSide.id
      ? userAgent
      : derivedRef?.id === systemSide.id
        ? systemAgent
        : undefined;
  const relationshipCreatedAt = derivedAgent?.createdAt ?? null;
  const relationshipCreatedLabel =
    derivedRef?.id === systemSide.id ? "System twin linked" : "Personal copy linked";
  const behaviorDifferenceCount = comparison?.behaviorFields.length ?? 0;
  const comparisonAvailable = comparison !== null && currentComparisonError === null;
  const pullHasChanges = Boolean(
    comparison &&
      (comparison.behaviorFields.length > 0 ||
        (pullIdentity && comparison.profileFields.length > 0)),
  );
  const pushHasChanges = Boolean(
    comparison &&
      (comparison.behaviorFields.length > 0 || comparison.profileFields.length > 0),
  );

  const slotDisplayName = slotLabel ?? slotKey ?? null;
  const runRepinToSystem = async () => {
    if (!onRepinToSystem || !systemSide) return;
    setRepinBusy(true);
    try {
      await onRepinToSystem(systemSide.id);
      toast.success(
        `Slot ${slotDisplayName ?? slotKey ?? "(unknown)"} repinned to the system agent "${systemSide.name}" (tracks latest).`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Repinning the slot failed.",
      );
    } finally {
      setRepinBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-card/40 px-4 pt-3">
        {slotDisplayName && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="outline" className="text-[10px]">
                Agent slot
              </Badge>
              <span>
                This is what slot{" "}
                <span className="font-mono font-medium">{slotDisplayName}</span>{" "}
                runs.
              </span>
            </div>
            {onRepinToSystem && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 shrink-0 gap-1 px-1.5 text-[11px]"
                disabled={repinBusy || busy !== null}
                title={`Repin slot ${slotDisplayName} to the system agent "${systemSide.name}" (tracks latest)`}
                onClick={() => void runRepinToSystem()}
              >
                {repinBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3 w-3" />
                )}
                Repin slot to system side
              </Button>
            )}
          </div>
        )}
        <div className="flex items-start gap-3 pb-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="text-xs leading-relaxed text-muted-foreground">
            This personal copy stays linked to its system baseline. Compare what
            changed before choosing a sync direction.
          </div>
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Linked agent details">
          {(["overview", "differences"] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={activeView === view}
              onClick={() => setActiveView(view)}
              className={cn(
                "border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                activeView === view
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {view === "overview" ? "Relationship" : "Configuration diff"}
              {view === "differences" && comparison?.changedFields.length ? (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[9px]">
                  {comparison.changedFields.length}
                </Badge>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {activeView === "differences" ? (
          currentComparisonError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="max-w-md text-sm text-muted-foreground">
                {currentComparisonError}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setComparisonError(null);
                  setComparisonState(null);
                  setComparisonRetry((value) => value + 1);
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry comparison
              </Button>
            </div>
          ) : comparisonReady && systemAgent && userAgent ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-2 text-xs">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <EntityRef
                    token="agent"
                    id={systemSide.id}
                    name={systemSide.name}
                    href={`${basePathFor(systemSide)}/${systemSide.id}`}
                    alwaysShowActions
                  />
                  <span className="text-muted-foreground">compared with</span>
                  <EntityRef
                    token="agent"
                    id={userSide.id}
                    name={userSide.name}
                    href={`${basePathFor(userSide)}/${userSide.id}`}
                    alwaysShowActions
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Operational identity is excluded; local record state is shown but not synced
                </span>
              </div>
              <AgentDiffViewer
                oldAgent={systemAgent}
                newAgent={userAgent}
                oldLabel={`System — ${systemSide.name}${systemAgent.version != null ? ` v${systemAgent.version}` : ""}`}
                newLabel={`Personal — ${userSide.name}${userAgent.version != null ? ` v${userAgent.version}` : ""}`}
                className="h-full min-h-0 flex-1"
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Comparing current definitions…
            </div>
          )
        ) : (
          <div className="h-full overflow-y-auto p-4">
            <div className="mx-auto max-w-4xl space-y-4">
              {currentComparisonError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                    <span>Comparison unavailable: {currentComparisonError}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setComparisonError(null);
                        setComparisonState(null);
                        setComparisonRetry((value) => value + 1);
                      }}
                    >
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : comparison ? (
                <div
                  className={cn(
                    "flex flex-wrap items-start gap-3 rounded-lg border px-3 py-3",
                    comparison.behaviorMatches
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-amber-500/35 bg-amber-500/5",
                  )}
                >
                  {comparison.behaviorMatches ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <GitCompareArrows className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {comparison.comparedConfigurationMatches
                        ? "Compared configuration is identical"
                        : comparison.behaviorMatches
                          ? "Runtime behavior matches"
                          : `Runtime behavior differs in ${behaviorDifferenceCount} ${behaviorDifferenceCount === 1 ? "section" : "sections"}`}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {comparison.behaviorMatches
                        ? comparison.localStateFields.length > 0
                          ? `Synced behavior matches, but local record state differs: ${comparison.localStateFields.map((field) => formatText(field.key)).join(", ")}${comparison.profileFields.length > 0 ? `; profile details also differ: ${comparison.profileFields.map((field) => formatText(field.key)).join(", ")}` : ""}.`
                          : comparison.profileFields.length > 0
                            ? `Only personal profile details differ: ${comparison.profileFields.map((field) => formatText(field.key)).join(", ")}.`
                            : "The current runtime configuration matches the system baseline."
                        : `Changed behavior: ${comparison.behaviorFields.map((field) => formatText(field.key)).join(", ")}.`}
                    </p>
                  </div>
                  {comparison.changedFields.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setActiveView("differences")}
                    >
                      Review diff
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Comparing current definitions…
                </div>
              )}

              <section aria-labelledby="relationship-map-title">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 id="relationship-map-title" className="text-xs font-semibold">
                    Current relationship
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    System baseline → personal copy
                  </span>
                </div>
                <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <AgentHeadCard
                    agentRef={systemSide}
                    agent={systemAgent}
                    label="System baseline"
                  />
                  <div className="flex items-center justify-center gap-1 text-muted-foreground sm:flex-col">
                    <div className="h-px flex-1 bg-border sm:h-full sm:min-h-6 sm:w-px" />
                    <div className="rounded-full border border-border bg-background p-1.5" title="Linked copy">
                      <GitFork className="h-3.5 w-3.5" />
                    </div>
                    <div className="h-px flex-1 bg-border sm:h-full sm:min-h-6 sm:w-px" />
                  </div>
                  <AgentHeadCard
                    agentRef={userSide}
                    agent={userAgent}
                    label={userSide.isOwnedByMe ? "My personal copy" : "Personal copy"}
                  />
                </div>
              </section>

              <section aria-labelledby="relationship-history-title" className="rounded-lg border border-border bg-muted/20 p-3">
                <h3 id="relationship-history-title" className="mb-3 text-xs font-semibold">
                  Relationship history
                </h3>
                <ol className="space-y-3 text-xs">
                  <li className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
                    <div>
                      <div className="font-medium">{relationshipCreatedLabel}</div>
                      <div className="text-muted-foreground">
                        {formatTimestamp(relationshipCreatedAt)}
                      </div>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div>
                      <div className="font-medium">Last reconciled</div>
                      <div className="text-muted-foreground">
                        {formatTimestamp(lastSyncedAt)}
                      </div>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        comparison
                          ? comparison.behaviorMatches
                            ? "bg-emerald-500"
                            : "bg-amber-500"
                          : "bg-muted-foreground/40",
                      )}
                    />
                    <div>
                      <div className="font-medium">Current heads compared</div>
                      <div className="text-muted-foreground">
                        {comparison
                          ? comparison.behaviorMatches
                            ? "Runtime behavior matches now."
                            : `${behaviorDifferenceCount} behavior ${behaviorDifferenceCount === 1 ? "section differs" : "sections differ"} now.`
                          : "Comparison is loading."}
                      </div>
                    </div>
                  </li>
                </ol>
                <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                  This history shows the saved relationship milestones available today. Use each agent&apos;s Versions door for its full edit history.
                </p>
              </section>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-border bg-card px-4 py-3">
        {canPull && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="pull-identity"
              checked={pullIdentity}
              onCheckedChange={(value) => setPullIdentity(value === true)}
            />
            <Label
              htmlFor="pull-identity"
              className="cursor-pointer text-xs font-normal text-muted-foreground"
            >
              Pull profile details too (name, description, category, and tags)
            </Label>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={runPull}
              disabled={
                !canPull || busy !== null || !comparisonAvailable || !pullHasChanges
              }
              title={
                canPull
                  ? !comparisonAvailable
                    ? "Wait for the comparison to finish"
                    : !pullHasChanges
                      ? "The selected pull would not change the personal copy"
                      : "Copy the system baseline into the personal copy"
                  : "You can only pull into a copy you own"
              }
            >
              {busy === "pull" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowDownToLine className="h-3.5 w-3.5" />
              )}
              Update personal copy
            </Button>
            <Button
              size="sm"
              onClick={() => setConfirmPushOpen(true)}
              disabled={
                !canPush || busy !== null || !comparisonAvailable || !pushHasChanges
              }
              title={
                canPush
                  ? !comparisonAvailable
                    ? "Wait for the comparison to finish"
                    : !pushHasChanges
                      ? "The personal copy has no syncable changes"
                      : "Replace the system baseline with the personal copy"
                  : "Only super admins can update a system agent"
              }
            >
              {busy === "push" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowUpFromLine className="h-3.5 w-3.5" />
              )}
              Update system baseline
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmPushOpen} onOpenChange={setConfirmPushOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update the shared system baseline?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the system agent&apos;s runtime configuration and
              profile with the personal copy. It can affect every user and
              slot that follows this system agent.
              {comparison && !comparison.comparedConfigurationMatches
                ? ` The current comparison contains ${comparison.changedFields.length} changed ${comparison.changedFields.length === 1 ? "section" : "sections"}.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current baseline</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runPush()}>
              Update system baseline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
