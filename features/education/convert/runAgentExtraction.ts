// features/education/convert/runAgentExtraction.ts
//
// Thin throw-on-failure adapter over the canonical headless primitive
// (`runHeadlessAgentJson`, D126) for the converter generators (deck / summary /
// mind_map / …), which run inside `runConvert(ctx)` with no React context.
// Kept as a named seam because the converter contract wants a THROWING
// `{ value, requestId, conversationId }` result with a live-UI handle.

import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import type { AppDispatch, AppStore } from "@/lib/redux/store";

export interface RunAgentExtractionOpts {
  /** The MANDATE to run — resolved live to the DB-bound generator agent. */
  mandateKey: string;
  /** Stable surface key for this generation surface (telemetry + variable scope). */
  surfaceKey: string;
  /** Feature tag (e.g. "education-ingest"). */
  sourceFeature: SourceFeature;
  /** The agent's declared variable values (all stringified). */
  variables: Record<string, string>;
  /**
   * The organization this run belongs to — REQUIRED, never optional.
   *
   * Execution treats organization as a hard boundary: a launch with none is
   * refused outright ("Select an organization before sending this message"),
   * which is correct for a chat composer and catastrophic for a headless
   * generator — every study-kit target failed with the opaque line "The
   * generation agent failed before returning a result" for any student who had
   * not picked an org in the sidebar. Converters already resolve the personal
   * org (`ctx.orgId`); passing it is the whole fix, and it is required here so
   * a new generator cannot forget it and rediscover the same outage.
   */
  organizationId: string | null | undefined;
  /** Extraction ceiling. Defaults to 180s — generous for a full artifact. */
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Fires with the live requestId the moment it is known (for live UI). */
  onRequestId?: (requestId: string) => void;
  /**
   * Whether this run is a VISIBLE one the caller renders.
   *
   * `true` (default) keeps the pre-D126 behaviour: displayMode "direct" plus a
   * kept instance, so a live converter UI can stream it.
   *
   * `false` runs it fully in the background and destroys the instance after.
   * A SEGMENTED generation (`coverage.ts`) makes many calls for ONE artifact,
   * and every kept instance is another conversation whose render block the
   * canvas materializer would turn into its own duplicate deck. Segment runs
   * are therefore background by construction; the artifact is the product, not
   * the eight streams that built it.
   */
  live?: boolean;
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
  const result = await runHeadlessAgentJson(dispatch, store.getState, {
    mandateKey: opts.mandateKey,
    surfaceKey: opts.surfaceKey,
    sourceFeature: opts.sourceFeature,
    variables: opts.variables,
    organizationId: opts.organizationId ?? null,
    displayMode: opts.live === false ? "background" : "direct",
    // Live converter UI renders the stream via onRequestId — keep the
    // instance so those selectors stay populated (pre-D126 behavior). A
    // background segment run keeps nothing: see `live` above.
    keepInstance: opts.live !== false,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    pollIntervalMs: opts.pollIntervalMs ?? DEFAULT_POLL_MS,
    onRequestId: opts.onRequestId,
    failureMessages: {
      streamError: "The generation agent failed before returning a result",
      noJson:
        "The agent finished but returned no structured result — try again or simplify the source.",
      timeout: "Timed out waiting for the generation agent to respond",
    },
  });

  if (!result.success || result.data == null) {
    throw new Error(
      result.error ??
        "The agent finished but returned no structured result — try again or simplify the source.",
    );
  }
  if (!result.requestId || !result.conversationId) {
    throw new Error("Agent launch did not return a request id");
  }
  return {
    value: result.data,
    requestId: result.requestId,
    conversationId: result.conversationId,
  };
}
