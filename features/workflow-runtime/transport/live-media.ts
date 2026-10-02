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

/** A run attachment's media router: the frame assembler plus its own teardown. */
export interface WorkflowMediaRouter extends MediaFrameAssembler {
  /**
   * The attachment is gone (run view unmounted, run detached): destroy every
   * live player it fed — no AudioContext outlives the page — and start those
   * keys over, so a later attach under the same key (a rejoin replays from
   * seq 0) plays fresh instead of staying broken until reload.
   */
  dispose(): void;
}

/**
 * One router per run attachment. Reassembled live-audio payloads play
 * through `workflowLiveAudio`; other media payloads (`media_block`,
 * `partial_image`) are not rendered live on the run page yet — the step's
 * settled output carries the saved file — and say so once per kind.
 */
export function createWorkflowMediaRouter(runId: string): WorkflowMediaRouter {
  const announced = new Set<string>();
  const keys = new Set<string>();
  const assembler = createMediaFrameAssembler({
    onPayload: ({ payload, source }) => {
      if (isLiveAudioEvent(payload)) {
        const key = workflowLiveAudioKey(
          runId,
          invocationKeyOf(source.nodeId ?? "", source.dispatchId, source.itemIndex),
        );
        keys.add(key);
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
  return {
    push: (frame) => assembler.push(frame),
    flush: () => assembler.flush(),
    get openCount() {
      return assembler.openCount;
    },
    dispose() {
      for (const key of keys) workflowLiveAudio.reset(key);
      keys.clear();
    },
  };
}
