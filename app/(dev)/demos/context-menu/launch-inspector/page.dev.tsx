"use client";

/**
 * Launch Inspector — the full agent execution flow with everything pinned.
 *
 * Fires the REAL `useAgentLauncher().launchShortcut` (→ `launchAgentExecution`)
 * with a hand-crafted `applicationScope`, then reads the resulting instance
 * back out of Redux through the EXISTING execution-system selectors:
 *
 *   - conversation + shell state  → `selectInstanceSummary`
 *   - instance UI state           → `selectInstanceUIState` (displayMode,
 *                                    widgetHandleId, autoRun, panels)
 *   - assembled request body      → `makeSelectAssembledRequest` (the exact
 *                                    payload `executeInstance` would send)
 *   - resolved variable values    → `selectResolvedVariables` +
 *                                    `selectVariableProvenance`
 *   - context entries             → `selectInstanceContextEntries`
 *   - resources                   → `selectInstanceResources`
 *   - active-request state        → `selectRequestsForInstance` +
 *                                    `selectAccumulatedText`
 *
 * Nothing here is reimplemented; the page is a window onto the production
 * pipeline. autoRun is NEVER overridden — the shortcut row's own config wins.
 * Cleanup goes through the sanctioned `destroyInstanceIfAllowed` path.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CircleSlash,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  Search,
  Trash2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import {
  fetchUnifiedMenu,
  ensureShortcutLoaded,
} from "@/features/agents/redux/agent-shortcuts/thunks";
import {
  selectAllShortcutsArray,
  selectShortcutsInitialLoaded,
  selectShortcutsSliceError,
  selectShortcutsSliceStatus,
} from "@/features/agents/redux/agent-shortcuts/selectors";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import {
  selectInstanceSummary,
  makeSelectAssembledRequest,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectInstanceUIState } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  selectResolvedVariables,
  selectVariableProvenance,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import { selectInstanceResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import {
  selectRequestsForInstance,
  selectAccumulatedText,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL = "rounded-md border border-border bg-card";
const PANEL_TITLE =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/** Sentinel conversation id — selectors return undefined/empty for it. */
const NONE = "__launch-inspector-none__";

/** Interactive "open-and-wait" modes offered as inspection overrides. */
const DISPLAY_MODE_CHOICES: readonly ResultDisplayMode[] = [
  "modal-compact",
  "modal-full",
  "sidebar",
  "panel",
  "flexible-panel",
  "chat-bubble",
];

/** The 5 generic baseline scope values every surface launch carries. */
function buildSampleScope(): Record<string, unknown> {
  return {
    selection: "the selected words",
    text_before: "Text that comes before the selection. ",
    text_after: " Text that comes after the selection.",
    content: "The full sample content of this surface. Edit me freely.",
    context: { source: "launch-inspector-demo" },
  };
}

function previewValue(value: unknown, max = 200): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (s === undefined) return "undefined";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

interface LaunchRun {
  conversationId: string;
  shortcutLabel: string;
  launchedAt: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LaunchInspectorDemoPage() {
  const dispatch = useAppDispatch();
  const { launchShortcut } = useAgentLauncher();

  // ── Shortcut picker (real unified-menu load) ─────────────────────────────
  const shortcuts = useAppSelector(selectAllShortcutsArray);
  const initialLoaded = useAppSelector(selectShortcutsInitialLoaded);
  const sliceStatus = useAppSelector(selectShortcutsSliceStatus);
  const shortcutLoadError = useAppSelector(selectShortcutsSliceError);
  const [shortcutSearch, setShortcutSearch] = useState("");
  const [shortcutId, setShortcutId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialLoaded) {
      void dispatch(fetchUnifiedMenu());
    }
  }, [initialLoaded, dispatch]);

  const shortcutList = useMemo(() => {
    const q = shortcutSearch.trim().toLowerCase();
    const rows = q
      ? shortcuts.filter(
          (s) =>
            s.label.toLowerCase().includes(q) ||
            (s.description ?? "").toLowerCase().includes(q),
        )
      : shortcuts;
    return [...rows].sort((a, b) => a.label.localeCompare(b.label));
  }, [shortcuts, shortcutSearch]);
  const shortcutListLoading =
    !initialLoaded && (sliceStatus === "idle" || sliceStatus === "loading");

  const selectedShortcut = useMemo(
    () => shortcuts.find((s) => s.id === shortcutId) ?? null,
    [shortcuts, shortcutId],
  );

  // ── Load by id (ensureShortcutLoaded — the sanctioned single-flight path) ─
  const [idInput, setIdInput] = useState("");
  const [idLoading, setIdLoading] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);

  const loadById = async () => {
    const id = idInput.trim();
    if (!id) return;
    setIdLoading(true);
    setIdError(null);
    try {
      await dispatch(ensureShortcutLoaded(id)).unwrap();
      setShortcutId(id);
    } catch (err) {
      setIdError(err instanceof Error ? err.message : String(err));
    } finally {
      setIdLoading(false);
    }
  };

  // ── Editable applicationScope JSON ───────────────────────────────────────
  const [scopeJson, setScopeJson] = useState<string>(() =>
    JSON.stringify(buildSampleScope(), null, 2),
  );
  const scopeJsonError = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(scopeJson);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return "applicationScope must be a JSON object";
      }
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid JSON";
    }
  }, [scopeJson]);

  // ── Launch config ────────────────────────────────────────────────────────
  // displayMode override defaults to an open-and-wait overlay so the launch
  // is inspectable. autoRun is deliberately NOT overridable — the shortcut
  // row's own value always wins (never force autoRun from code).
  const [displayModeOverride, setDisplayModeOverride] = useState<
    ResultDisplayMode | ""
  >("modal-compact");
  const [surfaceNameInput, setSurfaceNameInput] = useState("");

  // ── Launch ───────────────────────────────────────────────────────────────
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [runs, setRuns] = useState<LaunchRun[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);

  const canLaunch = !!shortcutId && !scopeJsonError && !launching;

  const runLaunch = async () => {
    if (!shortcutId || scopeJsonError) return;
    setLaunching(true);
    setLaunchError(null);
    const label = selectedShortcut?.label ?? shortcutId;
    try {
      const scope = JSON.parse(scopeJson) as Record<string, unknown>;
      const surfaceName = surfaceNameInput.trim();
      await launchShortcut(shortcutId, scope, {
        sourceFeature: "code-editor",
        ...(surfaceName ? { runtime: { surfaceName } } : {}),
        ...(displayModeOverride
          ? { config: { displayMode: displayModeOverride } }
          : {}),
        onConversationCreated: (conversationId) => {
          // Fires BEFORE the stream runs — panels populate immediately.
          setRuns((prev) => [
            {
              conversationId,
              shortcutLabel: label,
              launchedAt: new Date().toLocaleTimeString(),
            },
            ...prev,
          ]);
          setSelectedConversationId(conversationId);
        },
      });
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLaunching(false);
    }
  };

  const destroyRun = (conversationId: string) => {
    dispatch(destroyInstanceIfAllowed(conversationId));
    setRuns((prev) => prev.filter((r) => r.conversationId !== conversationId));
    setSelectedConversationId((cur) => (cur === conversationId ? null : cur));
  };

  // ── Inspector selectors (existing factories, memoized per conversation) ──
  const cid = selectedConversationId ?? NONE;
  const summary = useAppSelector(
    useMemo(() => selectInstanceSummary(cid), [cid]),
  );
  const uiState = useAppSelector(selectInstanceUIState(cid));
  const assembledRequest = useAppSelector(
    useMemo(() => makeSelectAssembledRequest(cid), [cid]),
  );
  const resolvedVariables = useAppSelector(
    useMemo(() => selectResolvedVariables(cid), [cid]),
  );
  const variableProvenance = useAppSelector(
    useMemo(() => selectVariableProvenance(cid), [cid]),
  );
  const contextEntries = useAppSelector(
    useMemo(() => selectInstanceContextEntries(cid), [cid]),
  );
  const resources = useAppSelector(
    useMemo(() => selectInstanceResources(cid), [cid]),
  );
  const requests = useAppSelector(
    useMemo(() => selectRequestsForInstance(cid), [cid]),
  );
  const latestRequestId =
    requests.length > 0 ? requests[requests.length - 1].requestId : NONE;
  const latestText = useAppSelector(
    useMemo(() => selectAccumulatedText(latestRequestId), [latestRequestId]),
  );

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            <h1 className="text-lg font-semibold">Launch Inspector</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-4xl">
            Pick a shortcut (from the unified menu or by id), edit the sample{" "}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
              applicationScope
            </code>
            , then Launch. Fires the real{" "}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
              launchShortcut → launchAgentExecution
            </code>{" "}
            pipeline and mirrors the resulting instance out of Redux: shell, UI
            state, assembled request body, variable values, context entries,
            resources, and active-request state. autoRun is never overridden —
            the shortcut row decides whether execution starts.
          </p>
        </header>

        {/* ── Inputs row ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Shortcut picker */}
          <section className={`${PANEL} p-2.5 flex flex-col gap-2`}>
            <h2 className={PANEL_TITLE}>1 · Shortcut</h2>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={shortcutSearch}
                onChange={(e) => setShortcutSearch(e.target.value)}
                placeholder="Search shortcuts…"
                className="h-11 w-full rounded border border-border bg-background pl-7 pr-2 text-[16px] outline-none focus:ring-1 focus:ring-primary sm:h-9 sm:text-sm"
              />
            </div>
            <div className="h-44 overflow-auto rounded border border-border/60 bg-background/50">
              {shortcutListLoading ? (
                <div
                  role="status"
                  className="space-y-2 p-3 text-xs text-muted-foreground"
                >
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Loading the unified shortcut menu…
                  </div>
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-5/6" />
                  <Skeleton className="h-8 w-11/12" />
                </div>
              ) : sliceStatus === "failed" && !initialLoaded ? (
                <div role="alert" className="space-y-2 p-3">
                  <p className="text-sm font-medium text-destructive">
                    Shortcuts could not be loaded.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {shortcutLoadError ?? "The unified menu request failed."}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      void dispatch(
                        fetchUnifiedMenu({
                          scope: "global",
                          scopeId: null,
                          force: true,
                        }),
                      )
                    }
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-primary hover:bg-muted"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry shortcut load
                  </button>
                </div>
              ) : shortcutList.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  No shortcuts match.
                </p>
              ) : (
                shortcutList.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setShortcutId(s.id)}
                    className={`min-h-11 w-full truncate px-2 py-1 text-left text-sm ${
                      shortcutId === s.id
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {s.label}
                    <span className="ml-1.5 text-[10px] text-primary">
                      {s.displayMode}
                      {s.autoRun ? " · autoRun" : ""}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                value={idInput}
                onChange={(e) => setIdInput(e.target.value)}
                placeholder="…or paste a shortcut id"
                className="h-11 min-w-0 flex-1 rounded border border-border bg-background px-2 font-mono text-[16px] outline-none focus:ring-1 focus:ring-primary sm:h-8 sm:text-xs"
              />
              <button
                type="button"
                disabled={!idInput.trim() || idLoading}
                onClick={() => void loadById()}
                className="min-h-11 rounded border border-border px-3 text-sm text-primary hover:bg-muted/50 disabled:opacity-50 sm:min-h-8 sm:text-xs"
              >
                {idLoading ? "Loading…" : "Load"}
              </button>
            </div>
            {idError && (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" /> {idError}
              </p>
            )}
            {/* The shortcut came out of `selectAllShortcutsArray` — a real
                row. Its label and its id are both doors rather than one
                concatenated dead string. */}
            {selectedShortcut ? (
              <div className="group flex min-w-0 items-center gap-2 text-[11px]">
                <EntityRef
                  token="agent_shortcut"
                  id={selectedShortcut.id}
                  name={selectedShortcut.label}
                />
                <MatrxUuidCell
                  value={selectedShortcut.id}
                  token="agent_shortcut"
                  label="Shortcut"
                />
              </div>
            ) : shortcutId ? (
              <div className="group text-[11px]">
                <MatrxUuidCell
                  value={shortcutId}
                  token="agent_shortcut"
                  label="Shortcut"
                />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No shortcut selected
              </p>
            )}
          </section>

          {/* Scope JSON */}
          <section className={`${PANEL} p-2.5 flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
              <h2 className={PANEL_TITLE}>2 · applicationScope (JSON)</h2>
              <button
                type="button"
                onClick={() =>
                  setScopeJson(JSON.stringify(buildSampleScope(), null, 2))
                }
                className="inline-flex min-h-11 items-center gap-1 text-xs text-primary hover:underline sm:min-h-8"
              >
                <RefreshCw className="h-3 w-3" /> Reseed baselines
              </button>
            </div>
            <textarea
              value={scopeJson}
              onChange={(e) => setScopeJson(e.target.value)}
              spellCheck={false}
              className={`h-48 w-full resize-none rounded border bg-background p-2 font-mono text-[16px] leading-relaxed outline-none focus:ring-1 focus:ring-primary sm:text-xs ${
                scopeJsonError ? "border-destructive" : "border-border"
              }`}
            />
            {scopeJsonError ? (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" /> {scopeJsonError}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Seeded with the 5 generic baselines. The launch thunk floors
                them again (<code>withBaselineScope</code>) — delete keys here
                to watch the floor do its job.
              </p>
            )}
          </section>

          {/* Launch config */}
          <section className={`${PANEL} p-2.5 flex flex-col gap-2`}>
            <h2 className={PANEL_TITLE}>3 · Launch config</h2>
            <label className="text-[11px] text-muted-foreground">
              displayMode override (open-and-wait)
              <select
                value={displayModeOverride}
                onChange={(e) =>
                  setDisplayModeOverride(
                    e.target.value as ResultDisplayMode | "",
                  )
                }
                className="mt-1 h-11 w-full rounded border border-border bg-background px-2 text-[16px] text-foreground outline-none focus:ring-1 focus:ring-primary sm:h-9 sm:text-sm"
              >
                <option value="">(shortcut default)</option>
                {DISPLAY_MODE_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground">
              runtime.surfaceName (optional — enables agent×surface binding
              layers)
              <input
                value={surfaceNameInput}
                onChange={(e) => setSurfaceNameInput(e.target.value)}
                placeholder="e.g. matrx-user/notes"
                className="mt-1 h-11 w-full rounded border border-border bg-background px-2 font-mono text-[16px] outline-none focus:ring-1 focus:ring-primary sm:h-9 sm:text-xs"
              />
            </label>
            <p className="text-[11px] text-muted-foreground">
              autoRun is not overridable here by design — the shortcut row's
              persisted value decides whether execution fires immediately or
              waits for user input in the overlay.
            </p>
            <div className="mt-auto flex items-center gap-2">
              <button
                type="button"
                disabled={!canLaunch}
                onClick={() => void runLaunch()}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:min-h-9"
              >
                <Play className="h-3.5 w-3.5" />
                {launching ? "Launching…" : "Launch (inspect)"}
              </button>
              {!shortcutId && (
                <span className="text-xs text-muted-foreground">
                  Pick a shortcut first.
                </span>
              )}
            </div>
            {launchError && (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" /> {launchError}
              </p>
            )}
          </section>
        </div>

        {/* ── Runs ───────────────────────────────────────────────────────── */}
        <section className={`${PANEL} p-2.5 space-y-1.5`}>
          <h2 className={PANEL_TITLE}>Launched instances ({runs.length})</h2>
          {runs.length === 0 ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CircleSlash className="h-3.5 w-3.5 shrink-0" />
              Nothing launched yet. Instances created here appear as rows —
              click one to inspect it; Destroy uses{" "}
              <code className="text-[11px]">destroyInstanceIfAllowed</code> so
              repeated runs never pile up.
            </p>
          ) : (
            runs.map((run) => (
              <div
                key={run.conversationId}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                  selectedConversationId === run.conversationId
                    ? "border-primary/60 bg-accent/40"
                    : "border-border/60 bg-muted/30"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedConversationId(run.conversationId)}
                  className="min-h-11 flex-1 text-left"
                >
                  <span className="text-sm text-foreground">
                    {run.shortcutLabel}
                  </span>
                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                    {run.conversationId}
                  </span>
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    {run.launchedAt}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => destroyRun(run.conversationId)}
                  className="inline-flex min-h-11 items-center gap-1 rounded border border-border px-3 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3" /> Destroy
                </button>
              </div>
            ))
          )}
        </section>

        {/* ── Inspector ──────────────────────────────────────────────────── */}
        {selectedConversationId && (
          <div className="space-y-3">
            {summary === null && (
              <p className="flex items-center gap-1.5 rounded bg-warning/15 px-2 py-1.5 text-xs text-foreground">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                No instance shell found for this conversation id — it was
                destroyed (by this page or by closing its overlay).
              </p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Instance UI state */}
              <section className={`${PANEL} p-2.5 space-y-1.5`}>
                <h2 className={PANEL_TITLE}>Instance UI state</h2>
                {uiState ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    {(
                      [
                        ["displayMode", uiState.displayMode],
                        ["widgetHandleId", uiState.widgetHandleId ?? "(none)"],
                        ["autoRun", String(uiState.autoRun)],
                        ["allowChat", String(uiState.allowChat)],
                        [
                          "showVariablePanel",
                          String(uiState.showVariablePanel),
                        ],
                        [
                          "showPreExecutionGate",
                          String(uiState.showPreExecutionGate ?? false),
                        ],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="contents">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-mono text-foreground break-all">
                          {String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No UI state for this instance.
                  </p>
                )}
              </section>

              {/* Shell summary */}
              <section className={`${PANEL} p-2.5 space-y-1.5`}>
                <h2 className={PANEL_TITLE}>
                  Instance summary (selectInstanceSummary)
                </h2>
                {summary ? (
                  <pre className="max-h-56 overflow-auto rounded bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
                    {JSON.stringify(summary, null, 2)}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No shell record.
                  </p>
                )}
              </section>
            </div>

            {/* Assembled request body */}
            <section className={`${PANEL} p-2.5 space-y-1.5`}>
              <h2 className={PANEL_TITLE}>
                Assembled request body (makeSelectAssembledRequest — what
                executeInstance sends)
              </h2>
              {assembledRequest ? (
                <pre className="max-h-72 overflow-auto rounded bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
                  {JSON.stringify(assembledRequest, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No assembled request — instance missing or not assemblable
                  yet.
                </p>
              )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Variables */}
              <section className={`${PANEL} p-2.5 space-y-1.5`}>
                <h2 className={PANEL_TITLE}>
                  Resolved variable values (
                  {Object.keys(resolvedVariables).length})
                </h2>
                {Object.keys(resolvedVariables).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No variables on this instance — the agent declares none, or
                    nothing resolved.
                  </p>
                ) : (
                  Object.entries(resolvedVariables).map(([name, value]) => (
                    <div
                      key={name}
                      className="rounded border border-border/60 bg-muted/30 px-2 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-[11px] font-semibold text-primary">
                          {name}
                        </p>
                        <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                          {variableProvenance[name] ?? "none"}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground break-all">
                        {previewValue(value)}
                      </p>
                    </div>
                  ))
                )}
              </section>

              {/* Context entries */}
              <section className={`${PANEL} p-2.5 space-y-1.5`}>
                <h2 className={PANEL_TITLE}>
                  Context entries ({contextEntries.length}) · Resources (
                  {resources.length})
                </h2>
                {contextEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No context entries emitted.
                  </p>
                ) : (
                  contextEntries.map((entry, i) => (
                    <div
                      key={`${entry.key}-${i}`}
                      className="rounded border border-border/60 bg-muted/30 px-2 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-[11px] font-semibold text-primary">
                          {entry.key}
                        </p>
                        <span className="text-[10px] text-muted-foreground">
                          {entry.type}
                        </span>
                        <span
                          className={`text-[10px] rounded px-1 ${
                            entry.slotMatched
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {entry.slotMatched ? "slot match" : "ad-hoc"}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground break-all">
                        {previewValue(entry.value)}
                      </p>
                    </div>
                  ))
                )}
                {resources.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {resources.map((r) => (
                      <p
                        key={r.resourceId}
                        className="font-mono text-[11px] text-muted-foreground truncate"
                      >
                        resource: {r.blockType} · {r.status} ·{" "}
                        {previewValue(r.resourceId, 80)}
                      </p>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Active requests */}
            <section className={`${PANEL} p-2.5 space-y-1.5`}>
              <h2 className={PANEL_TITLE}>
                Active requests ({requests.length})
              </h2>
              {requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No requests yet. With autoRun=false the instance waits in its
                  overlay for the user to trigger execution — submit there and
                  this panel updates live.
                </p>
              ) : (
                <>
                  {requests.map((r) => (
                    <div
                      key={r.requestId}
                      className="flex items-center gap-2 rounded border border-border/60 bg-muted/30 px-2 py-1"
                    >
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {r.requestId}
                      </span>
                      <span
                        className={`text-[10px] rounded px-1 ${
                          r.status === "error"
                            ? "bg-destructive/15 text-destructive"
                            : r.status === "complete"
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                  ))}
                  {latestText && (
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
                      {latestText}
                    </pre>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
