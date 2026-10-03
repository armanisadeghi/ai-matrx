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
import type { ChatDispatch, ChatRootState } from "../../../../store/root-state";
import { toast } from "../../../../host/notify";
import { getShortcutRecordFromState } from "../../agent-shortcuts/selectors";
import { mapScopeToInstanceWithSurface } from "../../../utils/scope-mapping";
import type { ApplicationScope } from "../../../types/scope.types";
import {
  getSurfaceRuntimeForName,
  wasPageOwnConversationOf,
  wasSurfaceMountedThisSession,
} from "../../../../surfaces/runtime/SurfaceRuntimeContext";
import { getManifest } from "../../../../surfaces/runtime/registry";
import { withBaselineScope } from "../../../../surfaces/utils/baseline-scope";
import { withLiveSurfaceContext } from "../../../../surfaces/runtime/surface-chain";
import { isPageOwnConversation } from "../../../../surfaces/runtime/SurfaceRuntimeContext";
import { withSurfaceDocumentEvidence } from "../../../../surfaces/utils/document-evidence";
import { alwaysOnSurfaceKeys } from "../../../../surfaces/utils/always-on-context";
import { replaceSurfaceVariableValues } from "../instance-variable-values/instance-variable-values.slice";
import {
  replaceSurfaceContextEntries,
  setContextEntries,
} from "../instance-context/instance-context.slice";
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
  reason?:
    | "no_conversation"
    | "no_agent"
    | "no_surface"
    | "no_provider"
    | "own_page_conversation";
}

export const refreshSurfaceScope = createAsyncThunk<
  RefreshSurfaceScopeResult,
  { conversationId: string; composerText?: string },
  { state: ChatRootState; dispatch: ChatDispatch }
>(
  "instances/refreshSurfaceScope",
  async ({ conversationId, composerText = "" }, { getState, dispatch }) => {
    const state = getState();
    const conversation = state.conversations.byConversationId[conversationId];
    if (!conversation) return { refreshed: false, reason: "no_conversation" };

    const agentId = conversation.agentId;
    if (!agentId) return { refreshed: false, reason: "no_agent" };

    const surfaceName = conversation.surfaceName ?? undefined;
    if (!surfaceName) return { refreshed: false, reason: "no_surface" };
    // A page's OWN conversation (the main chat, builder, runner, battle lane)
    // never receives the page as context — even when an older launch stamped
    // a surface on it. See `isPageOwnConversation`.
    if (isPageOwnConversation(conversationId))
      return { refreshed: false, reason: "own_page_conversation" };

    const runtime = getSurfaceRuntimeForName(surfaceName);
    if (!runtime) {
      if (getManifest(surfaceName)?.requiresBeforeExecute) {
        const message = `Nothing was sent. Open the ${surfaceName} surface before sending so its current-turn evidence can be prepared.`;
        console.error(
          `[surfaces] required submit-time provider missing for conversation "${conversationId}" on "${surfaceName}"`,
        );
        toast.error("Could not prepare this message", { description: message });
        throw new Error(message);
      }
      // THE SCREEN CLOSED (a window shut, the person navigated away): its
      // launch-time values must not keep riding every turn as if it were
      // still open. Replace the surface tier with what IS open now — the
      // surface chain and any unregistered window — plus a plain statement
      // that the conversation's own screen is gone (register ARE-010). A
      // surface that never mounted a provider in this session (server-emitted)
      // keeps its launch context, as before.
      // A page's OWN conversation never hears that its page "closed": its page
      // is never its context. A route swap (/chat/new → /chat/<id>) unmounts
      // the page's provider and mounts the next one, and in between the
      // provider is simply absent — never a closed screen. Whatever page tier
      // it carries is dropped instead of being replaced by a closing notice.
      if (wasPageOwnConversationOf(conversationId, surfaceName)) {
        dispatch(replaceSurfaceContextEntries({ conversationId, entries: [] }));
        dispatch(replaceSurfaceVariableValues({ conversationId, values: {} }));
        return { refreshed: false, surfaceName, reason: "own_page_conversation" };
      }
      // An engineered run never saw the page; the screens open now are not
      // its inputs either (W-31). Its mapped values stay as they were.
      if (conversation.engineeredInputs) {
        return { refreshed: false, surfaceName, reason: "no_provider" };
      }
      if (wasSurfaceMountedThisSession(surfaceName)) {
        const label = getManifest(surfaceName)?.label ?? surfaceName;
        const live = await withLiveSurfaceContext(surfaceName, {
          surface_closed: `${label} (${surfaceName}), where this conversation started, has been closed. Its earlier values are gone; what is open now is listed in surface_chain and window_forms.`,
        });
        const closedResult = mapScopeToInstanceWithSurface(live, null, {}, [], [], null);
        dispatch(
          replaceSurfaceContextEntries({
            conversationId,
            entries: closedResult.contextEntries,
          }),
        );
        return {
          refreshed: true,
          surfaceName,
          variableCount: 0,
          contextCount: closedResult.contextEntries.length,
        };
      }
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[surfaces] submit-time scope refresh skipped for conversation "${conversationId}" — no live provider is mounted for "${surfaceName}"`,
        );
      }
      return { refreshed: false, surfaceName, reason: "no_provider" };
    }

    let preparation;
    try {
      preparation = await runtime.beforeExecute?.({
        conversationId,
        composerText,
      });
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : `Could not prepare the live ${surfaceName} context.`;
      const message = `Nothing was sent. ${detail}`;
      console.error(
        `[surfaces] submit-time preparation failed for conversation "${conversationId}" on "${surfaceName}"`,
        error,
      );
      toast.error("Could not prepare this message", { description: message });
      throw new Error(message, { cause: error });
    }

    let applicationScope: ApplicationScope;
    try {
      const liveScope = await runtime.getScope();
      // Each follow-up turn sees what is open NOW — the surface chain and
      // any unregistered window (features/surfaces/runtime/surface-chain.ts).
      applicationScope = withSurfaceDocumentEvidence(
        surfaceName,
        await withLiveSurfaceContext(surfaceName, withBaselineScope(liveScope)),
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
          surfaceName,
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
      {
        alwaysOnKeys: alwaysOnSurfaceKeys(surfaceName, applicationScope),
        // Per-launch mappings and an unloaded shortcut are invisible here;
        // the launch's stamp carries them (W-31).
        engineered: conversation.engineeredInputs === true,
      },
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
    // A value the agent has no labelled slot for would show its raw key
    // ("board_items") on the composer's context pill; the surface's manifest
    // names every value it declares, so a person reads "Items on the board".
    const valueLabels = new Map(
      (getManifest(surfaceName)?.values ?? []).map((v) => [v.name, v.label]),
    );
    dispatch(
      replaceSurfaceContextEntries({
        conversationId,
        surfaceName,
        entries: result.contextEntries.map((e) =>
          e.label === e.key && valueLabels.has(e.key)
            ? { ...e, label: valueLabels.get(e.key) ?? e.key }
            : e,
        ),
      }),
    );
    if (preparation?.contextEntries?.length) {
      dispatch(
        setContextEntries({
          conversationId,
          entries: preparation.contextEntries,
          surfaceName,
        }),
      );
    }

    return {
      refreshed: true,
      surfaceName,
      variableCount: Object.keys(result.variableValues).length,
      contextCount:
        result.contextEntries.length +
        (preparation?.contextEntries?.length ?? 0),
    };
  },
);
