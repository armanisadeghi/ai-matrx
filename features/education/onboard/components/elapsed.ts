/** Shared elapsed formatting for the study-kit board and its runners. Lives in
 *  its own module so the board and the audio runner don't import each other
 *  (a cycle whose init order is a coin flip at runtime). */
import { formatDurationMs } from "@ai-matrx/kit/format";

export function formatElapsed(ms: number): string {
  return formatDurationMs(Math.max(0, ms), { style: "compact" });
}
