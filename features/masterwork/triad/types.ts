// features/masterwork/triad/types.ts
//
// THE TRIAD GAME's wire shapes, in one place.
//
// The server is the authority (`aidream/services/distillation/triad_ingest.py`,
// payload `masterwork_triads_ready`). These are the narrowing types the play
// surface reads — nothing here invents a field, and `parseDeck` refuses a card
// that is not exactly three items rather than rendering a two-item "triad".

/** One of the three items. `key` is the stable handle a pick names. */
export interface TriadItem {
  key: "a" | "b" | "c";
  text: string;
  /** A neutral few-word handle, or "". Never a hint at the answer. */
  note: string;
}

/** `best_one` — which would you actually use? `odd_one_out` — which two are alike? */
export type TriadMode = "best_one" | "odd_one_out";

export interface Triad {
  id: string;
  prompt: string;
  mode: TriadMode;
  items: TriadItem[];
}

export interface TriadDeck {
  triads: Triad[];
  mode: TriadMode;
  requested: number;
  repeatsDropped: number;
  /** Arm the microphone on the "why?" box — the org knob's resolved answer. */
  voiceDefaultOn: boolean;
}

/** What one answered card added, as the ingest door reported it. */
export interface TriadIngestSummary {
  added: number;
  quotesVerified: number;
  quotesUnverified: number;
  /** Set when the card had already been played into this Rulebook. */
  alreadyPlayed: boolean;
}

const MODES: readonly TriadMode[] = ["best_one", "odd_one_out"];
const KEYS: readonly TriadItem["key"][] = ["a", "b", "c"];

function asMode(value: unknown): TriadMode {
  return MODES.includes(value as TriadMode) ? (value as TriadMode) : "best_one";
}

/**
 * The `masterwork_triads_ready` payload → cards this surface may render.
 *
 * A DEAD CARD IS WORSE THAN A SHORT DECK. A triad with two items, four items,
 * an empty prompt or an unknown item key is not the instrument, so it is
 * dropped here rather than drawn as a choice the Expert cannot make sense of —
 * and the surface says how many cards it actually has, never a promised count.
 */
export function parseDeck(raw: unknown): TriadDeck | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.triads)) return null;
  const mode = asMode(data.mode);
  const triads: Triad[] = [];
  for (const entry of data.triads) {
    if (!entry || typeof entry !== "object") continue;
    const card = entry as Record<string, unknown>;
    const id = typeof card.id === "string" ? card.id : "";
    const prompt = typeof card.prompt === "string" ? card.prompt.trim() : "";
    if (!id || !prompt || !Array.isArray(card.items)) continue;
    const items: TriadItem[] = [];
    for (const rawItem of card.items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;
      const key = item.key;
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!KEYS.includes(key as TriadItem["key"]) || !text) continue;
      items.push({
        key: key as TriadItem["key"],
        text,
        note: typeof item.note === "string" ? item.note : "",
      });
    }
    if (items.length !== 3) continue;
    triads.push({ id, prompt, mode: asMode(card.mode ?? mode), items });
  }
  return {
    triads,
    mode,
    requested: typeof data.requested === "number" ? data.requested : triads.length,
    repeatsDropped:
      typeof data.repeats_dropped === "number" ? data.repeats_dropped : 0,
    // Absent reads as ON: the knob's own default, and a microphone that is
    // there when it should not be is recoverable in one tap, while a missing
    // one on a phone ends the session.
    voiceDefaultOn: data.voice_default_on !== false,
  };
}

/** How the two modes are put to a person. Never the registry key on screen. */
export const MODE_COPY: Record<
  TriadMode,
  { label: string; question: string; hint: string }
> = {
  best_one: {
    label: "Pick the best one",
    question: "Which one would you actually use?",
    hint: "Tap the one you'd go with.",
  },
  odd_one_out: {
    label: "Spot the odd one out",
    question: "Two of these are alike. Which is the odd one?",
    hint: "Tap the one that doesn't belong.",
  },
};
