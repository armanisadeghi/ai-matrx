"use client";

/**
 * useKindActionRunner — binds the host runtime into the app's ONE action
 * registry (`@ai-matrx/alchemy`, provider `content-ir.kind-actions`) and
 * returns the ONE function a kind component calls to trigger a capability:
 * `runAction(key, input) => Promise<KindActionResult>`.
 *
 * This is the safety choke point that makes "trigger anything" safe to hand to
 * imperfect, agent-authored component code:
 *
 *  - It NEVER throws. An unknown action key, a handler that rejects, a bad
 *    input — all resolve to a `{ ok:false, error }` envelope plus a toast and a
 *    captured error. A component that mis-calls it keeps rendering.
 *  - It binds ONLY the capability-scoped context (the launcher, the acting
 *    user). The component never receives supabase, redux, or fetch — the
 *    sandbox data-reach boundary is untouched. Side effects run here, in the
 *    host, gated by the host.
 *  - It guards duplicate in-flight calls per action key, so a double-click or a
 *    re-render storm can't fire an agent (spend) twice.
 *
 * The provider is registered on the registry from a layout effect (and again,
 * idempotently, at run time); `key` runs the programmatic registry Action
 * `kind.<key>` through alchemy's `invokeAction`.
 */

import { useCallback, useLayoutEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  emitKindInteraction,
  type KindInteractionEvent,
} from "../kind-interaction";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useAgentLauncher } from "@ai-matrx/chat/agents/hooks/useAgentLauncher";
import { useFloatingRunWindow } from "@ai-matrx/chat/agents/hooks/useFloatingAgentRun";
import { triggerShortcut } from "@ai-matrx/chat/agents/utils/trigger-shortcut";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { openFilePreview } from "@/features/files/components/preview/openFilePreview";
import {
  livePosture,
  runHeadlessAgentJson,
  type HeadlessAgentJsonResult,
} from "@ai-matrx/chat/agents/redux/execution-system/thunks/run-headless-agent-json";
import { selectConversationOrganizationId } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type {
  KindActionContext,
  KindActionResult,
  KindImageRef,
  KindItemStateHandle,
  KindShortcutExpect,
  KindShortcutRequest,
  KindShortcutRunResult,
} from "./kind-action-context";
import { kindActionId, kindActionProvider } from "./kind-action-provider";
import { invokeAction } from "@ai-matrx/alchemy/actions";
import { useOptionalAlchemyActions } from "@ai-matrx/alchemy/react/host";
import { ensureInvokedProvider } from "./invoked-actions";

export type RunKindAction = (
  key: string,
  input: unknown,
) => Promise<KindActionResult>;

/**
 * The in-flight identity for the double-fire guard.
 *
 * Keying by action key ALONE turns one slow action into a global lock: an
 * `apply_surface_write` whose policy is `ask` holds the key for as long as the
 * user reads the dialog, and every OTHER write from every block on every
 * surface is refused meanwhile. So the guard keys by action + target when the
 * input names one. Still per-target-idempotent (a double-click can't fire an
 * agent or a write twice), without the cross-talk.
 */
function inFlightKey(key: string, input: unknown): string {
  if (input && typeof input === "object") {
    const target = (input as { target?: unknown }).target;
    if (typeof target === "string" && target) return `${key}::${target}`;
    const agentId = (input as { agentId?: unknown }).agentId;
    if (typeof agentId === "string" && agentId) return `${key}::${agentId}`;
    // One shortcut may run for several ideas at once; one idea's save key may not.
    const saveAs = (input as { saveAs?: unknown }).saveAs;
    if (typeof saveAs === "string" && saveAs) return `${key}::save:${saveAs}`;
    const shortcutId = (input as { shortcutId?: unknown }).shortcutId;
    if (typeof shortcutId === "string" && shortcutId) return `${key}::${shortcutId}`;
  }
  return key;
}

/**
 * `origin` — the shape in a chat answer this runner acts for. When given, a
 * write the person applies to a surface (`apply_surface_write`) also rides
 * their next message as the shape's interaction chip (kind-interaction.ts).
 */
export type KindActionOrigin = Omit<KindInteractionEvent, "state" | "previous" | "data">;

export interface KindActionRunnerOptions {
  /** The rendered item's durable state (`save_item_state`, `run_shortcut` saveAs). */
  itemState?: KindItemStateHandle | null;
}

/**
 * The first generated image of a media run, by durable identity. An image
 * model's product is a media block (`expect: "media"`), never answer text; the
 * file lives in the run's own organization, named on every later byte read.
 */
export function imageRefOfMedia(media: unknown, organizationId: string | null): KindImageRef | null {
  if (!Array.isArray(media)) return null;
  for (const item of media) {
    if (!item || typeof item !== "object") continue;
    const block = item as Record<string, unknown>;
    const fileId = typeof block.fileId === "string" ? block.fileId : null;
    const mime = typeof block.mimeType === "string" ? block.mimeType : null;
    const isImage = block.kind === "image" || (mime?.startsWith("image/") ?? false);
    if (!fileId || !isImage) continue;
    return {
      file_id: fileId,
      mime_type: mime,
      width: typeof block.width === "number" ? block.width : null,
      height: typeof block.height === "number" ? block.height : null,
      organization_id: organizationId,
    };
  }
  return null;
}

/** Every kind-launched shortcut names this surface (telemetry + attribution). */
const KIND_SHORTCUT_SOURCE = "ai-results" as const;

export function useKindActionRunner(
  origin?: KindActionOrigin,
  options: KindActionRunnerOptions = {},
): RunKindAction {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const liveWindow = useFloatingRunWindow();
  const itemStateRef = useRef(options.itemState ?? null);
  itemStateRef.current = options.itemState ?? null;
  const originRef = useRef(origin);
  originRef.current = origin;
  const { launchAgent } = useAgentLauncher();
  const userId = useAppSelector(selectUserId);
  const inFlight = useRef<Set<string>>(new Set());
  const actions = useOptionalAlchemyActions();
  const registry = actions?.registry ?? null;
  const ports = actions?.ports ?? null;
  useLayoutEffect(() => {
    if (registry) ensureInvokedProvider(registry, kindActionProvider);
  }, [registry]);

  return useCallback<RunKindAction>(
    async (key, input) => {
      if (!registry || !ports) {
        // Rendered outside the app's action host: honest, never a crash.
        const error = `"${key}" can't run here: actions aren't available on this page.`;
        toast.error(error);
        captureError({
          source: "content-ir",
          message: `[kind-action] "${key}" invoked outside <AlchemyActionsProvider>`,
          raw: { key },
        });
        return { ok: false, error };
      }
      ensureInvokedProvider(registry, kindActionProvider);
      const guardKey = inFlightKey(key, input);
      if (inFlight.current.has(guardKey)) {
        return { ok: false, error: `"${key}" is already running.` };
      }
      inFlight.current.add(guardKey);

      try {
        const openShortcut = async (request: KindShortcutRequest) => {
          const launched = await triggerShortcut(dispatch, {
            shortcutId: request.shortcutId,
            scope: request.scope,
            surfaceKey: `kind-action:run_shortcut:${request.shortcutId}`,
            sourceFeature: KIND_SHORTCUT_SOURCE,
            config: { autoRun: true },
            runtime: {
              ...(request.variables ? { variables: request.variables } : {}),
              ...(request.userInput !== undefined ? { userInput: request.userInput } : {}),
            },
          });
          return { conversationId: launched.conversationId };
        };
        const runShortcut = async (
          request: KindShortcutRequest & { expect: KindShortcutExpect },
          onResult?: (result: KindShortcutRunResult) => void,
        ): Promise<KindShortcutRunResult> => {
          const live = liveWindow.start(request.label ?? "Working on it");
          const toResult = (r: HeadlessAgentJsonResult): KindShortcutRunResult => {
            if (request.expect === "image") {
              const organizationId = r.conversationId
                ? selectConversationOrganizationId(r.conversationId)(store.getState())
                : null;
              const image = r.success ? imageRefOfMedia(r.data, organizationId) : null;
              return image
                ? { ok: true, data: image }
                : { ok: false, data: null, error: r.error ?? "The shortcut finished without an image." };
            }
            return r.success ? { ok: true, data: r.data } : { ok: false, data: null, error: r.error };
          };
          let settled: KindShortcutRunResult | null = null;
          const run = await runHeadlessAgentJson(dispatch, store.getState, {
            shortcutId: request.shortcutId,
            ...(request.scope ? { applicationScope: request.scope } : {}),
            ...(request.variables ? { variables: request.variables } : {}),
            ...(request.userInput !== undefined ? { userInput: request.userInput } : {}),
            surfaceKey: `kind-action:run_shortcut:${request.shortcutId}`,
            sourceFeature: KIND_SHORTCUT_SOURCE,
            initiation: "user",
            // The component hands the shortcut everything it needs as scope
            // values; the page around it never leaks in.
            surfaceName: null,
            // An image model answers with a media block, never text.
            expect: request.expect === "image" ? "media" : request.expect,
            ...livePosture(live.bind),
            onResult: (r) => {
              settled = toResult(r);
              onResult?.(settled);
            },
          });
          const outcome = settled ?? toResult(run);
          // A launch refused before any stream leaves the window saying why.
          live.settle(run.errorDetail ?? run.error ?? "The run could not start.");
          return outcome;
        };
        const context: KindActionContext = {
          launchAgent,
          userId,
          openShortcut,
          runShortcut,
          itemState: itemStateRef.current,
          openFile: (fileId) => openFilePreview(fileId),
          shareFile: (fileId, name) =>
            dispatch(
              openOverlay({
                overlayId: "shareModalWindow",
                data: { resourceType: "file", resourceId: fileId, resourceName: name },
              }),
            ),
        };
        const outcome = await invokeAction<KindActionResult>(
          registry,
          kindActionId(key),
          input,
          { ports, context },
        );
        if (!outcome.ok && outcome.error.code === "not_registered") {
          const error = `No action registered for "${key}".`;
          toast.error(error);
          captureError({
            source: "content-ir",
            message: `[kind-action] component invoked unknown action "${key}"`,
            raw: { key },
          });
          return { ok: false, error };
        }
        if (!outcome.ok) {
          const message = outcome.error.message || `Action "${key}" failed.`;
          // `action_failed` is already captured + announced once by alchemy's
          // invokeAction (ports.notify); announce here only otherwise.
          if (outcome.error.code !== "action_failed" || !ports.notify) toast.error(message);
          captureError({
            source: "content-ir",
            message: `[kind-action] action "${key}" failed (${outcome.error.code}): ${message}`,
            raw: { key, error: outcome.error },
          });
          return { ok: false, error: message };
        }
        const result = outcome.data;
        const at = originRef.current;
        if (result.ok && key === "apply_surface_write" && at) {
          const written = result.result as { surfaceName?: string } | undefined;
          const target = (input as { target?: unknown } | null)?.target;
          void dispatch(
            emitKindInteraction({
              ...at,
              kind: "surface_write",
              state: {
                written: [typeof target === "string" ? target : null, written?.surfaceName ? `on ${written.surfaceName}` : null]
                  .filter(Boolean)
                  .join(" "),
              },
            }),
          );
        }
        return result;
      } catch (err) {
        // invokeAction never throws; this guards the guard.
        const message =
          err instanceof Error ? err.message : `Action "${key}" failed.`;
        toast.error(message);
        captureError({
          source: "content-ir",
          message: `[kind-action] action "${key}" threw: ${message}`,
          raw: { key, error: err },
        });
        return { ok: false, error: message };
      } finally {
        inFlight.current.delete(guardKey);
      }
    },
    [launchAgent, userId, dispatch, store, liveWindow, registry, ports],
  );
}
