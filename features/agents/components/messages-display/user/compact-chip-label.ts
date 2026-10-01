/**
 * compactChipLabel — the ONE rule for the text inside a compact attachment chip.
 *
 * Until 2026-10-01 the compact chip printed the title's FIRST WORD ("Move",
 * "Oakland", "Carrier", "Port"), so two attachments from the same family were
 * indistinguishable and a person could not tell what they had attached (four
 * blind real-test runs reported it). The chip now shows the whole title when it
 * fits the budget and truncates in the MIDDLE otherwise, keeping the start and
 * the end — where a file's extension and a context value's leaf name live
 * ("Port of Oakl…Gate code", "move-4471.md"). The full title stays in the
 * tooltip and the aria-label.
 */

export const COMPACT_CHIP_MAX_CHARS = 28;

export function compactChipLabel(
  title: string,
  maxChars: number = COMPACT_CHIP_MAX_CHARS,
): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const budget = Math.max(maxChars - 1, 2);
  // Keep a little more of the head than the tail: the head names the thing,
  // the tail disambiguates it (extension, leaf value, number).
  const tailLength = Math.floor(budget * 0.45);
  const headLength = budget - tailLength;
  const head = clean.slice(0, headLength).trimEnd();
  const tail = clean.slice(clean.length - tailLength).trimStart();
  return `${head}…${tail}`;
}
