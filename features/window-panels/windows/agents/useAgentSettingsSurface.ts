"use client";

/**
 * Runtime for `matrx-user/agent-settings` — the surface's FIRST provider.
 * Before this hook the manifest declared a vocabulary that nothing ever
 * emitted, so no agent could read the window and no write target could have
 * resolved against it.
 *
 * Returns the `getScope` callback `AgentSettingsWindow` hands to
 * `<SurfaceRuntimeProvider>` (the read half, sampled when the user presses ▶).
 *
 * THERE IS NO `getWriteHandlers` HERE, ON PURPOSE. The surface's one write
 * target lands in `AgentSettingsForm`'s COMPONENT STATE two levels down, so the
 * form registers the handler itself through `useSurfaceWriteHandlers` — the
 * seam that exists for exactly this. Threading `setDraft` up into the window
 * just to satisfy the provider prop would put the state and the handler in
 * different components for no gain.
 *
 * TWO THINGS THIS HOOK IS CAREFUL ABOUT
 *
 * 1. It reads Redux through the STORE, not `useAppSelector`. The window must
 *    not re-render every time the agent it is showing changes, and scope is
 *    wanted as it is at RUN time, not at render time. Same reason
 *    `useAgentAdvancedEditorSurface` does it.
 *
 * 2. Window state is read through REFS. The user can switch tabs or panes while
 *    a run is in flight, and `getScope` must report the tab that is on screen
 *    when they press ▶, not the one that was open when the window last
 *    rendered.
 *
 * The four authored fields come from the FORM's live draft
 * (`agentSettingsDraftRegistry`), not from the Redux record, because that form
 * stages edits in component state — including the ones an agent just staged
 * through `settings_catalog_profile`. Reading Redux here would report the
 * stored description while a different one sat unsaved in the box, which would
 * make the write target's read twins quietly wrong. The registry falls back to
 * the stored record whenever the form is not mounted (the Surface pane is open,
 * or nothing has loaded yet).
 */

import { useCallback, useEffect, useRef } from "react";

import { useAppStore } from "@/lib/redux/hooks";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { createAgentSettingsScope } from "@/features/surfaces/manifests/agent-settings.manifest";
import {
  selectAgentAccessResolved,
  selectAgentById,
  selectAgentIsReadOnly,
  selectAllAgentsArray,
} from "@/features/agents/redux/agent-definition/selectors";
import { selectModelNameById } from "@/features/ai-models/redux/modelRegistrySlice";
import { agentOwnershipLabel } from "@/features/agents/components/settings/AgentSettingsForm";
import { readAgentSettingsDraft } from "@/features/agents/components/settings/agentSettingsDraftRegistry";

/** Empty strings and empty arrays are absence, not data — keep them out of the
 * scope so `alwaysAvailable: false` means what it says. */
function orUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export interface AgentSettingsWindowState {
  activeTabId: string | null;
  openedTabIds: string[];
  panelView: string;
  boundSurfaceName?: string;
}

export interface AgentSettingsSurface {
  getScope: () => SurfaceScopePayload;
}

export function useAgentSettingsSurface(
  state: AgentSettingsWindowState,
): AgentSettingsSurface {
  const store = useAppStore();

  // See rule 2 in the file docblock — window state is sampled at Run time.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const getScope = useCallback((): SurfaceScopePayload => {
    const { activeTabId, openedTabIds, panelView, boundSurfaceName } =
      stateRef.current;

    const base = {
      open_agent_ids: openedTabIds,
      panel_view: panelView,
      bound_surface_name: orUndefined(boundSurfaceName),
    };

    if (!activeTabId) return createAgentSettingsScope(base);

    const redux = store.getState();
    const agent = selectAgentById(redux, activeTabId);
    if (!agent) {
      // The tab is open but the record has not landed yet. Say which agent is
      // in focus and nothing more — inventing empty strings for fields we have
      // not loaded would read as "this agent has no description".
      return createAgentSettingsScope({
        ...base,
        active_agent_id: activeTabId,
      });
    }

    // What is IN THE BOXES, falling back to the stored record when the Info
    // pane is not mounted (the Surface pane is showing, or it is still
    // mounting).
    const draft = readAgentSettingsDraft(activeTabId);

    // The Category picker's own suggestion list: the DISTINCT categories across
    // every agent loaded in this session, sorted — the same derivation
    // `AgentSettingsForm` renders, so the options an agent is told about are
    // the options the user is offered.
    const categoryOptions = Array.from(
      new Set(
        selectAllAgentsArray(redux)
          .map((entry) => entry.category)
          .filter((category): category is string => Boolean(category)),
      ),
    ).sort();

    const toolCount =
      (agent.tools?.length ?? 0) + (agent.customTools?.length ?? 0);

    return createAgentSettingsScope({
      ...base,
      active_agent_id: activeTabId,

      agent_name: orUndefined(draft ? draft.name : agent.name),
      agent_description: orUndefined(
        draft ? draft.description : agent.description,
      ),
      agent_category: orUndefined(draft ? draft.category : agent.category),
      agent_tags: draft ? draft.tags : (agent.tags ?? []),
      agent_category_options: categoryOptions,

      agent_is_dirty: draft?.isDirty ?? false,
      agent_is_read_only: selectAgentAccessResolved(redux, activeTabId)
        ? selectAgentIsReadOnly(redux, activeTabId)
        : undefined,
      agent_is_active: agent.isActive,
      agent_is_favorite: agent.isFavorite,
      agent_is_archived: agent.isArchived,

      agent_model_name: orUndefined(
        selectModelNameById(redux, agent.modelId || "") || agent.modelId,
      ),
      agent_ownership: agentOwnershipLabel(agent),
      agent_default_rag_boost: agent.defaultRagBoost ?? undefined,
      agent_message_count: agent.messages?.length ?? undefined,
      agent_variable_count: agent.variableDefinitions?.length ?? undefined,
      agent_tool_count: toolCount,
      agent_organization_id: orUndefined(agent.organizationId),
      agent_task_id: orUndefined(agent.taskId),
    });
  }, [store]);

  return { getScope };
}
