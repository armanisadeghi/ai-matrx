/** Shared elapsed formatting for the study-kit board and its runners. Lives in
 *  its own module so the board and the audio runner don't import each other
 *  (a cycle whose init order is a coin flip at runtime). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
