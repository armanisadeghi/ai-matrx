/**
 * lib/failure/toastFailure.ts — the toast a caught failure is allowed to make.
 *
 * `toast.error(err.message)` is how `Failed to fetch` reached a person on
 * production (2026-09-08). This is its replacement: the door's own words when
 * the door refused, and an honest sentence WITH a retry when the browser simply
 * did not complete the request. See `lib/failure/transport.ts`.
 */

import { toast } from "@/lib/toast";
import {
  describeFailure,
  type DescribeOptions,
  type FailureSentence,
} from "@/lib/failure/transport";

export interface ToastFailureOptions extends DescribeOptions {
  /**
   * Run the same thing again. Given a transient failure, the toast grows a
   * Retry button — the remedy the person was previously expected to guess.
   */
  retry?: () => void | Promise<void>;
  /** Label for that button. */
  retryLabel?: string;
}

/**
 * Show a caught failure. Returns what it decided to say, so a caller can put
 * the same sentence in its own inline error slot instead of inventing a second
 * opinion.
 */
export function toastFailure(
  error: unknown,
  options: ToastFailureOptions = {},
): FailureSentence {
  const failure = describeFailure(error, options);
  toast.error(failure.sentence, {
    description: failure.remedy || undefined,
    action:
      failure.transient && options.retry
        ? {
            label: options.retryLabel ?? "Try again",
            onClick: () => void options.retry?.(),
          }
        : undefined,
  });
  return failure;
}
