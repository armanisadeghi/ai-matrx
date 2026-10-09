// features/applets-host/run-answer.ts — WHEN A FINISHED APPLET RUN HAS NO ANSWER (lane F8, Applet audit 2026-10-09).
//
// A "Done" over an empty body reads as a broken page. `AppletRunOutput` asks these two questions to say so
// plainly and offer the run again.

import type { JobRunView } from "@ai-matrx/applets";

/** True when a finished run carries no answer anywhere: no streamed answer text, no run text, no kind. */
export function finishedWithoutAnswer(run: JobRunView, streamedAnswer: string): boolean {
  return run.status === "done" && !run.result && !run.text.trim() && !streamedAnswer.trim();
}

/** The run's "run it again" door, when the installed `@ai-matrx/applets` hands one (`JobRunView.retry`). */
export function retryOf(run: JobRunView): (() => void) | null {
  return "retry" in run && typeof run.retry === "function" ? (run.retry as () => void) : null;
}
