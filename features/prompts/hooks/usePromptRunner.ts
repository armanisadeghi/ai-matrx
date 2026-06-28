/**
 * usePromptRunner Hook
 *
 * Centralized hook for opening/closing prompt runner modals via Redux.
 * Replaces the need for local state management (usePromptRunnerModal).
 *
 * Features:
 * - Automatic prompt caching (fetch once per session)
 * - Global modal management (single instance)
 * - Simple API (just call openPrompt)
 * - No prop drilling or local state
 *
 * @example
 * ```tsx
 * const { openPrompt, closePrompt, isOpen } = usePromptRunner();
 *
 * // Open with prompt ID (auto-caches) - New execution config
 * openPrompt({
 *   promptId: 'text-analyzer',
 *   executionConfig: {
 *     auto_run: true,
 *     allow_chat: true,
 *     show_variables: false,
 *     apply_variables: true
 *   },
 *   variables: { text: selectedText }
 * });
 *
 * // Open with prompt data (skip cache)
 * openPrompt({
 *   promptData: myPrompt,
 *   executionConfig: {
 *     auto_run: false,
 *     allow_chat: true,
 *     show_variables: true,
 *     apply_variables: false
 *   },
 *   variables: { topic: 'AI' }
 * });
 *
 * // Close modal
 * closePrompt();
 * ```
 */

"use client";

import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  closePromptModal,
  selectIsPromptModalOpen,
  selectPromptModalConfig,
} from "@/lib/redux/slices/promptRunnerSlice";
import type { PromptRunnerModalConfig } from "../types/modal";
import type {
  ResultDisplay,
  PromptExecutionConfig,
} from "@/features/prompt-builtins/types/execution-modes";

export interface OpenPromptOptions extends Omit<
  PromptRunnerModalConfig,
  "executionConfig"
> {
  /** NEW: Specify which UI to show (defaults to 'modal-full') */
  result_display?: ResultDisplay;

  /** NEW: Which table to fetch prompt from (defaults to 'prompts') */
  promptSource?: "prompts" | "prompt_builtins";

  /** NEW: Execution configuration with separate flags */
  executionConfig?: Omit<PromptExecutionConfig, "result_display">;

  /** Display variant for PromptRunner (standard | compact) */
  displayVariant?: "standard" | "compact";

  /** Inline-specific: text manipulation callbacks */
  onTextReplace?: (text: string) => void;
  onTextInsertBefore?: (text: string) => void;
  onTextInsertAfter?: (text: string) => void;
  originalText?: string;

  /** Sidebar-specific: position and size */
  sidebarPosition?: "left" | "right";
  sidebarSize?: "sm" | "md" | "lg";

  /** Callback for non-UI executions */
  onExecutionComplete?: (result: { response: string; metadata?: any }) => void;
}

export interface UsePromptRunnerReturn {
  /** Open a prompt with any display type */
  openPrompt: (options: OpenPromptOptions) => Promise<void>;

  /** Close the active prompt runner modal */
  closePrompt: () => void;

  /** Is the prompt modal currently open */
  isOpen: boolean;

  /** Current modal configuration (if open) */
  config: PromptRunnerModalConfig | null;
}

/**
 * Hook for managing prompt runner modals via Redux
 * NOW SUPPORTS ALL 7 DISPLAY TYPES via result_display parameter
 */
export function usePromptRunner(): UsePromptRunnerReturn {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectIsPromptModalOpen);
  const config = useAppSelector(selectPromptModalConfig);

  const openPrompt = useCallback(
    async (options: OpenPromptOptions) => {
      const {
        result_display = "modal-full",
        executionConfig = {
          auto_run: true,
          allow_chat: true,
          show_variables: false,
          apply_variables: true,
          track_in_runs: true,
          use_pre_execution_input: false,
        },
        ...restOptions
      } = options;

      await dispatch(
        openPromptExecution({
          ...restOptions,
          result_display,
          executionConfig,
        }),
      ).unwrap();
    },
    [dispatch],
  );

  const closePromptModalHandler = useCallback(() => {
    // Note: OverlayController passes responseText when closing; this is for manual/programmatic closes
    dispatch(closePromptModal(undefined));
  }, [dispatch]);

  return {
    openPrompt,
    closePrompt: closePromptModalHandler,
    isOpen,
    config,
  };
}

/**
 * Simplified function to open a prompt imperatively
 * For use outside of React components
 */
export function openPromptImperative(
  dispatch: any,
  options: OpenPromptOptions,
): Promise<void> {
  const {
    result_display = "modal-full",
    executionConfig = {
      auto_run: true,
      allow_chat: true,
      show_variables: false,
      apply_variables: true,
      track_in_runs: true,
      use_pre_execution_input: false,
    },
    ...restOptions
  } = options;

  return dispatch(
    openPromptExecution({
      ...restOptions,
      result_display,
      executionConfig,
    }),
  ).unwrap();
}
