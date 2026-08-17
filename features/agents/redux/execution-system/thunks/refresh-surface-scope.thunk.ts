"use client";

/**
 * Submit-time surface scope refresh.
 *
 * Managed launchers may create a conversation while the page is mounting,
 * before a person fills the surface's form. This thunk runs immediately before
 * execution, reads the live provider for the conversation's stamped surface,
 * re-resolves the same binding layers used at launch, and replaces the prior
 * surface-owned variable/context tier without recreating the conversation.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { toast } from "@/lib/toast";
import { getShortcutRecordFromState } from "@/features/agents/redux/agent-shortcuts/selectors";
import { mapScopeToInstanceWithSurface } from "@/features/agents/utils/scope-mapping";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { getSurfaceRuntimeForName } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { withBaselineScope } from "@/features/surfaces/utils/baseline-scope";
import { withSurfaceDocumentEvidence } from "@/features/surfaces/utils/document-evidence";
import { replaceSurfaceVariableValues } from "../instance-variable-values/instance-variable-values.slice";
import { replaceSurfaceContextEntries } from "../instance-context/instance-context.slice";
import {
  applyLaunchWritePolicies,
  prepareLaunchMappings,
  resolveLaunchMappingLayers,
} from "./surface-scope-mapping";

export interface RefreshSurfaceScopeResult {
  refreshed: boolean;
  surfaceName?: string;
  variableCount?: number;
  contextCount?: number;
  reason?: "no_conversation" | "no_agent" | "no_surface" | "no_provider";
}

export const refreshSurfaceScope = createAsyncThunk<
  RefreshSurfaceScopeResult,
  { conversationId: string },
  { state: RootState; dispatch: AppDispatch }
>(
  "instances/refreshSurfaceScope",
  async ({ conversationId }, { getState, dispatch }) => {
    const state = getState();
    const conversation = state.conversations.byConversationId[conversationId];
    if (!conversation) return { refreshed: false, reason: "no_conversation" };

    const agentId = conversation.agentId;
    if (!agentId) return { refreshed: false, reason: "no_agent" };

    const surfaceName = conversation.surfaceName ?? undefined;
    if (!surfaceName) return { refreshed: false, reason: "no_surface" };

    const runtime = getSurfaceRuntimeForName(surfaceName);
    if (!runtime) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[surfaces] submit-time scope refresh skipped for conversation "${conversationId}" — no live provider is mounted for "${surfaceName}"`,
        );
      }
      return { refreshed: false, surfaceName, reason: "no_provider" };
    }

    let applicationScope: ApplicationScope;
    try {
      const liveScope = await runtime.getScope();
      applicationScope = withSurfaceDocumentEvidence(
        surfaceName,
        withBaselineScope(liveScope),
      );
    } catch (error) {
      const message = `Could not read the live ${surfaceName} values. Nothing was sent.`;
      console.error(
        `[surfaces] submit-time getScope failed for conversation "${conversationId}" on "${surfaceName}"`,
        error,
      );
      toast.error(message);
      throw new Error(message, { cause: error });
    }

    const shortcut = conversation.shortcutId
      ? getShortcutRecordFromState(state, conversation.shortcutId)
      : undefined;
    let resolvedLayers;
    try {
      resolvedLayers = await resolveLaunchMappingLayers(
        agentId,
        surfaceName,
        shortcut ?? null,
      );
    } catch (error) {
      const message = `Could not refresh the ${surfaceName} agent binding. Nothing was sent.`;
      console.error(
        `[surfaces] submit-time binding refresh failed for conversation "${conversationId}" on "${surfaceName}"`,
        error,
      );
      toast.error(message);
      throw new Error(message, { cause: error });
    }
    applyLaunchWritePolicies(resolvedLayers, agentId, surfaceName);

    const agent = state.agentDefinition.agents?.[agentId];
    const displayMode =
      state.instanceUIState.byConversationId[conversationId]?.displayMode ??
      "direct";
    const surfaceMappings = resolvedLayers
      ? await prepareLaunchMappings({
          merged: resolvedLayers.merged,
          applicationScope,
          interactive:
            typeof window !== "undefined" &&
            displayMode !== "direct" &&
            displayMode !== "background",
          title: agent?.name ?? shortcut?.label ?? "Agent",
        })
      : {};

    const variableDefinitions =
      state.instanceVariableValues.byConversationId[conversationId]
        ?.definitions ?? [];
    const result = mapScopeToInstanceWithSurface(
      applicationScope,
      shortcut?.scopeMappings ?? null,
      surfaceMappings,
      variableDefinitions,
      agent?.contextPolicies ?? [],
      shortcut?.contextMappings ?? null,
    );

    if (result.errors.length > 0) {
      const message = result.errors.join("\n");
      console.error(
        `[surfaces] submit-time mapping failed for conversation "${conversationId}" on "${surfaceName}"`,
        result.errors,
      );
      toast.error(message);
      throw new Error(message);
    }
    if (result.warnings.length > 0) {
      console.warn(
        `[surfaces] submit-time mapping warnings for conversation "${conversationId}" on "${surfaceName}"`,
        result.warnings,
      );
    }
    if (result.pendingPrompts.length > 0) {
      console.error(
        `[surfaces] submit-time prompt mappings survived preparation for conversation "${conversationId}" on "${surfaceName}"`,
        result.pendingPrompts.map((prompt) => prompt.targetName),
      );
    }

    dispatch(
      replaceSurfaceVariableValues({
        conversationId,
        values: result.variableValues,
      }),
    );
    dispatch(
      replaceSurfaceContextEntries({
        conversationId,
        entries: result.contextEntries,
      }),
    );

    return {
      refreshed: true,
      surfaceName,
      variableCount: Object.keys(result.variableValues).length,
      contextCount: result.contextEntries.length,
    };
  },
);
