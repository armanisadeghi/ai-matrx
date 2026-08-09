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
 * THE PANEL ANSWERS BEFORE IT ASKS. It opens by actually comparing the two
 * agents — identical / differs / unknown — over exactly the fields
 * `agx_sync_linked_agents` copies (`features/agents/sync/sync-fields.ts`), so
 * the verdict can never disagree with what Pull/Push would write. A "last
 * synced" timestamp is not a verdict; it is demoted to a footnote. When the
 * pair matches for a given direction, that direction's button says so instead
 * of inviting a pointless overwrite.
 *
 * The DB (`agx_sync_linked_agents`) remains the real authority on linkage +
 * write gating; this component only enables/labels the actions.
 * Direction-agnostic by design: the link lives on whichever side was derived,
 * and we resolve the twin from either end via `fetchLinkedCounterpart`.
 */

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  fetchAgentSyncComparison,
  fetchLinkedCounterpart,
  syncLinkedAgents,
  createPersonalCopy,
} from "@/features/agents/redux/agent-definition/thunks";
import type {
  LinkedAgentRef,
  LinkedCounterpartResult,
} from "@/features/agents/types/agent-definition.types";
import {
  agentSyncImpact,
  describeAgentSyncImpact,
  type AgentSyncComparison,
  type AgentSyncFieldChange,
} from "@/features/agents/sync/compare";
import { ConvertAgentToSystemBody } from "@/features/agents/components/admin/ConvertAgentToSystemBody";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Clock,
  Copy,
  GitCompare,
  Loader2,
  RefreshCw,
  Unlink,
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast-service";
import { cn } from "@/lib/utils";

const SYSTEM_AGENT_ADMIN_BASE_PATH = "/administration/agents/system-agents/agents";
const USER_AGENT_BASE_PATH = "/agents";

interface AgentSyncBodyProps {
  agentId: string;
  onClose: () => void;
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

/**
 * Resolve the (userSide, systemSide) pair around the viewed agent.
 *
 * `otherLinked` is everything else this agent is demonstrably linked to but
 * which is NOT the system twin — most often a personal duplicate of a personal
 * agent. This panel only syncs a user↔system pair, but the relationship is
 * still resolved, and THE DOOR LAW says a relationship you can resolve must be
 * rendered and reachable. Saying "this isn't linked to a system agent" while
 * silently holding three linked relatives is the dead end that rule exists for.
 */
function resolvePair(
  selfType: "user" | "builtin",
  counterpart: LinkedCounterpartResult,
): {
  userSide: LinkedAgentRef | null;
  systemSide: LinkedAgentRef | null;
  otherLinked: LinkedAgentRef[];
} {
  const { self, source, derived } = counterpart;
  const candidates = [source, ...derived].filter(Boolean) as LinkedAgentRef[];

  if (selfType === "builtin") {
    // Prefer my own user copy; fall back to any visible user-side twin.
    const userSide =
      candidates.find((c) => c.agentType === "user" && c.isOwnedByMe) ??
      candidates.find((c) => c.agentType === "user") ??
      null;
    return {
      userSide,
      systemSide: self,
      otherLinked: candidates.filter((c) => c.id !== userSide?.id),
    };
  }

  // self is a user agent — find its system twin.
  const systemSide = candidates.find((c) => c.agentType === "builtin") ?? null;
  return {
    userSide: self,
    systemSide,
    otherLinked: candidates.filter((c) => c.id !== systemSide?.id),
  };
}

/**
 * Linked agents this panel cannot sync, rendered as doors rather than withheld.
 */
function LinkedRelatives({ refs }: { refs: LinkedAgentRef[] }) {
  if (refs.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-muted-foreground">
        Still linked to {refs.length} other agent
        {refs.length === 1 ? "" : "s"} this panel does not sync:
      </div>
      <div className="rounded-md border border-border bg-card divide-y divide-border">
        {refs.map((ref) => (
          <div key={ref.id} className="flex items-center gap-2 px-3 py-1.5">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] shrink-0",
                ref.agentType === "builtin"
                  ? "border-primary/40 text-primary"
                  : "text-muted-foreground",
              )}
            >
              {ref.agentType === "builtin" ? "System" : "User"}
            </Badge>
            <EntityRef
              token="agent"
              id={ref.id}
              name={ref.name}
              href={`${basePathFor(ref)}/${ref.id}/build`}
              showIcon={false}
              alwaysShowActions
              className="flex-1 text-xs"
            />
            {ref.isOwnedByMe && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                mine
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Re-run the comparison. Always available beside a verdict, because a verdict
 * is a snapshot and this panel can outlive the state it describes.
 */
function RecheckButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      title="Re-check — compare these two agents again"
      aria-label="Re-check the comparison"
      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
    >
      <RefreshCw className="w-3 h-3" />
    </Button>
  );
}

/** One changed field, named and quantified. */
function FieldChangeChip({ change }: { change: AgentSyncFieldChange }) {
  const detail = change.orderOnly
    ? "order only"
    : change.changedCount > 1
      ? `${change.changedCount} changes`
      : null;

  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]"
      title={`${change.label} — differs (agent.definition.${change.column})`}
    >
      <span className="font-medium text-foreground">{change.label}</span>
      {detail && <span className="text-muted-foreground">{detail}</span>}
      {change.group === "identity" && (
        <Badge
          variant="outline"
          className="h-3.5 px-1 text-[9px] leading-none text-muted-foreground"
        >
          identity
        </Badge>
      )}
    </span>
  );
}

export function AgentSyncBody({ agentId, onClose }: AgentSyncBodyProps) {
  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const dispatch = useAppDispatch();

  /**
   * Both async reads are stored KEYED by what they describe, and their
   * loading/error states are derived from that key rather than set from inside
   * an effect. That keeps a stale result (or a stale error) from a previously
   * viewed agent from ever being rendered as if it belonged to this one.
   */
  const [counterpartState, setCounterpartState] = useState<{
    agentId: string;
    result: LinkedCounterpartResult | null;
  } | null>(null);
  const [errorState, setErrorState] = useState<{
    agentId: string;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState<null | "pull" | "push" | "copy">(null);
  const [pullIdentity, setPullIdentity] = useState(false);
  /** Bumped after a sync so the comparison is recomputed against fresh rows. */
  const [syncNonce, setSyncNonce] = useState(0);

  const error = errorState?.agentId === agentId ? errorState.message : null;
  const counterpart =
    counterpartState?.agentId === agentId ? counterpartState.result : null;
  const loading = counterpartState?.agentId !== agentId && !error;

  const selfType: "user" | "builtin" =
    agent?.agentType === "builtin" ? "builtin" : "user";

  useEffect(() => {
    let cancelled = false;
    dispatch(fetchLinkedCounterpart(agentId))
      .unwrap()
      .then((result) => {
        if (!cancelled) setCounterpartState({ agentId, result });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorState({
          agentId,
          message:
            err instanceof Error
              ? err.message
              : "Failed to resolve linked agent.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, dispatch, syncNonce]);

  const pair = counterpart ? resolvePair(selfType, counterpart) : null;
  const userSide = pair?.userSide ?? null;
  const systemSide = pair?.systemSide ?? null;
  const hasPair = !!userSide && !!systemSide;
  const otherLinked = pair?.otherLinked ?? [];

  const userSideId = userSide?.id ?? null;
  const systemSideId = systemSide?.id ?? null;

  /**
   * Compare on open, and again after every sync. The nonce is part of the key,
   * so a sync invalidates the old verdict instead of leaving it on screen.
   *
   * A REQUEST FAILURE IS NOT A VERDICT. A 500, a timeout, or an offline browser
   * is stored as an error and reported as one — folding it into `unknown` would
   * tell the user their permissions are wrong when the network simply blipped,
   * and would leave them no way back except closing the panel.
   */
  const [comparisonState, setComparisonState] = useState<
    | { key: string; ok: true; value: AgentSyncComparison }
    | { key: string; ok: false; message: string }
    | null
  >(null);

  const pairKey =
    userSideId && systemSideId
      ? `${userSideId}|${systemSideId}|${syncNonce}`
      : null;
  const currentComparison =
    pairKey && comparisonState?.key === pairKey ? comparisonState : null;
  const comparison =
    currentComparison?.ok === true ? currentComparison.value : null;
  const comparisonError =
    currentComparison?.ok === false ? currentComparison.message : null;
  const comparing = !!pairKey && currentComparison === null;

  useEffect(() => {
    if (!userSideId || !systemSideId || !pairKey) return;
    let cancelled = false;
    dispatch(
      fetchAgentSyncComparison({
        userAgentId: userSideId,
        systemAgentId: systemSideId,
      }),
    )
      .unwrap()
      .then((value) => {
        if (!cancelled) setComparisonState({ key: pairKey, ok: true, value });
      })
      .catch((err: unknown) => {
        console.error("[AgentSyncBody] agent comparison failed", err);
        if (cancelled) return;
        setComparisonState({
          key: pairKey,
          ok: false,
          message:
            err instanceof Error
              ? err.message
              : "The comparison request failed.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [userSideId, systemSideId, pairKey, dispatch]);

  const canPull = !!userSide && (userSide.isOwnedByMe || isSuperAdmin);
  const canPush = isSuperAdmin;

  /**
   * Re-resolve the pair AND re-run the comparison. Doubles as the retry and as
   * the user-facing "Re-check".
   */
  const refreshAfterSync = () => {
    setErrorState(null);
    setSyncNonce((n) => n + 1);
  };

  /**
   * The verdict is a snapshot, and this panel can sit open for a long time
   * while the very agents it describes are edited in another tab. A stale
   * "identical" is worse than no verdict, because it DISABLES both buttons —
   * the user would be unable to sync a difference that already exists. So the
   * comparison is re-run whenever the user comes back to this tab, and the
   * verdict carries an explicit Re-check for the cases focus can't catch.
   */
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      // Never re-key mid-sync; the sync's own refresh covers that.
      if (busy !== null) return;
      setSyncNonce((n) => n + 1);
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [busy]);

  const runPull = async () => {
    if (!userSide || !systemSide) return;
    setBusy("pull");
    try {
      await dispatch(
        syncLinkedAgents({
          fromId: systemSide.id,
          toId: userSide.id,
          includeIdentity: pullIdentity,
        }),
      ).unwrap();
      toast.success(`Pulled latest into "${userSide.name}".`);
      refreshAfterSync();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pull failed.");
    } finally {
      setBusy(null);
    }
  };

  const runPush = async () => {
    if (!userSide || !systemSide) return;
    setBusy("push");
    try {
      await dispatch(
        syncLinkedAgents({
          fromId: userSide.id,
          toId: systemSide.id,
          includeIdentity: true,
        }),
      ).unwrap();
      toast.success(`Pushed "${userSide.name}" to the system agent.`);
      refreshAfterSync();
    } catch (err) {
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
      refreshAfterSync();
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
      <div className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        Resolving linked agent…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 py-2">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={refreshAfterSync} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ─── No twin: user agent, super-admin → convert-create flow ──────────────

  if (!hasPair && selfType === "user" && isSuperAdmin) {
    if (otherLinked.length === 0) {
      return <ConvertAgentToSystemBody agentId={agentId} onClose={onClose} />;
    }
    return (
      <div className="space-y-4">
        <LinkedRelatives refs={otherLinked} />
        <ConvertAgentToSystemBody agentId={agentId} onClose={onClose} />
      </div>
    );
  }

  // ─── No twin: builtin → create my personal copy ──────────────────────────

  if (!hasPair && selfType === "builtin") {
    return (
      <div className="space-y-4">
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
        <LinkedRelatives refs={otherLinked} />
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
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <Unlink className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed text-muted-foreground">
            This agent isn&apos;t linked to a system agent
            {otherLinked.length > 0 ? ", so there is nothing to push or pull here." : "."}
          </div>
        </div>
        <LinkedRelatives refs={otherLinked} />
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  // ─── Linked pair: verdict, then push / pull ──────────────────────────────

  // Unreachable — `hasPair` above already guarantees both sides. Present so the
  // rest of this branch is narrowed without non-null assertions.
  if (!userSide || !systemSide) return null;

  // The reconciliation stamp lives on whichever side was derived. It is
  // provenance, not a verdict — the comparison above is the verdict.
  const derivedRef =
    userSide && userSide.sourceAgentId === systemSide?.id
      ? userSide
      : systemSide && systemSide.sourceAgentId === userSide?.id
        ? systemSide
        : null;
  const lastSyncedAt = derivedRef?.sourceSnapshotAt ?? null;

  const pullImpact = comparison
    ? agentSyncImpact(comparison, pullIdentity)
    : null;
  const pushImpact = comparison ? agentSyncImpact(comparison, true) : null;

  // "Nothing to sync" is a VERDICT and only ever set from a finished
  // comparison — never while one is in flight, or the button would lie.
  const pullBlocked = !!pullImpact?.nothingToSync;
  const pushBlocked = !!pushImpact?.nothingToSync;

  /**
   * Disabled is broader than the verdict, but deliberately NOT "disabled
   * whenever the impact is unknown".
   *
   * `comparing` blocks the transient states — the first load and the recheck
   * after a sync — because the answer is seconds away and firing a second
   * overwrite into it is pure race.
   *
   * `unknown` and a failed comparison stay ENABLED on purpose. There the answer
   * is not coming: a side is unreadable, or the request failed. Blocking sync
   * would strand a super admin who legitimately needs to publish and can see
   * perfectly well what they are doing — over-tightening is its own defect. The
   * verdict card says plainly that we could not compare, and each button's
   * tooltip says it would overwrite the target with changes the user cannot see
   * here. Informed, not prevented.
   */
  const pullDisabled = !canPull || busy !== null || comparing || pullBlocked;
  const pushDisabled = !canPush || busy !== null || comparing || pushBlocked;

  const diffHref = `/agents/compare?left=${encodeURIComponent(
    userSide.id,
  )}&right=${encodeURIComponent(systemSide.id)}`;

  return (
    <div className="space-y-4">
      {/* Verdict — the answer, before any action is offered */}
      {comparing ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
          Comparing the two agents…
        </div>
      ) : comparisonError ? (
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              The comparison request failed.
            </span>{" "}
            {comparisonError} This is a problem reaching the data, not a verdict
            — the two agents may or may not differ.
            <div className="mt-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshAfterSync}
                className="h-6 gap-1.5 text-[11px]"
              >
                <RefreshCw className="w-3 h-3" />
                Try again
              </Button>
            </div>
          </div>
        </div>
      ) : !comparison ? null : comparison.verdict === "identical" ? (
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              These two agents are identical.
            </span>{" "}
            All {comparison.comparedFieldCount} fields that sync would copy
            already match. There is nothing to pull or push.
          </div>
          <RecheckButton onClick={refreshAfterSync} />
        </div>
      ) : comparison.verdict === "unknown" ? (
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              Could not compare these agents.
            </span>{" "}
            The{" "}
            {comparison.unreadable.length === 2
              ? "agent records are"
              : comparison.unreadable[0] === "system"
                ? "system agent is"
                : "user copy is"}{" "}
            not readable from this account, so syncing would overwrite the
            target with changes you cannot see here.
          </div>
          <RecheckButton onClick={refreshAfterSync} />
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <div className="flex items-start gap-3">
            <GitCompare className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">
                These agents are not identical.
              </span>{" "}
              {comparison.changed.length} of {comparison.comparedFieldCount}{" "}
              synced fields differ
              {comparison.behaviorChanged.length === 0
                ? " — all of them identity fields, so behavior is in sync"
                : ""}
              .
            </div>
            <RecheckButton onClick={refreshAfterSync} />
          </div>
          <div className="flex flex-wrap gap-1 pl-7">
            {comparison.changed.map((change) => (
              <FieldChangeChip key={change.field} change={change} />
            ))}
          </div>
          {/*
            The chips above are the authority on what SYNC would change. The
            full diff answers the broader question "how do these two agents
            differ at all" — it covers fields sync never copies (ui_gates,
            matrx_actions, flags) and softens some differences for readability,
            so it is offered as a wider view, never as the same list.
          */}
          <div className="pl-7">
            <Button
              asChild
              variant="link"
              size="sm"
              className="h-auto p-0 text-[11px]"
            >
              <Link href={diffHref} target="_blank" rel="noopener noreferrer">
                Open the full side-by-side diff
              </Link>
            </Button>
            <span className="ml-1.5 text-[11px] text-muted-foreground">
              — every field, including ones sync does not copy
            </span>
          </div>
        </div>
      )}

      {/* Pair card — every identity is a door */}
      <div className="rounded-md border border-border bg-card divide-y divide-border">
        {[userSide, systemSide].map((ref) =>
          ref ? (
            <div key={ref.id} className="flex items-center gap-2 px-3 py-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] shrink-0",
                  ref.agentType === "builtin"
                    ? "border-primary/40 text-primary"
                    : "text-muted-foreground",
                )}
              >
                {ref.agentType === "builtin" ? "System" : "User copy"}
              </Badge>
              <EntityRef
                token="agent"
                id={ref.id}
                name={ref.name}
                href={`${basePathFor(ref)}/${ref.id}/build`}
                showIcon={false}
                alwaysShowActions
                className="flex-1 text-sm font-medium"
              />
              {ref.isOwnedByMe && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  mine
                </Badge>
              )}
            </div>
          ) : null,
        )}
      </div>

      {/* Provenance footnote — not a verdict */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-0.5">
        <Clock className="w-3 h-3 shrink-0" />
        Last reconciled {formatTimestamp(lastSyncedAt)}
      </div>

      {/* Pull options */}
      {canPull && (
        <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2">
          <Checkbox
            id="pull-identity"
            checked={pullIdentity}
            onCheckedChange={(v) => setPullIdentity(v === true)}
          />
          <Label
            htmlFor="pull-identity"
            className="text-xs font-normal text-muted-foreground cursor-pointer"
          >
            On pull, also overwrite my copy&apos;s name, description, category
            &amp; tags
            {comparison?.verdict === "differs" &&
              comparison.identityChanged.length > 0 && (
                <span className="text-foreground">
                  {" "}
                  ({comparison.identityChanged.length} would change)
                </span>
              )}
          </Label>
        </div>
      )}

      {/* Actions — labelled with what they would actually overwrite */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runPull}
            disabled={pullDisabled}
            className="gap-1.5"
            title={
              !canPull
                ? "You can only pull into a copy you own"
                : pullImpact
                  ? describeAgentSyncImpact(pullImpact, userSide.name)
                  : comparisonError
                    ? "The comparison failed — syncing would overwrite the target with changes you cannot see here."
                    : "Comparing…"
            }
          >
            {busy === "pull" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowDownToLine className="w-3.5 h-3.5" />
            )}
            {pullBlocked
              ? "Nothing to pull"
              : pullImpact && pullImpact.count > 0
                ? `Pull ${pullImpact.count} field${pullImpact.count === 1 ? "" : "s"}`
                : "Pull from system"}
          </Button>
          <Button
            size="sm"
            onClick={runPush}
            disabled={pushDisabled}
            className="gap-1.5"
            title={
              !canPush
                ? "Only super admins can push to a system agent"
                : pushImpact
                  ? describeAgentSyncImpact(pushImpact, systemSide.name)
                  : comparisonError
                    ? "The comparison failed — syncing would overwrite the target with changes you cannot see here."
                    : "Comparing…"
            }
          >
            {busy === "push" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowUpFromLine className="w-3.5 h-3.5" />
            )}
            {pushBlocked
              ? "Nothing to push"
              : pushImpact && pushImpact.count > 0
                ? `Push ${pushImpact.count} field${pushImpact.count === 1 ? "" : "s"}`
                : "Push to system"}
          </Button>
        </div>
      </div>
    </div>
  );
}
