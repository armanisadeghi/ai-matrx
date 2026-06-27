// Phase 6 wrapper — replaced in Phase 15
//
// TODO(prompt-to-agent-sweep): Full swap to the agent system.
// Apply the same recipe documented at the top of
// `ContextAwareCodeEditorModal.tsx` — they share the canvas/parser flow
// and only differ in the chrome (compact draggable modal vs. standard
// dialog). Replace `<ContextAwarePromptCompactModal>` with the agent
// equivalent rendering `<AgentRunner conversationId={...} />` inside
// the compact wrapper, drive the launch via `useShortcutTrigger()` with
// `config: { displayMode: "direct" }`, and rewire
// `handleResponseComplete` to a `selectStreamPhase === "complete"`
// effect.
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
// This consumer + its sibling Modal block deletion of
// `features/prompts/**` until rewritten.
"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { Badge } from "@/components/ui/badge";
import { ContextAwarePromptCompactModal } from "@/features/prompts/components/results-display/ContextAwarePromptCompactModal";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { getBuiltinId } from "@/lib/redux/prompt-execution/builtins";
import { normalizeLanguage } from "@/features/code-editor/config/languages";
import {
  parseCodeEdits,
  validateEdits,
} from "@/features/code-editor/utils/parseCodeEdits";
import { applyCodeEdits } from "@/features/code-editor/utils/applyCodeEdits";
import { getDiffStats } from "@/features/code-editor/utils/generateDiff";
import { supabase } from "@/utils/supabase/client";
import { DYNAMIC_CONTEXT_VARIABLE } from "@/features/code-editor/utils/ContextVersionManager";
import type {
  PromptData,
  PromptMessage,
  PromptVariable,
} from "@/features/prompts/types/core";

function asPromptMessages(raw: unknown): PromptMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is PromptMessage =>
      m !== null &&
      typeof m === "object" &&
      "role" in m &&
      typeof (m as { role?: unknown }).role === "string" &&
      "content" in m &&
      typeof (m as { content?: unknown }).content === "string",
  );
}

function asPromptVariables(raw: unknown): PromptVariable[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is PromptVariable =>
      v !== null &&
      typeof v === "object" &&
      "name" in v &&
      typeof (v as { name?: unknown }).name === "string",
  );
}

export interface ContextAwareCodeEditorCompactProps {
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
 * ContextAwareCodeEditorCompact (V3 Compact)
 *
 * Code editor in a compact, draggable modal with full V3 features.
 *
 * Perfect for editing code while viewing the source - non-intrusive!
 *
 * Features:
 * - Compact draggable modal
 * - Side-by-side canvas when edits are made
 * - Full V3 context management
 * - Multi-turn editing
 * - Success states
 * - Can see source code while editing!
 */
export function ContextAwareCodeEditorCompact({
  open,
  onOpenChange,
  code,
  language: rawLanguage,
  builtinId,
  promptKey = "generic-code-editor",
  onCodeChange,
  selection,
  context,
  title = "AI Code Editor (Compact)",
  customMessage,
  countdownSeconds,
}: ContextAwareCodeEditorCompactProps) {
  const { open: openCanvas, close: closeCanvas } = useCanvas();

  const [promptData, setPromptData] = useState<PromptData | null>(null);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);

  const language = normalizeLanguage(rawLanguage);
  const currentCodeRef = useRef(code);
  const currentVersionRef = useRef(1);
  const updateContextRef = useRef<
    ((content: string, summary?: string) => void) | null
  >(null);
  const defaultBuiltinId = builtinId || getBuiltinId(promptKey);

  useEffect(() => {
    currentCodeRef.current = code;
  }, [code]);

  // Fetch agent definition when modal opens.
  // prompt_builtins migrated 1:1 to agent.definition (agent_type='builtin'), same UUIDs.
  // agent.definition uses `variable_definitions` instead of `variable_defaults`.
  useEffect(() => {
    if (open && !promptData) {
      setIsLoadingPrompt(true);

      (async () => {
        try {
          const { data: prompt, error } = await supabase
            .schema("agent")
            .from("definition")
            .select("*")
            .eq("id", defaultBuiltinId)
            .single();

          if (error || !prompt) {
            console.error("Failed to fetch agent definition:", error?.message);
            return;
          }

          const normalizedData: PromptData = {
            id: prompt.id,
            name: prompt.name,
            description: prompt.description ?? undefined,
            messages: asPromptMessages(prompt.messages),
            // agent.definition uses `variable_definitions` (same shape as old `variable_defaults`)
            variableDefaults: asPromptVariables(prompt.variable_definitions),
            settings: (prompt.settings as Record<string, unknown>) || {},
          };

          // Validate that agent has dynamic_context variable
          const hasDynamicContext = normalizedData.variableDefaults?.some(
            (v) => v.name === DYNAMIC_CONTEXT_VARIABLE,
          );

          if (!hasDynamicContext) {
            console.warn(
              `⚠️  Agent "${normalizedData.name}" doesn't have "${DYNAMIC_CONTEXT_VARIABLE}" variable.`,
              `Context versioning will not work. Please add this variable to the agent definition.`,
            );
          }

          setPromptData(normalizedData);
        } catch (err) {
          console.error("Error loading agent definition:", err);
        } finally {
          setIsLoadingPrompt(false);
        }
      })();
    }
  }, [open, defaultBuiltinId, promptData]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setPromptData(null);
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

            // Canvas will show success state with options to close or continue
          },
          onDiscard: () => {
            // Just close canvas, keep conversation open
            closeCanvas();
          },
          onCloseModal: () => {
            // Close the compact modal so user can see their updated code
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
    [language, openCanvas, closeCanvas, onCodeChange, onOpenChange],
  );

  // Handle context version changes (for logging/verification)
  const handleContextChange = useCallback(
    (newContent: string, version: number) => {
      // Note: We manage version in onApply, this is just for logging
    },
    [],
  );

  // Receive the updateContext function from ContextAwarePromptRunner
  const handleContextUpdateReady = useCallback(
    (updateFn: (content: string, summary?: string) => void) => {
      updateContextRef.current = updateFn;
    },
    [],
  );

  if (!open) return null;

  // Show loading state or the compact modal
  if (isLoadingPrompt || !promptData) {
    return null; // Could show a loading indicator if needed
  }

  return (
    <ContextAwarePromptCompactModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      promptData={promptData}
      executionConfig={{
        auto_run: false,
        allow_chat: true,
        show_variables: false,
        apply_variables: true,
        track_in_runs: true,
        use_pre_execution_input: false,
      }}
      initialContext={code}
      contextType="code"
      contextLanguage={language}
      staticVariables={{
        ...(selection && { selection }),
        ...(context && { context }),
      }}
      title={title}
      onResponseComplete={handleResponseComplete}
      onContextChange={handleContextChange}
      onContextUpdateReady={handleContextUpdateReady}
      customMessage={customMessage}
      countdownSeconds={countdownSeconds}
    />
  );
}
