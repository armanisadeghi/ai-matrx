/**
 * generate-page-image.ts — headless agent-driven image generation for the
 * page workspace's image plan. The proven runVisionGrader pattern
 * (features/education/assessment/data/imageGrading.ts): launch
 * (autoRun:false, background, isEphemeral:false), set input, execute, wait
 * for the run to finish, pull the result out of redux, destroy the instance.
 * Callers own persistence (the plan entry's file_id) and UI.
 *
 * `runHeadlessAgent` + `waitForAnswerText` are exported as THE shared
 * headless-agent shell for marketing — generate-video-metadata.ts consumes
 * them; never fork a second launch/execute/destroy loop.
 *
 * THREE generation paths (the card picks):
 * 1. `generatePageImageTwoStep` — the DEFAULT. Mini-pipeline: the prompt
 *    generator agent turns the plan entry's spec + style preset into a
 *    polished image prompt (wrapped in `<image_prompt>…</image_prompt>` in
 *    its TEXT answer), then Matrx Image Ultra renders it. One click for the
 *    user, two cheap runs instead of one expensive all-in-one call.
 * 2. `generatePageImageAllInOne` — the premium single agent that does both
 *    steps internally. Available, never the default.
 * 3. `generatePageImage` — the surface's `image_producer` role binding
 *    (role-agnostic: caller resolves the agentId via useSurfaceAgentRoles).
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import {
  selectAnswerText,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { ImageBlock } from "@/features/files/blocks/types";

/**
 * System agent "GPT Image Prompt Generator" — permanent latest-version
 * pointer. Takes runtime variables `intent_or_content` + `style` and answers
 * with the finished prompt wrapped in `<image_prompt>…</image_prompt>`.
 */
export const IMAGE_PROMPT_GENERATOR_AGENT_ID =
  "175cd409-cb7e-4c53-83e6-1dbf0ec24ed1";

/**
 * System agent "Matrx Image Ultra" (gpt-image-2) — permanent latest-version
 * pointer. Takes runtime variable `image_description` and returns the
 * rendered image as an `image_output` block.
 */
export const MATRX_IMAGE_ULTRA_AGENT_ID =
  "bcc69216-d4fa-4e28-a090-8a7749123bc5";

/**
 * System agent "GPT Image all-in-one" — permanent latest-version pointer.
 * Prompt-engineers AND renders in one (expensive) run. Runtime variables:
 * `intent_or_content`, `style`, `count`. Deliberately NOT the default path.
 */
export const IMAGE_ALL_IN_ONE_AGENT_ID =
  "6bc1d330-40b5-49f8-8895-e5b55ec95ae9";

const TERMINAL_STATUSES = new Set(["complete", "completed", "error", "failed"]);

function findImageFileId(state: RootState, requestId: string): string | null {
  const request = state.activeRequests.byRequestId[requestId];
  if (!request) return null;
  for (const blockId of Object.keys(request.renderBlocks)) {
    const block = request.renderBlocks[blockId];
    if (block.type !== "image_output" || block.status !== "complete") continue;
    const data = block.data as unknown as Partial<ImageBlock> | null;
    if (data && data.origin === "matrx" && typeof data.fileId === "string") {
      return data.fileId;
    }
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

export interface HeadlessRunArgs {
  agentId: string;
  surfaceKey: string;
  /** User-message text (some agents key entirely off runtime variables). */
  userText: string;
  /** Passed straight to the run as runtime variables (imageGrading pattern). */
  variables?: Record<string, string>;
}

/**
 * Launch → set input → execute → destroy, handing the live requestId to
 * `collect` while the instance is still alive. The ONE headless shell every
 * path shares.
 */
export async function runHeadlessAgent<T>(
  dispatch: AppDispatch,
  args: HeadlessRunArgs,
  collect: (requestId: string) => Promise<T>,
): Promise<T> {
  let conversationId: string | null = null;
  try {
    const launch = await dispatch(
      launchAgentExecution({
        agentId: args.agentId,
        surfaceKey: args.surfaceKey,
        sourceFeature: "marketing",
        isEphemeral: false,
        ...(args.variables ? { runtime: { variables: args.variables } } : {}),
        config: { autoRun: false, displayMode: "background" },
      }),
    ).unwrap();
    conversationId = launch.conversationId;

    dispatch(setUserInputText({ conversationId, text: args.userText }));

    const exec = await dispatch(executeInstance({ conversationId })).unwrap();
    const requestId = exec.requestId;
    if (!requestId) throw new Error("agent run returned no request id");

    return await collect(requestId);
  } finally {
    if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
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
  /** Full image spec — description, alt intent, placement, page context. */
  prompt: string;
  surfaceKey: string;
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
          userText: args.prompt,
        },
        (requestId) => waitForImage(getState, requestId),
      );
    } catch (error) {
      console.error("[generatePageImage]", error);
      return null;
    }
  };
}

/** Loud, step-attributed outcome — the card toasts WHICH step failed. */
export type PageImageResult =
  | { ok: true; fileId: string }
  | { ok: false; step: "prompt" | "image"; message: string };

export interface GeneratePageImageTwoStepArgs {
  /** The plan entry's built spec (description + alt + placement + page). */
  spec: string;
  /** Style preset (or custom style text) — empty string means unstyled. */
  style: string;
  surfaceKey: string;
}

/**
 * The DEFAULT one-click pipeline: (1) the prompt generator agent turns the
 * spec + style into a polished image prompt (extracted from its
 * `<image_prompt>` answer wrapper), (2) Matrx Image Ultra renders it. Each
 * step fails loudly with its own step tag.
 */
export function generatePageImageTwoStep(args: GeneratePageImageTwoStepArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<PageImageResult> => {
    // Step 1 — prompt generation (text run, variables carry the payload).
    let imagePrompt: string | null = null;
    try {
      const answer = await runHeadlessAgent(
        dispatch,
        {
          agentId: IMAGE_PROMPT_GENERATOR_AGENT_ID,
          surfaceKey: args.surfaceKey,
          userText: "Write the image prompt now.",
          variables: {
            intent_or_content: args.spec,
            style: args.style || "No specific style — pick the best fit.",
          },
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

    // Step 2 — render with Matrx Image Ultra.
    try {
      const fileId = await runHeadlessAgent(
        dispatch,
        {
          agentId: MATRX_IMAGE_ULTRA_AGENT_ID,
          surfaceKey: args.surfaceKey,
          userText: "Generate the image now.",
          variables: { image_description: imagePrompt },
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
}

/**
 * The premium single-run path: "GPT Image all-in-one" prompt-engineers and
 * renders internally. Never the default — offered from the card's menu.
 */
export function generatePageImageAllInOne(args: GeneratePageImageAllInOneArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<PageImageResult> => {
    try {
      const fileId = await runHeadlessAgent(
        dispatch,
        {
          agentId: IMAGE_ALL_IN_ONE_AGENT_ID,
          surfaceKey: args.surfaceKey,
          userText: "Generate the image now.",
          variables: {
            intent_or_content: args.spec,
            style: args.style || "No specific style — pick the best fit.",
            count: "1",
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
