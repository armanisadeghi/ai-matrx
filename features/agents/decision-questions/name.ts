/**
 * Question names — the output field names.
 *
 * `name` is what the answer arrives under (`answers.is_defect`), so it is a
 * real identifier and not a label: snake_case, unique inside the part. The
 * editor derives it from the instruction the moment the author stops typing
 * and stops deriving as soon as the author edits the name by hand, so a name
 * that code elsewhere already depends on is never rewritten underneath it.
 */

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "this", "that", "these", "those", "it", "its", "of", "in", "on", "at",
  "to", "for", "with", "and", "or", "but", "does", "do", "did", "has",
  "have", "had", "how", "what", "which", "who", "whom", "whose", "when",
  "where", "why", "should", "would", "could", "can", "may", "might",
  "rather", "than", "there", "their",
]);

export function slugifyQuestionName(instruction: string): string {
  const words = instruction
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = words.filter((w) => !STOP_WORDS.has(w));
  const chosen = (meaningful.length ? meaningful : words).slice(0, 4);
  return chosen.join("_").replace(/^_+|_+$/g, "");
}

/** Normalize whatever the author typed into a legal field name. */
export function normalizeQuestionName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+/, "");
}

/** `name`, `name_2`, `name_3`… so two questions never collide. */
export function uniqueQuestionName(
  base: string,
  taken: readonly string[],
): string {
  const root = normalizeQuestionName(base) || "question";
  if (!taken.includes(root)) return root;
  let n = 2;
  while (taken.includes(`${root}_${n}`)) n += 1;
  return `${root}_${n}`;
}
