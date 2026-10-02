/**
 * lib/api/run-wait.ts — how long a client waits for the server to START
 * answering a run, per output kind, as an organization knob.
 *
 * The rule, the arithmetic and the honest timeout sentence MOVED into
 * `@ai-matrx/agents/matrx` (`run-wait`, chat-package independence P9). This app
 * supplies the one host fact: how a knob is read (`ensureEffectiveKnob`).
 */

import { resolveRunWaitWith, type RunOutputKind, type RunWait } from "@ai-matrx/agents/matrx";

import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";

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

/**
 * The first-response wait for `kind` under this organization's knob. Never
 * throws — an unreadable knob is announced and the wait becomes the lifetime
 * backstop.
 */
export function resolveRunWait(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
  kind: RunOutputKind,
): Promise<RunWait> {
  return resolveRunWaitWith(ensureEffectiveKnob, organizationId, userId, kind);
}
