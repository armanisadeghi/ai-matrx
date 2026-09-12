// features/masterwork/record/format.ts
//
// Expert-language formatting for interview metadata — shared by every surface
// that renders an interview row (the InterviewChooser inside the panel, the
// Conversations section on the Rulebook page). One definition so "how much I
// said" can never read differently in two places.

import { formatRelativeTime } from "@/utils/datetime";

/** Past this age an interview reads as a calendar date, not an age. */
const RELATIVE_CUTOFF_MS = 30 * 24 * 60 * 60 * 1000;

/** "12 minutes ago" / "3 days ago" / "Aug 17, 2026". */
export function relativeWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Date.now() - then >= RELATIVE_CUTOFF_MS) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return formatRelativeTime(iso, { style: "long" });
}

/** Characters mean nothing to an Expert; roughly-spoken words do. */
export function wordCount(chars: number): string {
  const words = Math.round(chars / 5.5);
  if (words < 1000) return `${words} words`;
  return `${(words / 1000).toFixed(1)}k words`;
}
