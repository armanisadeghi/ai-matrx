// lib/text/withArticle.ts — "a patient", "an insurance plan": the article a person would say.
//
// Lane HANDOVER, 2026-09-27: the scope screens printed "add a insurance plan". The rule is the
// sound, approximated by the first letter: a vowel takes "an"; the few words where the letter and
// the sound disagree are named.

const AN_BEFORE = /^(hour|honest|honou?r|heir)/i;
const A_BEFORE = /^(u[bcfhjkqrstn][aeiou]|use|usu|uni[^nmd]|euro|one|once|ewe)/i;

/** The word with its indefinite article: withArticle("insurance plan") → "an insurance plan". */
export function withArticle(words: string): string {
  const w = words.trim();
  if (!w) return w;
  const an = AN_BEFORE.test(w) || (/^[aeiou]/i.test(w) && !A_BEFORE.test(w));
  return `${an ? "an" : "a"} ${w}`;
}
