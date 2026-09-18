// lib/record-words.ts
//
// Platform record words: the machine values a row carries, in the words a
// brilliant NON-TECHNICAL expert reads.
//
// 🚨 N5 (VERIFY-U-P1-R5). A real Person's dossier printed `Visibility=internal`
// — a Postgres enum label handed to a person — because nothing in the repo
// turned the platform-wide `visibility` type into a sentence. The enum is
// shared by dozens of tables (`personal | internal | link | public`, read live
// from `pg_enum` 2026-09-18), so the words belong HERE, once, not inside the
// one feature that noticed (law 5).
//
// An unknown value never invents a sentence and never hides: it says the word
// has no plain-English description yet and shows the raw value, which is a
// stand-in that announces itself (law 4).

/** The live `visibility` enum, in plain English. */
const VISIBILITY_WORDS: Record<string, string> = {
  personal: "Only you can see this",
  internal: "Everyone in this organization can see it",
  link: "Anyone with the link can see it",
  public: "Public — anyone can see it",
};

/**
 * One sentence for a row's `visibility`. `null` for an absent value (the field
 * is simply not shown); an honest stand-in naming the raw value for one this
 * module has not learned yet.
 */
export function visibilityWords(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  return (
    VISIBILITY_WORDS[raw] ??
    `Not described in plain words yet — the stored value is "${raw}"`
  );
}

/** The values this module can describe, for a guard that keeps it current. */
export const DESCRIBED_VISIBILITIES = Object.keys(VISIBILITY_WORDS);
