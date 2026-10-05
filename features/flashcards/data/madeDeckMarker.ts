// features/flashcards/data/madeDeckMarker.ts
//
// A DECK THAT WAS MADE IS NEVER LOST BEHIND A BLANK FORM (2026-10-05).
//
// "Make the deck" saves the deck, clears the draft, and then opens the deck.
// The opening is a route change; when it does not land (the page reloads
// mid-navigation — a dev server restart, a slow compile, a superseded push),
// the person was left on an empty /new form with no word that the deck exists
// (live: deck cd7320db…, ~60 s on "Opening your deck…", then a blank form).
//
// So the made deck is recorded, device-local, in the generic `wizardDraftSlice`
// (persisted IDB + localStorage, no new slice) BEFORE the navigation starts.
// The deck page clears it when it opens that deck; a /new page that still sees
// it says "Your deck was made" with a link. Pure readers here; the page and the
// deck page do the dispatching.

/** The wizard-draft id the made-deck record lives under. */
export const MADE_DECK_DRAFT_ID = "made:create-deck";

/** A record older than this is no longer worth announcing. */
export const MADE_DECK_FORGET_MS = 24 * 60 * 60 * 1000;

export interface MadeDeck {
  setId: string;
  name: string;
  madeAt: number;
}

/** The stored bag as a made-deck record, or null when it is not one (or too old). Pure. */
export function readMadeDeck(data: unknown, now: number = Date.now()): MadeDeck | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.setId !== "string" || !d.setId) return null;
  if (typeof d.madeAt !== "number") return null;
  if (now - d.madeAt > MADE_DECK_FORGET_MS) return null;
  return {
    setId: d.setId,
    name: typeof d.name === "string" && d.name.trim() ? d.name : "Your deck",
    madeAt: d.madeAt,
  };
}
