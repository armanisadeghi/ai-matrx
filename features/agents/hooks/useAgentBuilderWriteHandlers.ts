/**
 * Write half of the `matrx-user/agent-builder` surface — the handlers behind
 * the manifest's `writeTargets`.
 *
 * Every handler dispatches the SAME Redux action the user's own editing
 * dispatches, so an agent-applied value is indistinguishable from a typed one:
 * it marks the record dirty, lights the save pill, and rides the builder's
 * undo history. Nothing here touches supabase and nothing persists on its own
 * — the builder has no DB autosave, so the user still presses Save
 * (`saveAgent`). See the writeTargets block in
 * `features/surfaces/manifests/agent-builder.manifest.ts`.
 *
 * - `agent_name` / `agent_description` / `agent_tags` → `setAgentField`, the
 *   slice's canonical user-field-edit action.
 * - `system_instruction` → `setAgentMessages`, rebuilding the system message
 *   exactly the way `SystemMessage.handleTextChange` does (first text block
 *   replaced, non-text blocks round-tripped untouched, non-system messages
 *   preserved in order).
 *
 * Handlers validate and THROW on a bad shape — the writeback seam turns a
 * throw into a safe error envelope the agent reads and can correct. Nothing is
 * silently coerced.
 *
 * Usage (mirrors `useAgentBuilderSurfaceScope`):
 *
 *   const getWriteHandlers = useAgentBuilderWriteHandlers(agentId);
 *   <SurfaceRuntimeProvider … isEditable getWriteHandlers={getWriteHandlers} />
 */

import { useCallback } from "react";

import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  setAgentField,
  setAgentMessages,
} from "@/features/agents/redux/agent-definition/slice";
import {
  selectAgentMessages,
  selectAgentSystemMessage,
} from "@/features/agents/redux/agent-definition/selectors";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { AgentDefinitionMessage } from "@/features/agents/types/agent-message-types";

/** Longest name the builder's own name input accepts as reasonable. */
const MAX_AGENT_NAME_LENGTH = 120;

/**
 * Returns the `getWriteHandlers` callback for the agent-builder surface.
 * Reads through the store (not `useAppSelector`) so the returned builder is
 * stable and each handler call sees the live definition — the fresh-closures
 * contract `getWriteHandlers` expects.
 */
export function useAgentBuilderWriteHandlers(
  agentId: string | undefined,
): () => SurfaceWriteHandlers {
  const store = useAppStore();
  const dispatch = useAppDispatch();

  return useCallback((): SurfaceWriteHandlers => {
    if (!agentId) return {};

    /** Guard shared by every handler — the builder can mount pre-hydration. */
    const requireAgent = () => {
      const messages = selectAgentMessages(store.getState(), agentId);
      if (!messages)
        throw new Error(
          "The agent definition has not finished loading yet — try again in a moment.",
        );
      return messages;
    };

    const setField = (
      field: keyof AgentDefinition,
      value: AgentDefinition[keyof AgentDefinition],
    ) => {
      requireAgent();
      dispatch(setAgentField({ id: agentId, field, value }));
    };

    return {
      agent_name: (value: unknown) => {
        if (typeof value !== "string" || !value.trim())
          throw new Error("agent_name expects a non-empty string.");
        if (value.trim().length > MAX_AGENT_NAME_LENGTH)
          throw new Error(
            `agent_name must be ${MAX_AGENT_NAME_LENGTH} characters or fewer.`,
          );
        setField("name", value.trim());
      },

      agent_description: (value: unknown) => {
        if (typeof value !== "string")
          throw new Error("agent_description expects a string.");
        setField("description", value);
      },

      agent_tags: (value: unknown) => {
        if (
          !Array.isArray(value) ||
          !value.every((tag) => typeof tag === "string" && tag.trim())
        )
          throw new Error(
            "agent_tags expects an array of non-empty strings (the FULL replacement tag set; pass [] to clear).",
          );
        setField(
          "tags",
          (value as string[]).map((tag) => tag.trim()),
        );
      },

      system_instruction: (value: unknown) => {
        if (typeof value !== "string" || !value.trim())
          throw new Error(
            "system_instruction expects a non-empty string — the FULL replacement instruction text.",
          );
        const messages = requireAgent();
        const systemMessage = selectAgentSystemMessage(
          store.getState(),
          agentId,
        );
        const nonSystemMessages = messages.filter((m) => m.role !== "system");

        // Non-text blocks (files, images) carry no instruction text and are
        // round-tripped untouched, exactly as the textarea write-back does.
        // MATRX-EXCEPTION: generic multi-type block list, narrowed at write-back only.
        const rawBlocks = (systemMessage?.content ??
          []) as unknown as Record<string, unknown>[];
        const preservedNonText = rawBlocks.filter(
          (b) => b.type !== "text",
        ) as unknown as AgentDefinitionMessage["content"];

        const newContent: AgentDefinitionMessage["content"] = [
          { type: "text", text: value },
          ...preservedNonText,
        ];

        dispatch(
          setAgentMessages({
            id: agentId,
            messages: [
              { role: "system", content: newContent },
              ...nonSystemMessages,
            ],
          }),
        );
      },
    };
  }, [store, dispatch, agentId]);
}
