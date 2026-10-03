"use client";

/**
 * RunToolPicker — THE Tools surface for one conversation. Every place that
 * shows a run's tools renders this one component (Chat Options › Tools, the
 * Quickset tab, the attach menu's Tools view, the phone + sheet's Tools page).
 *
 * Three parts, nothing else (Arman, 2026-10-03):
 *   1. Automatic tools — THE per-chat switch (`builderAdvancedSettings.autoTools`,
 *      sent as `user.auto_tools`, saved with the conversation). It shows the
 *      agent's own default until the person flips it; the person wins both
 *      ways (TOOL-SOURCES rule A).
 *   2. This agent's tools — the agent's REAL saved tool set, read live from
 *      the agentDefinition slice (registry tools + custom tools). Each can be
 *      removed for this chat (`removedTools` → `user.remove`, absolute).
 *   3. Add tools — the full registry catalog, grouped by category, searchable;
 *      one click adds to (or removes from) `builderAdvancedSettings.addedTools`,
 *      sent as `user.add`. Tools the agent already has are marked and not
 *      addable twice.
 *
 * Layout is the shared two-list `RunPicksSurface` (also RunSkillPicker's):
 * two columns at ≥ 42rem of its own width, otherwise one pane at a time.
 *
 * Model gate: tool support is a MODEL capability — the server drops every
 * tool for a model that can't use them, so adding is disabled (clearing stays
 * reachable) and the surface says so in one line.
 */

import { UntrustedCount } from "@host/components/official/stale-data/UntrustedCount";
import { readOf } from "@host/components/read-state/ReadGate";
import { useEffect } from "react";
import { AlertTriangle, Code2, Undo2, Wrench, X } from "lucide-react";
import { PickerRow } from "@host/features/resource-manager/resource-picker/ResourcePickerSubViewHeader";
import type { DatabaseTool } from "@host/utils/supabase/tools-service";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import { PickerEmpty } from "@host/features/resource-manager/resource-picker/ResourcePickerSubViewHeader";
import {
  RunPicksSurface,
  PicksNote,
  PicksNotice,
  PicksSkeletons,
  PicksSwitchRow,
  type PicksCatalogItem,
} from "./RunPicksSurface";
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
  // The switch shows the agent's default until the person flips it; flipping
  // back to the default returns to "follow the agent" (null).
  const agentDefaultOn = !autoToolsDisabled;
  const autoChoice = settings.autoTools ?? null;
  const autoOn = autoChoice ?? agentDefaultOn;
  const setAutoTools = (on: boolean) =>
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: { autoTools: on === agentDefaultOn ? null : on },
      }),
    );
  const removedList = settings.removedTools ?? [];
  const removed = new Set(removedList);
  const toggleRemoved = (name: string) =>
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: {
          removedTools: removed.has(name)
            ? removedList.filter((n) => n !== name)
            : [...removedList, name],
        },
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

  const toItem = (tool: DatabaseTool): PicksCatalogItem => {
    const onAgent = agentOwned.has(tool.id);
    return {
      id: tool.id,
      label: getToolDisplayName(tool.name),
      secondary: tool.description ?? undefined,
      title: tool.description ?? undefined,
      locked: onAgent,
      note: onAgent ? "On agent" : undefined,
    };
  };
  const groups = groupToolCatalog(list).map((g) => ({
    label: g.label,
    items: g.tools.map(toItem),
  }));
  const searchCatalog = (query: string) =>
    filterAndSortBySearch(list, query, [
      { get: (t) => t.name, weight: "title" },
      { get: (t) => getToolDisplayName(t.name), weight: "title" },
      { get: (t) => t.description, weight: "body" },
      { get: (t) => t.category, weight: "tag" },
    ]).map(toItem);

  const agentSection = !agentId ? (
    <PickerEmpty>No agent on this chat</PickerEmpty>
  ) : agentReadError ? (
    <ReadFailure
      error={agentReadError}
      what="this agent's tools"
      size="compact"
      className="m-1.5"
      onRetry={() => void dispatch(fetchAgentExecutionFull(agentId))}
    />
  ) : agentLoading || (catalogLoading && builtInIds.length > 0) ? (
    // Names come from the catalog: hold the skeleton until it lands, never
    // flash raw tool ids at the person.
    <PicksSkeletons />
  ) : agentToolCount === 0 ? (
    <PicksNote>No tools of its own</PicksNote>
  ) : (
    <div className="flex flex-col">
      {builtInIds.map((id) => {
        const t = toolMap.get(id);
        // Removals travel by NAME (the server matches names on every entry).
        const name = t?.name ?? id;
        const isRemoved = removed.has(name);
        return (
          <PickerRow
            key={id}
            icon={Wrench}
            label={
              <span className={isRemoved ? "text-muted-foreground line-through" : undefined}>
                {t ? getToolDisplayName(t.name) : "Unknown tool"}
              </span>
            }
            title={isRemoved ? "Restore for this chat" : "Remove for this chat"}
            pressed={!isRemoved}
            trailing={
              isRemoved ? (
                <Undo2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <X className="h-4 w-4 shrink-0 text-muted-foreground" />
              )
            }
            onClick={() => toggleRemoved(name)}
          />
        );
      })}
      {customList.map((t) => {
        const isRemoved = removed.has(t.name);
        return (
          <PickerRow
            key={t.name}
            icon={Code2}
            label={
              <span className={isRemoved ? "text-muted-foreground line-through" : undefined}>
                {getToolDisplayName(t.name)}
              </span>
            }
            title={isRemoved ? "Restore for this chat" : "Remove for this chat"}
            pressed={!isRemoved}
            trailing={
              isRemoved ? (
                <Undo2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <X className="h-4 w-4 shrink-0 text-muted-foreground" />
              )
            }
            onClick={() => toggleRemoved(t.name)}
          />
        );
      })}
    </div>
  );

  return (
    <RunPicksSurface
      noun="tools"
      icon={Wrench}
      topSlot={
        <PicksSwitchRow
          label="Auto tools"
          detail={autoChoice === null ? "Agent default" : "This chat"}
          title={`Agent default: ${agentDefaultOn ? "on" : "off"}`}
          checked={autoOn}
          onCheckedChange={setAutoTools}
        />
      }
      notice={
        modelSupportsTools ? null : (
          <PicksNotice icon={AlertTriangle}>
            This model can&apos;t use tools; they&apos;re dropped
          </PicksNotice>
        )
      }
      agentCount={
        <UntrustedCount
          read={readOf({ isLoading: agentLoading, error: agentReadError })}
          value={agentToolCount}
          label="This agent's tools"
        />
      }
      agentSection={agentSection}
      added={addedList.map((id) => {
        const t = toolMap.get(id);
        return {
          id,
          label: t ? getToolDisplayName(t.name) : catalogLoading ? "Loading…" : "Unknown tool",
          secondary: t ? toolCategoryLabel(t.category) : undefined,
        };
      })}
      onToggle={toggle}
      onClear={() => setAdded([])}
      catalogSize={list.length}
      groups={groups}
      searchCatalog={searchCatalog}
      catalogState={
        catalogLoading ? (
          <PicksSkeletons />
        ) : catalogFailed ? (
          <ReadFailure
            error={toolsError ?? true}
            what="the tool catalog"
            className="m-2"
            onRetry={() => void dispatch(fetchAvailableTools())}
          />
        ) : undefined
      }
      addDisabledReason={
        modelSupportsTools
          ? undefined
          : "Pick a model that supports tools to add any."
      }
    />
  );
}
