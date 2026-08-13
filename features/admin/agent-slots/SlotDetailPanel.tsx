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
  GitCompareArrows,
  History,
  Loader2,
  Pin,
  ShieldCheck,
} from "lucide-react";
import { toast } from "@/lib/toast";
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
import { SlotTestBench } from "./SlotTestBench";
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
  fetchVersionSnapshotDefinition,
  updateSlotDefinition,
  type PinnedAgentIdentityResult,
  type SlotBindingRow,
  type SlotConsoleData,
  type SlotDefinitionRow,
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

  const updateToLatest = async (mode: "pin" | "latest") => {
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
      onSaved();
    } catch (error: unknown) {
      toast.error(`Update failed: ${describeError(error)}`);
    } finally {
      setBusy(null);
    }
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
            <RepinToTwinButton slot={row.slot} twin={twin} onSaved={onSaved} />
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

// ── Status banner — one verdict, matched to the state, never a mismatch ──────

function StatusBanner({
  row,
  lineage,
  onSaved,
  onTest,
  onOpenRepin,
}: {
  row: SlotRow;
  lineage: AgentLineage;
  onSaved: () => void;
  onTest: () => void;
  onOpenRepin: () => void;
}) {
  switch (row.health) {
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

// ── Agent identity — what this slot runs, with every door on it ──────────────

function AgentCard({ row }: { row: SlotRow }) {
  if (!row.agentId || row.health === "unresolved pin") return null;
  const isSystem = row.agentType === "builtin";
  const basePath = isSystem ? SYSTEM_AGENT_BASE : USER_AGENT_BASE;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-border bg-card px-3 py-2">
      <div className="min-w-0 text-sm font-medium">
        <EntityRef
          token="agent"
          id={row.agentId}
          name={row.agentName}
          href={agentHref(row.agentId, row.agentType)}
          alwaysShowActions
        />
      </div>
      <Badge
        variant="outline"
        className={cn(
          "h-5 text-[10px]",
          !isSystem && HEALTH_CLASS["not a system agent"],
        )}
      >
        {isSystem ? "System agent" : "Personal agent"}
      </Badge>
      <Badge
        variant={row.slot.use_latest ? "secondary" : "outline"}
        className="h-5 text-[10px]"
      >
        {row.pinLabel}
      </Badge>
      {row.latestVersion != null && !row.slot.use_latest && (
        <Badge variant="outline" className="h-5 text-[10px]">
          latest v{row.latestVersion}
        </Badge>
      )}
      <a
        href={getAgentModeHref("versions", row.agentId, basePath)}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex h-6 items-center gap-1 rounded border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        title={`Version history for ${row.agentName}`}
      >
        <History className="h-3 w-3" />
        Versions
      </a>
    </div>
  );
}

// ── Repin editor ─────────────────────────────────────────────────────────────

function SlotEditor({
  slot,
  data,
  builtinAgentsById,
  onSaved,
}: {
  slot: SlotDefinitionRow;
  data: SlotConsoleData;
  builtinAgentsById: ReadonlyMap<string, string>;
  onSaved: () => void;
}) {
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
  const [saving, setSaving] = useState(false);
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
    setSaving(true);
    try {
      await updateSlotDefinition(slot.id, {
        default_agent_id: agentId,
        default_agent_version_id: useLatest ? null : versionId,
        use_latest: useLatest,
      });
      toast.success(`${slot.slot_key} repinned.`);
      onSaved();
    } catch (error: unknown) {
      toast.error(`Repin failed: ${describeError(error)}`);
    } finally {
      setSaving(false);
    }
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
      <div className="font-medium text-muted-foreground">All overrides</div>
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
                {agent ? `→ ${agent.name}` : "settings-only override"}
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
  const bindings = data.bindingsBySlotId[row.id] ?? [];
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
    if (benchFocus === 0) return;
    benchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [benchFocus]);

  const baselineLabel =
    row.pinnedVersionNumber != null
      ? `Current — pinned v${row.pinnedVersionNumber}`
      : "Current binding";

  return (
    // SidePanelSurface (and the WindowPanel body) hand children an
    // overflow-hidden flex cell and expect the child to own its scroll —
    // without this wrapper the drawer simply cut off at the fold, which is
    // exactly the defect the 2026-08-12 rebuild was ordered over.
    <div className="h-full min-h-0 space-y-3 overflow-y-auto p-3">
      {row.slot.description && (
        <p className="text-xs text-muted-foreground">{row.slot.description}</p>
      )}

      <StatusBanner
        row={row}
        lineage={lineage}
        onSaved={onSaved}
        onTest={() => {
          setTestOpen(true);
          setBenchFocus((n) => n + 1);
        }}
        onOpenRepin={() => setPinOpen(true)}
      />

      <AgentCard row={row} />

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
          />
        </Section>
      </div>

      <Section
        title={
          bindings.length > 0 ? `Overrides (${bindings.length})` : "Overrides"
        }
        meta="per-user and per-org replacements"
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
