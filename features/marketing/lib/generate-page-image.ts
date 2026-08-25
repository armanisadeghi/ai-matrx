/**
 * generate-page-image.ts — headless agent-driven image generation for the
 * page workspace's image plan. The proven runVisionGrader pattern
 * (features/education/assessment/data/imageGrading.ts): launch
 * (autoRun:false, isEphemeral:false), set input, execute, wait for the run to
 * finish, pull the result out of redux, destroy the instance.
 * Callers own persistence (the plan entry's file_id) and UI.
 *
 * LIVE POSTURE (2026-08-11). These runs are minutes long and used to be fully
 * invisible — a spinner on the button and nothing else, which THE FLOATING LAW
 * bans (features/window-panels/FEATURE.md). Every path now floats its run in
 * the canonical `LiveRunWindow` via `runHeadlessAgent`'s `live` option: the
 * two-step pipeline shows the prompt being written and then the image being
 * rendered IN THE SAME window, and the finished image stays on screen (its
 * instance is held until the next run) instead of vanishing at completion.
 *
 * `runHeadlessAgent` + `waitForAnswerText` are exported as THE shared
 * headless-agent shell for marketing — generate-video-metadata.ts consumes
 * them; never fork a second launch/execute/destroy loop.
 *
 * THREE generation paths (the card picks):
 * 1. `generatePageImageTwoStep` — the DEFAULT. Mini-pipeline: the
 *    `marketing.image_prompt` mandate turns the plan entry's spec + style
 *    preset into a polished image prompt (wrapped in
 *    `<image_prompt>…</image_prompt>` in its TEXT answer), then
 *    `marketing.page_image` renders it. One click for the user, two cheap
 *    runs instead of one expensive all-in-one call.
 * 2. `generatePageImageAllInOne` — `marketing.page_image_all_in_one`, one
 *    agent doing both steps internally. Available, never the default;
 *    refuses loudly while the mandate is unbound.
 * 3. `generatePageImage` — the surface's `image_producer` role binding
 *    (role-agnostic: caller resolves the agentId via useSurfaceAgentRoles).
 *
 * NOTE (2026-08-08): a direct non-agent render path now exists —
 * `generateImage()` (features/image-studio/api/python.ts → aidream
 * POST /images/generate, streaming over execute_ai_request). It is a
 * candidate replacement for the `marketing.page_image` render step when a
 * caller already holds a finished prompt and needs no agent behavior;
 * the two-step default here stays because the prompt-generator step is
 * the product value. Consolidate deliberately, not by drift.
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { openLiveRunWindowAction } from "@/features/overlays/openers/liveRunWindow";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  selectAnswerText,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { resolveMandate } from "@/features/agents/mandates/service";

/**
 * WHO runs each step is a MANDATE (`agent.mandate`), never an agent id in this
 * file — the database decides which agent does the job (system default, or
 * the user's own binding), and `runHeadlessAgent` passes the key straight
 * into `launchAgentExecution({ mandateKey })` so BOTH halves of the binding
 * (agent AND `config_overrides`) apply. Inputs ride as the provision's
 * offered values. Recipe: `features/agents/mandates/FEATURE.md`
 * §"Migrating a hardcoded call site".
 */

/** Prompt engineering step — provision offers `intent_or_content`, `style`;
 *  the agent answers with the prompt wrapped in `<image_prompt>…</image_prompt>`. */
export const IMAGE_PROMPT_MANDATE_KEY = "marketing.image_prompt";

/** Render step — provision offers `image_description`; the agent returns the
 *  rendered image as an `image_output` block. */
export const PAGE_IMAGE_MANDATE_KEY = "marketing.page_image";

/**
 * The premium single-run job: prompt-engineers AND renders in one run —
 * provision offers `intent_or_content`, `style`, `count`. Deliberately NOT
 * the default path, and currently SEEDLESS (declared, no system default):
 * until an agent is bound at /agents/mandates the path refuses with a typed
 * `step: "mandate"` outcome naming this key — it never silently falls back
 * to the two-step pipeline.
 */
export const PAGE_IMAGE_ALL_IN_ONE_MANDATE_KEY = "marketing.page_image_all_in_one";

// The REAL RequestStatus terminal values (features/agents/types/request.types
// RequestStatus). The old set carried "completed"/"failed" — statuses that do
// not exist — and missed "timeout"/"cancelled", so those runs burned the full
// wait timeout instead of settling the moment the request went terminal.
const TERMINAL_STATUSES = new Set(["complete", "error", "timeout", "cancelled"]);

/**
 * Pull a matrx file id out of a render block's data bag, tolerating the
 * shapes that actually reach Redux: the canonical UnifiedImageBlock
 * (`fileId`, camelCase) AND the wire/matrx-files spelling (`file_id`) that
 * the FileRecord contract drift (D130 console evidence) can leak through.
 * External blocks never carry a file id, so its presence is the signal;
 * an explicit `origin: "external"` is still rejected.
 */
function extractMatrxFileId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.origin === "external") return null;
  if (typeof d.fileId === "string" && d.fileId) return d.fileId;
  if (typeof d.file_id === "string" && d.file_id) return d.file_id;
  return null;
}

function findImageFileId(state: RootState, requestId: string): string | null {
  const request = state.activeRequests.byRequestId[requestId];
  if (!request) return null;
  // Once the request COMPLETED successfully, accept an image block even if
  // its status never flipped to "complete" — a stream closed by the
  // terminal-settlement guard (process-stream.ts) may leave the final
  // block's status behind, and dropping a fileId the server already
  // persisted would fail the whole run. Deliberately NOT extended to
  // error/timeout/cancelled runs: a failed image step must never be
  // reported as success off a partial block.
  const requestCompleted = request.status === "complete";
  for (const blockId of Object.keys(request.renderBlocks)) {
    const block = request.renderBlocks[blockId];
    if (block.type !== "image_output") continue;
    if (block.status !== "complete" && !requestCompleted) continue;
    const fileId = extractMatrxFileId(block.data);
    if (fileId) return fileId;
  }
  return null;
}

async function waitForImage(
  getState: () => RootState,
  requestId: string,
  timeoutMs = 180_000,
  intervalMs = 300,
): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = getState();
    const fileId = findImageFileId(state, requestId);
    const status = selectRequestStatus(requestId)(state);
    if (fileId && (status === undefined || TERMINAL_STATUSES.has(status))) {
      return fileId;
    }
    if (status !== undefined && TERMINAL_STATUSES.has(status)) {
      // Terminal without an image block — one last scan then give up.
      return findImageFileId(state, requestId);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return findImageFileId(getState(), requestId);
}

/** Wait for a run to reach a terminal status, then return its answer text. */
export async function waitForAnswerText(
  getState: () => RootState,
  requestId: string,
  timeoutMs = 120_000,
  intervalMs = 300,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = getState();
    const status = selectRequestStatus(requestId)(state);
    if (status !== undefined && TERMINAL_STATUSES.has(status)) {
      return selectAnswerText(requestId)(state);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return selectAnswerText(requestId)(getState());
}

/**
 * WHO runs: either an exact agent id, or — the mandate-first form — a mandate
 * key the launch thunk resolves itself (agent AND the binding's
 * `config_overrides`; resolving the mandate here and passing `agentId` would
 * silently drop the settings half). Mutually exclusive.
 */
export type HeadlessRunTarget =
  | { agentId: string; mandateKey?: undefined }
  | { mandateKey: string; agentId?: undefined };

export type HeadlessRunArgs = HeadlessRunTarget & {
  surfaceKey: string;
  /** User-message text (some agents key entirely off runtime variables). */
  userText: string;
  /** Passed straight to the run as runtime variables (imageGrading pattern). */
  variables?: Record<string, string>;
  /**
   * Float this run in the canonical `LiveRunWindow` instead of hiding it behind
   * the caller's spinner (THE FLOATING LAW). Pass the SAME `instanceId` for
   * every step of a multi-step pipeline and each step re-binds the one window
   * under its own label, so the user watches the prompt get written and then
   * the image appear — in one place, with the page underneath never moving.
   */
  live?: { instanceId: string; label: string };
};

/**
 * The instance a live run deliberately kept alive so its finished output stays
 * readable in the window. Released when the next live run starts — at most ONE
 * is ever held. (Destroying it at completion would blank the window at the
 * exact moment the image lands.)
 */
let lastLiveConversationId: string | null = null;

/**
 * Launch → set input → execute → destroy, handing the live requestId to
 * `collect` while the instance is still alive. The ONE headless shell every
 * path shares.
 *
 * With `args.live`, the run is NOT invisible: the window opens on the launch
 * (pending), binds the requestId the moment the stream connects, and the
 * instance outlives the call so the completed output survives.
 */
export async function runHeadlessAgent<T>(
  dispatch: AppDispatch,
  args: HeadlessRunArgs,
  collect: (requestId: string) => Promise<T>,
): Promise<T> {
  let conversationId: string | null = null;
  let liveBound = false;
  if (args.live) {
    dispatch(
      openLiveRunWindowAction({
        instanceId: args.live.instanceId,
        label: args.live.label,
        pending: true,
      }),
    );
  }
  try {
    const launch = await dispatch(
      launchAgentExecution({
        ...(args.mandateKey
          ? { mandateKey: args.mandateKey }
          : { agentId: args.agentId }),
        surfaceKey: args.surfaceKey,
        sourceFeature: "marketing",
        isEphemeral: false,
        ...(args.variables ? { runtime: { variables: args.variables } } : {}),
        // The user text is seeded AFTER the launch and this dispatches
        // `executeInstance` itself below, so the deferral is deliberate —
        // declared, because on the `background` leg a headless launch would
        // otherwise ignore `autoRun: false` and fire before the text landed.
        // See `ManagedAgentOptions.callerExecutes`.
        callerExecutes: true,
        config: {
          autoRun: false,
          displayMode: args.live ? "direct" : "background",
        },
      }),
    ).unwrap();
    conversationId = launch.conversationId;

    dispatch(setUserInputText({ conversationId, text: args.userText }));

    const exec = await dispatch(executeInstance({ conversationId })).unwrap();
    const requestId = exec.requestId;
    if (!requestId) throw new Error("agent run returned no request id");

    if (args.live) {
      // The previous step/run's instance is superseded the moment this one has
      // a stream to show — never before, or the window blanks between steps.
      if (lastLiveConversationId && lastLiveConversationId !== conversationId) {
        dispatch(destroyInstanceIfAllowed(lastLiveConversationId));
      }
      lastLiveConversationId = conversationId;
      liveBound = true;
      dispatch(
        openLiveRunWindowAction({
          instanceId: args.live.instanceId,
          label: args.live.label,
          conversationId,
          requestId,
          pending: false,
        }),
      );
    }

    return await collect(requestId);
  } finally {
    // A live run's instance is held (see `lastLiveConversationId`); a headless
    // one is destroyed exactly as before.
    if (conversationId && !args.live) {
      dispatch(destroyInstanceIfAllowed(conversationId));
    }
    // The launch died before a stream existed: a window stuck on "pending"
    // forever is worse than the spinner this replaced. Close it and let the
    // caller's own loud, step-attributed toast carry the failure.
    if (args.live && !liveBound) {
      dispatch(
        closeOverlay({
          overlayId: "liveRunWindow",
          instanceId: args.live.instanceId,
        }),
      );
    }
  }
}

/** Pull the prompt out of the generator's `<image_prompt>…</image_prompt>` wrapper. */
export function extractImagePrompt(answerText: string): string | null {
  const match = /<image_prompt>([\s\S]*?)<\/image_prompt>/i.exec(answerText);
  const prompt = match?.[1]?.trim();
  return prompt ? prompt : null;
}

export interface GeneratePageImageArgs {
  /** The image_producer role's resolved agent (surface config). */
  agentId: string;
  /**
   * Full image spec — description, alt intent, placement, page context.
   * THE USER-INPUT LAW: this is machine-built structured content (buildSpec
   * joins URL + description + alt + placement + style), never a human's
   * typed message, so it travels as the `intent_or_content` runtime
   * variable — the SAME name the two default paths
   * (`generatePageImageTwoStep` / `generatePageImageAllInOne`) already use
   * for this exact spec. Any agent bound to the `image_producer` surface
   * role must declare `intent_or_content` to receive it.
   */
  prompt: string;
  surfaceKey: string;
  /**
   * Window identity for the floating live run. Pass a per-subject id (e.g. the
   * plan entry's id) so generating a second image opens its own window instead
   * of stealing the first one's. Defaults to one window per surface.
   */
  liveInstanceId?: string;
}

/** One window per subject; the surface is the fallback subject. */
function liveWindowId(surfaceKey: string, liveInstanceId?: string): string {
  return liveInstanceId ?? `image-run:${surfaceKey}`;
}

/**
 * Run ONE image agent (surface `image_producer` role override) and return the
 * generated image's durable file_id (null on any failure — the caller
 * reports, never throws to the UI).
 */
export function generatePageImage(args: GeneratePageImageArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    try {
      return await runHeadlessAgent(
        dispatch,
        {
          agentId: args.agentId,
          surfaceKey: args.surfaceKey,
          // Kick phrase only — matches the sibling paths' "Generate the
          // image now." The actual spec rides as a variable (below), never
          // as user_input.
          userText: "Generate the image now.",
          variables: { intent_or_content: args.prompt },
          live: {
            instanceId: liveWindowId(args.surfaceKey, args.liveInstanceId),
            label: "Generating the image",
          },
        },
        (requestId) => waitForImage(getState, requestId),
      );
    } catch (error) {
      console.error("[generatePageImage]", error);
      return null;
    }
  };
}

/** Loud, step-attributed outcome — the card toasts WHICH step failed.
 *  `step: "mandate"` = the job's mandate could not resolve (unbound / disabled),
 *  so NOTHING ran; `mandateKey` names the job to bind at /agents/mandates. */
export type PageImageResult =
  | { ok: true; fileId: string }
  | { ok: false; step: "prompt" | "image"; message: string }
  | { ok: false; step: "mandate"; mandateKey: string; message: string };

/**
 * Gate for a path that must refuse LOUDLY when its mandate has no agent
 * (the seedless all-in-one job). Resolution is cached, so the launch thunk's
 * own `mandateKey` resolution a moment later is free — the agent id is never
 * passed into the launch (that would drop the binding's settings half).
 */
async function mandateGate(
  mandateKey: string,
): Promise<Extract<PageImageResult, { step: "mandate" }> | null> {
  try {
    await resolveMandate(mandateKey);
    return null;
  } catch (error) {
    console.error(`[generatePageImage] mandate "${mandateKey}" unresolved:`, error);
    return {
      ok: false,
      step: "mandate",
      mandateKey,
      message: `No agent is bound to the "${mandateKey}" job — bind one at /agents/mandates. ${
        error instanceof Error ? error.message : ""
      }`.trim(),
    };
  }
}

export interface GeneratePageImageTwoStepArgs {
  /** The plan entry's built spec (description + alt + placement + page). */
  spec: string;
  /** Style preset (or custom style text) — empty string means unstyled. */
  style: string;
  surfaceKey: string;
  /** Per-subject live-window id (see GeneratePageImageArgs). */
  liveInstanceId?: string;
}

/**
 * The DEFAULT one-click pipeline: (1) the prompt generator agent turns the
 * spec + style into a polished image prompt (extracted from its
 * `<image_prompt>` answer wrapper), (2) `marketing.page_image` renders it. Each
 * step fails loudly with its own step tag.
 */
export function generatePageImageTwoStep(args: GeneratePageImageTwoStepArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<PageImageResult> => {
    // ONE window for BOTH steps: the prompt streams into it word by word, then
    // the same window switches to the render step and the image lands in it.
    const liveInstanceId = liveWindowId(args.surfaceKey, args.liveInstanceId);

    // Step 1 — prompt generation (text run, variables carry the payload).
    let imagePrompt: string | null = null;
    try {
      const answer = await runHeadlessAgent(
        dispatch,
        {
          mandateKey: IMAGE_PROMPT_MANDATE_KEY,
          surfaceKey: args.surfaceKey,
          userText: "Write the image prompt now.",
          variables: {
            intent_or_content: args.spec,
            style: args.style || "No specific style — pick the best fit.",
          },
          live: { instanceId: liveInstanceId, label: "Writing the image prompt" },
        },
        (requestId) => waitForAnswerText(getState, requestId),
      );
      imagePrompt = extractImagePrompt(answer);
      if (!imagePrompt) {
        console.error(
          "[generatePageImageTwoStep] no <image_prompt> in answer:",
          answer,
        );
        return {
          ok: false,
          step: "prompt",
          message: "The prompt generator answered without an <image_prompt>.",
        };
      }
    } catch (error) {
      console.error("[generatePageImageTwoStep] prompt step:", error);
      return {
        ok: false,
        step: "prompt",
        message: error instanceof Error ? error.message : "Prompt run failed.",
      };
    }

    // Step 2 — render (`marketing.page_image`).
    try {
      const fileId = await runHeadlessAgent(
        dispatch,
        {
          mandateKey: PAGE_IMAGE_MANDATE_KEY,
          surfaceKey: args.surfaceKey,
          userText: "Generate the image now.",
          variables: { image_description: imagePrompt },
          live: { instanceId: liveInstanceId, label: "Rendering the image" },
        },
        (requestId) => waitForImage(getState, requestId),
      );
      if (!fileId) {
        return {
          ok: false,
          step: "image",
          message: "The image agent finished without an image output.",
        };
      }
      return { ok: true, fileId };
    } catch (error) {
      console.error("[generatePageImageTwoStep] image step:", error);
      return {
        ok: false,
        step: "image",
        message: error instanceof Error ? error.message : "Image run failed.",
      };
    }
  };
}

export interface GeneratePageImageAllInOneArgs {
  spec: string;
  style: string;
  surfaceKey: string;
  /** Per-subject live-window id (see GeneratePageImageArgs). */
  liveInstanceId?: string;
}

/**
 * The premium single-run path: `marketing.page_image_all_in_one`
 * prompt-engineers and renders internally. Never the default — offered from
 * the card's menu; refuses with `step: "mandate"` while unbound.
 */
export function generatePageImageAllInOne(args: GeneratePageImageAllInOneArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<PageImageResult> => {
    const gate = await mandateGate(PAGE_IMAGE_ALL_IN_ONE_MANDATE_KEY);
    if (gate) return gate;
    try {
      const fileId = await runHeadlessAgent(
        dispatch,
        {
          mandateKey: PAGE_IMAGE_ALL_IN_ONE_MANDATE_KEY,
          surfaceKey: args.surfaceKey,
          userText: "Generate the image now.",
          variables: {
            intent_or_content: args.spec,
            style: args.style || "No specific style — pick the best fit.",
            count: "1",
          },
          live: {
            instanceId: liveWindowId(args.surfaceKey, args.liveInstanceId),
            label: "Generating the image",
          },
        },
        (requestId) => waitForImage(getState, requestId),
      );
      if (!fileId) {
        return {
          ok: false,
          step: "image",
          message: "The all-in-one agent finished without an image output.",
        };
      }
      return { ok: true, fileId };
    } catch (error) {
      console.error("[generatePageImageAllInOne]", error);
      return {
        ok: false,
        step: "image",
        message: error instanceof Error ? error.message : "Image run failed.",
      };
    }
  };
}
