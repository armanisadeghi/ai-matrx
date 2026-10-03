"use client";

/**
 * RunToolPicker — THE Tools surface for one conversation. Every place that
 * shows a run's tools renders this one component (Chat Options › Tools, the
 * Quickset tab, the attach menu's Tools view, the phone + sheet's Tools page).
 *
 * Three parts, nothing else (Arman, 2026-10-03):
 *   1. Automatic tools — one switch: may the server add tools for this chat
 *      (`builderAdvancedSettings.disableToolInjection`, per conversation; the
 *      agent's own `auto_tools_disabled` overrides it and locks the switch).
 *   2. This agent's tools — the agent's REAL saved tool set, read live from
 *      the agentDefinition slice (registry tools + custom tools), plus the
 *      tools added for this run, each removable. The agent's own set is
 *      edited in the Agent Builder: the run request has no per-run exclude
 *      field, so it is listed, not switchable, here.
 *   3. Add tools — the full registry catalog, grouped by category, searchable;
 *      one click adds to (or removes from) `builderAdvancedSettings.addedTools`,
 *      which `buildToolInjection` folds into the request on top of the agent's
 *      own tools. Tools the agent already has are marked and not addable twice.
 *
 * Layout is a container query, not a viewport check: at ≥ 42rem of its own
 * width (the Chat Options window opened on Tools) it is two columns; narrower
 * (the attach popover, Quickset, the phone sheet) it is one column with a
 * segmented control between "Agent's tools" and "Add tools".
 *
 * Model gate: tool support is a MODEL capability — the server drops every
 * tool for a model that can't use them, so adding is disabled (clearing stays
 * reachable) and the surface says so in one line.
 */

import { UntrustedCount } from "@host/components/official/stale-data/UntrustedCount";
import { readOf } from "@host/components/read-state/ReadGate";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, Code2, Wrench, X } from "lucide-react";
import type { DatabaseTool } from "@host/utils/supabase/tools-service";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import { cn, SegmentedControl, Skeleton } from "@ai-matrx/design-system";
import { Switch } from "@host/components/ui/switch";
import {
  PickerEmpty,
  PickerRow,
  PickerSearchField,
  PickerSectionLabel,
} from "@host/features/resource-manager/resource-picker/ResourcePickerSubViewHeader";
import {
  selectAllTools,
  selectToolsStatus,
  selectToolsError,
} from "../../../redux/tools/tools.selectors";
import { ReadFailure } from "@host/components/read-state/ReadFailure";
import { fetchAvailableTools } from "../../../redux/tools/tools.thunks";
import {
  selectAgentError,
  selectAgentTools,
  selectAgentCustomTools,
  selectAgentAutoToolsDisabled,
  selectAgentReadyForCustomExecution,
} from "../../../redux/agent-definition/selectors";
import { fetchAgentExecutionFull } from "../../../redux/agent-definition/thunks";
import { selectAgentIdFromInstance } from "../../../redux/execution-system/conversations/conversations.selectors";
import {
  selectAllModels,
  selectModelFullyLoaded,
  fetchModelById,
} from "@host/features/ai-models/redux/modelRegistrySlice";
import {
  useModelControls,
  supportsTools,
} from "../../../hooks/useModelControls";
import { selectInstanceOverrideState } from "../../../redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { effectiveOfferingPin } from "../../../redux/execution-system/instance-model-overrides/offering-pin";
import { useModelClassControls } from "@host/features/ai-models/hooks/useModelClassControls";
import { selectBuilderAdvancedSettings } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setBuilderAdvancedSettings } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "../../../types/instance.types";
import { filterAndSortBySearch } from "@ai-matrx/kit/search-scoring";
import { getToolDisplayName } from "../../../../tool-call-visualization/registry/registry";
import { groupToolCatalog, toolCategoryLabel } from "./run-tool-catalog";

type Pane = "agent" | "add";

export function RunToolPicker({ conversationId }: { conversationId: string }) {
  const dispatch = useAppDispatch();
  const tools = useAppSelector(selectAllTools);
  const status = useAppSelector(selectToolsStatus);
  const toolsError = useAppSelector(selectToolsError);
  // The agent that owns this conversation — the source of the REAL tool set.
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));
  const agentToolIds = useAppSelector((s) =>
    agentId ? selectAgentTools(s, agentId) : undefined,
  );
  const agentCustomTools = useAppSelector((s) =>
    agentId ? selectAgentCustomTools(s, agentId) : undefined,
  );
  const autoToolsDisabled = useAppSelector((s) =>
    agentId ? selectAgentAutoToolsDisabled(s, agentId) : false,
  );
  const agentReadError = useAppSelector((s) =>
    agentId ? selectAgentError(s, agentId) : null,
  );
  const agentReady = useAppSelector((s) =>
    agentId ? selectAgentReadyForCustomExecution(s, agentId) : false,
  );

  // Tool support is a MODEL capability — read the effective (override ??
  // base) model for this run. Permissive default (see supportsTools).
  const overrideState = useAppSelector(
    selectInstanceOverrideState(conversationId),
  );
  const effectiveModelId =
    (overrideState?.overrides?.model as string | undefined) ??
    (overrideState?.baseSettings?.model as string | undefined) ??
    "";
  const models = useAppSelector(selectAllModels);
  const modelIsFull = useAppSelector((s) =>
    selectModelFullyLoaded(s, effectiveModelId),
  );
  const modelRegistryLoading = useAppSelector((s) => s.modelRegistry.isLoading);
  // The registry may hold only the lightweight "options" record (no
  // controls); pull the full record so the capability read is accurate.
  useEffect(() => {
    if (effectiveModelId && !modelIsFull && !modelRegistryLoading) {
      void dispatch(fetchModelById(effectiveModelId));
    }
  }, [effectiveModelId, modelIsFull, modelRegistryLoading, dispatch]);
  const classControls = useModelClassControls(
    effectiveModelId,
    effectiveOfferingPin(overrideState),
  );
  const { normalizedControls } = useModelControls(
    models,
    effectiveModelId,
    classControls,
  );
  // Unknown model (none selected / not loaded) → permissive, don't gate.
  const modelSupportsTools = effectiveModelId
    ? supportsTools(normalizedControls)
    : true;

  const settings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ??
    DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const addedList = settings.addedTools ?? [];
  const added = new Set(addedList);
  const [search, setSearch] = useState("");
  const [pane, setPane] = useState<Pane>("agent");

  // The registry catalog resolves the agent's tool ids to names AND drives
  // the add list. Only the first read: a failed read waits for "Try again".
  useEffect(() => {
    if (status === "idle") {
      void dispatch(fetchAvailableTools());
    }
  }, [status, dispatch]);

  // The agent's tools live in the customExecution payload, which the chat
  // path may not have fetched. Pull it so the agent's set isn't silently empty.
  useEffect(() => {
    if (agentId && !agentReady) {
      void dispatch(fetchAgentExecutionFull(agentId));
    }
  }, [agentId, agentReady, dispatch]);

  const setAdded = (next: string[]) =>
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: { addedTools: next },
      }),
    );
  const toggle = (id: string) =>
    setAdded(
      added.has(id) ? addedList.filter((t) => t !== id) : [...addedList, id],
    );
  const setServerMayAdd = (allow: boolean) =>
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: { disableToolInjection: !allow },
      }),
    );

  // No useMemo — React Compiler memoizes (CLAUDE.md core invariant).
  const list = tools ?? [];
  const toolMap = new Map(list.map((t) => [t.id, t]));
  const builtInIds = Array.isArray(agentToolIds) ? agentToolIds : [];
  const agentOwned = new Set(builtInIds);
  const customList = Array.isArray(agentCustomTools) ? agentCustomTools : [];
  const agentToolCount = builtInIds.length + customList.length;
  const agentLoading = !!agentId && !agentReady;
  const catalogLoading = status === "loading" && list.length === 0;
  const catalogFailed = status === "failed" && list.length === 0;

  const query = search.trim();
  const matches = query
    ? filterAndSortBySearch(list, query, [
        { get: (t) => t.name, weight: "title" },
        { get: (t) => getToolDisplayName(t.name), weight: "title" },
        { get: (t) => t.description, weight: "body" },
        { get: (t) => t.category, weight: "tag" },
      ])
    : [];
  const groups = query ? [] : groupToolCatalog(list);

  const agentCountNode = (
    <UntrustedCount
      read={readOf({ isLoading: agentLoading, error: agentReadError })}
      value={agentToolCount}
      label="This agent's tools"
    />
  );

  const catalogRow = (tool: DatabaseTool) => {
    const onAgent = agentOwned.has(tool.id);
    const selected = added.has(tool.id);
    return (
      <PickerRow
        key={tool.id}
        leading={<CheckBox on={onAgent || selected} muted={onAgent} />}
        label={getToolDisplayName(tool.name)}
        secondary={tool.description ?? undefined}
        title={tool.description ?? undefined}
        selected={selected}
        disabled={onAgent || !modelSupportsTools}
        trailing={
          onAgent ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              On agent
            </span>
          ) : selected ? (
            <span className="shrink-0 text-xs text-primary">Added</span>
          ) : null
        }
        onClick={() => toggle(tool.id)}
      />
    );
  };

  // ── Left: this agent's tools + this run's additions ──────────────────
  const agentPane = (
    <div
      className={cn(
        "min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-1.5",
        pane === "agent" ? "flex" : "hidden",
        "@2xl:flex @2xl:border-r @2xl:border-border",
      )}
    >
      {addedList.length > 0 ? (
        <>
          <PickerSectionLabel
            action={
              <button
                type="button"
                onClick={() => setAdded([])}
                className="rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Clear
              </button>
            }
          >
            Added for this run · {addedList.length}
          </PickerSectionLabel>
          <div className="flex flex-col">
            {addedList.map((id) => {
              const t = toolMap.get(id);
              return (
                <PickerRow
                  key={id}
                  icon={Wrench}
                  iconClassName="text-primary"
                  label={t ? getToolDisplayName(t.name) : id}
                  secondary={t ? toolCategoryLabel(t.category) : undefined}
                  title="Remove from this run"
                  trailing={
                    <X className="h-4 w-4 shrink-0 text-muted-foreground" />
                  }
                  onClick={() => toggle(id)}
                />
              );
            })}
          </div>
        </>
      ) : null}
      <PickerSectionLabel
        action={
          <span className="text-xs tabular-nums text-muted-foreground">
            {agentCountNode}
          </span>
        }
      >
        This agent&apos;s tools
      </PickerSectionLabel>
      {!agentId ? (
        <PickerEmpty>No agent on this chat</PickerEmpty>
      ) : agentReadError ? (
        <ReadFailure
          error={agentReadError}
          what="this agent's tools"
          size="compact"
          className="m-1.5"
          onRetry={() => void dispatch(fetchAgentExecutionFull(agentId))}
        />
      ) : agentLoading ? (
        <RowSkeletons />
      ) : agentToolCount === 0 ? (
        <p className="px-2 py-2 text-xs text-muted-foreground">
          No tools of its own
        </p>
      ) : (
        <div className="flex flex-col">
          {builtInIds.map((id) => {
            const t = toolMap.get(id);
            return (
              <ToolLine
                key={id}
                icon={Wrench}
                label={t ? getToolDisplayName(t.name) : id}
                detail={t ? toolCategoryLabel(t.category) : undefined}
                title={t?.description ?? undefined}
              />
            );
          })}
          {customList.map((t) => (
            <ToolLine
              key={t.name}
              icon={Code2}
              label={getToolDisplayName(t.name)}
              detail="Custom"
              title={t.description ?? undefined}
            />
          ))}
        </div>
      )}
    </div>
  );

  // ── Right: the catalog ──────────────────────────────────────────────
  const addPane = (
    <div
      className={cn(
        "min-h-0 flex-1 flex-col",
        pane === "add" ? "flex" : "hidden",
        "@2xl:flex",
      )}
    >
      <div className="shrink-0 p-1.5 pb-0">
        <PickerSearchField
          value={search}
          onChange={setSearch}
          placeholder={
            list.length > 0 ? `Search ${list.length} tools` : "Search tools"
          }
          disabled={!modelSupportsTools}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {!modelSupportsTools ? (
          <PickerEmpty>
            Pick a model that supports tools to add any.
          </PickerEmpty>
        ) : catalogLoading ? (
          <RowSkeletons />
        ) : catalogFailed ? (
          <ReadFailure
            error={toolsError ?? true}
            what="the tool catalog"
            className="m-2"
            onRetry={() => void dispatch(fetchAvailableTools())}
          />
        ) : query ? (
          matches.length === 0 ? (
            <PickerEmpty>No tools match &ldquo;{query}&rdquo;</PickerEmpty>
          ) : (
            matches.map(catalogRow)
          )
        ) : groups.length === 0 ? (
          <PickerEmpty>No tools available</PickerEmpty>
        ) : (
          groups.map((group) => (
            <section key={group.label}>
              <PickerSectionLabel
                action={
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {group.tools.length}
                  </span>
                }
              >
                {group.label}
              </PickerSectionLabel>
              {group.tools.map(catalogRow)}
            </section>
          ))
        )}
      </div>
    </div>
  );

  const serverMayAdd =
    !(settings.disableToolInjection ?? false) && !autoToolsDisabled;

  return (
    <div className="@container flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── 1. Automatic tools ── */}
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-border p-1.5">
        <label
          className={cn(
            "flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-foreground hover:bg-accent pointer-coarse:h-11",
            autoToolsDisabled &&
              "cursor-not-allowed opacity-60 hover:bg-transparent",
          )}
          title={
            autoToolsDisabled
              ? "Turned off in this agent's settings"
              : undefined
          }
        >
          <span className="min-w-0 flex-1 truncate">Server can add tools</span>
          <Switch
            checked={serverMayAdd}
            disabled={autoToolsDisabled}
            onCheckedChange={setServerMayAdd}
            aria-label="Server can add tools"
            className="shrink-0"
          />
        </label>
        {!modelSupportsTools ? (
          <div className="flex items-center gap-1.5 px-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="truncate">
              This model can&apos;t use tools; they&apos;re dropped
            </span>
          </div>
        ) : null}
        {/* ── Narrow: one pane at a time ── */}
        <SegmentedControl
          className="@2xl:hidden"
          fullWidth
          size="sm"
          value={pane}
          onValueChange={(next) => setPane(next === "add" ? "add" : "agent")}
          data={[
            {
              value: "agent",
              ariaLabel: "Agent's tools",
              label: (
                <span className="flex items-center gap-1.5">
                  Agent&apos;s tools
                  <span className="tabular-nums text-muted-foreground">
                    {agentCountNode}
                    {addedList.length > 0 ? ` +${addedList.length}` : ""}
                  </span>
                </span>
              ),
            },
            { value: "add", label: "Add tools" },
          ]}
        />
      </div>

      {/* ── 2 + 3 ── */}
      <div className="flex min-h-0 flex-1 @2xl:grid @2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @2xl:grid-rows-[minmax(0,1fr)]">
        {agentPane}
        {addPane}
      </div>
    </div>
  );
}

/** Checkbox glyph for a catalog row (agent-owned rows show a muted tick). */
function CheckBox({ on, muted }: { on: boolean; muted?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
        on
          ? muted
            ? "border-muted-foreground/40 bg-muted text-muted-foreground"
            : "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/40",
      )}
    >
      {on ? <Check className="h-3 w-3" /> : null}
    </span>
  );
}

/** A read-only line for one of the agent's own tools. */
function ToolLine({
  icon: Icon,
  label,
  detail,
  title,
}: {
  icon: typeof Wrench;
  label: string;
  detail?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex h-9 min-w-0 items-center gap-2.5 rounded-lg px-1.5 pointer-coarse:h-11"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {label}
      </span>
      {detail ? (
        <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
          {detail}
        </span>
      ) : null}
    </div>
  );
}

function RowSkeletons() {
  return (
    <div className="flex flex-col gap-1.5 p-1.5">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-7 w-full rounded-md" />
      ))}
    </div>
  );
}
