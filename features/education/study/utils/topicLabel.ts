// features/education/study/utils/topicLabel.ts
//
// The display form of a card topic. Topics arrive as the importer wrote them:
// Anki deck paths ("Biology::Cell Structure"), slugs ("data-resilience",
// "can_bus_testing") or plain words. A learner reads the name, never the key —
// the full raw value stays available as the tooltip.

/** "Biology::Cell Structure" → "Cell Structure"; "data-resilience" → "Data resilience". */
export function topicLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const leaf = trimmed.split("::").pop()?.trim() || trimmed;
  const isSlug = /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(leaf);
  if (!isSlug) return leaf;
  const words = leaf.replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
