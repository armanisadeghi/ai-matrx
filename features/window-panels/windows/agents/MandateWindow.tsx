"use client";

/**
 * MandateWindow — mandates handled IN PLACE, never by leaving the page.
 *
 * 🚨 Arman, 2026-08-26: "We don't ever want to send the user off of the page,
 * over to a route like the agent's mandate route. Instead, you should do the
 * same thing that we do when the user clicks on the settings icon for the
 * agents that are assigned into roles … the admin can handle mandates directly
 * on the page, and a user can do the same for themselves."
 *
 * So this is the mandate twin of `AgentSettingsWindow`, opened from anywhere a
 * mandate is NAMED (the Agents menu's "AI doing jobs here" rows
 * chips). The route consoles still exist for browsing all 365; nothing on a
 * working surface links to them any more.
 *
 * 🚨 A PANEL WRAPS THE CANONICAL COMPONENT (features/window-panels/FEATURE.md).
 * Every pane here is the same component the route renders, with no second
 * implementation of anything:
 *   • Yours  → `MandateOverridePanel` — the binding editor `/agents/mandates`
 *              composes (principal chips, agent swap, settings overrides,
 *              consumption map, copy & customize, remove).
 *   • Admin  → `MandateDetailView` — the whole console drawer: health verdict
 *              and its fix, pin editing, the test bench, notes, bindings.
 * The window's own code is the SHELL: which mandates are in scope, which one is
 * selected, which pane shows, and one scoped data load for all of it.
 *
 * WHAT THE WINDOW ADDS over the route it replaces:
 *   • it opens on the mandates of the SURFACE you are standing on (its own and
 *     its family's), so the list is the handful that matter here, not 365;
 *   • it loads only those rows (`fetchMandateConsoleData({ mandateKeys })`);
 *   • the user pane is first for everyone — a non-admin gets a real editor for
 *     their own binding instead of an admin console they cannot use;
 *   • it records the surface it was opened from onto any note written here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrainCircuit, Loader2, Search, ShieldCheck, UserRound } from "lucide-react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentLineageIndex,
  selectBuiltinAgents,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  fetchMandateConsoleData,
  fetchMandateCodeTruthReport,
  type MandateCodeTruth,
  type MandateConsoleData,
} from "@/features/admin/mandates/service";
import { buildRow, type MandateRow } from "@/features/admin/mandates/mandate-health";
import { MandateDetailView } from "@/features/admin/mandates/MandateDetailPanel";
import { MandateOverridePanel } from "@/features/agents/mandates/components/MandateOverridePanel";
import { MandateResolutionRibbon } from "@/features/agents/mandates/components/MandateResolutionRibbon";
import { MandateNotesPanel } from "@/features/agents/mandates/components/MandateNotesPanel";
import { onMandateCacheInvalidated } from "@/features/agents/mandates/service";
import { splitMandateKey } from "@/features/agents/mandates/mandate-key";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";
import { cn } from "@/lib/utils";
import type { MandateWindowView } from "@/features/overlays/openers/mandateWindow";

export interface MandateWindowProps {
  isOpen?: boolean;
  onClose?: () => void;
  /** The mandate to select on open. */
  initialMandateKey?: string;
  /**
   * The mandates in scope — normally the surface's own + its family's. Empty
   * or omitted loads every mandate (the Tools-grid entry point).
   */
  mandateKeys?: string[];
  /** Where this was opened from. Stamped on notes; shown as the window's context. */
  surfaceName?: string;
  initialView?: MandateWindowView;
}

export default function MandateWindow(props: MandateWindowProps) {
  if (props.isOpen === false) return null;
  return <MandateWindowInner {...props} />;
}

function MandateWindowInner({
  onClose,
  initialMandateKey,
  mandateKeys,
  surfaceName,
  initialView,
}: MandateWindowProps) {
  const dispatch = useAppDispatch();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const builtinAgents = useAppSelector(selectBuiltinAgents);
  const lineageIndex = useAppSelector(selectAgentLineageIndex);

  const [data, setData] = useState<MandateConsoleData | null>(null);
  const [codeTruthByKey, setCodeTruthByKey] = useState<
    Record<string, MandateCodeTruth>
  >({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialMandateKey ?? null,
  );
  const [search, setSearch] = useState("");
  const [view, setView] = useState<MandateWindowView>(
    initialView ?? "yours",
  );

  // The scope key is the load identity — a stable string so a new array with
  // the same contents never re-fires the read.
  const scopeKey = useMemo(
    () => [...new Set(mandateKeys ?? [])].sort().join("|"),
    [mandateKeys],
  );

  const load = useCallback(() => {
    const keys = scopeKey ? scopeKey.split("|") : [];
    fetchMandateConsoleData(keys.length > 0 ? { mandateKeys: keys } : {})
      .then((next) => {
        setData(next);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        // LOUD: an unreadable mandate list is a failure, never an empty window.
        console.error("[mandate-window] load failed", err);
        setLoadError(
          err instanceof Error ? err.message : "Could not load mandates.",
        );
      });
  }, [scopeKey]);

  useEffect(() => {
    load();
    // The pickers and the lineage index both read the canonical agent listing.
    dispatch(fetchAgentsListFull());
  }, [dispatch, load]);

  // Any mandate write anywhere refreshes this window — the same bus the route
  // console subscribes to, so a rebind made elsewhere never leaves a stale pin.
  useEffect(() => onMandateCacheInvalidated(() => load()), [load]);

  // Code truth is an ADMIN endpoint and only the Admin pane renders it. A
  // failure degrades the health verdict, never the window.
  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    fetchMandateCodeTruthReport(dispatch)
      .then((report) => {
        if (cancelled) return;
        setCodeTruthByKey(
          Object.fromEntries(report.mandates.map((m) => [m.mandate_key, m])),
        );
      })
      .catch((err: unknown) => {
        console.warn("[mandate-window] code truth unavailable", err);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, isSuperAdmin]);

  const builtinAgentsById = useMemo<ReadonlyMap<string, string>>(
    () => new Map(builtinAgents.map((a) => [a.id, a.name ?? a.id])),
    [builtinAgents],
  );

  const rows = useMemo<MandateRow[]>(() => {
    if (!data) return [];
    return data.mandates
      .map((mandate) =>
        buildRow(mandate, data, codeTruthByKey[mandate.mandate_key]),
      )
      .sort((a, b) => a.mandateKey.localeCompare(b.mandateKey));
  }, [data, codeTruthByKey]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.mandateKey, row.label ?? "", row.agentName]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [rows, search]);

  // Selection is DERIVED, never synced: the requested key when it is in scope,
  // otherwise the first row. Only a click writes `selectedKey`, so a load that
  // returns a different set can never leave the window pointing at nothing.
  const selected =
    rows.find((row) => row.mandateKey === selectedKey) ?? rows[0] ?? null;

  const canSeeAdmin = isSuperAdmin;
  const effectiveView: MandateWindowView =
    view === "admin" && !canSeeAdmin ? "yours" : view;

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-2 py-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a mandate"
            className="h-7 w-full rounded-md border border-border bg-background pl-6 pr-2 text-xs outline-none focus:border-primary/50"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 space-y-0.5 p-1.5">
        {visibleRows.map((row) => {
          const { feature, mandate } = splitMandateKey(row.mandateKey);
          const active = row.mandateKey === selected?.mandateKey;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedKey(row.mandateKey)}
              title={row.mandateKey}
              className={cn(
                "block w-full min-w-0 rounded-md px-2 py-1 text-left transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-accent",
              )}
            >
              <span className="block truncate text-xs font-medium">
                {row.label ?? mandate}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {feature} · {row.agentName}
              </span>
            </button>
          );
        })}
        {visibleRows.length === 0 && (
          <p className="px-2 py-3 text-[11px] text-muted-foreground">
            {data ? "No mandate matches." : "Loading…"}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <WindowPanel
      id="mandate-window"
      title="Mandates"
      onClose={onClose}
      width={980}
      height={720}
      minWidth={620}
      minHeight={420}
      overlayId="mandateWindow"
      onCollectData={() => ({
        initialMandateKey: selected?.mandateKey ?? null,
        mandateKeys: mandateKeys ?? null,
        surfaceName: surfaceName ?? null,
        initialView: effectiveView,
      })}
      sidebar={sidebar}
      sidebarDefaultSize={240}
      sidebarMinSize={190}
      urlSyncKey="mandate"
      urlSyncId="mandate-window"
    >
      <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
        {/* Identity + panes */}
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <BrainCircuit className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {selected?.label ?? selected?.mandateKey ?? "Mandates"}
              </p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {selected?.mandateKey ?? ""}
                {surfaceName
                  ? ` · on ${getSurfaceDisplayLabel(surfaceName)}`
                  : ""}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1">
            <PaneTab
              active={effectiveView === "yours"}
              onClick={() => setView("yours")}
              icon={<UserRound className="h-3 w-3" />}
              label="Yours"
            />
            {canSeeAdmin && (
              <PaneTab
                active={effectiveView === "admin"}
                onClick={() => setView("admin")}
                icon={<ShieldCheck className="h-3 w-3" />}
                label="Admin"
              />
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loadError ? (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {loadError}
            </p>
          ) : !data ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading mandates…
            </div>
          ) : !selected ? (
            <p className="text-xs text-muted-foreground">
              No mandate is in scope here.
            </p>
          ) : effectiveView === "admin" && canSeeAdmin ? (
            <MandateDetailView
              key={selected.id}
              row={selected}
              data={data}
              lineage={
                (selected.agentId ? lineageIndex[selected.agentId] : undefined) ?? {
                  parent: null,
                  children: [],
                  systemTwin: null,
                }
              }
              builtinAgentsById={builtinAgentsById}
              onSaved={load}
            />
          ) : (
            <div className="space-y-3">
              {/* The precedence chain, so "yours" is never mistaken for "the
                  system default" — the same ribbon the route surface shows. */}
              <MandateResolutionRibbon />
              <MandateOverridePanel
                key={selected.id}
                mandate={selected.mandate}
                bindings={data.bindingsByMandateId[selected.id] ?? []}
                agentsById={data.agentsById}
                onChanged={load}
              />
              {/* Admins get notes beside their own binding too — the same
                  panel the Admin pane and the Agents menu mount. */}
              {canSeeAdmin && (
                <div className="rounded-md border border-border bg-card p-3">
                  <p className="mb-2 text-xs font-medium text-foreground">
                    Notes &amp; observations
                  </p>
                  <MandateNotesPanel
                    key={`notes:${selected.id}`}
                    mandateId={selected.id}
                    mandateKey={selected.mandateKey}
                    surfaceName={surfaceName ?? null}
                    observedAgentId={selected.agentId}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </WindowPanel>
  );
}

function PaneTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
