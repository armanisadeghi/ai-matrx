"use client";

/**
 * Runtime for `matrx-user/agent-advanced-editor` — the surface's FIRST
 * provider. Before this hook, the manifest declared a vocabulary that nothing
 * ever emitted and no write target could resolve against.
 *
 * Returns the two callbacks `AgentContentWindow` hands to
 * `<SurfaceRuntimeProvider>`: `getScope` (the read half, sampled when the user
 * hits Run) and `getWriteHandlers` (the write half, called only through
 * `applySurfaceWrite`).
 *
 * TWO THINGS THIS HOOK IS CAREFUL ABOUT
 *
 * 1. It reads Redux through the STORE, not `useAppSelector`. The window must
 *    not re-render on every keystroke of the agent it is editing, and a
 *    handler invoked at apply time needs state as it is THEN. Same reason
 *    `useAgentBuilderWriteHandlers` does it.
 *
 * 2. `agentId` and `activeTab` are read through REFS, not the render closure.
 *    This window can switch agents (the sidebar and the multi-agent tab strip)
 *    and switch tabs while an agent run is in flight, and when an agent stages
 *    several targets in one turn the seam resolves EVERY handler before the
 *    user confirms the first dialog. A handler closed over the render-time
 *    agent id would stage text into whichever agent was open when the tool
 *    call arrived, not the one on screen when the user pressed Apply.
 *
 * Every target is `mode: "draft"`. Writes go through the same actions the
 * user's own editing dispatches — `withAgentSystemInstruction` +
 * `setAgentMessages` for the prompt (so non-text blocks round-trip),
 * `setAgentOutputSchema` for the schema (the Output Schema tab's own Apply
 * path), `setAgentField` for the catalog fields. There is no second write
 * path, and nothing here touches the database: the footer Save is the user's.
 */

import { useCallback, useEffect, useRef } from "react";

import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createAgentAdvancedEditorScope } from "@/features/surfaces/manifests/agent-advanced-editor.manifest";
import {
  selectAgentAccessResolved,
  selectAgentById,
  selectAgentCategory,
  selectAgentDefinition,
  selectAgentDescription,
  selectAgentDirtyFields,
  selectAgentIsDirty,
  selectAgentIsReadOnly,
  selectAgentMessages,
  selectAgentName,
  selectAgentOutputSchema,
  selectAgentSystemMessage,
  selectAgentTags,
  selectAgentVariableDefinitions,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  setAgentField,
  setAgentMessages,
  setAgentOutputSchema,
} from "@/features/agents/redux/agent-definition/slice";
import {
  extractAgentSystemInstruction,
  withAgentSystemInstruction,
} from "@/features/agents/utils/agent-system-instruction";
import type { RootState } from "@/lib/redux/store";
import type { AgentContentTab } from "./agent-content.types";
import {
  parseCatalogProfile,
  parseOutputSchemaWrite,
  requireProseText,
} from "./agentAdvancedEditorWrite";

/**
 * Refuse before staging anything the user could never save — an edit that
 * looks applied and then evaporates is worse than a refusal.
 *
 * `accessResolved` gates the read-only check: while access metadata is still
 * in flight `isReadOnly` reads `false` for everyone, so we only refuse once we
 * actually know.
 */
function requireEditableAgent(state: RootState, agentId: string | null): string {
  if (!agentId) {
    throw new Error(
      "No agent is open in the Agent Advanced Editor — the window is showing the agent picker. Ask the user to open an agent first.",
    );
  }
  const record = selectAgentById(state, agentId);
  if (!record) {
    throw new Error(
      "The agent being edited has not finished loading — try again in a moment.",
    );
  }
  if (record.isVersion) {
    throw new Error(
      "This is a published version snapshot, which is read-only. Open the live agent to change it.",
    );
  }
  if (
    selectAgentAccessResolved(state, agentId) &&
    selectAgentIsReadOnly(state, agentId)
  ) {
    throw new Error(
      "This agent is shared with you as view-only, so changes cannot be saved here.",
    );
  }
  return agentId;
}

export interface AgentAdvancedEditorSurface {
  getScope: () => SurfaceScopePayload;
  getWriteHandlers: () => SurfaceWriteHandlers;
}

export function useAgentAdvancedEditorSurface(
  agentId: string | null,
  activeTab: AgentContentTab,
): AgentAdvancedEditorSurface {
  const store = useAppStore();
  const dispatch = useAppDispatch();

  // See rule 2 in the file docblock — handlers resolve before the user
  // confirms, so WHERE a value lands must be read live, never off the closure.
  const agentIdRef = useRef(agentId);
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    agentIdRef.current = agentId;
    activeTabRef.current = activeTab;
  });

  const getScope = useCallback((): SurfaceScopePayload => {
    const id = agentIdRef.current;
    const tab = activeTabRef.current;
    if (!id) return createAgentAdvancedEditorScope({ editor_field: tab });

    const state = store.getState();
    const definition = selectAgentDefinition(state, id);
    const outputSchema = selectAgentOutputSchema(state, id);
    const systemInstruction = extractAgentSystemInstruction(
      selectAgentSystemMessage(state, id),
    );

    // `editor_content` is the ONE large field the open tab edits — the prompt
    // on `system`, the whole definition on `json`. Every other tab edits a
    // structured control, not a body of text, so it stays empty there rather
    // than pretending the last tab's text is still on screen.
    const editorContent =
      tab === "system"
        ? systemInstruction
        : tab === "json" && definition
          ? JSON.stringify(definition, null, 2)
          : undefined;

    return createAgentAdvancedEditorScope({
      agent_id: id,
      agent_name: selectAgentName(state, id) ?? undefined,
      agent_description: selectAgentDescription(state, id) ?? undefined,
      agent_category: selectAgentCategory(state, id) ?? undefined,
      agent_tags: selectAgentTags(state, id) ?? undefined,

      system_instruction: systemInstruction,
      agent_output_schema:
        (outputSchema as Record<string, unknown> | null) ?? undefined,
      agent_variable_definitions:
        selectAgentVariableDefinitions(state, id) ?? undefined,

      editor_field: tab,
      editor_content: editorContent,
      is_dirty: selectAgentIsDirty(state, id),
      dirty_fields: Object.keys(selectAgentDirtyFields(state, id) ?? {}),
      agent_is_read_only: selectAgentAccessResolved(state, id)
        ? selectAgentIsReadOnly(state, id)
        : undefined,
    });
  }, [store]);

  const getWriteHandlers = useCallback((): SurfaceWriteHandlers => {
    /**
     * Stage new system-prompt text through the SAME helper + action the System
     * Prompt textarea dispatches on every keystroke, so attached non-text
     * blocks survive and the change shows whether or not that tab is mounted.
     */
    const setSystemInstruction = (text: string) => {
      const state = store.getState();
      const id = requireEditableAgent(state, agentIdRef.current);
      const messages = selectAgentMessages(state, id);
      if (!messages) {
        throw new Error(
          "The agent's messages have not finished loading — try again in a moment.",
        );
      }
      dispatch(
        setAgentMessages({
          id,
          messages: withAgentSystemInstruction(messages, text),
        }),
      );
    };

    return {
      editor_system_instruction: (value: unknown) => {
        setSystemInstruction(requireProseText(value, "editor_system_instruction"));
      },

      editor_append_system_instruction: (value: unknown) => {
        const addition = requireProseText(value, "editor_append_system_instruction");
        const state = store.getState();
        const existing =
          extractAgentSystemInstruction(
            selectAgentSystemMessage(state, agentIdRef.current ?? ""),
          ) ?? "";
        setSystemInstruction(
          existing.trim() ? `${existing.trimEnd()}\n\n${addition}` : addition,
        );
      },

      editor_output_schema: (value: unknown) => {
        // Validate BEFORE the editable check would matter — both throw, and
        // the shape error is the more useful one for the agent to hear first.
        const outputSchema = parseOutputSchemaWrite(value);
        const id = requireEditableAgent(store.getState(), agentIdRef.current);
        dispatch(setAgentOutputSchema({ id, outputSchema }));
      },

      editor_catalog_profile: (value: unknown) => {
        // Parse the WHOLE patch first: a bad `tags` array must not leave a new
        // description already staged. One confirm, one all-or-nothing write.
        const patch = parseCatalogProfile(value);
        const id = requireEditableAgent(store.getState(), agentIdRef.current);
        if (patch.description !== undefined) {
          dispatch(
            setAgentField({
              id,
              field: "description",
              value: patch.description,
            }),
          );
        }
        if (patch.category !== undefined) {
          dispatch(
            setAgentField({ id, field: "category", value: patch.category }),
          );
        }
        if (patch.tags !== undefined) {
          dispatch(setAgentField({ id, field: "tags", value: patch.tags }));
        }
      },
    };
  }, [store, dispatch]);

  return { getScope, getWriteHandlers };
}
