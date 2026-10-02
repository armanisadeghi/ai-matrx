/**
 * Live media from a workflow run — the run page's half of aidream's
 * `node_stream` `kind: "media"` contract (services/runtime/FEATURE.md).
 *
 * Every decision lives in `@ai-matrx/media/live-audio`: the frame reassembler
 * (group by frame_id, order per step by stream_seq, drop incomplete sets) and
 * the keyed live-audio registry (codec choice, gap-free seq, loud drop to the
 * saved file). This module only owns the page-wide registry instance and the
 * key the run viewer reads it by — one live player per invocation.
 */

import {
  createLiveAudioRegistry,
  createMediaFrameAssembler,
  isLiveAudioEvent,
  type MediaFrameAssembler,
} from "@ai-matrx/media/live-audio";
import { invocationKeyOf } from "../types";

/** The page's live audio — one controller per `${runId}|${invocationKey}`. */
export const workflowLiveAudio = createLiveAudioRegistry();

export function workflowLiveAudioKey(runId: string, invocationKey: string): string {
  return `${runId}|${invocationKey}`;
}

/**
 * One assembler per run attachment. Reassembled live-audio payloads play
 * through `workflowLiveAudio`; other media payloads (`media_block`,
 * `partial_image`) are not rendered live on the run page yet — the step's
 * settled output carries the saved file — and say so once per kind.
 */
export function createWorkflowMediaRouter(runId: string): MediaFrameAssembler {
  const announced = new Set<string>();
  return createMediaFrameAssembler({
    onPayload: ({ payload, source }) => {
      if (isLiveAudioEvent(payload)) {
        const key = workflowLiveAudioKey(
          runId,
          invocationKeyOf(source.nodeId ?? "", source.dispatchId, source.itemIndex),
        );
        workflowLiveAudio.handle(key, payload);
        return;
      }
      const type = String(payload.type);
      if (!announced.has(type)) {
        announced.add(type);
        console.info(
          `[workflow-live-media] ${type} arrives live but the run page shows it from the step's saved output`,
        );
      }
    },
  });
}
