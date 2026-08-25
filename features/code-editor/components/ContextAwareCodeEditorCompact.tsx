"use client";

/**
 * ContextAwareCodeEditorCompact (V3 Compact)
 *
 * Code editor in a compact, draggable modal with full V3 features.
 * Rewired from the legacy prompt-execution system onto the agent execution system.
 *
 * Migration notes (applies the same recipe as ContextAwareCodeEditorModal):
 *   - ContextAwarePromptCompactModal → AgentRunner (conversationId-keyed)
 *   - PromptData / PromptMessage / PromptVariable types → dropped entirely
 *   - Supabase agent.definition fetch at open time → dropped (shortcut loads agent)
 *   - launchMandate drives launch with displayMode: "direct"
 *   - handleResponseComplete re-wired to selectStreamPhase === "complete" effect
 *   - handleContextUpdateReady/handleContextChange → setUserVariableValues
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

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { Badge } from "@/components/ui/badge";
import { AgentRunner } from "@/features/agents/components/smart/AgentRunner";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  selectStreamPhase,
  selectLatestAccumulatedText,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { useRetainLatestRequestForViewer } from "@/features/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import {
  agentForPromptKey,
  type CodeEditorPromptKey,
} from "@/features/code-editor/agent-code-editor/agents";
import { normalizeLanguage } from "@/features/code-editor/config/languages";
import {
  parseCodeEdits,
  validateEdits,
} from "@/features/code-editor/utils/parseCodeEdits";
import { applyCodeEdits } from "@/features/code-editor/utils/applyCodeEdits";
import { getDiffStats } from "@/features/code-editor/utils/generateDiff";
import { DYNAMIC_CONTEXT_VARIABLE } from "@/features/code-editor/utils/ContextVersionManager";

export interface ContextAwareCodeEditorCompactProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  language: string;
  /** Explicit editing job (mandate key). Overrides `promptKey`. */
  mandateKey?: string;
  promptKey?: CodeEditorPromptKey;
  onCodeChange: (newCode: string, version: number) => void;
  selection?: string;
  context?: string;
  title?: string;
  customMessage?: string;
  countdownSeconds?: number;
}

export function ContextAwareCodeEditorCompact({
  open,
  onOpenChange,
  code,
  language: rawLanguage,
  mandateKey,
  promptKey = "generic-code-editor",
  onCodeChange,
  selection,
  context,
  title = "AI Code Editor (Compact)",
  customMessage,
  countdownSeconds,
}: ContextAwareCodeEditorCompactProps) {
  const dispatch = useAppDispatch();
  const { launchMandate } = useAgentLauncher();
  const { open: openCanvas, close: closeCanvas } = useCanvas();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const hasLaunchedRef = useRef(false);

  const language = normalizeLanguage(rawLanguage);
  const currentCodeRef = useRef(code);
  const currentVersionRef = useRef(1);
  // The editing job is a MANDATE KEY; the DB decides which agent runs it.
  const defaultMandateKey =
    mandateKey || agentForPromptKey(promptKey).mandateKey;

  useEffect(() => {
    currentCodeRef.current = code;
  }, [code]);

  // ─── Stream phase watcher ────────────────────────────────────────────────────
  const streamPhase = useAppSelector((state) =>
    conversationId ? selectStreamPhase(conversationId)(state) : "idle",
  );

  const accumulatedTextSelector = useMemo(
    () =>
      conversationId ? selectLatestAccumulatedText(conversationId) : () => "",
    [conversationId],
  );
  const accumulatedText = useAppSelector(accumulatedTextSelector);

  // Live output is read straight off the conversation's newest request row
  // (no `MarkdownStream requestId=`), so this viewer retains the row for its
  // own mount lifetime — otherwise an owner reap mid-stream blanks it for good.
  // Doctrine: /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/LIVE-RUN-RETENTION.md.
  useRetainLatestRequestForViewer(conversationId, "ContextAwareCodeEditorCompact");

  const lastProcessedTextRef = useRef<string>("");

  // ─── Launch agent when modal opens ──────────────────────────────────────────

  useEffect(() => {
    if (!open || hasLaunchedRef.current) return;

    hasLaunchedRef.current = true;
    setIsLaunching(true);

    // Resolved INSIDE the launch funnel (agent + config_overrides); an
    // unresolvable mandate rejects loudly below — no hardcoded fallback.
    launchMandate(defaultMandateKey, {
      sourceFeature: "code-editor",
      surfaceKey: `code-editor-compact:${defaultMandateKey}`,
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
        "[ContextAwareCodeEditorCompact] Error launching agent:",
        err,
      );
      setIsLaunching(false);
      hasLaunchedRef.current = false;
    });
  }, [
    open,
    defaultMandateKey,
    code,
    selection,
    context,
    language,
    launchMandate,
  ]);

  // ─── Watch for stream completion → parse and show canvas ────────────────────

  useEffect(() => {
    if (streamPhase !== "complete" && streamPhase !== "error") return;
    if (!accumulatedText) return;
    if (accumulatedText === lastProcessedTextRef.current) return;

    lastProcessedTextRef.current = accumulatedText;
    handleResponseComplete(accumulatedText);
  }, [streamPhase, accumulatedText]); // handleResponseComplete stabilized via useCallback

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

  // ─── Response handler — same parse/canvas logic as the Modal variant ─────────

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

  if (isLaunching || !conversationId) {
    return null; // Loading state — same behavior as the old isLoadingPrompt || !promptData guard
  }

  return (
    <AgentRunner
      conversationId={conversationId}
      surfaceKey={`code-editor-compact:${conversationId}`}
      compact={true}
      showTitle={false}
    />
  );
}
