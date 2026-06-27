// Phase 6 wrapper — replaced in Phase 15
//
// prompt_builtins fetch dropped: the fetched data was never used in launch
// params (only as a load gate). The agent id is 1:1 with the old builtin id
// so `launchAgent(defaultBuiltinId, …)` is correct as-is.
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useAppDispatch } from "@/lib/redux/hooks";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { getBuiltinId } from "@/lib/redux/prompt-execution/builtins";

/**
 * AICodeEditorModalV2
 *
 * Code editor that leverages the agent execution system.
 * Supports multi-turn conversations with automatic code edit detection.
 *
 * Flow:
 * 1. User describes changes
 * 2. AI responds with edits
 * 3. Canvas opens with diff preview
 * 4. User applies changes
 * 5. Conversation continues with updated code
 * 6. Repeat
 */

export interface AICodeEditorModalV2Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCode: string;
  language: string;
  builtinId?: string;
  promptKey?:
    | "prompt-app-ui-editor"
    | "generic-code-editor"
    | "code-editor-dynamic-context";
  onCodeChange: (newCode: string) => void;
  selection?: string;
  context?: string;
  title?: string;
  description?: string;
  allowPromptSelection?: boolean;
}

export function AICodeEditorModalV2({
  open,
  currentCode,
  builtinId,
  promptKey = "generic-code-editor",
  selection,
  context,
}: AICodeEditorModalV2Props) {
  const dispatch = useAppDispatch();
  const { launchAgent } = useAgentLauncher();
  const { close: closeCanvas } = useCanvas();

  const [hasOpened, setHasOpened] = useState(false);
  const conversationIdRef = useRef<string | null>(null);

  // Agent id equals the old prompt_builtins id — migration preserved UUIDs 1:1
  const defaultBuiltinId = builtinId || getBuiltinId(promptKey);

  const closePrompt = useCallback(() => {
    if (conversationIdRef.current) {
      dispatch(destroyInstanceIfAllowed(conversationIdRef.current));
      conversationIdRef.current = null;
    }
  }, [dispatch]);

  // Launch the agent when the modal opens
  useEffect(() => {
    if (open && !hasOpened) {
      setHasOpened(true);

      (async () => {
        try {
          const result = await launchAgent(defaultBuiltinId, {
            surfaceKey: `code-editor:${defaultBuiltinId}`,
            sourceFeature: "code-editor",
            config: {
              displayMode: "modal-full",
              autoRun: false,
              allowChat: true,
              showPreExecutionGate: false,
            },
            runtime: {
              variables: {
                current_code: currentCode,
                content: currentCode,
                ...(selection && { selection }),
                ...(context && { context }),
              },
            },
          });
          conversationIdRef.current = result.conversationId;
        } catch (error) {
          console.error("Error launching agent:", error);
        }
      })();
    }
  }, [
    open,
    hasOpened,
    defaultBuiltinId,
    currentCode,
    selection,
    context,
    launchAgent,
  ]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setHasOpened(false);
      closePrompt();
      closeCanvas();
    }
  }, [open, closePrompt, closeCanvas]);

  return null;
}
