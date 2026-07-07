// features/education/convert/runAgentExtraction.ts
//
// The shared "run a JSON-extraction agent → get the structured object back"
// primitive, extracted so the converter generators (deck / summary / mind_map /
// …) don't each re-implement the launch + poll dance that flashcards'
// `useGenerateCards` and mindmap's `useGenerateMindMap` hand-rolled. Unlike
// those hooks this is a PLAIN async function driven by an explicit
// dispatch+store, so it works inside a generator called from `runConvert(ctx)`
// (no React context available).
//
// Timing invariant (same as useGenerateCards): with displayMode:"direct" +
// autoRun, `launchAgentExecution` awaits the ENTIRE stream before resolving, so
// the requestId from `.unwrap()` only exists AFTER generation completes. The
// pre-stream `onConversationCreated` hook is what lets a live UI subscribe to
// the requestId mid-stream — we surface it via `onRequestId`.

import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectConversationRequestIds,
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestError,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { AppDispatch, AppStore, RootState } from "@/lib/redux/store";

export interface RunAgentExtractionOpts {
  agentId: string;
  /** Stable surface key for this generation surface (telemetry + variable scope). */
  surfaceKey: string;
  /** Feature tag (e.g. "education-ingest"). */
  sourceFeature: string;
  /** The agent's declared variable values (all stringified). */
  variables: Record<string, string>;
  /** Extraction ceiling. Defaults to 180s — generous for a full artifact. */
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Fires with the live requestId the moment the stream connects (for live UI). */
  onRequestId?: (requestId: string) => void;
}

export interface RunAgentExtractionResult {
  /** The first extracted JSON object the agent produced (raw — caller coerces). */
  value: unknown;
  requestId: string;
  conversationId: string;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_POLL_MS = 250;

/**
 * Launch a direct/autoRun agent with JSON extraction on, wait for the extracted
 * object, and return it raw. Throws on stream error / timeout / no-object so the
 * calling generator can surface a per-target failure.
 */
export async function runAgentExtraction(
  dispatch: AppDispatch,
  store: AppStore,
  opts: RunAgentExtractionOpts,
): Promise<RunAgentExtractionResult> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const poll = opts.pollIntervalMs ?? DEFAULT_POLL_MS;

  let conversationId = "";
  let liveRequestId: string | null = null;

  const { requestId } = await dispatch(
    launchAgentExecution({
      surfaceKey: opts.surfaceKey,
      agentId: opts.agentId,
      sourceFeature: opts.sourceFeature,
      jsonExtraction: { enabled: true },
      onConversationCreated: (cid) => {
        conversationId = cid;
        // Surface the live requestId as soon as createRequest lands it (the
        // launch thunk's own resolution comes only after the stream ends).
        if (opts.onRequestId) {
          const ids = selectConversationRequestIds(cid)(
            store.getState() as RootState,
          );
          if (ids.length > 0) {
            liveRequestId = ids[ids.length - 1];
            opts.onRequestId(liveRequestId);
          }
        }
      },
      runtime: { variables: opts.variables },
      config: { autoRun: true, displayMode: "direct" },
    }),
  ).unwrap();

  const finalRequestId = requestId ?? liveRequestId;
  if (!finalRequestId) {
    throw new Error("Agent launch did not return a request id");
  }
  if (opts.onRequestId && finalRequestId !== liveRequestId) {
    opts.onRequestId(finalRequestId);
  }

  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = store.getState() as RootState;

    if (selectJsonExtractionComplete(finalRequestId)(state)) {
      const snapshot = selectFirstExtractedObject(finalRequestId)(state);
      if (!snapshot) {
        throw new Error("Agent finished but produced no structured JSON");
      }
      return {
        value: snapshot.value,
        requestId: finalRequestId,
        conversationId,
      };
    }

    if (selectRequestStatus(finalRequestId)(state) === "error") {
      const reqError = selectRequestError(finalRequestId)(state);
      throw new Error(
        reqError?.user_message ??
          reqError?.message ??
          "The generation agent failed before returning a result",
      );
    }

    await new Promise((r) => setTimeout(r, poll));
  }
  throw new Error("Timed out waiting for the generation agent to respond");
}
