"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import type {
  JsonExtractionConfig,
  ManagedAgentOptions,
  SourceFeature,
} from "@/features/agents/types/instance.types";
import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";

/**
 * Options accepted by `useShortcutTrigger()` and `useShortcut()`.
 *
 * The common case only sets `scope`; everything else falls back to sensible
 * defaults.
 */
export interface TriggerShortcutOptions {
  /**
   * UI-provided scope data. Keys are matched against the shortcut's
   * scopeMappings / contextMappings at launch time.
   *
   * Common keys: selection, content, context, text_before, text_after,
   * cursor_position, file_path, file_name, language. Custom keys work too.
   */
  scope?: ApplicationScope;

  /**
   * Stable surface key for the focus/registry. Default: `shortcut:<id>`.
   * Override if multiple independent triggers coexist on the same screen
   * and should be tracked separately.
   */
  surfaceKey?: string;

  /**
   * Required — which surface launched this run (`code-editor`, `pdf-extractor`, …).
   * Never use vague fallbacks like `"programmatic"` or `"context-menu"`.
   */
  sourceFeature: SourceFeature;

  /**
   * Caller-supplied overrides layered on top of the shortcut's persisted
   * config. Keys here win over the stored `AgentExecutionConfig`.
   */
  config?: Partial<
    import("@/features/agents/types/agent-execution-config.types").AgentExecutionConfig
  >;

  /**
   * Opt-in structured-JSON extraction during streaming. When provided,
   * processStream runs a StreamingJsonTracker and the results land in the
   * active-requests slice (`selectFirstExtractedObject`, etc.).
   */
  jsonExtraction?: JsonExtractionConfig;

  /**
   * Additional runtime values (widgetHandleId, originalText, userInput).
   * `applicationScope` is set automatically from `scope`; set it here only
   * if you want to bypass the convenience param.
   */
  runtime?: Omit<
    import("@/features/agents/types/agent-execution-config.types").AgentExecutionRuntime,
    "applicationScope"
  > & { applicationScope?: ApplicationScope };

  /**
   * Fires as soon as the instance has been created, BEFORE the stream
   * starts. Use this to mount streaming UI selectors keyed to the
   * conversationId immediately — waiting for the awaited Promise means
   * the UI sits dead for the full duration of the stream (30–60s).
   */
  onConversationCreated?: (conversationId: string) => void;

  /**
   * Escape hatch — anything else on `ManagedAgentOptions`. Rarely needed.
   * Takes precedence over the convenience fields above if both are set.
   */
  extra?: Partial<ManagedAgentOptions>;
}

/**
 * Minimal hook for triggering any agent shortcut by id.
 *
 * ```tsx
 * const trigger = useShortcutTrigger();
 * await trigger("863b28c4-...", {
 *   scope: { selection: "hello" },
 *   sourceFeature: "notes",
 * });
 * ```
 *
 * Under the hood this dispatches `launchAgentExecution`, which handles:
 *  - Creating the instance from the shortcut (config + runtime merge)
 *  - Seeding variables + context entries + LLM overrides + default user input
 *  - Applying scopeMappings and contextMappings
 *  - Opening the configured display-mode overlay (or running in "direct" mode)
 *
 * Returns a promise that resolves with `{ conversationId, displayMode }`.
 */
export function useShortcutTrigger() {
  const dispatch = useAppDispatch();

  return useCallback(
    (shortcutId: string, options: TriggerShortcutOptions) => {
      const {
        scope,
        surfaceKey,
        sourceFeature,
        config,
        runtime,
        jsonExtraction,
        onConversationCreated,
        extra,
      } = options;

      const mergedRuntime: ManagedAgentOptions["runtime"] | undefined = (() => {
        if (!scope && !runtime) return undefined;
        return {
          ...(scope ? { applicationScope: scope } : {}),
          ...(runtime ?? {}),
        };
      })();

      const payload: ManagedAgentOptions = {
        shortcutId,
        surfaceKey: surfaceKey ?? `shortcut:${shortcutId}`,
        sourceFeature,
        ...(config ? { config } : {}),
        ...(mergedRuntime ? { runtime: mergedRuntime } : {}),
        ...(onConversationCreated ? { onConversationCreated } : {}),
        ...(jsonExtraction ? { jsonExtraction } : {}),
        ...(extra ?? {}),
      };

      return dispatch(launchAgentExecution(payload)).unwrap();
    },
    [dispatch],
  );
}

/**
 * Pre-bound convenience — returns a function that runs a specific shortcut.
 *
 * ```tsx
 * const runExplain = useShortcut("863b28c4-...");
 * <button onClick={() => runExplain({ scope: { selection: text }, sourceFeature: "notes" })}>Explain</button>
 * ```
 */
export function useShortcut(shortcutId: string) {
  const trigger = useShortcutTrigger();
  return useCallback(
    (options: TriggerShortcutOptions) => trigger(shortcutId, options),
    [trigger, shortcutId],
  );
}
