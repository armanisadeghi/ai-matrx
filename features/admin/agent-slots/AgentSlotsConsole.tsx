"use client";

/**
 * Agent Slots console — the admin view of every DB-managed agent slot:
 * current pin (vs latest), enable/disable, repin, overrides, and the
 * exemplar test bench. Canonical MatrxDataTable surface: every column
 * sorts + filters, row → side panel (pin editor + bench), Copy for AI.
 * System-of-record: common-docs/systems/agent-slots/FEATURE.md.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { GitBranch, History, Link2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { isJsonObject } from "@/types/json";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentLineageIndex,
  selectBuiltinAgents,
  type AgentLineage,
  type AgentLineageRef,
} from "@/features/agents/redux/agent-definition/selectors";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useOpenAgentConvertSystemWindow } from "@/features/overlays/openers/agentConvertSystemWindow";
import { AgentListInlinePicker } from "@/features/agents/components/agent-listings/AgentListInlinePicker";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  AGENT_SLOTS_SURFACE_NAME,
  createAgentSlotsScope,
  type AgentSlotDetail,
  type AgentSlotOverrideSummary,
  type AgentSlotSummary,
  type AgentSlotsHealthSummary,
} from "@/features/surfaces/manifests/agent-slots.manifest";
import { SlotOverridePanel } from "@/features/agents/slots/components/SlotOverridePanel";
import { SlotTestBench } from "./SlotTestBench";
import {
  fetchAgentVersions,
  fetchSlotConsoleData,
  updateSlotDefinition,
  type SlotAgentOption,
  type SlotBindingRow,
  type SlotConsoleData,
  type SlotDefinitionRow,
  type SlotVersionInfo,
} from "./service";

/** Slot health, worst-first. Drives the Health column + its select filter. */
type SlotHealth =
  | "unresolved pin"
  | "not a system agent"
  | "agent archived"
  | "version drift"
  | "ok";

/**
 * Where a given agent's record actually lives. System agents open in the
 * admin shell; personal agents open in the user shell. Both trees carry the
 * same sub-routes (/build, /run, /v, /surfaces …).
 */
const SYSTEM_AGENT_BASE = "/administration/agents/system-agents/agents";
const USER_AGENT_BASE = "/agents";

function agentHref(id: string, agentType: string | null, sub = ""): string {
  return `${agentType === "builtin" ? SYSTEM_AGENT_BASE : USER_AGENT_BASE}/${id}${sub}`;
}

interface SlotRow {
  slot: SlotDefinitionRow;
  id: string;
  slotKey: string;
  label: string | null;
  /** The agent behind the slot default — null only when the pin is broken. */
  agentId: string | null;
  agentName: string;
  agentType: string | null;
  pinnedVersionNumber: number | null;
  latestVersion: number | null;
  pinLabel: string;
  /** e.g. "v7 is latest" when the pin trails the agent's master version. */
  drift: string | null;
  health: SlotHealth;
  inputKind: string;
  outputKind: string;
  overridesCount: number;
  isEnabled: boolean;
  isPlaceholder: boolean;
  updatedAt: string | null;
}

function buildRow(slot: SlotDefinitionRow, data: SlotConsoleData): SlotRow {
  let agentId: string | null = null;
  let agentName = "(unknown agent)";
  let agentType: string | null = null;
  let pinnedVersionNumber: number | null = null;
  let latestVersion: number | null = null;
  let pinLabel = "latest";
  let drift: string | null = null;
  let nonSystem = false;
  let archived = false;

  if (slot.default_agent_version_id) {
    const version = data.versionsById[slot.default_agent_version_id];
    const agent = version?.agentId ? data.agentsById[version.agentId] : undefined;
    const latest = agent?.version ?? null;
    const pinned = version?.versionNumber ?? null;
    agentId = agent?.id ?? version?.agentId ?? null;
    agentName = agent?.name ?? version?.name ?? "(unknown agent)";
    agentType = agent?.agentType ?? null;
    pinnedVersionNumber = pinned;
    latestVersion = latest;
    pinLabel = pinned != null ? `pinned v${pinned}` : "pinned (unknown version)";
    if (pinned != null && latest != null && latest > pinned) drift = `v${latest} is latest`;
    nonSystem = agent != null && agent.agentType !== "builtin";
    archived = Boolean(agent?.isArchived);
  } else {
    const agent = slot.default_agent_id ? data.agentsById[slot.default_agent_id] : undefined;
    agentId = agent?.id ?? slot.default_agent_id ?? null;
    agentName = agent?.name ?? "(unknown agent)";
    agentType = agent?.agentType ?? null;
    latestVersion = agent?.version ?? null;
    nonSystem = agent != null && agent.agentType !== "builtin";
    archived = Boolean(agent?.isArchived);
  }

  // An agent the console could not resolve is NEVER "ok" — it means the pin
  // points at a row this admin can't read (personal agent under another
  // owner's RLS) or at a deleted record. Silently reporting green there is
  // exactly the kind of dead end this console exists to prevent.
  const unresolved = agentId == null || agentType == null;

  const health: SlotHealth = unresolved
    ? "unresolved pin"
    : nonSystem
      ? "not a system agent"
      : archived
        ? "agent archived"
        : drift
          ? "version drift"
          : "ok";

  return {
    slot,
    id: slot.id,
    slotKey: slot.slot_key,
    label: slot.label,
    agentId,
    agentName,
    agentType,
    pinnedVersionNumber,
    latestVersion,
    pinLabel,
    drift,
    health,
    inputKind: slot.input_kind ?? "—",
    outputKind: slot.output_kind ?? "text",
    overridesCount: (data.bindingsBySlotId[slot.id] ?? []).length,
    isEnabled: Boolean(slot.is_enabled),
    isPlaceholder:
      isJsonObject(slot.metadata) && slot.metadata.migration_status === "placeholder",
    updatedAt: slot.updated_at ?? null,
  };
}

const HEALTH_CLASS: Record<SlotHealth, string> = {
  ok: "text-emerald-600 border-emerald-500/40 bg-emerald-500/10",
  "version drift": "text-amber-600 border-amber-500/40 bg-amber-500/10",
  "agent archived": "text-rose-600 border-rose-500/40 bg-rose-500/10",
  "not a system agent": "text-rose-600 border-rose-500/40 bg-rose-500/10",
  "unresolved pin": "text-rose-600 border-rose-500/40 bg-rose-500/10",
};

/** What the admin should do about each unhealthy state — shown, not implied. */
const HEALTH_HINT: Partial<Record<SlotHealth, string>> = {
  "unresolved pin":
    "This slot's agent could not be read — it may be another user's personal agent, or a deleted record. Repin it to a system agent.",
  "not a system agent":
    "This slot serves every user, but its default is a personal agent only some of them can see.",
  "agent archived": "The pinned agent is archived — repin before it breaks.",
};

// ── Doors (THE DOOR LAW — common-docs/policies/no-dead-ends.md) ─────────────
// Every agent this console names is reachable: open, new tab, peek (EntityRef),
// and every lineage relation the slice can resolve is rendered WITH its own
// door. A detected problem ("not a system agent") ships with its one-click fix.

/** A lineage relative, always rendered with a door. */
function LineageChip({
  label,
  agent,
  Icon,
}: {
  label: string;
  agent: AgentLineageRef;
  Icon: typeof GitBranch;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]">
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <EntityRef
        token="agent"
        id={agent.id}
        name={agent.name}
        href={agentHref(agent.id, agent.agentType)}
        showIcon={false}
        alwaysShowActions
      />
      {agent.isSystem && (
        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
          system
        </Badge>
      )}
    </span>
  );
}

/**
 * The one-click fix that belongs next to the "NOT a system agent" complaint.
 * Repins the slot default at the linked system twin, tracking latest — a slot
 * pinned to a personal agent's version is already broken, so carrying that
 * version across would be meaningless. The admin can pin a specific version in
 * the editor right below.
 */
function RepinToTwinButton({
  slot,
  twin,
  onSaved,
}: {
  slot: SlotDefinitionRow;
  twin: AgentLineageRef;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-6 gap-1 px-1.5 text-[11px]"
      disabled={busy}
      title={`Repin ${slot.slot_key} to the system agent "${twin.name}" (tracks latest)`}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          await updateSlotDefinition(slot.id, {
            default_agent_id: twin.id,
            default_agent_version_id: null,
            use_latest: true,
          });
          toast.success(`${slot.slot_key} repinned to ${twin.name} (latest).`);
          onSaved();
        } catch (error: unknown) {
          toast.error(
            `Repin failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <ShieldCheck className="h-3 w-3" />
      )}
      Repin to system twin
    </Button>
  );
}

/** Opens the existing Linked Agent Sync window for an agent. */
function LinkedSyncButton({
  agentId,
  label = "Linked Agent Sync…",
}: {
  agentId: string;
  label?: string;
}) {
  const openConvertSystem = useOpenAgentConvertSystemWindow();
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-6 gap-1 px-1.5 text-[11px]"
      title="Create or inspect this agent's linked system twin"
      onClick={(e) => {
        e.stopPropagation();
        openConvertSystem({ agentId });
      }}
    >
      <Link2 className="h-3 w-3" />
      {label}
    </Button>
  );
}

/**
 * The drawer's first block — WHICH agent this slot currently runs, with every
 * door on it, before any picker is offered. The old drawer opened straight
 * into a repin picker, so the admin could not see what they had.
 */
function SlotAgentIdentityCard({
  row,
  lineage,
  onSaved,
}: {
  row: SlotRow;
  lineage: AgentLineage;
  onSaved: () => void;
}) {
  if (row.health === "unresolved pin") {
    return (
      <div className="space-y-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
        <div className="font-medium">This slot&apos;s agent could not be read.</div>
        <p>
          {HEALTH_HINT["unresolved pin"]}
          {row.agentId && (
            <>
              {" "}
              Pinned id <span className="font-mono">{row.agentId}</span>.
            </>
          )}
        </p>
      </div>
    );
  }
  if (!row.agentId) return null;
  const isSystem = row.agentType === "builtin";
  const base = agentHref(row.agentId, row.agentType);
  return (
    <div className="space-y-2 rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Currently running
        </div>
        <Badge
          variant="outline"
          className={isSystem ? HEALTH_CLASS.ok : HEALTH_CLASS["not a system agent"]}
        >
          {isSystem ? "System agent" : "Personal agent — not a system agent"}
        </Badge>
      </div>

      <div className="text-sm font-medium">
        <EntityRef
          token="agent"
          id={row.agentId}
          name={row.agentName}
          href={base}
          alwaysShowActions
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <Badge variant={row.slot.use_latest ? "secondary" : "outline"}>
          {row.pinLabel}
        </Badge>
        {row.latestVersion != null && (
          <Badge variant="outline">latest v{row.latestVersion}</Badge>
        )}
        {row.drift && (
          <Badge variant="outline" className={HEALTH_CLASS["version drift"]}>
            {row.drift}
          </Badge>
        )}
      </div>

      {(lineage.parent || lineage.systemTwin || lineage.children.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {lineage.parent && (
            <LineageChip label="copied from" agent={lineage.parent} Icon={GitBranch} />
          )}
          {lineage.systemTwin && lineage.systemTwin.id !== lineage.parent?.id && (
            <LineageChip
              label="system twin"
              agent={lineage.systemTwin}
              Icon={ShieldCheck}
            />
          )}
          {lineage.children
            .filter((c) => c.id !== lineage.systemTwin?.id)
            .map((c) => (
              <LineageChip key={c.id} label="copy" agent={c} Icon={GitBranch} />
            ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <Button asChild size="sm" variant="outline" className="h-6 gap-1 px-1.5 text-[11px]">
          <a href={`${base}/v`} target="_blank" rel="noopener noreferrer">
            <History className="h-3 w-3" />
            Versions
          </a>
        </Button>
        <LinkedSyncButton
          agentId={row.agentId}
          label={lineage.systemTwin ? "Compare with system twin…" : "Linked Agent Sync…"}
        />
        {!isSystem && lineage.systemTwin && (
          <RepinToTwinButton
            slot={row.slot}
            twin={lineage.systemTwin}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  );
}

function SlotEditor({
  slot,
  data,
  onSaved,
}: {
  slot: SlotDefinitionRow;
  data: SlotConsoleData;
  onSaved: () => void;
}) {
  const pinnedVersion = slot.default_agent_version_id
    ? data.versionsById[slot.default_agent_version_id]
    : undefined;
  const initialAgentId = slot.default_agent_id ?? pinnedVersion?.agentId ?? null;
  const [agentId, setAgentId] = useState<string | null>(initialAgentId);
  const [useLatest, setUseLatest] = useState<boolean>(Boolean(slot.use_latest));
  const [versionId, setVersionId] = useState<string | null>(slot.default_agent_version_id);
  // Versions keyed by the agent they were fetched for — "loading" is DERIVED
  // (requested agent ≠ loaded agent), so the effect never sets state
  // synchronously (react-hooks/set-state-in-effect).
  const [loadedVersions, setLoadedVersions] = useState<{
    agentId: string;
    rows: SlotVersionInfo[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const versions = loadedVersions?.agentId === agentId ? loadedVersions.rows : [];
  const loadingVersions = !useLatest && agentId != null && loadedVersions?.agentId !== agentId;

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
        toast.error(`Failed to load versions: ${error instanceof Error ? error.message : String(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, useLatest]);

  const save = useCallback(async () => {
    if (!agentId) {
      toast.error("Pick an agent first.");
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
      toast.error(
        `Repin failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSaving(false);
    }
  }, [agentId, useLatest, versionId, slot.id, slot.slot_key, onSaved]);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">Agent</div>
        {/* THE canonical agent picker — full search, Mine/Shared/All/System
            tabs with counts, sort, favorites, category + tag filters, detail
            peek. Admin variant: opens on System (a slot default must be a
            system agent) but the admin can still reach every other tab, and
            every row is badged so system and personal are never confused. */}
        <AgentListInlinePicker
          consumerId={`agent-slot-repin-${slot.id}`}
          onSelect={setAgentId}
          activeAgentId={agentId}
          initialTab="system"
          includeSystemInAll
          className="h-96 rounded-md border border-border bg-card"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={useLatest} onCheckedChange={setUseLatest} />
        <span>
          Track latest{" "}
          <span className="text-muted-foreground">
            (floating — picks up every edit; pin a version for stability)
          </span>
        </span>
      </label>
      {!useLatest && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Pin version:</span>
          {loadingVersions ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : versions.length === 0 ? (
            <span className="text-muted-foreground">
              No saved versions for this agent — save a version first, or track latest.
            </span>
          ) : (
            <select
              className="border border-border rounded-md bg-background px-2 py-1 text-sm"
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
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
          Save pin
        </Button>
        {slot.contract != null && (
          <span className="text-xs text-muted-foreground truncate">
            Contract: {JSON.stringify(slot.contract)}
          </span>
        )}
      </div>
    </div>
  );
}

/** Read-only roll-up of EVERY binding on the slot (all principals the admin
 * can see) — editing happens in the SlotOverridePanel above it. */
function OverridesList({
  bindings,
  data,
}: {
  bindings: SlotBindingRow[];
  data: SlotConsoleData;
}) {
  if (bindings.length === 0) return null;
  return (
    <div className="text-xs">
      <div className="font-medium text-muted-foreground mb-1">All overrides</div>
      {bindings.map((b) => {
        const versionAgentId = b.agent_version_id
          ? data.versionsById[b.agent_version_id]?.agentId
          : undefined;
        const agentKey = b.agent_id ?? versionAgentId;
        const agent = agentKey ? (data.agentsById[agentKey] ?? null) : null;
        return (
          <div key={b.id} className="flex items-center gap-2 py-0.5">
            <Badge variant="outline">{b.principal_type}</Badge>
            <span>{agent ? `→ ${agent.name}` : "settings-only override"}</span>
            {b.config_overrides != null && (
              <span className="text-muted-foreground font-mono truncate">
                {JSON.stringify(b.config_overrides)}
              </span>
            )}
            {!b.is_enabled && <Badge variant="secondary">disabled</Badge>}
          </div>
        );
      })}
    </div>
  );
}

/** Full slot workbench — pin editor, test bench, overrides. Used by both the
 * side panel and the WindowPanel Edit tab. */
function SlotDetail({
  row,
  data,
  lineage,
  onSaved,
}: {
  row: SlotRow;
  data: SlotConsoleData;
  lineage: AgentLineage;
  onSaved: () => void;
}) {
  const bindings = data.bindingsBySlotId[row.id] ?? [];
  return (
    <div className="space-y-4 p-3">
      {row.slot.description && (
        <p className="text-xs text-muted-foreground">{row.slot.description}</p>
      )}
      {/* WHAT you have, with every door on it — before any picker. */}
      <SlotAgentIdentityCard row={row} lineage={lineage} onSaved={onSaved} />
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Repin to a different agent
      </div>
      {/* key: SlotEditor/SlotTestBench seed local state from props — remount per slot */}
      <SlotEditor
        key={row.id}
        slot={row.slot}
        data={data}
        onSaved={onSaved}
      />
      <div className="border-t border-border pt-3">
        <SlotTestBench key={row.id} slot={row.slot} />
      </div>
      <div className="border-t border-border pt-3">
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Overrides — swap the agent or just its settings, per principal
        </div>
        {/* key: the panel + editor seed local state from props — remount per slot */}
        <SlotOverridePanel
          key={row.id}
          slot={row.slot}
          bindings={bindings}
          agentsById={data.agentsById}
          onChanged={onSaved}
        />
      </div>
      <OverridesList bindings={bindings} data={data} />
    </div>
  );
}

/** SlotRow → the manifest's summary shape (surface scope + agent context). */
function toSlotSummary(r: SlotRow): AgentSlotSummary {
  return {
    id: r.id,
    slot_key: r.slotKey,
    label: r.label,
    agent_name: r.agentName,
    pin: r.pinLabel,
    drift: r.drift,
    health: r.health,
    input_kind: r.inputKind,
    output_kind: r.outputKind,
    overrides_count: r.overridesCount,
    is_enabled: r.isEnabled,
    is_placeholder: r.isPlaceholder,
  };
}

/** Full workbench detail for the selected slot — pin state + agent type. */
function toSlotDetail(row: SlotRow, data: SlotConsoleData): AgentSlotDetail {
  const pinnedVersion = row.slot.default_agent_version_id
    ? data.versionsById[row.slot.default_agent_version_id]
    : undefined;
  const agentId = row.slot.default_agent_id ?? pinnedVersion?.agentId ?? null;
  const agent = agentId ? data.agentsById[agentId] : undefined;
  return {
    ...toSlotSummary(row),
    description: row.slot.description,
    agent_type: agent?.agentType ?? null,
    use_latest: Boolean(row.slot.use_latest),
    pinned_version: pinnedVersion?.versionNumber ?? null,
    latest_version: agent?.version ?? null,
  };
}

function humanRow(r: SlotRow): string {
  return [
    `Slot: ${r.slotKey}${r.label ? ` (${r.label})` : ""}`,
    `Agent: ${r.agentName}`,
    `Pin: ${r.pinLabel}${r.drift ? ` — ${r.drift}` : ""}`,
    `Health: ${r.health}`,
    `Input: ${r.inputKind}`,
    `Output: ${r.outputKind}`,
    `Overrides: ${r.overridesCount}`,
    `Enabled: ${r.isEnabled ? "yes" : "no"}`,
  ].join("\n");
}

export function AgentSlotsConsole() {
  const dispatch = useAppDispatch();
  const [data, setData] = useState<SlotConsoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Canonical agent listing: the Redux agent-definition slice, filtered to
  // SYSTEM agents. A slot default must be a system (builtin) agent — an
  // admin pinning a personal/shared agent here would break every user the
  // slot serves. Never hand-query agent.definition for a picker.
  const builtinAgents = useAppSelector(selectBuiltinAgents);
  // Lineage for every agent the slice holds — derived, no extra queries. This
  // is how the console can answer "does a system copy of this already exist?"
  // instead of just complaining that the pin is personal.
  const lineageIndex = useAppSelector(selectAgentLineageIndex);
  const agentOptions = useMemo<SlotAgentOption[]>(
    () =>
      builtinAgents.map((a) => ({
        id: a.id,
        name: a.name ?? a.id,
        description: a.description ?? null,
        category: a.category ?? null,
      })),
    [builtinAgents],
  );

  // Every setState lives in an async callback — never synchronously in the
  // effect (react-hooks/set-state-in-effect). Initial state is loading=true;
  // the button-driven reload may flip `fetching` synchronously (event handler).
  const fetchData = useCallback(() => {
    fetchSlotConsoleData()
      .then(setData)
      .catch((error: unknown) => {
        toast.error(
          `Failed to load agent slots: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, []);

  const reload = useCallback(() => {
    setFetching(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    dispatch(fetchAgentsListFull());
    fetchData();
  }, [dispatch, fetchData]);

  const toggleEnabled = useCallback(
    async (row: SlotRow, enabled: boolean) => {
      try {
        await updateSlotDefinition(row.id, { is_enabled: enabled });
        toast.success(`${row.slotKey} ${enabled ? "enabled" : "disabled"}.`);
        reload();
      } catch (error: unknown) {
        toast.error(
          `Update failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [reload],
  );

  const rows = useMemo(
    () => (data ? data.slots.map((slot) => buildRow(slot, data)) : []),
    [data],
  );

  // Surface scope — built at Run time from live console state so agents
  // launched here know every slot, the health roll-up, and the selected
  // slot's pin state. Contract: agent-slots.manifest.ts.
  const getSurfaceScope = () => {
    const summaries = rows.map(toSlotSummary);
    const health: AgentSlotsHealthSummary = {
      ok: 0,
      version_drift: 0,
      agent_archived: 0,
      not_a_system_agent: 0,
      unresolved_pin: 0,
    };
    for (const r of rows) {
      if (r.health === "ok") health.ok += 1;
      else if (r.health === "version drift") health.version_drift += 1;
      else if (r.health === "agent archived") health.agent_archived += 1;
      else if (r.health === "unresolved pin") health.unresolved_pin += 1;
      else health.not_a_system_agent += 1;
    }
    const selectedRow = selectedId
      ? (rows.find((r) => r.id === selectedId) ?? null)
      : null;
    const overrides: AgentSlotOverrideSummary[] | undefined =
      selectedRow && data
        ? (data.bindingsBySlotId[selectedRow.id] ?? []).map((b) => {
            const versionAgentId = b.agent_version_id
              ? data.versionsById[b.agent_version_id]?.agentId
              : undefined;
            const agentKey = b.agent_id ?? versionAgentId;
            return {
              principal_type: b.principal_type,
              agent_name: agentKey
                ? (data.agentsById[agentKey]?.name ?? null)
                : null,
              config_overrides: isJsonObject(b.config_overrides)
                ? b.config_overrides
                : null,
              is_enabled: Boolean(b.is_enabled),
            };
          })
        : undefined;
    return createAgentSlotsScope({
      slot_count: rows.length,
      slots_summary: summaries,
      health_summary: health,
      unhealthy_slots: summaries.filter((s) => s.health !== "ok"),
      system_agent_count: agentOptions.length,
      selected_slot_id: selectedRow?.id,
      selected_slot:
        selectedRow && data ? toSlotDetail(selectedRow, data) : undefined,
      selected_slot_health: selectedRow?.health,
      selected_slot_overrides: overrides,
      selection: window.getSelection()?.toString() || undefined,
    });
  };

  const columns = useMemo((): MatrxColumnDef<SlotRow>[] => {
    return [
      {
        id: "slotKey",
        accessorKey: "slotKey",
        header: "Slot",
        width: 240,
        cell: (r) => (
          <div className="flex flex-col items-start gap-0.5">
            <span className="whitespace-nowrap font-mono text-xs">{r.slotKey}</span>
            {r.isPlaceholder && (
              <Badge variant="outline" className="text-[10px]">
                placeholder
              </Badge>
            )}
          </div>
        ),
      },
      { id: "label", accessorKey: "label", header: "Label", width: 180 },
      {
        id: "agentName",
        accessorKey: "agentName",
        header: "Agent",
        width: 240,
        // THE DOOR LAW: the agent is a record with an identity — open it,
        // new-tab it, peek it. Never a bare string in a cell.
        cell: (r) =>
          r.agentId ? (
            <EntityRef
              token="agent"
              id={r.agentId}
              name={r.agentName}
              href={agentHref(r.agentId, r.agentType)}
            />
          ) : (
            <span className="text-xs text-muted-foreground">{r.agentName}</span>
          ),
      },
      {
        id: "pinLabel",
        accessorKey: "pinLabel",
        header: "Pin",
        filter: "select",
        width: 190,
        cell: (r) => (
          <div className="flex items-center gap-1">
            <Badge variant={r.slot.use_latest ? "secondary" : "outline"}>{r.pinLabel}</Badge>
            {r.agentId && (
              <a
                href={agentHref(r.agentId, r.agentType, "/v")}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Version history for ${r.agentName}`}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <History className="h-3 w-3" />
              </a>
            )}
          </div>
        ),
      },
      {
        id: "health",
        accessorKey: "health",
        header: "Health",
        filter: "select",
        width: 320,
        // A detected problem ships with its fix and its link — never a red
        // badge that tells the admin to go find the answer themselves.
        cell: (r) => {
          const lineage = r.agentId ? lineageIndex[r.agentId] : undefined;
          const twin = lineage?.systemTwin ?? null;
          return (
            <div className="flex flex-wrap items-center gap-1">
              <Badge
                variant="outline"
                className={HEALTH_CLASS[r.health]}
                title={HEALTH_HINT[r.health]}
              >
                {r.health === "not a system agent" ? "NOT a system agent" : r.health}
              </Badge>
              {r.drift && r.health !== "version drift" && (
                <Badge variant="outline" className={HEALTH_CLASS["version drift"]}>
                  {r.drift}
                </Badge>
              )}
              {r.health === "not a system agent" && twin && (
                <>
                  <LineageChip label="system twin" agent={twin} Icon={ShieldCheck} />
                  <RepinToTwinButton slot={r.slot} twin={twin} onSaved={reload} />
                </>
              )}
              {r.health === "not a system agent" && !twin && r.agentId && (
                <LinkedSyncButton agentId={r.agentId} label="Create system twin…" />
              )}
            </div>
          );
        },
      },
      {
        id: "inputKind",
        accessorKey: "inputKind",
        header: "Input",
        filter: "select",
        width: 110,
        cell: (r) => <span className="text-xs text-muted-foreground">{r.inputKind}</span>,
      },
      {
        id: "outputKind",
        accessorKey: "outputKind",
        header: "Output",
        filter: "select",
        width: 110,
        cell: (r) => <span className="text-xs text-muted-foreground">{r.outputKind}</span>,
      },
      {
        id: "overridesCount",
        accessorKey: "overridesCount",
        header: "Overrides",
        filter: "number",
        align: "center",
        width: 90,
        cell: (r) =>
          r.overridesCount > 0 ? (
            <Badge variant="secondary">{r.overridesCount}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">none</span>
          ),
      },
      {
        id: "isEnabled",
        accessorKey: "isEnabled",
        header: "Enabled",
        filter: "boolean",
        align: "center",
        width: 90,
        cell: (r) => (
          <div onClick={(e) => e.stopPropagation()} className="inline-flex">
            <Switch
              checked={r.isEnabled}
              onCheckedChange={(v) => void toggleEnabled(r, v)}
            />
          </div>
        ),
      },
      {
        id: "updatedAt",
        accessorKey: "updatedAt",
        header: "Updated",
        width: 110,
        cell: (r) => (
          <span className="text-xs text-muted-foreground">
            {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "—"}
          </span>
        ),
      },
      { id: "id", accessorKey: "id", header: "ID", cellKind: "uuid", width: 110 },
    ];
  }, [toggleEnabled, lineageIndex, reload]);

  return (
    <SurfaceRuntimeProvider
      surfaceName={AGENT_SLOTS_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="min-h-0 flex-1" data-surface-value="slots_summary">
        <MatrxDataTable
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={loading}
          isFetching={fetching}
          pageSize={50}
          selectedId={selectedId}
          onSelectedIdChange={setSelectedId}
          emptyState={{
            title: "No slots yet",
            description: "Slots seed from aidream code declarations on server boot.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search slots, agents…",
            actions: (
              <Button size="sm" variant="outline" onClick={reload} disabled={fetching}>
                {fetching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            ),
          }}
          copy={{
            label: "Agent slot",
            listLabel: "Agent slots (this view)",
            location: "/administration/agents/slots",
            rowKind: "agent-slot",
            listKind: "agent-slots",
            humanRow,
            rowAttributes: (r) => ({
              id: r.id,
              slot_key: r.slotKey,
              health: r.health,
              enabled: r.isEnabled,
            }),
          }}
          detail={{
            title: (r) => <span className="font-mono text-sm">{r.slotKey}</span>,
            description: (r) => r.label ?? undefined,
            defaultWidth: 520,
            render: (r) =>
              data ? (
                <SlotDetail
                  row={r}
                  data={data}
                  lineage={
                    (r.agentId ? lineageIndex[r.agentId] : undefined) ?? {
                      parent: null,
                      children: [],
                      systemTwin: null,
                    }
                  }
                  onSaved={reload}
                />
              ) : null,
          }}
          window={{
            title: (r) => `Slot — ${r.slotKey}`,
            defaultTab: "edit",
          }}
        />
      </div>
    </div>
    </SurfaceRuntimeProvider>
  );
}
