// lib/list-scope/shownToWords.ts — the words for "Shown to" (access ladder Words table).
import type { ShownTo } from "./shownTo";

/**
 * THE WORDS (access ladder Words table, "Shown to"): one label and one sentence per value, used by
 * every surface that shows or sets it. "Everyone on AI Matrx" is valid only on a record that is
 * published to the web (a database CHECK refuses it otherwise).
 */
export const SHOWN_TO_WORDS: Record<ShownTo, { label: string; says: string }> = {
  only_me: { label: "Only me", says: "Listed for you alone. Anyone who can open it still can by its address." },
  my_team: { label: "My team", says: "Listed for you and your teammates." },
  everyone: { label: "Everyone", says: "Listed for everyone in its organization." },
  everyone_on_ai_matrx: {
    label: "Everyone on AI Matrx",
    says: "Listed for everyone signed in to AI Matrx.",
  },
};

export const SHOWN_TO_ORDER: readonly ShownTo[] = [
  "only_me",
  "my_team",
  "everyone",
  "everyone_on_ai_matrx",
];
