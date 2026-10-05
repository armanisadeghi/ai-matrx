// features/spaces/page/time.ts — Notion's "Edited 37m ago" wording.

export function editedAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "Edited just now";
  const m = Math.round(s / 60);
  if (m < 60) return `Edited ${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `Edited ${h}h ago`;
  const d = new Date(iso);
  return `Edited ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
