/**
 * Server seam (P9) — how long a run waits for the server to START answering,
 * per output kind. The rule and arithmetic are `@ai-matrx/agents/matrx`'s
 * (`run-wait`); the knob is read through the host's settings register
 * (`prefs.knobs.ensure` — matrx-frontend: `ensureEffectiveKnob`, exactly what
 * the host's own `lib/api/run-wait` reads).
 */

import { resolveRunWaitWith, type RunOutputKind, type RunWait } from "@ai-matrx/agents/matrx";
import { chatKnobs } from "../prefs";

export {
  RUN_OUTPUT_KINDS,
  RUN_WAIT_KNOB_FEATURE,
  RUN_STREAM_LIFETIME_BACKSTOP_MS,
  isJobOutputKind,
  runOutputKindFromModalities,
  runWaitKnobKey,
  runJobLabel,
  runWaitTimeoutMessage,
  type RunOutputKind,
  type RunWait,
} from "@ai-matrx/agents/matrx";

/** Never throws: an unreadable knob is announced and the wait becomes the lifetime backstop. */
export function resolveRunWait(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
  kind: RunOutputKind,
): Promise<RunWait> {
  return resolveRunWaitWith(
    (org, user, knob) => chatKnobs().ensure(org, user, knob),
    organizationId,
    userId,
    kind,
  );
}
