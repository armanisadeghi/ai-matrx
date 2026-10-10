// features/start/widgets/editNote.ts — the one-line note a saved version carries ("Added Tasks", …),
// built from the widgets' own `describe` lines so the history list reads like what changed.
import { describeStartWidget } from "./catalog";
import type { StartDoc } from "./types";

export function summarizeStartEdit(before: StartDoc, after: StartDoc): string {
  const beforeIds = new Set(before.widgets.map((w) => w.id));
  const afterIds = new Set(after.widgets.map((w) => w.id));
  const added = after.widgets.filter((w) => !beforeIds.has(w.id)).map(describeStartWidget);
  const removed = before.widgets.filter((w) => !afterIds.has(w.id)).map(describeStartWidget);
  const parts: string[] = [];
  if (added.length) parts.push(`Added ${added.join(", ")}`);
  if (removed.length) parts.push(`Removed ${removed.join(", ")}`);
  const kept = after.widgets.filter((w) => beforeIds.has(w.id));
  const keptBefore = before.widgets.filter((w) => afterIds.has(w.id));
  const reordered = kept.some((w, i) => keptBefore[i]?.id !== w.id);
  const changed = kept.some((w) => {
    const old = before.widgets.find((b) => b.id === w.id);
    return old && (old.size !== w.size || JSON.stringify(old.config) !== JSON.stringify(w.config));
  });
  if (reordered) parts.push("Reordered");
  if (changed) parts.push("Resized or set up widgets");
  const note = parts.join(" · ") || "Saved layout";
  return note.length > 120 ? `${note.slice(0, 117)}…` : note;
}
