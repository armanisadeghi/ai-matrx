"use client";

/**
 * ContextAwareCodeEditorModal (V3)
 *
 * Advanced code editor with dynamic context version management.
 * Rewired from the legacy prompt-execution system onto the agent execution system.
 *
 * Migration notes:
 *   - ContextAwarePromptRunner → AgentRunner (conversationId-keyed)
 *   - getBuiltinPrompt / selectCachedPrompt → dropped; agent loads via shortcut
 *   - PromptData → dropped; agent definitions live in agentDefinition slice
 *   - runId/sessionKey machinery → conversationId from useShortcutTrigger
 *   - handleContextUpdateReady/handleContextChange → setUserVariableValues
 *   - completeExecutionThunk → dropped (agent stream handles completion natively)
 *   - selectStreamPhase === "complete" replaces selectIsResponseEndedForInstance
 *
 * Key features:
 * - Maintains versioned code context via dynamic_context variable
 * - Injects only current version per message
 * - Replaces old versions with tombstones via setUserVariableValues
 * - Prevents context window bloat
 * - Supports unlimited edit iterations
 *
 * Requirements:
 * - Agent MUST have a `dynamic_context` variable (same as before; same UUIDs)
 *
 * Flow:
 * 1. User describes changes
 * 2. AI responds with edits (using current code from `dynamic_context`)
 * 3. Canvas shows diff preview
 * 4. User applies → version increments, dynamic_context updated
 * 5. Repeat infinitely without context bloat!
 */

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
import { AgentRunner } from "@/features/agents/components/smart/AgentRunner";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useShortcutTrigger } from "@/features/agents/hooks/useShortcutTrigger";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  selectStreamPhase,
  selectLatestAccumulatedText,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { agentForPromptKey } from "@/features/code-editor/agent-code-editor/agents";
import { normalizeLanguage } from "@/features/code-editor/config/languages";
import {
  parseCodeEdits,
  validateEdits,
} from "@/features/code-editor/utils/parseCodeEdits";
import { applyCodeEdits } from "@/features/code-editor/utils/applyCodeEdits";
import { getDiffStats } from "@/features/code-editor/utils/generateDiff";
import { DYNAMIC_CONTEXT_VARIABLE } from "@/features/code-editor/utils/ContextVersionManager";

// Shortcut IDs that map to code-editor agents (same mapping as useAICodeEditor)
const SHORTCUT_FOR_AGENT: Record<string, string> = {
  "87efa869-9c11-43cf-b3a8-5b7c775ee415":
    "00836ba6-10af-4a95-8c7e-6b5a03c0b3e4",
  "970856c5-3b9d-4034-ac9d-8d8a11fb3dba":
    "2c301ba1-e870-4a3f-abe6-8148c72a7425",
  "c1c1f092-ba0d-4d6c-b352-b22fe6c48272":
    "6231578b-a52d-47c5-a41d-831000ddfa9e",
};

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
  const trigger = useShortcutTrigger();
  const { open: openCanvas, close: closeCanvas } = useCanvas();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const hasLaunchedRef = useRef(false);

  const language = normalizeLanguage(rawLanguage);
  const currentCodeRef = useRef(code);
  const currentVersionRef = useRef(1);
  const defaultBuiltinId = builtinId || agentForPromptKey(promptKey).id;

  useEffect(() => {
    currentCodeRef.current = code;
  }, [code]);

  // ─── Stream phase watcher — replaces the old isResponseEnded / completeExecutionThunk ──
  const streamPhase = useAppSelector((state) =>
    conversationId ? selectStreamPhase(conversationId)(state) : "idle",
  );

  // Accumulated text from the latest agent request
  const accumulatedTextSelector = useMemo(
    () =>
      conversationId ? selectLatestAccumulatedText(conversationId) : () => "",
    [conversationId],
  );
  const accumulatedText = useAppSelector(accumulatedTextSelector);

  // Track whether we've already processed a given completion
  const lastProcessedTextRef = useRef<string>("");

  // ─── Launch agent when modal opens ──────────────────────────────────────────

  useEffect(() => {
    if (!open || hasLaunchedRef.current) return;

    const shortcutId = SHORTCUT_FOR_AGENT[defaultBuiltinId];
    if (!shortcutId) {
      console.error(
        `[ContextAwareCodeEditorModal] No shortcut registered for agent id "${defaultBuiltinId}".`,
      );
      return;
    }

    hasLaunchedRef.current = true;
    setIsLaunching(true);

    trigger(shortcutId, {
      sourceFeature: "code-editor",
      surfaceKey: `code-editor-modal:${shortcutId}`,
      config: {
        displayMode: "direct",
        autoRun: false,
        allowChat: true,
        showPreExecutionGate: false,
        showVariablePanel: false,
      },
      runtime: {
        variables: {
          [DYNAMIC_CONTEXT_VARIABLE]: code,
          current_code: code,
          content: code,
          ...(selection ? { selection } : {}),
          ...(context ? { context } : {}),
        },
        applicationScope: {
          context: {
            [DYNAMIC_CONTEXT_VARIABLE]: code,
            current_code: code,
            content: code,
            ...(selection ? { selection } : {}),
            ...(context ? { context } : {}),
            language,
          },
        },
      },
      onConversationCreated: (cid) => {
        setConversationId(cid);
        setIsLaunching(false);
      },
    }).catch((err) => {
      console.error(
        "[ContextAwareCodeEditorModal] Error launching agent:",
        err,
      );
      setIsLaunching(false);
      hasLaunchedRef.current = false;
    });
  }, [open, defaultBuiltinId, code, selection, context, language, trigger]);

  // ─── Watch for stream completion → parse and show canvas ────────────────────

  useEffect(() => {
    if (streamPhase !== "complete" && streamPhase !== "error") return;
    if (!accumulatedText) return;
    if (accumulatedText === lastProcessedTextRef.current) return;

    lastProcessedTextRef.current = accumulatedText;
    handleResponseComplete(accumulatedText);
  }, [streamPhase, accumulatedText]); // handleResponseComplete is stable via useCallback

  // ─── Reset when modal closes ─────────────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      if (conversationId) {
        dispatch(destroyInstanceIfAllowed(conversationId));
      }
      setConversationId(null);
      hasLaunchedRef.current = false;
      lastProcessedTextRef.current = "";
      currentVersionRef.current = 1;
      closeCanvas();
    }
  }, [open, conversationId, closeCanvas, dispatch]);

  // ─── Response handler — same parse/canvas logic as before ───────────────────

  const handleResponseComplete = useCallback(
    (response: string) => {
      if (!response) return;

      const parsed = parseCodeEdits(response);

      if (!parsed.success || parsed.edits.length === 0) {
        return;
      }

      const validation = validateEdits(currentCodeRef.current, parsed.edits);

      if (!validation.valid) {
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

      const result_apply = applyCodeEdits(currentCodeRef.current, parsed.edits);

      if (!result_apply.success) {
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
      const diffStats = getDiffStats(currentCodeRef.current, newCode);
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

      openCanvas({
        type: "code_preview",
        data: {
          originalCode: currentCodeRef.current,
          modifiedCode: newCode,
          language,
          edits: parsed.edits,
          explanation: parsed.explanation,
          onApply: () => {
            const nextVersion = currentVersionRef.current + 1;
            currentVersionRef.current = nextVersion;

            // Update the dynamic_context variable so the agent sees the new code
            // on the next turn — replaces the old updateContextRef.current() call
            if (conversationId) {
              dispatch(
                setUserVariableValues({
                  conversationId,
                  values: {
                    [DYNAMIC_CONTEXT_VARIABLE]: newCode,
                    current_code: newCode,
                    content: newCode,
                  },
                }),
              );
            }

            currentCodeRef.current = newCode;
            onCodeChange(newCode, nextVersion);
          },
          onDiscard: () => {
            closeCanvas();
          },
          onCloseModal: () => {
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
    [
      language,
      openCanvas,
      closeCanvas,
      onCodeChange,
      onOpenChange,
      conversationId,
      dispatch,
    ],
  );

  if (!open) return null;

  const content =
    isLaunching || !conversationId ? (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-muted-foreground">Loading editor...</div>
        </div>
      </div>
    ) : (
      <AgentRunner
        conversationId={conversationId}
        surfaceKey={`code-editor-modal:${conversationId}`}
        compact={false}
        showTitle={!!title}
      />
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[90dvh] p-0 gap-0">
        {content}
      </DialogContent>
    </Dialog>
  );
}
