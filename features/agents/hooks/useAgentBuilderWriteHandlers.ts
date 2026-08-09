"use client";

/**
 * Write handlers for `matrx-user/agent-builder` — the receiving end of the
 * surface's `writeTargets` (declared in
 * `features/surfaces/manifests/agent-builder.manifest.ts`).
 *
 * This is the highest-stakes write surface in the product: an agent authoring
 * another agent's system prompt. Three rules keep it safe, and all three are
 * enforced here rather than trusted to the caller:
 *
 *  1. EVERY handler validates and THROWS on a bad shape. The writeback seam
 *     (`applySurfaceWrite`) converts a throw into a loud, captured error
 *     envelope the agent reads back — a wrong value is the agent's error to
 *     hear about, never something we silently coerce into the editor.
 *  2. Nothing bypasses the canonical edit path. The system instruction goes
 *     through `withAgentSystemInstruction` + `setAgentMessages` — the exact
 *     pair the System Prompt textarea dispatches on every keystroke. The
 *     identity fields go through `setAgentField`, the same action the settings
 *     form's own save path uses. There is no second write path.
 *  3. Read-only records refuse. Staging edits into an agent the user cannot
 *     save would look like it worked and then silently evaporate.
 *
 * All targets are `mode: "draft"`: they mark the builder record dirty and the
 * user still presses Save. Nothing here touches the database.
 *
 * Registered by `AgentBuilderClient` on its `SurfaceRuntimeProvider`
 * (`getWriteHandlers`), so the targets are wired for the whole builder route —
 * desktop and mobile, whichever panel or tab happens to be open.
 */

import { useCallback } from "react";

import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  selectAgentAccessResolved,
  selectAgentById,
  selectAgentIsReadOnly,
  selectAgentMessages,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  setAgentField,
  setAgentMessages,
} from "@/features/agents/redux/agent-definition/slice";
import {
  extractAgentSystemInstruction,
  withAgentSystemInstruction,
} from "@/features/agents/utils/agent-system-instruction";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { RootState } from "@/lib/redux/store";

/** A non-empty string, trimmed — or a throw naming the target. */
function requireText(value: unknown, target: string): string {
  if (typeof value !== "string") {
    throw new Error(`${target} expects a string value.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${target} expects a non-empty string.`);
  }
  return trimmed;
}

/**
 * Refuse before staging anything the user could never save. `accessResolved`
 * gates the check: while access metadata is still in flight `isReadOnly` reads
 * `false` for everyone, so we only refuse once we actually know.
 */
function requireEditableAgent(state: RootState, agentId: string) {
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
  return record;
}

/**
 * Returns the `getWriteHandlers` callback for the agent-builder surface.
 *
 * Reads through the store rather than `useAppSelector` for the same reason
 * `useAgentBuilderSurfaceScope` does: the builder must not re-render on every
 * keystroke of the agent it is editing, and a handler invoked at apply time
 * needs the state as it is THEN, not as it was at the last render.
 */
export function useAgentBuilderWriteHandlers(
  agentId: string,
): () => Record<string, (value: unknown) => void> {
  const store = useAppStore();
  const dispatch = useAppDispatch();

  return useCallback(() => {
    /** Stage a single agent-definition field the way the user's own edit does. */
    const patchField = <K extends keyof AgentDefinition>(
      field: K,
      value: AgentDefinition[K],
    ) => {
      requireEditableAgent(store.getState(), agentId);
      dispatch(setAgentField({ id: agentId, field, value }));
    };

    /**
     * Stage new system-prompt text through the SAME helper + action the System
     * Prompt textarea uses, so non-text blocks survive and the editor shows the
     * change immediately whether or not that component is currently mounted.
     */
    const setSystemInstruction = (text: string) => {
      const state = store.getState();
      requireEditableAgent(state, agentId);
      const messages = selectAgentMessages(state, agentId);
      if (!messages) {
        throw new Error(
          "The agent's messages have not finished loading — try again in a moment.",
        );
      }
      dispatch(
        setAgentMessages({
          id: agentId,
          messages: withAgentSystemInstruction(messages, text),
        }),
      );
    };

    return {
      system_instruction: (value: unknown) => {
        setSystemInstruction(requireText(value, "system_instruction"));
      },

      append_system_instruction: (value: unknown) => {
        const addition = requireText(value, "append_system_instruction");
        const state = store.getState();
        const existing =
          extractAgentSystemInstruction(
            selectAgentMessages(state, agentId)?.find(
              (m) => m.role === "system",
            ),
          ) ?? "";
        setSystemInstruction(
          existing.trim() ? `${existing.trimEnd()}\n\n${addition}` : addition,
        );
      },

      agent_description: (value: unknown) => {
        patchField("description", requireText(value, "agent_description"));
      },

      agent_name: (value: unknown) => {
        patchField("name", requireText(value, "agent_name"));
      },

      agent_category: (value: unknown) => {
        patchField("category", requireText(value, "agent_category"));
      },

      agent_tags: (value: unknown) => {
        // Full replacement, empty array allowed (that is how tags get cleared).
        // Tags are free text — there is no vocabulary constant to check
        // against, so shape is all we can honestly enforce.
        if (!Array.isArray(value)) {
          throw new Error(
            "agent_tags expects an array of tag strings (pass [] to clear all tags).",
          );
        }
        const tags = value.map((entry, index) => {
          if (typeof entry !== "string" || !entry.trim()) {
            throw new Error(
              `agent_tags[${index}] must be a non-empty string; got ${JSON.stringify(entry)}.`,
            );
          }
          return entry.trim();
        });
        patchField("tags", tags);
      },
    };
  }, [store, dispatch, agentId]);
}
