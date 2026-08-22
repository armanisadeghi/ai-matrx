"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useAppDispatch } from "@/lib/redux/hooks";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import {
  agentForPromptKey,
  type CodeEditorPromptKey,
} from "@/features/code-editor/agent-code-editor/agents";

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
  /** Explicit editing job (mandate key). Overrides `promptKey`. */
  mandateKey?: string;
  promptKey?: CodeEditorPromptKey;
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
  mandateKey,
  promptKey = "generic-code-editor",
  selection,
  context,
}: AICodeEditorModalV2Props) {
  const dispatch = useAppDispatch();
  const { launchMandate } = useAgentLauncher();
  const { close: closeCanvas } = useCanvas();

  const [hasOpened, setHasOpened] = useState(false);
  const conversationIdRef = useRef<string | null>(null);

  // The editing job is a MANDATE KEY; the DB decides which agent runs it.
  const defaultMandateKey =
    mandateKey || agentForPromptKey(promptKey).mandateKey;

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
          const result = await launchMandate(defaultMandateKey, {
            surfaceKey: `code-editor:${defaultMandateKey}`,
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
    defaultMandateKey,
    currentCode,
    selection,
    context,
    launchMandate,
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
