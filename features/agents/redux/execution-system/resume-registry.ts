/**
 * resume-registry.ts — tiny leaf registry breaking the
 * submit-tool-results → resume-instance import edge (D115 inversion pattern).
 *
 * The cycle: submit-tool-results → resume-instance → run-ai-stream →
 * process-stream → dispatch-ui-first-tool → submit-tool-results. The old fix
 * was an `await import()` in submit-tool-results — but that file is statically
 * reachable from ~every app entry, and the async edge re-entered the entire
 * execution-system graph, multiplying a chunk-group split per context
 * (THE FRAGMENTATION LAW, `await import()` edition — see code-splitting skill
 * rule 6 caveat / FOUND_DEFECTS D115).
 *
 * Inversion: `resume-instance.thunk.ts` registers its handler here at its own
 * module init (guaranteed by a side-effect import from
 * `launch-agent-execution.thunk.ts`, which is in the same always-loaded
 * execution cluster); `submit-tool-results` fires it by name with ZERO import
 * edge back into the graph.
 *
 * CRITICAL: this file imports NOTHING from the project. Keep it a leaf.
 */

export interface ResumeInstanceArgs {
  conversationId: string;
  userRequestId: string;
}

/**
 * The handler receives the caller's dispatch (typed opaquely so this leaf
 * stays import-free); the registering module casts it to AppDispatch.
 */
type ResumeInstanceHandler = (dispatch: unknown, args: ResumeInstanceArgs) => void;

let handler: ResumeInstanceHandler | null = null;

export function registerResumeInstanceHandler(fn: ResumeInstanceHandler): void {
  handler = fn;
}

/**
 * Fire the registered resume handler. Loud on miss — an unregistered handler
 * means the execution cluster was never initialized, which cannot legally
 * happen on any path that produced tool results.
 */
export function fireResumeInstance(
  dispatch: unknown,
  args: ResumeInstanceArgs,
): void {
  if (!handler) {
    // eslint-disable-next-line no-console
    console.error(
      "[resume-registry] fireResumeInstance called before resume-instance.thunk registered — continuation dropped. This is a wiring defect (see D115 inversion contract).",
      args,
    );
    return;
  }
  handler(dispatch, args);
}
