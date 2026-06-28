// Phase 6 wrapper — replaced in Phase 15
//
// TODO(prompt-to-agent-sweep): Full swap to the agent system.
//
// Concrete steps:
//   1. Replace `<ContextAwarePromptRunner runId promptId promptSource …>`
//      with `<AgentRunner conversationId={conversationId} />`.
//   2. Drop `getBuiltinPrompt`, `selectCachedPrompt`, the local
//      `promptData` selector, `runId`/`sessionKey` machinery, and the
//      `defaultBuiltinId` lookup; replace with `useShortcutTrigger()`.
//   3. On modal open, `await trigger(SHORTCUT_ID, {
//          sourceFeature: "code-editor",
//          surfaceKey: `code-editor-modal:${SHORTCUT_ID}`,
//          config: { displayMode: "direct", autoRun: false, allowChat: true },
//          onConversationCreated: setConversationId,
//          runtime: {
//            applicationScope: { selection, content: code, context },
//          },
//      })`.
//      The shortcut row already targets the right agent — `displayMode`
//      override is needed because each existing shortcut is configured
//      `modal-full` (we want our own Dialog chrome).
//   4. Move `handleResponseComplete` from a callback prop to a
//      `useEffect` that watches `selectStreamPhase(conversationId) ===
//      "complete"` + reads
//      `selectLatestAccumulatedText(conversationId)`. Re-enter the
//      same parser/canvas flow.
//   5. `handleContextUpdateReady` / `handleContextChange` go away once
//      the dynamic-context variable lives in agent variable state.
//      Update via `setInstanceVariableValue({ conversationId, name:
//      "dynamic_context", value })` from the
//      `instance-variable-values` slice — same effect, different key.
//   6. Cleanup: `dispatch(destroyInstanceIfAllowed(conversationId))`
//      on close.
//
// Existing shortcuts (modal-full default — override at trigger time):
//   - generic-code-editor agent
//     (87efa869-9c11-43cf-b3a8-5b7c775ee415) → shortcut
//     00836ba6-10af-4a95-8c7e-6b5a03c0b3e4 ("Master Code Editor")
//   - code-editor-dynamic-context agent
//     (970856c5-3b9d-4034-ac9d-8d8a11fb3dba) → shortcut
//     2c301ba1-e870-4a3f-abe6-8148c72a7425 ("Dynamic Context Code
//     Editor")
//   - prompt-app-ui-editor agent
//     (c1c1f092-ba0d-4d6c-b352-b22fe6c48272) → shortcut
//     6231578b-a52d-47c5-a41d-831000ddfa9e ("Update Prompt App Code")
//
// Until executed, this consumer keeps `features/prompts/**` alive.
"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ContextAwarePromptRunner } from "@/features/prompts/components/results-display/ContextAwarePromptRunner";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { getBuiltinPrompt } from "@/lib/redux/thunks/promptSystemThunks";
import { selectCachedPrompt } from "@/lib/redux/slices/promptCacheSlice";
import { agentForPromptKey } from "@/features/code-editor/agent-code-editor/agents";
import { normalizeLanguage } from "@/features/code-editor/config/languages";
import {
  parseCodeEdits,
  validateEdits,
} from "@/features/code-editor/utils/parseCodeEdits";
import { applyCodeEdits } from "@/features/code-editor/utils/applyCodeEdits";
import { getDiffStats } from "@/features/code-editor/utils/generateDiff";
import { DYNAMIC_CONTEXT_VARIABLE } from "@/features/code-editor/utils/ContextVersionManager";
import type { PromptData } from "@/features/prompts/types/core";
import { v4 as uuidv4 } from "uuid";

export interface ContextAwareCodeEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  language: string;
  builtinId?: string;
  promptKey?:
    | "prompt-app-ui-editor"
    | "generic-code-editor"
    | "code-editor-dynamic-context";
  onCodeChange: (newCode: string, version: number) => void;
  selection?: string;
  context?: string;
  title?: string;
  customMessage?: string;
  countdownSeconds?: number;
}

/**
 * ContextAwareCodeEditorModal (V3)
 *
 * Advanced code editor with dynamic context version management.
 *
 * Key features:
 * - Maintains versioned code context
 * - Injects only current version per message
 * - Replaces old versions with tombstones
 * - Prevents context window bloat
 * - Supports unlimited edit iterations
 *
 * Requirements:
 * - Builtin prompt MUST have a `dynamic_context` variable
 * - This signals the system to use version management
 *
 * Flow:
 * 1. User describes changes
 * 2. AI responds with edits (using current code from `dynamic_context`)
 * 3. Canvas shows diff preview
 * 4. User applies → version increments, old version tombstoned
 * 5. Repeat infinitely without context bloat!
 */
export function ContextAwareCodeEditorModal({
  open,
  onOpenChange,
  code,
  language: rawLanguage,
  builtinId,
  promptKey = "generic-code-editor",
  onCodeChange,
  selection,
  context,
  title = "AI Code Editor (Context-Aware)",
  customMessage = "Describe the specific code changes you want to make.",
  countdownSeconds,
}: ContextAwareCodeEditorModalProps) {
  const dispatch = useAppDispatch();
  const { open: openCanvas, close: closeCanvas } = useCanvas();

  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);

  // Track a key to reset runId when modal reopens
  const [sessionKey, setSessionKey] = useState(0);

  // Generate new runId when modal opens (based on sessionKey)
  const runId = useMemo(() => uuidv4(), [sessionKey]);

  // Reset session when modal closes and reopens
  useEffect(() => {
    if (open) {
      setSessionKey((prev) => prev + 1);
    }
  }, [open]);

  const language = normalizeLanguage(rawLanguage);
  const currentCodeRef = useRef(code);
  const currentVersionRef = useRef(1);
  const updateContextRef = useRef<
    ((content: string, summary?: string) => void) | null
  >(null);
  const defaultBuiltinId = builtinId || agentForPromptKey(promptKey).id;

  // Use centralized prompt cache
  const promptData = useAppSelector((state) => {
    const cached = selectCachedPrompt(state, defaultBuiltinId);
    if (!cached) return null;

    return {
      id: cached.id,
      name: cached.name,
      description: cached.description,
      messages: cached.messages,
      variableDefaults: cached.variableDefaults,
      settings: cached.settings,
    } as PromptData;
  });

  useEffect(() => {
    currentCodeRef.current = code;
  }, [code]);

  // Fetch builtin prompt using centralized system
  useEffect(() => {
    if (open && !promptData) {
      setIsLoadingPrompt(true);

      dispatch(getBuiltinPrompt({ promptId: defaultBuiltinId }))
        .unwrap()
        .then(({ promptData: fetchedPrompt }) => {
          // Validate that prompt has dynamic_context variable
          const hasDynamicContext = fetchedPrompt.variableDefaults?.some(
            (v) => v.name === DYNAMIC_CONTEXT_VARIABLE,
          );

          if (!hasDynamicContext) {
            console.warn(
              `⚠️  Prompt "${fetchedPrompt.name}" doesn't have "${DYNAMIC_CONTEXT_VARIABLE}" variable.`,
              `Context versioning will not work. Please add this variable to the prompt.`,
            );
          }
        })
        .catch((err) => {
          console.error("Error loading builtin prompt:", err);
        })
        .finally(() => {
          setIsLoadingPrompt(false);
        });
    }
  }, [open, defaultBuiltinId, promptData, dispatch]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      closeCanvas();
    }
  }, [open, closeCanvas]);

  const handleResponseComplete = useCallback(
    (result: any) => {
      const { response } = result;

      if (!response) return;

      // Try to parse code edits from the response
      const parsed = parseCodeEdits(response);

      // No edits found - just continue the conversation
      if (!parsed.success || parsed.edits.length === 0) {
        return;
      }

      // Validate edits against current code
      const validation = validateEdits(currentCodeRef.current, parsed.edits);

      if (!validation.valid) {
        // Show validation errors in canvas
        openCanvas({
          type: "code_edit_error",
          data: {
            errors: validation.errors,
            warnings: validation.warnings,
            rawResponse: response,
            onClose: () => closeCanvas(),
          },
          metadata: {
            title: "Code Edit Error",
          },
        });
        return;
      }

      // Apply edits to generate preview
      const result_apply = applyCodeEdits(currentCodeRef.current, parsed.edits);

      if (!result_apply.success) {
        // Show application errors in canvas
        openCanvas({
          type: "code_edit_error",
          data: {
            errors: result_apply.errors,
            warnings: result_apply.warnings || [],
            rawResponse: response,
            onClose: () => closeCanvas(),
          },
          metadata: {
            title: "Code Edit Error",
          },
        });
        return;
      }

      const newCode = result_apply.code || "";

      // Get diff stats for the title
      const diffStats = getDiffStats(currentCodeRef.current, newCode);

      // Build rich title with badges and colors
      const editsCount = parsed.edits.length;
      const titleNode = (
        <>
          <span className="truncate">Code Preview</span>
          {editsCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 px-1.5 font-normal"
            >
              {editsCount} edit{editsCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {diffStats && (
            <>
              <Badge
                variant="outline"
                className="text-[10px] h-5 px-1.5 text-green-600 border-green-600 bg-green-50 dark:bg-green-950/30 font-normal"
              >
                +{diffStats.additions}
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] h-5 px-1.5 text-red-600 border-red-600 bg-red-50 dark:bg-red-950/30 font-normal"
              >
                -{diffStats.deletions}
              </Badge>
            </>
          )}
        </>
      );

      // Success! Open canvas with code preview
      openCanvas({
        type: "code_preview",
        data: {
          originalCode: currentCodeRef.current,
          modifiedCode: newCode,
          language,
          edits: parsed.edits,
          explanation: parsed.explanation,
          onApply: () => {
            // Increment version BEFORE calling onCodeChange
            const nextVersion = currentVersionRef.current + 1;
            currentVersionRef.current = nextVersion;

            // Call the context update function to add tombstone for old version
            if (updateContextRef.current) {
              updateContextRef.current(
                newCode,
                parsed.explanation || "Applied code edits",
              );
            }

            // Update our ref so next edits work on the new code
            currentCodeRef.current = newCode;

            // Update the code in parent component with the NEW version
            onCodeChange(newCode, nextVersion);

            // Canvas will now show success state with options to close or continue
          },
          onDiscard: () => {
            // Just close canvas, keep conversation open
            closeCanvas();
          },
          onCloseModal: () => {
            // Close the entire modal so user can see their updated code
            onOpenChange(false);
          },
        },
        metadata: {
          title: titleNode as ReactNode,
          subtitle:
            parsed.explanation && parsed.explanation.length < 100
              ? parsed.explanation
              : undefined,
        },
      });
    },
    [language, openCanvas, closeCanvas, onCodeChange],
  );

  // Handle context version changes (for logging/verification)
  const handleContextChange = useCallback(
    (newContent: string, version: number) => {
      // Note: We manage version in onApply, this is just for logging
      // and verifying the ContextVersionManager is in sync
    },
    [],
  );

  // Receive the updateContext function from ContextAwarePromptRunner
  const handleContextUpdateReady = useCallback(
    (updateFn: (content: string, summary?: string) => void) => {
      updateContextRef.current = updateFn;
      console.log("✅ Context update function ready");
    },
    [],
  );

  if (!open) return null;

  // Shared content component
  const content = isLoadingPrompt ? (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="text-muted-foreground">Loading prompt...</div>
      </div>
    </div>
  ) : promptData ? (
    <ContextAwarePromptRunner
      runId={runId}
      promptId={defaultBuiltinId}
      // TODO(prompt-to-agent-sweep): `promptSource="prompt_builtins"`
      // pins this consumer to the legacy prompt runner. Replace
      // `<ContextAwarePromptRunner>` with the agent-native equivalent
      // and pass the same id as an agent id (1:1 from the migration).
      promptSource="prompt_builtins"
      initialContext={code}
      contextType="code"
      contextLanguage={language}
      staticVariables={{
        ...(selection && { selection }),
        ...(context && { context }),
      }}
      executionConfig={{
        auto_run: false,
        allow_chat: true,
        show_variables: false,
        apply_variables: true,
        track_in_runs: true,
        use_pre_execution_input: false,
      }}
      onResponseComplete={handleResponseComplete}
      onContextChange={handleContextChange}
      onContextUpdateReady={handleContextUpdateReady}
      title={title}
      onClose={() => onOpenChange(false)}
    />
  ) : (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-muted-foreground">
        Failed to load prompt
      </div>
    </div>
  );

  // Standard display needs Dialog wrapper
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[90dvh] p-0 gap-0">
        {content}
      </DialogContent>
    </Dialog>
  );
}
