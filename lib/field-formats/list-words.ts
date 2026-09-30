/**
 * A LINE OF WORDS READ AS THE LIST IT IS — the one reading, for a typed cell, a paste and the values
 * a column already holds (lane DATA-V2-BASICS-2, BREAKER-3 B3-02, 2026-09-30).
 *
 * "Lower back, Hip" in a column that holds several choices is two choices, never one. The store reads
 * it the same way when a column is changed (custom._field_value_carry): split on commas, semicolons and
 * line breaks, trimmed, inner spaces folded, blanks and repeats (in any case) dropped, first spelling kept.
 */
export function splitListWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,;\n]/)) {
    const word = part.trim().replace(/\s+/g, " ");
    if (word === "" || seen.has(word.toLocaleLowerCase())) continue;
    seen.add(word.toLocaleLowerCase());
    out.push(word);
  }
  return out;
}

/**
 * The values a column already holds, offered as choices for a column that holds SEVERAL: each line is
 * split into its words and a word's count is the sum of the lines naming it, most used first. The
 * "Already in this column" offer used to list "Knee, Hip" as one choice and "Add all" made it one.
 */
export function severalChoiceSuggestions<T extends { value: string; count?: number }>(
  suggestions: readonly T[] | undefined,
): { value: string; count?: number }[] | undefined {
  if (!suggestions) return suggestions;
  const by = new Map<string, { value: string; count: number; first: number; counted: boolean }>();
  suggestions.forEach((s, i) => {
    for (const word of splitListWords(String(s.value))) {
      const key = word.toLocaleLowerCase();
      const had = by.get(key);
      if (had) {
        had.count += s.count ?? 0;
        had.counted ||= s.count !== undefined;
      } else {
        by.set(key, { value: word, count: s.count ?? 0, first: i, counted: s.count !== undefined });
      }
    }
  });
  return [...by.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .map((w) => (w.counted ? { value: w.value, count: w.count } : { value: w.value }));
}
