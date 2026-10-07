"use client";

/**
 * AgentSyncBody
 *
 * Linked Agent Sync: every agent linked to the viewed one by lineage — its
 * parent (`source_agent_id`) and every child copy — user or system alike. Pick
 * any relative to compare. Internally the pair is oriented base → copy (the
 * system agent is "base" when exactly one side is system, otherwise the parent);
 * that is plumbing for the diff only. ON SCREEN the agents are "this agent",
 * "the system agent" and "the linked agent", and the buttons say "Copy to …" /
 * "Copy from …" from where the person stands — never "baseline"/"original"
 * (Arman, 2026-10-06: system agents are usually made FROM a person's agent).
 *
 *   - Pull  (base → copy)  — copy's owner, or super admin for a system copy
 *   - Push  (copy → base)  — base's owner, or super admin for a system base
 *   - Create my personal copy  — from a system agent with none of mine yet
 *   - Make system agent        — super admin, user agent with no system relative
 *
 * The DB (`agx_sync_linked_agents_reviewed`) is the real authority on linkage +
 * write gating; this component only enables/labels the actions.
 */

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { selectAdminFeature } from "@/lib/redux/selectors/userSelectors";
import {
  fetchLinkedCounterpart,
  syncLinkedAgents,
  createPersonalCopy,
} from "@/features/agents/redux/builder-tier.thunks";
import type {
  AgentDefinition,
  LinkedAgentRef,
  LinkedCounterpartResult,
} from "@ai-matrx/chat/agents/types/agent-definition.types";
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
import { getAgentModeHref } from "@ai-matrx/chat/agents/components/shared/AgentModeController";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { fetchSavedAgentDefinition } from "@ai-matrx/chat/agents/services/agent-definition-snapshot.service";
import type { DiffTemporalMetadata } from "@ai-matrx/diff/structural";
import {
  deriveAgentFieldChangeMoments,
  findAgentVersionMoment,
  type AgentVersionFieldSnapshot,
} from "@/features/agents/sync/field-change-history";
import { fetchAgentVersionFieldSnapshots } from "@/features/agents/sync/field-change-history.service";
import { formatAbsoluteDate } from "@/utils/datetime";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";

const SYSTEM_AGENT_ADMIN_BASE_PATH =
  "/administration/agents/system-agents/agents";
const USER_AGENT_BASE_PATH = "/agents";

interface AgentSyncBodyProps {
  agentId: string;
  onClose: () => void;
  /**
   * Optional mandate context — set when this comparison was opened FROM an agent
   * mandate (the admin mandates console). When present, the linked-pair view names
   * the mandate it is judging ("This is what mandate X runs") and, with
   * `onRebindToSystem`, offers "Rebind mandate to system side" inside the diff.
   * Every other caller passes nothing and is unchanged.
   */
  mandateKey?: AnyMandateKey;
  mandateLabel?: string;
  onRebindToSystem?: (systemAgentId: string) => Promise<void>;
}

function formatTimestamp(iso: string | null | undefined): string {
  return formatAbsoluteDate(
    iso,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    },
    "never",
  );
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
        <span className="type-meta tabular-nums text-muted-foreground">
          {agent?.version != null ? `v${agent.version}` : "Current"}
        </span>
      </div>
      <EntityRef
        token="agent"
        id={agentRef.id}
        name={agentRef.name}
        href={`${basePath}/${agentRef.id}`}
        alwaysShowActions
        className="max-w-full type-title"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate type-meta text-muted-foreground">
          Updated {formatTimestamp(agent?.updatedAt)}
        </span>
        <Button
          asChild
          variant="quiet"
          className="shrink-0"
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

/** One agent linked to the viewed agent by lineage: its parent or a child. */
interface LinkedRelative {
  ref: LinkedAgentRef;
  role: "parent" | "child";
}

/**
 * Every agent linked to the viewed one: its parent (`source`) and every child
 * (`derived`), user or system alike. A link is a link — the DB
 * (`agx_sync_linked_agents_reviewed`) syncs any parent/child pair and gates the
 * write itself, so no relative is hidden here because of its type.
 */
function listRelatives(counterpart: LinkedCounterpartResult): LinkedRelative[] {
  const relatives: LinkedRelative[] = [];
  if (counterpart.source) {
    relatives.push({ ref: counterpart.source, role: "parent" });
  }
  for (const ref of counterpart.derived) {
    if (ref.id !== counterpart.source?.id) relatives.push({ ref, role: "child" });
  }
  return relatives;
}

/**
 * Default relative to open: a system twin first (the historic purpose of this
 * panel), then my own copy, then the parent, then the newest child.
 */
function defaultRelativeId(
  self: LinkedAgentRef,
  relatives: LinkedRelative[],
): string | null {
  const twin =
    self.agentType === "builtin"
      ? (relatives.find((r) => r.ref.agentType === "user" && r.ref.isOwnedByMe) ??
        relatives.find((r) => r.ref.agentType === "user"))
      : relatives.find((r) => r.ref.agentType === "builtin");
  return (
    twin?.ref.id ??
    relatives.find((r) => r.role === "parent")?.ref.id ??
    relatives[0]?.ref.id ??
    null
  );
}

/**
 * Orient the (self, relative) pair as base → copy for the diff. When exactly one
 * side is a system agent it is the base; otherwise the lineage parent is. These
 * names never reach the screen (see the header).
 */
function resolvePair(
  self: LinkedAgentRef,
  relative: LinkedRelative,
): { baseSide: LinkedAgentRef; copySide: LinkedAgentRef } {
  const other = relative.ref;
  const selfSystem = self.agentType === "builtin";
  const otherSystem = other.agentType === "builtin";
  if (selfSystem !== otherSystem) {
    return selfSystem
      ? { baseSide: self, copySide: other }
      : { baseSide: other, copySide: self };
  }
  return relative.role === "parent"
    ? { baseSide: other, copySide: self }
    : { baseSide: self, copySide: other };
}

function relativeLabel(relative: LinkedRelative): string {
  const kind = relative.ref.agentType === "builtin" ? "System" : "User";
  return relative.role === "parent" ? `${kind} · parent` : `${kind} · child`;
}

function LinkedRelativesList({
  relatives,
  selectedId,
  onSelect,
}: {
  relatives: LinkedRelative[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
}) {
  if (relatives.length === 0) return null;
  return (
    <section aria-labelledby="linked-agents-title">
      <h3
        id="linked-agents-title"
        className="mb-2 type-secondary font-semibold"
      >
        Linked agents
      </h3>
      <ul className="space-y-1.5">
        {relatives.map((relative) => {
          const selected = relative.ref.id === selectedId;
          return (
            <li
              key={relative.ref.id}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5",
                selected ? "border-primary/50 bg-primary/5" : "border-border",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {relativeLabel(relative)}
                </Badge>
                <EntityRef
                  token="agent"
                  id={relative.ref.id}
                  name={relative.ref.name}
                  href={`${basePathFor(relative.ref)}/${relative.ref.id}`}
                  alwaysShowActions
                />
              </div>
              {onSelect &&
                (selected ? (
                  <span className="shrink-0 type-meta text-primary">
                    Comparing
                  </span>
                ) : (
                  <Button
                    variant="quiet"
                    className="shrink-0"
                    onClick={() => onSelect(relative.ref.id)}
                  >
                    Compare
                  </Button>
                ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AgentSyncBody({
  agentId,
  onClose,
  mandateKey,
  mandateLabel,
  onRebindToSystem,
}: AgentSyncBodyProps) {
  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  // Registered admin features on a user page (utils/auth/adminFeaturesOnUserPages.ts).
  const canMaintainSystemAgents = useAppSelector((state) =>
    selectAdminFeature(state, "agent.system-sync"),
  );
  const canMakeSystemAgent = useAppSelector((state) =>
    selectAdminFeature(state, "agent.make-system"),
  );
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
  const [selectedRelativeId, setSelectedRelativeId] = useState<string | null>(
    null,
  );
  const [startOver, setStartOver] = useState<null | "convert">(null);
  const [comparisonState, setComparisonState] = useState<{
    key: string;
    system: AgentDefinition;
    personal: AgentDefinition;
  } | null>(null);
  const [comparisonError, setComparisonError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [fieldHistoryState, setFieldHistoryState] = useState<{
    key: string;
    system: AgentVersionFieldSnapshot[];
    personal: AgentVersionFieldSnapshot[];
  } | null>(null);
  const [fieldHistoryError, setFieldHistoryError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [comparisonRetry, setComparisonRetry] = useState(0);
  const [confirmPushOpen, setConfirmPushOpen] = useState(false);
  const [rebindBusy, setRebindBusy] = useState(false);

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
          err instanceof Error
            ? err.message
            : "Failed to resolve linked agent.",
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
            err instanceof Error
              ? err.message
              : "Failed to resolve linked agent.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, dispatch]);

  const selfDeletedAt = counterpart?.self.deletedAt ?? null;
  const relatives = counterpart ? listRelatives(counterpart) : [];
  const selectedRelative =
    counterpart && !selfDeletedAt
      ? (relatives.find((r) => r.ref.id === selectedRelativeId) ??
        relatives.find(
          (r) => r.ref.id === defaultRelativeId(counterpart.self, relatives),
        ) ??
        null)
      : null;
  const pair =
    counterpart && selectedRelative
      ? resolvePair(counterpart.self, selectedRelative)
      : null;
  const copySide = pair?.copySide ?? null;
  const baseSide = pair?.baseSide ?? null;
  const baseIsSystem = baseSide?.agentType === "builtin";
  const copyIsSystem = copySide?.agentType === "builtin";
  const systemTwin = baseIsSystem ? baseSide : copyIsSystem ? copySide : null;
  // Words name each agent for what it IS to the person looking — this agent,
  // the system agent, or the linked agent — never "baseline"/"original"/"copy":
  // system agents are usually made FROM a person's agent, so neither side is
  // "first" (Arman, 2026-10-06).
  const selfId = counterpart?.self.id ?? null;
  const sideNoun = (side: LinkedAgentRef | null): string =>
    side?.id === selfId
      ? "this agent"
      : side?.agentType === "builtin"
        ? "the system agent"
        : "the linked agent";
  const sideLabel = (side: LinkedAgentRef | null): string =>
    side?.id === selfId
      ? "This agent"
      : side?.agentType === "builtin"
        ? "System agent"
        : "Linked agent";
  const otherShort = (side: LinkedAgentRef | null): string =>
    side?.agentType === "builtin" ? "system agent" : "linked agent";
  const baseNoun = sideNoun(baseSide);
  const copyNoun = sideNoun(copySide);
  // Pull writes base → copy; push writes copy → base. Each button says the
  // direction from where the person stands.
  const pullLabel =
    copySide?.id === selfId ? `Copy from ${otherShort(baseSide)}` : `Copy to ${otherShort(copySide)}`;
  const pushLabel =
    baseSide?.id === selfId ? `Copy from ${otherShort(copySide)}` : `Copy to ${otherShort(baseSide)}`;
  const hasPair = !!copySide && !!baseSide;
  const comparisonKey =
    copySide && baseSide ? `${baseSide.id}:${copySide.id}` : null;
  useEffect(() => {
    if (!comparisonKey || !copySide || !baseSide) return undefined;
    let cancelled = false;
    Promise.all([
      fetchSavedAgentDefinition(baseSide.id),
      fetchSavedAgentDefinition(copySide.id),
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
  }, [comparisonKey, comparisonRetry, baseSide, copySide]);

  useEffect(() => {
    if (!comparisonKey || !copySide || !baseSide) return undefined;
    let cancelled = false;
    Promise.all([
      fetchAgentVersionFieldSnapshots(baseSide.id),
      fetchAgentVersionFieldSnapshots(copySide.id),
    ])
      .then(([system, personal]) => {
        if (cancelled) return;
        setFieldHistoryError(null);
        setFieldHistoryState({ key: comparisonKey, system, personal });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFieldHistoryError({
          key: comparisonKey,
          message:
            err instanceof Error
              ? err.message
              : "Could not load the agents' version histories.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [comparisonKey, comparisonRetry, baseSide, copySide]);

  const comparisonReady = comparisonState?.key === comparisonKey;
  const baseAgent = comparisonReady ? comparisonState.system : undefined;
  const copyAgent = comparisonReady ? comparisonState.personal : undefined;
  const comparison =
    comparisonReady && baseAgent && copyAgent
      ? compareAgentDefinitions(baseAgent, copyAgent)
      : null;
  const currentComparisonError =
    comparisonError?.key === comparisonKey ? comparisonError.message : null;
  const currentFieldHistory =
    fieldHistoryState?.key === comparisonKey ? fieldHistoryState : null;
  const currentFieldHistoryError =
    fieldHistoryError?.key === comparisonKey ? fieldHistoryError.message : null;

  let temporalMetadata: DiffTemporalMetadata | undefined;
  if (baseAgent && copyAgent && comparison) {
    const systemVersionMoment = findAgentVersionMoment(
      currentFieldHistory?.system ?? [],
      baseAgent.version,
    );
    const personalVersionMoment = findAgentVersionMoment(
      currentFieldHistory?.personal ?? [],
      copyAgent.version,
    );
    const changedFieldKeys = comparison.changedFields.map((field) => field.key);
    const systemValues: Record<string, unknown> = { ...baseAgent };
    const personalValues: Record<string, unknown> = { ...copyAgent };
    const systemFieldMoments = currentFieldHistory
      ? deriveAgentFieldChangeMoments(
          systemValues,
          currentFieldHistory.system,
          changedFieldKeys,
        )
      : {};
    const personalFieldMoments = currentFieldHistory
      ? deriveAgentFieldChangeMoments(
          personalValues,
          currentFieldHistory.personal,
          changedFieldKeys,
        )
      : {};
    const fields: Record<
      string,
      NonNullable<DiffTemporalMetadata["fields"]>[string]
    > = {};

    if (currentFieldHistory) {
      for (const fieldKey of changedFieldKeys) {
        const systemFieldMoment = systemFieldMoments[fieldKey];
        const personalFieldMoment = personalFieldMoments[fieldKey];
        fields[fieldKey] = {
          old: systemFieldMoment
            ? {
                label: `${sideLabel(baseSide)} last changed`,
                timestamp: systemFieldMoment.changedAt,
                version: systemFieldMoment.versionNumber,
              }
            : {
                label: `${sideLabel(baseSide)} record saved; exact field date unavailable`,
                timestamp: baseAgent.updatedAt,
                version: baseAgent.version,
              },
          new: personalFieldMoment
            ? {
                label: `${sideLabel(copySide)} last changed`,
                timestamp: personalFieldMoment.changedAt,
                version: personalFieldMoment.versionNumber,
              }
            : {
                label: `${sideLabel(copySide)} record saved; exact field date unavailable`,
                timestamp: copyAgent.updatedAt,
                version: copyAgent.version,
              },
        };
      }
    }

    temporalMetadata = {
      old: {
        label: systemVersionMoment ? "Version saved" : "Record saved",
        timestamp: systemVersionMoment?.changedAt ?? baseAgent.updatedAt,
        version: baseAgent.version,
      },
      new: {
        label: personalVersionMoment ? "Version saved" : "Record saved",
        timestamp: personalVersionMoment?.changedAt ?? copyAgent.updatedAt,
        version: copyAgent.version,
      },
      fields,
      loading: !currentFieldHistory && !currentFieldHistoryError,
      unavailableMessage: currentFieldHistoryError
        ? "Exact field change dates are unavailable. Current version dates remain visible above."
        : undefined,
    };
  }

  // The reconciliation stamp lives on whichever side was derived.
  const derivedRef =
    copySide && copySide.sourceAgentId === baseSide?.id
      ? copySide
      : baseSide && baseSide.sourceAgentId === copySide?.id
        ? baseSide
        : null;
  const lastSyncedAt = derivedRef?.sourceSnapshotAt ?? null;

  // Mirrors the DB gate in agx_sync_linked_agents_reviewed. A system agent takes
  // writes from a super admin on ANY page — the registered admin feature
  // "agent.system-sync". Any other agent takes writes from its owner only: on a
  // user page an admin is an ordinary person and cannot overwrite someone
  // else's agent (common-docs/systems/platform/access/STATE.md, admin lane).
  const canWriteInto = (ref: LinkedAgentRef | null): boolean =>
    !!ref && (ref.agentType === "builtin" ? canMaintainSystemAgents : ref.isOwnedByMe);
  const canPull = canWriteInto(copySide);
  const canPush = canWriteInto(baseSide);
  const hasSystemRelative = relatives.some(
    (r) => r.ref.agentType === "builtin",
  );
  const hasMyUserRelative = relatives.some(
    (r) => r.ref.agentType === "user" && r.ref.isOwnedByMe,
  );
  const canOfferConvert =
    selfType === "user" && canMakeSystemAgent && !hasSystemRelative;
  const canOfferPersonalCopy = selfType === "builtin" && !hasMyUserRelative;

  const refreshLinkedDefinitions = async () => {
    if (!copySide || !baseSide) return;
    const [system, personal] = await Promise.all([
      fetchSavedAgentDefinition(baseSide.id),
      fetchSavedAgentDefinition(copySide.id),
    ]);
    setComparisonState({
      key: `${baseSide.id}:${copySide.id}`,
      system,
      personal,
    });
  };

  const runPull = async () => {
    if (!copySide || !baseSide || !baseAgent || !copyAgent) return;
    setBusy("pull");
    try {
      await dispatch(
        syncLinkedAgents({
          fromId: baseSide.id,
          toId: copySide.id,
          includeIdentity: pullIdentity,
          expectedFromUpdatedAt: baseAgent.updatedAt,
          expectedToUpdatedAt: copyAgent.updatedAt,
        }),
      ).unwrap();
      setFieldHistoryState(null);
      setFieldHistoryError(null);
      toast.success(`Pulled latest into "${copySide.name}".`);
      const [relationshipRefreshed, definitionsRefreshed] = await Promise.all([
        load(),
        refreshLinkedDefinitions()
          .then(() => true)
          .catch(() => false),
      ]);
      if (!relationshipRefreshed || !definitionsRefreshed) {
        toast.warning(
          "Update saved, but the comparison could not be refreshed.",
        );
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
    if (!copySide || !baseSide || !baseAgent || !copyAgent) return;
    setBusy("push");
    try {
      await dispatch(
        syncLinkedAgents({
          fromId: copySide.id,
          toId: baseSide.id,
          includeIdentity: true,
          expectedFromUpdatedAt: copyAgent.updatedAt,
          expectedToUpdatedAt: baseAgent.updatedAt,
        }),
      ).unwrap();
      setFieldHistoryState(null);
      setFieldHistoryError(null);
      toast.success(`Pushed "${copySide.name}" into "${baseSide.name}".`);
      const [relationshipRefreshed, definitionsRefreshed] = await Promise.all([
        load(),
        refreshLinkedDefinitions()
          .then(() => true)
          .catch(() => false),
      ]);
      if (!relationshipRefreshed || !definitionsRefreshed) {
        toast.warning(
          "Update saved, but the comparison could not be refreshed.",
        );
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
        toast.warning(
          "Copy created, but the linked view could not be refreshed.",
        );
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
      <div className="flex h-full items-center justify-center gap-3 p-4 type-body text-muted-foreground">
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
          <Button icon={<RefreshCw />} variant="primary" onClick={load}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ─── Convert to a new system agent (super admin, no system relative) ─────

  if (canOfferConvert && (startOver === "convert" || relatives.length === 0) && !selfDeletedAt) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {relatives.length > 0 && (
          <div className="shrink-0 border-b border-border px-4 py-2">
            <Button variant="quiet" onClick={() => setStartOver(null)}>
              Back to linked agents
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ConvertAgentToSystemBody agentId={agentId} onClose={onClose} />
        </div>
      </div>
    );
  }

  // ─── No pair: deleted, a system agent with no copies, or unlinked ────────

  if (!hasPair) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          {selfDeletedAt ? (
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          ) : selfType === "builtin" ? (
            <Copy className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          ) : (
            <Unlink className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          )}
          <div className="type-secondary leading-relaxed text-muted-foreground">
            {selfDeletedAt ? (
              <>
                This agent was deleted {formatTimestamp(selfDeletedAt)}; nothing
                to sync
              </>
            ) : selfType === "builtin" ? (
              <>
                Editable copy of{" "}
                <span className="font-medium text-foreground">
                  {agent?.name ?? "this system agent"}
                </span>
                ; it stays linked for future updates
              </>
            ) : (
              "No linked parent or copies"
            )}
          </div>
        </div>
        <LinkedRelativesList relatives={relatives} selectedId={null} />
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>
            Close
          </Button>
          {canOfferPersonalCopy && !selfDeletedAt && (
            <Button icon={busy === "copy" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Copy />
              )} variant="primary" onClick={runCreateCopy} disabled={busy === "copy"}>
              Create my personal copy
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ─── Linked pair: relationship + configuration comparison + sync ────────

  const derivedAgent =
    derivedRef?.id === copySide.id
      ? copyAgent
      : derivedRef?.id === baseSide.id
        ? baseAgent
        : undefined;
  const relationshipCreatedAt = derivedAgent?.createdAt ?? null;
  const relationshipCreatedLabel =
    "Linked";
  const behaviorDifferenceCount = comparison?.behaviorFields.length ?? 0;
  const comparisonAvailable =
    comparison !== null && currentComparisonError === null;
  const pullHasChanges = Boolean(
    comparison &&
    (comparison.behaviorFields.length > 0 ||
      (pullIdentity && comparison.profileFields.length > 0)),
  );
  const pushHasChanges = Boolean(
    comparison &&
    (comparison.behaviorFields.length > 0 ||
      comparison.profileFields.length > 0),
  );

  const mandateDisplayName = mandateLabel ?? mandateKey ?? null;
  const runRebindToSystem = async () => {
    if (!onRebindToSystem || !systemTwin) return;
    setRebindBusy(true);
    try {
      await onRebindToSystem(systemTwin.id);
      toast.success(
        `Mandate ${mandateDisplayName ?? mandateKey ?? "(unknown)"} rebound to the system agent "${systemTwin.name}" (tracks latest).`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Rebinding the mandate failed.",
      );
    } finally {
      setRebindBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-card/40 px-4 pt-3">
        {mandateDisplayName && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 type-secondary">
              <Badge variant="outline" className="text-[10px]">
                Agent mandate
              </Badge>
              <span>
                This is what mandate{" "}
                <span className="font-mono font-medium">{mandateDisplayName}</span>{" "}
                runs.
              </span>
            </div>
            {onRebindToSystem && systemTwin && (
              <Button
                icon={rebindBusy ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ShieldCheck />
                )}
                variant="outline"
                className="shrink-0"
                disabled={rebindBusy || busy !== null}
                title={`Rebind mandate ${mandateDisplayName} to the system agent "${systemTwin.name}" (tracks latest)`}
                onClick={() => void runRebindToSystem()}
              >
                Rebind mandate to system side
              </Button>
            )}
          </div>
        )}
        <div
          className="flex gap-1"
          role="tablist"
          aria-label="Linked agent details"
        >
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
                <Badge
                  variant="secondary"
                  className="ml-1.5 h-4 px-1 text-[9px]"
                >
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
              <p className="max-w-md type-body text-muted-foreground">
                {currentComparisonError}
                <ErrorAlchemyMenu error={currentComparisonError} />
              </p>
              <Button
                icon={<RefreshCw />}
                variant="outline"
                onClick={() => {
                  setComparisonError(null);
                  setComparisonState(null);
                  setComparisonRetry((value) => value + 1);
                }}
              >
                Retry comparison
              </Button>
            </div>
          ) : comparisonReady && baseAgent && copyAgent ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-2 type-secondary">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <EntityRef
                    token="agent"
                    id={baseSide.id}
                    name={baseSide.name}
                    href={`${basePathFor(baseSide)}/${baseSide.id}`}
                    alwaysShowActions
                  />
                  <span className="text-muted-foreground">compared with</span>
                  <EntityRef
                    token="agent"
                    id={copySide.id}
                    name={copySide.name}
                    href={`${basePathFor(copySide)}/${copySide.id}`}
                    alwaysShowActions
                  />
                </div>
                <span className="type-meta text-muted-foreground">
                  Identity fields excluded; local state shown, not synced
                </span>
              </div>
              <AgentDiffViewer
                oldAgent={baseAgent}
                newAgent={copyAgent}
                oldLabel={`${sideLabel(baseSide)} — ${baseSide.name}${baseAgent.version != null ? ` v${baseAgent.version}` : ""}`}
                newLabel={`${sideLabel(copySide)} — ${copySide.name}${copyAgent.version != null ? ` v${copyAgent.version}` : ""}`}
                temporalMetadata={temporalMetadata}
                className="h-full min-h-0 flex-1"
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center gap-2 type-body text-muted-foreground">
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
                    <span>
                      Comparison unavailable: {currentComparisonError}
                    </span>
                    <Button
                      variant="outline"
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
                    <div className="type-title">
                      {comparison.comparedConfigurationMatches
                        ? "Compared configuration is identical"
                        : comparison.behaviorMatches
                          ? "Runtime behavior matches"
                          : `Runtime behavior differs in ${behaviorDifferenceCount} ${behaviorDifferenceCount === 1 ? "section" : "sections"}`}
                    </div>
                    <p className="mt-0.5 type-secondary text-muted-foreground">
                      {comparison.behaviorMatches
                        ? comparison.localStateFields.length > 0
                          ? `Synced behavior matches, but local record state differs: ${comparison.localStateFields.map((field) => humanizeIdentifier(field.key)).join(", ")}${comparison.profileFields.length > 0 ? `; profile details also differ: ${comparison.profileFields.map((field) => humanizeIdentifier(field.key)).join(", ")}` : ""}.`
                          : comparison.profileFields.length > 0
                            ? `Only profile details differ: ${comparison.profileFields.map((field) => humanizeIdentifier(field.key)).join(", ")}.`
                            : `The runtime configuration matches ${baseNoun}.`
                        : `Changed behavior: ${comparison.behaviorFields.map((field) => humanizeIdentifier(field.key)).join(", ")}.`}
                    </p>
                  </div>
                  {comparison.changedFields.length > 0 && (
                    <Button
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setActiveView("differences")}
                    >
                      Review diff
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-3 type-body text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Comparing current definitions…
                </div>
              )}

              <section aria-labelledby="relationship-map-title">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3
                    id="relationship-map-title"
                    className="type-secondary font-semibold"
                  >
                    Current relationship
                  </h3>
                  <span className="type-meta text-muted-foreground">
                    {sideLabel(baseSide)} · {sideLabel(copySide)}
                  </span>
                </div>
                <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <AgentHeadCard
                    agentRef={baseSide}
                    agent={baseAgent}
                    label={sideLabel(baseSide)}
                  />
                  <div className="flex items-center justify-center gap-1 text-muted-foreground sm:flex-col">
                    <div className="h-px flex-1 bg-border sm:h-full sm:min-h-6 sm:w-px" />
                    <div
                      className="rounded-full border border-border bg-background p-1.5"
                      title="Linked copy"
                    >
                      <GitFork className="h-3.5 w-3.5" />
                    </div>
                    <div className="h-px flex-1 bg-border sm:h-full sm:min-h-6 sm:w-px" />
                  </div>
                  <AgentHeadCard
                    agentRef={copySide}
                    agent={copyAgent}
                    label={sideLabel(copySide)}
                  />
                </div>
              </section>

              <section
                aria-labelledby="relationship-history-title"
                className="rounded-lg border border-border bg-muted/20 p-3"
              >
                <h3
                  id="relationship-history-title"
                  className="mb-3 type-secondary font-semibold"
                >
                  Relationship history
                </h3>
                <ol className="space-y-3 type-secondary">
                  <li className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
                    <div>
                      <div className="font-medium">
                        {relationshipCreatedLabel}
                      </div>
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
                <p className="mt-3 type-meta leading-relaxed text-muted-foreground">
                  Milestones only; full edits are in each agent&apos;s Versions
                </p>
              </section>

              <LinkedRelativesList
                relatives={relatives}
                selectedId={selectedRelative?.ref.id ?? null}
                onSelect={
                  relatives.length > 1
                    ? (id) => {
                        setSelectedRelativeId(id);
                        setActiveView("overview");
                      }
                    : undefined
                }
              />
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
          <div className="flex items-center gap-2">
            <Button variant="quiet" onClick={onClose}>
              Close
            </Button>
            {canOfferConvert && (
              <Button
                variant="quiet"
                icon={<ShieldCheck />}
                onClick={() => setStartOver("convert")}
              >
                Make system agent
              </Button>
            )}
            {canOfferPersonalCopy && (
              <Button
                variant="quiet"
                icon={busy === "copy" ? <Loader2 className="animate-spin" /> : <Copy />}
                onClick={runCreateCopy}
                disabled={busy !== null}
              >
                Create my personal copy
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              icon={busy === "pull" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ArrowDownToLine />
              )}
              variant="outline"
              onClick={runPull}
              disabled={
                !canPull ||
                busy !== null ||
                !comparisonAvailable ||
                !pullHasChanges
              }
              title={
                canPull
                  ? !comparisonAvailable
                    ? "Wait for the comparison to finish"
                    : !pullHasChanges
                      ? `This would not change ${copyNoun}`
                      : `Copy ${baseNoun} into ${copyNoun}`
                  : copyIsSystem
                    ? "Only super admins can change a system agent"
                    : "You can only change an agent you own"
              }
            >
              {pullLabel}
            </Button>
            <Button
              icon={busy === "push" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ArrowUpFromLine />
              )}
              variant="primary"
              onClick={() => setConfirmPushOpen(true)}
              disabled={
                !canPush ||
                busy !== null ||
                !comparisonAvailable ||
                !pushHasChanges
              }
              title={
                canPush
                  ? !comparisonAvailable
                    ? "Wait for the comparison to finish"
                    : !pushHasChanges
                      ? `This would not change ${baseNoun}`
                      : `Copy ${copyNoun} into ${baseNoun}`
                  : baseIsSystem
                    ? "Only super admins can change a system agent"
                    : "You can only change an agent you own"
              }
            >
              {pushLabel}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmPushOpen} onOpenChange={setConfirmPushOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Replace "${baseSide.name}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {baseIsSystem
                ? `Its configuration and profile become "${copySide.name}"'s. Everyone and every mandate using this system agent gets the change.`
                : `Its configuration and profile become "${copySide.name}"'s.`}
              {comparison && !comparison.comparedConfigurationMatches
                ? ` The current comparison contains ${comparison.changedFields.length} changed ${comparison.changedFields.length === 1 ? "section" : "sections"}.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runPush()}>
              {pushLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
