/**
 * Non-React helper for triggering an agent shortcut from anywhere.
 *
 * Use this from:
 *  - Redux thunks (you already have `dispatch`)
 *  - Non-component utility modules (import `getStore()` from lib/redux/store)
 *  - Event handlers outside the React tree (e.g. keyboard shortcut registry)
 *
 * In React components, prefer `useShortcutTrigger()` — it handles the
 * dispatch plumbing for you.
 */

import type { AppDispatch } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import type {
  JsonExtractionConfig,
  ManagedAgentOptions,
  SourceFeature,
} from "@/features/agents/types/instance.types";
import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";
import type {
  AgentExecutionConfig,
  AgentExecutionRuntime,
} from "@/features/agents/types/agent-execution-config.types";

export interface TriggerShortcutArgs {
  shortcutId: string;
  scope?: ApplicationScope;
  surfaceKey?: string;
  /** Required — name the calling surface (`pdf-extractor`, `code-editor`, …). */
  sourceFeature: SourceFeature;
  config?: Partial<AgentExecutionConfig>;
  runtime?: Omit<AgentExecutionRuntime, "applicationScope"> & {
    applicationScope?: ApplicationScope;
  };
  jsonExtraction?: JsonExtractionConfig;
  /** Fires as soon as the instance is created, before the stream runs. */
  onConversationCreated?: (conversationId: string) => void;
  extra?: Partial<ManagedAgentOptions>;
}

/**
 * Trigger an agent shortcut by id with minimal boilerplate.
 *
 * ```ts
 * // In a thunk:
 * await triggerShortcut(dispatch, {
 *   shortcutId,
 *   scope: { selection },
 *   sourceFeature: "notes",
 * });
 *
 * // Anywhere (will lazy-import the store):
 * import { getStore } from "@/lib/redux/store-singleton";
 * await triggerShortcut(getStore()!.dispatch, { shortcutId, scope });
 * ```
 *
 * Returns the launch result `{ conversationId, displayMode }`.
 */
export function triggerShortcut(
  dispatch: AppDispatch,
  args: TriggerShortcutArgs,
) {
  const {
    shortcutId,
    scope,
    surfaceKey,
    sourceFeature,
    config,
    runtime,
    jsonExtraction,
    onConversationCreated,
    extra,
  } = args;

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
    ...(jsonExtraction ? { jsonExtraction } : {}),
    ...(onConversationCreated ? { onConversationCreated } : {}),
    ...(extra ?? {}),
  };

  return dispatch(launchAgentExecution(payload)).unwrap();
}
