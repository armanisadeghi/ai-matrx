/**
 * generate-page-image.ts — headless agent-driven image generation for the
 * page workspace's image plan. The proven runVisionGrader pattern
 * (features/education/assessment/data/imageGrading.ts) pointed at an
 * image-output agent: launch (autoRun:false, background), set the image spec
 * as the user message, execute, wait for the run to finish, pull the
 * completed `image_output` render block's durable fileId, destroy the
 * instance. Callers own persistence (the plan entry's file_id) and UI.
 *
 * WHICH agent: the marketing-page surface's `image_producer` role — resolved
 * by the caller via useSurfaceAgentRoles(MARKETING_PAGE_SURFACE_NAME); this
 * thunk takes the resolved agentId and stays role-agnostic.
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { selectRequestStatus } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { ImageBlock } from "@/features/files/blocks/types";

const TERMINAL_STATUSES = new Set(["complete", "completed", "error", "failed"]);

function findImageFileId(
  state: RootState,
  requestId: string,
): string | null {
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

export interface GeneratePageImageArgs {
  /** The image_producer role's resolved agent (surface config). */
  agentId: string;
  /** Full image spec — description, alt intent, placement, page context. */
  prompt: string;
  surfaceKey: string;
}

/**
 * Run the image agent once and return the generated image's durable file_id
 * (null on any failure — the caller reports, never throws to the UI).
 */
export function generatePageImage(args: GeneratePageImageArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    let conversationId: string | null = null;
    try {
      const launch = await dispatch(
        launchAgentExecution({
          agentId: args.agentId,
          surfaceKey: args.surfaceKey,
          sourceFeature: "marketing",
          isEphemeral: false,
          config: { autoRun: false, displayMode: "background" },
        }),
      ).unwrap();
      conversationId = launch.conversationId;

      dispatch(setUserInputText({ conversationId, text: args.prompt }));

      const exec = await dispatch(executeInstance({ conversationId })).unwrap();
      const requestId = exec.requestId;
      if (!requestId) throw new Error("image agent returned no request id");

      return await waitForImage(getState, requestId);
    } catch (error) {
      console.error("[generatePageImage]", error);
      return null;
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}
