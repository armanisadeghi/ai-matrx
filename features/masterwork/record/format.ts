// features/masterwork/record/format.ts
//
// Expert-language formatting for interview metadata — shared by every surface
// that renders an interview row (the InterviewChooser inside the panel, the
// Conversations section on the Rulebook page). One definition so "how much I
// said" can never read differently in two places.

/** "just now" / "12 min ago" / "3 days ago" / "Aug 17, 2026". */
export function relativeWhen(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Characters mean nothing to an Expert; roughly-spoken words do. */
export function wordCount(chars: number): string {
  const words = Math.round(chars / 5.5);
  if (words < 1000) return `${words} words`;
  return `${(words / 1000).toFixed(1)}k words`;
}
